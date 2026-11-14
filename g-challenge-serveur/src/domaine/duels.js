// Cycle de vie d'un duel :
//
//   ouvert ──(une 2e équipe rejoint)──► paiement ──(les 2 mises encaissées)──► en_cours ──► termine
//     │          (duel gratuit : directement en_cours, « Feu Vert »)               │
//     └──────────── délai dépassé : annule + remboursement des mises déjà payées ◄──┘ (délai de course : on clôture avec les courses reçues)
//
// Tous les montants sont en centimes. Chaque mouvement d'argent est une ligne de la table "paiements".
import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { requete, transaction } from '../db.js';
import { refus, interdit, introuvable, conflit } from '../erreurs.js';
import { fournisseurPour, fournisseurParNom } from '../paiements/index.js';
import { annoncerAuxJoueurs, annoncerDuel } from '../temps-reel.js';
import { calculerRepartition } from './argent.js';
import { creerEquipeSolo, membresDe } from './equipes.js';

const DELAI_PAIEMENT_MINUTES = 15;

// ---------- Lecture ----------

export async function lireDuel(id, client = { query: requete }) {
  const { rows } = await client.query('SELECT * FROM duels WHERE id = $1', [id]);
  if (!rows[0]) throw introuvable('Duel introuvable.');
  return rows[0];
}

export async function participantsDuel(duel, client = { query: requete }) {
  const a = await membresDe(duel.equipe_a_id, client);
  const b = duel.equipe_b_id ? await membresDe(duel.equipe_b_id, client) : [];
  return { a, b, tous: [...a, ...b] };
}

// ---------- Vérifications communes ----------

/** Vérifie qu'une équipe peut entrer dans un duel, et renvoie la devise de ses membres. */
async function verifierEquipe(client, { equipeId, joueurId, taille, miseCentimes }) {
  const { rows: [equipe] } = await client.query('SELECT * FROM equipes WHERE id = $1', [equipeId]);
  if (!equipe) throw introuvable('Équipe introuvable.');
  if (equipe.capitaine_id !== joueurId) throw interdit('pas_capitaine', "Seul le capitaine engage l'équipe.");

  const membres = await membresDe(equipeId, client);
  if (membres.length !== taille) {
    throw refus('taille_equipe', `Ce duel se joue à ${taille} par équipe ; votre équipe compte ${membres.length} joueur(s).`);
  }

  const { rows: occupee } = await client.query(
    `SELECT 1 FROM duels WHERE statut IN ('ouvert','paiement','en_cours')
       AND (equipe_a_id = $1 OR equipe_b_id = $1) LIMIT 1`, [equipeId]);
  if (occupee.length) throw conflit('equipe_occupee', 'Cette équipe est déjà engagée dans un duel en cours.');

  const pays = [...new Map(membres.map((m) => [m.pays_code, m])).values()];
  if (miseCentimes > 0) {
    const bloque = pays.find((m) => !m.mises_autorisees);
    if (bloque) {
      throw interdit('mises_interdites_pays', `Les duels avec mise ne sont pas ouverts pour ${bloque.pays_nom}. Jouez en duel gratuit.`);
    }
    const devises = new Set(membres.map((m) => m.devise));
    if (devises.size > 1) throw refus('devises_differentes', 'Tous les joueurs d\'un duel payant doivent utiliser la même devise.');
  }
  return { equipe, membres, devise: membres[0].devise };
}

// ---------- Créer, rejoindre ----------

export async function creerDuel({ joueurId, circuitCode, taille, miseCentimes, equipeId }) {
  const duel = await transaction(async (client) => {
    const { rows: [circuit] } = await client.query('SELECT * FROM circuits WHERE code = $1 AND actif', [circuitCode]);
    if (!circuit) throw introuvable('Circuit introuvable ou fermé.');

    let idEquipe = equipeId;
    if (!idEquipe) {
      if (taille !== 1) throw refus('equipe_requise', 'Choisissez une équipe pour un duel à plusieurs.');
      idEquipe = await creerEquipeSolo(client, joueurId);
    }
    const { devise } = await verifierEquipe(client, { equipeId: idEquipe, joueurId, taille, miseCentimes });

    const { rows: [d] } = await client.query(
      `INSERT INTO duels (circuit_id, taille, mise_centimes, devise, commission_bp, equipe_a_id, cree_par, rejoindre_avant)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now() + make_interval(mins => $8)) RETURNING *`,
      [circuit.id, taille, miseCentimes, devise, Math.round(config.commissionPourcent * 100),
        idEquipe, joueurId, config.delaiRejoindreMinutes]);
    return d;
  });
  return duel;
}

export async function rejoindreDuel({ joueurId, duelId, equipeId }) {
  const { duel, gratuit } = await transaction(async (client) => {
    const { rows: [d] } = await client.query('SELECT * FROM duels WHERE id = $1 FOR UPDATE', [duelId]);
    if (!d) throw introuvable('Duel introuvable.');
    if (d.statut !== 'ouvert' || d.equipe_b_id) throw conflit('duel_complet', "Ce duel n'attend plus d'adversaire.");
    if (new Date(d.rejoindre_avant) < new Date()) throw conflit('duel_expire', 'Ce duel a expiré.');

    let idEquipe = equipeId;
    if (!idEquipe) {
      if (d.taille !== 1) throw refus('equipe_requise', 'Choisissez une équipe pour un duel à plusieurs.');
      idEquipe = await creerEquipeSolo(client, joueurId);
    }
    const { membres, devise } = await verifierEquipe(client, {
      equipeId: idEquipe, joueurId, taille: d.taille, miseCentimes: d.mise_centimes });

    const membresA = await membresDe(d.equipe_a_id, client);
    const idsA = new Set(membresA.map((m) => m.id));
    if (membres.some((m) => idsA.has(m.id))) {
      throw conflit('meme_joueur', 'Un joueur ne peut pas être dans les deux équipes.');
    }
    if (d.mise_centimes > 0 && devise !== d.devise) {
      throw refus('devises_differentes', `Ce duel se joue en ${d.devise}.`);
    }

    const gratuit = d.mise_centimes === 0;
    const { rows: [maj] } = await client.query(
      `UPDATE duels SET equipe_b_id = $2, statut = $3,
         rejoindre_avant = GREATEST(rejoindre_avant, now() + make_interval(mins => $4))
       WHERE id = $1 RETURNING *`,
      [duelId, idEquipe, gratuit ? 'ouvert' : 'paiement', DELAI_PAIEMENT_MINUTES]);
    if (gratuit) return { duel: await feuVert(client, maj), gratuit };
    // Si l'équipe A avait déjà payé en attendant, il ne manque que la mise de B.
    return { duel: maj, gratuit };
  });
  if (gratuit) await annoncerFeuVert(duel);
  else annoncerDuel(duel.id, 'duel:maj', resume(duel));
  return duel;
}

// ---------- Paiement des mises ----------

export async function payerMise({ joueurId, duelId }) {
  const paiement = await transaction(async (client) => {
    const { rows: [d] } = await client.query('SELECT * FROM duels WHERE id = $1 FOR UPDATE', [duelId]);
    if (!d) throw introuvable('Duel introuvable.');
    if (d.mise_centimes === 0) throw refus('duel_gratuit', 'Ce duel est gratuit.');
    if (!['ouvert', 'paiement'].includes(d.statut)) throw conflit('paiement_ferme', 'Le paiement est fermé pour ce duel.');

    const { rows: equipes } = await client.query(
      'SELECT * FROM equipes WHERE id = ANY($1) AND capitaine_id = $2',
      [[d.equipe_a_id, d.equipe_b_id].filter(Boolean), joueurId]);
    const equipe = equipes[0];
    if (!equipe) throw interdit('pas_capitaine', "Seul le capitaine d'une équipe du duel paie la mise.");
    const dejaPayee = equipe.id === d.equipe_a_id ? d.equipe_a_payee : d.equipe_b_payee;
    if (dejaPayee) throw conflit('deja_payee', 'La mise de votre équipe est déjà payée.');

    const { rows: enCours } = await client.query(
      `SELECT 1 FROM paiements WHERE duel_id = $1 AND equipe_id = $2 AND sens = 'encaissement' AND statut = 'en_attente'`,
      [d.id, equipe.id]);
    if (enCours.length) throw conflit('paiement_en_cours', 'Un paiement est déjà en attente : validez-le sur votre téléphone.');

    return creerPaiement(client, {
      duel: d, equipeId: equipe.id, joueurId, sens: 'encaissement', montant: d.mise_centimes,
    });
  });
  lancerExecution(paiement.id);
  return paiement;
}

async function creerPaiement(client, { duel, equipeId, joueurId, sens, montant }) {
  const { rows: [joueur] } = await client.query(
    'SELECT p.* FROM joueurs j JOIN pays p ON p.code = j.pays_code WHERE j.id = $1', [joueurId]);
  const fournisseur = fournisseurPour(joueur).nom;
  const { rows: [p] } = await client.query(
    `INSERT INTO paiements (duel_id, equipe_id, joueur_id, sens, montant_centimes, devise, fournisseur, cle_idempotence)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [duel.id, equipeId, joueurId, sens, montant, duel.devise, fournisseur, `${sens}:${randomUUID()}`]);
  return p;
}

// Les exécutions en arrière-plan sont suivies pour pouvoir attendre leur fin (tests, arrêt propre).
const executions = new Set();
function lancerExecution(paiementId) {
  const tache = executerPaiement(paiementId)
    .catch((e) => console.error(`Paiement ${paiementId} :`, e))
    .finally(() => executions.delete(tache));
  executions.add(tache);
}
export async function attendreExecutions() {
  while (executions.size) await Promise.allSettled([...executions]);
}

/** Appelle le fournisseur (M-Pesa...) puis enregistre le résultat. */
export async function executerPaiement(paiementId) {
  const { rows: [p] } = await requete(
    `SELECT pa.*, j.telephone FROM paiements pa JOIN joueurs j ON j.id = pa.joueur_id WHERE pa.id = $1`,
    [paiementId]);
  if (!p || p.statut !== 'en_attente') return;

  let resultat;
  try {
    const fournisseur = fournisseurParNom(p.fournisseur);
    resultat = p.sens === 'encaissement'
      ? await fournisseur.encaisser(p, { telephone: p.telephone })
      : await fournisseur.verser(p, { telephone: p.telephone });
  } catch (e) {
    resultat = { statut: 'echoue', reference: null, details: { erreur: e.message } };
  }
  await finaliserPaiement(paiementId, resultat);
}

/** Enregistre le résultat d'un paiement. Ne fait rien si le paiement est déjà réglé (idempotent). */
export async function finaliserPaiement(paiementId, { statut, reference, details }) {
  const suite = await transaction(async (client) => {
    const { rows: [p] } = await client.query(
      `UPDATE paiements SET statut = $2, reference_externe = $3, details = $4, maj_le = now()
        WHERE id = $1 AND statut = 'en_attente' RETURNING *`,
      [paiementId, statut, reference, details ?? null]);
    if (!p) return null;
    const evenements = [{ joueurs: [p.joueur_id], nom: 'paiement:maj', donnees: resumePaiement(p) }];
    if (p.sens !== 'encaissement' || statut !== 'reussi') return { evenements };

    const { rows: [d] } = await client.query('SELECT * FROM duels WHERE id = $1 FOR UPDATE', [p.duel_id]);
    if (!['ouvert', 'paiement'].includes(d.statut)) {
      // Le duel a été annulé pendant que le joueur tapait son PIN : on rembourse.
      const r = await creerPaiement(client, {
        duel: d, equipeId: p.equipe_id, joueurId: p.joueur_id, sens: 'remboursement', montant: p.montant_centimes });
      return { evenements, aExecuter: [r.id] };
    }
    const colonne = p.equipe_id === d.equipe_a_id ? 'equipe_a_payee' : 'equipe_b_payee';
    const { rows: [maj] } = await client.query(
      `UPDATE duels SET ${colonne} = true WHERE id = $1 RETURNING *`, [d.id]);
    if (maj.equipe_b_id && maj.equipe_a_payee && maj.equipe_b_payee) {
      return { evenements, feuVert: await feuVert(client, maj) };
    }
    evenements.push({ duel: maj.id, nom: 'duel:maj', donnees: resume(maj) });
    return { evenements };
  });
  if (!suite) return;
  for (const e of suite.evenements) {
    if (e.joueurs) annoncerAuxJoueurs(e.joueurs, e.nom, e.donnees);
    else annoncerDuel(e.duel, e.nom, e.donnees);
  }
  for (const id of suite.aExecuter ?? []) lancerExecution(id);
  if (suite.feuVert) await annoncerFeuVert(suite.feuVert);
}

// ---------- Feu Vert et courses ----------

async function feuVert(client, duel) {
  const { rows: [d] } = await client.query(
    `UPDATE duels SET statut = 'en_cours', courir_avant = now() + make_interval(mins => $2)
      WHERE id = $1 RETURNING *`, [duel.id, config.delaiCourirMinutes]);
  return d;
}

async function annoncerFeuVert(duel) {
  const { tous } = await participantsDuel(duel);
  annoncerAuxJoueurs(tous.map((m) => m.id), 'duel:feu_vert', resume(duel));
  annoncerDuel(duel.id, 'duel:feu_vert', resume(duel));
}

/** Le joueur appuie sur "Courir" : on note l'heure du départ. Un seul départ par duel. */
export async function partirDansDuel({ joueurId, duelId }) {
  const duel = await lireDuel(duelId);
  if (duel.statut !== 'en_cours') throw conflit('duel_pas_en_cours', "Ce duel n'a pas encore reçu le Feu Vert.");
  const { tous } = await participantsDuel(duel);
  if (!tous.some((m) => m.id === joueurId)) throw interdit('pas_participant', 'Vous ne participez pas à ce duel.');
  const { rowCount } = await requete(
    'INSERT INTO duel_departs (duel_id, joueur_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [duelId, joueurId]);
  if (!rowCount) throw conflit('deja_parti', 'Vous avez déjà pris le départ de ce duel.');
  return { duel_id: duelId, depart: new Date().toISOString() };
}

/** Appelé après chaque course de duel : clôture si tout le monde a couru (ou si forcer). */
export async function verifierFinDuel(duelId, { forcer = false } = {}) {
  const fin = await transaction(async (client) => {
    const { rows: [d] } = await client.query('SELECT * FROM duels WHERE id = $1 FOR UPDATE', [duelId]);
    if (!d || d.statut !== 'en_cours') return null;
    const { a, b } = await participantsDuel(d, client);
    const { rows: courses } = await client.query(
      'SELECT joueur_id, temps_ms, valide FROM courses WHERE duel_id = $1', [duelId]);
    const parJoueur = new Map(courses.map((c) => [c.joueur_id, c]));
    const toutLeMondeACouru = [...a, ...b].every((m) => parJoueur.has(m.id));
    if (!toutLeMondeACouru && !forcer) return null;

    // Score d'équipe = somme des temps de ses membres. Une équipe est complète si
    // chaque membre a une course valide.
    const score = (membres) => {
      const valides = membres.map((m) => parJoueur.get(m.id)).filter((c) => c?.valide);
      return { complete: valides.length === membres.length, total: valides.reduce((s, c) => s + c.temps_ms, 0) };
    };
    const sa = score(a);
    const sb = score(b);

    let gagnant = null;
    let resultat;
    if (sa.complete && sb.complete) {
      if (sa.total === sb.total) resultat = 'egalite';
      else { gagnant = sa.total < sb.total ? 'a' : 'b'; resultat = 'victoire'; }
    } else if (sa.complete || sb.complete) {
      gagnant = sa.complete ? 'a' : 'b';
      resultat = 'forfait';
    } else {
      resultat = 'egalite';
    }
    return cloturer(client, d, { gagnant, resultat, membres: { a, b } });
  });
  if (fin) await apresCloture(fin);
  return fin?.duel ?? null;
}

async function cloturer(client, d, { gagnant, resultat, membres }) {
  const aExecuter = [];
  let commission = 0;
  const gagnantId = gagnant ? (gagnant === 'a' ? d.equipe_a_id : d.equipe_b_id) : null;

  if (d.mise_centimes > 0) {
    if (gagnantId) {
      const { rows: [eq] } = await client.query('SELECT capitaine_id FROM equipes WHERE id = $1', [gagnantId]);
      const r = calculerRepartition({
        miseCentimes: d.mise_centimes, commissionBp: d.commission_bp,
        membres: membres[gagnant].map((m) => m.id), capitaineId: eq.capitaine_id,
      });
      commission = r.commission;
      for (const part of r.parts) {
        if (part.montantCentimes <= 0) continue;
        const p = await creerPaiement(client, {
          duel: d, equipeId: gagnantId, joueurId: part.joueurId, sens: 'versement', montant: part.montantCentimes });
        aExecuter.push(p.id);
      }
    } else {
      // Égalité, ou personne n'a couru : chaque équipe récupère sa mise, sans commission.
      aExecuter.push(...await rembourserMises(client, d));
    }
  }

  const { rows: [maj] } = await client.query(
    `UPDATE duels SET statut = 'termine', gagnant_id = $2, resultat = $3, commission_centimes = $4, termine_le = now()
      WHERE id = $1 RETURNING *`, [d.id, gagnantId, resultat, commission]);
  return { duel: maj, aExecuter, joueurs: [...membres.a, ...membres.b].map((m) => m.id) };
}

async function rembourserMises(client, d) {
  const { rows: payes } = await client.query(
    `SELECT * FROM paiements WHERE duel_id = $1 AND sens = 'encaissement' AND statut = 'reussi'`, [d.id]);
  const ids = [];
  for (const p of payes) {
    const r = await creerPaiement(client, {
      duel: d, equipeId: p.equipe_id, joueurId: p.joueur_id, sens: 'remboursement', montant: p.montant_centimes });
    ids.push(r.id);
  }
  return ids;
}

async function apresCloture({ duel, aExecuter, joueurs }) {
  for (const id of aExecuter) lancerExecution(id);
  annoncerAuxJoueurs(joueurs, 'duel:resultat', resume(duel));
  annoncerDuel(duel.id, 'duel:resultat', resume(duel));
}

// ---------- Délais ----------

/** À lancer chaque minute : annule les duels sans adversaire, clôture les duels trop longs. */
export async function traiterDelais() {
  const { rows: aAnnuler } = await requete(
    `SELECT id FROM duels WHERE statut IN ('ouvert','paiement') AND rejoindre_avant < now()`);
  for (const { id } of aAnnuler) {
    const fin = await transaction(async (client) => {
      const { rows: [d] } = await client.query('SELECT * FROM duels WHERE id = $1 FOR UPDATE', [id]);
      if (!['ouvert', 'paiement'].includes(d.statut)) return null;
      const aExecuter = await rembourserMises(client, d);
      const { rows: [maj] } = await client.query(
        `UPDATE duels SET statut = 'annule', resultat = 'expire', termine_le = now() WHERE id = $1 RETURNING *`, [id]);
      const { tous } = await participantsDuel(maj, client);
      return { duel: maj, aExecuter, joueurs: tous.map((m) => m.id) };
    });
    if (fin) await apresCloture(fin);
  }

  const { rows: aClore } = await requete(
    `SELECT id FROM duels WHERE statut = 'en_cours' AND courir_avant < now()`);
  for (const { id } of aClore) await verifierFinDuel(id, { forcer: true });
}

// ---------- Format de sortie ----------

export function resume(d) {
  return {
    id: d.id, statut: d.statut, taille: d.taille,
    mise_centimes: d.mise_centimes, devise: d.devise, commission_pourcent: d.commission_bp / 100,
    equipe_a_id: d.equipe_a_id, equipe_b_id: d.equipe_b_id,
    equipe_a_payee: d.equipe_a_payee, equipe_b_payee: d.equipe_b_payee,
    gagnant_id: d.gagnant_id, resultat: d.resultat, commission_centimes: d.commission_centimes,
    rejoindre_avant: d.rejoindre_avant, courir_avant: d.courir_avant, termine_le: d.termine_le,
  };
}

export function resumePaiement(p) {
  return {
    id: p.id, duel_id: p.duel_id, sens: p.sens, statut: p.statut,
    montant_centimes: p.montant_centimes, devise: p.devise, reference: p.reference_externe,
  };
}

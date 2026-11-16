// Tournois par équipes de G-Challenge.
//
// Championnat national (« Tournoi Sponsor »), un par pays, semaine du lundi 00:00 au dimanche 23:59
// (heure de Kinshasa) :
//   - semaine 1 : qualifications ouvertes à toutes les équipes du pays (pays du capitaine) ;
//     les 16 meilleures sont retenues ;
//   - semaines suivantes : championnat entre les 16. Chaque semaine, une course sur le circuit de la
//     semaine et des points selon le classement (25, 20, 16, 13…) ;
//   - chaque semaine (qualifications comprises), les 4 meilleures équipes reçoivent 20 $ chacune,
//     payés par le sponsor et partagés entre les pilotes de l'équipe qui ont couru ;
//   - à la fin, les 2 premières au total des points vont à la Coupe d'Afrique.
// Coupe d'Afrique : les qualifiés de plusieurs pays (8 pays → 16 équipes), à élimination directe,
// un tour par semaine : huitièmes, quarts, demi-finales, finale.
//
// Temps d'une équipe : somme des meilleurs temps de ses 4 meilleurs pilotes (taille réglable) (courses valides, hors
// duels, envoyées pendant la semaine sur le circuit de la semaine). Une équipe incomplète est classée
// derrière les équipes complètes, et ne marque pas de points. Un pilote ne compte que pour une seule
// équipe retenue d'un même championnat.
import { requete, transaction } from '../db.js';
import { refus, introuvable, conflit } from '../erreurs.js';
import { fournisseurPour, fournisseurParNom } from '../paiements/index.js';

const executions = new Set();
function lancerExecution(id) {
  const p = executerPrime(id).catch((e) => console.error('Prime :', e)).finally(() => executions.delete(p));
  executions.add(p);
}
export async function attendrePrimes() {
  while (executions.size) await Promise.allSettled([...executions]);
}

const LUNDI_KIN = (debut, decalage) =>
  `(${debut}::date + ${decalage} * 7)::timestamp AT TIME ZONE 'Africa/Kinshasa'`;

async function verifierLundiEtCircuits(client, premierLundi, codes) {
  const { rows: [l] } = await client.query(`SELECT extract(isodow FROM $1::date) = 1 AS ok`, [premierLundi]);
  if (!l.ok) throw refus('pas_un_lundi', 'La compétition commence un lundi.');
  const { rows } = await client.query('SELECT id, code FROM circuits WHERE code = ANY($1) AND actif', [codes]);
  const parCode = Object.fromEntries(rows.map((c) => [c.code, c.id]));
  const manquant = codes.find((c) => !parCode[c]);
  if (manquant) throw introuvable(`Circuit introuvable ou fermé : ${manquant}`);
  return parCode;
}

// ---------- Temps des équipes ----------

/**
 * Temps de chaque équipe sur un circuit pendant une période : somme des `taille` meilleurs pilotes.
 * Renvoie les équipes triées : complètes (temps croissant), puis incomplètes, puis sans coureur.
 */
async function tempsEquipes(client, { equipes, circuitId, debut, fin, taille }) {
  if (!equipes.length) return [];
  const ids = equipes.map((e) => e.equipe_id);
  const { rows } = await client.query(
    `WITH meilleurs AS (
       SELECT em.equipe_id, c.joueur_id, min(c.temps_ms) AS t, min(c.cree_le) AS premier
         FROM equipe_membres em JOIN courses c ON c.joueur_id = em.joueur_id
        WHERE em.equipe_id = ANY($1) AND c.circuit_id = $2 AND c.valide AND c.duel_id IS NULL
          AND c.cree_le >= $3 AND c.cree_le < $4
        GROUP BY em.equipe_id, c.joueur_id),
     classes AS (SELECT *, row_number() OVER (PARTITION BY equipe_id ORDER BY t, premier) AS n FROM meilleurs)
     SELECT equipe_id, count(*)::int AS nb, sum(t)::int AS total, max(premier) AS dernier,
            array_agg(joueur_id ORDER BY t) AS coureurs
       FROM classes WHERE n <= $5 GROUP BY equipe_id`,
    [ids, circuitId, debut, fin, taille]);
  const parEquipe = Object.fromEntries(rows.map((r) => [r.equipe_id, r]));
  const lignes = equipes.map((e, i) => {
    const r = parEquipe[e.equipe_id];
    return { ...e, ordre: i, nb_pilotes: r?.nb ?? 0, total: r?.total ?? null, dernier: r?.dernier ?? null,
      coureurs: r?.coureurs ?? [], temps_ms: r && r.nb >= taille ? r.total : null };
  });
  lignes.sort((a, b) => {
    if ((a.temps_ms === null) !== (b.temps_ms === null)) return a.temps_ms === null ? 1 : -1;
    if (a.temps_ms !== null) return a.temps_ms - b.temps_ms || new Date(a.dernier) - new Date(b.dernier);
    return b.nb_pilotes - a.nb_pilotes || (a.total ?? 1e12) - (b.total ?? 1e12) || a.ordre - b.ordre;
  });
  return lignes;
}

// ---------- Primes ----------

/** La prime d'une équipe est partagée entre ses pilotes qui ont couru (à défaut, le capitaine). */
async function primeEquipe(client, { origine, competitionId, numero, devise, equipe, rang, montant }) {
  const { rows: [eq] } = await client.query('SELECT capitaine_id FROM equipes WHERE id = $1', [equipe.equipe_id]);
  let payes = equipe.coureurs.length ? [...equipe.coureurs] : [eq.capitaine_id];
  // Le capitaine en premier : il reçoit le reste de la division (quelques centimes).
  if (payes.includes(eq.capitaine_id)) payes = [eq.capitaine_id, ...payes.filter((j) => j !== eq.capitaine_id)];
  const part = Math.floor(montant / payes.length), reste = montant - part * payes.length;
  const crees = [];
  // Par défaut, un administrateur valide chaque prime avant l'envoi M-Pesa (vérification anti-triche).
  const { rows: [reg] } = await client.query('SELECT validation_primes FROM parametres');
  for (let i = 0; i < payes.length; i++) {
    const m = part + (i === 0 ? reste : 0);
    if (m <= 0) continue;
    const { rows: [pays] } = await client.query(
      'SELECT p.* FROM pays p JOIN joueurs j ON j.pays_code = p.code WHERE j.id = $1', [payes[i]]);
    let fournisseur = null;
    if (pays.primes_autorisees && pays.devise === devise) {
      try { fournisseur = fournisseurPour(pays).nom; } catch { fournisseur = null; }
    }
    const { rows: [p] } = await client.query(
      `INSERT INTO primes (origine, competition_id, numero, equipe_id, joueur_id, rang, montant_centimes, devise, fournisseur, statut)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [origine, competitionId, numero, equipe.equipe_id, payes[i], rang, m, devise, fournisseur,
        fournisseur ? (reg.validation_primes ? 'a_valider' : 'en_attente') : 'a_verser_manuellement']);
    crees.push(p);
  }
  return crees;
}

/** Verse une prime par le fournisseur (M-Pesa...). Idempotent. */
export async function executerPrime(primeId) {
  const { rows: [p] } = await requete(
    `SELECT pr.*, j.telephone FROM primes pr JOIN joueurs j ON j.id = pr.joueur_id WHERE pr.id = $1`, [primeId]);
  if (!p || p.statut !== 'en_attente') return;
  let r;
  try {
    r = await fournisseurParNom(p.fournisseur).verser({ ...p, sens: 'versement' }, { telephone: p.telephone });
  } catch (e) {
    r = { statut: 'echoue', reference: null, details: { erreur: e.message } };
  }
  await requete(
    `UPDATE primes SET statut = $2, reference_externe = $3, details = $4, maj_le = now() WHERE id = $1 AND statut = 'en_attente'`,
    [primeId, r.statut, r.reference, r.details ?? null]);
}

export async function relancerPrime(primeId) {
  const { rows: [p] } = await requete(
    `UPDATE primes SET statut = 'en_attente', maj_le = now() WHERE id = $1 AND statut = 'echoue' AND fournisseur IS NOT NULL RETURNING id`, [primeId]);
  if (!p) throw conflit('prime_non_relancable', 'Seule une prime automatique échouée peut être relancée.');
  await executerPrime(primeId);
  return (await requete('SELECT * FROM primes WHERE id = $1', [primeId])).rows[0];
}

/** L'administrateur accepte (envoi M-Pesa) ou refuse (triche, erreur) une prime en attente de validation. */
export async function deciderPrime(primeId, adminId, accepter, motif = null) {
  const { rows: [p] } = await requete(
    `UPDATE primes SET statut = $3, decide_par = $2, decide_le = now(), motif_refus = $4, maj_le = now()
      WHERE id = $1 AND statut = 'a_valider' RETURNING *`,
    [primeId, adminId, accepter ? 'en_attente' : 'refusee', accepter ? null : motif]);
  if (!p) throw conflit('prime_deja_decidee', 'Cette prime a déjà été validée ou refusée.');
  if (accepter) await executerPrime(primeId);
  return (await requete('SELECT * FROM primes WHERE id = $1', [primeId])).rows[0];
}

function lancerPrimes(primes) {
  for (const p of primes) if (p.statut === 'en_attente') lancerExecution(p.id);
}

// ---------- Championnat national ----------

export async function creerChampionnat(d) {
  if (d.circuits.length < 2) throw refus('circuits_semaines', 'Il faut au moins 2 semaines : qualifications puis championnat.');
  if (d.nb_qualifies > d.nb_equipes) throw refus('qualifies', 'Plus de qualifiés que d\'équipes.');
  return transaction(async (client) => {
    const parCode = await verifierLundiEtCircuits(client, d.premier_lundi, d.circuits);
    const { rows: [pays] } = await client.query('SELECT code FROM pays WHERE code = $1', [d.pays]);
    if (!pays) throw introuvable('Pays inconnu.');
    const { rows: [c] } = await client.query(
      `INSERT INTO championnats (pays_code, nom, sponsor, premier_lundi, nb_equipes, taille_equipe, nb_qualifies,
         circuits, primes_centimes, points, devise)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [d.pays, d.nom, d.sponsor, d.premier_lundi, d.nb_equipes, d.taille_equipe, d.nb_qualifies, d.circuits,
        d.primes_centimes, d.points, d.devise]);
    for (let n = 1; n <= d.circuits.length; n++) {
      await client.query(
        `INSERT INTO championnat_semaines (championnat_id, numero, debut, fin, circuit_id)
         VALUES ($1, $2, ${LUNDI_KIN('$3', '($2 - 1)')}, ${LUNDI_KIN('$3', '$2')}, $4)`,
        [c.id, n, d.premier_lundi, parCode[d.circuits[n - 1]]]);
    }
    return c;
  });
}

async function equipesSemaine(client, champ, numero) {
  if (numero === 1) {
    // Qualifications : toutes les équipes dont le capitaine est du pays.
    const { rows } = await client.query(
      `SELECT e.id AS equipe_id, e.nom FROM equipes e JOIN joueurs j ON j.id = e.capitaine_id
        WHERE j.pays_code = $1 ORDER BY e.cree_le`, [champ.pays_code]);
    return rows;
  }
  const { rows } = await client.query(
    `SELECT ce.equipe_id, e.nom FROM championnat_equipes ce JOIN equipes e ON e.id = ce.equipe_id
      WHERE ce.championnat_id = $1 ORDER BY ce.rang_qualification`, [champ.id]);
  return rows;
}

export async function classementChampionnatSemaine(championnatId, numero) {
  const { rows: [champ] } = await requete('SELECT * FROM championnats WHERE id = $1', [championnatId]);
  if (!champ) throw introuvable('Championnat introuvable.');
  const { rows: [sem] } = await requete('SELECT * FROM championnat_semaines WHERE championnat_id = $1 AND numero = $2', [championnatId, numero]);
  if (!sem) throw introuvable('Semaine introuvable.');
  if (sem.cloturee_le) {
    const { rows } = await requete(
      `SELECT r.equipe_id, e.nom, r.temps_ms, r.nb_pilotes, r.rang, r.points
         FROM championnat_resultats r JOIN equipes e ON e.id = r.equipe_id
        WHERE r.championnat_id = $1 AND r.numero = $2 ORDER BY r.rang`, [championnatId, numero]);
    return { numero, debut: sem.debut, fin: sem.fin, definitif: true, classement: rows };
  }
  const lignes = await tempsEquipes({ query: requete }, {
    equipes: await equipesSemaine({ query: requete }, champ, numero), circuitId: sem.circuit_id,
    debut: sem.debut, fin: sem.fin, taille: champ.taille_equipe });
  return { numero, debut: sem.debut, fin: sem.fin, definitif: false,
    classement: lignes.map((l, i) => ({ equipe_id: l.equipe_id, nom: l.nom, temps_ms: l.temps_ms, nb_pilotes: l.nb_pilotes, rang: i + 1 })) };
}

export async function cloturerSemaineChampionnat(championnatId, numero, { forcer = false } = {}) {
  const resultat = await transaction(async (client) => {
    const { rows: [champ] } = await client.query('SELECT * FROM championnats WHERE id = $1 FOR UPDATE', [championnatId]);
    if (!champ) throw introuvable('Championnat introuvable.');
    if (champ.statut !== 'active') throw conflit('competition_inactive', 'Ce championnat est terminé ou annulé.');
    const { rows: [sem] } = await client.query(
      'SELECT * FROM championnat_semaines WHERE championnat_id = $1 AND numero = $2 FOR UPDATE', [championnatId, numero]);
    if (!sem) throw introuvable('Semaine introuvable.');
    if (sem.cloturee_le) return null;
    if (!forcer && new Date(sem.fin) > new Date()) throw conflit('semaine_en_cours', "La semaine n'est pas finie.");
    if (numero > 1) {
      const { rows: [avant] } = await client.query(
        'SELECT cloturee_le FROM championnat_semaines WHERE championnat_id = $1 AND numero = $2', [championnatId, numero - 1]);
      if (!avant.cloturee_le) throw conflit('semaine_precedente', "La semaine précédente n'est pas clôturée.");
    }

    const lignes = await tempsEquipes(client, {
      equipes: await equipesSemaine(client, champ, numero), circuitId: sem.circuit_id,
      debut: sem.debut, fin: sem.fin, taille: champ.taille_equipe });

    if (numero === 1) {
      // Sélection : les meilleures équipes complètes ; un pilote ne défend qu'une équipe retenue.
      const pris = new Set();
      let rang = 0;
      for (const l of lignes) {
        if (rang >= champ.nb_equipes || l.temps_ms === null) break;
        if (l.coureurs.some((j) => pris.has(j))) continue;
        l.coureurs.forEach((j) => pris.add(j));
        rang += 1;
        await client.query(
          'INSERT INTO championnat_equipes (championnat_id, equipe_id, rang_qualification) VALUES ($1, $2, $3)',
          [championnatId, l.equipe_id, rang]);
      }
    }
    const primes = [];
    for (let i = 0; i < lignes.length; i++) {
      const l = lignes[i], complet = l.temps_ms !== null;
      const points = numero > 1 && complet ? (champ.points[i] ?? 0) : 0;
      await client.query(
        `INSERT INTO championnat_resultats (championnat_id, numero, equipe_id, temps_ms, nb_pilotes, rang, points)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [championnatId, numero, l.equipe_id, l.temps_ms, l.nb_pilotes, i + 1, points]);
      if (numero > 1) {
        await client.query(
          `UPDATE championnat_equipes SET points = points + $3, temps_cumule_ms = temps_cumule_ms + $4
            WHERE championnat_id = $1 AND equipe_id = $2`,
          [championnatId, l.equipe_id, points, complet ? l.temps_ms : 0]);
      }
      // Primes de la semaine : les meilleures équipes complètes (4 × 20 $ par défaut).
      const montant = Number(champ.primes_centimes[i] ?? 0);
      if (complet && montant > 0) {
        primes.push(...await primeEquipe(client, { origine: 'championnat', competitionId: championnatId, numero,
          devise: champ.devise, equipe: l, rang: i + 1, montant }));
      }
    }

    const derniere = numero === champ.circuits.length;
    if (derniere) {
      // Classement final : points, puis temps cumulé, puis rang de qualification.
      const { rows: finale } = await client.query(
        `SELECT equipe_id FROM championnat_equipes WHERE championnat_id = $1
          ORDER BY points DESC, temps_cumule_ms ASC, rang_qualification ASC`, [championnatId]);
      for (let i = 0; i < finale.length; i++) {
        await client.query(
          `UPDATE championnat_equipes SET rang_final = $3, qualifiee = $4 WHERE championnat_id = $1 AND equipe_id = $2`,
          [championnatId, finale[i].equipe_id, i + 1, i < champ.nb_qualifies]);
      }
      await client.query(`UPDATE championnats SET statut = 'terminee' WHERE id = $1`, [championnatId]);
    }
    await client.query('UPDATE championnat_semaines SET cloturee_le = now() WHERE championnat_id = $1 AND numero = $2', [championnatId, numero]);
    return { primes, classees: lignes.length, termine: derniere };
  });
  if (!resultat) return null;
  lancerPrimes(resultat.primes);
  return resultat;
}

export async function championnatEnCours(paysCode) {
  const { rows: [c] } = await requete(
    `SELECT * FROM championnats WHERE pays_code = $1
      ORDER BY (statut = 'active') DESC, (premier_lundi <= (now() AT TIME ZONE 'Africa/Kinshasa')::date) DESC, premier_lundi DESC LIMIT 1`, [paysCode]);
  if (!c) return null;
  const { rows: semaines } = await requete(
    `SELECT s.numero, s.debut, s.fin, s.cloturee_le IS NOT NULL AS cloturee, ci.code AS circuit, ci.nom AS circuit_nom
       FROM championnat_semaines s JOIN circuits ci ON ci.id = s.circuit_id WHERE s.championnat_id = $1 ORDER BY s.numero`, [c.id]);
  const { rows: equipes } = await requete(
    `SELECT e.nom, ce.points, ce.rang_qualification, ce.rang_final, ce.qualifiee
       FROM championnat_equipes ce JOIN equipes e ON e.id = ce.equipe_id WHERE ce.championnat_id = $1
      ORDER BY ce.points DESC, ce.temps_cumule_ms ASC, ce.rang_qualification ASC`, [c.id]);
  const maintenant = new Date();
  const courante = semaines.find((s) => !s.cloturee && new Date(s.debut) <= maintenant && maintenant < new Date(s.fin))
    ?? semaines.find((s) => !s.cloturee) ?? null;
  return {
    id: c.id, pays: c.pays_code, nom: c.nom, sponsor: c.sponsor, statut: c.statut, devise: c.devise,
    nb_equipes: c.nb_equipes, taille_equipe: c.taille_equipe, nb_qualifies: c.nb_qualifies,
    primes_centimes: c.primes_centimes.map(Number), points: c.points,
    semaines, semaine_courante: courante?.numero ?? null, classement: equipes,
  };
}

// ---------- Coupe d'Afrique ----------

/** Crée la Coupe à partir des championnats nationaux terminés : 1er d'un pays contre 2e du pays voisin du tableau. */
export async function creerCoupe(d) {
  return transaction(async (client) => {
    const parCode = await verifierLundiEtCircuits(client, d.premier_lundi, d.circuits);
    const qualifies = [];
    for (const id of d.championnats) {
      const { rows } = await client.query(
        `SELECT ce.equipe_id FROM championnat_equipes ce JOIN championnats c ON c.id = ce.championnat_id
          WHERE ce.championnat_id = $1 AND ce.qualifiee AND c.statut = 'terminee' ORDER BY ce.rang_final`, [id]);
      if (rows.length < 2) throw refus('championnat_non_termine', `Le championnat ${id} n'est pas terminé ou n'a pas 2 qualifiés.`);
      qualifies.push(rows.slice(0, 2).map((r) => r.equipe_id));
    }
    const nbEquipes = qualifies.length * 2;
    const tours = Math.log2(nbEquipes);
    if (qualifies.length < 2 || qualifies.length % 2 || !Number.isInteger(tours)) {
      throw refus('nombre_pays', 'Il faut 2, 4, 8 ou 16 pays (2 qualifiés chacun) : 8 pays donnent 16 équipes et des huitièmes de finale.');
    }
    if (d.circuits.length !== tours) throw refus('circuits_tours', `Il faut un circuit par tour : ${tours}.`);
    const { rows: [coupe] } = await client.query(
      `INSERT INTO coupes (nom, sponsor, premier_lundi, circuits, taille_equipe, primes_centimes, devise)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [d.nom, d.sponsor, d.premier_lundi, d.circuits, d.taille_equipe, d.primes_centimes, d.devise]);
    for (let t = 1; t <= tours; t++) {
      await client.query(
        `INSERT INTO coupe_tours (coupe_id, tour, debut, fin, circuit_id)
         VALUES ($1, $2, ${LUNDI_KIN('$3', '($2 - 1)')}, ${LUNDI_KIN('$3', '$2')}, $4)`,
        [coupe.id, t, d.premier_lundi, parCode[d.circuits[t - 1]]]);
      for (let p = 1; p <= nbEquipes / 2 ** t; p++) {
        await client.query('INSERT INTO coupe_matchs (coupe_id, tour, position) VALUES ($1, $2, $3)', [coupe.id, t, p]);
      }
    }
    // Premier tour : pays 1 (1er) contre pays 2 (2e), pays 2 (1er) contre pays 1 (2e), et ainsi de suite.
    let position = 1;
    for (let i = 0; i < qualifies.length; i += 2) {
      const [a, b] = [qualifies[i], qualifies[i + 1]];
      await client.query('UPDATE coupe_matchs SET equipe_a_id = $4, equipe_b_id = $5 WHERE coupe_id = $1 AND tour = $2 AND position = $3',
        [coupe.id, 1, position++, a[0], b[1]]);
      await client.query('UPDATE coupe_matchs SET equipe_a_id = $4, equipe_b_id = $5 WHERE coupe_id = $1 AND tour = $2 AND position = $3',
        [coupe.id, 1, position++, b[0], a[1]]);
    }
    return coupe;
  });
}

export async function cloturerTourCoupe(coupeId, tour, { forcer = false } = {}) {
  const resultat = await transaction(async (client) => {
    const { rows: [coupe] } = await client.query('SELECT * FROM coupes WHERE id = $1 FOR UPDATE', [coupeId]);
    if (!coupe) throw introuvable('Coupe introuvable.');
    if (coupe.statut !== 'active') throw conflit('competition_inactive', 'Cette coupe est terminée ou annulée.');
    const { rows: [t] } = await client.query('SELECT * FROM coupe_tours WHERE coupe_id = $1 AND tour = $2 FOR UPDATE', [coupeId, tour]);
    if (!t) throw introuvable('Tour introuvable.');
    if (t.cloture_le) return null;
    if (!forcer && new Date(t.fin) > new Date()) throw conflit('tour_en_cours', "Le tour n'est pas fini.");
    if (tour > 1) {
      const { rows: [avant] } = await client.query('SELECT cloture_le FROM coupe_tours WHERE coupe_id = $1 AND tour = $2', [coupeId, tour - 1]);
      if (!avant.cloture_le) throw conflit('tour_precedent', "Le tour précédent n'est pas clôturé.");
    }
    const { rows: matchs } = await client.query(
      'SELECT * FROM coupe_matchs WHERE coupe_id = $1 AND tour = $2 ORDER BY position', [coupeId, tour]);
    const dernier = tour === coupe.circuits.length;
    const primes = [];
    for (const m of matchs) {
      const lignes = await tempsEquipes(client, {
        equipes: [{ equipe_id: m.equipe_a_id }, { equipe_id: m.equipe_b_id }], circuitId: t.circuit_id,
        debut: t.debut, fin: t.fin, taille: coupe.taille_equipe });
      // Le classement trie déjà : temps complet le plus court, sinon plus de pilotes, sinon l'équipe A.
      const [gagnante, perdante] = lignes;
      const tempsDe = (id) => lignes.find((l) => l.equipe_id === id).temps_ms;
      await client.query(
        `UPDATE coupe_matchs SET temps_a_ms = $4, temps_b_ms = $5, gagnante_id = $6 WHERE coupe_id = $1 AND tour = $2 AND position = $3`,
        [coupeId, tour, m.position, tempsDe(m.equipe_a_id), tempsDe(m.equipe_b_id), gagnante.equipe_id]);
      if (!dernier) {
        const colonne = m.position % 2 ? 'equipe_a_id' : 'equipe_b_id';
        await client.query(`UPDATE coupe_matchs SET ${colonne} = $4 WHERE coupe_id = $1 AND tour = $2 AND position = $3`,
          [coupeId, tour + 1, Math.ceil(m.position / 2), gagnante.equipe_id]);
      } else {
        await client.query(`UPDATE coupes SET statut = 'terminee', championne_id = $2 WHERE id = $1`, [coupeId, gagnante.equipe_id]);
        const recompenses = [[gagnante, 1], [perdante, 2]];
        for (const [equipe, rang] of recompenses) {
          const montant = Number(coupe.primes_centimes[rang - 1] ?? 0);
          if (montant > 0) primes.push(...await primeEquipe(client, { origine: 'coupe', competitionId: coupeId, numero: tour, devise: coupe.devise, equipe, rang, montant }));
        }
      }
    }
    await client.query('UPDATE coupe_tours SET cloture_le = now() WHERE coupe_id = $1 AND tour = $2', [coupeId, tour]);
    return { primes, matchs: matchs.length, termine: dernier };
  });
  if (!resultat) return null;
  lancerPrimes(resultat.primes);
  return resultat;
}

const NOMS_TOURS = { 1: 'Finale', 2: 'Demi-finales', 4: 'Quarts de finale', 8: 'Huitièmes de finale', 16: 'Seizièmes de finale' };

export async function coupeEnCours() {
  const { rows: [c] } = await requete(
    `SELECT c.*, e.nom AS championne FROM coupes c LEFT JOIN equipes e ON e.id = c.championne_id
      ORDER BY (c.statut = 'active') DESC, (c.premier_lundi <= (now() AT TIME ZONE 'Africa/Kinshasa')::date) DESC, c.premier_lundi DESC LIMIT 1`);
  if (!c) return null;
  const { rows: tours } = await requete(
    `SELECT t.tour, t.debut, t.fin, t.cloture_le IS NOT NULL AS cloture, ci.code AS circuit
       FROM coupe_tours t JOIN circuits ci ON ci.id = t.circuit_id WHERE t.coupe_id = $1 ORDER BY t.tour`, [c.id]);
  const { rows: matchs } = await requete(
    `SELECT m.tour, m.position, ea.nom AS equipe_a, pa.pays_code AS pays_a, eb.nom AS equipe_b, pb.pays_code AS pays_b,
            m.temps_a_ms, m.temps_b_ms, eg.nom AS gagnante
       FROM coupe_matchs m
       LEFT JOIN equipes ea ON ea.id = m.equipe_a_id LEFT JOIN joueurs pa ON pa.id = ea.capitaine_id
       LEFT JOIN equipes eb ON eb.id = m.equipe_b_id LEFT JOIN joueurs pb ON pb.id = eb.capitaine_id
       LEFT JOIN equipes eg ON eg.id = m.gagnante_id
      WHERE m.coupe_id = $1 ORDER BY m.tour, m.position`, [c.id]);
  return {
    id: c.id, nom: c.nom, sponsor: c.sponsor, statut: c.statut, championne: c.championne,
    tours: tours.map((t) => {
      const ms = matchs.filter((m) => m.tour === t.tour);
      return { ...t, nom: NOMS_TOURS[ms.length] ?? `Tour ${t.tour}`, matchs: ms };
    }),
  };
}

// ---------- Planificateur ----------

/** Toutes les minutes : clôture les semaines de championnat et les tours de coupe finis. */
export async function traiterTournois() {
  const { rows: semaines } = await requete(
    `SELECT s.championnat_id, s.numero FROM championnat_semaines s JOIN championnats c ON c.id = s.championnat_id
      WHERE s.cloturee_le IS NULL AND s.fin <= now() AND c.statut = 'active' ORDER BY s.championnat_id, s.numero`);
  for (const s of semaines) {
    try { await cloturerSemaineChampionnat(s.championnat_id, s.numero); } catch (e) { console.error('Championnat :', e.message); }
  }
  const { rows: tours } = await requete(
    `SELECT t.coupe_id, t.tour FROM coupe_tours t JOIN coupes c ON c.id = t.coupe_id
      WHERE t.cloture_le IS NULL AND t.fin <= now() AND c.statut = 'active' ORDER BY t.coupe_id, t.tour`);
  for (const t of tours) {
    try { await cloturerTourCoupe(t.coupe_id, t.tour); } catch (e) { console.error('Coupe :', e.message); }
  }
}

// ---------- Classement continental des pilotes (individuel) ----------

export async function classementInternational(circuitCode, { parPays = 3 } = {}) {
  const { rows: [circuit] } = await requete('SELECT id, code, nom FROM circuits WHERE code = $1', [circuitCode]);
  if (!circuit) throw introuvable('Circuit introuvable.');
  const { rows } = await requete(
    `SELECT j.pseudo, p.code AS pays_code, p.nom AS pays, min(c.temps_ms)::int AS temps_ms
       FROM courses c JOIN joueurs j ON j.id = c.joueur_id JOIN pays p ON p.code = j.pays_code
      WHERE c.circuit_id = $1 AND c.valide AND c.duel_id IS NULL AND p.continent = 'AF'
      GROUP BY j.id, p.code ORDER BY temps_ms`, [circuit.id]);
  const pays = {};
  for (const r of rows) {
    pays[r.pays_code] ??= { code: r.pays_code, nom: r.pays, joueurs: [] };
    if (pays[r.pays_code].joueurs.length < parPays) pays[r.pays_code].joueurs.push({ pseudo: r.pseudo, temps_ms: r.temps_ms });
  }
  return { circuit: { code: circuit.code, nom: circuit.nom }, continental: rows.slice(0, 50).map((r, i) => ({ rang: i + 1, ...r })), meilleurs_par_pays: Object.values(pays) };
}

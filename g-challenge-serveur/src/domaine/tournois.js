// Tournois de G-Challenge.
//
// Tournoi Sponsor (hebdomadaire, semaine du lundi 00:00 au dimanche 23:59, heure de Kinshasa) :
//   - semaine 1 : qualifications ouvertes à tous, sur le circuit de la semaine. Les 18 meilleurs
//     temps (réglable) sont sélectionnés ;
//   - semaines suivantes : seuls les sélectionnés encore en lice courent. À la fin de chaque semaine,
//     les derniers du classement sont éliminés (6, puis 4, 4, 3 par défaut : 18 → 12 → 8 → 4 → champion) ;
//   - chaque semaine, les meilleurs reçoivent une prime payée par le sponsor, versée automatiquement
//     par M-Pesa quand leur pays le permet (sinon l'administrateur la verse à la main).
//   Un joueur sélectionné qui ne court pas une semaine est classé derrière ceux qui ont couru.
//
// Tournoi international : classement continental (pays d'Afrique) sur un circuit, avec les meilleurs
// de chaque pays. Les qualifiés nationaux disputent ensuite la phase continentale.
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

// ---------- Création d'une saison ----------

export async function creerSaison(d) {
  const nbSemaines = 1 + d.eliminations.length;
  if (d.circuits.length !== nbSemaines) {
    throw refus('circuits_semaines', `Il faut un circuit par semaine : ${nbSemaines} (qualifications + ${d.eliminations.length} semaines à éliminations).`);
  }
  const somme = d.eliminations.reduce((a, b) => a + b, 0);
  if (somme !== d.nb_qualifies - 1) {
    throw refus('eliminations_incoherentes', `Les éliminations doivent laisser un seul champion : leur somme doit faire ${d.nb_qualifies - 1}.`);
  }
  return transaction(async (client) => {
    const { rows: [lundi] } = await client.query(`SELECT extract(isodow FROM $1::date) = 1 AS ok`, [d.premier_lundi]);
    if (!lundi.ok) throw refus('pas_un_lundi', 'La saison commence un lundi.');
    const { rows: circuits } = await client.query('SELECT id, code FROM circuits WHERE code = ANY($1) AND actif', [d.circuits]);
    const parCode = Object.fromEntries(circuits.map((c) => [c.code, c.id]));
    const manquant = d.circuits.find((c) => !parCode[c]);
    if (manquant) throw introuvable(`Circuit introuvable ou fermé : ${manquant}`);
    const { rows: [s] } = await client.query(
      `INSERT INTO saisons_sponsor (nom, sponsor, premier_lundi, nb_qualifies, eliminations, primes_centimes,
         prime_champion_centimes, devise, circuits)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [d.nom, d.sponsor, d.premier_lundi, d.nb_qualifies, d.eliminations, d.primes_centimes,
        d.prime_champion_centimes ?? 0, d.devise, d.circuits]);
    for (let n = 1; n <= nbSemaines; n++) {
      // Lundi 00:00 à Kinshasa (UTC+1, sans heure d'été), puis 7 jours.
      await client.query(
        `INSERT INTO semaines_sponsor (saison_id, numero, debut, fin, circuit_id)
         VALUES ($1, $2, ($3::date + ($2 - 1) * 7)::timestamp AT TIME ZONE 'Africa/Kinshasa',
                 ($3::date + $2 * 7)::timestamp AT TIME ZONE 'Africa/Kinshasa', $4)`,
        [s.id, n, d.premier_lundi, parCode[d.circuits[n - 1]]]);
    }
    return s;
  });
}

// ---------- Classement d'une semaine ----------

/** Classement de la semaine : meilleur temps valide (hors duels) pendant la semaine, sur son circuit. */
async function classementCalcule(client, saison, semaine) {
  if (semaine.numero === 1) {
    const { rows } = await client.query(
      `SELECT j.id AS joueur_id, j.pseudo, j.pays_code, min(c.temps_ms)::int AS temps_ms
         FROM courses c JOIN joueurs j ON j.id = c.joueur_id
        WHERE c.circuit_id = $1 AND c.valide AND c.duel_id IS NULL AND c.cree_le >= $2 AND c.cree_le < $3
        GROUP BY j.id ORDER BY temps_ms, min(c.cree_le)`,
      [semaine.circuit_id, semaine.debut, semaine.fin]);
    return rows;
  }
  // Les sélectionnés en lice : ceux qui ont couru d'abord, puis les autres (dans l'ordre de qualification).
  const { rows } = await client.query(
    `SELECT j.id AS joueur_id, j.pseudo, j.pays_code, t.temps_ms, sj.rang_qualification
       FROM saison_joueurs sj JOIN joueurs j ON j.id = sj.joueur_id
       LEFT JOIN LATERAL (
         SELECT min(c.temps_ms)::int AS temps_ms, min(c.cree_le) AS premier FROM courses c
          WHERE c.joueur_id = sj.joueur_id AND c.circuit_id = $2 AND c.valide AND c.duel_id IS NULL
            AND c.cree_le >= $3 AND c.cree_le < $4) t ON true
      WHERE sj.saison_id = $1 AND sj.elimine_semaine IS NULL
      ORDER BY t.temps_ms NULLS LAST, t.premier NULLS LAST, sj.rang_qualification`,
    [saison.id, semaine.circuit_id, semaine.debut, semaine.fin]);
  return rows;
}

export async function classementSemaine(saisonId, numero) {
  const { rows: [saison] } = await requete('SELECT * FROM saisons_sponsor WHERE id = $1', [saisonId]);
  if (!saison) throw introuvable('Saison introuvable.');
  const { rows: [semaine] } = await requete('SELECT * FROM semaines_sponsor WHERE saison_id = $1 AND numero = $2', [saisonId, numero]);
  if (!semaine) throw introuvable('Semaine introuvable.');
  if (semaine.cloturee_le) {
    const { rows } = await requete(
      `SELECT r.joueur_id, j.pseudo, j.pays_code, r.temps_ms, r.rang, r.elimine
         FROM resultats_semaine r JOIN joueurs j ON j.id = r.joueur_id
        WHERE r.saison_id = $1 AND r.numero = $2 ORDER BY r.rang`, [saisonId, numero]);
    return { semaine: resumeSemaine(semaine), definitif: true, classement: rows };
  }
  const lignes = await classementCalcule({ query: requete }, saison, semaine);
  return { semaine: resumeSemaine(semaine), definitif: false, classement: lignes.map((l, i) => ({ ...l, rang: i + 1 })) };
}

// ---------- Clôture d'une semaine (automatique le dimanche à minuit) ----------

export async function cloturerSemaine(saisonId, numero, { forcer = false } = {}) {
  const resultat = await transaction(async (client) => {
    const { rows: [saison] } = await client.query('SELECT * FROM saisons_sponsor WHERE id = $1 FOR UPDATE', [saisonId]);
    if (!saison) throw introuvable('Saison introuvable.');
    if (saison.statut !== 'active') throw conflit('saison_inactive', 'Cette saison est terminée ou annulée.');
    const { rows: [semaine] } = await client.query(
      'SELECT * FROM semaines_sponsor WHERE saison_id = $1 AND numero = $2 FOR UPDATE', [saisonId, numero]);
    if (!semaine) throw introuvable('Semaine introuvable.');
    if (semaine.cloturee_le) return null; // déjà fait : rien à refaire
    if (!forcer && new Date(semaine.fin) > new Date()) throw conflit('semaine_en_cours', "La semaine n'est pas finie.");
    if (numero > 1) {
      const { rows: [avant] } = await client.query(
        'SELECT cloturee_le FROM semaines_sponsor WHERE saison_id = $1 AND numero = $2', [saisonId, numero - 1]);
      if (!avant.cloturee_le) throw conflit('semaine_precedente', "La semaine précédente n'est pas clôturée.");
    }

    const lignes = await classementCalcule(client, saison, semaine);
    const derniere = numero === saison.circuits.length;
    const elimines = new Set();
    if (numero === 1) {
      // Sélection des meilleurs temps de la semaine.
      const selection = lignes.slice(0, saison.nb_qualifies);
      for (let i = 0; i < selection.length; i++) {
        await client.query('INSERT INTO saison_joueurs (saison_id, joueur_id, rang_qualification) VALUES ($1, $2, $3)',
          [saisonId, selection[i].joueur_id, i + 1]);
      }
      lignes.slice(saison.nb_qualifies).forEach((l) => elimines.add(l.joueur_id));
    } else {
      // Les derniers sont éliminés ; il reste toujours au moins un joueur.
      const nb = derniere ? Math.max(0, lignes.length - 1) : Math.min(saison.eliminations[numero - 2], Math.max(0, lignes.length - 1));
      lignes.slice(lignes.length - nb).forEach((l) => elimines.add(l.joueur_id));
      for (const id of elimines) {
        await client.query('UPDATE saison_joueurs SET elimine_semaine = $3 WHERE saison_id = $1 AND joueur_id = $2', [saisonId, id, numero]);
      }
    }
    for (let i = 0; i < lignes.length; i++) {
      await client.query(
        `INSERT INTO resultats_semaine (saison_id, numero, joueur_id, temps_ms, rang, elimine) VALUES ($1, $2, $3, $4, $5, $6)`,
        [saisonId, numero, lignes[i].joueur_id, lignes[i].temps_ms, i + 1, elimines.has(lignes[i].joueur_id)]);
    }

    // Primes de la semaine : aux meilleurs qui ont couru.
    const aVerser = [];
    const coureurs = lignes.filter((l) => l.temps_ms !== null);
    for (let i = 0; i < Math.min(coureurs.length, saison.primes_centimes.length); i++) {
      const montant = Number(saison.primes_centimes[i]);
      if (montant > 0) aVerser.push(await creerPrime(client, saison, numero, coureurs[i].joueur_id, i + 1, montant));
    }
    if (derniere) {
      const champion = lignes.find((l) => !elimines.has(l.joueur_id));
      await client.query(`UPDATE saisons_sponsor SET statut = 'terminee', champion_id = $2 WHERE id = $1`, [saisonId, champion?.joueur_id ?? null]);
      if (champion && Number(saison.prime_champion_centimes) > 0) {
        aVerser.push(await creerPrime(client, saison, 0, champion.joueur_id, 1, Number(saison.prime_champion_centimes)));
      }
    }
    await client.query('UPDATE semaines_sponsor SET cloturee_le = now() WHERE saison_id = $1 AND numero = $2', [saisonId, numero]);
    return { primes: aVerser, classes: lignes.length, elimines: elimines.size, termine: derniere };
  });
  if (!resultat) return null;
  for (const p of resultat.primes) if (p.statut === 'en_attente') lancerExecution(p.id);
  return resultat;
}

/** Prime versée automatiquement si le pays le permet (et dans la même devise), sinon à la main. */
async function creerPrime(client, saison, numero, joueurId, rang, montant) {
  const { rows: [pays] } = await client.query(
    'SELECT p.* FROM pays p JOIN joueurs j ON j.pays_code = p.code WHERE j.id = $1', [joueurId]);
  let fournisseur = null;
  if (pays.primes_autorisees && pays.devise === saison.devise) {
    try { fournisseur = fournisseurPour(pays).nom; } catch { fournisseur = null; }
  }
  const { rows: [p] } = await client.query(
    `INSERT INTO primes (saison_id, numero, joueur_id, rang, montant_centimes, devise, fournisseur, statut)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [saison.id, numero, joueurId, rang, montant, saison.devise, fournisseur, fournisseur ? 'en_attente' : 'a_verser_manuellement']);
  return p;
}

/** Verse une prime par le fournisseur (M-Pesa...). Idempotent : ne fait rien si elle est déjà réglée. */
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

/** L'administrateur relance une prime échouée (après correction du numéro, par exemple). */
export async function relancerPrime(primeId) {
  const { rows: [p] } = await requete(
    `UPDATE primes SET statut = 'en_attente', maj_le = now() WHERE id = $1 AND statut = 'echoue' AND fournisseur IS NOT NULL RETURNING id`, [primeId]);
  if (!p) throw conflit('prime_non_relancable', "Seule une prime automatique échouée peut être relancée.");
  await executerPrime(primeId);
  return (await requete('SELECT * FROM primes WHERE id = $1', [primeId])).rows[0];
}

/** Toutes les minutes : clôture les semaines finies, dans l'ordre. */
export async function traiterTournois() {
  const { rows } = await requete(
    `SELECT se.saison_id, se.numero FROM semaines_sponsor se JOIN saisons_sponsor sa ON sa.id = se.saison_id
      WHERE se.cloturee_le IS NULL AND se.fin <= now() AND sa.statut = 'active'
      ORDER BY se.saison_id, se.numero`);
  for (const s of rows) {
    try { await cloturerSemaine(s.saison_id, s.numero); } catch (e) { console.error('Clôture de semaine :', e.message); break; }
  }
}

// ---------- Lecture pour le jeu ----------

function resumeSemaine(s) {
  return { numero: s.numero, debut: s.debut, fin: s.fin, cloturee: !!s.cloturee_le };
}

/** La saison en cours : semaine actuelle, circuit, joueurs en lice, éliminés, primes. */
export async function saisonEnCours() {
  const { rows: [saison] } = await requete(
    `SELECT s.*, j.pseudo AS champion FROM saisons_sponsor s LEFT JOIN joueurs j ON j.id = s.champion_id
      ORDER BY (s.statut = 'active') DESC, s.premier_lundi DESC LIMIT 1`);
  if (!saison) return null;
  const { rows: semaines } = await requete(
    `SELECT se.*, c.code AS circuit, c.nom AS circuit_nom FROM semaines_sponsor se JOIN circuits c ON c.id = se.circuit_id
      WHERE se.saison_id = $1 ORDER BY se.numero`, [saison.id]);
  const maintenant = new Date();
  const courante = semaines.find((s) => new Date(s.debut) <= maintenant && maintenant < new Date(s.fin) && !s.cloturee_le)
    ?? semaines.find((s) => !s.cloturee_le) ?? null;
  const { rows: joueurs } = await requete(
    `SELECT j.pseudo, j.pays_code, sj.rang_qualification, sj.elimine_semaine
       FROM saison_joueurs sj JOIN joueurs j ON j.id = sj.joueur_id WHERE sj.saison_id = $1 ORDER BY sj.rang_qualification`, [saison.id]);
  return {
    id: saison.id, nom: saison.nom, sponsor: saison.sponsor, statut: saison.statut, devise: saison.devise,
    nb_qualifies: saison.nb_qualifies, eliminations: saison.eliminations,
    primes_centimes: saison.primes_centimes.map(Number), prime_champion_centimes: Number(saison.prime_champion_centimes),
    champion: saison.champion,
    semaines: semaines.map((s) => ({ ...resumeSemaine(s), circuit: s.circuit, circuit_nom: s.circuit_nom })),
    semaine_courante: courante ? courante.numero : null,
    en_lice: joueurs.filter((j) => j.elimine_semaine === null),
    elimines: joueurs.filter((j) => j.elimine_semaine !== null),
  };
}

/** Tournoi international : classement continental (Afrique) sur un circuit, et les meilleurs de chaque pays. */
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
  return {
    circuit: { code: circuit.code, nom: circuit.nom },
    continental: rows.slice(0, 50).map((r, i) => ({ rang: i + 1, ...r })),
    qualifies_par_pays: Object.values(pays),
  };
}

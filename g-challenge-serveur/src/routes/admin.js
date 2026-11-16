import { Router } from 'express';
import { z } from 'zod';
import { requete } from '../db.js';
import { valider, introuvable, conflit } from '../erreurs.js';
import { connecte, admin } from '../auth.js';
import { executerPaiement, resumePaiement } from '../domaine/duels.js';
import { schemaCircuit, enregistrerCircuit } from '../domaine/circuits.js';
import { creerChampionnat, cloturerSemaineChampionnat, creerCoupe, cloturerTourCoupe, relancerPrime } from '../domaine/tournois.js';
import { asynchrone } from './outils.js';

export const routesAdmin = Router();
routesAdmin.use(connecte, admin);

// Créer ou mettre à jour un circuit (code = nom du niveau Unreal).
routesAdmin.put('/circuits/:code', asynchrone(async (req, res) => {
  res.json(await enregistrerCircuit(valider(schemaCircuit, { ...req.body, code: req.params.code })));
}));

// Commission de la plateforme, modifiable à tout moment (0 à 50 %).
// Elle s'applique aux duels créés après le changement.
routesAdmin.put('/parametres', asynchrone(async (req, res) => {
  const d = valider(z.object({ commission_pourcent: z.number().min(0).max(50) }), req.body);
  const { rows: [p] } = await requete(
    `UPDATE parametres SET commission_bp = $1, maj_le = now(), maj_par = $2 RETURNING *`,
    [Math.round(d.commission_pourcent * 100), req.joueur.id]);
  res.json({ commission_pourcent: p.commission_bp / 100, maj_le: p.maj_le });
}));

routesAdmin.get('/pays', asynchrone(async (_req, res) => {
  res.json((await requete('SELECT * FROM pays ORDER BY code')).rows);
}));

// Ajouter un pays, ou ouvrir / fermer les mises dans un pays.
routesAdmin.put('/pays/:code', asynchrone(async (req, res) => {
  const d = valider(z.object({
    code: z.string().length(2).toUpperCase(),
    nom: z.string().trim().min(2),
    devise: z.string().length(3).toUpperCase(),
    mises_autorisees: z.boolean(),
    fournisseur: z.string().nullable().default(null),
    langue: z.string().min(2).max(5).default('en'),
    indicatif: z.string().regex(/^\d{1,4}$/),
  }), { ...req.body, code: req.params.code });
  const { rows: [p] } = await requete(
    `INSERT INTO pays (code, nom, devise, mises_autorisees, fournisseur, langue, indicatif)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (code) DO UPDATE SET nom = $2, devise = $3, mises_autorisees = $4, fournisseur = $5, langue = $6, indicatif = $7
     RETURNING *`, [d.code, d.nom, d.devise, d.mises_autorisees, d.fournisseur, d.langue, d.indicatif]);
  res.json(p);
}));

// Bilan financier : commissions gagnées et argent en attente, par devise.
routesAdmin.get('/bilan', asynchrone(async (_req, res) => {
  const { rows: commissions } = await requete(
    `SELECT devise, count(*)::int AS duels_payants, coalesce(sum(commission_centimes), 0)::bigint AS commission_centimes
       FROM duels WHERE statut = 'termine' AND mise_centimes > 0 GROUP BY devise`);
  const { rows: paiements } = await requete(
    `SELECT devise, sens, statut, count(*)::int AS nombre, sum(montant_centimes)::bigint AS montant_centimes
       FROM paiements GROUP BY devise, sens, statut ORDER BY devise, sens, statut`);
  res.json({ commissions, paiements });
}));

// Relancer un versement ou un remboursement échoué (ex. réseau M-Pesa indisponible).
routesAdmin.post('/paiements/:id/relancer', asynchrone(async (req, res) => {
  const { rows: [p] } = await requete(
    `UPDATE paiements SET statut = 'en_attente', maj_le = now()
      WHERE id = $1 AND statut = 'echoue' AND sens IN ('versement', 'remboursement') RETURNING *`, [req.params.id]);
  if (!p) {
    const { rows: [existe] } = await requete('SELECT 1 FROM paiements WHERE id = $1', [req.params.id]);
    if (!existe) throw introuvable('Paiement introuvable.');
    throw conflit('non_relancable', 'Seul un versement ou un remboursement échoué peut être relancé.');
  }
  await executerPaiement(p.id);
  const { rows: [maj] } = await requete('SELECT * FROM paiements WHERE id = $1', [p.id]);
  res.json(resumePaiement(maj));
}));

// ---------- Tournois par équipes ----------
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// Championnat national (Tournoi Sponsor) d'un pays : semaine 1 = qualifications, puis championnat.
// Par défaut : 16 équipes de 3, 4 × 20 $ par semaine, 2 qualifiées pour la Coupe d'Afrique.
const schemaChampionnat = z.object({
  pays: z.string().length(2).transform((s) => s.toUpperCase()),
  nom: z.string().min(2).max(80),
  sponsor: z.string().min(2).max(60),
  premier_lundi: date,
  circuits: z.array(z.string().min(1)).min(2).max(21),
  nb_equipes: z.number().int().min(2).max(64).default(16),
  taille_equipe: z.number().int().min(1).max(5).default(3),
  nb_qualifies: z.number().int().min(1).max(8).default(2),
  primes_centimes: z.array(z.number().int().min(0)).max(20).optional(), // par défaut : les réglages de l'espace administrateur
  points: z.array(z.number().int().min(0)).min(1).max(64).default([25, 20, 16, 13, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]),
  devise: z.string().length(3).default('USD'),
});
routesAdmin.post('/tournois/championnats', asynchrone(async (req, res) => {
  const d = valider(schemaChampionnat, req.body);
  if (!d.primes_centimes) {
    const r = await reglagesTournois();
    d.primes_centimes = Array(r.nb_equipes_primees).fill(r.prime_semaine_centimes);
  }
  res.status(201).json(await creerChampionnat(d));
}));
routesAdmin.post('/tournois/championnats/:id/semaines/:numero/cloturer', asynchrone(async (req, res) => {
  const numero = valider(z.coerce.number().int().min(1).max(60), req.params.numero);
  const r = await cloturerSemaineChampionnat(req.params.id, numero, { forcer: true });
  if (!r) throw conflit('deja_cloturee', 'Cette semaine est déjà clôturée.');
  res.json({ classees: r.classees, primes: r.primes.length, termine: r.termine });
}));

// Coupe d'Afrique, à partir des championnats nationaux terminés (8 pays → 16 équipes → huitièmes).
const schemaCoupe = z.object({
  nom: z.string().min(2).max(80),
  sponsor: z.string().min(2).max(60),
  premier_lundi: date,
  championnats: z.array(z.string().uuid()).min(2).max(16),
  circuits: z.array(z.string().min(1)).min(1).max(5),
  taille_equipe: z.number().int().min(1).max(5).default(3),
  primes_centimes: z.array(z.number().int().min(0)).max(2).optional(), // par défaut : les réglages
  devise: z.string().length(3).default('USD'),
});
routesAdmin.post('/tournois/coupes', asynchrone(async (req, res) => {
  const d = valider(schemaCoupe, req.body);
  if (!d.primes_centimes) {
    const r = await reglagesTournois();
    d.primes_centimes = [r.coupe_prime_championne_centimes, r.coupe_prime_finaliste_centimes];
  }
  res.status(201).json(await creerCoupe(d));
}));
routesAdmin.post('/tournois/coupes/:id/tours/:tour/cloturer', asynchrone(async (req, res) => {
  const tour = valider(z.coerce.number().int().min(1).max(5), req.params.tour);
  const r = await cloturerTourCoupe(req.params.id, tour, { forcer: true });
  if (!r) throw conflit('deja_cloture', 'Ce tour est déjà clôturé.');
  res.json({ matchs: r.matchs, primes: r.primes.length, termine: r.termine });
}));

// Réglages des primes (espace administrateur) : 20 $ × 4 équipes par semaine, primes de la Coupe d'Afrique.
async function reglagesTournois() {
  const { rows: [p] } = await requete(
    'SELECT prime_semaine_centimes, nb_equipes_primees, coupe_prime_championne_centimes, coupe_prime_finaliste_centimes FROM parametres');
  return p;
}
routesAdmin.get('/tournois/reglages', asynchrone(async (_req, res) => { res.json(await reglagesTournois()); }));
routesAdmin.put('/tournois/reglages', asynchrone(async (req, res) => {
  const montant = z.number().int().min(0).max(10_000_000);
  const d = valider(z.object({
    prime_semaine_centimes: montant, nb_equipes_primees: z.number().int().min(0).max(16),
    coupe_prime_championne_centimes: montant, coupe_prime_finaliste_centimes: montant }), req.body);
  await requete(
    `UPDATE parametres SET prime_semaine_centimes = $1, nb_equipes_primees = $2, coupe_prime_championne_centimes = $3,
       coupe_prime_finaliste_centimes = $4, maj_le = now(), maj_par = $5`,
    [d.prime_semaine_centimes, d.nb_equipes_primees, d.coupe_prime_championne_centimes, d.coupe_prime_finaliste_centimes, req.joueur.id]);
  // La Coupe d'Afrique en cours prend les nouveaux montants (versés à la finale).
  await requete(`UPDATE coupes SET primes_centimes = $1 WHERE statut = 'active'`,
    [[d.coupe_prime_championne_centimes, d.coupe_prime_finaliste_centimes]]);
  res.json(await reglagesTournois());
}));

// Vue d'ensemble pour l'espace administrateur.
routesAdmin.get('/tournois', asynchrone(async (_req, res) => {
  const championnats = (await requete(
    `SELECT c.id, c.pays_code, c.nom, c.sponsor, c.premier_lundi, c.statut, c.nb_equipes, c.primes_centimes,
            array_length(c.circuits, 1) AS semaines,
            (SELECT min(numero) FROM championnat_semaines s WHERE s.championnat_id = c.id AND s.cloturee_le IS NULL) AS semaine_ouverte
       FROM championnats c ORDER BY c.cree_le DESC LIMIT 50`)).rows;
  const coupes = (await requete(
    `SELECT c.id, c.nom, c.sponsor, c.premier_lundi, c.statut, c.primes_centimes, e.nom AS championne
       FROM coupes c LEFT JOIN equipes e ON e.id = c.championne_id ORDER BY c.cree_le DESC LIMIT 20`)).rows;
  const circuits = (await requete(
    `SELECT code, nom, difficulte, longueur_m FROM circuits WHERE actif
      ORDER BY code LIKE 'W\\_%' DESC, array_position(ARRAY['facile','moyen','difficile','tres_difficile'], difficulte), longueur_m`)).rows;
  res.json({ championnats, coupes, circuits, reglages: await reglagesTournois() });
}));

// Primes : liste, et relance d'une prime M-Pesa échouée.
routesAdmin.get('/primes', asynchrone(async (req, res) => {
  const statut = req.query.statut ? valider(z.enum(['en_attente', 'reussi', 'echoue', 'a_verser_manuellement']), req.query.statut) : null;
  const { rows } = await requete(
    `SELECT pr.*, j.pseudo, j.telephone, e.nom AS equipe FROM primes pr JOIN joueurs j ON j.id = pr.joueur_id
       JOIN equipes e ON e.id = pr.equipe_id
      WHERE ($1::text IS NULL OR pr.statut = $1) ORDER BY pr.cree_le DESC LIMIT 500`, [statut]);
  res.json(rows);
}));
routesAdmin.post('/primes/:id/relancer', asynchrone(async (req, res) => {
  res.json(await relancerPrime(req.params.id));
}));

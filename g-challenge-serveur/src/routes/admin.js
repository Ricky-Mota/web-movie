import { Router } from 'express';
import { z } from 'zod';
import { requete } from '../db.js';
import { valider, introuvable, conflit } from '../erreurs.js';
import { connecte, admin } from '../auth.js';
import { executerPaiement, resumePaiement } from '../domaine/duels.js';
import { schemaCircuit, enregistrerCircuit } from '../domaine/circuits.js';
import { creerSaison, cloturerSemaine, relancerPrime } from '../domaine/tournois.js';
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

// ---------- Tournoi Sponsor ----------
// Créer une saison : un circuit par semaine (qualifications + semaines à éliminations).
// Par défaut : 18 sélectionnés, éliminations 6, 4, 4, 3 (18 → 12 → 8 → 4 → champion),
// primes hebdomadaires 50 $, 30 $, 20 $ aux trois premiers (montants en centimes).
const schemaSaison = z.object({
  nom: z.string().min(2).max(80),
  sponsor: z.string().min(2).max(60),
  premier_lundi: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  nb_qualifies: z.number().int().min(2).max(200).default(18),
  eliminations: z.array(z.number().int().min(1)).min(1).max(20).default([6, 4, 4, 3]),
  primes_centimes: z.array(z.number().int().min(0)).max(20).default([5000, 3000, 2000]),
  prime_champion_centimes: z.number().int().min(0).default(0),
  devise: z.string().length(3).default('USD'),
  circuits: z.array(z.string().min(1)).min(2).max(21),
});
routesAdmin.post('/tournois/sponsor', asynchrone(async (req, res) => {
  res.status(201).json(await creerSaison(valider(schemaSaison, req.body)));
}));

// Clôturer une semaine tout de suite (sinon c'est automatique le dimanche à minuit, heure de Kinshasa).
routesAdmin.post('/tournois/sponsor/:saison/semaines/:numero/cloturer', asynchrone(async (req, res) => {
  const numero = valider(z.coerce.number().int().min(1).max(60), req.params.numero);
  const r = await cloturerSemaine(req.params.saison, numero, { forcer: true });
  if (!r) throw conflit('deja_cloturee', 'Cette semaine est déjà clôturée.');
  res.json({ classes: r.classes, elimines: r.elimines, primes: r.primes.length, saison_terminee: r.termine });
}));

// Primes : liste, et relance d'une prime M-Pesa échouée.
routesAdmin.get('/primes', asynchrone(async (req, res) => {
  const statut = req.query.statut ? valider(z.enum(['en_attente', 'reussi', 'echoue', 'a_verser_manuellement']), req.query.statut) : null;
  const { rows } = await requete(
    `SELECT pr.*, j.pseudo, j.telephone FROM primes pr JOIN joueurs j ON j.id = pr.joueur_id
      WHERE ($1::text IS NULL OR pr.statut = $1) ORDER BY pr.cree_le DESC LIMIT 200`, [statut]);
  res.json(rows);
}));
routesAdmin.post('/primes/:id/relancer', asynchrone(async (req, res) => {
  res.json(await relancerPrime(req.params.id));
}));

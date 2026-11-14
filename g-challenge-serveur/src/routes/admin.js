import { Router } from 'express';
import { z } from 'zod';
import { requete } from '../db.js';
import { valider, introuvable, conflit } from '../erreurs.js';
import { connecte, admin } from '../auth.js';
import { executerPaiement, resumePaiement } from '../domaine/duels.js';
import { asynchrone } from './outils.js';

export const routesAdmin = Router();
routesAdmin.use(connecte, admin);

const vecteur = z.array(z.number()).length(3);
const schemaCircuit = z.object({
  code: z.string().trim().min(2).max(60).regex(/^[A-Za-z0-9_]+$/),
  nom: z.string().trim().min(2).max(80),
  temps_min_ms: z.number().int().positive(),
  vitesse_max_kmh: z.number().int().min(10).max(600),
  depart: vecteur,
  arrivee: vecteur,
  tolerance_cm: z.number().int().min(100).max(10000).default(1500),
  actif: z.boolean().default(true),
});

// Créer ou mettre à jour un circuit (code = nom du niveau Unreal).
routesAdmin.put('/circuits/:code', asynchrone(async (req, res) => {
  const d = valider(schemaCircuit, { ...req.body, code: req.params.code });
  const { rows: [c] } = await requete(
    `INSERT INTO circuits (code, nom, temps_min_ms, vitesse_max_kmh, depart, arrivee, tolerance_cm, actif)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (code) DO UPDATE SET nom = $2, temps_min_ms = $3, vitesse_max_kmh = $4,
       depart = $5, arrivee = $6, tolerance_cm = $7, actif = $8
     RETURNING *`,
    [d.code, d.nom, d.temps_min_ms, d.vitesse_max_kmh, d.depart, d.arrivee, d.tolerance_cm, d.actif]);
  res.json(c);
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

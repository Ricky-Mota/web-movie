import { Router } from 'express';
import { z } from 'zod';
import { requete } from '../db.js';
import { valider, introuvable, interdit } from '../erreurs.js';
import { connecte } from '../auth.js';
import {
  creerDuel, rejoindreDuel, payerMise, partirDansDuel, lireDuel, participantsDuel, resume, resumePaiement,
} from '../domaine/duels.js';
import { asynchrone } from './outils.js';

export const routesDuels = Router();
routesDuels.use(connecte);

// Duels ouverts que je peux rejoindre (filtrables par circuit et par taille).
routesDuels.get('/ouverts', asynchrone(async (req, res) => {
  const q = valider(z.object({
    circuit: z.string().optional(),
    taille: z.coerce.number().int().min(1).max(5).optional(),
  }), req.query);
  const { rows } = await requete(
    `SELECT d.*, c.code AS circuit, e.nom AS equipe_a_nom
       FROM duels d JOIN circuits c ON c.id = d.circuit_id JOIN equipes e ON e.id = d.equipe_a_id
      WHERE d.statut = 'ouvert' AND d.equipe_b_id IS NULL AND d.rejoindre_avant > now()
        AND ($1::text IS NULL OR c.code = $1) AND ($2::int IS NULL OR d.taille = $2)
        AND NOT EXISTS (SELECT 1 FROM equipe_membres m WHERE m.equipe_id = d.equipe_a_id AND m.joueur_id = $3)
      ORDER BY d.cree_le DESC LIMIT 50`, [q.circuit ?? null, q.taille ?? null, req.joueur.id]);
  res.json(rows.map((d) => ({ ...resume(d), circuit: d.circuit, equipe_a_nom: d.equipe_a_nom })));
}));

routesDuels.get('/miens', asynchrone(async (req, res) => {
  const { rows } = await requete(
    `SELECT DISTINCT d.* FROM duels d JOIN equipe_membres m ON m.equipe_id IN (d.equipe_a_id, d.equipe_b_id)
      WHERE m.joueur_id = $1 ORDER BY d.cree_le DESC LIMIT 50`, [req.joueur.id]);
  res.json(rows.map(resume));
}));

// Lancer un défi. mise_centimes = mise PAR ÉQUIPE (1000 = 10 $). 0 = duel gratuit.
routesDuels.post('/', asynchrone(async (req, res) => {
  const d = valider(z.object({
    circuit: z.string().min(1),
    taille: z.number().int().min(1).max(5),
    mise_centimes: z.number().int().min(0).max(100_000_00),
    equipe_id: z.string().uuid().optional(),
  }), req.body);
  const duel = await creerDuel({
    joueurId: req.joueur.id, circuitCode: d.circuit, taille: d.taille,
    miseCentimes: d.mise_centimes, equipeId: d.equipe_id,
  });
  res.status(201).json(resume(duel));
}));

routesDuels.get('/:id', asynchrone(async (req, res) => {
  const duel = await lireDuel(req.params.id);
  const { a, b } = await participantsDuel(duel);
  const { rows: courses } = await requete(
    'SELECT joueur_id, temps_ms, valide, motif_rejet FROM courses WHERE duel_id = $1', [duel.id]);
  const { rows: paiements } = await requete(
    'SELECT * FROM paiements WHERE duel_id = $1 AND joueur_id = $2 ORDER BY cree_le', [duel.id, req.joueur.id]);
  const avecCourse = (m) => ({ id: m.id, pseudo: m.pseudo, pays: m.pays_code, course: courses.find((c) => c.joueur_id === m.id) ?? null });
  res.json({ ...resume(duel), equipe_a: a.map(avecCourse), equipe_b: b.map(avecCourse), mes_paiements: paiements.map(resumePaiement) });
}));

routesDuels.post('/:id/rejoindre', asynchrone(async (req, res) => {
  const { equipe_id } = valider(z.object({ equipe_id: z.string().uuid().optional() }), req.body ?? {});
  res.json(resume(await rejoindreDuel({ joueurId: req.joueur.id, duelId: req.params.id, equipeId: equipe_id })));
}));

// Le capitaine paie la mise de son équipe : le téléphone reçoit la demande M-Pesa.
// Réponse immédiate (202) ; le résultat arrive par Socket.IO ("paiement:maj") ou via GET /duels/:id.
routesDuels.post('/:id/payer', asynchrone(async (req, res) => {
  res.status(202).json(resumePaiement(await payerMise({ joueurId: req.joueur.id, duelId: req.params.id })));
}));

// Le joueur appuie sur « Courir ». À appeler juste avant le compte à rebours.
routesDuels.post('/:id/depart', asynchrone(async (req, res) => {
  res.json(await partirDansDuel({ joueurId: req.joueur.id, duelId: req.params.id }));
}));

// Le meilleur trajet de l'équipe adverse dans ce duel, pour courir contre son fantôme.
routesDuels.get('/:id/fantome-adverse', asynchrone(async (req, res) => {
  const duel = await lireDuel(req.params.id);
  const { a, b } = await participantsDuel(duel);
  const dansA = a.some((m) => m.id === req.joueur.id);
  if (!dansA && !b.some((m) => m.id === req.joueur.id)) throw interdit('pas_participant', 'Vous ne participez pas à ce duel.');
  const adverses = (dansA ? b : a).map((m) => m.id);
  const { rows: [c] } = await requete(
    `SELECT c.temps_ms, c.intervalle_ms, c.trajet, j.pseudo FROM courses c JOIN joueurs j ON j.id = c.joueur_id
      WHERE c.duel_id = $1 AND c.valide AND c.joueur_id = ANY($2) ORDER BY c.temps_ms LIMIT 1`, [duel.id, adverses]);
  if (!c) throw introuvable("L'équipe adverse n'a pas encore couru.");
  res.json(c);
}));

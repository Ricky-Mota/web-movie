import { Router } from 'express';
import { z } from 'zod';
import { requete } from '../db.js';
import { valider, introuvable } from '../erreurs.js';
import { asynchrone } from './outils.js';

export const routesCircuits = Router();

async function circuitParCode(code) {
  const { rows: [c] } = await requete('SELECT * FROM circuits WHERE code = $1', [code]);
  if (!c) throw introuvable('Circuit introuvable.');
  return c;
}

routesCircuits.get('/', asynchrone(async (_req, res) => {
  const { rows } = await requete('SELECT code, nom, temps_min_ms FROM circuits WHERE actif ORDER BY nom');
  res.json(rows);
}));

// Classement : meilleur temps valide de chaque joueur. ?pays=CD pour un classement national.
routesCircuits.get('/:code/classement', asynchrone(async (req, res) => {
  const q = valider(z.object({
    pays: z.string().length(2).toUpperCase().optional(),
    limite: z.coerce.number().int().min(1).max(100).default(50),
  }), req.query);
  const circuit = await circuitParCode(req.params.code);
  const { rows } = await requete(
    `SELECT rank() OVER (ORDER BY m.temps_ms)::int AS rang, j.id AS joueur_id, j.pseudo, j.pays_code AS pays, m.temps_ms
       FROM (SELECT joueur_id, min(temps_ms) AS temps_ms FROM courses
              WHERE circuit_id = $1 AND valide GROUP BY joueur_id) m
       JOIN joueurs j ON j.id = m.joueur_id
      WHERE $2::text IS NULL OR j.pays_code = $2
      ORDER BY m.temps_ms LIMIT $3`, [circuit.id, q.pays ?? null, q.limite]);
  res.json(rows);
}));

// Fantôme : le meilleur trajet d'un joueur (?joueur=<id>), ou le record du circuit.
routesCircuits.get('/:code/fantome', asynchrone(async (req, res) => {
  const q = valider(z.object({ joueur: z.string().uuid().optional() }), req.query);
  const circuit = await circuitParCode(req.params.code);
  const { rows: [c] } = await requete(
    `SELECT c.temps_ms, c.intervalle_ms, c.trajet, j.id AS joueur_id, j.pseudo
       FROM courses c JOIN joueurs j ON j.id = c.joueur_id
      WHERE c.circuit_id = $1 AND c.valide AND ($2::uuid IS NULL OR c.joueur_id = $2)
      ORDER BY c.temps_ms LIMIT 1`, [circuit.id, q.joueur ?? null]);
  if (!c) throw introuvable('Aucun fantôme pour ce circuit.');
  res.json(c);
}));

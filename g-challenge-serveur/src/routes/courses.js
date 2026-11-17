import { Router } from 'express';
import { z } from 'zod';
import { requete } from '../db.js';
import { valider, introuvable, interdit, conflit, refus } from '../erreurs.js';
import { connecte } from '../auth.js';
import { verifierCourse, POINTS_MAX } from '../domaine/antitriche.js';
import { lireDuel, participantsDuel, verifierFinDuel } from '../domaine/duels.js';
import { asynchrone } from './outils.js';

export const routesCourses = Router();

const point = z.array(z.number()).length(6); // x, y, z, pitch, yaw, roll
const schemaCourse = z.object({
  circuit: z.string().min(1),
  duel_id: z.string().uuid().optional(),
  temps_ms: z.number().int().positive().max(30 * 60 * 1000),
  intervalle_ms: z.number().int().min(20).max(200),
  trajet: z.array(point).min(3).max(POINTS_MAX),
});

// Envoyer une course terminée (entraînement, ou course d'un duel).
routesCourses.post('/', connecte, asynchrone(async (req, res) => {
  const d = valider(schemaCourse, req.body);
  const { rows: [circuit] } = await requete('SELECT * FROM circuits WHERE code = $1 AND actif', [d.circuit]);
  if (!circuit) throw introuvable('Circuit introuvable ou fermé.');

  if (d.duel_id) {
    const duel = await lireDuel(d.duel_id);
    if (duel.statut !== 'en_cours') throw conflit('duel_pas_en_cours', "Ce duel n'accepte pas de course.");
    if (duel.circuit_id !== circuit.id) throw refus('mauvais_circuit', 'Ce duel se court sur un autre circuit.');
    const { tous } = await participantsDuel(duel);
    if (!tous.some((m) => m.id === req.joueur.id)) throw interdit('pas_participant', 'Vous ne participez pas à ce duel.');
    const { rows: [dep] } = await requete(
      `SELECT extract(epoch FROM now() - depart_le) * 1000 AS ecoule_ms
         FROM duel_departs WHERE duel_id = $1 AND joueur_id = $2`, [duel.id, req.joueur.id]);
    if (!dep) throw refus('pas_de_depart', 'Appelez d\'abord le départ du duel (bouton « Courir »).');
    // La course doit arriver après le temps annoncé (on ne peut pas aller plus vite que le chrono)
    // et pas trop longtemps après (5 minutes pour l'envoi sur une connexion lente).
    const ecoule = Number(dep.ecoule_ms);
    if (ecoule < d.temps_ms - 2000 || ecoule > d.temps_ms + 5 * 60 * 1000) {
      throw refus('envoi_hors_delai', 'Course envoyée hors délai par rapport au départ.');
    }
  }

  const verdict = verifierCourse({ tempsMs: d.temps_ms, intervalleMs: d.intervalle_ms, trajet: d.trajet }, circuit);
  let course;
  try {
    ({ rows: [course] } = await requete(
      `INSERT INTO courses (joueur_id, circuit_id, duel_id, temps_ms, intervalle_ms, trajet, valide, motif_rejet)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, temps_ms, valide, motif_rejet`,
      [req.joueur.id, circuit.id, d.duel_id ?? null, d.temps_ms, d.intervalle_ms, JSON.stringify(d.trajet),
        verdict.valide, verdict.motif ?? null]));
  } catch (e) {
    if (e.code === '23505') throw conflit('deja_couru', 'Vous avez déjà couru ce duel.');
    throw e;
  }

  let rang = null;
  if (course.valide) {
    const { rows: [r] } = await requete(
      `SELECT count(*)::int + 1 AS rang FROM (
         SELECT joueur_id, min(temps_ms) AS t FROM courses WHERE circuit_id = $1 AND valide GROUP BY joueur_id
       ) m WHERE m.t < $2`, [circuit.id, course.temps_ms]);
    rang = r.rang;
  }
  if (d.duel_id) await verifierFinDuel(d.duel_id);

  res.status(201).json({ id: course.id, valide: course.valide, motif_rejet: course.motif_rejet, temps_ms: course.temps_ms, rang });
}));

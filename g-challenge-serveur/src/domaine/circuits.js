import { z } from 'zod';
import { requete } from '../db.js';

const vecteur = z.array(z.number()).length(3);

export const schemaCircuit = z.object({
  code: z.string().trim().min(2).max(60).regex(/^[A-Za-z0-9_]+$/),
  nom: z.string().trim().min(2).max(80),
  temps_min_ms: z.number().int().positive(),
  vitesse_max_kmh: z.number().int().min(10).max(600),
  depart: vecteur,
  arrivee: vecteur,
  tolerance_cm: z.number().int().min(100).max(10000).default(1500),
  actif: z.boolean().default(true),
});

/** Crée le circuit, ou le met à jour s'il existe déjà (même code). */
export async function enregistrerCircuit(d) {
  const { rows: [c] } = await requete(
    `INSERT INTO circuits (code, nom, temps_min_ms, vitesse_max_kmh, depart, arrivee, tolerance_cm, actif)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (code) DO UPDATE SET nom = $2, temps_min_ms = $3, vitesse_max_kmh = $4,
       depart = $5, arrivee = $6, tolerance_cm = $7, actif = $8
     RETURNING *`,
    [d.code, d.nom, d.temps_min_ms, d.vitesse_max_kmh, d.depart, d.arrivee, d.tolerance_cm, d.actif]);
  return c;
}

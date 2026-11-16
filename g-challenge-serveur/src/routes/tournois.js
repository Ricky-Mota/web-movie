import { Router } from 'express';
import { z } from 'zod';
import { valider, introuvable } from '../erreurs.js';
import { saisonEnCours, classementSemaine, classementInternational } from '../domaine/tournois.js';
import { asynchrone } from './outils.js';

export const routesTournois = Router();

// Tournoi Sponsor : saison en cours (semaines, circuit de la semaine, joueurs en lice, éliminés, primes).
routesTournois.get('/sponsor', asynchrone(async (_req, res) => {
  const s = await saisonEnCours();
  if (!s) throw introuvable('Aucune saison du Tournoi Sponsor pour le moment.');
  res.json(s);
}));

// Classement d'une semaine : provisoire pendant la semaine, définitif après la clôture.
routesTournois.get('/sponsor/:saison/semaines/:numero', asynchrone(async (req, res) => {
  const numero = valider(z.coerce.number().int().min(1).max(60), req.params.numero);
  res.json(await classementSemaine(req.params.saison, numero));
}));

// Tournoi international : classement continental (Afrique) et meilleurs de chaque pays sur un circuit.
routesTournois.get('/international/:circuit', asynchrone(async (req, res) => {
  const parPays = valider(z.coerce.number().int().min(1).max(10).default(3), req.query.par_pays);
  res.json(await classementInternational(req.params.circuit, { parPays }));
}));

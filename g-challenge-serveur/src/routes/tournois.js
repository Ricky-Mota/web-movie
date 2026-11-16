import { Router } from 'express';
import { z } from 'zod';
import { valider, introuvable } from '../erreurs.js';
import { championnatEnCours, classementChampionnatSemaine, coupeEnCours, classementInternational } from '../domaine/tournois.js';
import { asynchrone } from './outils.js';

export const routesTournois = Router();

// Championnat national d'un pays (Tournoi Sponsor) : semaines, équipes retenues, points, qualifiées.
routesTournois.get('/championnats/:pays', asynchrone(async (req, res) => {
  const pays = valider(z.string().length(2).transform((s) => s.toUpperCase()), req.params.pays);
  const c = await championnatEnCours(pays);
  if (!c) throw introuvable('Aucun championnat dans ce pays pour le moment.');
  res.json(c);
}));

// Classement d'une semaine : provisoire pendant la semaine, définitif après la clôture.
routesTournois.get('/championnats/:id/semaines/:numero', asynchrone(async (req, res) => {
  const numero = valider(z.coerce.number().int().min(1).max(60), req.params.numero);
  res.json(await classementChampionnatSemaine(req.params.id, numero));
}));

// Coupe d'Afrique : tableau (huitièmes, quarts, demies, finale) avec les temps et les équipes qualifiées.
routesTournois.get('/coupe', asynchrone(async (_req, res) => {
  const c = await coupeEnCours();
  if (!c) throw introuvable("Aucune Coupe d'Afrique pour le moment.");
  res.json(c);
}));

// Classement continental des pilotes (individuel), avec les meilleurs de chaque pays.
routesTournois.get('/international/:circuit', asynchrone(async (req, res) => {
  const parPays = valider(z.coerce.number().int().min(1).max(10).default(3), req.query.par_pays);
  res.json(await classementInternational(req.params.circuit, { parPays }));
}));

import { Router } from 'express';
import { z } from 'zod';
import { requete } from '../db.js';
import { valider, refus, conflit, ErreurApi, introuvable } from '../erreurs.js';
import { hacherMotDePasse, verifierMotDePasse, creerJeton, connecte } from '../auth.js';
import { asynchrone } from './outils.js';

export const routesJoueurs = Router();

const schemaInscription = z.object({
  pseudo: z.string().trim().min(3).max(20).regex(/^[\p{L}\p{N}_.-]+$/u, 'lettres, chiffres, _ . - uniquement'),
  telephone: z.string().trim().transform((t) => t.replace(/[\s+()-]/g, '')).pipe(z.string().regex(/^\d{9,15}$/, 'numéro international, ex. 243812345678')),
  pays: z.string().length(2).transform((p) => p.toUpperCase()),
  mot_de_passe: z.string().min(8).max(100),
});

function publicJoueur(j) {
  return { id: j.id, pseudo: j.pseudo, telephone: j.telephone, pays: j.pays_code, role: j.role, cree_le: j.cree_le };
}

routesJoueurs.post('/inscription', asynchrone(async (req, res) => {
  const d = valider(schemaInscription, req.body);
  const { rows: [pays] } = await requete('SELECT * FROM pays WHERE code = $1', [d.pays]);
  if (!pays) throw refus('pays_inconnu', 'Pays non pris en charge pour le moment.');
  if (!d.telephone.startsWith(pays.indicatif)) {
    throw refus('telephone_pays', `Le numéro doit commencer par l'indicatif ${pays.indicatif} (${pays.nom}).`);
  }
  try {
    const { rows: [j] } = await requete(
      `INSERT INTO joueurs (pseudo, telephone, pays_code, mot_de_passe_hash) VALUES ($1, $2, $3, $4) RETURNING *`,
      [d.pseudo, d.telephone, d.pays, await hacherMotDePasse(d.mot_de_passe)]);
    res.status(201).json({ jeton: creerJeton(j), joueur: publicJoueur(j) });
  } catch (e) {
    if (e.code === '23505') throw conflit('deja_inscrit', 'Ce pseudo ou ce numéro est déjà utilisé.');
    throw e;
  }
}));

const schemaConnexion = z.object({
  identifiant: z.string().trim().min(3), // pseudo ou numéro de téléphone
  mot_de_passe: z.string().min(1),
});

routesJoueurs.post('/connexion', asynchrone(async (req, res) => {
  const d = valider(schemaConnexion, req.body);
  const tel = d.identifiant.replace(/[\s+()-]/g, '');
  const { rows: [j] } = await requete(
    'SELECT * FROM joueurs WHERE lower(pseudo) = lower($1) OR telephone = $2', [d.identifiant, tel]);
  if (!j || !(await verifierMotDePasse(d.mot_de_passe, j.mot_de_passe_hash))) {
    throw new ErreurApi(401, 'identifiants_invalides', 'Pseudo, numéro ou mot de passe incorrect.');
  }
  res.json({ jeton: creerJeton(j), joueur: publicJoueur(j) });
}));

routesJoueurs.get('/moi', connecte, asynchrone(async (req, res) => {
  const { rows: [j] } = await requete('SELECT * FROM joueurs WHERE id = $1', [req.joueur.id]);
  if (!j) throw introuvable('Joueur introuvable.');
  const { rows: [p] } = await requete('SELECT * FROM pays WHERE code = $1', [j.pays_code]);
  res.json({ ...publicJoueur(j), devise: p.devise, mises_autorisees: p.mises_autorisees, langue: p.langue });
}));

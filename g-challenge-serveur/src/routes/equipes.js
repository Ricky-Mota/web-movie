import { Router } from 'express';
import { z } from 'zod';
import { requete, transaction } from '../db.js';
import { valider, refus, interdit, introuvable, conflit } from '../erreurs.js';
import { connecte } from '../auth.js';
import { creerEquipe, membresDe, estEngagee } from '../domaine/equipes.js';
import { asynchrone } from './outils.js';

export const routesEquipes = Router();
routesEquipes.use(connecte);

async function detailEquipe(equipe, client = { query: requete }) {
  const membres = await membresDe(equipe.id, client);
  return {
    id: equipe.id, nom: equipe.nom, capitaine_id: equipe.capitaine_id,
    code_invitation: equipe.code_invitation, taille_max: equipe.taille_max,
    membres: membres.map((m) => ({ id: m.id, pseudo: m.pseudo, pays: m.pays_code })),
  };
}

/** Ajoute un joueur à une équipe (verrouillée pour éviter de dépasser la taille). */
async function ajouterMembre(client, equipeId, joueurId) {
  const { rows: [e] } = await client.query('SELECT * FROM equipes WHERE id = $1 FOR UPDATE', [equipeId]);
  if (!e) throw introuvable('Équipe introuvable.');
  if (await estEngagee(client, e.id)) throw conflit('equipe_engagee', 'Équipe engagée dans un duel : composition bloquée.');
  const membres = await membresDe(e.id, client);
  if (membres.some((m) => m.id === joueurId)) throw conflit('deja_membre', 'Ce joueur est déjà dans l\'équipe.');
  if (membres.length >= e.taille_max) throw conflit('equipe_pleine', `Équipe complète (${e.taille_max} joueurs).`);
  await client.query('INSERT INTO equipe_membres (equipe_id, joueur_id) VALUES ($1, $2)', [e.id, joueurId]);
  return e;
}

// Créer une équipe : le créateur en est le capitaine.
routesEquipes.post('/', asynchrone(async (req, res) => {
  const d = valider(z.object({
    nom: z.string().trim().min(2).max(30),
    taille_max: z.number().int().min(1).max(5),
  }), req.body);
  const equipe = await transaction((c) => creerEquipe(c, { nom: d.nom, capitaineId: req.joueur.id, tailleMax: d.taille_max }));
  res.status(201).json(await detailEquipe(equipe));
}));

// Mes équipes (sans les équipes « solo » créées automatiquement pour les 1v1).
routesEquipes.get('/', asynchrone(async (req, res) => {
  const { rows } = await requete(
    `SELECT e.* FROM equipes e JOIN equipe_membres m ON m.equipe_id = e.id
      WHERE m.joueur_id = $1 AND e.taille_max > 1 ORDER BY e.cree_le DESC`, [req.joueur.id]);
  res.json(await Promise.all(rows.map((e) => detailEquipe(e))));
}));

// Rejoindre avec le code d'invitation reçu d'un ami.
routesEquipes.post('/rejoindre', asynchrone(async (req, res) => {
  const { code } = valider(z.object({ code: z.string().trim().toUpperCase().length(6) }), req.body);
  const equipe = await transaction(async (c) => {
    const { rows: [e] } = await c.query('SELECT id FROM equipes WHERE code_invitation = $1', [code]);
    if (!e) throw introuvable('Code d\'invitation inconnu.');
    return ajouterMembre(c, e.id, req.joueur.id);
  });
  res.json(await detailEquipe(equipe));
}));

// Le capitaine ajoute directement un joueur par son pseudo.
routesEquipes.post('/:id/membres', asynchrone(async (req, res) => {
  const { pseudo } = valider(z.object({ pseudo: z.string().trim().min(3) }), req.body);
  const equipe = await transaction(async (c) => {
    const { rows: [e] } = await c.query('SELECT * FROM equipes WHERE id = $1', [req.params.id]);
    if (!e) throw introuvable('Équipe introuvable.');
    if (e.capitaine_id !== req.joueur.id) throw interdit('pas_capitaine', 'Seul le capitaine ajoute des joueurs.');
    const { rows: [j] } = await c.query('SELECT id FROM joueurs WHERE lower(pseudo) = lower($1)', [pseudo]);
    if (!j) throw introuvable(`Aucun joueur nommé ${pseudo}.`);
    return ajouterMembre(c, e.id, j.id);
  });
  res.status(201).json(await detailEquipe(equipe));
}));

// Retirer un joueur (capitaine) ou quitter l'équipe (soi-même).
routesEquipes.delete('/:id/membres/:joueurId', asynchrone(async (req, res) => {
  const equipe = await transaction(async (c) => {
    const { rows: [e] } = await c.query('SELECT * FROM equipes WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (!e) throw introuvable('Équipe introuvable.');
    const cible = req.params.joueurId;
    if (req.joueur.id !== e.capitaine_id && req.joueur.id !== cible) {
      throw interdit('pas_capitaine', 'Seul le capitaine retire des joueurs.');
    }
    if (cible === e.capitaine_id) throw refus('capitaine', 'Le capitaine ne peut pas quitter son équipe.');
    if (await estEngagee(c, e.id)) throw conflit('equipe_engagee', 'Équipe engagée dans un duel : composition bloquée.');
    const { rowCount } = await c.query('DELETE FROM equipe_membres WHERE equipe_id = $1 AND joueur_id = $2', [e.id, cible]);
    if (!rowCount) throw introuvable('Ce joueur n\'est pas dans l\'équipe.');
    return e;
  });
  res.json(await detailEquipe(equipe));
}));

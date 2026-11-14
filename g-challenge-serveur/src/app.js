import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { requete } from './db.js';
import { ErreurApi } from './erreurs.js';
import { routesJoueurs } from './routes/joueurs.js';
import { routesEquipes } from './routes/equipes.js';
import { routesCircuits } from './routes/circuits.js';
import { routesCourses } from './routes/courses.js';
import { routesDuels } from './routes/duels.js';
import { routesAdmin } from './routes/admin.js';
import { asynchrone } from './routes/outils.js';

export function creerApp({ limiteConnexions = 20 } = {}) {
  const app = express();
  app.set('trust proxy', 1); // derrière l'hébergeur (Render, Railway...)
  app.use(helmet());
  app.use(express.json({ limit: '3mb' })); // un trajet de 30 min tient en ~2 Mo

  app.get('/sante', asynchrone(async (_req, res) => {
    await requete('SELECT 1');
    res.json({ ok: true });
  }));
  // Taux de commission actuel : à afficher au joueur avant qu'il lance un défi.
  app.get('/parametres', asynchrone(async (_req, res) => {
    const { rows: [p] } = await requete('SELECT commission_bp, maj_le FROM parametres');
    res.json({ commission_pourcent: p.commission_bp / 100, maj_le: p.maj_le });
  }));
  app.get('/pays', asynchrone(async (_req, res) => {
    const { rows } = await requete('SELECT code, nom, devise, mises_autorisees, langue, indicatif FROM pays ORDER BY nom');
    res.json(rows);
  }));

  // Freine les essais de mots de passe en rafale.
  const limiteAuth = rateLimit({ windowMs: 15 * 60 * 1000, limit: limiteConnexions, standardHeaders: 'draft-7', legacyHeaders: false });
  app.use('/joueurs/connexion', limiteAuth);
  app.use('/joueurs/inscription', limiteAuth);

  app.use('/joueurs', routesJoueurs);
  app.use('/equipes', routesEquipes);
  app.use('/circuits', routesCircuits);
  app.use('/courses', routesCourses);
  app.use('/duels', routesDuels);
  app.use('/admin', routesAdmin);

  app.use((_req, _res, next) => next(new ErreurApi(404, 'route_inconnue', 'Adresse inconnue.')));

  // Toutes les erreurs ont la même forme : { erreur: { code, message } }.
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof ErreurApi) return res.status(err.statut).json({ erreur: { code: err.code, message: err.message } });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ erreur: { code: 'json_invalide', message: 'Corps JSON invalide.' } });
    if (err.type === 'entity.too.large') return res.status(413).json({ erreur: { code: 'trop_gros', message: 'Envoi trop volumineux.' } });
    if (err.code === '22P02') return res.status(400).json({ erreur: { code: 'identifiant_invalide', message: 'Identifiant invalide.' } });
    console.error(err);
    res.status(500).json({ erreur: { code: 'erreur_serveur', message: 'Erreur interne. Réessayez plus tard.' } });
  });
  return app;
}

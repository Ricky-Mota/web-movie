import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { config } from './config.js';
import { ErreurApi } from './erreurs.js';

export const hacherMotDePasse = (mdp) => bcrypt.hash(mdp, 10);
export const verifierMotDePasse = (mdp, hash) => bcrypt.compare(mdp, hash);

export function creerJeton(joueur) {
  return jwt.sign({ sub: joueur.id, role: joueur.role }, config.jwtSecret, {
    expiresIn: config.jwtDuree,
    algorithm: 'HS256',
  });
}

export function lireJeton(jeton) {
  const charge = jwt.verify(jeton, config.jwtSecret, { algorithms: ['HS256'] });
  return { id: charge.sub, role: charge.role };
}

/** Middleware : exige "Authorization: Bearer <jeton>". */
export function connecte(req, _res, next) {
  const entete = req.get('authorization') || '';
  const [type, jeton] = entete.split(' ');
  if (type !== 'Bearer' || !jeton) return next(new ErreurApi(401, 'non_connecte', 'Connexion requise.'));
  try {
    req.joueur = lireJeton(jeton);
    next();
  } catch {
    next(new ErreurApi(401, 'jeton_invalide', 'Session expirée, reconnectez-vous.'));
  }
}

export function admin(req, _res, next) {
  if (req.joueur?.role !== 'admin') return next(new ErreurApi(403, 'reserve_admin', 'Réservé aux administrateurs.'));
  next();
}

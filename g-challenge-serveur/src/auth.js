import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { config } from './config.js';
import { ErreurApi } from './erreurs.js';
import { requete } from './db.js';

export const hacherMotDePasse = (mdp) => bcrypt.hash(mdp, 12);
export const verifierMotDePasse = (mdp, hash) => bcrypt.compare(mdp, hash);
// Empreinte factice : une connexion avec un pseudo inconnu prend autant de temps qu'avec un vrai,
// pour qu'on ne puisse pas deviner quels pseudos ou numéros existent en mesurant le temps de réponse.
const EMPREINTE_FACTICE = bcrypt.hashSync('mot-de-passe-factice-g-challenge', 12);
export const comparerSansFuite = (mdp, hash) => bcrypt.compare(mdp, hash || EMPREINTE_FACTICE);

export function creerJeton(joueur) {
  return jwt.sign({ sub: joueur.id, role: joueur.role }, config.jwtSecret, {
    expiresIn: config.jwtDuree,
    algorithm: 'HS256',
  });
}

export function lireJeton(jeton) {
  const charge = jwt.verify(jeton, config.jwtSecret, { algorithms: ['HS256'] });
  return { id: charge.sub, role: charge.role, emisLe: (charge.iat || 0) * 1000 };
}

/**
 * Vérifie le jeton PUIS l'état réel du compte en base : un compte bloqué, supprimé, ou dont
 * les sessions ont été coupées est refusé, et le rôle (admin ou non) vient de la base, pas du jeton.
 */
export async function joueurDuJeton(jeton) {
  let j;
  try { j = lireJeton(jeton); } catch { throw new ErreurApi(401, 'jeton_invalide', 'Session expirée, reconnectez-vous.'); }
  const { rows: [c] } = await requete('SELECT id, role, bloque, jetons_apres FROM joueurs WHERE id = $1', [j.id]);
  if (!c) throw new ErreurApi(401, 'jeton_invalide', 'Session expirée, reconnectez-vous.');
  if (c.bloque) throw new ErreurApi(403, 'compte_bloque', 'Ce compte est bloqué. Contactez G-Challenge.');
  // iat est arrondi à la seconde : le blocage fixe jetons_apres une seconde plus tard, pour couper
  // aussi un jeton émis dans la même seconde.
  if (j.emisLe < new Date(c.jetons_apres).getTime()) throw new ErreurApi(401, 'jeton_invalide', 'Session expirée, reconnectez-vous.');
  return { id: c.id, role: c.role };
}

/** Middleware : exige "Authorization: Bearer <jeton>". */
export function connecte(req, _res, next) {
  const entete = req.get('authorization') || '';
  const [type, jeton] = entete.split(' ');
  if (type !== 'Bearer' || !jeton) return next(new ErreurApi(401, 'non_connecte', 'Connexion requise.'));
  joueurDuJeton(jeton).then((j) => { req.joueur = j; next(); }, next);
}

export function admin(req, _res, next) {
  if (req.joueur?.role !== 'admin') return next(new ErreurApi(403, 'reserve_admin', 'Réservé aux administrateurs.'));
  next();
}

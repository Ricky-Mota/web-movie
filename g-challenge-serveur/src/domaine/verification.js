// Vérification du numéro de téléphone par un code à 6 chiffres envoyé par SMS.
// Garde-fous : code valable 10 minutes, 5 essais, 1 envoi par minute et 5 par jour pour un joueur,
// code stocké seulement sous forme d'empreinte (HMAC) : même la base ne le connaît pas.
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { requete } from '../db.js';
import { config } from '../config.js';
import { ErreurApi, refus, conflit } from '../erreurs.js';
import { fournisseurSms } from '../sms/index.js';

const DUREE_MS = 10 * 60 * 1000;
const ESSAIS_MAX = 5;

const empreinte = (joueurId, code) => createHmac('sha256', config.jwtSecret).update(`${joueurId}:${code}`).digest('hex');

export async function envoyerCode(joueurId) {
  const { rows: [j] } = await requete('SELECT telephone, telephone_verifie_le FROM joueurs WHERE id = $1', [joueurId]);
  if (j.telephone_verifie_le) throw conflit('deja_verifie', 'Votre numéro est déjà vérifié.');
  const { rows: [c] } = await requete(
    `SELECT count(*) FILTER (WHERE cree_le > now() - interval '1 minute')::int AS minute,
            count(*) FILTER (WHERE cree_le > now() - interval '1 day')::int AS jour
       FROM codes_sms WHERE joueur_id = $1`, [joueurId]);
  if (c.minute >= 1) throw new ErreurApi(429, 'patientez', 'Un code vient d\'être envoyé : patientez une minute.');
  if (c.jour >= 5) throw new ErreurApi(429, 'limite_jour', 'Trop de codes demandés aujourd\'hui : réessayez demain.');

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await requete('UPDATE codes_sms SET utilise = true WHERE joueur_id = $1 AND NOT utilise', [joueurId]);
  await requete('INSERT INTO codes_sms (joueur_id, code_hash, expire_le) VALUES ($1, $2, $3)',
    [joueurId, empreinte(joueurId, code), new Date(Date.now() + DUREE_MS)]);
  try {
    await fournisseurSms().envoyer(j.telephone, `G-Challenge : votre code est ${code}. Valable 10 minutes. Ne le donnez à personne.`);
  } catch (e) {
    console.error('SMS :', e.message);
    throw new ErreurApi(502, 'sms_echec', 'Le SMS n\'a pas pu partir. Réessayez dans une minute.');
  }
  return { envoye: true, telephone_masque: '+' + j.telephone.slice(0, 5) + '•••' + j.telephone.slice(-2) };
}

export async function verifierCode(joueurId, code) {
  if (!/^\d{6}$/.test(code)) throw refus('code_invalide', 'Le code compte 6 chiffres.');
  const { rows: [c] } = await requete(
    `SELECT * FROM codes_sms WHERE joueur_id = $1 AND NOT utilise AND expire_le > now() ORDER BY cree_le DESC LIMIT 1`, [joueurId]);
  if (!c) throw refus('code_expire', 'Aucun code valable : demandez un nouveau code.');
  if (c.essais >= ESSAIS_MAX) throw refus('trop_essais', 'Trop d\'essais : demandez un nouveau code.');
  await requete('UPDATE codes_sms SET essais = essais + 1 WHERE id = $1', [c.id]);
  const attendu = Buffer.from(c.code_hash, 'hex'), recu = Buffer.from(empreinte(joueurId, code), 'hex');
  if (!timingSafeEqual(attendu, recu)) {
    const reste = ESSAIS_MAX - c.essais - 1;
    throw refus('code_faux', reste > 0 ? `Code incorrect : encore ${reste} essai(s).` : 'Code incorrect. Demandez un nouveau code.');
  }
  await requete('UPDATE codes_sms SET utilise = true WHERE id = $1', [c.id]);
  await requete('UPDATE joueurs SET telephone_verifie_le = now() WHERE id = $1', [joueurId]);
  return { verifie: true };
}

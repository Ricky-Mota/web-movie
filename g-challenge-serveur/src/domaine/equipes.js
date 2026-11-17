import { randomInt } from 'node:crypto';

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sans 0/O ni 1/I/L, faciles à confondre

export function genererCode() {
  let code = '';
  for (let i = 0; i < 6; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}

/** Membres d'une équipe, avec les règles de leur pays. */
export async function membresDe(equipeId, client) {
  const { rows } = await client.query(
    `SELECT j.id, j.pseudo, j.pays_code, p.nom AS pays_nom, p.devise, p.mises_autorisees, m.rejoint_le
       FROM equipe_membres m JOIN joueurs j ON j.id = m.joueur_id JOIN pays p ON p.code = j.pays_code
      WHERE m.equipe_id = $1 ORDER BY m.rejoint_le`, [equipeId]);
  return rows;
}

export async function creerEquipe(client, { nom, capitaineId, tailleMax }) {
  for (let essai = 0; essai < 5; essai++) {
    const code = genererCode();
    const { rows } = await client.query(
      `INSERT INTO equipes (nom, capitaine_id, code_invitation, taille_max) VALUES ($1, $2, $3, $4)
       ON CONFLICT (code_invitation) DO NOTHING RETURNING *`, [nom, capitaineId, code, tailleMax]);
    if (rows[0]) {
      await client.query('INSERT INTO equipe_membres (equipe_id, joueur_id) VALUES ($1, $2)', [rows[0].id, capitaineId]);
      return rows[0];
    }
  }
  throw new Error("Impossible de générer un code d'invitation unique.");
}

/** Pour un duel 1 contre 1 : une équipe d'un seul joueur, créée à la volée. */
export async function creerEquipeSolo(client, joueurId) {
  const { rows: [j] } = await client.query('SELECT pseudo FROM joueurs WHERE id = $1', [joueurId]);
  const equipe = await creerEquipe(client, { nom: j.pseudo, capitaineId: joueurId, tailleMax: 1 });
  return equipe.id;
}

/** Une équipe engagée dans un duel non terminé ne peut plus changer de joueurs. */
export async function estEngagee(client, equipeId) {
  const { rows } = await client.query(
    `SELECT 1 FROM duels WHERE statut IN ('ouvert','paiement','en_cours')
       AND (equipe_a_id = $1 OR equipe_b_id = $1) LIMIT 1`, [equipeId]);
  return rows.length > 0;
}

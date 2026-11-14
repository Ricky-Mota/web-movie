// Usage : npm run admin -- <pseudo>
import { requete, pool } from '../src/db.js';

const pseudo = process.argv[2];
if (!pseudo) {
  console.error('Usage : npm run admin -- <pseudo>');
  process.exit(1);
}
const { rowCount } = await requete(`UPDATE joueurs SET role = 'admin' WHERE lower(pseudo) = lower($1)`, [pseudo]);
console.log(rowCount ? `${pseudo} est maintenant administrateur.` : `Aucun joueur nommé ${pseudo}.`);
await pool.end();

import { migrer } from '../src/migrations.js';
import { pool } from '../src/db.js';

const appliquees = await migrer();
console.log(appliquees.length ? `Migrations appliquées : ${appliquees.join(', ')}` : 'Base déjà à jour.');
await pool.end();

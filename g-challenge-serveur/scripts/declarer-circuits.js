// Usage : npm run circuits
// Lit db/circuits.json et crée ou met à jour chaque circuit dont l'arrivée est renseignée.
import { readFile } from 'node:fs/promises';
import { pool } from '../src/db.js';
import { migrer } from '../src/migrations.js';
import { schemaCircuit, enregistrerCircuit } from '../src/domaine/circuits.js';

const fichier = new URL('../db/circuits.json', import.meta.url);
const { circuits } = JSON.parse(await readFile(fichier, 'utf8'));

await migrer();
let erreurs = 0;
for (const brut of circuits) {
  if (brut.arrivee === null) {
    console.log(`- ${brut.code} : arrivée à compléter, circuit ignoré.`);
    continue;
  }
  const r = schemaCircuit.safeParse(brut);
  if (!r.success) {
    erreurs += 1;
    console.error(`x ${brut.code ?? '(sans code)'} : ${r.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join(' ; ')}`);
    continue;
  }
  await enregistrerCircuit(r.data);
  console.log(`v ${r.data.code} enregistré.`);
}
await pool.end();
process.exit(erreurs ? 1 : 0);

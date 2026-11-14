import { createServer } from 'node:http';
import { config } from './config.js';
import { pool } from './db.js';
import { migrer } from './migrations.js';
import { creerApp } from './app.js';
import { demarrerTempsReel } from './temps-reel.js';
import { traiterDelais, attendreExecutions } from './domaine/duels.js';

const appliquees = await migrer();
if (appliquees.length) console.log(`Migrations appliquées : ${appliquees.join(', ')}`);

const serveur = createServer(creerApp());
demarrerTempsReel(serveur);

// Chaque minute : duels sans adversaire annulés (et remboursés), duels trop longs clôturés.
const minuterie = setInterval(() => traiterDelais().catch((e) => console.error('Délais :', e)), 60_000);

serveur.listen(config.port, () => {
  console.log(`G-Challenge en ligne sur le port ${config.port}`);
  if (config.fournisseurForce) console.log(`Paiements : fournisseur forcé "${config.fournisseurForce}" (aucun argent réel).`);
});

async function arreter() {
  clearInterval(minuterie);
  serveur.close();
  await attendreExecutions();
  await pool.end();
  process.exit(0);
}
process.on('SIGTERM', arreter);
process.on('SIGINT', arreter);

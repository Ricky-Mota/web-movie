import { createServer } from 'node:http';
import { config } from './config.js';
import { pool } from './db.js';
import { migrer } from './migrations.js';
import { creerApp } from './app.js';
import { demarrerTempsReel } from './temps-reel.js';
import { traiterDelais, attendreExecutions } from './domaine/duels.js';
import { traiterTournois, attendrePrimes } from './domaine/tournois.js';

const appliquees = await migrer();
if (appliquees.length) console.log(`Migrations appliquées : ${appliquees.join(', ')}`);

const serveur = createServer(creerApp());
demarrerTempsReel(serveur);

// Chaque minute : duels sans adversaire annulés (et remboursés), duels trop longs clôturés.
const minuterie = setInterval(() => traiterDelais().catch((e) => console.error('Délais :', e)), 60_000);
// Chaque minute aussi : les semaines du Tournoi Sponsor finies sont clôturées (sélection, éliminations, primes M-Pesa).
const minuterieTournois = setInterval(() => traiterTournois().catch((e) => console.error('Tournois :', e)), 60_000);

serveur.listen(config.port, () => {
  console.log(`G-Challenge en ligne sur le port ${config.port}`);
  if (config.fournisseurForce) console.log(`Paiements : fournisseur forcé "${config.fournisseurForce}" (aucun argent réel).`);
});

async function arreter() {
  clearInterval(minuterie);
  clearInterval(minuterieTournois);
  serveur.close();
  await attendreExecutions();
  await attendrePrimes();
  await pool.end();
  process.exit(0);
}
process.on('SIGTERM', arreter);
process.on('SIGINT', arreter);

// Registre des fournisseurs de paiement.
// Pour ouvrir un nouveau pays (Zambie, Zimbabwe...) : écrire un module avec
// { nom, encaisser(paiement, joueur), verser(paiement, joueur) } qui renvoie
// { statut: 'reussi' | 'echoue', reference, details }, l'ajouter ici,
// puis mettre son nom dans la colonne "fournisseur" du pays.
import { config } from '../config.js';
import { simulation } from './simulation.js';
import { mpesaRdc } from './mpesaRdc.js';

const fournisseurs = { simulation, mpesa_rdc: mpesaRdc };

export function fournisseurPour(pays) {
  const nom = config.fournisseurForce || pays.fournisseur;
  const f = nom && fournisseurs[nom];
  if (!f) throw new Error(`Aucun fournisseur de paiement configuré pour ${pays.code}`);
  return f;
}

export function fournisseurParNom(nom) {
  const f = fournisseurs[nom];
  if (!f) throw new Error(`Fournisseur de paiement inconnu : ${nom}`);
  return f;
}

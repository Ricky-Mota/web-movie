// Fournisseur de test : chaque paiement réussit aussitôt, sans argent réel.
// Pour simuler un refus, utilisez un numéro qui se termine par 000.
let compteur = 0;

function repondre(paiement, telephone) {
  compteur += 1;
  const reference = `SIM-${Date.now()}-${compteur}`;
  if (telephone.endsWith('000')) return { statut: 'echoue', reference, details: { raison: 'refus_simule' } };
  return { statut: 'reussi', reference, details: { montant: paiement.montant_centimes } };
}

export const simulation = {
  nom: 'simulation',
  async encaisser(paiement, joueur) { return repondre(paiement, joueur.telephone); },
  async verser(paiement, joueur) { return repondre(paiement, joueur.telephone); },
};

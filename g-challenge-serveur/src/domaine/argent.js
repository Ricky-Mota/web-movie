// Calculs d'argent. Tout est en centimes entiers : jamais de nombres à virgule.

/** Commission arrondie au centime le plus proche. bp = points de base (2500 = 25 %). */
export function calculerCommission(cagnotteCentimes, commissionBp) {
  return Math.floor((cagnotteCentimes * commissionBp + 5000) / 10000);
}

/**
 * Répartit le gain d'un duel entre les membres de l'équipe gagnante.
 * Le reste de la division (quelques centimes) revient au capitaine.
 *
 * Exemple : mise 10 $ par équipe, 25 % -> cagnotte 20 $, commission 5 $, gain 15 $.
 * En 2v2 : 7,50 $ chacun. En 3v3 : 5 $ chacun.
 */
export function calculerRepartition({ miseCentimes, commissionBp, membres, capitaineId }) {
  if (!Number.isInteger(miseCentimes) || miseCentimes < 0) throw new Error('Mise invalide');
  if (!membres.length) throw new Error('Équipe vide');
  if (!membres.includes(capitaineId)) throw new Error('Le capitaine doit être membre');

  const cagnotte = miseCentimes * 2;
  const commission = calculerCommission(cagnotte, commissionBp);
  const gain = cagnotte - commission;
  const part = Math.floor(gain / membres.length);
  const reste = gain - part * membres.length;

  const parts = membres.map((joueurId) => ({
    joueurId,
    montantCentimes: part + (joueurId === capitaineId ? reste : 0),
  }));
  return { cagnotte, commission, gain, parts };
}

/** 1500 -> "15.00" (format attendu par les API Mobile Money). */
export function centimesVersTexte(centimes) {
  return (centimes / 100).toFixed(2);
}

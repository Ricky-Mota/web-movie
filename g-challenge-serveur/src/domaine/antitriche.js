// Vérification d'une course envoyée par le jeu.
// Le jeu note la position du ketch toutes les `intervalle_ms` (50 ms = 20 fois par seconde),
// à partir du "Partez !", plus une dernière position sur la ligne d'arrivée.
// Le serveur refait les calculs : un temps impossible ou un trajet incohérent est rejeté.

export const POINTS_MAX = 36000; // 30 minutes à 20 points par seconde

function distanceCm(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/**
 * @returns {{ valide: true } | { valide: false, motif: string }}
 */
export function verifierCourse({ tempsMs, intervalleMs, trajet }, circuit) {
  const n = trajet.length;
  if (n < 3) return { valide: false, motif: 'trajet_trop_court' };
  if (n > POINTS_MAX) return { valide: false, motif: 'trajet_trop_long' };
  if (!trajet.every((p) => Array.isArray(p) && p.length === 6 && p.every(Number.isFinite))) {
    return { valide: false, motif: 'trajet_mal_forme' };
  }

  if (tempsMs < circuit.temps_min_ms) return { valide: false, motif: 'temps_impossible' };

  // Le nombre de points doit correspondre au temps annoncé.
  // n-2 intervalles complets, puis un dernier morceau (0 à 1 intervalle) jusqu'à l'arrivée.
  const dureeGrille = (n - 2) * intervalleMs;
  const marge = 2 * intervalleMs + 0.02 * tempsMs; // tolérance pour les téléphones lents
  if (tempsMs < dureeGrille - marge || tempsMs > dureeGrille + intervalleMs + marge) {
    return { valide: false, motif: 'temps_incoherent_avec_trajet' };
  }

  if (distanceCm(trajet[0], circuit.depart) > circuit.tolerance_cm) {
    return { valide: false, motif: 'depart_hors_zone' };
  }
  if (distanceCm(trajet[n - 1], circuit.arrivee) > circuit.tolerance_cm) {
    return { valide: false, motif: 'arrivee_hors_zone' };
  }

  // Aucun déplacement plus rapide que la vitesse maximale du circuit (+ 25 % de marge).
  // On mesure sur des fenêtres d'une seconde (20 points) : un téléphone qui saccade
  // peut noter deux fois la même position puis "sauter", sans que ce soit de la triche.
  const cmParMsMax = (circuit.vitesse_max_kmh * 100000 / 3600000) * 1.25;
  const fenetre = Math.max(1, Math.round(1000 / intervalleMs));
  for (let i = 1; i < n - 1; i++) {
    const j = Math.max(0, i - fenetre);
    if (distanceCm(trajet[j], trajet[i]) > cmParMsMax * (i - j) * intervalleMs + 200) {
      return { valide: false, motif: 'vitesse_impossible' };
    }
  }
  return { valide: true };
}

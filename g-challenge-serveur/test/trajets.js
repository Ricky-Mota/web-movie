// Fabrique de trajets pour les tests : une ligne droite du départ à l'arrivée.
export const CIRCUIT_TEST = {
  code: 'L_Kinshasa_30Juin',
  nom: 'Boulevard du 30 Juin',
  temps_min_ms: 20000,
  vitesse_max_kmh: 250,
  depart: [0, 0, 0],
  arrivee: [200000, 0, 0], // 2 km
  tolerance_cm: 1500,
};

export function trajetDroit({ tempsMs, intervalleMs = 50, circuit = CIRCUIT_TEST }) {
  const n = Math.floor(tempsMs / intervalleMs) + 1; // points sur la grille, à partir de 0 ms
  const [x0] = circuit.depart;
  const [x1] = circuit.arrivee;
  const trajet = [];
  for (let i = 0; i < n; i++) {
    const t = Math.min(1, (i * intervalleMs) / tempsMs);
    trajet.push([x0 + (x1 - x0) * t, 0, 0, 0, 0, 0]);
  }
  trajet.push([x1, 0, 0, 0, 0, 0]); // dernière position, sur la ligne
  return trajet;
}

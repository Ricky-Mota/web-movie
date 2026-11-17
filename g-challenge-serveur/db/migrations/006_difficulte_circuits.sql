-- Niveau de difficulté et longueur de chaque circuit (affichés dans le jeu et l'espace administrateur).
SET search_path TO gchallenge;
ALTER TABLE circuits ADD COLUMN difficulte text NOT NULL DEFAULT 'moyen'
  CHECK (difficulte IN ('facile', 'moyen', 'difficile', 'tres_difficile'));
ALTER TABLE circuits ADD COLUMN longueur_m int CHECK (longueur_m > 0);

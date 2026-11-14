-- Réglages modifiables à tout moment par un administrateur, sans redémarrer le serveur.
-- La commission s'applique aux duels créés APRÈS le changement : chaque duel garde
-- le taux en vigueur à sa création (colonne duels.commission_bp).
SET search_path TO gchallenge;

CREATE TABLE parametres (
  id                 boolean     PRIMARY KEY DEFAULT true CHECK (id),  -- une seule ligne
  commission_bp      int         NOT NULL CHECK (commission_bp BETWEEN 0 AND 5000), -- 2500 = 25 %
  maj_le             timestamptz NOT NULL DEFAULT now(),
  maj_par            uuid        REFERENCES joueurs(id)
);

INSERT INTO parametres (commission_bp) VALUES (2500);

-- Sécurité :
--  * un administrateur valide chaque prime avant qu'elle parte sur M-Pesa (protection contre la triche) ;
--  * un compte tricheur peut être bloqué : ses sessions sont coupées et ses courses retirées des classements.
SET search_path TO gchallenge;

ALTER TABLE joueurs ADD COLUMN bloque boolean NOT NULL DEFAULT false;
ALTER TABLE joueurs ADD COLUMN bloque_motif text;
-- Les jetons de connexion émis avant cette date sont refusés (déconnexion forcée).
ALTER TABLE joueurs ADD COLUMN jetons_apres timestamptz NOT NULL DEFAULT '2000-01-01';

ALTER TABLE parametres ADD COLUMN validation_primes boolean NOT NULL DEFAULT true;

ALTER TABLE primes DROP CONSTRAINT primes_statut_check;
ALTER TABLE primes ADD CONSTRAINT primes_statut_check
  CHECK (statut IN ('a_valider', 'en_attente', 'reussi', 'echoue', 'a_verser_manuellement', 'refusee'));
ALTER TABLE primes ADD COLUMN decide_par uuid REFERENCES joueurs(id);
ALTER TABLE primes ADD COLUMN decide_le timestamptz;
ALTER TABLE primes ADD COLUMN motif_refus text;

-- Journal des actions sensibles de l'administration (qui, quoi, quand).
CREATE TABLE journal_admin (
  id         bigserial PRIMARY KEY,
  admin_id   uuid        NOT NULL REFERENCES joueurs(id),
  action     text        NOT NULL,
  cible      text,
  details    jsonb,
  cree_le    timestamptz NOT NULL DEFAULT now()
);

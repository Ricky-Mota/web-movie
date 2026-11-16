-- 1. Vérification du numéro par code SMS : une prime n'est versée qu'à un numéro vérifié.
-- 2. Duels avec mise d'argent FERMÉS partout tant qu'il n'y a pas d'avis juridique.
--    Les duels gratuits (mise 0) restent ouverts. Réouverture pays par pays : PUT /admin/pays/:code.
SET search_path TO gchallenge;

ALTER TABLE joueurs ADD COLUMN telephone_verifie_le timestamptz;

CREATE TABLE codes_sms (
  id           bigserial PRIMARY KEY,
  joueur_id    uuid        NOT NULL REFERENCES joueurs(id) ON DELETE CASCADE,
  code_hash    text        NOT NULL,          -- jamais le code en clair
  expire_le    timestamptz NOT NULL,
  essais       int         NOT NULL DEFAULT 0,
  utilise      boolean     NOT NULL DEFAULT false,
  cree_le      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX codes_sms_joueur ON codes_sms (joueur_id, cree_le DESC);

UPDATE pays SET mises_autorisees = false;

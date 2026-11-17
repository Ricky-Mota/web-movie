-- Invitations automatiques au Tournoi Sponsor : les joueurs réguliers d'un pays sont invités
-- au championnat national ; une fois l'invitation acceptée, ils reçoivent le programme (jours et heures)
-- puis un rappel la veille de chaque semaine de compétition. Messages dans le jeu, en direct et par SMS.
SET search_path TO gchallenge;

-- « Régulier » = au moins invitation_jours_actifs jours avec une course valide sur les invitation_periode_jours derniers jours.
ALTER TABLE parametres ADD COLUMN invitation_jours_actifs int NOT NULL DEFAULT 3 CHECK (invitation_jours_actifs BETWEEN 1 AND 60);
ALTER TABLE parametres ADD COLUMN invitation_periode_jours int NOT NULL DEFAULT 14 CHECK (invitation_periode_jours BETWEEN 1 AND 90);
ALTER TABLE parametres ADD COLUMN invitations_sms boolean NOT NULL DEFAULT true;

-- Boîte de réception du joueur (affichée dans « Mon compte »).
CREATE TABLE notifications (
  id          bigserial PRIMARY KEY,
  joueur_id   uuid        NOT NULL REFERENCES joueurs(id) ON DELETE CASCADE,
  type        text        NOT NULL,        -- invitation, confirmation, rappel
  titre       text        NOT NULL,
  texte       text        NOT NULL,
  donnees     jsonb,
  lue_le      timestamptz,
  cree_le     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_joueur ON notifications (joueur_id, cree_le DESC);

CREATE TABLE invitations_tournoi (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  championnat_id  uuid        NOT NULL REFERENCES championnats(id) ON DELETE CASCADE,
  joueur_id       uuid        NOT NULL REFERENCES joueurs(id) ON DELETE CASCADE,
  statut          text        NOT NULL DEFAULT 'envoyee' CHECK (statut IN ('envoyee', 'acceptee', 'refusee')),
  envoyee_le      timestamptz NOT NULL DEFAULT now(),
  repondue_le     timestamptz,
  UNIQUE (championnat_id, joueur_id)
);

-- Un seul rappel par joueur et par semaine de compétition.
CREATE TABLE rappels_semaine (
  championnat_id  uuid        NOT NULL,
  numero          int         NOT NULL,
  joueur_id       uuid        NOT NULL REFERENCES joueurs(id) ON DELETE CASCADE,
  envoye_le       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (championnat_id, numero, joueur_id),
  FOREIGN KEY (championnat_id, numero) REFERENCES championnat_semaines (championnat_id, numero) ON DELETE CASCADE
);

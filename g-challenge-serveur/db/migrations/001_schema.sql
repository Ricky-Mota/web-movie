-- G-Challenge : schéma initial.
-- Toutes les tables vivent dans le schéma "gchallenge" : sur Supabase, ce schéma
-- n'est PAS exposé par l'API REST publique, seul ce serveur y accède.
-- Les montants sont stockés en CENTIMES (entiers) pour éviter les erreurs d'arrondi.

CREATE SCHEMA IF NOT EXISTS gchallenge;
SET search_path TO gchallenge;

-- Règles par pays : devise, mises autorisées ou non, fournisseur de paiement, langue.
CREATE TABLE pays (
  code               char(2) PRIMARY KEY,           -- ISO 3166-1 (CD, ZM, ZW, ZA, SA...)
  nom                text        NOT NULL,
  devise             char(3)     NOT NULL,           -- ISO 4217 (USD, ZMW, ZAR, SAR...)
  mises_autorisees   boolean     NOT NULL DEFAULT false,
  fournisseur        text,                           -- nom du module de paiement, ou NULL
  langue             text        NOT NULL DEFAULT 'fr',
  indicatif          text        NOT NULL            -- indicatif téléphonique sans "+", ex. 243
);

CREATE TABLE joueurs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pseudo             text        NOT NULL,
  telephone          text        NOT NULL,           -- format international sans "+", ex. 243812345678
  pays_code          char(2)     NOT NULL REFERENCES pays(code),
  mot_de_passe_hash  text        NOT NULL,
  role               text        NOT NULL DEFAULT 'joueur' CHECK (role IN ('joueur', 'admin')),
  cree_le            timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX joueurs_pseudo_unique ON joueurs (lower(pseudo));
CREATE UNIQUE INDEX joueurs_telephone_unique ON joueurs (telephone);

CREATE TABLE equipes (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom                text        NOT NULL,
  capitaine_id       uuid        NOT NULL REFERENCES joueurs(id),
  code_invitation    text        NOT NULL UNIQUE,
  taille_max         int         NOT NULL CHECK (taille_max BETWEEN 1 AND 5),
  cree_le            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE equipe_membres (
  equipe_id          uuid        NOT NULL REFERENCES equipes(id) ON DELETE CASCADE,
  joueur_id          uuid        NOT NULL REFERENCES joueurs(id),
  rejoint_le         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (equipe_id, joueur_id)
);

-- Un circuit = un niveau Unreal. Les seuils servent à l'anti-triche.
CREATE TABLE circuits (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code               text        NOT NULL UNIQUE,    -- identique au nom du niveau Unreal
  nom                text        NOT NULL,
  temps_min_ms       int         NOT NULL,           -- en dessous : impossible, donc rejeté
  vitesse_max_kmh    int         NOT NULL,           -- vitesse maximale crédible entre deux points
  depart             double precision[3] NOT NULL,   -- x, y, z en centimètres (unités Unreal)
  arrivee            double precision[3] NOT NULL,
  tolerance_cm       int         NOT NULL DEFAULT 1500,
  actif              boolean     NOT NULL DEFAULT true,
  cree_le            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE duels (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  circuit_id         uuid        NOT NULL REFERENCES circuits(id),
  taille             int         NOT NULL CHECK (taille BETWEEN 1 AND 5),   -- 1 = 1v1, 5 = 5v5
  mise_centimes      bigint      NOT NULL DEFAULT 0 CHECK (mise_centimes >= 0), -- par équipe
  devise             char(3)     NOT NULL,
  commission_bp      int         NOT NULL,           -- points de base : 2500 = 25 %
  statut             text        NOT NULL DEFAULT 'ouvert'
                     CHECK (statut IN ('ouvert', 'paiement', 'en_cours', 'termine', 'annule')),
  equipe_a_id        uuid        NOT NULL REFERENCES equipes(id),
  equipe_b_id        uuid        REFERENCES equipes(id),
  equipe_a_payee     boolean     NOT NULL DEFAULT false,
  equipe_b_payee     boolean     NOT NULL DEFAULT false,
  gagnant_id         uuid        REFERENCES equipes(id),
  resultat           text,                           -- 'victoire', 'egalite', 'forfait', 'expire'
  commission_centimes bigint,
  cree_par           uuid        NOT NULL REFERENCES joueurs(id),
  rejoindre_avant    timestamptz NOT NULL,           -- délai pour trouver un adversaire
  courir_avant       timestamptz,                    -- délai pour courir, fixé au feu vert
  cree_le            timestamptz NOT NULL DEFAULT now(),
  termine_le         timestamptz
);
CREATE INDEX duels_statut ON duels (statut);

CREATE TABLE courses (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  joueur_id          uuid        NOT NULL REFERENCES joueurs(id),
  circuit_id         uuid        NOT NULL REFERENCES circuits(id),
  duel_id            uuid        REFERENCES duels(id),
  temps_ms           int         NOT NULL,
  intervalle_ms      int         NOT NULL,
  trajet             jsonb       NOT NULL,           -- [[x,y,z,pitch,yaw,roll], ...]
  valide             boolean     NOT NULL,
  motif_rejet        text,
  cree_le            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX courses_classement ON courses (circuit_id, valide, temps_ms);
-- Une seule course par joueur et par duel : la première envoyée compte.
CREATE UNIQUE INDEX courses_une_par_duel ON courses (duel_id, joueur_id) WHERE duel_id IS NOT NULL;

-- Heure du "Partez !" d'un joueur dans un duel : un seul départ autorisé,
-- et la course doit arriver juste après. On ne peut pas envoyer un vieil essai d'entraînement.
CREATE TABLE duel_departs (
  duel_id            uuid        NOT NULL REFERENCES duels(id),
  joueur_id          uuid        NOT NULL REFERENCES joueurs(id),
  depart_le          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (duel_id, joueur_id)
);

-- Chaque mouvement d'argent, entrant ou sortant. Sert aussi de journal d'audit.
CREATE TABLE paiements (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  duel_id            uuid        NOT NULL REFERENCES duels(id),
  equipe_id          uuid        NOT NULL REFERENCES equipes(id),
  joueur_id          uuid        NOT NULL REFERENCES joueurs(id),
  sens               text        NOT NULL CHECK (sens IN ('encaissement', 'versement', 'remboursement')),
  montant_centimes   bigint      NOT NULL CHECK (montant_centimes > 0),
  devise             char(3)     NOT NULL,
  fournisseur        text        NOT NULL,
  statut             text        NOT NULL DEFAULT 'en_attente'
                     CHECK (statut IN ('en_attente', 'reussi', 'echoue')),
  reference_externe  text,
  cle_idempotence    text        NOT NULL UNIQUE,
  details            jsonb,
  cree_le            timestamptz NOT NULL DEFAULT now(),
  maj_le             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX paiements_duel ON paiements (duel_id);
CREATE INDEX paiements_reference ON paiements (fournisseur, reference_externe);

-- Tournois par équipes :
--   * Championnat national (« Tournoi Sponsor ») : un par pays. Semaine 1 : qualifications ouvertes,
--     les 16 meilleures équipes (de 4 pilotes) sont retenues. Puis plusieurs semaines de championnat :
--     chaque semaine une course, des points selon le classement. Chaque semaine, les 4 meilleures équipes
--     reçoivent 20 $ chacune (payés par le sponsor, partagés entre les pilotes qui ont couru).
--     À la fin, les 2 premières du pays sont qualifiées pour la Coupe d'Afrique.
--   * Coupe d'Afrique : les qualifiés de 8 pays (16 équipes), à élimination directe :
--     huitièmes, quarts, demi-finales, finale. Un tour par semaine.
-- Temps d'une équipe : somme des meilleurs temps de ses 4 meilleurs pilotes (réglable) (courses valides hors duels,
-- envoyées pendant la semaine, sur le circuit de la semaine). Une équipe incomplète est classée derrière.
SET search_path TO gchallenge;

-- Continent de chaque pays, et pays où les primes peuvent être versées automatiquement.
ALTER TABLE pays ADD COLUMN continent text NOT NULL DEFAULT 'AF';
ALTER TABLE pays ADD COLUMN primes_autorisees boolean NOT NULL DEFAULT false;
UPDATE pays SET continent = 'AS' WHERE code = 'SA';
UPDATE pays SET primes_autorisees = true WHERE code = 'CD';

INSERT INTO pays (code, nom, devise, mises_autorisees, fournisseur, langue, indicatif, continent) VALUES
  ('CG', 'Congo-Brazzaville', 'XAF', false, NULL, 'fr', '242', 'AF'),
  ('AO', 'Angola',            'AOA', false, NULL, 'pt', '244', 'AF'),
  ('CM', 'Cameroun',          'XAF', false, NULL, 'fr', '237', 'AF'),
  ('CI', 'Côte d''Ivoire',    'XOF', false, NULL, 'fr', '225', 'AF'),
  ('SN', 'Sénégal',           'XOF', false, NULL, 'fr', '221', 'AF'),
  ('NG', 'Nigeria',           'NGN', false, NULL, 'en', '234', 'AF'),
  ('GH', 'Ghana',             'GHS', false, NULL, 'en', '233', 'AF'),
  ('KE', 'Kenya',             'KES', false, NULL, 'en', '254', 'AF'),
  ('TZ', 'Tanzanie',          'TZS', false, NULL, 'en', '255', 'AF'),
  ('MZ', 'Mozambique',        'MZN', false, NULL, 'pt', '258', 'AF'),
  ('RW', 'Rwanda',            'RWF', false, NULL, 'fr', '250', 'AF')
ON CONFLICT (code) DO NOTHING;

-- ---------- Championnat national ----------
CREATE TABLE championnats (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pays_code              char(2)     NOT NULL REFERENCES pays(code),
  nom                    text        NOT NULL,
  sponsor                text        NOT NULL,
  premier_lundi          date        NOT NULL,
  nb_equipes             int         NOT NULL DEFAULT 16 CHECK (nb_equipes BETWEEN 2 AND 64),
  taille_equipe          int         NOT NULL DEFAULT 4 CHECK (taille_equipe BETWEEN 1 AND 5),
  nb_qualifies           int         NOT NULL DEFAULT 2 CHECK (nb_qualifies >= 1),
  circuits               text[]      NOT NULL,       -- semaine 1 = qualifications, puis championnat
  primes_centimes        bigint[]    NOT NULL DEFAULT '{2000,2000,2000,2000}', -- par équipe, 1re à 4e
  points                 int[]       NOT NULL DEFAULT '{25,20,16,13,11,10,9,8,7,6,5,4,3,2,1}',
  devise                 char(3)     NOT NULL DEFAULT 'USD',
  statut                 text        NOT NULL DEFAULT 'active' CHECK (statut IN ('active', 'terminee', 'annulee')),
  cree_le                timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE championnat_semaines (
  championnat_id         uuid        NOT NULL REFERENCES championnats(id) ON DELETE CASCADE,
  numero                 int         NOT NULL,
  debut                  timestamptz NOT NULL,
  fin                    timestamptz NOT NULL,
  circuit_id             uuid        NOT NULL REFERENCES circuits(id),
  cloturee_le            timestamptz,
  PRIMARY KEY (championnat_id, numero)
);

-- Les équipes retenues après les qualifications, et leur classement du championnat.
CREATE TABLE championnat_equipes (
  championnat_id         uuid        NOT NULL REFERENCES championnats(id) ON DELETE CASCADE,
  equipe_id              uuid        NOT NULL REFERENCES equipes(id),
  rang_qualification     int         NOT NULL,
  points                 int         NOT NULL DEFAULT 0,
  temps_cumule_ms        bigint      NOT NULL DEFAULT 0,  -- départage à égalité de points
  rang_final             int,
  qualifiee              boolean     NOT NULL DEFAULT false, -- pour la Coupe d'Afrique
  PRIMARY KEY (championnat_id, equipe_id)
);

CREATE TABLE championnat_resultats (
  championnat_id         uuid        NOT NULL,
  numero                 int         NOT NULL,
  equipe_id              uuid        NOT NULL REFERENCES equipes(id),
  temps_ms               int,                        -- NULL : équipe incomplète cette semaine
  nb_pilotes             int         NOT NULL,       -- pilotes qui ont couru (au plus taille_equipe comptés)
  rang                   int         NOT NULL,
  points                 int         NOT NULL DEFAULT 0,
  PRIMARY KEY (championnat_id, numero, equipe_id),
  FOREIGN KEY (championnat_id, numero) REFERENCES championnat_semaines (championnat_id, numero) ON DELETE CASCADE
);

-- ---------- Coupe d'Afrique ----------
CREATE TABLE coupes (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom                    text        NOT NULL,
  sponsor                text        NOT NULL,
  premier_lundi          date        NOT NULL,
  circuits               text[]      NOT NULL,       -- un par tour : huitièmes, quarts, demies, finale
  taille_equipe          int         NOT NULL DEFAULT 4,
  primes_centimes        bigint[]    NOT NULL DEFAULT '{}', -- par équipe : vainqueur, finaliste
  devise                 char(3)     NOT NULL DEFAULT 'USD',
  statut                 text        NOT NULL DEFAULT 'active' CHECK (statut IN ('active', 'terminee', 'annulee')),
  championne_id          uuid        REFERENCES equipes(id),
  cree_le                timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE coupe_tours (
  coupe_id               uuid        NOT NULL REFERENCES coupes(id) ON DELETE CASCADE,
  tour                   int         NOT NULL,       -- 1 = premier tour (huitièmes avec 16 équipes)
  debut                  timestamptz NOT NULL,
  fin                    timestamptz NOT NULL,
  circuit_id             uuid        NOT NULL REFERENCES circuits(id),
  cloture_le             timestamptz,
  PRIMARY KEY (coupe_id, tour)
);

CREATE TABLE coupe_matchs (
  coupe_id               uuid        NOT NULL REFERENCES coupes(id) ON DELETE CASCADE,
  tour                   int         NOT NULL,
  position               int         NOT NULL,       -- 1..n dans le tour ; le vainqueur va au match ceil(n/2) du tour suivant
  equipe_a_id            uuid        REFERENCES equipes(id),
  equipe_b_id            uuid        REFERENCES equipes(id),
  temps_a_ms             int,
  temps_b_ms             int,
  gagnante_id            uuid        REFERENCES equipes(id),
  PRIMARY KEY (coupe_id, tour, position)
);

-- ---------- Primes ----------
-- Une ligne par pilote payé (la prime d'une équipe est partagée entre ses pilotes qui ont couru).
CREATE TABLE primes (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  origine                text        NOT NULL CHECK (origine IN ('championnat', 'coupe')),
  competition_id         uuid        NOT NULL,       -- championnat ou coupe
  numero                 int         NOT NULL,       -- semaine du championnat, ou tour de la coupe
  equipe_id              uuid        NOT NULL REFERENCES equipes(id),
  joueur_id              uuid        NOT NULL REFERENCES joueurs(id),
  rang                   int         NOT NULL,
  montant_centimes       bigint      NOT NULL CHECK (montant_centimes > 0),
  devise                 char(3)     NOT NULL,
  fournisseur            text,
  statut                 text        NOT NULL DEFAULT 'en_attente'
                         CHECK (statut IN ('en_attente', 'reussi', 'echoue', 'a_verser_manuellement')),
  reference_externe      text,
  details                jsonb,
  cree_le                timestamptz NOT NULL DEFAULT now(),
  maj_le                 timestamptz NOT NULL DEFAULT now(),
  UNIQUE (origine, competition_id, numero, joueur_id)
);

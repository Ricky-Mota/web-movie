-- Tournois : le Tournoi Sponsor hebdomadaire (18 sélectionnés, éliminations, primes M-Pesa)
-- et le Tournoi international (pays africains, champion continental).
SET search_path TO gchallenge;

-- Continent de chaque pays : le Tournoi international est réservé à l'Afrique.
-- primes_autorisees : les primes de tournoi (payées par le sponsor, sans mise du joueur)
-- peuvent être versées automatiquement dans ce pays. Sinon, elles sont versées à la main.
ALTER TABLE pays ADD COLUMN continent text NOT NULL DEFAULT 'AF';
ALTER TABLE pays ADD COLUMN primes_autorisees boolean NOT NULL DEFAULT false;
UPDATE pays SET continent = 'AS' WHERE code = 'SA';
UPDATE pays SET primes_autorisees = true WHERE code = 'CD';

-- Autres pays africains pour le Tournoi international (jeu gratuit, sans mises,
-- primes versées à la main tant qu'aucun fournisseur de paiement n'est branché).
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

-- Une saison du Tournoi Sponsor.
-- Semaine 1 : qualifications ouvertes à tous ; les nb_qualifies meilleurs temps sont sélectionnés.
-- Semaines suivantes : seuls les sélectionnés encore en lice courent ; à la fin de la semaine k+1,
-- les eliminations[k] derniers sont éliminés. La dernière semaine désigne le champion.
-- Chaque semaine, les meilleurs reçoivent primes_centimes[1..n] (1er, 2e, 3e...) via M-Pesa.
CREATE TABLE saisons_sponsor (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom                    text        NOT NULL,
  sponsor                text        NOT NULL,
  premier_lundi          date        NOT NULL,
  nb_qualifies           int         NOT NULL DEFAULT 18 CHECK (nb_qualifies BETWEEN 2 AND 200),
  eliminations           int[]       NOT NULL DEFAULT '{6,4,4,3}',
  primes_centimes        bigint[]    NOT NULL DEFAULT '{5000,3000,2000}',
  prime_champion_centimes bigint     NOT NULL DEFAULT 0 CHECK (prime_champion_centimes >= 0),
  devise                 char(3)     NOT NULL DEFAULT 'USD',
  circuits               text[]      NOT NULL,       -- code du circuit de chaque semaine
  statut                 text        NOT NULL DEFAULT 'active' CHECK (statut IN ('active', 'terminee', 'annulee')),
  champion_id            uuid        REFERENCES joueurs(id),
  cree_le                timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE semaines_sponsor (
  saison_id              uuid        NOT NULL REFERENCES saisons_sponsor(id) ON DELETE CASCADE,
  numero                 int         NOT NULL,
  debut                  timestamptz NOT NULL,
  fin                    timestamptz NOT NULL,
  circuit_id             uuid        NOT NULL REFERENCES circuits(id),
  cloturee_le            timestamptz,
  PRIMARY KEY (saison_id, numero)
);
CREATE INDEX semaines_a_cloturer ON semaines_sponsor (fin) WHERE cloturee_le IS NULL;

-- Les joueurs sélectionnés à la fin de la semaine 1.
CREATE TABLE saison_joueurs (
  saison_id              uuid        NOT NULL REFERENCES saisons_sponsor(id) ON DELETE CASCADE,
  joueur_id              uuid        NOT NULL REFERENCES joueurs(id),
  rang_qualification     int         NOT NULL,
  elimine_semaine        int,                        -- NULL : encore en lice
  PRIMARY KEY (saison_id, joueur_id)
);

-- Classement figé de chaque semaine clôturée.
CREATE TABLE resultats_semaine (
  saison_id              uuid        NOT NULL,
  numero                 int         NOT NULL,
  joueur_id              uuid        NOT NULL REFERENCES joueurs(id),
  temps_ms               int,                        -- NULL : n'a pas couru cette semaine
  rang                   int         NOT NULL,
  elimine                boolean     NOT NULL DEFAULT false,
  PRIMARY KEY (saison_id, numero, joueur_id),
  FOREIGN KEY (saison_id, numero) REFERENCES semaines_sponsor (saison_id, numero) ON DELETE CASCADE
);

-- Primes versées aux meilleurs de chaque semaine (et au champion). Journal d'audit.
CREATE TABLE primes (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  saison_id              uuid        NOT NULL REFERENCES saisons_sponsor(id),
  numero                 int         NOT NULL,       -- semaine ; 0 = prime du champion
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
  UNIQUE (saison_id, numero, rang)
);

-- Montants des primes réglables depuis l'espace administrateur (/espace-admin), sans redémarrer.
-- Ils servent de valeurs par défaut aux championnats et coupes créés ensuite ;
-- les primes de la Coupe d'Afrique en cours sont aussi mises à jour.
SET search_path TO gchallenge;

ALTER TABLE parametres ADD COLUMN prime_semaine_centimes bigint NOT NULL DEFAULT 2000 CHECK (prime_semaine_centimes >= 0);
ALTER TABLE parametres ADD COLUMN nb_equipes_primees int NOT NULL DEFAULT 4 CHECK (nb_equipes_primees BETWEEN 0 AND 16);
ALTER TABLE parametres ADD COLUMN coupe_prime_championne_centimes bigint NOT NULL DEFAULT 0 CHECK (coupe_prime_championne_centimes >= 0);
ALTER TABLE parametres ADD COLUMN coupe_prime_finaliste_centimes bigint NOT NULL DEFAULT 0 CHECK (coupe_prime_finaliste_centimes >= 0);

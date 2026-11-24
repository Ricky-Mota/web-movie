-- 2 Life : base de données (Cloudflare D1, SQLite)
-- Les 12 registres du cahier des charges. Les dates sont en millisecondes (Date.now()).

CREATE TABLE IF NOT EXISTS comptes (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  pseudo TEXT NOT NULL,
  pass_hash TEXT NOT NULL,
  pass_salt TEXT NOT NULL,
  cree_le INTEGER NOT NULL,
  acces_paye INTEGER NOT NULL DEFAULT 0,   -- entrée payante : formule à décider
  reputation INTEGER NOT NULL DEFAULT 0,
  vie_id TEXT                                -- personnage actuel
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  compte_id TEXT NOT NULL REFERENCES comptes(id),
  expire_le INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS villes (
  id TEXT PRIMARY KEY,
  nom TEXT NOT NULL,
  pays TEXT NOT NULL
);
INSERT OR IGNORE INTO villes (id, nom, pays) VALUES ('kinshasa', 'Kinshasa', 'RDC');

CREATE TABLE IF NOT EXISTS personnages (
  id TEXT PRIMARY KEY,
  compte_id TEXT REFERENCES comptes(id),     -- NULL = personnage géré par le jeu
  ville_id TEXT NOT NULL REFERENCES villes(id),
  prenom TEXT NOT NULL,
  nom TEXT NOT NULL,
  sexe TEXT NOT NULL CHECK (sexe IN ('F', 'M')),
  quartier TEXT,
  apparence INTEGER NOT NULL DEFAULT 0,
  ne_le INTEGER NOT NULL,
  mort_le INTEGER,
  cause_mort TEXT,
  sante REAL NOT NULL DEFAULT 100,
  faim REAL NOT NULL DEFAULT 100,
  energie REAL NOT NULL DEFAULT 100,
  bonheur REAL NOT NULL DEFAULT 80,
  maj_le INTEGER NOT NULL,                   -- dernière mise à jour des besoins
  makuta INTEGER NOT NULL DEFAULT 0,         -- solde, toujours égal à la somme du grand livre
  pere_id TEXT, mere_id TEXT, conjoint_id TEXT,
  pere_nom TEXT, mere_nom TEXT,              -- noms des parents (joueurs ou gérés par le jeu)
  accueille_enfants INTEGER NOT NULL DEFAULT 0,  -- accepte qu'un nouveau joueur naisse chez lui
  entretien_le INTEGER,                      -- dernier entretien versé par le parent joueur
  fondateur INTEGER NOT NULL DEFAULT 0,      -- parent fondateur ajouté par l'administrateur
  credit INTEGER NOT NULL DEFAULT 0,        -- crédit téléphone (makuta)
  operateur TEXT, assureur TEXT, assure_jusqu INTEGER,
  prison_jusqu INTEGER,                      -- en prison jusqu'à cette date
  consignes_le INTEGER                       -- dernière application des consignes du jour
);

CREATE TABLE IF NOT EXISTS talents (
  id TEXT PRIMARY KEY,
  nom TEXT NOT NULL
);
INSERT OR IGNORE INTO talents (id, nom) VALUES
  ('soin','Soin'),('commerce','Commerce'),('sport','Sport'),('art','Art'),
  ('technique','Technique'),('etudes','Études'),('parole','Parole'),('cuisine','Cuisine');

CREATE TABLE IF NOT EXISTS talents_personnage (
  personnage_id TEXT NOT NULL REFERENCES personnages(id),
  talent_id TEXT NOT NULL REFERENCES talents(id),
  niveau INTEGER NOT NULL,
  decouvert INTEGER NOT NULL DEFAULT 0,
  decouvert_par TEXT,
  decouvert_le INTEGER,
  indices INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (personnage_id, talent_id)
);

CREATE TABLE IF NOT EXISTS maladies (id TEXT PRIMARY KEY, nom TEXT NOT NULL, gravite INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS maladies_personnage (
  id TEXT PRIMARY KEY, personnage_id TEXT NOT NULL, maladie_id TEXT NOT NULL,
  debut INTEGER NOT NULL, gravite REAL NOT NULL, soignee_le INTEGER
);

CREATE TABLE IF NOT EXISTS formations (id TEXT PRIMARY KEY, nom TEXT NOT NULL, duree_ans REAL NOT NULL, prerequis TEXT);
CREATE TABLE IF NOT EXISTS diplomes_obtenus (personnage_id TEXT NOT NULL, formation_id TEXT NOT NULL, obtenu_le INTEGER NOT NULL, note REAL, PRIMARY KEY (personnage_id, formation_id));

CREATE TABLE IF NOT EXISTS metiers (id TEXT PRIMARY KEY, nom TEXT NOT NULL, diplome_requis TEXT, talent_lie TEXT, salaire_base INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS emplois (id TEXT PRIMARY KEY, personnage_id TEXT NOT NULL, metier_id TEXT NOT NULL, entreprise_id TEXT, poste TEXT, salaire INTEGER NOT NULL, depuis INTEGER NOT NULL, fin INTEGER);

CREATE TABLE IF NOT EXISTS objets (id TEXT PRIMARY KEY, nom TEXT NOT NULL, type TEXT NOT NULL, prix INTEGER NOT NULL);
-- objet_id = identifiant du catalogue SHOP (server/src/life.js) ; porte = vêtement actuellement porté
CREATE TABLE IF NOT EXISTS possessions (id TEXT PRIMARY KEY, proprietaire_id TEXT NOT NULL, objet_id TEXT NOT NULL, etat REAL NOT NULL DEFAULT 100, acquis_le INTEGER NOT NULL, porte INTEGER NOT NULL DEFAULT 0);

CREATE TABLE IF NOT EXISTS entreprises (id TEXT PRIMARY KEY, nom TEXT NOT NULL, type TEXT NOT NULL, proprietaire_id TEXT NOT NULL, ville_id TEXT NOT NULL, local TEXT, capital INTEGER NOT NULL DEFAULT 0, cree_le INTEGER NOT NULL,
  caisse INTEGER NOT NULL DEFAULT 0,   -- recettes pas encore encaissées par le patron
  maj_le INTEGER,                      -- dernier calcul de la caisse
  en_vente INTEGER);                   -- prix demandé (makuta) si le patron vend, sinon NULL

CREATE TABLE IF NOT EXISTS annonces (id TEXT PRIMARY KEY, vendeur_id TEXT NOT NULL, possession_id TEXT NOT NULL, prix INTEGER NOT NULL, statut TEXT NOT NULL DEFAULT 'ouverte', cree_le INTEGER NOT NULL);

-- grand livre : chaque e-makuta qui bouge, jamais modifié ni effacé
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  de_id TEXT,                                -- NULL = la ville / le jeu
  vers_id TEXT,
  montant INTEGER NOT NULL CHECK (montant > 0),
  motif TEXT NOT NULL,
  le INTEGER NOT NULL
);
CREATE TRIGGER IF NOT EXISTS transactions_pas_de_modif BEFORE UPDATE ON transactions BEGIN SELECT RAISE(ABORT, 'grand livre en lecture seule'); END;
CREATE TRIGGER IF NOT EXISTS transactions_pas_d_effacement BEFORE DELETE ON transactions BEGIN SELECT RAISE(ABORT, 'grand livre en lecture seule'); END;

CREATE TABLE IF NOT EXISTS successions (id TEXT PRIMARY KEY, defunt_id TEXT NOT NULL, heritier_id TEXT, part TEXT NOT NULL, montant INTEGER NOT NULL, le INTEGER NOT NULL);

-- journal des activités (indices de talents)
CREATE TABLE IF NOT EXISTS activites (id TEXT PRIMARY KEY, personnage_id TEXT NOT NULL, activite TEXT NOT NULL, score INTEGER, resultat TEXT, le INTEGER NOT NULL);

-- argent réel : entrées payantes et investissements. simule = 1 tant que l'argent réel n'est pas autorisé.
CREATE TABLE IF NOT EXISTS depots (
  id TEXT PRIMARY KEY,
  compte_id TEXT NOT NULL REFERENCES comptes(id),
  offre TEXT NOT NULL,                       -- bebe, parent, petit, grand
  usd REAL NOT NULL,
  makuta INTEGER NOT NULL DEFAULT 0,         -- e-makuta crédités (0 pour un simple droit d'entrée)
  simule INTEGER NOT NULL DEFAULT 1,
  le INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS retraits (
  id TEXT PRIMARY KEY,
  compte_id TEXT NOT NULL REFERENCES comptes(id),
  makuta INTEGER NOT NULL,
  usd REAL NOT NULL,
  statut TEXT NOT NULL DEFAULT 'demande',    -- demande, paye, refuse
  simule INTEGER NOT NULL DEFAULT 1,
  le INTEGER NOT NULL
);

-- formation en cours (une seule à la fois) ; les diplômes obtenus vont dans diplomes_obtenus
CREATE TABLE IF NOT EXISTS inscriptions (
  personnage_id TEXT PRIMARY KEY REFERENCES personnages(id),
  formation_id TEXT NOT NULL,
  annee INTEGER NOT NULL DEFAULT 1,
  cours INTEGER NOT NULL DEFAULT 0,
  points INTEGER NOT NULL DEFAULT 0,
  dernier INTEGER,
  depuis INTEGER NOT NULL
);

-- état du jeu (clé / valeur) : demarre_le = date du lancement
CREATE TABLE IF NOT EXISTS jeu (cle TEXT PRIMARY KEY, valeur TEXT);

-- l'État et les services (impôts, banques, assurances, téléphone, élections)
CREATE TABLE IF NOT EXISTS comptes_banque (personnage_id TEXT NOT NULL, banque_id TEXT NOT NULL, solde INTEGER NOT NULL DEFAULT 0 CHECK (solde >= 0), maj_le INTEGER NOT NULL, PRIMARY KEY (personnage_id, banque_id));
CREATE TABLE IF NOT EXISTS candidatures (personnage_id TEXT PRIMARY KEY, poste TEXT NOT NULL, le INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS votes (electeur_id TEXT NOT NULL, poste TEXT NOT NULL, cycle INTEGER NOT NULL, candidat_id TEXT NOT NULL, le INTEGER NOT NULL, PRIMARY KEY (electeur_id, poste, cycle));
CREATE TABLE IF NOT EXISTS mandats (personnage_id TEXT NOT NULL, poste TEXT NOT NULL, cycle INTEGER NOT NULL, voix INTEGER NOT NULL, debut INTEGER NOT NULL, fin INTEGER);
CREATE TABLE IF NOT EXISTS infractions (id TEXT PRIMARY KEY, personnage_id TEXT NOT NULL, type TEXT NOT NULL, amende INTEGER NOT NULL, prison_heures INTEGER NOT NULL DEFAULT 0, le INTEGER NOT NULL);

-- consignes du jour : ce que le joueur réel demande à son personnage (limité par jour)
CREATE TABLE IF NOT EXISTS consignes (
  personnage_id TEXT NOT NULL,
  jour TEXT NOT NULL,             -- date de Kinshasa, AAAA-MM-JJ
  ordre TEXT NOT NULL,
  donnee_le INTEGER NOT NULL,
  PRIMARY KEY (personnage_id, jour, ordre)
);
CREATE TABLE IF NOT EXISTS consignes_journal (
  id TEXT PRIMARY KEY,
  personnage_id TEXT NOT NULL,
  jour TEXT NOT NULL,
  ordre TEXT NOT NULL,
  ok INTEGER NOT NULL,
  message TEXT NOT NULL,
  le INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_consignes_jour ON consignes (jour);
CREATE INDEX IF NOT EXISTS idx_journal_perso ON consignes_journal (personnage_id, jour);

-- tous les mouvements du personnage, visibles par le joueur réel (actions du joueur et des consignes)
CREATE TABLE IF NOT EXISTS mouvements (
  id TEXT PRIMARY KEY,
  personnage_id TEXT NOT NULL,
  icone TEXT NOT NULL,
  texte TEXT NOT NULL,
  par_consigne INTEGER NOT NULL DEFAULT 0,
  le INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mouvements_perso ON mouvements (personnage_id, le);

-- notifications sur le téléphone (Web Push) : un abonnement par navigateur
CREATE TABLE IF NOT EXISTS abonnements_push (
  endpoint TEXT PRIMARY KEY,
  compte_id TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  cree_le INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_push_compte ON abonnements_push (compte_id);

-- alertes envoyées aux parents (une par enfant, par type et par jour)
CREATE TABLE IF NOT EXISTS alertes (
  personnage_id TEXT NOT NULL,
  compte_id TEXT NOT NULL,
  type TEXT NOT NULL,
  jour TEXT NOT NULL,
  PRIMARY KEY (personnage_id, compte_id, type, jour)
);

-- bureau Zboss Sarlu : problèmes signalés par les joueurs depuis le guichet d'aide du jeu
CREATE TABLE IF NOT EXISTS support_demandes (
  id TEXT PRIMARY KEY,
  compte_id TEXT,
  pseudo TEXT,
  email TEXT,
  categorie TEXT NOT NULL,
  message TEXT NOT NULL,
  page TEXT,
  statut TEXT NOT NULL DEFAULT 'ouvert',
  cree_le INTEGER NOT NULL,
  resolu_le INTEGER
);
CREATE INDEX IF NOT EXISTS support_statut ON support_demandes (statut, cree_le);

-- liste d'attente bêta (formulaire « Réserver ma place » de l'accueil)
CREATE TABLE IF NOT EXISTS beta_inscrits (
  id TEXT PRIMARY KEY,
  pseudo TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  pays TEXT,
  plateforme TEXT,
  newsletter INTEGER NOT NULL DEFAULT 0,
  source TEXT,
  cree_le INTEGER NOT NULL
);

-- négligence : jours d'entretien impayés (cumulés). L'enfant s'en souvient toute sa vie.
CREATE TABLE IF NOT EXISTS negligences (personnage_id TEXT PRIMARY KEY, jours INTEGER NOT NULL DEFAULT 0, maj_le INTEGER NOT NULL);
-- 20 % de la fortune d'un mort, gardés par le joueur pour sa prochaine vie
CREATE TABLE IF NOT EXISTS reports (compte_id TEXT PRIMARY KEY, makuta INTEGER NOT NULL, de_id TEXT, le INTEGER NOT NULL);

-- réputation de chaque personnage (−100 à +100)
CREATE TABLE IF NOT EXISTS reputations (personnage_id TEXT PRIMARY KEY, points INTEGER NOT NULL DEFAULT 0, maj_le INTEGER NOT NULL);
-- demandes en mariage entre joueurs
CREATE TABLE IF NOT EXISTS demandes_mariage (id TEXT PRIMARY KEY, de_id TEXT NOT NULL, vers_id TEXT NOT NULL, statut TEXT NOT NULL DEFAULT 'attente', le INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_mariage_vers ON demandes_mariage (vers_id, statut);

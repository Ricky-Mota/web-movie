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

-- logement : location (loyer chaque semaine) ou parcelle achetée
CREATE TABLE IF NOT EXISTS logements (personnage_id TEXT PRIMARY KEY, statut TEXT NOT NULL, quartier TEXT NOT NULL, loyer INTEGER NOT NULL DEFAULT 0, paye_jusqu INTEGER, depuis INTEGER NOT NULL);

-- réglages en direct de l'administrateur (multiplicateurs : prix, salaires, faim, vol, police, destin)
CREATE TABLE IF NOT EXISTS reglages (cle TEXT PRIMARY KEY, valeur REAL NOT NULL, maj_le INTEGER NOT NULL);

-- origine du personnage : classe sociale de naissance, arrivée adulte (décidée par le jeu) et maturité
CREATE TABLE IF NOT EXISTS origines (personnage_id TEXT PRIMARY KEY, classe TEXT NOT NULL, adulte INTEGER NOT NULL DEFAULT 0, maturite INTEGER NOT NULL DEFAULT 100, arrive_le INTEGER NOT NULL, caractere TEXT, role TEXT, camp TEXT);

-- guichet : dépôts et retraits avec moyen de paiement (numéro masqué, jamais complet). simule = 1 tant que l'argent réel n'est pas autorisé.
-- statut : simule, en_attente (passerelle), traitement, paye, echoue.
CREATE TABLE IF NOT EXISTS guichet (id TEXT PRIMARY KEY, compte_id TEXT NOT NULL, personnage_id TEXT, ref_partenaire TEXT, sens TEXT NOT NULL, moyen TEXT NOT NULL, numero TEXT, usd REAL NOT NULL, makuta INTEGER NOT NULL, statut TEXT NOT NULL DEFAULT 'simule', simule INTEGER NOT NULL DEFAULT 1, le INTEGER NOT NULL);

-- fidélité : série de jours de consignes, dernière visite (résumé de la nuit)
CREATE TABLE IF NOT EXISTS fidelite (
  compte_id TEXT PRIMARY KEY,
  serie INTEGER NOT NULL DEFAULT 0,
  meilleure INTEGER NOT NULL DEFAULT 0,
  dernier_jour TEXT,
  resume_vu_le INTEGER,
  makuta_vu INTEGER
);

-- petits mots entre joueurs (courts, sans lien ni numéro) ; signale = 1 si le destinataire le signale à l'administration
CREATE TABLE IF NOT EXISTS mots (
  id TEXT PRIMARY KEY,
  de_id TEXT NOT NULL,
  vers_id TEXT NOT NULL,
  texte TEXT NOT NULL,
  le INTEGER NOT NULL,
  lu INTEGER NOT NULL DEFAULT 0,
  signale INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_mots_vers ON mots (vers_id, le);
CREATE INDEX IF NOT EXISTS idx_mots_de ON mots (de_id, le);

-- annonces payantes des commerçants partenaires (journal, panneaux LED) ; accord = contrat écrit signé
CREATE TABLE IF NOT EXISTS pubs (
  id TEXT PRIMARY KEY,
  annonceur TEXT NOT NULL,
  titre TEXT NOT NULL,
  texte TEXT,
  commune TEXT,
  emplacement TEXT NOT NULL,
  couleur TEXT,
  debut INTEGER NOT NULL,
  fin INTEGER NOT NULL,
  prix_usd REAL NOT NULL DEFAULT 0,
  paye INTEGER NOT NULL DEFAULT 0,
  accord INTEGER NOT NULL DEFAULT 0,
  actif INTEGER NOT NULL DEFAULT 1,
  cree_le INTEGER NOT NULL
);

-- salaires publics dus quand la caisse de l'État (ou de la société publique) était vide
CREATE TABLE IF NOT EXISTS arrieres (
  id TEXT PRIMARY KEY,
  personnage_id TEXT NOT NULL,
  payeur_id TEXT NOT NULL,
  montant INTEGER NOT NULL,
  motif TEXT NOT NULL,
  le INTEGER NOT NULL,
  paye_le INTEGER
);
CREATE INDEX IF NOT EXISTS arrieres_dus ON arrieres (paye_le, le);

-- objectifs de vie choisis par le joueur (3 en cours au plus)
CREATE TABLE IF NOT EXISTS objectifs (
  personnage_id TEXT NOT NULL,
  objectif_id TEXT NOT NULL,
  choisi_le INTEGER NOT NULL,
  atteint_le INTEGER,
  PRIMARY KEY (personnage_id, objectif_id)
);

-- communiqués du bandeau défilant : décisions publiques et messages des partenaires (accord écrit obligatoire)
CREATE TABLE IF NOT EXISTS communiques (
  id TEXT PRIMARY KEY,
  auteur TEXT NOT NULL,
  texte TEXT NOT NULL,
  debut INTEGER NOT NULL,
  fin INTEGER NOT NULL,
  accord INTEGER NOT NULL DEFAULT 0,
  actif INTEGER NOT NULL DEFAULT 1,
  cree_le INTEGER NOT NULL
);

-- train de vie : niveau choisi (ou « auto »), présentation (tenue) et vitalité, dernière journée de dépenses
CREATE TABLE IF NOT EXISTS train_de_vie (
  personnage_id TEXT PRIMARY KEY,
  niveau TEXT NOT NULL DEFAULT 'auto',
  tenue INTEGER NOT NULL DEFAULT 40,
  vitalite INTEGER NOT NULL DEFAULT 50,
  dernier_jour TEXT,
  dernier_niveau TEXT,
  depense_jour INTEGER NOT NULL DEFAULT 0,
  maj_le INTEGER NOT NULL
);

-- campagnes publicitaires : une entreprise de joueur paie un ambassadeur pour se faire connaître
CREATE TABLE IF NOT EXISTS campagnes (
  id TEXT PRIMARY KEY,
  entreprise_id TEXT NOT NULL,
  ambassadeur_id TEXT NOT NULL,
  prix_jour INTEGER NOT NULL,
  jours INTEGER NOT NULL,
  slogan TEXT,
  debut INTEGER NOT NULL,
  fin INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS campagnes_fin ON campagnes (fin);

-- championnat de Kinshasa : un match par jour pour chaque club (clubs des joueurs + clubs du jeu)
CREATE TABLE IF NOT EXISTS matchs (
  id TEXT PRIMARY KEY,
  saison TEXT NOT NULL,
  jour TEXT NOT NULL,
  dom_id TEXT NOT NULL,
  dom_nom TEXT NOT NULL,
  ext_id TEXT NOT NULL,
  ext_nom TEXT NOT NULL,
  buts_dom INTEGER NOT NULL,
  buts_ext INTEGER NOT NULL,
  buteurs TEXT,
  le INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS matchs_saison ON matchs (saison, jour);

-- logos des partenaires qui défilent à côté de « EN DIRECT » (accord écrit signé obligatoire)
CREATE TABLE IF NOT EXISTS partenaires_logos (
  id TEXT PRIMARY KEY,
  nom TEXT NOT NULL,
  logo TEXT NOT NULL,
  debut INTEGER NOT NULL,
  fin INTEGER NOT NULL,
  accord INTEGER NOT NULL DEFAULT 1,
  actif INTEGER NOT NULL DEFAULT 1,
  cree_le INTEGER NOT NULL
);

-- garde-fou des paiements : dans un lot (transaction), « INSERT OR REPLACE INTO garde VALUES (1, changes()) » juste après
-- un débit « ... AND makuta >= ? » annule tout le lot si le débit n'a pas eu lieu (solde insuffisant, double clic)
CREATE TABLE IF NOT EXISTS garde (
  id INTEGER PRIMARY KEY,
  ok INTEGER NOT NULL CHECK (ok = 1)
);

-- blessure d'un accident de la route (ville 3D) : bloque le travail jusqu'aux soins payants
CREATE TABLE IF NOT EXISTS blessures (
  personnage_id TEXT PRIMARY KEY,
  le INTEGER NOT NULL,
  vitesse INTEGER NOT NULL,
  cause TEXT NOT NULL DEFAULT 'accident'
);

-- campagne électorale : programme, soutien gagné aux meetings, caution versée à la CENI
CREATE TABLE IF NOT EXISTS campagnes_elec (
  personnage_id TEXT PRIMARY KEY,
  poste TEXT NOT NULL,
  programme TEXT NOT NULL,
  soutien INTEGER NOT NULL DEFAULT 0,
  dernier_jour TEXT,
  depense INTEGER NOT NULL DEFAULT 0,
  caution INTEGER NOT NULL DEFAULT 0,
  le INTEGER NOT NULL
);
-- résultats publiés de chaque élection (voix des joueurs + voix des habitants)
CREATE TABLE IF NOT EXISTS resultats_elections (
  cycle INTEGER NOT NULL,
  poste TEXT NOT NULL,
  personnage_id TEXT NOT NULL,
  nom TEXT NOT NULL,
  voix INTEGER NOT NULL,
  voix_joueurs INTEGER NOT NULL,
  pct REAL NOT NULL,
  elu INTEGER NOT NULL,
  le INTEGER NOT NULL,
  PRIMARY KEY (cycle, poste, personnage_id)
);

-- Parlement (pouvoirs des élus, 25/11) : projets de loi déposés par le gouvernement du Président, votés par les députés et les sénateurs
CREATE TABLE IF NOT EXISTS lois (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  titre TEXT NOT NULL,
  contenu TEXT NOT NULL,
  auteur_id TEXT NOT NULL,
  statut TEXT NOT NULL DEFAULT 'vote',   -- vote, adoptee, rejetee
  depot INTEGER NOT NULL,
  fin_vote INTEGER NOT NULL,
  resultat TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS lois_un_seul_vote ON lois (statut) WHERE statut = 'vote';
CREATE TABLE IF NOT EXISTS votes_lois (
  loi_id TEXT NOT NULL,
  personnage_id TEXT NOT NULL,
  chambre TEXT NOT NULL,
  choix TEXT NOT NULL,
  le INTEGER NOT NULL,
  PRIMARY KEY (loi_id, personnage_id)
);

-- dîme et offrandes aux pasteurs joueurs (reçu public dans le journal)
CREATE TABLE IF NOT EXISTS offrandes (id TEXT PRIMARY KEY, de_id TEXT NOT NULL, vers_id TEXT NOT NULL, type TEXT NOT NULL, montant INTEGER NOT NULL, recu TEXT NOT NULL, le INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS offrandes_le ON offrandes (le);
CREATE INDEX IF NOT EXISTS offrandes_de ON offrandes (de_id, type, le);
-- visites sur place : culte, concert, match d'une célébrité
CREATE TABLE IF NOT EXISTS assistances (id TEXT PRIMARY KEY, personnage_id TEXT NOT NULL, celeb_id TEXT NOT NULL, lieu TEXT NOT NULL, prix INTEGER NOT NULL, le INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS assistances_p ON assistances (personnage_id, le);
-- pensée du jour du personnage (écrite par la petite IA ou par les règles), une par jour
CREATE TABLE IF NOT EXISTS pensees (personnage_id TEXT NOT NULL, jour TEXT NOT NULL, texte TEXT NOT NULL, source TEXT NOT NULL, le INTEGER NOT NULL, PRIMARY KEY (personnage_id, jour));
-- code de la route : contraventions (feu rouge, vitesse, contrôle) et points retirés du permis
CREATE TABLE IF NOT EXISTS permis_points (id TEXT PRIMARY KEY, personnage_id TEXT NOT NULL, type TEXT NOT NULL, points INTEGER NOT NULL, amende INTEGER NOT NULL, le INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS permis_points_p ON permis_points (personnage_id, le);

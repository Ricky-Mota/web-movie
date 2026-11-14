-- Pays de lancement. Les mises ne sont ouvertes qu'en RDC (validation juridique faite).
-- Pour les autres pays : jeu gratuit avec classement, jusqu'à validation juridique locale.
-- Arabie saoudite : les jeux d'argent y sont interdits, ne pas activer les mises.
SET search_path TO gchallenge;

INSERT INTO pays (code, nom, devise, mises_autorisees, fournisseur, langue, indicatif) VALUES
  ('CD', 'République démocratique du Congo', 'USD', true,  'mpesa_rdc', 'fr', '243'),
  ('ZM', 'Zambie',                           'ZMW', false, NULL,        'en', '260'),
  ('ZW', 'Zimbabwe',                         'USD', false, NULL,        'en', '263'),
  ('ZA', 'Afrique du Sud',                   'ZAR', false, NULL,        'en', '27'),
  ('SA', 'Arabie saoudite',                  'SAR', false, NULL,        'ar', '966')
ON CONFLICT (code) DO NOTHING;

# Professa-M : base de données Supabase

Projet Supabase : `professa-M` (région `eu-west-3`, Paris).

## Migrations (`migrations/`)

Elles sont déjà appliquées sur le projet et sont copiées ici à l'identique pour garder l'historique dans Git.

| Fichier | Contenu |
| --- | --- |
| `20261109200606_foundation.sql` | Centres, profils (responsable / enseignant), fonctions d'accès |
| `20261109200646_pedagogy_studio.sql` | Parcours, modules, épisodes, scènes, répliques, exercices, personnages, décors, fichiers |
| `20261109200705_commerce_credits.sql` | Offres, paiements, productions, journal des crédits (ajout seul), soldes |
| `20261109200752_workflow.sql` | Parcours de validation, réservation / remboursement des crédits |
| `20261109200755_rls.sql` | Règles RLS : chaque centre ne voit que ses données |

## Tests critiques (`tests/`)

`critical_rls_and_credits.sql` vérifie la séparation des centres et le décompte des crédits.
Collez-le dans l'éditeur SQL de Supabase et lancez-le : le résultat attendu est le message
`RESULTAT : 22 tests réussis (données de test annulées)`. Aucune donnée n'est conservée.

# Zboss-speed — landing page et mini CRM

Site statique (HTML, CSS, JavaScript, sans dépendance ni étape de build) pour présenter le jeu et recueillir les inscriptions à la bêta.

| Fichier | Rôle |
|---|---|
| `index.html` | Landing page : héros, gameplay, fonctionnalités, galerie, formulaire bêta, réseaux sociaux |
| `crm.html` | Mini CRM de l'équipe : liste des inscrits, recherche, filtres, statut, notes, export CSV |
| `config.js` | URL et clé publique Supabase (vide = mode démo) |
| `assets/store.js` | Enregistrement et lecture des inscrits (Supabase ou mode démo) |
| `supabase/schema.sql` | Table, règles de sécurité (RLS) et liste des administrateurs |
| `netlify.toml` | Publication du dossier sur Netlify |

## Essayer tout de suite (mode démo)

Ouvre `index.html` dans un navigateur, inscris-toi, puis ouvre `crm.html` : l'inscrit apparaît.
En mode démo, les données restent dans ce navigateur uniquement.

## Brancher Supabase (gratuit)

1. Sur https://supabase.com, ouvre (ou crée) un projet.
2. **SQL Editor** → **New query** → colle le contenu de `supabase/schema.sql` → **Run**.
3. **Authentication** → **Users** → **Add user** → crée ton compte administrateur (e-mail + mot de passe).
   Dans **Authentication** → **Sign In / Providers**, tu peux désactiver « Allow new users to sign up » : seuls les comptes que tu crées pourront se connecter.
4. Retour dans **SQL Editor** : `insert into public.admins (email) values ('ton-email@exemple.com');`
5. **Project Settings** → **API Keys** : copie l'URL du projet et la clé publique (publishable ou `anon`) dans `config.js`.

Ces deux valeurs sont publiques par conception. Les règles RLS garantissent que :
- les visiteurs peuvent seulement **ajouter** une inscription (jamais lire la liste) ;
- seuls les e-mails présents dans `admins` peuvent lire, modifier et supprimer les inscrits.

Un compte connecté qui n'est pas dans `admins` voit une liste vide.

## Mettre en ligne sur Netlify (gratuit)

Le site existant du dépôt publie `public/`. Pour Zboss-speed, crée un **second site** Netlify :
**Add new site** → **Import an existing project** → ce dépôt → **Base directory** : `zboss-speed` → **Deploy**.

## Suivre la provenance des inscrits

Ajoute `?utm_source=tiktok` (ou `discord`, `youtube`…) aux liens que tu partages : la colonne **Source** du CRM l'indique.

## À personnaliser

- Les liens des réseaux sociaux (`data-social` dans `index.html`) pointent vers `#` : remplace-les par tes vraies pages.
- Les visuels de la galerie sont des illustrations provisoires : remplace-les par tes captures Unreal Engine 5 (images de 1600 × 900 conseillées).

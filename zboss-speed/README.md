# Zboss-speed — landing page et mini CRM

Site statique (HTML, CSS, JavaScript, sans dépendance ni étape de build) pour présenter le jeu et recueillir les inscriptions à la bêta.

| Fichier | Rôle |
|---|---|
| `index.html` | Landing page : héros, gameplay, fonctionnalités, galerie, formulaire bêta, réseaux sociaux |
| `jouer.html`, `assets/game.js` | Démo jouable dans le navigateur (conduite, poursuite policière, nitro, score) |
| `crm.html` | Mini CRM de l'équipe : liste des inscrits, recherche, filtres, statut, notes, export CSV |
| `config.js` | URL et clé publique Supabase (vide = mode démo) |
| `assets/store.js` | Enregistrement et lecture des inscrits (Supabase ou mode démo) |
| `assets/cars.js` | Les 6 voitures du garage (dessins SVG originaux et caractéristiques) |
| `assets/sections.js`, `assets/sections.css` | Bande-annonce animée, écran de jeu, garage et partenaires |
| `supabase/schema.sql` | Table, règles de sécurité (RLS) et liste des administrateurs |
| `netlify.toml` | Publication du dossier sur Netlify |

## Essayer tout de suite (mode démo)

Ouvre `index.html` dans un navigateur, inscris-toi, puis ouvre `crm.html` : l'inscrit apparaît.
En mode démo, les données restent dans ce navigateur uniquement.

## Démo jouable

Ouvre `jouer.html` (ou clique sur **Jouer** dans le menu du site).

- **Clavier** : ↑/W accélérer, ↓/S freiner, ←/→ diriger, Espace frein à main (dérapage), Maj nitro, P pause, M son.
- **Mobile** : boutons tactiles à l'écran (mieux en mode paysage).
- **But du jeu** : dépasse 170 km/h devant une patrouille pour déclencher une poursuite. Ta prime grimpe avec le niveau de recherche (1 à 5 : patrouille, renforts, barrages, hélicoptère, unité d'élite). Casse la ligne de vue assez longtemps pour t'évader et encaisser la prime. Si la police t'immobilise ou si ta voiture est détruite, la prime non encaissée est perdue.
- Les frôlements et les dérapages rechargent la nitro. Les records sont gardés sur l'appareil.

Cette démo sert de prototype de gameplay pour le site. Le jeu complet reste prévu sous Unreal Engine 5.

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
- **Partenaires** : Vodacom, Equity BCDC, Bralima et Bracongo sont affichés en texte avec la mention « partenaire pressenti ». N'ajoute leurs logos qu'après un accord écrit de chaque marque (fichiers fournis par elles).
- **Voitures** : les 6 modèles sont des créations originales inspirées de silhouettes et de couleurs. Ne reprends pas de logos, de noms de modèles ou de photos de constructeurs réels sans licence.
- **Personnages** : `assets/models/humans.glb` est généré par `tools/blender_humans.py` à partir du maillage et des cibles MakeHuman/MPFB2 (licence CC0, réutilisation libre). Pour le régénérer : `python tools/blender_humans.py <dossier mpfb/data> assets/models/humans.glb`, puis `gltfpack -c -kn -km -ke`.
- **Bande-annonce** : animée dans la page, avec un son synthétisé et désactivé par défaut. Quand tu auras une vraie vidéo tournée dans Unreal Engine 5 (export MP4 via Movie Render Queue), elle pourra remplacer ce bloc.

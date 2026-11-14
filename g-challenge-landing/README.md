# Landing page – La Course des Ketch

La page publique de la bêta, tirée de la maquette « G-Challenge RDC – Landing page Course des Ketch ». Son formulaire d'inscription alimente le CRM.

## La démo jouable

L'écran de course en haut de la page est jouable, avec deux étapes au choix :

| Étape | Longueur | Ce qui la rend difficile |
| --- | --- | --- |
| 2 · Le Grand Marché | 1,6 km | Rue étroite et sinueuse, étals qui débordent, pousse-pousse, motos, piétons qui traversent |
| 5 · Boulevard du 30 Juin | 2 km | 4 voies, voitures, bus, camions et motos qui changent de voie, montées et descentes |

Dans les deux étapes :
- **Décor** : façades d'immeubles en perspective (tours vitrées sur le boulevard, maisons colorées avec enseignes au marché), lampadaires, palmiers, panneaux publicitaires, abribus, fanions, passants, nuages.
- **Raccourcis** : deux par étape, balisés par un panneau vert. Ils sont plus courts, mais en terre et pleins de nids-de-poule.
- **Circulation et piétons** : on peut percuter les véhicules ; ils klaxonnent quand on arrive trop vite derrière eux. Les piétons traversent aux passages piétons ; en cas de contact, ils s'écartent d'un bond.
- **Équité** : tout est placé et réglé d'avance, de la même façon pour chaque joueur : obstacles, trajets des véhicules, déclenchement des piétons.
- **Son** : moteur avec régime et rapports, turbo, klaxons, chocs, compte à rebours et arrivée. Un bouton coupe le son.
- **Commandes** : clavier, ou boutons tactiles sur téléphone, avec un mode plein écran. Un record personnel est gardé pour chaque étape.

Le code du jeu est dans `src/jeu.js`. Après une modification, réinsérez-le dans la page :

```bash
python3 scripts/assembler.py
```

## Le circuit d'une inscription

1. Un visiteur remplit le formulaire de la landing page : téléphone, pseudo et plateforme.
2. La fonction Netlify (adresse publique `/api/inscription-beta`) vérifie l'inscription :
   - le numéro doit être valide ;
   - les robots sont écartés par un champ piège et un délai minimum de saisie.
3. Le script Apps Script ajoute une ligne dans le Google Sheet **« G-Challenge – Inscriptions bêta »**. Il ignore un numéro déjà inscrit.
4. Dans le **CRM**, onglet Joueurs, le bouton **« Importer les inscriptions bêta »** crée les fiches joueurs avec le statut « Inscrit bêta ».

Colonnes du Sheet, dans l'ordre attendu par le CRM : `Date · Telephone · Pseudo · Plateforme · Source`. La source est lue dans le lien de la page : `?utm_source=whatsapp`, `?utm_source=facebook`… Sans elle, la source vaut `landing`.

## Mise en route (20 minutes, une seule fois)

### 1. Le script dans le Google Sheet

1. Ouvrez le Google Sheet « G-Challenge – Inscriptions bêta », puis **Extensions** et **Apps Script**.
2. Remplacez tout le code par le contenu de `apps-script/Code.gs`, puis enregistrez.
3. **Déployer**, puis **Nouveau déploiement** :
   - type **Application Web** ;
   - « Exécuter en tant que » : **Moi** ;
   - « Qui a accès » : **Tout le monde**.
4. Autorisez l'accès au Sheet quand Google le demande (« Paramètres avancés », puis « Accéder au projet » si Google affiche un avertissement), puis copiez l'**URL de l'application Web** (elle se termine par `/exec`).

Cette adresse sert de clé : rangez-la uniquement dans Netlify (étape 2). Ne la publiez pas et ne la partagez pas : quiconque la connaît peut ajouter des lignes au Sheet.

### 2. L'hébergement : Cloudflare Pages (gratuit, recommandé tant que Netlify est bloqué)

1. Créez un compte gratuit sur [dash.cloudflare.com](https://dash.cloudflare.com).
2. **Workers & Pages**, puis **Create**, onglet **Pages**, puis **Connect to Git**. Autorisez GitHub et choisissez le dépôt `web-movie`.
3. Réglages du projet :
   - Project name : `course-des-ketch` (adresse : `course-des-ketch.pages.dev`)
   - Production branch : `main` (une fois la pull request fusionnée), ou la branche de travail en attendant
   - Framework preset : **None** ; Build command : vide ; Build output directory : `public`
   - **Root directory** (dans « Advanced ») : `g-challenge-landing`
4. **Save and Deploy**.
5. Dans le projet : **Settings**, puis **Variables and Secrets**, ajoutez `APPS_SCRIPT_URL` (type **Secret**) = l'URL copiée à l'étape 1. Puis **Deployments**, et **Retry deployment** sur le dernier déploiement.

Cloudflare lit la fonction dans `functions/api/inscription-beta.js` : même logique que la version Netlify.

### 2 bis. Ou le site Netlify (si vous rajoutez des crédits)

Le site **course-des-ketch** existe déjà dans votre compte Netlify (https://course-des-ketch.netlify.app).

1. Publiez-le depuis le dossier `g-challenge-landing` :

   ```bash
   npx netlify-cli deploy --prod --dir public --functions netlify/functions --site course-des-ketch
   ```

2. Dans **Site configuration**, puis **Environment variables**, ajoutez `APPS_SCRIPT_URL` = l'URL copiée à l'étape 1.
3. Redéployez (même commande) pour que la fonction lise ce réglage. Vous pourrez aussi brancher votre propre domaine plus tard.

Tant que `APPS_SCRIPT_URL` n'est pas réglé, le formulaire répond poliment « Inscriptions momentanément fermées ».

### 3. Vérifier

1. Inscrivez-vous sur la page avec votre propre numéro : une ligne apparaît dans le Google Sheet.
2. Dans le CRM, onglet **Joueurs**, cliquez sur **Importer les inscriptions bêta** : votre fiche est créée.
3. Réinscrivez le même numéro : la page répond « déjà inscrit » et le Sheet ne change pas.

## Fichiers

| Fichier | Rôle |
| --- | --- |
| `public/index.html` | La landing page : une seule page, sans dépendance |
| `src/jeu.js` | La démo jouable (inséré dans la page par `scripts/assembler.py`) |
| `public/og.png` | L'image affichée quand le lien est partagé sur WhatsApp ou Facebook. Si le site n'est pas à l'adresse course-des-ketch.pages.dev, changez l'adresse de `og:image` dans `index.html` |
| `netlify/functions/inscription-beta.mjs` | Vérifie l'inscription et l'envoie au Google Sheet |
| `public/_redirects` | Netlify : relie l'adresse `/api/inscription-beta` à la fonction |
| `functions/api/inscription-beta.js` | Cloudflare Pages : la même fonction |
| `apps-script/Code.gs` | Écrit dans le Google Sheet, sans doublon |
| `netlify.toml` | Configuration du site Netlify |

## Si le script Apps Script change

Après chaque modification de `Code.gs`, faites **Déployer**, **Gérer les déploiements**, puis **Modifier** et **Nouvelle version**. L'URL reste la même.

# Landing page – La Course des Ketch

La page publique de la bêta, tirée de la maquette « G-Challenge RDC – Landing page Course des Ketch », avec l'aperçu de l'écran de course. Son formulaire d'inscription alimente le CRM.

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

### 2. Le site Netlify

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
| `netlify/functions/inscription-beta.mjs` | Vérifie l'inscription et l'envoie au Google Sheet |
| `public/_redirects` | Relie l'adresse `/api/inscription-beta` à la fonction |
| `apps-script/Code.gs` | Écrit dans le Google Sheet, sans doublon |
| `netlify.toml` | Configuration du site Netlify |

## Si le script Apps Script change

Après chaque modification de `Code.gs`, faites **Déployer**, **Gérer les déploiements**, puis **Modifier** et **Nouvelle version**. L'URL reste la même.

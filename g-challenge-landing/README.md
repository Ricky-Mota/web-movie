# Landing page – La Course des Ketch

La page publique de la bêta, tirée de la maquette « G-Challenge RDC – Landing page Course des Ketch ». Son formulaire d'inscription alimente le CRM.

## La démo jouable

L'écran de course en haut de la page est jouable, avec les 8 étapes du parcours au choix.

Réglages de conduite : routes 35 % plus larges et 60 % plus longues (2,4 à 3,2 km, 75 à 90 s de course), chaussée unie et sans tremblement, longues vagues douces au lieu des petites bosses, et de nombreux virages ajoutés (toujours les mêmes pour une étape). La direction répond vite et franchement, même à basse vitesse, et les virages poussent moins vers l'extérieur.

**Rivaux** : trois pilotes de l'ordinateur courent avec vous (Kin Flash en Turbo GT vert, Bana Mboka en Zigzag R orange, Lisanga en Fleuve V8 violet). Ils prennent le turbo, changent de voie pour éviter le trafic, les barrages et vous ; un contact fait perdre un peu de vitesse aux deux, sans points perdus. Leur vitesse suit votre voiture, pour que la course reste serrée. Position en direct (« POS 2e / 4 ») et bonus à l'arrivée : 1er +800, 2e +400, 3e +150.

**Police (étape 6)** : en plus de la poursuite, la police vous dépasse, se rabat devant vous et freine (deux fois par voiture au plus) : la percuter coûte 300 points. Trois barrages ferment toutes les voies sauf une, annoncés par des panneaux « BARRAGE » et un message 170 m avant. Il n'y a plus d'obstacles fixes sur la route (cônes, trous, barrières…) : le danger vient du trafic, des piétons et, selon l'étape, de la police, de la nuit ou de la pluie.

| Étape | Longueur | Ce qui la rend difficile |
| --- | --- | --- |
| 1 · Rond-point Victoire | 2,4 km | Circulation dense sur 4 voies, ronds-points serrés, monument |
| 2 · Le Grand Marché | 2,6 km | Rue étroite et sinueuse, pousse-pousse, piétons |
| 3 · Route des Poids Lourds | 3,2 km | Camions lents, montées et descentes, entrepôts et conteneurs |
| 4 · Corniche du Fleuve | 2,9 km | Virages au bord du fleuve, chaussée glissante |
| 5 · Boulevard du 30 Juin | 3,2 km | 4 voies, voitures, bus et camions qui changent de voie, montées et descentes |
| 6 · Poursuite à la Gombe | 2,9 km | **Nouveau : la police vous prend en chasse.** Radar « Police à … m », gyrophares sur les bords, sirène. Si elle vous rattrape : −300 et gros ralentissement |
| 7 · Matonge by night | 2,7 km | **Nouveau : de nuit.** Phares, lampadaires et enseignes éclairés, nuée de motos-taxis |
| 8 · Orage sur Limete | 3 km | **Nouveau : pluie et éclairs.** Moins d'adhérence partout, bus fula-fula chargés jusqu'au toit |

### Les voitures

Le joueur choisit sa voiture avant l'étape. Les trois sportives sont des dessins originaux (aucune marque ni voiture réelle), avec peinture brillante, feux LED, diffuseur et néons sous la caisse.

| Voiture | Style | Vitesse max. | Accélération | Maniabilité | Après un choc |
| --- | --- | --- | --- | --- | --- |
| Ketch | Taxi de Kinshasa | référence | référence | référence | garde 35 % de sa vitesse |
| Turbo GT | Supercar | +15 % | +20 % | −10 % | garde 30 % |
| Zigzag R | Sportive | +5 % | +8 % | +40 % | garde 35 % |
| Blindé X | SUV sport | −3 % | −5 % | −5 % | garde 60 % |
| Mbote E | Berline électrique (sifflement, pas de rapports) | +5 % | +35 % | +5 % | garde 40 % |
| Kin GT | Grand tourisme | +12 % | +5 % | référence | garde 40 % |
| Fleuve V8 | Muscle car (son grave et fort) | +10 % | +15 % | −15 % | garde 45 % |
| Léopard | Hypercar | +22 % | +30 % | +20 % | garde 40 % |

Chaque voiture a son propre son de moteur : plus aigu pour les sportives, plus grave pour le SUV.

- **Couleurs** : chaque voiture se peint en jaune, noir, blanc, vert, rouge, bleu, orange ou violet. Le choix est mémorisé pour chaque voiture.
- **Voitures à débloquer** : le Ketch est disponible dès le départ. Les autres s'ouvrent avec le meilleur score obtenu sur une étape : Zigzag R à 6 500 points, Mbote E à 8 500, Blindé X à 10 500, Kin GT à 12 500, Fleuve V8 à 14 500, Turbo GT à 16 500. Le Léopard demande 24 000 points, ou 5 étapes gagnées contre le fantôme. Seuils relevés après le retrait des obstacles fixes (les scores ont monté), et fantôme 13 % plus rapide.
- **Porte-monnaie et boutique** : les pièces G se gardent d'une course à l'autre (pièces ramassées + 5 G par étoile + 15 G pour le défi du jour). Elles achètent les voitures (Zigzag R 60 G, Mbote E 90, Blindé X 120, Kin GT 160, Fleuve V8 200, Turbo GT 260, Léopard 400) et les peintures (25 G chacune, valables pour toutes les voitures ; jaune, noir, blanc et la couleur d'origine sont gratuites). Tout est gardé dans le navigateur (`ketch-pieces`, `ketch-achats`).
- **Défi du jour** : chaque jour (heure de Kinshasa), une étape et une voiture imposées, les mêmes pour tout le monde ; la voiture est prêtée si elle n'est pas débloquée. Le score du défi ne compte pas pour les records d'étape. Le classement du jour est local pour l'instant : vos essais face aux fantômes Bronze, Argent et Or (ordinateur), plus une série de jours consécutifs. Le classement partagé entre joueurs viendra avec le serveur des courses en ligne. L'écran d'arrivée annonce chaque voiture débloquée.
- **Fantôme adapté** : il roule plus vite quand le joueur prend une voiture plus puissante (+15 % face à la Turbo GT, +8 % face à la Zigzag R, +2 % face au Blindé X). Le défi reste le même avec toutes les voitures.

- **Garage complet (propriétaire)** : ouvrir la page avec `#garage-complet` à la fin de l'adresse débloque les 8 voitures sur cet appareil (mémorisé dans le navigateur). À réserver aux tests et aux démonstrations : ne mettez pas ce lien sur les affiches.

### Le menu

- **Garage** : aperçu animé de la voiture, flèches ‹ ›, barres Vitesse / Accélération / Maniabilité / Robustesse, couleurs, et une pastille par voiture (cadenas si verrouillée). Une voiture verrouillée reste visible, en gris, avec sa condition de déblocage.
- **Étapes** : une carte par étape avec ses étoiles et le record ; un clic la sélectionne, le grand bouton **Lancer la course** part (double-clic sur une carte : départ direct).

### Ce qui rend la course vivante

- **Pièces G** (+50 points, et 1 G au porte-monnaie) en traînées de 3, et **bidons de turbo** (+30, turbo rechargé de moitié), avec un son à chaque ramassage.
- **Frôlé !** (+100) : dépasser un véhicule à moins de 90 cm sans le toucher.
- **Effets** : feu tricolore au départ, étincelles aux chocs, fumée des pneus, poussière sur les raccourcis, flammes du turbo, lignes de vitesse. Désactivés si l'appareil demande moins d'animations.
- **Étoiles** par étape : 1 pour finir, 2 pour battre le fantôme, 3 pour le battre avec 2 chocs ou moins. Confettis à la victoire.

- **Voitures 3D** : des modèles GLB (créés par exemple avec Hyper3D Rodin) déposés dans `modeles/` deviennent des images de voiture grâce à `scripts/sprites/sprites-voitures.cjs` ; la démo les affiche à la place du dessin. Mode d'emploi et descriptions à coller dans Hyper3D : `modeles/README.md`.

- **Décor 3D** (Hyper3D Rodin) : palmiers, lampadaires, abribus, étals du marché, pirogues et structure des panneaux publicitaires sont des modèles 3D photoréalistes, transformés en images par le même script que les voitures. Le conteneur, généré debout, garde son dessin d'origine.
- **Sponsors** : panneaux le long de la route (tous les 200 m) et arches au-dessus de la route (tous les 300 m). Liste dans `PUBLICITES` (`src/jeu.js`) : Vodacom (M-PESA), Bralima (Coca-Cola), Canal+ (CANALBOX), Rawbank, Bracongo, Folucco et G-Challenge. Ce sont des **maquettes texte, sans logo** : avant toute mise en ligne publique, obtenez l'accord écrit de chaque marque (contrat de sponsoring), puis déposez son visuel officiel en `public/pubs/<id>.png` (format 2:1, par exemple 1600 × 800) et ajoutez son id dans `public/pubs/liste.json` (`{ "affiches": ["vodacom"] }`) : la démo l'affiche à la place de la maquette.

- **Écrans LED** : panneaux et arches sont des écrans numériques ; chaque écran fait tourner les sponsors toutes les 6 s (glissement), avec un reflet lumineux et une trame de pixels (animations coupées si l'appareil demande moins d'animations).
- **Bande « EN DIRECT »** sous l'écran de jeu, comme à la télévision : sponsor du moment (change toutes les 6 s), fil défilant et bouton **Commenter** (pseudo + 120 caractères). Le fil mêle les annonces du **commentateur**, tirées des vrais événements de la course (départ, dépassements, frôlés, arrestation, arrivée), et les **commentaires des fans**. Dans la démo, les commentaires restent sur l'appareil. Pour un tournoi en direct, il suffit d'appeler `window.GChallengeDirect.ajouter({ auteur, texte, type: 'fan' })` avec les messages reçus du serveur (WebSocket), après modération côté serveur.

- **3 compétitions** (premier écran du jeu) : **Entraînement** (challenge individuel : 8 étapes, défi du jour, garage), **Tournoi Sponsor** (championnat national par équipes de 4 pilotes : qualifications, 16 équipes retenues, 4 semaines de championnat à points ; chaque semaine 20 $ pour chacune des 4 meilleures équipes via M-PESA ; les 2 premières vont à la Coupe d'Afrique) et **Tournoi international** (Coupe d'Afrique : 8 pays × 2 équipes, huitièmes, quarts, demies, finale). Dans la démo, les temps de tournoi restent sur l'appareil ; les règles officielles tournent sur le serveur (`g-challenge-serveur`, section « Les tournois »).

- **Niveaux de difficulté** : chaque étape porte un niveau (Facile, Moyen, Difficile, Très difficile). En entraînement, le joueur choisit le niveau, qui règle la vitesse des rivaux, du fantôme et de la police ; en tournoi et au défi du jour, tout le monde court au niveau Moyen.
- **Démo reliée au serveur** : renseignez l'adresse du serveur dans `<meta name="gchallenge-serveur" content="https://g-challenge-serveur.onrender.com">` (en haut de `public/index.html`). Le bouton **Mon compte** apparaît alors : inscription, connexion, équipes de 4 (créer, rejoindre avec un code). Chaque course d'un joueur connecté est envoyée au serveur avec son trajet (20 positions par seconde), vérifiée par l'anti-triche et comptée pour son équipe si c'est l'épreuve de la semaine (circuits `W_…` du serveur). Les écrans des tournois affichent alors le vrai championnat du pays et la vraie Coupe d'Afrique. Sans adresse, la démo reste entièrement locale.

### Les commandes

| Action | Clavier | Téléphone |
| --- | --- | --- |
| Tourner à gauche / à droite | ← → (ou Q / D) | flèches à gauche de l'écran |
| Turbo | ↑ ou Espace | bouton TURBO |
| Freiner | ↓ (ou S) | bouton FREIN |
| Marche arrière | rester appuyé sur ↓ une fois à l'arrêt | rester appuyé sur FREIN une fois à l'arrêt |

En marche arrière, les feux de recul s'allument, un bip retentit et la vitesse s'affiche avec un « R ». Reculer ne fait pas gagner de points.

L'écran de jeu occupe toute la largeur de la page, et l'image est calculée à sa taille réelle : elle reste nette en grand comme en plein écran.

### Les points

Il y a deux manières de gagner des points :
1. **Rouler vite** : chaque mètre rapporte des points, et d'autant plus que le ketch va vite. Battre le fantôme rapporte 1 000 points, plus 100 par seconde d'avance.
2. **Toucher le moins possible** : chaque choc retire des points sur le moment, et un bonus de conduite propre s'ajoute à l'arrivée.

| Choc | Points retirés |
| --- | --- |
| Piéton | −400 |
| Véhicule (voiture, taxi, bus, camion, moto, pousse-pousse) | −200 |
| Obstacle (cône, barrière, étal, charrette, bassines) | −100 |
| Nid-de-poule, flaque, bosse prise trop vite | −50 |

| Bonus de conduite propre | Points |
| --- | --- |
| Aucun choc | +800 |
| 1 ou 2 chocs | +400 |
| 3 à 5 chocs | +150 |

Le score est affiché en direct sous le chrono, et passe au rouge à chaque choc. À l'arrivée, l'écran détaille les points gagnés et perdus. Le meilleur score et le meilleur temps de chaque étape sont gardés sur l'appareil. Tous ces montants se règlent au début de `src/jeu.js` (constante `POINTS`).

### Le son

- **Moteur** : quatre cylindres simulés, avec le régime, les passages de rapports, le sifflement du turbo et le crissement des pneus dans les virages serrés ou au freinage.
- **Bruitages** : klaxons de la circulation, chocs, nids-de-poule.
- **Ambiance** : différente pour chaque étape (foule du marché, ville, vent du fleuve, zone industrielle).
- **Musique** : une piste différente par étape, générée en direct (rythme, basse, guitare en arpèges), avec son tempo et sa tonalité.
- Deux boutons : couper tout le son, ou seulement la musique.

### Équité

Tout est placé et réglé d'avance, de la même façon pour chaque joueur : obstacles, trajets des véhicules, déclenchement des piétons. Commandes : clavier, ou boutons tactiles avec mode plein écran sur téléphone.

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

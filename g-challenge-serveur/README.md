# G-Challenge – serveur

Le serveur de G-Challenge gère :

- les **joueurs** : inscription par pseudo, téléphone et pays ;
- les **équipes** : de 1 à 5 joueurs, avec un code d'invitation ou un ajout par pseudo ;
- les **courses** : chaque trajet est vérifié par l'anti-triche, puis enregistré pour le classement et le fantôme ;
- les **duels** : de 1 contre 1 à 5 contre 5, gratuits ou avec mise, avec le « Feu Vert » envoyé en direct ;
- l'**argent** : les mises sont encaissées par Mobile Money, la commission est retenue, les gains sont versés et partagés entre coéquipiers, et un duel annulé est remboursé.

Technologies : Node.js 20+, Express, PostgreSQL et Socket.IO. Elles sont toutes gratuites et open source.

---

## 1. Comment ça marche

```
 Jeu Unreal (PC / Android / iOS)
   │  HTTPS (JSON)           │  Socket.IO (Feu Vert, résultats)
   ▼                         ▼
 ┌──────────────────────────────────┐        ┌───────────────────────┐
 │  Serveur Node.js (ce dossier)    │ ─────► │ M-Pesa RDC (Vodacom)  │
 │  joueurs · équipes · duels       │        │ + autres fournisseurs │
 │  anti-triche · commission        │        └───────────────────────┘
 └───────────────┬──────────────────┘
                 ▼
        PostgreSQL (Supabase, gratuit au départ)
```

### Le duel au fantôme, pas à pas

1. Le capitaine A lance un défi : circuit, format (1v1 à 5v5) et mise par équipe (par exemple 10 $). Le duel est **ouvert**.
2. Le capitaine B le trouve dans la liste et le rejoint. Le duel passe en **paiement**.
3. Chaque capitaine paie la mise de son équipe et reçoit la demande M-Pesa sur son téléphone.
4. Quand les deux mises sont confirmées, le duel passe **en cours** et tous les joueurs reçoivent le **Feu Vert** en direct.
5. Chaque joueur court quand il veut, dans le délai (30 min par défaut). Il peut affronter le fantôme de l'équipe adverse. Il n'a droit qu'à **un seul départ**.
6. Quand tout le monde a couru, le serveur compare les temps. Le score d'une équipe est la somme des temps de ses joueurs, et le plus petit score gagne.
7. **Gains** : sur une cagnotte de 20 $, la plateforme garde 5 $ (25 %). Les 15 $ restants sont partagés à parts égales entre les gagnants. Le reste de la division (quelques centimes) va au capitaine.

**La commission (25 % au départ) se change à tout moment**, sans redémarrer le serveur, avec la route admin `PUT /admin/parametres` (entre 0 et 50 %). Le nouveau taux vaut pour les défis lancés ensuite ; un duel déjà lancé garde le taux affiché quand il a été créé, pour que personne ne soit surpris en cours de route.

| Situation | Ce qui se passe |
| --- | --- |
| Personne ne rejoint dans le délai (60 min) | Duel annulé, mises remboursées en totalité |
| Égalité parfaite | Chaque équipe est remboursée, sans commission |
| Une équipe ne court pas (ou triche) dans le délai | L'autre équipe gagne par forfait |
| Personne ne court | Chaque équipe est remboursée |
| Un versement M-Pesa échoue | Il reste enregistré ; l'administrateur le relance |

### Les règles par pays

| Pays | Devise | Mises | Fournisseur | Langue |
| --- | --- | --- | --- | --- |
| RDC | USD | **ouvertes** | M-Pesa RDC | fr |
| Zambie | ZMW | fermées (jeu gratuit) | à choisir | en |
| Zimbabwe | USD | fermées (jeu gratuit) | à choisir | en |
| Afrique du Sud | ZAR | fermées (jeu gratuit) | à choisir | en |
| Arabie saoudite | SAR | **fermées** : les jeux d'argent y sont interdits | aucun | ar |

Les joueurs de tous ces pays jouent, s'entraînent, font des duels gratuits et apparaissent dans les classements. Les mises ne s'ouvrent dans un pays qu'avec une validation juridique locale et un fournisseur de paiement, en un seul appel administrateur (voir section 5). Un duel payant n'est possible qu'entre joueurs qui utilisent la même devise.

### L'anti-triche

Le jeu envoie, avec le temps, le trajet complet : 20 positions par seconde, comme pour le fantôme. Le serveur rejette la course si :

- le temps est plus court que le minimum possible sur le circuit ;
- le nombre de positions ne correspond pas au temps annoncé ;
- le trajet ne commence pas au départ ou ne finit pas à l'arrivée ;
- le ketch va plus vite que la vitesse maximale du circuit, mesurée sur des fenêtres d'une seconde (un téléphone qui saccade n'est donc pas pris pour un tricheur) ;
- en duel, la course arrive trop tôt ou trop tard par rapport au départ. On ne peut donc pas envoyer un ancien essai d'entraînement.

Une course rejetée est gardée en base avec son motif, pour que vous puissiez enquêter.

---

## 2. Installer et lancer sur votre ordinateur

Prérequis : [Node.js 20 ou plus](https://nodejs.org) et une base PostgreSQL (locale, ou gratuite sur Supabase, voir section 3).

```bash
cd g-challenge-serveur
```

```bash
npm install
```

```bash
cp .env.example .env
```

Ouvrez `.env` et remplissez au minimum `DATABASE_URL` et `JWT_SECRET`. Laissez `FOURNISSEUR_FORCE=simulation` pour l'instant : aucun argent réel ne bouge.

```bash
npm start
```

Le serveur crée ses tables tout seul au premier démarrage. Pour vérifier qu'il tourne, ouvrez http://localhost:3000/sante dans un navigateur : il doit afficher `{"ok":true}`.

Pour devenir administrateur, inscrivez-vous d'abord depuis le jeu ou avec l'exemple de la section 4, puis :

```bash
npm run admin -- VotrePseudo
```

### Lancer les tests

Les tests ont besoin d'une base PostgreSQL vide **réservée aux tests**, car elle est effacée à chaque lancement.

```bash
TEST_DATABASE_URL=postgresql://utilisateur:motdepasse@localhost:5432/gchallenge_test npm test
```

Ils couvrent le calcul des gains, l'anti-triche et un parcours complet : inscriptions, équipes, duel 2 contre 2 à 10 $, Feu Vert, courses, versement de 7,50 $ à chaque gagnant, remboursement d'un duel expiré, refus des mises en Arabie saoudite.

---

## 3. Mettre en ligne gratuitement (Neon + Render, environ 20 minutes)

### a) La base de données : Neon (gratuit, sans limite de durée)

1. Créez un compte sur [neon.tech](https://neon.tech) (avec votre compte GitHub ou Google), puis **Create project** : nom `g-challenge`, version PostgreSQL 17, région **Europe (Frankfurt)**, la plus proche de Kinshasa.
2. Sur le tableau de bord, cliquez sur **Connect**. **Désactivez « Connection pooling »** : le serveur a besoin d'une connexion directe. Copiez l'adresse, qui commence par `postgresql://` et se termine par `?sslmode=require`.
3. Gardez cette adresse pour vous : elle donne accès à toute la base. C'est votre `DATABASE_URL`.

L'offre gratuite de Neon (0,5 Go) suffit largement pour la bêta. La base s'endort sans visite et se réveille en une seconde. Les tables sont créées automatiquement au premier démarrage du serveur, dans le schéma `gchallenge`.

Si vous libérez plus tard un projet Supabase, la même adresse de type « Session » fonctionne aussi : rien d'autre à changer.

### b) Le serveur : Render (gratuit)

1. Créez un compte sur [render.com](https://render.com) avec votre compte GitHub, et autorisez l'accès au dépôt **web-movie**.
2. **New**, puis **Blueprint**, puis choisissez le dépôt : le fichier `render.yaml` (à la racine) crée le service `g-challenge-serveur` tout seul.
3. Render demande deux valeurs :
   - `DATABASE_URL` : l'adresse Neon de l'étape a) ;
   - `URL_PUBLIQUE` : l'adresse que Render donne au service, par exemple `https://g-challenge-serveur.onrender.com` (vous pourrez la corriger après le premier déploiement).
4. **Apply**. Après 2 à 3 minutes, ouvrez `https://<votre-service>.onrender.com/sante` : la page doit afficher `{"ok":true}`.

`JWT_SECRET` est créé au hasard par Render, et `FOURNISSEUR_FORCE=simulation` garantit qu'aucun argent réel ne bouge tant que M-Pesa n'est pas branché.

### c) Garder le serveur éveillé (gratuit)

L'offre gratuite de Render endort le serveur après 15 minutes sans visite. Les clôtures du dimanche minuit et les primes M-Pesa seraient alors retardées jusqu'à la visite suivante.

1. Créez un compte gratuit sur [cron-job.org](https://cron-job.org).
2. **Create cronjob** : adresse `https://<votre-service>.onrender.com/sante`, **toutes les 10 minutes**.

À chaque visite, le serveur rattrape aussi les clôtures en retard. Un seul service tourne ainsi 24 h/24, dans la limite des 750 heures gratuites par mois.

### d) Devenir administrateur

Inscrivez-vous depuis le jeu ou avec l'API (`POST /joueurs/inscription`). Puis, dans Neon, ouvrez **SQL Editor** et exécutez :

```sql
UPDATE gchallenge.joueurs SET role = 'admin' WHERE pseudo = 'VotrePseudo';
```

Reconnectez-vous : votre nouveau jeton donne accès aux routes `/admin`.

Pour le lancement public, avec de l'argent réel, prévoyez l'offre Render d'entrée de gamme (environ 7 $ par mois, sans mise en veille).

---

## 4. Utiliser l'API depuis Unreal Engine

Toutes les réponses sont en JSON. Les erreurs ont toujours la même forme : `{ "erreur": { "code": "...", "message": "..." } }`. Le `message` est en français et peut être affiché tel quel au joueur.

Après l'inscription ou la connexion, gardez le `jeton` reçu et envoyez-le dans chaque appel : `Authorization: Bearer <jeton>`.

### Liste des adresses

| Méthode | Adresse | Rôle |
| --- | --- | --- |
| GET | `/pays` | Pays pris en charge (menu d'inscription) |
| GET | `/parametres` | Taux de commission actuel, à afficher avant un défi |
| POST | `/joueurs/inscription` | `{ pseudo, telephone, pays, mot_de_passe }` |
| POST | `/joueurs/connexion` | `{ identifiant (pseudo ou téléphone), mot_de_passe }` |
| GET | `/joueurs/moi` | Profil, devise, mises autorisées ou non |
| POST | `/equipes` | Créer une équipe `{ nom, taille_max }` : vous êtes capitaine |
| GET | `/equipes` | Mes équipes, avec leur code d'invitation |
| POST | `/equipes/rejoindre` | Rejoindre avec un code `{ code }` |
| POST | `/equipes/:id/membres` | Le capitaine ajoute un joueur `{ pseudo }` |
| DELETE | `/equipes/:id/membres/:joueurId` | Retirer un joueur, ou quitter l'équipe |
| GET | `/circuits` | Circuits ouverts |
| GET | `/circuits/:code/classement?pays=CD` | Classement mondial ou national |
| GET | `/circuits/:code/fantome` | Trajet du record, ou d'un joueur avec `?joueur=<id>` |
| POST | `/courses` | Envoyer une course (entraînement ou duel) |
| POST | `/duels` | Lancer un défi `{ circuit, taille, mise_centimes, equipe_id? }` |
| GET | `/duels/ouverts?taille=2` | Défis à rejoindre |
| GET | `/duels/miens` | Mes duels |
| GET | `/duels/:id` | Détail : équipes, temps, mes paiements |
| POST | `/duels/:id/rejoindre` | Accepter un défi `{ equipe_id? }` |
| POST | `/duels/:id/payer` | Le capitaine paie la mise (demande M-Pesa sur son téléphone) |
| POST | `/duels/:id/depart` | Le joueur appuie sur « Courir » (un seul départ par duel) |
| GET | `/duels/:id/fantome-adverse` | Trajet de l'équipe adverse, pour courir contre son fantôme |
| GET | `/tournois/championnats/:pays` | Championnat national (ex. `CD`) : semaines, circuit de la semaine, classement des équipes, qualifiées |
| GET | `/tournois/championnats/:id/semaines/:n` | Classement des équipes de la semaine n (provisoire, puis définitif) |
| GET | `/tournois/coupe` | Coupe d'Afrique : tableau des huitièmes à la finale, temps, championne |
| GET | `/tournois/international/:circuit?par_pays=3` | Classement continental des pilotes (Afrique) et meilleurs de chaque pays |

Les montants sont **en centimes** : `1000` = 10,00 $. En 1 contre 1, `equipe_id` est facultatif, le serveur crée une équipe d'un joueur.

### Exemple : inscription

```bash
curl -X POST http://localhost:3000/joueurs/inscription -H "Content-Type: application/json" -d '{"pseudo":"Ricky","telephone":"243812345678","pays":"CD","mot_de_passe":"unMotDePasseSolide"}'
```

### Envoyer une course

```json
{
  "circuit": "L_Kinshasa_30Juin",
  "duel_id": "…facultatif…",
  "temps_ms": 42170,
  "intervalle_ms": 50,
  "trajet": [[x, y, z, pitch, yaw, roll], …]
}
```

Le `trajet` correspond au tableau `TrajetActuel` du guide « Fantôme et meilleur temps ». Pour chaque Transform, utilisez **Break Transform**, puis **Break Rotator**, et envoyez la position (Location X, Y, Z, en centimètres) et la rotation (Pitch, Yaw, Roll). Pour rejouer un fantôme reçu du serveur, faites l'inverse avec **Make Rotator** et **Make Transform**.

Le `code` d'un circuit est le nom du niveau Unreal. L'administrateur le déclare une fois, avec les coordonnées de la ligne de départ et de la ligne d'arrivée, que l'on lit dans le panneau Details du niveau :

```bash
curl -X PUT http://localhost:3000/admin/circuits/L_Kinshasa_30Juin -H "Authorization: Bearer <jeton admin>" -H "Content-Type: application/json" -d '{"nom":"Boulevard du 30 Juin","temps_min_ms":25000,"vitesse_max_kmh":220,"depart":[0,0,0],"arrivee":[200000,0,0]}'
```

Plus simple pour vos circuits : remplissez `db/circuits.json` (trois circuits de Kinshasa déjà préparés ; il ne manque que la position de l'arrivée de chacun), puis :

```bash
npm run circuits
```

### Le Feu Vert en direct (Socket.IO)

Dans Unreal, le plugin gratuit **SocketIOClient** (getnamo, sur GitHub et Fab) se connecte en passant le jeton dans la requête de connexion (`?token=<jeton>`, champ **Query** du bloc Connect). Un client web peut aussi utiliser `auth: { token: "<jeton>" }`. Envoyez ensuite `suivre_duel` avec l'identifiant du duel pour recevoir aussi les mises à jour de ce duel.

| Événement reçu | Quand |
| --- | --- |
| `paiement:maj` | Une mise ou un gain change d'état (`reussi`, `echoue`) |
| `duel:maj` | Une équipe a rejoint ou payé |
| `duel:feu_vert` | Les deux mises sont confirmées : le voyant passe au vert |
| `duel:resultat` | Le duel est terminé : gagnant, résultat, commission |

Pour les appels HTTP, le plugin gratuit **VaRest** (sur Fab) est le plus simple en Blueprint.

---

## 4 bis. Les tournois (par équipes de 3)

### Championnat national (Tournoi Sponsor), un par pays

| Semaine | Qui court | À la clôture (dimanche minuit, heure de Kinshasa) |
| --- | --- | --- |
| 1 · qualifications | toutes les équipes du pays (pays du capitaine) | les **16 meilleures équipes** sont retenues |
| 2 à 5 · championnat | les 16 équipes | points selon le classement de la semaine : 25, 20, 16, 13, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1 |
| fin du championnat | — | les **2 premières** (points, puis temps cumulé) vont à la **Coupe d'Afrique** |

- **Temps d'une équipe** : somme des meilleurs temps de ses **3 pilotes** sur le circuit de la semaine (courses d'entraînement valides, vérifiées par l'anti-triche). Une équipe incomplète est classée derrière et ne marque pas de point. Un pilote ne compte que pour une seule équipe retenue.
- **Primes** : chaque semaine (qualifications comprises), les **4 meilleures équipes reçoivent 20 $ chacune**, payés par le sponsor et **partagés entre les pilotes qui ont couru** (le capitaine reçoit les centimes restants). Versement **automatique par M-Pesa** quand le pays du pilote le permet (aujourd'hui la RDC), sinon « à verser manuellement ».
- **Aucune mise** des joueurs : le sponsor paie. Nombre d'équipes, taille, primes, barème de points et nombre de semaines se règlent pour chaque championnat.

### Coupe d'Afrique

Les 2 qualifiées de **8 pays** forment **16 équipes** : **huitièmes, quarts, demi-finales, finale**, un tour par semaine. Au premier tour, le 1er d'un pays affronte le 2e du pays voisin dans le tableau. Dans chaque match, l'équipe au plus petit temps passe ; si une équipe est incomplète, l'autre passe. Primes facultatives pour la championne et la finaliste.

`/tournois/international/:circuit` donne aussi un **classement continental des pilotes** (individuel), réservé aux pays d'Afrique.

## 5. Administration

| Méthode | Adresse | Rôle |
| --- | --- | --- |
| PUT | `/admin/circuits/:code` | Créer ou modifier un circuit (seuils anti-triche) |
| GET | `/admin/pays` | Règles de tous les pays |
| PUT | `/admin/pays/:code` | Ajouter un pays, ou ouvrir ou fermer ses mises |
| PUT | `/admin/parametres` | Changer la commission `{ commission_pourcent: 25 }` (0 à 50) |
| GET | `/admin/bilan` | Commissions gagnées et paiements, par devise |
| POST | `/admin/paiements/:id/relancer` | Relancer un versement ou un remboursement échoué |

Exemple : ouvrir les mises en Zambie, une fois le juriste et le fournisseur validés :

```bash
curl -X PUT http://localhost:3000/admin/pays/ZM -H "Authorization: Bearer <jeton admin>" -H "Content-Type: application/json" -d '{"nom":"Zambie","devise":"ZMW","mises_autorisees":true,"fournisseur":"nom_du_module","langue":"en","indicatif":"260"}'
```

---

### Administrer les tournois

| Méthode | Adresse | Rôle |
| --- | --- | --- |
| POST | `/admin/tournois/championnats` | Créer un championnat `{ pays, nom, sponsor, premier_lundi, circuits[] (qualifications puis une par semaine), nb_equipes? (16), taille_equipe? (3), nb_qualifies? (2), primes_centimes? ([2000,2000,2000,2000]), points? }` |
| POST | `/admin/tournois/championnats/:id/semaines/:n/cloturer` | Clôturer une semaine tout de suite |
| POST | `/admin/tournois/coupes` | Créer la Coupe d'Afrique `{ nom, sponsor, premier_lundi, championnats[] (8 terminés), circuits[] (un par tour : 4 pour 16 équipes), primes_centimes? ([championne, finaliste]) }` |
| POST | `/admin/tournois/coupes/:id/tours/:t/cloturer` | Clôturer un tour tout de suite |
| GET | `/admin/primes?statut=a_verser_manuellement` | Primes à verser à la main, échouées, réussies… |
| POST | `/admin/primes/:id/relancer` | Relancer une prime M-Pesa échouée |

## 6. Passer à l'argent réel (M-Pesa RDC)

Le module `src/paiements/mpesaRdc.js` suit l'Open API M-Pesa de Vodacom (marché `vodacomDRC`) : C2B pour encaisser les mises, B2C pour verser les gains. **Il n'a pas encore été testé contre la vraie API.** Suivez ces étapes dans l'ordre :

- [ ] Recevoir de Vodacom RDC : la clé API, la clé publique, le code de service (Service Provider Code) et l'accès au sandbox.
- [ ] Comparer `mpesaRdc.js` à la documentation reçue (adresses, noms des champs, codes de réponse) et l'ajuster si besoin.
- [ ] Remplir les variables `MPESA_RDC_*` avec les valeurs du **sandbox**, retirer `FOURNISSEUR_FORCE`, puis faire un duel complet avec deux numéros de test.
- [ ] Vérifier un remboursement : laisser expirer un duel payé.
- [ ] Passer `MPESA_RDC_BASE_URL` sur l'adresse de production, puis faire un premier duel réel de petit montant (1 $) entre membres de l'équipe.

### Ajouter un fournisseur pour un autre pays

Écrivez un module sur le modèle de `src/paiements/simulation.js`, avec deux fonctions :

- `encaisser(paiement, joueur)` ;
- `verser(paiement, joueur)`.

Chacune renvoie `{ statut: 'reussi' | 'echoue', reference, details }`. Ajoutez ensuite le module dans `src/paiements/index.js` et mettez son nom dans la colonne `fournisseur` du pays.

Pour la Zambie, le Zimbabwe et l'Afrique du Sud, un **agrégateur** qui regroupe plusieurs opérateurs Mobile Money et les cartes bancaires (Flutterwave, PawaPay ou CinetPay, par exemple) évite de signer un contrat par opérateur. Vérifiez la couverture exacte de chaque agrégateur pays par pays avant de choisir.

---

## 7. Organisation du code

```
g-challenge-serveur/
├── db/migrations/        tables (001), pays de lancement (002), réglages dont la commission (003)
├── db/circuits.json      les circuits du jeu (npm run circuits)
├── src/
│   ├── index.js          démarrage, minuterie des délais
│   ├── app.js            assemblage de l'API, gestion des erreurs
│   ├── config.js         lecture du fichier .env
│   ├── auth.js           mots de passe, jetons de session
│   ├── temps-reel.js     Socket.IO (Feu Vert)
│   ├── domaine/
│   │   ├── argent.js     commission et partage des gains (en centimes)
│   │   ├── antitriche.js vérification des trajets
│   │   ├── circuits.js   enregistrement des circuits
│   │   ├── duels.js      cycle de vie des duels et des paiements
│   │   └── equipes.js    codes d'invitation, membres
│   ├── paiements/        simulation, M-Pesa RDC, registre des fournisseurs
│   └── routes/           une page par groupe d'adresses
├── scripts/              migrations, administrateur, circuits
└── test/                 tests unitaires et parcours complet
```

## 8. Sécurité : à retenir

- Ne publiez **jamais** le fichier `.env`. Il est déjà exclu de Git.
- `JWT_SECRET` doit être long et aléatoire. Si vous le changez, tous les joueurs devront se reconnecter.
- `FOURNISSEUR_FORCE=simulation` ne doit **jamais** rester actif en production : tous les paiements y réussissent sans argent réel.
- Les tentatives de connexion sont limitées à 20 par quart d'heure et par adresse IP.

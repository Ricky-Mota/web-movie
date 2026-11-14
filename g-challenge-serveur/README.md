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

## 3. Mettre en ligne gratuitement

### a) La base de données : Supabase

1. Créez un projet sur [supabase.com](https://supabase.com) (offre gratuite).
2. Allez dans **Project Settings**, puis **Database**, puis **Connection string**, et copiez l'adresse en mode **Session**.
3. Elle devient `DATABASE_URL`, avec `DATABASE_SSL=true`.

Les tables sont créées dans un schéma à part, `gchallenge`, que l'API publique de Supabase n'expose pas. Seul votre serveur y a accès.

### b) Le serveur : Render (ou Railway, Fly.io)

1. Sur [render.com](https://render.com), créez un **Web Service** depuis ce dépôt GitHub.
2. **Root Directory** : `g-challenge-serveur`. **Build Command** : `npm install`. **Start Command** : `npm start`.
3. Dans **Environment**, ajoutez les variables du fichier `.env.example`.

L'offre gratuite de Render met le serveur en veille après 15 minutes sans visite, et le premier appel suivant prend environ 30 secondes. C'est suffisant pour les tests. Pour le lancement public, prévoyez l'offre payante d'entrée de gamme, autour de 7 $ par mois.

---

## 4. Utiliser l'API depuis Unreal Engine

Toutes les réponses sont en JSON. Les erreurs ont toujours la même forme : `{ "erreur": { "code": "...", "message": "..." } }`. Le `message` est en français et peut être affiché tel quel au joueur.

Après l'inscription ou la connexion, gardez le `jeton` reçu et envoyez-le dans chaque appel : `Authorization: Bearer <jeton>`.

### Liste des adresses

| Méthode | Adresse | Rôle |
| --- | --- | --- |
| GET | `/pays` | Pays pris en charge (menu d'inscription) |
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

## 5. Administration

| Méthode | Adresse | Rôle |
| --- | --- | --- |
| PUT | `/admin/circuits/:code` | Créer ou modifier un circuit (seuils anti-triche) |
| GET | `/admin/pays` | Règles de tous les pays |
| PUT | `/admin/pays/:code` | Ajouter un pays, ou ouvrir ou fermer ses mises |
| GET | `/admin/bilan` | Commissions gagnées et paiements, par devise |
| POST | `/admin/paiements/:id/relancer` | Relancer un versement ou un remboursement échoué |

Exemple : ouvrir les mises en Zambie, une fois le juriste et le fournisseur validés :

```bash
curl -X PUT http://localhost:3000/admin/pays/ZM -H "Authorization: Bearer <jeton admin>" -H "Content-Type: application/json" -d '{"nom":"Zambie","devise":"ZMW","mises_autorisees":true,"fournisseur":"nom_du_module","langue":"en","indicatif":"260"}'
```

---

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
├── db/migrations/        tables (001) et pays de lancement (002)
├── src/
│   ├── index.js          démarrage, minuterie des délais
│   ├── app.js            assemblage de l'API, gestion des erreurs
│   ├── config.js         lecture du fichier .env
│   ├── auth.js           mots de passe, jetons de session
│   ├── temps-reel.js     Socket.IO (Feu Vert)
│   ├── domaine/
│   │   ├── argent.js     commission et partage des gains (en centimes)
│   │   ├── antitriche.js vérification des trajets
│   │   ├── duels.js      cycle de vie des duels et des paiements
│   │   └── equipes.js    codes d'invitation, membres
│   ├── paiements/        simulation, M-Pesa RDC, registre des fournisseurs
│   └── routes/           une page par groupe d'adresses
├── scripts/              migrations, nommer un administrateur
└── test/                 tests unitaires et parcours complet
```

## 8. Sécurité : à retenir

- Ne publiez **jamais** le fichier `.env`. Il est déjà exclu de Git.
- `JWT_SECRET` doit être long et aléatoire. Si vous le changez, tous les joueurs devront se reconnecter.
- `FOURNISSEUR_FORCE=simulation` ne doit **jamais** rester actif en production : tous les paiements y réussissent sans argent réel.
- Les tentatives de connexion sont limitées à 20 par quart d'heure et par adresse IP.

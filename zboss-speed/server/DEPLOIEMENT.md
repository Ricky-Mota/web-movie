# Mettre 2 Life en ligne (Cloudflare, offre gratuite)

Un seul Worker Cloudflare, nommé `two-life`, sert le site (accueil, Ma vie, la ville en 3D, administration) et l'API du jeu.
Il se met à jour tout seul à chaque envoi de code sur GitHub (Workers Builds).

## 1. Créer la base de données (une fois)

1. Tableau de bord Cloudflare → **Storage & Databases** → **D1 SQL Database** → **Create**.
2. Nom : `two-life` → **Create**.
3. Copier le **Database ID** et le coller dans `wrangler.toml`, ligne `database_id`. Cet identifiant n'est pas un secret.

## 2. Relier le dépôt GitHub (une fois)

1. **Workers & Pages** → **Create** → **Import a repository** → choisir `web-movie`.
2. Nom du projet : `two-life`. Il doit être identique au `name` de `wrangler.toml`.
3. **Advanced settings** :
   - **Root directory** : `zboss-speed/server`
   - **Deploy command** : `npm run deploy`. Cette commande crée les tables si besoin, puis déploie le Worker.
   - **Branche** : la branche qui contient ce code.
4. **Deploy**.

## 3. Réglages après le premier déploiement

1. Ouvrir le Worker `two-life` → **Settings** → **Variables and Secrets** → **Add**.
2. Ajouter `ADMIN_EMAILS` : ton adresse e-mail (plusieurs adresses possibles, séparées par des virgules).
3. Ne jamais écrire cette adresse dans le dépôt, qui est public.

Les clés des notifications (VAPID) sont créées toutes seules au premier usage et gardées dans la base.

## 4. Utiliser le jeu

- **Site** : `https://two-life.<ton-sous-domaine>.workers.dev/`. Le mode démo est automatiquement désactivé sur ce domaine.
- **Administration** : `/admin.html`. Crée d'abord ton compte sur `/vie.html` avec l'adresse mise dans `ADMIN_EMAILS`. Avant le lancement, seuls les investisseurs et les administrateurs peuvent s'inscrire.
- **Consignes du jour** : elles sont appliquées toutes les 15 minutes (Cron Trigger gratuit).

## Limites de l'offre gratuite

L'offre gratuite donne 100 000 requêtes par jour, une base D1 de 5 Go, et des Cron Triggers.
C'est largement suffisant pour les premiers joueurs.

## Paiements réels (dépôts et retraits)

Le guichet de « Ma vie » est prêt pour l'argent réel. Tant que `REAL_MONEY` vaut `false` dans `src/life.js`, tout reste en simulation.

Le jour où les autorisations sont obtenues :

1. Signer avec un agrégateur de paiement agréé en RDC (mobile money M-Pesa, Orange Money, Airtel Money, et cartes).
2. Dans Cloudflare, Worker `two-life`, Settings, Variables and Secrets :
   - variable `PAY_PROVIDER` = `agregateur`
   - variable `PAY_API_URL` = l'adresse de l'API de l'agrégateur
   - secret `PAY_API_KEY` = la clé fournie par l'agrégateur
   - secret `PAY_WEBHOOK_SECRET` = le secret de signature des notifications
3. Donner à l'agrégateur l'adresse de notification : `https://two-life.motaricky243.workers.dev/api/paiement/notification`.
4. Si les noms de champs de l'agrégateur diffèrent, adapter seulement `toProviderCollect`, `toProviderPayout` et `fromProviderNotice` dans `src/paiement.js`.
5. Passer `REAL_MONEY` à `true` dans `src/life.js`, puis déployer.

Fonctionnement :

- Dépôt : le joueur choisit le moyen et le montant (sans plafond). Le serveur crée une demande « en attente » et l'envoie à l'agrégateur. Les e-makuta ne sont crédités qu'à la notification signée « payé », une seule fois, et seulement si le montant correspond.
- Retrait : chaque fin de mois (les 3 derniers jours, heure de Kinshasa), une fois par mois. Les e-makuta sont retirés tout de suite. Si l'agrégateur refuse ou échoue, ils sont rendus automatiquement.
- Les numéros de téléphone ne sont jamais enregistrés en entier (3 derniers chiffres seulement). Aucun numéro de carte ne passe par 2 Life.

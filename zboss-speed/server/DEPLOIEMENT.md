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

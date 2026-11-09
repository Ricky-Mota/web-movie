# ImagiKids : deux versions à comparer

Chaque fichier s'ouvre directement dans un navigateur (double-clic). Les deux versions utilisent la même base Supabase (projet « ImagiKids »).

## 1. Version tout-en-un : `tout-en-un/index.html`

Une seule page qui contient :

- l'application ;
- la page d'abonnement (bouton « ⭐ S'abonner ») ;
- le CRM (lien « Espace gestion (CRM) » en bas de page).

## 2. Pages séparées : `pages-separees/`

| Fichier | Rôle |
|---|---|
| `application.html` | L'application ImagiKids (13 matières, 20 niveaux) |
| `abonnement.html` | La landing page d'abonnement (essai, mensuel, annuel, paiement M-Pesa) |
| `crm.html` | Le CRM : clients, paiements à valider, relances, réglages |

## 3. Site prêt pour Netlify : `netlify/`

| Adresse | Contenu |
|---|---|
| `/` | Landing page d'abonnement |
| `/app/` | Application ImagiKids |
| `/crm/` | CRM (non référencé par les moteurs de recherche) |

Deux façons de le mettre en ligne gratuitement :

- **Glisser-déposer** : sur https://app.netlify.com/drop, déposez le dossier `imagikids/netlify`.
- **Depuis GitHub** (mise à jour automatique à chaque modification) : *Add new site → Import an existing project → GitHub → web-movie*. Le fichier `netlify.toml`, à la racine du dépôt, indique déjà quel dossier publier.

Après la mise en ligne :

- reportez l'adresse du site dans `crm_settings.app_url` : c'est le lien d'accès envoyé aux clients ;
- dans Supabase, réglez *Authentication → URL Configuration → Site URL* sur cette adresse.

## Bon à savoir

- Si la base Supabase n'est pas joignable, les pages s'ouvrent en mode démo, avec des données fictives gardées sur l'appareil.
- L'aide aux devoirs par IA fonctionne seulement dans la version publiée sur claude.ai. Dans un fichier ouvert localement, seule la calculatrice expliquée reste disponible.
- Seules les adresses e-mail inscrites dans la table `crm_admins` peuvent voir les clients dans le CRM.

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

## Bon à savoir

- Si la base Supabase n'est pas joignable, les pages s'ouvrent en mode démo, avec des données fictives gardées sur l'appareil.
- L'aide aux devoirs par IA fonctionne seulement dans la version publiée sur claude.ai. Dans un fichier ouvert localement, seule la calculatrice expliquée reste disponible.
- Seules les adresses e-mail inscrites dans la table `crm_admins` peuvent voir les clients dans le CRM.

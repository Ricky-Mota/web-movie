# G-Challenge : analyse de sécurité

Date : 16 novembre 2026. Périmètre : serveur (API, temps réel, paiements), jeu web, espace administrateur,
inscriptions bêta (Netlify / Cloudflare + Apps Script), hébergement (Render, Neon).

Aucune application n'est sûre à 100 %. Le but est de rendre chaque attaque **difficile, visible et sans gain** :
surtout quand il y a de l'argent (primes M-Pesa).

## 1. Failles trouvées et corrigées

| # | Gravité | Faille | Correction |
|---|---|---|---|
| 1 | Critique | **Triche aux primes** : sur les circuits web, l'anti-triche acceptait jusqu'à 337 km/h et un temps minimum 2 fois plus court que possible. Un tricheur pouvait fabriquer une course imbattable et gagner les 20 $. | Limites calculées sur les vraies vitesses du jeu (turbo maximal + 2 %, temps minimum = 97 % du meilleur temps possible). Et surtout : **aucune prime ne part sans validation d'un administrateur** (`a_valider`), avec l'historique des courses du pilote sous les yeux. |
| 2 | Élevée | Le rôle administrateur venait du **jeton** (valable 30 jours) : un admin retiré gardait ses droits. | Rôle relu en base à chaque requête. |
| 3 | Élevée | Impossible d'exclure un tricheur : ses sessions restaient ouvertes. | `Bloquer` dans l'espace admin : déconnexion immédiate, connexion refusée, courses retirées des classements, primes non validées refusées. |
| 4 | Moyenne | Aucune limite de débit hors connexion : on pouvait inonder l'API (et la base gratuite Neon). Corps JSON de 3 Mo acceptés partout. | 300 requêtes/minute par IP, 30 envois de course/minute ; 100 Ko par requête (3 Mo seulement pour une course). |
| 5 | Moyenne | Salons en direct : création de salons et messages sans limite (saturation mémoire). | 3 actions/seconde, 25 positions/seconde, messages de 10 Ko max, 2 000 salons max. |
| 6 | Moyenne | Base de données : certificat SSL non vérifié (une fausse base pouvait s'intercaler). | Certificat vérifié (Neon a un certificat valide). |
| 7 | Moyenne | **Injection de formules** dans Google Sheets : un pseudo `=IMPORTXML(...)` aurait été exécuté comme une formule si l'adresse Apps Script fuitait. | Nettoyage des textes dans la fonction d'inscription **et** dans Apps Script ; date fixée par le script ; 4 Ko max. |
| 8 | Faible | Temps de réponse différent si le pseudo existe : on pouvait deviner les comptes. | Même durée de vérification dans tous les cas. |
| 9 | Faible | Le jeu acceptait une adresse de serveur notée dans le navigateur, même en production (détournement du jeton par « collez ceci dans la console »). | L'adresse de la page fait foi ; https obligatoire. |
| 10 | Faible | Pas de politique de sécurité (CSP) sur le site. | `public/_headers` : CSP, HSTS, anti-iframe, permissions coupées. |
| 11 | Info | Aucune trace des actions d'administration. | Journal `journal_admin` (qui, quoi, quand). |

Vérifié : 0 dépendance vulnérable (`npm audit`), requêtes SQL toutes paramétrées (pas d'injection SQL),
textes affichés dans le jeu échappés (pas de XSS), mots de passe hachés (bcrypt, coût 12), erreurs sans détails internes.
Tests automatiques : 39 sur 39, dont `test/securite.test.js` (jeton falsifié, admin rétrogradé, compte bloqué, limites).

## 2. Risques qui restent (à connaître)

1. **Le jeu tourne sur le téléphone du joueur** : un expert peut toujours fabriquer une course « juste sous la limite ».
   La parade est humaine : valider chaque prime, regarder les courses à moins de 5 % du minimum (signe ⚠ dans l'espace admin).
2. **Numéros de téléphone** : vérification par code SMS ajoutée (6 chiffres, 10 minutes, 5 essais, 1 envoi par minute et 5 par jour,
   code stocké seulement sous forme d'empreinte). **Une prime ne peut pas être validée si le numéro du pilote n'est pas vérifié.**
   Reste à brancher un vrai fournisseur de SMS (voir plus bas) : en mode `simulation`, le code est écrit dans le journal Render.
3. **Duels avec mise d'argent : FERMÉS dans tous les pays** (migration 008). Les duels gratuits restent ouverts.
   Réouverture pays par pays, après avis juridique et autorisation : `PUT /admin/pays/CD` avec `mises_autorisees: true`.
4. **Compte administrateur** : un seul mot de passe le protège. Utilisez un mot de passe long et unique ; la double authentification est à prévoir.
5. **M-Pesa** : les clés Vodacom donneront accès à de l'argent réel. Elles vont uniquement dans les variables d'environnement Render, jamais dans le code ni par message.
6. **Inscriptions bêta** : les robots sont freinés (champ piège, délai), mais sans limite par IP. Sur Cloudflare, ajoutez une règle « Rate limiting » gratuite sur `/api/inscription-beta`.
7. **Offre gratuite** Render/Neon : pas de sauvegarde automatique longue. Exportez la base chaque semaine pendant les tournois.

## 3. Brancher les vrais SMS

Dans Render > votre service > Environment, changez `SMS_FOURNISSEUR`, puis ajoutez les clés du fournisseur choisi :

| Fournisseur | `SMS_FOURNISSEUR` | Variables à ajouter | Pour commencer |
|---|---|---|---|
| Twilio | `twilio` | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` (numéro Twilio) | crédit d'essai à l'inscription ; en essai, il n'envoie qu'aux numéros que vous avez vérifiés chez Twilio |
| Africa's Talking | `africastalking` | `AT_USERNAME`, `AT_API_KEY`, `AT_EXPEDITEUR` (facultatif) | `AT_USERNAME=sandbox` : simulateur gratuit ; vérifier la couverture RDC avant la production |

Les clés ne vont **que** dans Render. Ne les envoyez ni par message ni par capture.

## 4. Règles d'or

- Ne jamais coller de secret (mot de passe Neon, clé M-Pesa, `JWT_SECRET`) dans une discussion, un e-mail ou une capture.
- `FOURNISSEUR_FORCE=simulation` tant que M-Pesa n'est pas testé sur le sandbox.
- Laisser « Valider chaque prime à la main » coché.
- Changer `JWT_SECRET` dans Render coupe toutes les sessions d'un coup (en cas de fuite).

# Kelasi Kids sur Google Play : tout est prêt, voici comment finaliser

## Ce qui est déjà fait

| Élément demandé par Google | Où le trouver |
|---|---|
| Application installable (PWA) : manifeste, icônes, fonctionnement hors connexion | En ligne sur https://kelasi-kids.netlify.app/app/ |
| Politique de confidentialité, obligatoire pour une application pour enfants | https://kelasi-kids.netlify.app/confidentialite/ |
| Icône 512 × 512 | `icone-512.png` |
| Image de présentation 1024 × 500 | `captures/image-presentation-1024x500.png` |
| 7 captures d'écran de téléphone (1080 × 2160) | `captures/1-…` à `captures/7-…` |
| Textes de la fiche du magasin | Ci-dessous, section B |
| Réponses aux questionnaires de Google | Ci-dessous, section C |

## A. Les 4 actions qui restent à faire de votre côté

### 1. Créer le compte développeur Google Play (25 $, une seule fois)
1. Allez sur **https://play.google.com/console/signup** avec votre compte Google.
2. Choisissez **« Vous-même »** (compte personnel), remplissez votre nom et votre adresse, puis payez les 25 $ par carte.
3. Google vérifie votre identité : préparez une photo de votre pièce d'identité. La vérification prend souvent de 1 à 3 jours.

### 2. Fabriquer l'application Android avec PWABuilder (gratuit, environ 10 minutes, sur ordinateur)
1. Allez sur **https://www.pwabuilder.com**.
2. Collez l'adresse **`https://kelasi-kids.netlify.app/app/`**, puis cliquez sur **Start**.
3. Cliquez sur **Package for stores**, puis sur **Android** → **Generate Package**.
4. Dans les options, remplissez :
   - **Package ID** : `cd.kelasikids.app` (attention : on ne peut plus le changer ensuite) ;
   - **App name** : `Kelasi Kids : école en images` ;
   - **Launcher name** : `Kelasi Kids` ;
   - **Signing key** : laissez **Create new**, puis indiquez votre nom et « Kelasi Kids » comme organisation.
5. Téléchargez le fichier **.zip** et gardez-le précieusement. Il contient :
   - le fichier **`.aab`**, que vous enverrez à Google ;
   - le fichier **`signing.keystore`** et **`signing-key-info.txt`** (mots de passe). ⚠️ **Gardez-les en lieu sûr, en plusieurs copies** : sans eux, vous ne pourrez plus jamais mettre l'application à jour ;
   - le fichier **`assetlinks.json`**.

### 3. M'envoyer le fichier `assetlinks.json`
Ouvrez-le avec le Bloc-notes et copiez son contenu dans notre conversation. Il ne contient rien de secret. Je le mets en ligne sur votre site : c'est ce qui permet à l'application de s'ouvrir **en plein écran, sans barre d'adresse**.

Plus tard, dans la Play Console, ouvrez **Tester et publier → Intégrité de l'application → Signature de l'application** et copiez aussi le bloc **« Digital Asset Links JSON »**. Envoyez-le-moi également : Google signe l'application avec sa propre clé.

### 4. Créer l'application dans la Play Console et lancer le test
1. **Créer une application** : nom `Kelasi Kids : école en images`, langue par défaut **Français**, type **Application**, **Gratuite**.
2. Remplissez la **fiche du magasin** avec les textes de la section B, puis ajoutez l'icône, l'image de présentation et les captures.
3. Remplissez les **questionnaires** avec les réponses de la section C.
4. Ouvrez **Tester → Test fermé**, créez un test et envoyez le fichier **`.aab`**.
5. Ajoutez les **adresses Gmail de 12 testeurs au moins** (famille, amis, parents d'élèves avec un téléphone Android). Envoyez-leur le lien d'inscription. Chacun doit **s'inscrire, installer l'application et la garder pendant 14 jours**.
6. Après 14 jours, cliquez sur **Demander l'accès à la production**. Google vérifie l'application en quelques jours, puis Kelasi Kids est publiée.

> Ces règles (12 testeurs pendant 14 jours pour un nouveau compte personnel) peuvent évoluer. Suivez ce qu'affiche la Play Console.

---

## B. Textes de la fiche du magasin (à copier-coller)

**Nom de l'application (30 caractères au maximum)**
```
Kelasi Kids : école en images
```

**Description courte (80 caractères au maximum)**
```
Apprendre en images de 3 à 15 ans : 13 matières, 20 niveaux, une voix qui guide.
```

**Description complète**
```
Kelasi Kids aide les enfants de 3 à 15 ans à apprendre en images, à leur rythme, à la maison comme à l'école.

🖼️ APPRENDRE EN TOUCHANT
L'enfant touche la bonne image. Une voix lit chaque consigne à voix haute, et une flèche orange le guide quand il hésite. Les plus petits n'ont pas besoin de savoir lire.

📚 13 MATIÈRES, 20 NIVEAUX CHACUNE
• Français : vocabulaire, lettres, conjugaison, grammaire
• Calcul et calcul mental
• Mesures et volumes (avec les francs congolais)
• Géométrie
• Anglais, avec une voix anglaise
• Géographie et histoire de la RDC
• Géographie et histoire du monde
• Sciences, géologie et informatique
Les niveaux se débloquent au fil des réussites, et les questions changent à chaque partie.

👨‍👩‍👧 POUR LES PARENTS ET LES ENSEIGNANTS
• Un espace pour suivre les progrès de chaque enfant : niveaux, étoiles, dernières activités
• Une calculatrice qui explique chaque étape du calcul
• Interface en 10 langues, dont le lingala, le swahili, le kikongo et le tshiluba

🔒 PENSÉ POUR LA SÉCURITÉ DES ENFANTS
• Aucune publicité, aucune messagerie
• C'est un adulte qui crée le compte
• Pour chaque enfant, seulement un prénom et un avatar, jamais de photo

🎁 ESSAI GRATUIT
Les leçons se découvrent gratuitement. L'abonnement Famille (jusqu'à 6 enfants) se prend sur notre site : https://kelasi-kids.netlify.app
```

**Catégorie** : Enseignement · **Tags** : Éducation, Enfants, Apprentissage
**Adresse e-mail de contact** : motaricky243@gmail.com
**Site web** : https://kelasi-kids.netlify.app
**Politique de confidentialité** : https://kelasi-kids.netlify.app/confidentialite/

---

## C. Réponses aux questionnaires de la Play Console

**Accès à l'application**
« Toutes les fonctionnalités sont disponibles sans accès particulier » : les leçons se font sans compte. L'espace parent demande seulement de créer un compte gratuit avec une adresse e-mail.

**Annonces** : **Non**, l'application ne contient pas de publicité.

**Classification du contenu** (questionnaire IARC) : catégorie **« Référence, actualités ou éducation »**. Répondez **Non** à toutes les questions sur la violence, la peur, la sexualité, le langage grossier, les drogues, les jeux d'argent et les achats intégrés. Répondez aussi **Non** à « Les utilisateurs peuvent-ils communiquer entre eux ».

**Public cible et contenu**
- Tranches d'âge : **5 ans et moins**, **6 à 8 ans**, **9 à 12 ans**, **13 à 15 ans**.
- L'application est conçue pour les enfants : acceptez les **règles du programme Familles**.

**Sécurité des données**
- L'application collecte-t-elle des données ? **Oui**.
- Les données sont-elles chiffrées en transit ? **Oui**.
- Les utilisateurs peuvent-ils demander la suppression de leurs données ? **Oui**, en écrivant à motaricky243@gmail.com.
- Données partagées avec des tiers : **Aucune**.
- Données collectées :

| Type de données | Collectées | Facultatif ? | Utilisation |
|---|---|---|---|
| Informations personnelles → Nom | Oui | Oui (compte adulte, abonnement) | Fonctionnalité de l'application, gestion du compte |
| Informations personnelles → Adresse e-mail | Oui | Oui | Gestion du compte, communications |
| Informations personnelles → Numéro de téléphone | Oui | Oui (abonnement) | Gestion du compte, communications |
| Informations financières → Historique d'achats (code de transaction M-Pesa) | Oui | Oui | Gestion du compte |
| Activité dans l'application → Autres actions (scores, niveaux) | Oui | Oui | Fonctionnalité de l'application |

**Applications gouvernementales, financières ou de santé** : Non.

---

## D. Paiements : la règle importante
Google interdit de payer un abonnement numérique **dans l'application** avec un autre moyen que Google Play Billing. Pour respecter cette règle :
- l'abonnement M-Pesa se prend **sur le site** (https://kelasi-kids.netlify.app) ;
- dans l'application, l'enfant apprend, le parent suit les progrès et se connecte avec le compte qu'il a payé sur le site.

C'est déjà réglé : quand Kelasi Kids est ouvert depuis l'application Google Play, les prix et les boutons « S'abonner » sont masqués automatiquement. Sur le site web, ils restent visibles.

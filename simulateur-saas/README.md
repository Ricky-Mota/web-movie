# Simulateur SaaS — Claude Code

Simulateur de formation de **ZandoBoss SARLU** (RCCM KNG/RCCM/23-B-00512) : il apprend à construire et à vendre des SaaS avec Claude Code, Supabase, n8n, WhatsApp et pawaPay, dans des copies simplifiées des vrais outils.

- Version publiée : https://claude.ai/artifact/GjKtqkqyKQdnGzQWsAdeNt
- Présentation pour les boutiques : https://claude.ai/artifact/4UgSBccaRtT9CC2xhzjNLh
- Conçu par MOTA LWAMBA RICKY · +243 825 565 647 · motaricky243@gmail.com · zandoboss.com

## Contenu

- 47 leçons (420 étapes) réparties en 9 modules et 3 niveaux (Débutant, Moyen, Expert).
- 3 modes par leçon : Démonstration, Guidé, Évaluation.
- 3 épreuves (leçons 32, 22 et 33) et 3 attestations, délivrées par ZandoBoss SARLU depuis l'onglet Résultats, avec un code de vérification et un PDF téléchargeable.
- Assistance par Claude pendant les leçons (hors mode Évaluation).
- Espace formateur « Cartographier » pour créer de nouveaux scénarios à partir de captures d'écran.

## Fichiers

| Chemin | Rôle |
| --- | --- |
| `index.html` | Le simulateur complet, prêt à ouvrir dans un navigateur |
| `build/source.html` | Moteur d'origine (Simulateur Claude Code) |
| `build/course_v1.js` | Leçons 1 à 22 |
| `build/course_add.js` | Leçons 23 à 47 et niveaux |
| `build/assemble.py` | Assemble le moteur et les leçons, ajoute les fonctions (niveaux, attestations, assistance) |
| `build/build.sh` | Reconstruit `index.html` et vérifie toutes les leçons |
| `build/check.js` | Vérifie que chaque étape vise une rubrique existante |
| `build/play.js` | Rejoue toutes les leçons en mode Guidé (Playwright) |
| `presentation-boutiques/` | Les 16 diapositives de la présentation commerciale |

## Reconstruire et tester

```bash
./build/build.sh
```

Puis, pour rejouer les 47 leçons de bout en bout (Playwright requis) :

```bash
cd build && node play.js
```

## À savoir

- Hors de claude.ai, la page fonctionne en mode local : la bibliothèque partagée, les résultats, les attestations et l'assistance par Claude demandent la version publiée.
- Les écrans des logiciels sont des reproductions pédagogiques simplifiées : les vrais outils peuvent différer.
- Les prix et frais cités dans les leçons sont des exemples, à remplacer par les grilles réelles de Meta et de pawaPay.

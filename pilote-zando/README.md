# Where is Zando? — pilote vidéo 3D (épisode débutant A1-A2)

Ce dossier transforme le document « Pilote vidéo 3D — Where is Zando » en **projet de production complet** :
la scène existe en 3D dans Blender (décor, 3 personnages, 19 plans), elle est rendue, sous-titrée et montée en épisode YouTube.

| Fichier | Rôle |
|---|---|
| `scenario/plans.json` | **Source unique** : les 19 plans, durées, répliques (avec leur minutage), prompts image/vidéo, voix |
| `scenario/prompts_kling.md` | Prompts prêts à coller dans Kling/Runway (bloc de style déjà ajouté) |
| `blender/construire_scene.py` | Construit toute la scène 3D dans Blender, anime et rend |
| `blender/where_is_zando.blend` | La scène déjà construite : ouvrez-la directement dans Blender |
| `montage/sous_titres.py` | Sous-titres anglais `.srt` + `.ass` (mots-clés surlignés en jaune) |
| `montage/assembler.py` | Montage ffmpeg : ambiance de rue, voix, sous-titres, logo, épisode complet |
| `voix/generer_voix.py` + `voix/voix.json` | Génère chaque réplique avec ElevenLabs |
| `rendu/episode_youtube.mp4` | Épisode complet : accroche, scène, scène sous-titrée, phrases clés, quiz |
| `rendu/scene_avec_sous_titres.mp4` | La scène seule (1 min 23) avec sous-titres |
| `rendu/references/` | Fiches personnages (face, trois-quarts, profil) + image du décor |
| `rendu/images_plans/` | Une image clé par plan (storyboard) |

## Deux façons de produire la version finale

**A. Tout dans Blender (gratuit, cohérence parfaite des personnages)**
Les personnages sont des objets 3D : ils ne changent jamais de tenue d'un plan à l'autre (la « règle d'or » du document).

```bash
blender -b -P blender/construire_scene.py -- --qualite final --rendu
python3 montage/assembler.py
```

`--qualite final` rend en 1920×1080 avec EEVEE (rapide sur une carte graphique). Le rendu d'aperçu fourni ici
a été fait avec Cycles sur processeur, en 640×360 à 12 images/s (`--qualite apercu --pas 2 --largeur 640`).

**B. Blender comme storyboard, puis Kling pour l'image « film d'animation »**
1. Fiches personnages : `rendu/references/*.png` → images de référence dans Kling.
2. Pour chaque plan : `rendu/images_plans/plan_XX.png` donne la composition, `scenario/prompts_kling.md` le prompt.
3. Assemblez les clips dans une vidéo (CapCut ou ffmpeg), puis : `python3 montage/assembler.py --video scene_kling.mp4`.

Commencez par les plans 3, 6 et 10 (les trois personnages qui parlent), comme le conseille le document.

## Les voix (ElevenLabs)

1. Dans ElevenLabs → *Voice Design*, créez les 4 voix avec les descriptions de `voix/voix.json`.
2. Copiez leurs identifiants dans `voix/voix.json`.
3. `export ELEVENLABS_API_KEY="votre clé"` puis `python3 voix/generer_voix.py`
4. Relancez `python3 montage/assembler.py` : les voix sont placées automatiquement au bon moment.

Sans voix, le montage contient l'ambiance de rue et les sous-titres (c'est le cas du rendu fourni).
Rappel : l'offre gratuite d'ElevenLabs n'autorise pas l'usage commercial.

## Modifier la scène avec Claude + Blender MCP

1. Installez Blender (gratuit) et l'extension Blender MCP, puis connectez-la à Claude Desktop.
2. Ouvrez `blender/where_is_zando.blend`.
3. Demandez par exemple : « rapproche la caméra CAM_06 », « Papa Fiston doit pointer plus haut au plan 6 »,
   « change la couleur du kiosque ». Les objets ont des noms explicites : `CHEN_tete`, `FISTON_epaule_D`,
   `GRACE` (le personnage entier), `KIOSQUE`, `TAXIBUS_ZANDO`, `CAM_01` … `CAM_19` ; chaque plan est un marqueur `PLAN_XX` de la timeline.

Pour un changement durable, modifiez plutôt `construire_scene.py` (ou `plans.json` pour le texte et le minutage) et relancez-le.

## Commandes utiles

```bash
# images clés de quelques plans seulement
blender -b -P blender/construire_scene.py -- --images-plans --plans 3,6,10
# fiches personnages + décor
blender -b -P blender/construire_scene.py -- --references
# rendre un passage (images 1 à 240)
blender -b -P blender/construire_scene.py -- --rendu --debut 1 --fin 240
```

Sans Blender installé : `pip install bpy` puis remplacez `blender -b -P` par `python3`.

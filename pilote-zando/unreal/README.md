# Passer la scène dans Unreal Engine 5 (rendu réaliste)

Objectif : garder **exactement** la mise en scène du pilote Blender (décor, 19 plans, caméras, minutage, voix) et
remplacer les personnages par des **MetaHumans** réalistes, avec l'éclairage Lumen d'Unreal.

| Fichier | Rôle |
|---|---|
| `export/decor.fbx` | Décor fixe : rue de Kinshasa, kiosque bleu, tabouret, immeubles, palmiers |
| `export/anime.fbx` | Personnages (maquettes), valise, journal, taxis-bus et les 19 caméras, animés image par image |
| `export/plans.csv` | Découpage : quelle caméra, de quelle image à quelle image |
| `export/scene.json` | Positions de départ des personnages (en cm, repère Unreal) |
| `export/dialogue_ambiance.wav` | Voix + ambiance de rue, calée sur la scène |
| `creer_sequence.py` | Crée automatiquement la séquence (animation, coupes caméra, son) dans Unreal |
| `fiches_metahuman.md` | Réglages précis de chaque personnage pour MetaHuman Creator |
| `references/` | Fiche Deevid des personnages |

## Étapes (PC TUF Gaming)

1. **Installer** : Epic Games Launcher → Unreal Engine 5 (dernière version 5.x). Prévoir ~100 Go.
   Sur un portable gaming, réglez *Qualité du moteur* sur **Élevée** (pas « Épique ») et branchez le chargeur.
2. **Créer le projet** : *Film / Vidéo & Événements en direct* → *Vide*, nom `WhereIsZando`.
3. **Plugins** (Édition › Plugins) : *Python Editor Script Plugin*, *Sequencer Scripting*,
   *Editor Scripting Utilities*, *MetaHuman*. Redémarrer.
4. **Importer la scène** : Fichier › *Importer dans le niveau* → `export/decor.fbx`, puis `export/anime.fbx`.
5. **Importer le son** : glisser `export/dialogue_ambiance.wav` dans le dossier `Contenu/WhereIsZando`.
6. **Créer la séquence** : Outils › *Exécuter un script Python* → `creer_sequence.py`.
   Ouvrir `SEQ_WhereIsZando` : les 19 plans, les caméras et le son sont en place.
7. **Créer les MetaHumans** avec `fiches_metahuman.md`, puis les attacher aux acteurs `CHEN`, `FISTON`, `GRACE`.
8. **Visage qui parle** : *MetaHuman Animator › Audio Driven Animation* sur chaque fichier de `../voix/audio/`.
9. **Rendu** : *Movie Render Queue* → 1920×1080, 24 i/s, puis
   `python3 montage/assembler.py --video rendu_unreal.mp4` pour les sous-titres, le logo et l'épisode complet.

## Avec Claude + Unreal MCP

Si vous installez l'extension **Unreal MCP** et la connectez à Claude Desktop, Claude peut faire les étapes 4 à 7
à votre place dans l'éditeur ouvert (importer, lancer le script, placer les MetaHumans, régler la lumière du matin).

## Régénérer l'export

Après une modification de la scène Blender :

```bash
python3 blender/export_unreal.py
```

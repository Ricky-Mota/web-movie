"""
À lancer DANS Unreal Engine 5 (menu Outils › Exécuter un script Python, ou via Claude + Unreal MCP).

Prérequis :
  1. Plugins activés : « Python Editor Script Plugin », « Sequencer Scripting », « Editor Scripting Utilities ».
  2. Dans un niveau vide : Fichier › Importer dans le niveau › export/decor.fbx, puis export/anime.fbx.
     (Unreal crée un acteur par objet Blender : CHEN, FISTON, GRACE, TAXIBUS_ZANDO, CAM_01 ... CAM_19, etc.)

Ce script :
  - crée la séquence /Game/WhereIsZando/SEQ_WhereIsZando (24 i/s, durée de la scène) ;
  - y ajoute tous les acteurs animés et importe leur animation depuis anime.fbx (correspondance par nom) ;
  - crée la piste de coupes caméra à partir de export/plans.csv (CAM_01 au plan 1, etc.) ;
  - ajoute la piste son (export/dialogue_ambiance.wav) si elle a été importée dans /Game/WhereIsZando/.

Script écrit sans accès à Unreal : s'il bloque sur une étape, le message indique laquelle ; les étapes restantes
se font à la main dans le Sequencer (glisser les caméras, clic droit › Importer FBX).
"""
import csv
import os

import unreal

DOSSIER = os.path.dirname(os.path.abspath(__file__))
EXPORT = os.path.join(DOSSIER, "export")
CHEMIN_SEQ = "/Game/WhereIsZando"
NOM_SEQ = "SEQ_WhereIsZando"
FPS = 24

# Plans à mettre dans la séquence : [] = tous ; [3] = plan test « Excuse me, sir »
PLANS_CHOISIS = [3]

with open(os.path.join(EXPORT, "plans.csv"), encoding="utf-8") as f:
    PLANS = list(csv.DictReader(f))
if PLANS_CHOISIS:
    PLANS = [p for p in PLANS if int(p["plan"].split("_")[1]) in PLANS_CHOISIS]
    NOM_SEQ = f"{NOM_SEQ}_plan" + "_".join(str(n) for n in PLANS_CHOISIS)
DEBUT = int(PLANS[0]["image_debut"]) - 1
FIN = int(PLANS[-1]["image_fin"])

# 1. Séquence
outils = unreal.AssetToolsHelpers.get_asset_tools()
chemin_complet = f"{CHEMIN_SEQ}/{NOM_SEQ}"
if unreal.EditorAssetLibrary.does_asset_exist(chemin_complet):
    seq = unreal.load_asset(chemin_complet)
else:
    seq = outils.create_asset(NOM_SEQ, CHEMIN_SEQ, unreal.LevelSequence, unreal.LevelSequenceFactoryNew())
seq.set_display_rate(unreal.FrameRate(FPS, 1))
seq.set_tick_resolution(unreal.FrameRate(FPS, 1))
seq.set_playback_start(DEBUT)
seq.set_playback_end(FIN)
unreal.log(f"[Zando] séquence {chemin_complet} : {FIN} images")

# 2. Acteurs du niveau dont le nom vient de anime.fbx
sous_systeme = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
acteurs = {a.get_actor_label(): a for a in sous_systeme.get_all_level_actors()}
noms_animes = [n for n in acteurs if n.startswith(("CHEN", "FISTON", "GRACE", "RECEVEUR", "FIGURANT", "VALISE",
                                                   "JOURNAL", "TAXIBUS", "CAM_"))]
liaisons = {}
for nom in noms_animes:
    liaisons[nom] = seq.add_possessable(acteurs[nom])
unreal.log(f"[Zando] {len(liaisons)} acteurs ajoutés à la séquence")

# 3. Animation depuis le FBX (correspondance par nom d'objet)
try:
    reglages = unreal.MovieSceneUserImportFBXSettings()
    reglages.set_editor_property("match_by_name_only", True)
    reglages.set_editor_property("create_cameras", False)
    reglages.set_editor_property("reduce_keys", False)
    monde = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_editor_world()
    unreal.SequencerTools.import_level_sequence_fbx(monde, seq, list(liaisons.values()), reglages,
                                                    os.path.join(EXPORT, "anime.fbx"))
    unreal.log("[Zando] animation importée depuis anime.fbx")
except Exception as e:  # noqa: BLE001
    unreal.log_warning(f"[Zando] import FBX de l'animation à faire à la main (clic droit › Importer) : {e}")

# 4. Coupes caméra
piste = seq.add_track(unreal.MovieSceneCameraCutTrack)
for p in PLANS:
    cam = p["camera"]
    if cam not in liaisons:
        unreal.log_warning(f"[Zando] caméra {cam} absente du niveau (plan {p['plan']})")
        continue
    section = piste.add_section()
    section.set_range(int(p["image_debut"]) - 1, int(p["image_fin"]))
    section.set_camera_binding_id(seq.get_binding_id(liaisons[cam]))
unreal.log(f"[Zando] {len(PLANS)} coupes caméra créées")

# 5. Son (si importé)
son = unreal.load_asset(f"{CHEMIN_SEQ}/dialogue_ambiance") if unreal.EditorAssetLibrary.does_asset_exist(
    f"{CHEMIN_SEQ}/dialogue_ambiance") else None
if son:
    piste_son = seq.add_track(unreal.MovieSceneAudioTrack)
    sec = piste_son.add_section()
    sec.set_sound(son)
    sec.set_range(0, int(open(os.path.join(EXPORT, "plans.csv")).read().strip().splitlines()[-1].split(",")[3]))
    unreal.log("[Zando] piste son ajoutée")
else:
    unreal.log("[Zando] importez export/dialogue_ambiance.wav dans /Game/WhereIsZando/ puis relancez pour le son")

unreal.EditorAssetLibrary.save_loaded_asset(seq)
unreal.log("[Zando] terminé : ouvrez SEQ_WhereIsZando dans le Sequencer")

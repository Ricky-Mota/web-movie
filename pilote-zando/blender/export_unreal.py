"""
Exporte la scène Blender du pilote pour Unreal Engine 5.

    blender -b blender/where_is_zando.blend -P blender/export_unreal.py
    (ou, sans Blender installé : python3 blender/export_unreal.py, avec `pip install bpy`)

Produit dans unreal/export/ :
  decor.fbx         décor fixe (rue, kiosque, tabouret, immeubles, palmiers) — sans animation
  anime.fbx         personnages, accessoires, taxis-bus et les 19 caméras, animation « cuite » image par image
  plans.csv         découpage : plan, caméra, image de début, image de fin (pour le Sequencer)
  scene.json        positions des personnages et des caméras (pour placer les MetaHumans)
"""
import bpy
import csv
import json
import os
import sys

ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.dirname(ICI)
SORTIE = os.path.join(RACINE, "unreal", "export")
os.makedirs(SORTIE, exist_ok=True)

if "KIOSQUE" not in bpy.data.objects:  # lancé avec python3 : on ouvre la scène
    bpy.ops.wm.open_mainfile(filepath=os.path.join(ICI, "where_is_zando.blend"))
scene = bpy.context.scene
scene.render.fps = 24

# Les caméras visent une cible par contrainte : l'export « cuit » leur mouvement, Unreal n'en a pas besoin.
STATIQUE = {"Decor", "Lumieres"}
ANIME = {"Personnages", "Accessoires", "Vehicules", "Figurants", "Cameras"}


def objets_de(collections):
    out = []
    for c in bpy.data.collections:
        if c.name in collections:
            out += list(c.all_objects)
    return out


def exporter(nom, objets, anime):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objets:
        o.hide_set(False)
        o.select_set(True)
    bpy.context.view_layer.objects.active = objets[0]
    chemin = os.path.join(SORTIE, nom)
    bpy.ops.export_scene.fbx(
        filepath=chemin, use_selection=True,
        object_types={"EMPTY", "CAMERA", "LIGHT", "MESH", "OTHER"},
        use_mesh_modifiers=True, mesh_smooth_type="FACE", add_leaf_bones=False,
        apply_scale_options="FBX_SCALE_UNITS", axis_forward="-Z", axis_up="Y",
        bake_anim=anime, bake_anim_use_all_actions=False, bake_anim_use_nla_strips=False,
        bake_anim_force_startend_keying=True, bake_anim_step=1.0, bake_anim_simplify_factor=1.0,
        path_mode="COPY", embed_textures=False)
    print(f"[OK] {chemin}  ({os.path.getsize(chemin) / 1e6:.1f} Mo, {len(objets)} objets)")


exporter("decor.fbx", objets_de(STATIQUE), anime=False)
exporter("anime.fbx", objets_de(ANIME), anime=True)

# Découpage des plans (marqueurs de la timeline)
marqueurs = sorted(scene.timeline_markers, key=lambda m: m.frame)
with open(os.path.join(SORTIE, "plans.csv"), "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["plan", "camera", "image_debut", "image_fin", "debut_s", "fin_s"])
    for i, m in enumerate(marqueurs):
        fin = (marqueurs[i + 1].frame - 1) if i + 1 < len(marqueurs) else scene.frame_end
        w.writerow([m.name, m.camera.name if m.camera else "", m.frame, fin,
                    round((m.frame - 1) / 24, 3), round(fin / 24, 3)])
print("[OK] plans.csv")

# Positions de départ (en centimètres, repère Unreal : X avant, Y droite, Z haut)
scene.frame_set(1)
infos = {"fps": 24, "images": scene.frame_end, "unite": "cm", "objets": {}}
for nom in ("CHEN", "FISTON", "GRACE", "KIOSQUE", "TABOURET", "TAXIBUS_ZANDO", "SOLEIL"):
    o = bpy.data.objects.get(nom)
    if o:
        p = o.matrix_world.translation
        infos["objets"][nom] = {"x": round(p.x * 100, 1), "y": round(-p.y * 100, 1), "z": round(p.z * 100, 1),
                                "rotation_z_deg": round(-o.matrix_world.to_euler().z * 57.2958, 1)}
with open(os.path.join(SORTIE, "scene.json"), "w", encoding="utf-8") as f:
    json.dump(infos, f, indent=1, ensure_ascii=False)
print("[OK] scene.json")

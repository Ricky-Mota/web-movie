"""
Contrôle qualité automatique du pilote (à lancer avec Blender ou bpy) :
pour chaque réplique, vérifie que la voix existe et tient dans sa place, que la caméra du plan montre
le visage de celui qui parle, et que sa bouche bouge pendant la réplique.

    python3 montage/verifier_scene.py        (avec pip install bpy)
"""
import json
import os
import subprocess

import bpy
from bpy_extras.object_utils import world_to_camera_view

ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.dirname(ICI)
bpy.ops.wm.open_mainfile(filepath=os.path.join(RACINE, "blender", "where_is_zando.blend"))
sc = bpy.context.scene
with open(os.path.join(RACINE, "scenario", "plans.json"), encoding="utf-8") as f:
    plans = json.load(f)["plans"]


def duree(f):
    return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f],
                                capture_output=True, text=True).stdout)


debut = {}
fr = 1
for p in plans:
    debut[p["n"]] = fr
    fr += round(p["duree"] * 24)

problemes, ok = [], 0
for p in plans:
    cam = bpy.data.objects[f"CAM_{p['n']:02d}"]
    for i, r in enumerate(p["repliques"], 1):
        nom = f"plan {p['n']:02d} {r['qui']:8s} « {r['texte'][:38]}… »"
        audio = os.path.join(RACINE, "voix", "audio", f"plan_{p['n']:02d}_{i}_{r['qui']}.mp3")
        if not os.path.exists(audio):
            problemes.append(f"{nom} : pas de voix")
            continue
        d = duree(audio)
        if d > (r["fin"] - r["debut"]) + 0.15:
            problemes.append(f"{nom} : voix trop longue ({d:.1f} s pour {r['fin'] - r['debut']:.1f} s)")
        tete = bpy.data.objects[f"{r['qui']}_tete"]
        bouche = bpy.data.objects[f"{r['qui']}_bouche"]
        visible, ouvertures = 0, []
        for k in range(5):
            f = debut[p["n"]] + round((r["debut"] + (k + 0.5) / 5 * (r["fin"] - r["debut"])) * 24)
            sc.frame_set(f)
            co = world_to_camera_view(sc, cam, tete.matrix_world.translation)
            if 0.02 < co.x < 0.98 and 0.05 < co.y < 0.98 and co.z > 0 and tete.matrix_world.to_scale().x > 0.5:
                visible += 1
            ouvertures.append(bouche.scale.z)
        bouge = max(ouvertures) - min(ouvertures) > 0.004
        hors_champ = r["qui"] == "RECEVEUR" or p["n"] == 18  # voix off assumées (receveur, au revoir en plan large)
        if visible < 3 and not hors_champ:
            problemes.append(f"{nom} : visage peu visible dans CAM_{p['n']:02d} ({visible}/5)")
        elif not bouge:
            problemes.append(f"{nom} : la bouche ne bouge pas")
        else:
            ok += 1
            print(f"[OK] {nom}  voix {d:.1f} s, visage visible {visible}/5, bouche synchronisée")
print(f"\n{ok} répliques conformes, {len(problemes)} à revoir")
for pb in problemes:
    print("[À REVOIR]", pb)

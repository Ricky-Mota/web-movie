"""
Ajuste le minutage du scénario (scenario/plans.json) à la durée réelle des voix de voix/audio/.

- chaque réplique dure exactement le temps de sa voix ;
- une courte pause naturelle sépare deux répliques d'un même plan ;
- un plan n'est jamais plus court que dans le découpage d'origine.
Les gestes et la bouche (blender/construire_scene.py) sont calés sur les répliques : ils suivent.

Usage : python3 montage/recaler_plans.py
"""
import json
import math
import os
import subprocess

ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.dirname(ICI)
# Durées du découpage d'origine (document « Pilote vidéo 3D »)
ORIGINE = {1: 5, 2: 4, 3: 4, 4: 3, 5: 5, 6: 6, 7: 4, 8: 4, 9: 3, 10: 4, 11: 3, 12: 5, 13: 3, 14: 6, 15: 5, 16: 5,
           17: 6, 18: 5, 19: 3}
PAUSE = 0.35  # entre deux répliques d'un même plan
FIN_PLAN = 0.6  # silence après la dernière réplique avant la coupe


def duree(f):
    return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f],
                                capture_output=True, text=True).stdout)


def main():
    chemin = os.path.join(RACINE, "scenario", "plans.json")
    with open(chemin, encoding="utf-8") as f:
        sc = json.load(f)
    for p in sc["plans"]:
        precedent = None
        for i, r in enumerate(p["repliques"], 1):
            audio = os.path.join(RACINE, "voix", "audio", f"plan_{p['n']:02d}_{i}_{r['qui']}.mp3")
            d = duree(audio) if os.path.exists(audio) else len(r["texte"].split()) / 2.0
            if precedent is not None:
                r["debut"] = round(precedent + PAUSE, 2)
            r["fin"] = round(r["debut"] + d + 0.05, 2)
            precedent = r["fin"]
        besoin = math.ceil(((precedent or 0) + FIN_PLAN) * 2) / 2
        p["duree"] = max(ORIGINE[p["n"]], besoin)
    with open(chemin, "w", encoding="utf-8") as f:
        json.dump(sc, f, ensure_ascii=False, indent=1)
    total = sum(p["duree"] for p in sc["plans"])
    print(f"[OK] plans recalés sur les voix : {total:.1f} s ({int(total // 60)} min {total % 60:02.0f})")


if __name__ == "__main__":
    main()

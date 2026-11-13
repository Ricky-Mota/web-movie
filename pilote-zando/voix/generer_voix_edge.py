"""
Voix provisoires de TOUTES les répliques avec les voix neuronales Microsoft (via edge-tts), gratuites.

Débit lent et clair (niveau débutant). Ensuite, montage/recaler_plans.py ajuste la durée des plans aux voix ;
la bouche et les gestes suivent automatiquement (ils sont calés sur les répliques).

  pip install edge-tts
  python3 voix/generer_voix_edge.py            # génère ce qui manque dans voix/audio/
  python3 voix/generer_voix_edge.py --tout     # régénère tout

ATTENTION : le service de lecture vocale d'Edge n'est pas prévu pour un usage commercial. Ces voix servent à
finir et valider le montage ; avant de monétiser la chaîne, remplacez-les par les voix ElevenLabs
(voix/generer_voix.py) : mêmes noms de fichiers, le montage les reprend automatiquement.
"""
import asyncio
import json
import os
import subprocess
import sys

import edge_tts

ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.dirname(ICI)

VOIX = {
    "CHEN": {"voix": "en-HK-SamNeural", "debit": -12, "hauteur": "+0Hz"},       # anglais de Hong Kong, posé
    "FISTON": {"voix": "en-NG-AbeoNeural", "debit": -8, "hauteur": "-6Hz"},    # anglais nigérian, plus grave
    "GRACE": {"voix": "en-NG-EzinneNeural", "debit": -10, "hauteur": "+0Hz"},   # anglais nigérian, claire
    "RECEVEUR": {"voix": "en-KE-ChilembaNeural", "debit": 0, "hauteur": "+4Hz"},  # anglais kényan, crié
}


def duree(f):
    return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f],
                                capture_output=True, text=True).stdout)


async def dire(texte, qui, debit, chemin):
    v = VOIX[qui]
    proxy = os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy")  # réseau d'entreprise / cloud
    await edge_tts.Communicate(texte, v["voix"], rate=f"{debit:+d}%", pitch=v["hauteur"], proxy=proxy).save(chemin)


async def main():
    with open(os.path.join(RACINE, "scenario", "plans.json"), encoding="utf-8") as f:
        plans = json.load(f)["plans"]
    sortie = os.path.join(ICI, "audio")
    os.makedirs(sortie, exist_ok=True)
    for p in plans:
        for i, r in enumerate(p["repliques"], 1):
            chemin = os.path.join(sortie, f"plan_{p['n']:02d}_{i}_{r['qui']}.mp3")
            if os.path.exists(chemin) and "--tout" not in sys.argv:
                continue
            place = r["fin"] - r["debut"] - 0.1
            texte = r["texte"].replace('"', "")
            debit = VOIX[r["qui"]]["debit"]
            for _ in range(3 if "--ajuster" in sys.argv else 1):  # --ajuster : remplir la place prévue
                await dire(texte, r["qui"], debit, chemin)
                d, utilise = duree(chemin), debit
                ecart = d / place
                if 0.93 <= ecart <= 1.02:
                    break
                debit = int(round((1 + debit / 100) * ecart * 100 - 100))
                debit = max(-25, min(25, debit))
            print(f"[OK] {os.path.basename(chemin)}  {d:.2f} s pour {place:.2f} s (débit {utilise:+d} %) : {texte}")


if __name__ == "__main__":
    asyncio.run(main())

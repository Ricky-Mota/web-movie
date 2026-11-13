"""
Génère chaque réplique du pilote avec ElevenLabs (une réplique = un fichier MP3).

1. Créez les 4 voix dans ElevenLabs (Voice Design) avec les descriptions de scenario/plans.json
   (section « personnages »), puis copiez leurs identifiants dans voix/voix.json.
2. Mettez votre clé dans une variable d'environnement (ne la collez jamais dans un fichier du dépôt) :
       export ELEVENLABS_API_KEY="..."
3. Lancez :  python3 voix/generer_voix.py
   Les fichiers arrivent dans voix/audio/plan_03_1_CHEN.mp3, etc. Les répliques déjà créées sont sautées
   (ajoutez --tout pour tout refaire). L'assemblage (montage/assembler.py) les place au bon moment.

Rappel : l'offre gratuite d'ElevenLabs n'autorise pas l'usage commercial (chaîne YouTube monétisée).
"""
import json
import os
import sys
import urllib.request

ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.dirname(ICI)
MODELE = os.environ.get("ELEVENLABS_MODEL", "eleven_multilingual_v2")


def main():
    cle = os.environ.get("ELEVENLABS_API_KEY")
    if not cle:
        sys.exit("Définissez d'abord ELEVENLABS_API_KEY (voir l'en-tête de ce fichier).")
    with open(os.path.join(ICI, "voix.json"), encoding="utf-8") as f:
        voix = json.load(f)
    with open(os.path.join(RACINE, "scenario", "plans.json"), encoding="utf-8") as f:
        plans = json.load(f)["plans"]
    sortie = os.path.join(ICI, "audio")
    os.makedirs(sortie, exist_ok=True)
    for p in plans:
        for i, r in enumerate(p["repliques"], 1):
            v = voix[r["qui"]]
            if not v.get("voice_id") or v["voice_id"].startswith("A_REMPLIR"):
                sys.exit(f"Identifiant de voix manquant pour {r['qui']} dans voix/voix.json")
            chemin = os.path.join(sortie, f"plan_{p['n']:02d}_{i}_{r['qui']}.mp3")
            if os.path.exists(chemin) and "--tout" not in sys.argv:
                continue
            corps = json.dumps({
                "text": r["texte"],
                "model_id": MODELE,
                "voice_settings": {"stability": 0.55, "similarity_boost": 0.8, "style": 0.25,
                                   "speed": v.get("vitesse", 0.9)},
            }).encode()
            req = urllib.request.Request(
                f"https://api.elevenlabs.io/v1/text-to-speech/{v['voice_id']}?output_format=mp3_44100_128",
                data=corps, headers={"xi-api-key": cle, "Content-Type": "application/json", "Accept": "audio/mpeg"})
            with urllib.request.urlopen(req) as rep, open(chemin, "wb") as f:
                f.write(rep.read())
            print(f"[OK] {os.path.basename(chemin)} : {r['texte']}")


if __name__ == "__main__":
    main()

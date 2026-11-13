"""
Génère les sous-titres anglais du pilote à partir de scenario/plans.json :
  - sous_titres.srt  : sous-titres simples (YouTube, CapCut, DaVinci Resolve)
  - sous_titres.ass  : mêmes sous-titres avec les MOTS-CLÉS surlignés en jaune (pour la 2e diffusion de la scène)

Usage : python3 montage/sous_titres.py [dossier_sortie]
"""
import json
import os
import re
import sys

ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.dirname(ICI)

# Mots-clés de la leçon (surlignés dans la version « avec mots-clés »)
MOTS_CLES = ["Excuse me", "Good morning", "Where is", "Is it far", "very near", "Twenty minutes", "not correct",
             "city centre", "taxi-bus", "How much", "cheap", "small money", "Thank you", "You're welcome",
             "Follow me", "Goodbye", "Welcome"]

NOMS = {"CHEN": "Mr. Chen", "FISTON": "Papa Fiston", "GRACE": "Grace", "RECEVEUR": "Conductor"}


def charger():
    with open(os.path.join(RACINE, "scenario", "plans.json"), encoding="utf-8") as f:
        return json.load(f)


def repliques(scenario):
    """Liste (debut_s, fin_s, qui, texte) en temps absolu."""
    t0 = 0.0
    out = []
    for p in scenario["plans"]:
        for r in p["repliques"]:
            out.append((t0 + r["debut"], t0 + r["fin"], r["qui"], r["texte"], p["n"]))
        t0 += p["duree"]
    return out


def ts_srt(s):
    ms = round(s * 1000)
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"


def ts_ass(s):
    cs = round(s * 100)
    return f"{cs // 360000}:{cs // 6000 % 60:02d}:{cs // 100 % 60:02d}.{cs % 100:02d}"


def surligner(texte):
    for mot in sorted(MOTS_CLES, key=len, reverse=True):
        texte = re.sub(r"(?<![\w{])(" + re.escape(mot) + r")(?![\w}])", r"{\\c&H00E6FF&\\b1}\1{\\r}", texte,
                       flags=re.IGNORECASE)
    return texte


def nom_ass(qui):
    """Nom du personnage, en petit et en couleur, sur la ligne au-dessus de la réplique."""
    return "{\\fs40\\b1\\c&H0080D0FF&}" + NOMS[qui] + "{\\r}\\N"


def a_une_voix(n, i, qui):
    return os.path.exists(os.path.join(RACINE, "voix", "audio", f"plan_{n:02d}_{i}_{qui}.mp3"))


def ecrire(dossier):
    sc = charger()
    lignes = repliques(sc)
    os.makedirs(dossier, exist_ok=True)
    with open(os.path.join(dossier, "sous_titres.srt"), "w", encoding="utf-8") as f:
        for i, (a, b, qui, txt, _) in enumerate(lignes, 1):
            f.write(f"{i}\n{ts_srt(a)} --> {ts_srt(b)}\n{NOMS[qui]}: {txt}\n\n")
    entete = """[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Defaut,DejaVu Sans,58,&H00FFFFFF,&H00FFFFFF,&H00000000,&H96000000,0,0,0,0,100,100,0,0,3,3,0,2,140,140,70,1
Style: Nom,DejaVu Sans,40,&H0080D0FF,&H00FFFFFF,&H00000000,&H96000000,1,0,0,0,100,100,0,0,3,3,0,2,140,140,150,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    with open(os.path.join(dossier, "sous_titres.ass"), "w", encoding="utf-8") as f:
        f.write(entete)
        for a, b, qui, txt, _ in lignes:
            f.write(f"Dialogue: 0,{ts_ass(a)},{ts_ass(b)},Defaut,,0,0,0,,{nom_ass(qui)}{surligner(txt)}\n")
    # Répliques sans voix enregistrée : sous-titrées même dans la version « sans sous-titres »
    rangs = {}
    with open(os.path.join(dossier, "sous_titres_sans_voix.ass"), "w", encoding="utf-8") as f:
        f.write(entete)
        for a_, b_, qui, txt, n in lignes:
            rangs[n] = rangs.get(n, 0) + 1
            if not a_une_voix(n, rangs[n], qui):
                f.write(f"Dialogue: 0,{ts_ass(a_)},{ts_ass(b_)},Defaut,,0,0,0,,{nom_ass(qui)}{txt}\n")
    # Script de dialogue lisible (pour les voix et la relecture)
    with open(os.path.join(dossier, "dialogues.txt"), "w", encoding="utf-8") as f:
        for a, b, qui, txt, n in lignes:
            f.write(f"[plan {n:02d}  {ts_srt(a)[3:8]}]  {NOMS[qui].upper()} : {txt}\n")
    print(f"[OK] {len(lignes)} répliques -> {dossier}")


if __name__ == "__main__":
    ecrire(sys.argv[1] if len(sys.argv) > 1 else os.path.join(RACINE, "rendu"))

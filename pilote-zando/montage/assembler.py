"""
Montage automatique du pilote avec ffmpeg.

Entrées
  - les images rendues par Blender (rendu/images/00001.png ...) OU une vidéo de la scène (--video)
  - les voix ElevenLabs si elles existent (voix/audio/plan_XX_N_QUI.mp3), placées au bon moment
  - une ambiance de rue générée (bruit de ville + klaxons), sans fichier externe
  - le logo montage/logo.png s'il existe, sinon le texte « Zbsoss-center » en bas à droite

Sorties (dans rendu/)
  - scene_sans_sous_titres.mp4
  - scene_avec_sous_titres.mp4   (mots-clés surlignés)
  - episode_youtube.mp4          (accroche 5 s, scène sans sous-titres, scène avec sous-titres, vocabulaire, quiz)

Usage
  python3 montage/assembler.py                      # images à 24 i/s dans rendu/images
  python3 montage/assembler.py --fps-images 12      # si le rendu a été fait avec --pas 2
  python3 montage/assembler.py --video ma_scene.mp4 # si les plans viennent de Kling / CapCut
"""
import argparse
import glob
import json
import os
import subprocess
import sys

ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.dirname(ICI)
sys.path.insert(0, ICI)
import sous_titres  # noqa: E402

POLICE = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
POLICE_R = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
L, H = 1280, 720

VOCABULAIRE = [
    ("Excuse me.", "Excusez-moi."),
    ("Where is Zando market?", "Où est le marché Zando ?"),
    ("Is it far? — It is very near.", "C'est loin ? — C'est tout près."),
    ("Take a taxi-bus.", "Prenez un taxi-bus."),
    ("How much is the bus? — It is cheap.", "Combien coûte le bus ? — C'est bon marché."),
    ("Have small money with you.", "Ayez de la petite monnaie sur vous."),
    ("Follow me.", "Suivez-moi."),
    ("Thank you. — You're welcome.", "Merci. — De rien."),
]
QUIZ = [
    ("1. Where is Zando market?", "a) In Limete     b) In Gombe     c) In Matete"),
    ("2. How does Mr. Chen go to Zando?", "a) By taxi-bus     b) On foot     c) By plane"),
    ("3. Is the bus expensive?", "a) Yes, very     b) No, it is cheap"),
]
REPONSES = "Answers : 1-b   2-a   3-b"


def ff(*args):
    cmd = ["ffmpeg", "-y", "-loglevel", "error", *args]
    r = subprocess.run(cmd)
    if r.returncode:
        sys.exit("ffmpeg a échoué : " + " ".join(cmd))


def echapper(t):
    return t.replace("\\", "\\\\").replace(":", "\\:").replace("'", "’").replace("%", "\\%")


def duree(fichier):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", fichier],
                         capture_output=True, text=True).stdout
    return float(out.strip())


def logo_filtre():
    logo = os.path.join(ICI, "logo.png")
    if os.path.exists(logo):
        return logo, None
    return None, (f"drawtext=fontfile={POLICE}:text='Zbsoss-center':fontsize=22:fontcolor=white@0.85:"
                  f"box=1:boxcolor=black@0.35:boxborderw=8:x=w-tw-24:y=h-th-22")


def ambiance(duree_s, plans, sortie):
    """Bruit de rue (bruit brun filtré) + klaxons de taxi-bus aux moments où ils passent."""
    t, klaxons = 0.0, []
    for p in plans:
        if p["n"] in (1, 14):
            klaxons.append(t + (1.2 if p["n"] == 1 else 0.6))
        if p["n"] == 9:
            klaxons.append(t + 1.5)
        t += p["duree"]
    entrees = ["-f", "lavfi", "-i", f"anoisesrc=color=brown:amplitude=0.25:duration={duree_s}:seed=3"]
    filtres = ["[0]lowpass=f=700,volume=0.5[bruit]"]
    noms = ["[bruit]"]
    for i, k in enumerate(klaxons, 1):
        entrees += ["-f", "lavfi", "-i", f"sine=frequency={420 + 40 * (i % 2)}:duration=0.35",
                    "-f", "lavfi", "-i", f"sine=frequency={530 + 40 * (i % 2)}:duration=0.35"]
        a, b = 2 * i - 1, 2 * i
        ms = int(k * 1000)
        filtres.append(f"[{a}][{b}]amix=2,afade=t=in:d=0.03,afade=t=out:st=0.28:d=0.07,volume=0.25,"
                       f"adelay={ms}|{ms}[k{i}]")
        filtres.append(f"[k{i}]asplit=2[k{i}a][k{i}b]")
        ms2 = ms + 450
        filtres.append(f"[k{i}b]adelay=450|450[k{i}c]")
        noms += [f"[k{i}a]", f"[k{i}c]"]
    filtres.append("".join(noms) + f"amix=inputs={len(noms)}:normalize=0,atrim=0:{duree_s},aformat=channel_layouts=stereo[out]")
    ff(*entrees, "-filter_complex", ";".join(filtres), "-map", "[out]", "-ar", "48000", sortie)


def piste_audio(duree_s, plans, sortie, dossier_tmp):
    amb = os.path.join(dossier_tmp, "ambiance.wav")
    if os.path.exists(os.path.join(RACINE, "scenario", "evenements_son.json")):
        import sons  # bruitages calés sur l'animation (pas, taxis-bus, valise...)
        sons.generer(amb)
    else:
        ambiance(duree_s, plans, amb)
    voix = []
    t0 = 0.0
    for p in plans:
        for i, r in enumerate(p["repliques"], 1):
            f = os.path.join(RACINE, "voix", "audio", f"plan_{p['n']:02d}_{i}_{r['qui']}.mp3")
            if os.path.exists(f):
                voix.append((f, t0 + r["debut"], r["fin"] - r["debut"], r.get("gain_db", 0)))
        t0 += p["duree"]
    if not voix:
        print("[info] pas de voix dans voix/audio : ambiance seule (voir voix/generer_voix.py)")
        os.replace(amb, sortie)
        return 0
    import numpy as np
    from scipy.io import wavfile
    from scipy.ndimage import maximum_filter1d, uniform_filter1d
    sr, ambi = wavfile.read(amb)
    ambi = ambi.astype(np.float32) / 32768
    n = int(duree_s * sr)
    ambi = np.pad(ambi, ((0, max(0, n - len(ambi))), (0, 0)))[:n]
    piste_voix = np.zeros((n, 2), np.float32)
    for f, t, place, gain_db in voix:
        # chaque réplique ramenée au même volume perçu (-14 LUFS, le niveau de YouTube), plus « gain_db » si besoin,
        # légèrement accélérée seulement si elle dépasse sa place dans le plan (au plus x1,2)
        tempo = min(1.2, max(1.0, (duree(f) - 0.1) / max(place, 0.5)))
        brut = subprocess.run(["ffmpeg", "-v", "error", "-i", f, "-af",
                               f"loudnorm=I=-14:TP=-1:LRA=7,atempo={tempo:.3f},aresample={sr},volume={gain_db}dB",
                               "-ac", "2", "-f", "s16le", "-"], capture_output=True, check=True).stdout
        v = np.frombuffer(brut, np.int16).astype(np.float32).reshape(-1, 2) / 32768
        i = int(t * sr)
        m = min(len(v), n - i)
        if m > 0:
            piste_voix[i:i + m] += v[:m]
    # « ducking » : l'ambiance baisse de ~10 dB quand quelqu'un parle, puis remonte doucement
    niveau = maximum_filter1d(np.abs(piste_voix).mean(axis=1), size=int(0.25 * sr))
    parle = uniform_filter1d((niveau > 0.02).astype(np.float32), size=int(0.35 * sr))
    gain_amb = 0.85 * (1 - 0.7 * parle)
    mix = ambi * gain_amb[:, None] + piste_voix * 1.25
    # limiteur doux : seules les crêtes au-dessus de 0,8 sont arrondies, le volume des voix est conservé
    seuil = 0.8
    trop = np.abs(mix) > seuil
    mix[trop] = np.sign(mix[trop]) * (seuil + (1 - seuil) * np.tanh((np.abs(mix[trop]) - seuil) / (1 - seuil)))
    wavfile.write(sortie, sr, (mix * 32767).astype(np.int16))
    return len(voix)


def carte(sortie, fond, titre, lignes, duree_s, taille=34, interligne=1.0):
    """Carte texte (accroche, vocabulaire, quiz) sur une image floutée de la scène."""
    dt = [f"drawtext=fontfile={POLICE}:text='{echapper(titre)}':fontsize=56:fontcolor=0xFFE600:"
          f"borderw=3:bordercolor=black:x=(w-tw)/2:y=70"]
    y = 175
    for ligne, style in lignes:
        police = POLICE if style == "b" else POLICE_R
        couleur = "white" if style != "t" else "0xBFE3FF"
        dt.append(f"drawtext=fontfile={police}:text='{echapper(ligne)}':fontsize={taille}:fontcolor={couleur}:"
                  f"borderw=2:bordercolor=black:x=(w-tw)/2:y={y}")
        y += int(taille * 1.45 * interligne) + (8 if style == "t" else 0)
    vf = (f"scale={L}:{H},boxblur=12:2,eq=brightness=-0.18,"
          + ",".join(dt) + ",format=yuv420p")
    ff("-loop", "1", "-t", str(duree_s), "-i", fond, "-f", "lavfi", "-t", str(duree_s), "-i",
       "anullsrc=r=48000:cl=stereo", "-vf", vf, "-r", "24", "-c:v", "libx264", "-crf", "20", "-c:a", "aac",
       "-shortest", sortie)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--images", default=os.path.join(RACINE, "rendu", "images"))
    ap.add_argument("--fps-images", type=float, default=24)
    ap.add_argument("--video")
    ap.add_argument("--sortie", default=os.path.join(RACINE, "rendu"))
    a = ap.parse_args()

    sc = sous_titres.charger()
    plans = sc["plans"]
    duree_s = sum(p["duree"] for p in plans)
    os.makedirs(a.sortie, exist_ok=True)
    tmp = os.path.join(a.sortie, "_tmp")
    os.makedirs(tmp, exist_ok=True)
    sous_titres.ecrire(a.sortie)

    # 1. Vidéo muette de la scène, au format 1280x720, 24 i/s
    muette = os.path.join(tmp, "muette.mp4")
    if a.video:
        ff("-i", a.video, "-an", "-vf", f"scale={L}:{H}:flags=lanczos,fps=24,format=yuv420p", "-c:v", "libx264",
           "-crf", "18", muette)
    else:
        images = sorted(glob.glob(os.path.join(a.images, "*.png")))
        if not images:
            sys.exit(f"Aucune image dans {a.images}")
        ff("-framerate", str(a.fps_images), "-pattern_type", "glob", "-i", os.path.join(a.images, "*.png"),
           "-vf", f"scale={L}:{H}:flags=lanczos,fps=24,format=yuv420p", "-c:v", "libx264", "-crf", "18", muette)

    # 2. Son : ambiance + voix
    audio = os.path.join(tmp, "audio.wav")
    nb = piste_audio(duree_s, plans, audio, tmp)

    # 3. Les deux versions de la scène
    logo, texte_logo = logo_filtre()
    ass = os.path.join(a.sortie, "sous_titres.ass").replace(":", "\\:")
    sans_voix = os.path.join(a.sortie, "sous_titres_sans_voix.ass")
    st_sans = sans_voix.replace(":", "\\:") if "Dialogue:" in open(sans_voix, encoding="utf-8").read() else None
    for nom, st in (("scene_sans_sous_titres.mp4", st_sans), ("scene_avec_sous_titres.mp4", ass)):
        chemin = os.path.join(a.sortie, nom)
        if logo:
            fc = f"[1]scale=150:-1[lg];[0][lg]overlay=W-w-24:H-h-22" + (f",ass='{st}'" if st else "") + "[v]"
            ff("-i", muette, "-i", logo, "-i", audio, "-filter_complex", fc, "-map", "[v]", "-map", "2:a",
               "-c:v", "libx264", "-crf", "20", "-c:a", "aac", "-b:a", "160k", "-shortest", chemin)
        else:
            vf = texte_logo + (f",ass='{st}'" if st else "")
            ff("-i", muette, "-i", audio, "-vf", vf, "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-crf", "20",
               "-c:a", "aac", "-b:a", "160k", "-shortest", chemin)
        print("[OK]", chemin)

    # 4. Épisode YouTube : accroche, scène x2, vocabulaire, quiz
    fond = os.path.join(tmp, "fond.png")
    ff("-ss", f"{min(20, duree(muette) / 3):.2f}", "-i", muette, "-frames:v", "1", fond)
    accroche = os.path.join(tmp, "1_accroche.mp4")
    ff("-ss", f"{min(26.5, max(0, duree(muette) - 6)):.2f}", "-t", "5", "-i", os.path.join(a.sortie, "scene_sans_sous_titres.mp4"), "-vf",
       f"drawtext=fontfile={POLICE}:text='Where is Zando?':fontsize=96:fontcolor=0xFFE600:borderw=5:bordercolor=black:"
       f"x=(w-tw)/2:y=h*0.18:enable='gte(t,0.3)',"
       f"drawtext=fontfile={POLICE_R}:text='English for beginners  •  A1-A2':fontsize=38:fontcolor=white:"
       f"borderw=3:bordercolor=black:x=(w-tw)/2:y=h*0.18+120:enable='gte(t,0.8)'",
       "-c:v", "libx264", "-crf", "20", "-c:a", "aac", "-ar", "48000", "-ac", "2", accroche)
    inter = os.path.join(tmp, "3_inter.mp4")
    carte(inter, fond, "Watch again with subtitles", [("Regardez encore, avec les sous-titres", "t")], 3)
    vocab = os.path.join(tmp, "5_vocab.mp4")
    lignes = []
    for en, fr in VOCABULAIRE:
        lignes += [(en, "b"), (fr, "t")]
    carte(vocab, fond, "Key phrases  •  Phrases clés", lignes, 20, taille=24, interligne=0.95)
    quiz = os.path.join(tmp, "6_quiz.mp4")
    lignes = []
    for q, r in QUIZ:
        lignes += [(q, "b"), (r, "t"), ("", "t")]
    carte(quiz, fond, "Mini quiz", lignes, 14, taille=34)
    rep = os.path.join(tmp, "7_reponses.mp4")
    carte(rep, fond, "Mini quiz", [(REPONSES, "b"), ("", "t"), ("See you in episode 2!", "t")], 5, taille=44)
    liste = os.path.join(tmp, "liste.txt")
    bruts = [accroche, os.path.join(a.sortie, "scene_sans_sous_titres.mp4"), inter,
             os.path.join(a.sortie, "scene_avec_sous_titres.mp4"), vocab, quiz, rep]
    morceaux = []
    for k, m in enumerate(bruts):  # fondus d'ouverture et de fermeture entre les parties
        d = duree(m)
        sortie_f = os.path.join(tmp, f"fondu_{k}.mp4")
        ff("-i", m, "-vf", f"fade=t=in:st=0:d=0.4,fade=t=out:st={d - 0.45:.2f}:d=0.45,fps=24,format=yuv420p",
           "-af", f"afade=t=in:st=0:d=0.3,afade=t=out:st={d - 0.45:.2f}:d=0.45,aresample=48000",
           "-ac", "2", "-c:v", "libx264", "-crf", "19", "-c:a", "aac", "-b:a", "192k", sortie_f)
        morceaux.append(sortie_f)
    with open(liste, "w") as f:
        for m in morceaux:
            f.write(f"file '{m}'\n")
    episode = os.path.join(a.sortie, "episode_youtube.mp4")
    ff("-f", "concat", "-safe", "0", "-i", liste, "-vf", "fps=24,format=yuv420p", "-c:v", "libx264", "-crf", "20",
       "-c:a", "aac", "-ar", "48000", "-ac", "2", episode)
    print(f"[OK] {episode}  ({duree(episode):.0f} s, {nb} voix intégrées)")


if __name__ == "__main__":
    main()

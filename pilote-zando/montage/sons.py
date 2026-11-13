"""
Bruitages et ambiance de rue de Kinshasa, synthétisés (aucun fichier son externe, libres de droits).

Lit scenario/evenements_son.json (écrit par blender/construire_scene.py) et produit un fichier WAV stéréo :
  - fond de ville : grondement de circulation, brouhaha lointain, klaxons au loin, oiseaux ;
  - pas de Mr. Chen et de Grace (et des passants, plus discrets) calés sur leur marche ;
  - roulettes de la valise, journal froissé ;
  - taxis-bus : passage, arrivée avec freinage, moteur au ralenti, départ.

Usage : python3 montage/sons.py sortie.wav
Dépendances : numpy, scipy (pip install numpy scipy)
"""
import json
import os
import sys

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt

ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.dirname(ICI)
SR = 48000
rng = np.random.default_rng(7)


def filtre(x, bas=None, haut=None, ordre=2):
    """Passe-bande (bas, haut en Hz) ; bas seul = passe-haut, haut seul = passe-bas."""
    if bas and haut:
        sos = butter(ordre, [bas, haut], btype="band", fs=SR, output="sos")
    elif bas:
        sos = butter(ordre, bas, btype="high", fs=SR, output="sos")
    else:
        sos = butter(ordre, haut, btype="low", fs=SR, output="sos")
    return sosfilt(sos, x)


def bruit(n):
    return rng.standard_normal(n)


def enveloppe_lente(n, hz, profondeur):
    """Variation lente et aléatoire du volume (1 ± profondeur)."""
    pts = max(4, int(n / SR * hz) + 2)
    v = rng.uniform(-1, 1, pts)
    env = np.interp(np.linspace(0, pts - 1, n), np.arange(pts), v)
    return 1 + profondeur * env


def ajouter(piste, debut_s, son, gain=1.0, pan=0.0):
    i = int(debut_s * SR)
    if i >= piste.shape[0] or i + len(son) <= 0:
        return
    if i < 0:
        son, i = son[-i:], 0
    son = son[: piste.shape[0] - i] * gain
    g, d = np.sqrt((1 - pan) / 2), np.sqrt((1 + pan) / 2)
    piste[i:i + len(son), 0] += son * g * 1.41
    piste[i:i + len(son), 1] += son * d * 1.41


# ---------------------------------------------------------------- fond de ville
def fond(n):
    t = np.arange(n) / SR
    out = np.zeros((n, 2))
    for c in range(2):
        brun = np.cumsum(bruit(n))
        brun = filtre(brun, bas=25)
        brun = filtre(brun, haut=320) / (np.std(brun) + 1e-9)
        circulation = brun * enveloppe_lente(n, 0.3, 0.35) * 0.09
        voix = filtre(bruit(n), 250, 2600, ordre=3)
        syll = filtre(np.abs(bruit(n)), haut=5)  # modulation « syllabique » du brouhaha
        syll = syll / (np.max(np.abs(syll)) + 1e-9)
        brouhaha = voix / np.std(voix) * (0.4 + syll) * enveloppe_lente(n, 0.2, 0.4) * 0.022
        out[:, c] = circulation + brouhaha
    # klaxons au loin
    k = rng.uniform(3, 8)
    while k < n / SR - 1:
        dur = rng.uniform(0.18, 0.4)
        tt = np.arange(int(dur * SR)) / SR
        f1 = rng.choice([392, 415, 440, 466])
        s = np.sign(np.sin(2 * np.pi * f1 * tt)) + np.sign(np.sin(2 * np.pi * f1 * 1.26 * tt))
        s = filtre(s, haut=1800) * np.minimum(1, np.minimum(tt / 0.02, (dur - tt) / 0.04))
        g = rng.uniform(0.012, 0.03)
        ajouter(out, k, s, g, rng.uniform(-0.8, 0.8))
        if rng.random() < 0.4:  # double coup de klaxon
            ajouter(out, k + dur + 0.12, s, g, rng.uniform(-0.8, 0.8))
        k += rng.uniform(5, 13)
    # oiseaux
    k = rng.uniform(1, 4)
    while k < n / SR - 1:
        for j in range(rng.integers(2, 5)):
            dur = rng.uniform(0.05, 0.11)
            tt = np.arange(int(dur * SR)) / SR
            f0, f1 = rng.uniform(2600, 3400), rng.uniform(3800, 5200)
            ph = 2 * np.pi * np.cumsum(f0 + (f1 - f0) * tt / dur) / SR
            s = np.sin(ph) * np.sin(np.pi * tt / dur) ** 2
            ajouter(out, k + j * rng.uniform(0.12, 0.2), s, rng.uniform(0.008, 0.016), rng.uniform(-0.6, 0.6))
        k += rng.uniform(3, 9)
    _ = t
    return out


# ---------------------------------------------------------------- bruitages
def pas(qui):
    """Un pas sur la terre battue : choc sourd + crissement de terre."""
    dur = 0.16
    tt = np.arange(int(dur * SR)) / SR
    b = bruit(len(tt))
    if qui == "GRACE":  # baskets : plus doux
        choc, grain, tau = filtre(b, haut=380), filtre(b, 1500, 4500) * 0.18, 0.022
    else:  # chaussures de ville
        choc, grain, tau = filtre(b, haut=650), filtre(b, 1800, 6000) * 0.32, 0.018
    s = (choc / (np.std(choc) + 1e-9) + grain / (np.std(b) + 1e-9) * 0.6) * np.exp(-tt / tau)
    talon = int(rng.uniform(0.05, 0.08) * SR)  # la pointe suit le talon
    s[talon:] += s[: len(s) - talon] * 0.45
    return s * rng.uniform(0.8, 1.1)


def valise(dur):
    n = int(dur * SR)
    tt = np.arange(n) / SR
    roulement = filtre(bruit(n), 120, 700) * (0.7 + 0.3 * np.sin(2 * np.pi * 9 * tt))
    roulement /= np.std(roulement) + 1e-9
    clics = np.zeros(n)
    k = 0.0
    while k < dur:
        i = int(k * SR)
        m = min(n - i, int(0.03 * SR))
        clics[i:i + m] += filtre(bruit(m), haut=1500) * np.exp(-np.arange(m) / (0.006 * SR)) * 2
        k += rng.uniform(0.25, 0.45)
    s = roulement + clics
    fade = np.minimum(1, np.minimum(tt / 0.15, (dur - tt) / 0.2))
    return s * fade


def journal():
    dur = 0.7
    n = int(dur * SR)
    s = filtre(bruit(n), bas=1800)
    env = np.zeros(n)
    for _ in range(6):
        c = rng.uniform(0, dur - 0.1)
        i = int(c * SR)
        m = int(rng.uniform(0.04, 0.12) * SR)
        env[i:i + m] += np.hanning(m)
    return s * env


def moteur(dur, f_debut, f_fin, gain_debut, gain_fin):
    """Moteur diesel : harmoniques d'une fréquence d'allumage + bruit mécanique."""
    n = int(dur * SR)
    tt = np.arange(n) / SR
    f = np.linspace(f_debut, f_fin, n) * (1 + 0.015 * np.sin(2 * np.pi * 0.7 * tt))
    ph = 2 * np.pi * np.cumsum(f) / SR
    s = sum(np.sin(h * ph) / h ** 0.8 for h in range(1, 9))
    claquement = filtre(bruit(n), 300, 1500) * (0.5 + 0.5 * np.sin(ph * 2)) * 0.5
    s = filtre(s + claquement, haut=1400)
    s /= np.std(s) + 1e-9
    return s * np.linspace(gain_debut, gain_fin, n)


def bus(e):
    dur = e["fin"] - e["debut"]
    d = 1.0 if e.get("distance", 9) < 7 else 0.6
    if e["type"] == "bus_passe":
        n = int(dur * SR)
        tt = np.arange(n) / SR
        centre = dur * 0.45
        prox = 1 / (1 + ((tt - centre) / (dur * 0.12)) ** 2)
        doppler = 1 + 0.05 * np.tanh(-(tt - centre) / 0.6)
        s = moteur(dur, 48, 48, 1, 1)
        ph = 2 * np.pi * np.cumsum(48 * doppler) / SR
        s = s * 0.6 + filtre(np.sin(ph) + 0.5 * np.sin(2 * ph), haut=900) * 0.6
        roulage = filtre(bruit(n), 200, 2500) * 0.4
        pan = np.tanh((tt - centre) / (dur * 0.2))  # de gauche à droite
        out = (s + roulage) * prox * 0.16 * d
        return out, pan
    if e["type"] == "bus_arrive":
        s = moteur(dur, 52, 34, 0.08, 0.2)
        n = len(s)
        frein = int(max(0, dur - 0.9) * SR)
        sifflement = filtre(bruit(n - frein), bas=3500) * np.linspace(0.12, 0, n - frein)
        crissement = np.sin(2 * np.pi * 2900 * np.arange(n - frein) / SR) * np.linspace(0.025, 0, n - frein)
        s[frein:] += sifflement + crissement
        return s * d, -0.5
    if e["type"] == "bus_moteur":
        return moteur(dur, 33, 33, 0.07, 0.07) * d, -0.5
    if e["type"] == "bus_part":
        n = int(dur * SR)
        s = moteur(dur, 34, 62, 0.22, 0.05)
        s *= np.minimum(1, (n - np.arange(n)) / (0.8 * SR))
        return s * d, -0.7
    return None, 0


GAINS_PAS = {"CHEN": 0.7, "GRACE": 0.55}


def generer(sortie, chemin_json=None):
    with open(chemin_json or os.path.join(RACINE, "scenario", "evenements_son.json"), encoding="utf-8") as f:
        d = json.load(f)
    n = int(d["duree"] * SR)
    piste = fond(n)
    for e in d["evenements"]:
        ty = e["type"]
        if ty == "pas":
            proche = e["qui"] in GAINS_PAS
            g = GAINS_PAS.get(e["qui"], 0.04 if e["qui"] in ("FIGURANT_2", "FIGURANT_3") else 0.1)
            ajouter(piste, e["t"] + 0.02, pas(e["qui"]), g, 0.0 if proche else rng.uniform(-0.7, 0.7))
        elif ty == "valise":
            ajouter(piste, e["debut"], valise(e["fin"] - e["debut"]), 0.05, -0.1)
        elif ty == "journal":
            ajouter(piste, e["t"], journal(), 0.12, 0.3)
        elif ty.startswith("bus"):
            s, pan = bus(e)
            if s is None:
                continue
            if np.ndim(pan) == 0:
                ajouter(piste, e["debut"], s, 1.0, float(pan))
            else:
                i = int(e["debut"] * SR)
                m = min(len(s), n - i)
                piste[i:i + m, 0] += s[:m] * np.sqrt((1 - pan[:m]) / 2) * 1.41
                piste[i:i + m, 1] += s[:m] * np.sqrt((1 + pan[:m]) / 2) * 1.41
    crete = np.max(np.abs(piste))
    piste = piste / crete * 0.6 if crete > 0.6 else piste
    wavfile.write(sortie, SR, (piste * 32767).astype(np.int16))
    print(f"[OK] ambiance et bruitages : {sortie} ({d['duree']:.1f} s, {len(d['evenements'])} événements)")


if __name__ == "__main__":
    generer(sys.argv[1] if len(sys.argv) > 1 else os.path.join(RACINE, "rendu", "ambiance.wav"))

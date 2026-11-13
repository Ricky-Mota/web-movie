"""
Where is Zando? — construction automatique de la scène 3D du pilote.

Ce script crée dans Blender (4.2 ou plus récent) :
  - le décor : coin de rue de Kinshasa, kiosque bleu, tabouret, trottoir en terre rouge,
    route, taxis-bus jaunes et bleus, palmiers, immeubles bas, vendeurs ambulants ;
  - les 3 personnages avec leur tenue FIXE (Mr. Chen, Papa Fiston, Grace) ;
  - les 19 plans du découpage : une caméra par plan, coupée au bon moment (marqueurs) ;
  - les animations : marche, gestes, bouche qui parle pendant les répliques.

Utilisation
  Dans Blender : onglet Scripting > Ouvrir ce fichier > Exécuter.
  En ligne de commande :
    blender -b -P construire_scene.py -- --qualite apercu  --rendu
    blender -b -P construire_scene.py -- --qualite final   --rendu
    blender -b -P construire_scene.py -- --references          (fiches personnages + décor)
    blender -b -P construire_scene.py -- --images-plans        (une image clé par plan)
  Options : --plans 3,6,10  (ne rendre que certains plans), --sortie DOSSIER, --blend FICHIER.blend

Avec Blender MCP : ouvrez Blender, lancez ce script une fois, puis demandez à Claude
d'ajuster un plan (« rapproche la caméra du plan 6 », « change la couleur du kiosque »...).
Les objets ont des noms explicites (CHEN_tete, CAM_06, KIOSQUE...).
"""
import bpy
import json
import math
import os
import random
import sys

ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.dirname(ICI)
PLANS_JSON = os.path.join(RACINE, "scenario", "plans.json")

# --------------------------------------------------------------------------------------
# Arguments
# --------------------------------------------------------------------------------------
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def opt(nom, defaut=None):
    if nom in argv:
        i = argv.index(nom)
        if i + 1 < len(argv) and not argv[i + 1].startswith("--"):
            return argv[i + 1]
        return True
    return defaut


QUALITE = opt("--qualite", "apercu")
SORTIE = opt("--sortie", os.path.join(RACINE, "rendu"))
FPS = 24
random.seed(7)

with open(PLANS_JSON, encoding="utf-8") as f:
    SCENARIO = json.load(f)
PLANS = SCENARIO["plans"]

# Début (en images) de chaque plan
DEBUT = {}
_f = 1
for p in PLANS:
    DEBUT[p["n"]] = _f
    _f += round(p["duree"] * FPS)
FIN_TOTALE = _f - 1


def F(plan, t=0.0):
    """Numéro d'image absolu pour le plan `plan` à `t` secondes."""
    return DEBUT[plan] + round(t * FPS)


def rad(d):
    return math.radians(d)


# --------------------------------------------------------------------------------------
# Remise à zéro
# --------------------------------------------------------------------------------------
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.name = "WhereIsZando"
scene.render.fps = FPS
scene.frame_start = 1
scene.frame_end = FIN_TOTALE

COLL = {}


def collection(nom):
    if nom not in COLL:
        c = bpy.data.collections.new(nom)
        scene.collection.children.link(c)
        COLL[nom] = c
    return COLL[nom]


def lier(obj, coll):
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    collection(coll).objects.link(obj)


# --------------------------------------------------------------------------------------
# Matériaux
# --------------------------------------------------------------------------------------
MATS = {}


def mat(nom, couleur, rugo=0.6, emission=0.0, sss=0.0):
    if nom in MATS:
        return MATS[nom]
    m = bpy.data.materials.new(nom)
    m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (*couleur, 1)
    b.inputs["Roughness"].default_value = rugo
    if sss and "Subsurface Weight" in b.inputs:
        b.inputs["Subsurface Weight"].default_value = sss
        b.inputs["Subsurface Radius"].default_value = (0.3, 0.12, 0.08)
        b.inputs["Subsurface Scale"].default_value = 0.02
    if emission:
        b.inputs["Emission Color"].default_value = (*couleur, 1)
        b.inputs["Emission Strength"].default_value = emission
    m.diffuse_color = (*couleur, 1)
    MATS[nom] = m
    return m


def mat_wax(nom="WAX_orange_vert"):
    """Tissu wax à motifs orange et vert (procédural)."""
    if nom in MATS:
        return MATS[nom]
    m = bpy.data.materials.new(nom)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes.get("Principled BSDF")
    b.inputs["Roughness"].default_value = 0.7
    coord = nt.nodes.new("ShaderNodeTexCoord")
    vor = nt.nodes.new("ShaderNodeTexVoronoi")
    vor.inputs["Scale"].default_value = 18.0
    wave = nt.nodes.new("ShaderNodeTexWave")
    wave.inputs["Scale"].default_value = 9.0
    wave.inputs["Distortion"].default_value = 4.0
    ramp1 = nt.nodes.new("ShaderNodeValToRGB")
    ramp1.color_ramp.elements[0].position = 0.25
    ramp1.color_ramp.elements[0].color = (0.95, 0.42, 0.04, 1)
    ramp1.color_ramp.elements[1].position = 0.3
    ramp1.color_ramp.elements[1].color = (0.08, 0.5, 0.18, 1)
    ramp2 = nt.nodes.new("ShaderNodeValToRGB")
    ramp2.color_ramp.elements[0].position = 0.45
    ramp2.color_ramp.elements[0].color = (1.0, 0.75, 0.2, 1)
    ramp2.color_ramp.elements[1].position = 0.55
    ramp2.color_ramp.elements[1].color = (0.0, 0.0, 0.0, 0)
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    nt.links.new(coord.outputs["Object"], vor.inputs["Vector"])
    nt.links.new(coord.outputs["Object"], wave.inputs["Vector"])
    nt.links.new(vor.outputs["Distance"], ramp2.inputs["Fac"])
    nt.links.new(wave.outputs["Fac"], ramp1.inputs["Fac"])
    nt.links.new(ramp1.outputs["Color"], mix.inputs[6])
    nt.links.new(ramp2.outputs["Color"], mix.inputs[7])
    nt.links.new(ramp2.outputs["Alpha"], mix.inputs["Factor"])
    nt.links.new(mix.outputs[2], b.inputs["Base Color"])
    m.diffuse_color = (0.95, 0.45, 0.05, 1)
    MATS[nom] = m
    return m


def mat_tresses(nom="TRESSES"):
    if nom in MATS:
        return MATS[nom]
    m = bpy.data.materials.new(nom)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes.get("Principled BSDF")
    b.inputs["Roughness"].default_value = 0.45
    coord = nt.nodes.new("ShaderNodeTexCoord")
    wave = nt.nodes.new("ShaderNodeTexWave")
    wave.inputs["Scale"].default_value = 40.0
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (0.01, 0.008, 0.006, 1)
    ramp.color_ramp.elements[1].color = (0.09, 0.05, 0.03, 1)
    nt.links.new(coord.outputs["Object"], wave.inputs["Vector"])
    nt.links.new(wave.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], b.inputs["Base Color"])
    m.diffuse_color = (0.03, 0.02, 0.015, 1)
    MATS[nom] = m
    return m


# --------------------------------------------------------------------------------------
# Primitives
# --------------------------------------------------------------------------------------
def vide(nom, loc=(0, 0, 0), parent=None, coll="Decor", rot=(0, 0, 0)):
    o = bpy.data.objects.new(nom, None)
    o.empty_display_size = 0.08
    collection(coll).objects.link(o)
    o.parent = parent
    o.location = loc
    o.rotation_euler = rot
    return o


def prim(type_, nom, loc=(0, 0, 0), echelle=(1, 1, 1), m=None, parent=None, rot=(0, 0, 0),
         coll="Decor", lisse=True, biseau=0.0, **kw):
    ops = {
        "cube": bpy.ops.mesh.primitive_cube_add,
        "sphere": bpy.ops.mesh.primitive_uv_sphere_add,
        "cyl": bpy.ops.mesh.primitive_cylinder_add,
        "cone": bpy.ops.mesh.primitive_cone_add,
        "tore": bpy.ops.mesh.primitive_torus_add,
        "plan": bpy.ops.mesh.primitive_plane_add,
    }
    if type_ == "sphere":
        kw.setdefault("segments", 32)
        kw.setdefault("ring_count", 16)
    if type_ == "cyl":
        kw.setdefault("vertices", 24)
    ops[type_](**kw)
    o = bpy.context.active_object
    o.name = nom
    o.scale = echelle
    o.rotation_euler = rot
    if parent is not None:
        o.parent = parent
    o.location = loc
    if m is not None:
        o.data.materials.append(m)
    if lisse and type_ != "plan":
        bpy.ops.object.shade_smooth()
    if biseau:
        mod = o.modifiers.new("Biseau", "BEVEL")
        mod.width = biseau
        mod.segments = 3
    lier(o, coll)
    return o


def membre(nom, longueur, rayon, m, parent, coll, decalage=(0, 0, 0)):
    """Cylindre arrondi qui pend sous son pivot (axe -Z)."""
    o = prim("cyl", nom, loc=(decalage[0], decalage[1], decalage[2] - longueur / 2),
             echelle=(rayon, rayon, longueur / 2), m=m, parent=parent, coll=coll)
    prim("sphere", nom + "_bout", loc=(decalage[0], decalage[1], decalage[2] - longueur),
         echelle=(rayon, rayon, rayon), m=m, parent=parent, coll=coll)
    prim("sphere", nom + "_haut", loc=decalage, echelle=(rayon, rayon, rayon), m=m,
         parent=parent, coll=coll)
    return o


def texte(nom, corps, loc, taille, m, parent=None, rot=(rad(90), 0, 0), coll="Decor", epaisseur=0.005):
    cu = bpy.data.curves.new(nom, "FONT")
    cu.body = corps
    cu.size = taille
    cu.align_x = "CENTER"
    cu.align_y = "CENTER"
    cu.extrude = epaisseur
    o = bpy.data.objects.new(nom, cu)
    collection(coll).objects.link(o)
    o.data.materials.append(m)
    o.parent = parent
    o.location = loc
    o.rotation_euler = rot
    return o


# --------------------------------------------------------------------------------------
# Images clés
# --------------------------------------------------------------------------------------
CLES = {}  # (objet, propriété) -> {image: valeur}


def cle(obj, frame, loc=None, rot=None, ech=None):
    for prop, val in (("location", loc), ("rotation_euler", None if rot is None else [rad(a) for a in rot]),
                      ("scale", ech)):
        if val is None:
            continue
        setattr(obj, prop, val)
        obj.keyframe_insert(prop, frame=frame)
        CLES.setdefault((obj.name, prop), {})[frame] = tuple(val)


def maintenir_poses(seuil=36, transition=8):
    """Entre deux clés très éloignées, garde la pose précédente puis fait le geste en `transition` images
    (évite les mouvements lents et involontaires entre deux gestes séparés de plusieurs plans)."""
    for (nom, prop), cles in CLES.items():
        if prop == "location" and (nom.startswith(("TAXIBUS", "CAM_")) or "_" not in nom or nom.startswith("FIGURANT") and nom.count("_") == 1):
            continue
        if nom.startswith("CAM_"):
            continue
        obj = bpy.data.objects[nom]
        frames = sorted(cles)
        for a, b in zip(frames, frames[1:]):
            if b - a > seuil:
                setattr(obj, prop, cles[a])
                obj.keyframe_insert(prop, frame=b - transition)


def cap_vers(depuis, vers):
    """Rotation Z (degrés) pour qu'un personnage (qui regarde -Y) regarde un point."""
    dx, dy = vers[0] - depuis[0], vers[1] - depuis[1]
    return math.degrees(math.atan2(dx, -dy))


# --------------------------------------------------------------------------------------
# Personnages
# --------------------------------------------------------------------------------------
PERSOS = {}


class Perso:
    pass


def construire_perso(code, cfg, coll="Personnages"):
    """Personnage stylisé, regardant -Y, pivots articulés (hanches, genoux, épaules, coudes, tête)."""
    p = Perso()
    p.code = code
    s = cfg.get("taille", 1.0)
    peau = mat(code + "_peau", cfg["peau"], 0.5, sss=0.15)
    haut = cfg.get("mat_haut") or mat(code + "_haut", cfg["haut"], 0.75)
    bas = mat(code + "_bas", cfg["bas"], 0.8)
    chaussure = mat(code + "_chaussures", cfg["chaussures"], 0.5)
    noir = mat("NOIR_yeux", (0.01, 0.01, 0.01), 0.2)
    blanc = mat("BLANC_yeux", (0.95, 0.95, 0.95), 0.25)
    bouche = mat("BOUCHE", (0.25, 0.04, 0.05), 0.5)
    cheveux = cfg.get("mat_cheveux") or mat(code + "_cheveux", cfg["cheveux"], 0.5)

    cuisse, tibia = 0.39 * s, 0.39 * s
    tronc = 0.52 * s
    p.racine = vide(code, coll=coll)
    p.bassin = vide(code + "_bassin", (0, 0, cuisse + tibia + 0.06), p.racine, coll)
    # Tronc et bassin
    prim("sphere", code + "_hanches", (0, 0, 0.02), (0.17 * s, 0.12 * s, 0.11 * s), bas, p.bassin, coll=coll)
    p.torse = vide(code + "_torse", (0, 0, 0.04), p.bassin, coll)
    corps = prim("cyl", code + "_corps", (0, 0, tronc / 2), (0.165 * s * cfg.get("carrure", 1), 0.115 * s, tronc / 2),
                 haut, p.torse, coll=coll, biseau=0.06)
    prim("sphere", code + "_epaules", (0, 0, tronc - 0.02), (0.2 * s * cfg.get("carrure", 1), 0.12 * s, 0.07 * s),
         haut, p.torse, coll=coll)
    if cfg.get("ventre"):
        prim("sphere", code + "_ventre", (0, -0.03, tronc * 0.35), (0.17 * s, 0.14 * s, 0.17 * s), haut, p.torse, coll=coll)
    # Jambes
    p.hanche, p.genou = {}, {}
    for cote, nomc in ((1, "G"), (-1, "D")):  # G = gauche du personnage (+X), D = droite (-X)
        h = vide(f"{code}_hanche_{nomc}", (cote * 0.085 * s, 0, 0), p.bassin, coll)
        membre(f"{code}_cuisse_{nomc}", cuisse, 0.068 * s, bas, h, coll)
        g = vide(f"{code}_genou_{nomc}", (0, 0, -cuisse), h, coll)
        membre(f"{code}_tibia_{nomc}", tibia, 0.058 * s, bas, g, coll)
        if cfg.get("sandales"):
            prim("sphere", f"{code}_pied_{nomc}", (0, -0.05, -tibia - 0.035), (0.055, 0.11, 0.035), peau, g, coll=coll)
            prim("cube", f"{code}_semelle_{nomc}", (0, -0.05, -tibia - 0.065), (0.065, 0.125, 0.012), chaussure, g,
                 coll=coll, biseau=0.01)
        else:
            prim("sphere", f"{code}_chaussure_{nomc}", (0, -0.05, -tibia - 0.04), (0.065, 0.12, 0.05), chaussure, g, coll=coll)
            if cfg.get("semelle_blanche"):
                prim("cube", f"{code}_semelleb_{nomc}", (0, -0.05, -tibia - 0.075), (0.066, 0.12, 0.015),
                     mat("BLANC_semelle", (0.97, 0.97, 0.97), 0.4), g, coll=coll, biseau=0.01)
        p.hanche[nomc], p.genou[nomc] = h, g
    # Bras
    p.epaule, p.coude, p.main = {}, {}, {}
    manche = cfg.get("manche", "courte")
    for cote, nomc in ((1, "G"), (-1, "D")):
        e = vide(f"{code}_epaule_{nomc}", (cote * 0.2 * s * cfg.get("carrure", 1), 0, tronc - 0.04), p.torse, coll)
        mb = haut if manche in ("courte", "longue") else peau
        membre(f"{code}_bras_{nomc}", 0.28 * s, 0.05 * s, peau, e, coll)
        prim("cyl", f"{code}_manche_{nomc}", (0, 0, -0.07 * s), (0.066 * s, 0.066 * s, 0.09 * s), mb, e, coll=coll)
        c = vide(f"{code}_coude_{nomc}", (0, 0, -0.28 * s), e, coll)
        avb = haut if manche == "longue" else peau
        membre(f"{code}_avantbras_{nomc}", 0.25 * s, 0.043 * s, avb, c, coll)
        mn = vide(f"{code}_main_{nomc}", (0, 0, -0.27 * s), c, coll)
        prim("sphere", f"{code}_paume_{nomc}", (0, 0, -0.02), (0.05 * s, 0.035 * s, 0.065 * s), peau, mn, coll=coll)
        prim("sphere", f"{code}_pouce_{nomc}", (-cote * 0.0, -0.035, 0.0), (0.018, 0.018, 0.035), peau, mn, coll=coll,
             rot=(rad(-30), 0, 0))
        p.epaule[nomc], p.coude[nomc], p.main[nomc] = e, c, mn
    # Tête
    p.cou = vide(code + "_cou", (0, 0, tronc + 0.02), p.torse, coll)
    prim("cyl", code + "_coup", (0, 0, 0.04), (0.05 * s, 0.05 * s, 0.06), peau, p.cou, coll=coll)
    p.tete = vide(code + "_tete", (0, 0, 0.1), p.cou, coll)
    R = 0.17 * s * cfg.get("tete", 1)
    p.R = R
    prim("sphere", code + "_crane", (0, 0, R), (R * cfg.get("tete_l", 0.92), R, R * cfg.get("tete_h", 1.08)),
         peau, p.tete, coll=coll)
    # oreilles
    for cote in (1, -1):
        prim("sphere", f"{code}_oreille_{cote}", (cote * R * 0.9, 0.01, R), (0.02, 0.03, 0.04), peau, p.tete, coll=coll)
    # nez
    prim("sphere", code + "_nez", (0, -R * 1.0, R * 0.93), (0.028 * s, 0.03, 0.03 * s), peau, p.tete, coll=coll)
    # yeux
    p.sourcils = []
    for cote in (1, -1):
        prim("sphere", f"{code}_oeil_{cote}", (cote * R * 0.36, -R * 0.84, R * 1.12), (0.033, 0.02, 0.038), blanc,
             p.tete, coll=coll)
        prim("sphere", f"{code}_pupille_{cote}", (cote * R * 0.36, -R * 0.84 - 0.018, R * 1.11), (0.019, 0.008, 0.022),
             noir, p.tete, coll=coll)
        sc = prim("cube", f"{code}_sourcil_{cote}", (cote * R * 0.37, -R * 0.84, R * 1.42), (0.035, 0.01, 0.008),
                  mat(code + "_sourcils", cfg.get("sourcils", cfg["cheveux"]), 0.6), p.tete, coll=coll,
                  rot=(0, rad(cote * -8), 0), biseau=0.004)
        p.sourcils.append(sc)
    p.bouche = prim("sphere", code + "_bouche", (0, -R * 0.93, R * 0.64), (0.045, 0.02, 0.012), bouche, p.tete, coll=coll)
    # sourire
    prim("tore", code + "_sourire", (0, -R * 0.9, R * 0.7), (0.05, 0.05, 0.04), mat("LEVRES_" + code, tuple(c * 0.7 for c in cfg["peau"]), 0.5),
         p.tete, coll=coll, rot=(rad(90), 0, 0), major_radius=1, minor_radius=0.12, major_segments=24, minor_segments=8)
    # cheveux
    hc = cfg.get("coupe", "court")
    if hc == "court":
        prim("sphere", code + "_cheveux", (0, 0.02, R * 1.2), (R * 0.97, R * 1.0, R * 0.96), cheveux, p.tete, coll=coll)
        prim("sphere", code + "_frange", (0.02, -R * 0.55, R * 1.62), (R * 0.75, R * 0.35, R * 0.2), cheveux, p.tete,
             coll=coll, rot=(rad(-15), 0, rad(-6)))
    elif hc == "ras":
        prim("sphere", code + "_cheveux", (0, 0.03, R * 1.2), (R * 0.95, R * 0.98, R * 0.94), cheveux, p.tete, coll=coll)
    elif hc == "tresses":
        prim("sphere", code + "_cheveux", (0, 0.02, R * 1.2), (R * 0.98, R * 1.02, R * 0.92), cheveux, p.tete, coll=coll)
        prim("sphere", code + "_chignon", (0, R * 0.95, R * 1.55), (0.06, 0.06, 0.06), cheveux, p.tete, coll=coll)
        for i in range(6):
            prim("sphere", f"{code}_tresse_{i}", (0, R * 1.05 + i * 0.008, R * 1.45 - i * 0.06),
                 (0.042 - i * 0.003, 0.042 - i * 0.003, 0.04), cheveux, p.tete, coll=coll)
    if cfg.get("barbiche"):
        prim("cone", code + "_barbiche", (0, -R * 0.8, R * 0.38), (0.035, 0.03, 0.05),
             mat(code + "_barbe", cfg["cheveux"], 0.7), p.tete, coll=coll, rot=(rad(180), 0, 0))
        prim("cube", code + "_moustache", (0, -R * 0.97, R * 0.77), (0.045, 0.01, 0.008),
             mat(code + "_barbe", cfg["cheveux"], 0.7), p.tete, coll=coll, biseau=0.006)
    if cfg.get("lunettes"):
        p.lunettes = vide(code + "_lunettes", (0, -R * 0.94, R * 1.12), p.tete, coll)
        mon = mat("MONTURE", (0.05, 0.05, 0.06), 0.3)
        for cote in (1, -1):
            prim("tore", f"{code}_verre_{cote}", (cote * R * 0.37, -0.012, 0), (0.042, 0.028, 0.03), mon, p.lunettes,
                 coll=coll, rot=(rad(90), 0, 0), major_radius=1, minor_radius=0.12, major_segments=24, minor_segments=6)
            prim("cyl", f"{code}_branche_{cote}", (cote * R * 0.88, R * 0.45, 0.005), (0.004, 0.004, R * 0.5), mon,
                 p.lunettes, coll=coll, rot=(rad(90), 0, 0))
        prim("cyl", code + "_pont", (0, -0.012, 0.005), (0.004, 0.004, 0.02), mon, p.lunettes, coll=coll,
             rot=(0, rad(90), 0))
    if cfg.get("col"):
        prim("tore", code + "_col", (0, 0, tronc - 0.02), (0.11, 0.09, 0.15), haut, p.torse, coll=coll,
             major_radius=1, minor_radius=0.18)
    if cfg.get("boutons"):
        for i in range(4):
            prim("sphere", f"{code}_bouton_{i}", (0, -0.117 * s, tronc - 0.08 - i * 0.11), (0.011, 0.006, 0.011),
                 mat("BOUTON", (0.95, 0.95, 0.92), 0.3), p.torse, coll=coll)
    PERSOS[code] = p
    return p


def pose_repos(p, frame, bras_ecart=8):
    for nomc, cote in (("G", 1), ("D", -1)):
        cle(p.epaule[nomc], frame, rot=(0, -cote * bras_ecart, 0))
        cle(p.coude[nomc], frame, rot=(-10, 0, 0))
        cle(p.hanche[nomc], frame, rot=(0, 0, 0))
        cle(p.genou[nomc], frame, rot=(0, 0, 0))
    cle(p.tete, frame, rot=(0, 0, 0))
    cle(p.torse, frame, rot=(0, 0, 0))


def pose_assis(p, frame):
    for nomc, cote in (("G", 1), ("D", -1)):
        cle(p.hanche[nomc], frame, rot=(-88, 0, -cote * 8))
        cle(p.genou[nomc], frame, rot=(85, 0, 0))


def marche(p, f0, f1, depart, arrivee, pas=12, amplitude=24, bras=True):
    """Déplacement linéaire + cycle de marche."""
    rz = cap_vers(depart, arrivee)
    cle(p.racine, f0, loc=(depart[0], depart[1], 0), rot=(0, 0, rz))
    cle(p.racine, f1, loc=(arrivee[0], arrivee[1], 0), rot=(0, 0, rz))
    k = 0
    f = f0
    while f <= f1:
        sgn = 1 if k % 2 == 0 else -1
        cle(p.hanche["G"], f, rot=(sgn * amplitude, 0, 0))
        cle(p.hanche["D"], f, rot=(-sgn * amplitude, 0, 0))
        cle(p.genou["G"], f, rot=(max(0, -sgn) * 30 + 8, 0, 0))
        cle(p.genou["D"], f, rot=(max(0, sgn) * 30 + 8, 0, 0))
        if bras:
            cle(p.epaule["G"], f, rot=(-sgn * amplitude * 0.8, -8, 0))
            cle(p.epaule["D"], f, rot=(sgn * amplitude * 0.8, 8, 0))
        cle(p.bassin, f, loc=(0, 0, p.bassin.location.z))
        if f + pas // 2 <= f1:
            cle(p.bassin, f + pas // 2, loc=(0, 0, p.bassin.location.z + 0.025))
        f += pas
        k += 1
    for nomc in ("G", "D"):
        cle(p.hanche[nomc], f1 + 4, rot=(0, 0, 0))
        cle(p.genou[nomc], f1 + 4, rot=(0, 0, 0))
    if bras:
        cle(p.epaule["G"], f1 + 4, rot=(0, -8, 0))
        cle(p.epaule["D"], f1 + 4, rot=(0, 8, 0))
    return rz


def parler(p, f0, f1):
    """Bouche qui s'ouvre et se ferme + légers hochements pendant une réplique."""
    b = p.bouche
    base = (0.045, 0.02, 0.012)
    cle(b, f0 - 1, ech=base)
    f = f0
    i = 0
    while f < f1:
        ouv = random.choice((0.03, 0.038, 0.025, 0.034, 0.02))
        cle(b, f, ech=(0.04, 0.02, ouv))
        cle(b, f + 2, ech=(0.045, 0.02, 0.014))
        f += random.choice((4, 5, 5, 6))
        i += 1
    cle(b, f1, ech=base)


def tete(p, frame, rx=0, ry=0, rz=0):
    cle(p.tete, frame, rot=(rx, ry, rz))


def sourcils(p, frame, haut=0.0):
    for sc in p.sourcils:
        cle(sc, frame, loc=(sc.location.x, sc.location.y, p.R * 1.42 + haut))


# --------------------------------------------------------------------------------------
# Décor
# --------------------------------------------------------------------------------------
def construire_decor():
    terre = mat("TERRE_rouge", (0.55, 0.22, 0.1), 0.95)
    terre2 = mat("TERRE_claire", (0.68, 0.33, 0.16), 0.95)
    asphalte = mat("ASPHALTE", (0.12, 0.11, 0.11), 0.85)
    ligne = mat("LIGNE_blanche", (0.85, 0.82, 0.75), 0.6)
    prim("plan", "TROTTOIR", (0, 0, 0), (40, 6, 1), terre)
    prim("plan", "ROUTE", (0, 7.5, 0.005), (60, 3.2, 1), asphalte)
    for i in range(-14, 15):
        prim("plan", f"LIGNE_{i}", (i * 4, 7.5, 0.01), (0.9, 0.06, 1), ligne)
    prim("plan", "TROTTOIR_FACE", (0, 20, 0.0), (60, 9.5, 1), terre2)
    prim("cube", "BORDURE", (0, 4.25, 0.04), (60, 0.08, 0.05), mat("BETON", (0.6, 0.57, 0.52), 0.9))
    # flaques de terre / cailloux
    for i in range(30):
        prim("sphere", f"CAILLOU_{i}", (random.uniform(-14, 14), random.uniform(-5, 4), 0.0),
             (random.uniform(0.03, 0.08),) * 2 + (0.02,), mat("CAILLOU", (0.45, 0.3, 0.22), 0.9), segments=8, ring_count=6)

    # Kiosque bleu
    bleu = mat("KIOSQUE_bleu", (0.06, 0.3, 0.78), 0.55)
    k = vide("KIOSQUE", (2.9, 1.7, 0))
    prim("cube", "KIOSQUE_corps", (0, 0, 1.1), (0.85, 0.65, 1.1), bleu, k, biseau=0.03)
    prim("cube", "KIOSQUE_toit", (0, -0.15, 2.28), (1.05, 0.9, 0.07), mat("TOLE", (0.75, 0.75, 0.78), 0.35), k, biseau=0.02)
    prim("cube", "KIOSQUE_guichet", (0, -0.651, 1.35), (0.55, 0.01, 0.32), mat("GUICHET", (0.04, 0.05, 0.07), 0.3), k)
    prim("cube", "KIOSQUE_comptoir", (0, -0.75, 1.0), (0.65, 0.12, 0.03), mat("BOIS_clair", (0.7, 0.48, 0.25), 0.7), k)
    # affiches de recharge (marques fictives)
    a1 = prim("cube", "AFFICHE_1", (-0.45, -0.66, 0.5), (0.3, 0.008, 0.36), mat("AFFICHE_jaune", (0.98, 0.8, 0.05), 0.6), k)
    texte("AFFICHE_1_txt", "MBOKA\nCREDIT", (-0.45, -0.675, 0.52), 0.13, mat("TXT_rouge", (0.75, 0.05, 0.05), 0.5), k)
    prim("cube", "AFFICHE_2", (0.45, -0.66, 0.5), (0.3, 0.008, 0.36), mat("AFFICHE_rouge", (0.85, 0.1, 0.12), 0.6), k)
    texte("AFFICHE_2_txt", "SOKO\nTEL", (0.45, -0.675, 0.52), 0.14, mat("TXT_blanc", (0.97, 0.97, 0.97), 0.5), k)
    prim("cube", "AFFICHE_3", (0.0, -0.66, 1.95), (0.7, 0.008, 0.12), mat("AFFICHE_blanc", (0.97, 0.97, 0.95), 0.6), k)
    texte("AFFICHE_3_txt", "UNITES  •  MOBILE MONEY", (0, -0.675, 1.95), 0.1, mat("TXT_bleu", (0.05, 0.2, 0.6), 0.5), k)
    # produits sur le comptoir
    for i in range(5):
        prim("cube", f"KIOSQUE_produit_{i}", (-0.5 + i * 0.25, -0.75, 1.07), (0.06, 0.04, 0.05),
             mat(f"PRODUIT_{i%3}", [(0.9, 0.2, 0.1), (0.1, 0.6, 0.9), (0.95, 0.85, 0.2)][i % 3], 0.5), k, biseau=0.01)

    # Tabouret de Papa Fiston
    bois = mat("BOIS_tabouret", (0.45, 0.26, 0.12), 0.7)
    t = vide("TABOURET", (1.7, 0.75, 0))
    prim("cyl", "TABOURET_assise", (0, 0, 0.44), (0.21, 0.21, 0.03), bois, t, biseau=0.01)
    for i in range(4):
        a = rad(45 + 90 * i)
        prim("cyl", f"TABOURET_pied_{i}", (0.14 * math.cos(a), 0.14 * math.sin(a), 0.21), (0.022, 0.022, 0.21), bois, t,
             rot=(rad(8) * math.sin(a), -rad(8) * math.cos(a), 0))
    # Caisse et parasol près du kiosque
    prim("cube", "CAISSE", (4.2, 0.9, 0.25), (0.35, 0.3, 0.25), mat("CAISSE_bois", (0.55, 0.35, 0.18), 0.8), biseau=0.02)
    prim("cyl", "PARASOL_mat", (-3.8, 1.8, 1.1), (0.025, 0.025, 1.1), mat("METAL", (0.6, 0.6, 0.6), 0.4))
    prim("cone", "PARASOL", (-3.8, 1.8, 2.25), (1.2, 1.2, 0.3), mat("PARASOL_rouge", (0.85, 0.15, 0.1), 0.6), vertices=12)
    prim("cube", "ETAL", (-3.8, 1.8, 0.45), (0.7, 0.45, 0.45), mat("ETAL_bois", (0.5, 0.32, 0.17), 0.8), biseau=0.02)
    for i in range(9):
        prim("sphere", f"ETAL_fruit_{i}", (-4.3 + (i % 3) * 0.3 + random.uniform(-0.05, 0.05), 1.6 + (i // 3) * 0.18, 0.95),
             (0.07,) * 3, mat(f"FRUIT_{i%3}", [(0.95, 0.55, 0.05), (0.2, 0.6, 0.15), (0.9, 0.85, 0.1)][i % 3], 0.5))

    # Palmiers
    tronc = mat("PALMIER_tronc", (0.42, 0.3, 0.18), 0.9)
    feuille = mat("PALMIER_feuille", (0.12, 0.45, 0.12), 0.6)
    for i, (x, y, h) in enumerate([(-7, 3.2, 5.5), (8.5, 3.5, 6.2), (-11, 12.5, 6.5), (5, 13, 5.8), (14, 12, 7), (-17, 3.5, 6)]):
        pv = vide(f"PALMIER_{i}", (x, y, 0))
        prim("cyl", f"PALMIER_{i}_tronc", (0, 0, h / 2), (0.13, 0.13, h / 2), tronc, pv, rot=(0, rad(4), 0), vertices=10)
        for j in range(8):
            a = rad(j * 45 + i * 13)
            prim("sphere", f"PALMIER_{i}_palme_{j}", (0.9 * math.cos(a), 0.9 * math.sin(a), h - 0.25),
                 (1.1, 0.22, 0.04), feuille, pv, rot=(0, rad(22), a), segments=12, ring_count=6)
        for j in range(3):
            prim("sphere", f"PALMIER_{i}_coco_{j}", (0.12 * math.cos(j * 2.1), 0.12 * math.sin(j * 2.1), h - 0.35), (0.09,) * 3,
                 mat("COCO", (0.35, 0.25, 0.1), 0.7), pv, segments=10, ring_count=6)

    # Immeubles bas de l'autre côté de la route
    couleurs = [(0.93, 0.85, 0.65), (0.85, 0.55, 0.4), (0.7, 0.8, 0.85), (0.95, 0.75, 0.5), (0.8, 0.85, 0.7), (0.9, 0.9, 0.88)]
    x = -26
    i = 0
    while x < 26:
        lg = random.uniform(3.5, 6)
        h = random.choice((3.2, 3.4, 6.4, 6.6, 9.6))
        b = vide(f"IMMEUBLE_{i}", (x + lg / 2, 15.5 + random.uniform(-0.5, 0.8), 0))
        prim("cube", f"IMMEUBLE_{i}_corps", (0, 0, h / 2), (lg / 2 - 0.1, 2.5, h / 2), mat(f"FACADE_{i%6}", couleurs[i % 6], 0.9), b)
        prim("cube", f"IMMEUBLE_{i}_bandeau", (0, -2.52, 2.9), (lg / 2 - 0.1, 0.03, 0.12), mat("BANDEAU", (0.55, 0.35, 0.25), 0.8), b)
        for e in range(int(h // 3.2)):
            for w in range(max(1, int(lg // 1.6))):
                prim("cube", f"IMMEUBLE_{i}_fen_{e}_{w}", (-lg / 2 + 0.9 + w * 1.6, -2.52, 1.6 + e * 3.2), (0.4, 0.02, 0.5),
                     mat("FENETRE", (0.15, 0.2, 0.25), 0.2), b)
        if h < 4:  # boutique au rez-de-chaussée avec auvent
            prim("cube", f"IMMEUBLE_{i}_auvent", (0, -2.9, 2.5), (lg / 2 - 0.3, 0.45, 0.04),
                 mat(f"AUVENT_{i%3}", [(0.1, 0.45, 0.75), (0.8, 0.2, 0.15), (0.15, 0.55, 0.3)][i % 3], 0.6), b, rot=(rad(-12), 0, 0))
        x += lg
        i += 1
    # Poteaux électriques
    for i, x in enumerate((-12, 0.5, 13)):
        prim("cyl", f"POTEAU_{i}", (x, 10.3, 4), (0.08, 0.08, 4), mat("POTEAU_bois", (0.35, 0.28, 0.2), 0.9), vertices=8)
        prim("cube", f"POTEAU_{i}_barre", (x, 10.3, 7.6), (0.6, 0.04, 0.04), mat("POTEAU_bois", (0.35, 0.28, 0.2), 0.9))


def construire_taxibus(nom, coll="Vehicules", enseigne=None):
    jaune = mat("BUS_jaune", (0.98, 0.72, 0.03), 0.35)
    bleu = mat("BUS_bleu", (0.03, 0.22, 0.65), 0.35)
    vitre = mat("BUS_vitre", (0.08, 0.12, 0.16), 0.08)
    pneu = mat("PNEU", (0.03, 0.03, 0.03), 0.8)
    jante = mat("JANTE", (0.7, 0.7, 0.72), 0.3)
    b = vide(nom, coll=coll)
    prim("cube", nom + "_caisse", (0, 0, 1.25), (2.3, 0.95, 0.8), jaune, b, coll=coll, biseau=0.12)
    prim("cube", nom + "_capot", (2.45, 0, 0.8), (0.35, 0.92, 0.35), jaune, b, coll=coll, biseau=0.1)
    prim("cube", nom + "_bande", (0, 0, 0.8), (2.32, 0.965, 0.1), bleu, b, coll=coll)
    prim("cube", nom + "_vitres", (0.0, 0, 1.6), (2.2, 0.97, 0.28), vitre, b, coll=coll)
    prim("cube", nom + "_parebrise", (2.29, 0, 1.55), (0.03, 0.85, 0.32), vitre, b, coll=coll, rot=(0, rad(-12), 0))
    prim("cube", nom + "_porte", (0.9, -0.96, 1.15), (0.45, 0.015, 0.62), mat("BUS_ouverture", (0.02, 0.02, 0.03), 0.5), b, coll=coll)
    prim("cube", nom + "_galerie", (-0.3, 0, 2.12), (1.8, 0.85, 0.04), mat("METAL", (0.6, 0.6, 0.6), 0.4), b, coll=coll)
    for i, (dx, dy) in enumerate([(1.6, 0.95), (1.6, -0.95), (-1.5, 0.95), (-1.5, -0.95)]):
        prim("cyl", f"{nom}_roue_{i}", (dx, dy, 0.38), (0.38, 0.38, 0.13), pneu, b, coll=coll, rot=(rad(90), 0, 0))
        prim("cyl", f"{nom}_jante_{i}", (dx, dy * 1.07, 0.38), (0.2, 0.2, 0.02), jante, b, coll=coll, rot=(rad(90), 0, 0))
    for dy in (0.6, -0.6):
        prim("sphere", f"{nom}_phare_{dy}", (2.8, dy, 0.85), (0.04, 0.13, 0.1), mat("PHARE", (1, 0.95, 0.8), 0.1, emission=1.0), b, coll=coll)
    if enseigne:
        prim("cube", nom + "_panneau", (2.3, -0.4, 2.2), (0.02, 0.45, 0.13), mat("PANNEAU_blanc", (0.97, 0.97, 0.95), 0.5), b, coll=coll)
        texte(nom + "_panneau_txt", enseigne, (2.33, -0.4, 2.2), 0.17, mat("TXT_rouge", (0.75, 0.05, 0.05), 0.5), b,
              rot=(rad(90), 0, rad(90)), coll=coll)
        texte(nom + "_flanc_txt", enseigne, (-0.9, -0.975, 0.8), 0.16, mat("TXT_blanc", (0.97, 0.97, 0.97), 0.5), b,
              rot=(rad(90), 0, 0), coll=coll)
    return b


def vendeur(i, cfg_couleur, coll="Figurants"):
    cfg = dict(peau=random.choice([(0.33, 0.2, 0.12), (0.4, 0.25, 0.15), (0.28, 0.17, 0.1)]),
               haut=cfg_couleur, bas=random.choice([(0.2, 0.2, 0.25), (0.35, 0.25, 0.15), (0.6, 0.15, 0.1)]),
               chaussures=(0.15, 0.1, 0.07), cheveux=(0.03, 0.02, 0.02), coupe="ras", taille=random.uniform(0.92, 1.0))
    p = construire_perso(f"FIGURANT_{i}", cfg, coll=coll)
    if i % 2 == 0:  # bassine sur la tête
        prim("cyl", f"FIGURANT_{i}_bassine", (0, 0, p.R * 2.2), (0.3, 0.3, 0.07),
             mat(f"BASSINE_{i%3}", [(0.1, 0.5, 0.85), (0.85, 0.2, 0.25), (0.95, 0.7, 0.1)][i % 3], 0.4), p.tete, coll=coll)
        for j in range(5):
            prim("sphere", f"FIGURANT_{i}_fruit_{j}", (0.12 * math.cos(j * 1.3), 0.12 * math.sin(j * 1.3), p.R * 2.3),
                 (0.08,) * 3, mat(f"FRUIT_{j%3}", [(0.95, 0.55, 0.05), (0.2, 0.6, 0.15), (0.9, 0.85, 0.1)][j % 3], 0.5),
                 p.tete, coll=coll, segments=10, ring_count=6)
    return p


# --------------------------------------------------------------------------------------
# Construction
# --------------------------------------------------------------------------------------
construire_decor()

CHEN = construire_perso("CHEN", dict(
    peau=(0.86, 0.66, 0.5), haut=(0.55, 0.76, 0.95), bas=(0.82, 0.71, 0.53), chaussures=(0.35, 0.2, 0.1),
    cheveux=(0.02, 0.02, 0.025), coupe="court", lunettes=True, col=True, boutons=True, taille=1.0, tete_l=0.88))
FISTON = construire_perso("FISTON", dict(
    peau=(0.3, 0.17, 0.1), mat_haut=mat_wax(), haut=(0.95, 0.45, 0.05), bas=(0.33, 0.2, 0.1), chaussures=(0.3, 0.17, 0.08),
    cheveux=(0.55, 0.55, 0.55), sourcils=(0.4, 0.4, 0.4), coupe="ras", barbiche=True, sandales=True, taille=1.03,
    carrure=1.12, ventre=True, tete=1.03, tete_l=0.97))
GRACE = construire_perso("GRACE", dict(
    peau=(0.4, 0.23, 0.14), haut=(0.99, 0.8, 0.1), bas=(0.08, 0.13, 0.32), chaussures=(0.96, 0.96, 0.96),
    semelle_blanche=True, mat_cheveux=mat_tresses(), cheveux=(0.03, 0.02, 0.015), coupe="tresses", taille=0.95,
    carrure=0.9, col=True, tete_l=0.86))

# Accessoires
gris_fonce = mat("VALISE_gris", (0.12, 0.12, 0.14), 0.4)
VALISE = vide("VALISE", coll="Accessoires")
prim("cube", "VALISE_corps", (0, 0, 0.36), (0.2, 0.12, 0.3), gris_fonce, VALISE, coll="Accessoires", biseau=0.04)
prim("cyl", "VALISE_poignee", (0, 0, 0.82), (0.012, 0.012, 0.18), mat("METAL", (0.6, 0.6, 0.6), 0.4), VALISE, coll="Accessoires")
prim("cube", "VALISE_tirette", (0, 0, 1.0), (0.08, 0.02, 0.015), mat("NOIR_mat", (0.02, 0.02, 0.02), 0.6), VALISE, coll="Accessoires", biseau=0.01)
for dx in (0.15, -0.15):
    prim("cyl", f"VALISE_roue_{dx}", (dx, 0.08, 0.04), (0.035, 0.035, 0.02), mat("NOIR_mat", (0.02, 0.02, 0.02), 0.6), VALISE,
         coll="Accessoires", rot=(0, rad(90), 0))
SAC_DOS = prim("cube", "CHEN_sacados", (0, 0.17, 0.3), (0.14, 0.07, 0.17), mat("SAC_gris", (0.5, 0.52, 0.55), 0.8), CHEN.torse,
               coll="Personnages", biseau=0.05)
for dx in (0.1, -0.1):
    prim("cube", f"CHEN_bretelle_{dx}", (dx, -0.005, 0.32), (0.022, 0.125, 0.012), mat("SAC_gris", (0.5, 0.52, 0.55), 0.8),
         CHEN.torse, coll="Personnages", rot=(rad(90), 0, 0))
TEL_CHEN = prim("cube", "CHEN_telephone", (0, -0.02, -0.07), (0.035, 0.008, 0.07), mat("TELEPHONE", (0.03, 0.03, 0.04), 0.2),
                CHEN.main["D"], coll="Personnages", biseau=0.005)
prim("cube", "CHEN_ecran", (0, -0.029, -0.07), (0.03, 0.001, 0.062), mat("ECRAN", (0.3, 0.6, 0.95), 0.2, emission=1.5),
     CHEN.main["D"], coll="Personnages")
JOURNAL = vide("JOURNAL", coll="Accessoires")
papier = mat("PAPIER_journal", (0.9, 0.88, 0.82), 0.8)
for cote in (1, -1):
    prim("cube", f"JOURNAL_page_{cote}", (cote * 0.17, 0, 0), (0.17, 0.003, 0.24), papier, JOURNAL, coll="Accessoires",
         rot=(0, 0, rad(cote * 12)))
    for l in range(5):
        prim("cube", f"JOURNAL_ligne_{cote}_{l}", (cote * 0.17, -0.004, 0.15 - l * 0.07), (0.13, 0.001, 0.012),
             mat("ENCRE", (0.15, 0.15, 0.15), 0.8), JOURNAL, coll="Accessoires", rot=(0, 0, rad(cote * 12)))
texte("JOURNAL_titre", "MBOKA NEWS", (0.17, -0.006, 0.2), 0.04, mat("ENCRE", (0.15, 0.15, 0.15), 0.8), JOURNAL,
      coll="Accessoires", rot=(rad(90), 0, rad(12)))
SAC_GRACE = vide("GRACE_sac", (-0.215, 0.02, 0.12), GRACE.torse, "Personnages")
prim("cube", "GRACE_sac_corps", (-0.02, 0, -0.08), (0.05, 0.13, 0.14), mat("TOILE_beige", (0.82, 0.72, 0.55), 0.9), SAC_GRACE,
     coll="Personnages", biseau=0.04)
for dy in (-0.115, 0.115):
    prim("cube", f"GRACE_sac_anse_{dy}", (0.04, dy, 0.17), (0.012, 0.006, 0.2), mat("TOILE_beige", (0.82, 0.72, 0.55), 0.9),
         SAC_GRACE, coll="Personnages", rot=(0, rad(-12), 0))
TEL_GRACE = prim("cube", "GRACE_telephone", (0, -0.02, -0.06), (0.032, 0.007, 0.065), mat("TELEPHONE_rose", (0.85, 0.4, 0.5), 0.3),
                 GRACE.main["G"], coll="Personnages", biseau=0.004)
BILLETS = vide("GRACE_billets", (0, -0.05, -0.08), GRACE.main["D"], "Personnages")
for i in range(3):
    prim("cube", f"GRACE_billet_{i}", (i * 0.015, -i * 0.004, i * 0.01), (0.06, 0.001, 0.03),
         mat("BILLET", (0.45, 0.65, 0.4), 0.7), BILLETS, coll="Personnages", rot=(0, rad(-15 + i * 15), 0))

# Positions de la scène
POS_FISTON = (1.7, 0.75)
POS_CHEN = (0.55, 0.0)
POS_GRACE = (-0.55, 0.2)
POS_BUS = (-3.8, 5.6)

# ---- Papa Fiston : assis sur le tabouret, toute la scène
rz_fiston = cap_vers(POS_FISTON, (0.4, -0.6))
FISTON.racine.location = (*POS_FISTON, 0)
FISTON.racine.rotation_euler = (0, 0, rad(rz_fiston))
FISTON.bassin.location.z = 0.5
pose_assis(FISTON, 1)
pose_repos(FISTON, 1)
pose_assis(FISTON, 1)
# journal tenu à deux mains devant le visage
JOURNAL.parent = FISTON.torse
cle(JOURNAL, 1, loc=(0, -0.42, 0.68), rot=(-8, 0, 0))
for nomc, cote in (("G", 1), ("D", -1)):
    cle(FISTON.epaule[nomc], 1, rot=(-62, 0, cote * 20))
    cle(FISTON.coude[nomc], 1, rot=(-70, 0, 0))

# ---- Mr. Chen
CHEN.racine.location = (-7, -0.6, 0)
VALISE.parent = CHEN.racine
VALISE.location = (0.36, 0.45, 0)
VALISE.rotation_euler = (rad(-22), 0, 0)
pose_repos(CHEN, 1)
cle(CHEN.epaule["G"], 1, rot=(28, -12, 0))  # bras gauche tire la valise
cle(CHEN.epaule["D"], 1, rot=(-50, 10, 0))
cle(CHEN.coude["D"], 1, rot=(-45, 0, 0))

# ---- Grace (hors champ au début)
GRACE.racine.location = (-12, -1.2, 0)
pose_repos(GRACE, 1)
cle(GRACE.racine, 1, loc=(-12, -1.2, 0), rot=(0, 0, -90))

# ---- Figurants : vendeurs qui marchent
FIGURANTS = []
for i, (couleur, y, x0, x1, t0, t1) in enumerate([
        ((0.9, 0.3, 0.5), -2.6, -14, 6, 1, F(9)), ((0.2, 0.6, 0.85), 3.0, 12, -16, 1, F(8)),
        ((0.95, 0.75, 0.1), 11.2, -18, 18, 1, FIN_TOTALE), ((0.3, 0.7, 0.3), 12.0, 16, -16, 1, FIN_TOTALE),
        ((0.85, 0.4, 0.2), -3.6, 15, -15, F(10), FIN_TOTALE)]):
    v = vendeur(i, couleur)
    pose_repos(v, 1)
    marche(v, t0, t1, (x0, y), (x1, y), pas=14, amplitude=20)
    FIGURANTS.append(v)

# ---- Taxis-bus
BUS1 = construire_taxibus("TAXIBUS_1")
BUS1.rotation_euler = (0, 0, 0)
cle(BUS1, 1, loc=(-30, 8.8, 0))
cle(BUS1, F(2, 1), loc=(30, 8.8, 0))
cle(BUS1, F(2, 1) + 1, loc=(40, 8.8, -10))
BUS3 = construire_taxibus("TAXIBUS_3")
cle(BUS3, 1, loc=(-40, 8.8, -10))
cle(BUS3, F(8), loc=(-40, 8.8, -10))
cle(BUS3, F(8) + 1, loc=(-30, 8.8, 0))
cle(BUS3, F(10, 2), loc=(30, 8.8, 0))

BUS2 = construire_taxibus("TAXIBUS_ZANDO", enseigne="ZANDO")
BUS2.rotation_euler = (0, 0, rad(180))
cle(BUS2, 1, loc=(40, 5.6, -10))
cle(BUS2, F(14) - 1, loc=(40, 5.6, -10))
cle(BUS2, F(14), loc=(14, POS_BUS[1], 0))
cle(BUS2, F(14, 2.2), loc=(POS_BUS[0], POS_BUS[1], 0))
cle(BUS2, F(18, 3.2), loc=(POS_BUS[0], POS_BUS[1], 0))
# Receveur penché à la porte (le bus est tourné de 180°, la porte est côté trottoir)
RECEVEUR = construire_perso("RECEVEUR", dict(peau=(0.32, 0.19, 0.11), haut=(0.9, 0.9, 0.9), bas=(0.15, 0.15, 0.2),
                                             chaussures=(0.1, 0.1, 0.1), cheveux=(0.02, 0.02, 0.02), coupe="ras", taille=0.95))
RECEVEUR.racine.parent = BUS2
RECEVEUR.racine.location = (0.9, -0.85, 0.15)
RECEVEUR.racine.rotation_euler = (0, 0, 0)
pose_repos(RECEVEUR, 1)
cle(RECEVEUR.torse, F(14, 2.5), rot=(0, 0, 0))
cle(RECEVEUR.torse, F(14, 3.2), rot=(-25, 0, 0))
cle(RECEVEUR.epaule["D"], F(14, 3.2), rot=(0, 8, 0))
for k in range(8):
    cle(RECEVEUR.epaule["D"], F(14, 3.6 + k * 0.3), rot=(-20, 140 if k % 2 == 0 else 110, 0))
cle(RECEVEUR.epaule["G"], F(14, 3.2), rot=(-20, -60, 0))
parler(RECEVEUR, F(14, 4.7), F(14, 5.9))

# ======================================================================================
# Animation plan par plan
# ======================================================================================
# Plan 1 : rien de spécial (bus, figurants). Fiston lit son journal.
# Plan 2 : Chen entre, tire sa valise, s'arrête, regarde son téléphone puis autour.
rz = marche(CHEN, F(1, 3.0), F(2, 2.4), (-6.5, -0.7), POS_CHEN, pas=13, amplitude=22, bras=False)
cle(CHEN.epaule["D"], F(2, 2.4), rot=(-50, 10, 0))
cle(CHEN.coude["D"], F(2, 2.4), rot=(-45, 0, 0))
tete(CHEN, F(2, 0.3), rx=18)
tete(CHEN, F(2, 2.4), rx=22)
tete(CHEN, F(2, 2.9), rx=0, rz=35)
tete(CHEN, F(2, 3.5), rx=0, rz=-30)
sourcils(CHEN, F(2, 2.5), 0.0)
sourcils(CHEN, F(2, 2.9), 0.012)
# il se tourne vers Papa Fiston
rz_chen = cap_vers(POS_CHEN, POS_FISTON)
cle(CHEN.racine, F(2, 3.6), rot=(0, 0, rz))
cle(CHEN.racine, F(3, 0.3), rot=(0, 0, rz_chen))
cle(VALISE, F(2, 2.4), loc=(0.36, 0.45, 0), rot=(-22, 0, 0))
cle(VALISE, F(2, 3.2), loc=(0.4, 0.1, 0), rot=(0, 0, 0))
cle(CHEN.epaule["G"], F(2, 2.4), rot=(28, -12, 0))
cle(CHEN.epaule["G"], F(2, 3.2), rot=(0, -8, 0))
tete(CHEN, F(3, 0.3), rz=0)
sourcils(CHEN, F(3, 0.5), 0.0)

# Plan 3 : Chen salue (inclinaison), Fiston baisse son journal et lève les yeux
cle(CHEN.epaule["D"], F(3, 0.2), rot=(-50, 10, 0))
cle(CHEN.epaule["D"], F(3, 0.6), rot=(0, 8, 0))
cle(CHEN.coude["D"], F(3, 0.6), rot=(-10, 0, 0))
cle(CHEN.torse, F(3, 0.6), rot=(0, 0, 0))
cle(CHEN.torse, F(3, 1.0), rot=(18, 0, 0))
cle(CHEN.torse, F(3, 1.6), rot=(0, 0, 0))
tete(CHEN, F(3, 1.0), rx=15)
tete(CHEN, F(3, 1.6), rx=0)
cle(JOURNAL, F(3, 1.4), loc=(0, -0.42, 0.68), rot=(-8, 0, 0))
cle(JOURNAL, F(3, 2.4), loc=(0, -0.4, 0.2), rot=(-70, 0, 0))
for nomc, cote in (("G", 1), ("D", -1)):
    cle(FISTON.epaule[nomc], F(3, 1.4), rot=(-62, 0, cote * 20))
    cle(FISTON.coude[nomc], F(3, 1.4), rot=(-70, 0, 0))
    cle(FISTON.epaule[nomc], F(3, 2.4), rot=(-30, 0, cote * 15))
    cle(FISTON.coude[nomc], F(3, 2.4), rot=(-50, 0, 0))
tete(FISTON, F(3, 2.0), rx=10)
tete(FISTON, F(3, 2.8), rx=-6, rz=-10)

# Plan 4 : Fiston ouvre les bras avec un grand sourire
cle(JOURNAL, F(4, 0.1), loc=(0, -0.4, 0.2), rot=(-70, 0, 0))
cle(JOURNAL, F(4, 0.5), loc=(0.3, -0.25, -0.02), rot=(-88, 0, 0))
for nomc, cote in (("G", 1), ("D", -1)):
    cle(FISTON.epaule[nomc], F(4, 0.1), rot=(-30, 0, cote * 15))
    cle(FISTON.coude[nomc], F(4, 0.1), rot=(-50, 0, 0))
    cle(FISTON.epaule[nomc], F(4, 0.8), rot=(-20, -cote * 75, 0))
    cle(FISTON.coude[nomc], F(4, 0.8), rot=(-25, 0, 0))
    cle(FISTON.epaule[nomc], F(4, 2.6), rot=(-20, -cote * 70, 0))
    cle(FISTON.epaule[nomc], F(5, 0.6), rot=(-25, -cote * 12, 0))
    cle(FISTON.coude[nomc], F(5, 0.6), rot=(-60, 0, 0))
tete(FISTON, F(4, 0.8), rx=-10, rz=-10)
tete(FISTON, F(4, 2.5), rx=-4, rz=-10)

# Plan 5 : Chen montre son téléphone
cle(CHEN.epaule["D"], F(5, 1.6), rot=(0, 8, 0))
cle(CHEN.coude["D"], F(5, 1.6), rot=(-10, 0, 0))
cle(CHEN.epaule["D"], F(5, 2.4), rot=(-55, 15, 0))
cle(CHEN.coude["D"], F(5, 2.4), rot=(-60, 0, 0))
tete(CHEN, F(5, 0.5), rx=0)
tete(CHEN, F(5, 1.2), rx=8)
tete(CHEN, F(5, 1.7), rx=0)
sourcils(CHEN, F(5, 2.5), 0.01)

# Plan 6 : Fiston pointe vers la droite (direction Limete), puis tout droit, puis tourne
cle(FISTON.epaule["D"], F(6, 0.4), rot=(-25, 12, 0))
cle(FISTON.coude["D"], F(6, 0.4), rot=(-60, 0, 0))
cle(FISTON.epaule["D"], F(6, 1.2), rot=(-15, 95, 0))
cle(FISTON.coude["D"], F(6, 1.2), rot=(-5, 0, 0))
cle(FISTON.epaule["D"], F(6, 2.8), rot=(-15, 95, 0))
cle(FISTON.epaule["D"], F(6, 3.4), rot=(-85, 10, 0))
cle(FISTON.coude["D"], F(6, 3.4), rot=(-5, 0, 0))
cle(FISTON.epaule["D"], F(6, 4.3), rot=(-85, 10, 0))
cle(FISTON.epaule["D"], F(6, 4.9), rot=(-80, 60, 0))
cle(FISTON.coude["D"], F(6, 4.9), rot=(-40, 0, 0))
cle(FISTON.epaule["D"], F(7, 0.5), rot=(-25, 12, 0))
cle(FISTON.coude["D"], F(7, 0.5), rot=(-60, 0, 0))
tete(FISTON, F(6, 1.0), rz=-35)
tete(FISTON, F(6, 3.0), rz=-10)
cle(CHEN.epaule["D"], F(6, 0.2), rot=(-55, 15, 0))
cle(CHEN.epaule["D"], F(6, 1.0), rot=(-35, 10, 0))
cle(CHEN.coude["D"], F(6, 1.0), rot=(-60, 0, 0))
tete(CHEN, F(6, 1.0), rz=0)
tete(CHEN, F(6, 1.6), rz=-40)
tete(CHEN, F(6, 3.4), rz=-5)

# Plan 7 : Chen tape sur son téléphone puis lève les yeux
cle(CHEN.epaule["G"], F(7, 0.2), rot=(0, -8, 0))
cle(CHEN.epaule["G"], F(7, 0.7), rot=(-38, -18, 0))
cle(CHEN.coude["G"], F(7, 0.7), rot=(-75, 0, -20))
for k in range(8):
    cle(CHEN.coude["G"], F(7, 0.8 + k * 0.22), rot=(-75 - (6 if k % 2 else 0), 0, -20))
tete(CHEN, F(7, 0.3), rx=0)
tete(CHEN, F(7, 0.7), rx=25)
tete(CHEN, F(7, 2.4), rx=25)
tete(CHEN, F(7, 2.9), rx=0, rz=5)
cle(CHEN.epaule["G"], F(7, 2.6), rot=(-38, -18, 0))
cle(CHEN.epaule["G"], F(7, 3.2), rot=(0, -8, 0))
cle(CHEN.coude["G"], F(7, 3.2), rot=(-10, 0, 0))
sourcils(CHEN, F(7, 2.9), 0.01)

# Plan 8 : Fiston secoue la tête et fait un geste désinvolte
for k, rzk in enumerate((-10, -25, 5, -25, -10)):
    tete(FISTON, F(8, 0.3 + k * 0.22), rz=rzk)
cle(FISTON.epaule["G"], F(8, 1.2), rot=(-25, -12, 0))
cle(FISTON.coude["G"], F(8, 1.2), rot=(-60, 0, 0))
for k in range(5):
    cle(FISTON.epaule["G"], F(8, 1.6 + k * 0.25), rot=(-55, -35 if k % 2 else -15, 0))
    cle(FISTON.coude["G"], F(8, 1.6 + k * 0.25), rot=(-55, 0, 0))
cle(FISTON.epaule["G"], F(8, 3.6), rot=(-25, -12, 0))
cle(FISTON.coude["G"], F(8, 3.6), rot=(-60, 0, 0))

# Plan 9 : Grace arrive, ralentit, s'arrête et tourne la tête vers les deux hommes
marche(GRACE, F(9, 0.0), F(9, 2.2), (-5.0, -0.8), POS_GRACE, pas=14, amplitude=22)
rz_grace = cap_vers(POS_GRACE, (1.2, 0.5))
cle(GRACE.racine, F(9, 2.3), rot=(0, 0, cap_vers((-5.0, -0.8), POS_GRACE)))
cle(GRACE.racine, F(9, 2.9), rot=(0, 0, rz_grace))
tete(GRACE, F(9, 1.6), rz=0)
tete(GRACE, F(9, 2.2), rz=-25)
tete(GRACE, F(9, 2.9), rz=0)
cle(GRACE.epaule["G"], F(9, 2.6), rot=(0, -8, 0))
tete(CHEN, F(9, 2.0), rz=5)
tete(CHEN, F(9, 2.8), rz=60)
tete(FISTON, F(9, 2.0), rz=-10)
tete(FISTON, F(9, 2.8), rz=10)

# Plan 10 : Grace lève la main poliment
cle(GRACE.epaule["D"], F(10, 0.1), rot=(0, 8, 0))
cle(GRACE.coude["D"], F(10, 0.1), rot=(-10, 0, 0))
cle(GRACE.epaule["D"], F(10, 0.7), rot=(-30, 40, 0))
cle(GRACE.coude["D"], F(10, 0.7), rot=(-110, 0, 0))
cle(GRACE.epaule["D"], F(10, 2.8), rot=(-30, 40, 0))
cle(GRACE.coude["D"], F(10, 2.8), rot=(-110, 0, 0))
cle(GRACE.epaule["D"], F(10, 3.6), rot=(0, 8, 0))
cle(GRACE.coude["D"], F(10, 3.6), rot=(-10, 0, 0))
tete(GRACE, F(10, 0.5), rx=0, ry=0)
tete(GRACE, F(10, 1.5), rx=5, ry=-6)
tete(GRACE, F(10, 3.0), rx=0, ry=0)
tete(CHEN, F(10, 0.4), rz=55)
tete(FISTON, F(10, 1.0), rz=15)

# Plan 11 : Fiston surpris, sourcils levés, se penche en arrière
sourcils(FISTON, F(11, 0.0), 0.0)
sourcils(FISTON, F(11, 0.3), 0.025)
sourcils(FISTON, F(11, 2.6), 0.025)
sourcils(FISTON, F(12, 0.5), 0.0)
cle(FISTON.torse, F(11, 0.0), rot=(0, 0, 0))
cle(FISTON.torse, F(11, 0.5), rot=(-12, 0, 0))
cle(FISTON.torse, F(12, 0.5), rot=(-12, 0, 0))
cle(FISTON.torse, F(12, 1.5), rot=(0, 0, 0))
tete(FISTON, F(11, 0.5), rx=-8, rz=20)
for nomc, cote in (("G", 1), ("D", -1)):
    cle(FISTON.epaule[nomc], F(11, 0.4), rot=(-25, -cote * 12, 0))
    cle(FISTON.epaule[nomc], F(11, 1.0), rot=(-40, -cote * 45, 0))
    cle(FISTON.coude[nomc], F(11, 1.0), rot=(-80, 0, 0))
    cle(FISTON.epaule[nomc], F(12, 0.8), rot=(-40, -cote * 45, 0))
    cle(FISTON.epaule[nomc], F(12, 1.6), rot=(-25, -cote * 12, 0))
    cle(FISTON.coude[nomc], F(12, 1.6), rot=(-60, 0, 0))

# Plan 12 : Grace se tourne vers Chen et pointe dans la direction opposée (vers la gauche)
rz_grace_chen = cap_vers(POS_GRACE, POS_CHEN)
cle(GRACE.racine, F(12, 0.2), rot=(0, 0, rz_grace))
cle(GRACE.racine, F(12, 0.8), rot=(0, 0, rz_grace_chen))
cle(GRACE.epaule["G"], F(12, 1.2), rot=(0, -8, 0))
cle(GRACE.coude["G"], F(12, 1.2), rot=(-10, 0, 0))
cle(GRACE.epaule["G"], F(12, 1.9), rot=(-20, -95, 0))
cle(GRACE.coude["G"], F(12, 1.9), rot=(-5, 0, 0))
cle(GRACE.epaule["G"], F(12, 4.2), rot=(-20, -95, 0))
cle(GRACE.epaule["G"], F(13, 0.5), rot=(0, -8, 0))
cle(GRACE.coude["G"], F(13, 0.5), rot=(-10, 0, 0))
tete(GRACE, F(12, 1.5), rz=0)
tete(GRACE, F(12, 2.2), rz=35)
tete(GRACE, F(12, 3.4), rz=0)
cle(CHEN.racine, F(12, 0.4), rot=(0, 0, rz_chen))
cle(CHEN.racine, F(12, 1.0), rot=(0, 0, cap_vers(POS_CHEN, POS_GRACE)))
tete(CHEN, F(12, 1.0), rz=0)

# Plan 13 : Chen ajuste ses lunettes, surpris
cle(CHEN.epaule["G"], F(13, 0.1), rot=(0, -8, 0))
cle(CHEN.coude["G"], F(13, 0.1), rot=(-10, 0, 0))
cle(CHEN.epaule["G"], F(13, 0.6), rot=(-70, 8, -10))
cle(CHEN.coude["G"], F(13, 0.6), rot=(-120, 0, -30))
cle(CHEN.epaule["G"], F(13, 1.6), rot=(-70, 8, -10))
cle(CHEN.epaule["G"], F(13, 2.3), rot=(0, -8, 0))
cle(CHEN.coude["G"], F(13, 2.3), rot=(-10, 0, 0))
cle(CHEN.lunettes, F(13, 0.6), loc=(0, -CHEN.R * 0.94, CHEN.R * 1.12))
cle(CHEN.lunettes, F(13, 1.0), loc=(0, -CHEN.R * 0.94, CHEN.R * 1.16))
cle(CHEN.lunettes, F(13, 1.4), loc=(0, -CHEN.R * 0.94, CHEN.R * 1.12))
sourcils(CHEN, F(13, 0.0), 0.0)
sourcils(CHEN, F(13, 0.4), 0.02)
sourcils(CHEN, F(13, 2.6), 0.02)
sourcils(CHEN, F(14, 0.6), 0.0)
cle(CHEN.torse, F(13, 0.0), rot=(0, 0, 0))
cle(CHEN.torse, F(13, 0.5), rot=(-6, 0, 0))
cle(CHEN.torse, F(13, 2.5), rot=(0, 0, 0))

# Plan 14 : le taxi-bus s'arrête, Grace le montre du doigt
tete(GRACE, F(14, 0.5), rz=0)
tete(GRACE, F(14, 1.5), rz=40, rx=-5)
cle(GRACE.epaule["G"], F(14, 1.4), rot=(0, -8, 0))
cle(GRACE.coude["G"], F(14, 1.4), rot=(-10, 0, 0))
cle(GRACE.epaule["G"], F(14, 2.2), rot=(-60, -70, 0))
cle(GRACE.coude["G"], F(14, 2.2), rot=(-5, 0, 0))
cle(GRACE.epaule["G"], F(14, 4.5), rot=(-60, -70, 0))
cle(GRACE.epaule["G"], F(14, 5.2), rot=(0, -8, 0))
cle(GRACE.coude["G"], F(14, 5.2), rot=(-10, 0, 0))
tete(GRACE, F(14, 4.6), rz=40)
tete(GRACE, F(14, 5.3), rz=0)
tete(CHEN, F(14, 1.4), rz=0)
tete(CHEN, F(14, 2.2), rz=-45)
tete(CHEN, F(14, 5.5), rz=-30)
tete(FISTON, F(14, 2.0), rz=10)
tete(FISTON, F(14, 3.0), rz=50)

# Plan 15 : Chen demande le prix, Grace montre des petits billets
tete(CHEN, F(15, 0.2), rz=-30)
tete(CHEN, F(15, 0.6), rz=0)
cle(BILLETS, 1, ech=(0.001, 0.001, 0.001))
cle(BILLETS, F(15, 2.0), ech=(0.001, 0.001, 0.001))
cle(BILLETS, F(15, 2.1), ech=(1, 1, 1))
cle(BILLETS, F(16, 0.5), ech=(1, 1, 1))
cle(BILLETS, F(16, 0.6), ech=(0.001, 0.001, 0.001))
cle(GRACE.epaule["D"], F(15, 1.8), rot=(0, 8, 0))
cle(GRACE.coude["D"], F(15, 1.8), rot=(-10, 0, 0))
cle(GRACE.epaule["D"], F(15, 2.5), rot=(-50, 20, 0))
cle(GRACE.coude["D"], F(15, 2.5), rot=(-70, 0, 0))
cle(GRACE.epaule["D"], F(15, 4.6), rot=(-50, 20, 0))
cle(GRACE.epaule["D"], F(16, 0.6), rot=(0, 8, 0))
cle(GRACE.coude["D"], F(16, 0.6), rot=(-10, 0, 0))
cle(CHEN.torse, F(15, 0.2), rot=(0, 0, 0))
cle(CHEN.torse, F(15, 0.6), rot=(8, 0, 0))
cle(CHEN.torse, F(15, 4.0), rot=(0, 0, 0))

# Plan 16 : Fiston éclate de rire et se gratte la tête
tete(FISTON, F(16, 0.2), rx=0, rz=30)
tete(FISTON, F(16, 0.7), rx=-18, rz=20)
for k in range(6):
    cle(FISTON.torse, F(16, 0.6 + k * 0.18), rot=(-10 - (5 if k % 2 else 0), 0, 0))
cle(FISTON.torse, F(16, 2.0), rot=(0, 0, 0))
tete(FISTON, F(16, 2.0), rx=0, rz=15)
cle(FISTON.epaule["D"], F(16, 1.6), rot=(-25, 12, 0))
cle(FISTON.coude["D"], F(16, 1.6), rot=(-60, 0, 0))
for k in range(6):
    cle(FISTON.epaule["D"], F(16, 2.2 + k * 0.3), rot=(-140, 40 + (8 if k % 2 else 0), 0))
    cle(FISTON.coude["D"], F(16, 2.2 + k * 0.3), rot=(-100 - (12 if k % 2 else 0), 0, 0))
cle(FISTON.epaule["D"], F(16, 4.5), rot=(-25, 12, 0))
cle(FISTON.coude["D"], F(16, 4.5), rot=(-60, 0, 0))

# Plan 17 : Chen s'incline devant les deux, Grace fait signe de la suivre
cle(CHEN.racine, F(17, 0.1), rot=(0, 0, cap_vers(POS_CHEN, POS_GRACE)))
cle(CHEN.racine, F(17, 0.6), rot=(0, 0, rz_chen))
cle(CHEN.torse, F(17, 0.6), rot=(0, 0, 0))
cle(CHEN.torse, F(17, 1.0), rot=(20, 0, 0))
cle(CHEN.torse, F(17, 1.5), rot=(0, 0, 0))
cle(CHEN.racine, F(17, 1.8), rot=(0, 0, rz_chen))
cle(CHEN.racine, F(17, 2.3), rot=(0, 0, cap_vers(POS_CHEN, POS_GRACE)))
cle(CHEN.torse, F(17, 2.3), rot=(0, 0, 0))
cle(CHEN.torse, F(17, 2.7), rot=(20, 0, 0))
cle(CHEN.torse, F(17, 3.2), rot=(0, 0, 0))
tete(FISTON, F(17, 0.5), rz=0, rx=-5)
cle(GRACE.epaule["G"], F(17, 3.4), rot=(0, -8, 0))
cle(GRACE.coude["G"], F(17, 3.4), rot=(-10, 0, 0))
for k in range(4):
    cle(GRACE.epaule["G"], F(17, 4.0 + k * 0.35), rot=(-50, -50, 0))
    cle(GRACE.coude["G"], F(17, 4.0 + k * 0.35), rot=(-30 - (60 if k % 2 else 0), 0, 0))
cle(GRACE.epaule["G"], F(17, 5.6), rot=(0, -8, 0))
cle(GRACE.coude["G"], F(17, 5.6), rot=(-10, 0, 0))

# Plan 18 : départ vers le taxi-bus, Chen se retourne et fait au revoir, Fiston répond
DEST_GRACE = (POS_BUS[0] + 1.2, 3.6)
DEST_CHEN = (POS_BUS[0] + 1.9, 3.3)
cle(GRACE.racine, F(18, 0.0), loc=(*POS_GRACE, 0), rot=(0, 0, rz_grace_chen))
marche(GRACE, F(18, 0.3), F(18, 4.6), POS_GRACE, DEST_GRACE, pas=14, amplitude=22)
cle(CHEN.racine, F(18, 0.0), loc=(*POS_CHEN, 0), rot=(0, 0, cap_vers(POS_CHEN, POS_GRACE)))
marche(CHEN, F(18, 0.5), F(18, 4.8), POS_CHEN, DEST_CHEN, pas=13, amplitude=20, bras=False)
cle(CHEN.epaule["G"], F(18, 0.4), rot=(0, -8, 0))
cle(CHEN.epaule["G"], F(18, 0.8), rot=(28, -12, 0))
cle(VALISE, F(18, 0.4), loc=(0.4, 0.1, 0), rot=(0, 0, 0))
cle(VALISE, F(18, 0.9), loc=(0.36, 0.45, 0), rot=(-22, 0, 0))
for k in range(6):
    cle(CHEN.epaule["D"], F(18, 1.0 + k * 0.25), rot=(-10, 150 if k % 2 == 0 else 125, 0))
cle(CHEN.epaule["D"], F(18, 2.6), rot=(0, 8, 0))
tete(CHEN, F(18, 0.9), rz=0)
tete(CHEN, F(18, 1.2), rz=-100)
tete(CHEN, F(18, 2.5), rz=-100)
tete(CHEN, F(18, 2.9), rz=0)
for k in range(8):
    cle(FISTON.epaule["G"], F(18, 2.4 + k * 0.28), rot=(-10, -(150 if k % 2 == 0 else 120), 0))
cle(FISTON.epaule["G"], F(18, 1.8), rot=(-25, -12, 0))
cle(FISTON.coude["G"], F(18, 1.8), rot=(-60, 0, 0))
cle(FISTON.coude["G"], F(18, 2.4), rot=(-20, 0, 0))
cle(FISTON.epaule["G"], F(19, 0.4), rot=(-25, -12, 0))
cle(FISTON.coude["G"], F(19, 0.4), rot=(-60, 0, 0))
tete(FISTON, F(18, 0.5), rz=20)
# tout le monde monte dans le bus (on les fait disparaître dans le bus), puis le bus repart
cle(GRACE.racine, F(18, 4.7), ech=(1, 1, 1))
cle(GRACE.racine, F(18, 4.75), ech=(0.001, 0.001, 0.001))
cle(CHEN.racine, F(18, 4.85), ech=(1, 1, 1))
cle(CHEN.racine, F(18, 4.9), ech=(0.001, 0.001, 0.001))
cle(BUS2, F(19, 0.2), loc=(POS_BUS[0], POS_BUS[1], 0))
cle(BUS2, FIN_TOTALE, loc=(POS_BUS[0] - 16, POS_BUS[1], 0))

# Plan 19 : Fiston reprend son journal, secoue la tête, amusé
cle(JOURNAL, F(19, 0.2), loc=(0.3, -0.25, -0.02), rot=(-88, 0, 0))
cle(JOURNAL, F(19, 1.2), loc=(0, -0.42, 0.62), rot=(-8, 0, 0))
for nomc, cote in (("G", 1), ("D", -1)):
    cle(FISTON.epaule[nomc], F(19, 0.5), rot=(-25, -cote * 12, 0))
    cle(FISTON.coude[nomc], F(19, 0.5), rot=(-60, 0, 0))
    cle(FISTON.epaule[nomc], F(19, 1.2), rot=(-62, 0, cote * 20))
    cle(FISTON.coude[nomc], F(19, 1.2), rot=(-70, 0, 0))
for k, rzk in enumerate((10, -12, 12, -8, 0)):
    tete(FISTON, F(19, 0.3 + k * 0.25), rz=rzk, rx=5)

# Bouches qui parlent : d'après les répliques du scénario
QUI = {"CHEN": CHEN, "FISTON": FISTON, "GRACE": GRACE, "RECEVEUR": None}
for p in PLANS:
    for r in p["repliques"]:
        perso = QUI.get(r["qui"])
        if perso is not None:
            parler(perso, F(p["n"], r["debut"]), F(p["n"], r["fin"]))

# ======================================================================================
# Caméras : une par plan, cible = un « vide » (objet invisible) à regarder
# ======================================================================================
def camera(n, loc, cible, focale=35, loc_fin=None, cible_fin=None, ouverture=None, suivre=None):
    cam_data = bpy.data.cameras.new(f"CAM_{n:02d}")
    cam_data.lens = focale
    cam_data.sensor_width = 36
    c = bpy.data.objects.new(f"CAM_{n:02d}", cam_data)
    collection("Cameras").objects.link(c)
    t = vide(f"CAM_{n:02d}_cible", cible, coll="Cameras")
    if suivre is not None:
        t.parent = suivre
        t.location = cible
    con = c.constraints.new("TRACK_TO")
    con.target = t
    con.track_axis = "TRACK_NEGATIVE_Z"
    con.up_axis = "UP_Y"
    if ouverture:
        cam_data.dof.use_dof = True
        cam_data.dof.focus_object = t
        cam_data.dof.aperture_fstop = ouverture
    f0, f1 = DEBUT[n], DEBUT[n] + round(PLANS[n - 1]["duree"] * FPS) - 1
    cle(c, f0, loc=loc)
    cle(c, f1, loc=loc_fin or loc)
    if cible_fin:
        cle(t, f0, loc=cible)
        cle(t, f1, loc=cible_fin)
    m = scene.timeline_markers.new(f"PLAN_{n:02d}", frame=f0)
    m.camera = c
    return c


maintenir_poses()
bpy.context.view_layer.update()


def etat(perso, n, t):
    """Position de la tête (centre) et cap (degrés) d'un personnage au temps t du plan n."""
    scene.frame_set(F(n, t))
    bpy.context.view_layer.update()
    tv = perso.tete.matrix_world.translation
    cap = math.degrees(perso.racine.matrix_world.to_euler().z)
    return (tv.x, tv.y, tv.z + perso.R), cap


def portrait(n, perso, dist, decal, focale, t=0.5, dh=0.0, cadre=-0.12, recul=0.0, ouverture=2.8):
    """Caméra devant le personnage : `decal` degrés à côté de son regard, à `dist` mètres."""
    (hx, hy, hz), cap = etat(perso, n, PLANS[n - 1]["duree"] * t)
    a = rad(cap + decal)
    pos = (hx + dist * math.sin(a), hy - dist * math.cos(a), hz + dh)
    d2 = dist + recul
    fin = (hx + d2 * math.sin(a), hy - d2 * math.cos(a), hz + dh) if recul else None
    return camera(n, pos, (hx, hy, hz + cadre), focale, loc_fin=fin, ouverture=ouverture)


def milieu(*persos, n, t=0.5, dz=-0.1):
    pts = [etat(p, n, PLANS[n - 1]["duree"] * t)[0] for p in persos]
    return tuple(sum(v[i] for v in pts) / len(pts) for i in range(2)) + (sum(v[2] for v in pts) / len(pts) + dz,)


camera(1, (-3.2, -8.0, 2.3), (1.0, 1.2, 1.3), 28, loc_fin=(-2.6, -6.6, 2.1), ouverture=8)
camera(2, (-1.8, -4.4, 1.55), (-2.6, -0.4, 1.4), 32, loc_fin=(-0.9, -4.0, 1.55), cible_fin=(0.5, 0.0, 1.5), ouverture=4)
camera(3, (0.3, -3.6, 1.6), milieu(CHEN, FISTON, n=3, dz=-0.35), 35, ouverture=4)
portrait(4, FISTON, 2.0, 24, 38, cadre=-0.22, recul=-0.15)
portrait(5, CHEN, 1.9, -22, 45, t=0.6, cadre=-0.2, recul=-0.15)
camera(6, (-0.6, -3.0, 1.55), milieu(CHEN, FISTON, n=6, dz=-0.3), 32, ouverture=4)
portrait(7, CHEN, 1.8, -18, 45, cadre=-0.22)
portrait(8, FISTON, 1.9, 26, 40, cadre=-0.2, recul=-0.15)
camera(9, (-2.6, -6.2, 1.8), (-1.0, 0.0, 1.2), 26, ouverture=6)
portrait(10, GRACE, 2.5, -40, 38, t=0.4, dh=0.1, cadre=-0.4, recul=-0.2, ouverture=3.5)
portrait(11, FISTON, 1.35, 20, 50, t=0.4, cadre=-0.05, recul=-0.15, ouverture=2.0)
portrait(12, GRACE, 2.1, -30, 40, t=0.7, cadre=-0.25)
portrait(13, CHEN, 1.7, 20, 45, cadre=-0.15, recul=-0.15, ouverture=2.2)
camera(14, (1.8, -3.4, 1.7), (-1.9, 2.2, 1.4), 26, ouverture=5)
camera(15, (0.0, -2.5, 1.6), milieu(CHEN, GRACE, n=15, dz=-0.2), 38, ouverture=3.5)
portrait(16, FISTON, 2.1, 22, 38, cadre=-0.4, recul=-0.25, ouverture=3.5)
camera(17, (0.5, -4.3, 1.7), milieu(CHEN, GRACE, FISTON, n=17, dz=-0.35), 30, ouverture=5)
camera(18, (3.6, -5.6, 2.2), (-1.0, 2.2, 1.1), 24, ouverture=8)
portrait(19, FISTON, 2.2, 22, 38, t=0.3, cadre=-0.2, recul=-0.2)
scene.camera = bpy.data.objects["CAM_01"]

# ======================================================================================
# Lumière et rendu
# ======================================================================================
soleil_d = bpy.data.lights.new("SOLEIL", "SUN")
soleil_d.energy = 3.2
soleil_d.color = (1.0, 0.86, 0.66)
soleil_d.angle = rad(3)
soleil = bpy.data.objects.new("SOLEIL", soleil_d)
collection("Lumieres").objects.link(soleil)
soleil.rotation_euler = (rad(58), 0, rad(-35))
remplissage_d = bpy.data.lights.new("REMPLISSAGE", "SUN")
remplissage_d.energy = 0.8
remplissage_d.color = (0.65, 0.8, 1.0)
rem = bpy.data.objects.new("REMPLISSAGE", remplissage_d)
collection("Lumieres").objects.link(rem)
rem.rotation_euler = (rad(60), 0, rad(150))

monde = bpy.data.worlds.new("CIEL_matin")
scene.world = monde
monde.use_nodes = True
nt = monde.node_tree
bg = nt.nodes.get("Background")
coord = nt.nodes.new("ShaderNodeTexCoord")
sep = nt.nodes.new("ShaderNodeSeparateXYZ")
ramp = nt.nodes.new("ShaderNodeValToRGB")
ramp.color_ramp.elements[0].position = 0.0
ramp.color_ramp.elements[0].color = (1.0, 0.82, 0.6, 1)
ramp.color_ramp.elements[1].position = 0.45
ramp.color_ramp.elements[1].color = (0.35, 0.6, 0.95, 1)
nt.links.new(coord.outputs["Generated"], sep.inputs[0])
nt.links.new(coord.outputs["Window"], sep.inputs[0])
nt.links.new(sep.outputs["Y"], ramp.inputs["Fac"])
nt.links.new(ramp.outputs["Color"], bg.inputs["Color"])
bg.inputs["Strength"].default_value = 1.0

scene.view_settings.view_transform = "Standard"
scene.view_settings.exposure = -0.35
try:
    scene.view_settings.look = "Medium High Contrast"
except TypeError:
    pass

if QUALITE == "final":
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except TypeError:
        scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x, scene.render.resolution_y = 1920, 1080
    try:
        scene.eevee.use_raytracing = True
        scene.eevee.taa_render_samples = 64
    except AttributeError:
        pass
else:
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = int(opt("--echantillons", 24))
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 4
    scene.cycles.diffuse_bounces = 2
    scene.cycles.glossy_bounces = 1
    scene.cycles.transmission_bounces = 0
    scene.cycles.volume_bounces = 0
    scene.cycles.caustics_reflective = False
    scene.cycles.caustics_refractive = False
    scene.render.use_persistent_data = True
    largeur = int(opt("--largeur", 960))
    scene.render.resolution_x, scene.render.resolution_y = largeur, round(largeur * 9 / 16)
scene.render.resolution_percentage = 100
scene.render.film_transparent = False
scene.render.image_settings.file_format = "PNG"

blend = opt("--blend", os.path.join(RACINE, "blender", "where_is_zando.blend"))
os.makedirs(os.path.dirname(blend), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=blend, compress=True)
print(f"[OK] Scène enregistrée : {blend}  ({FIN_TOTALE} images, {FIN_TOTALE / FPS:.1f} s)")


# ======================================================================================
# Rendus
# ======================================================================================
def plans_choisis():
    v = opt("--plans")
    if v and v is not True:
        return [int(x) for x in v.split(",")]
    return [p["n"] for p in PLANS]


def rendre_image(frame, chemin, cam=None):
    scene.frame_set(frame)
    if cam:
        scene.camera = cam
    scene.render.filepath = chemin
    bpy.ops.render.render(write_still=True)


if opt("--images-plans"):
    os.makedirs(os.path.join(SORTIE, "images_plans"), exist_ok=True)
    for n in plans_choisis():
        p = PLANS[n - 1]
        milieu = F(n, p["duree"] * float(opt("--instant", 0.6)))
        rendre_image(milieu, os.path.join(SORTIE, "images_plans", f"plan_{n:02d}.png"), bpy.data.objects[f"CAM_{n:02d}"])
        print(f"[OK] image plan {n}")

if opt("--references"):
    dossier = os.path.join(SORTIE, "references")
    os.makedirs(dossier, exist_ok=True)
    # Décor : plan 1
    rendre_image(F(1, 4.0), os.path.join(dossier, "decor_kinshasa.png"), bpy.data.objects["CAM_01"])
    # Fiches personnages : on isole chaque personnage devant un fond neutre
    fond = prim("plan", "FOND_neutre", (0, 30, 0), (60, 60, 1), mat("FOND_gris", (0.82, 0.8, 0.78), 0.9), coll="Studio")
    fond.rotation_euler = (rad(90), 0, 0)
    sol = prim("plan", "SOL_neutre", (0, 0, 0.002), (60, 60, 1), mat("FOND_gris", (0.82, 0.8, 0.78), 0.9), coll="Studio")
    for c in ("Decor", "Vehicules", "Figurants", "Accessoires"):
        collection(c).hide_render = True
    for nom_c, p, assis in (("chen", CHEN, False), ("papa_fiston", FISTON, True), ("grace", GRACE, False)):
        for autre in (CHEN, FISTON, GRACE):
            for o in [autre.racine] + list(autre.racine.children_recursive):
                o.hide_render = autre is not p
        if p is FISTON:
            for o in bpy.data.objects:
                if o.name.startswith("TABOURET") or o.name.startswith("JOURNAL"):
                    o.hide_render = False
                    for cc in o.users_collection:
                        cc.hide_render = False
            collection("Decor").hide_render = False
            for o in collection("Decor").objects:
                o.hide_render = not o.name.startswith("TABOURET")
            collection("Accessoires").hide_render = False
            for o in collection("Accessoires").objects:
                o.hide_render = not o.name.startswith("JOURNAL")
        else:
            collection("Decor").hide_render = True
            collection("Accessoires").hide_render = p is not CHEN
            for o in collection("Accessoires").objects:
                o.hide_render = not o.name.startswith("VALISE")
        frame = F(5, 0.2) if p is CHEN else (F(17, 0.3) if p is FISTON else F(10, 1.2))
        scene.frame_set(frame)
        bpy.context.view_layer.update()
        base = p.racine.matrix_world.translation.copy()
        rzc = p.racine.matrix_world.to_euler().z
        h = 0.75 if assis else 0.95
        for vue, ang, dist in (("face", 0, 3.6), ("trois_quarts", 40, 3.6), ("profil", 90, 3.6)):
            a = rzc + rad(ang)
            pos = (base.x + dist * math.sin(a), base.y - dist * math.cos(a), h + 0.25)
            camd = bpy.data.cameras.new("CAM_REF")
            camd.lens = 50
            cam = bpy.data.objects.new("CAM_REF", camd)
            collection("Studio").objects.link(cam)
            cam.location = pos
            cib = vide("CAM_REF_cible", (base.x, base.y, h), coll="Studio")
            con = cam.constraints.new("TRACK_TO")
            con.target = cib
            con.track_axis = "TRACK_NEGATIVE_Z"
            con.up_axis = "UP_Y"
            fond.location = (base.x - math.sin(a) * 4, base.y + math.cos(a) * 4, 0)
            fond.rotation_euler = (rad(90), 0, a)
            rendre_image(frame, os.path.join(dossier, f"{nom_c}_{vue}.png"), cam)
        print(f"[OK] fiche {nom_c}")

if opt("--rendu"):
    dossier = os.path.join(SORTIE, "images")
    os.makedirs(dossier, exist_ok=True)
    debut = int(opt("--debut", 1))
    fin = int(opt("--fin", FIN_TOTALE))
    pas = int(opt("--pas", 1))
    for fr in range(debut, fin + 1, pas):
        chemin = os.path.join(dossier, f"{fr:05d}.png")
        if os.path.exists(chemin) and not opt("--ecraser"):
            continue
        scene.frame_set(fr)
        scene.render.filepath = chemin
        bpy.ops.render.render(write_still=True)
        print(f"[image] {fr}/{fin}", flush=True)
    print("[OK] rendu terminé :", dossier)

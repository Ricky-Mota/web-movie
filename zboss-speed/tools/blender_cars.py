"""Zboss-speed : modélisation procédurale des voitures dans Blender (bpy).

Chaque voiture est construite à partir d'un profil (mêmes cotes que assets/cars3d.js) :
caisse lissée (loft de sections + subdivision), passages de roue découpés, habitacle vitré,
optiques LED, roues détaillées (pneu, jante à branches, disque, étrier), rétroviseurs, diffuseur.
Modèles originaux : aucune forme, logo ou nom de constructeur réel.

Sorties :
  <out>/<id>.glb            modèle pour le jeu (three.js GLTFLoader)
  <out>/<id>-34.png / -side.png   rendus « photo » Cycles du même modèle (garage, site)

Usage : python blender_cars.py <dossier_sortie> [ids...] [--render] [--samples N]
Fonctionne avec Blender 4.x ou 5.x (bpy, ou blender --background --python).
"""
import bpy, bmesh, math, sys, os
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
OUT = argv[0]
RENDER = "--render" in argv
SAMPLES = int(argv[argv.index("--samples") + 1]) if "--samples" in argv else 64
IDS = [a for a in argv[1:] if not a.startswith("--") and not a.isdigit()]
os.makedirs(OUT, exist_ok=True)

# L longueur, Wd largeur, H toit, belt ligne de caisse, nose/tail hauteurs avant/arrière,
# ws base du pare-brise (x), rf/rr avant/arrière du toit, re fin de lunette, wb empattement, wr rayon de roue
PROFILES = {
    "kasai":   dict(L=4.6, Wd=2.02, H=1.14, belt=.86, nose=.42, tail=.9, ws=.75, rf=.02, rr=-.62, re=-1.45, wb=2.7, wr=.37, wing=True, intake=True, rim=(.08, .085, .1), metal=.9, color=(1.0, 0.1022, 0.0137), caliper=(1, .82, .1), sport=1),
    "lualaba": dict(L=4.75, Wd=2.04, H=1.16, belt=.84, nose=.4, tail=.82, ws=.7, rf=-.05, rr=-.7, re=-1.7, wb=2.75, wr=.38, rim=(.16, .12, .07), metal=.5, color=(0.4564, 0.2542, 0.1022), caliper=(.9, .7, .3), sport=1),
    "gombe":   dict(L=4.7, Wd=2.06, H=1.1, belt=.82, nose=.38, tail=.86, ws=.72, rf=0, rr=-.68, re=-1.6, wb=2.75, wr=.38, rim=(.03, .03, .035), metal=.9, color=(0.011, 0.0123, 0.0176), caliper=(.9, .05, .05), diffuser=True, intake=True, sport=1),
    "kivu":    dict(L=4.5, Wd=2.0, H=1.15, belt=.86, nose=.44, tail=.92, ws=.7, rf=0, rr=-.6, re=-1.35, wb=2.65, wr=.37, wing=True, rim=(.75, .77, .8), metal=.9, color=(1.0, 0.6445, 0.0137), caliper=(.95, .3, .05), sport=1),
    "ituri":   dict(L=4.4, Wd=1.98, H=1.0, belt=.84, nose=.42, tail=.86, ws=.55, rf=.1, rr=-.2, re=-.5, wb=2.6, wr=.36, roadster=True, rim=(.8, .82, .86), metal=.9, color=(0.3968, 0.5776, 0.7758), caliper=(.95, .85, .2), sport=1),
    "mayombe": dict(L=4.55, Wd=1.94, H=1.22, belt=.9, nose=.6, tail=.82, ws=.3, rf=-.35, rr=-.95, re=-1.85, wb=2.6, wr=.36, rim=(.8, .82, .86), metal=.6, color=(0.6867, 0.013, 0.013), caliper=(.2, .2, .22), chrome=True, sport=0),
    "sedan":   dict(L=4.7, Wd=1.88, H=1.45, belt=1.0, nose=.72, tail=.98, ws=1.05, rf=.35, rr=-.95, re=-1.65, wb=2.8, wr=.34, rim=(.7, .72, .76), metal=.6, color=(.5, .52, .56), caliper=(.2, .2, .22), sport=0),
    "suv":     dict(L=4.75, Wd=1.95, H=1.72, belt=1.12, nose=.9, tail=1.1, ws=1.2, rf=.55, rr=-1.95, re=-2.25, wb=2.85, wr=.38, rim=(.55, .57, .6), metal=.6, color=(.25, .28, .32), caliper=(.2, .2, .22), sport=0, suv=True),
    "hatch":   dict(L=4.05, Wd=1.8, H=1.48, belt=1.0, nose=.7, tail=1.0, ws=.85, rf=.2, rr=-1.55, re=-1.92, wb=2.55, wr=.32, rim=(.55, .57, .6), metal=.6, color=(.6, .62, .66), caliper=(.2, .2, .22), sport=0),
}

# ------------------------------------------------------------------ outils
def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def mat(name, color, metal=0., rough=.5, coat=0., emit=None, alpha=1.):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Metallic"].default_value = metal
    b.inputs["Roughness"].default_value = rough
    for k in ("Coat Weight", "Clearcoat"):
        if k in b.inputs: b.inputs[k].default_value = coat; break
    if "Coat Roughness" in b.inputs: b.inputs["Coat Roughness"].default_value = .03
    if emit:
        for k in ("Emission Color", "Emission"):
            if k in b.inputs: b.inputs[k].default_value = (*emit, 1); break
        if "Emission Strength" in b.inputs: b.inputs["Emission Strength"].default_value = 6.
    if alpha < 1:
        b.inputs["Alpha"].default_value = alpha
        try: m.surface_render_method = "BLENDED"
        except Exception: m.blend_method = "BLEND"
    return m

def obj_from_bm(name, bm, material=None):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(o)
    if material: o.data.materials.append(material)
    return o

def smooth(o, angle=40):
    for p in o.data.polygons: p.use_smooth = True
    try:
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.select_all(action="DESELECT"); o.select_set(True)
        bpy.ops.object.shade_auto_smooth(angle=math.radians(angle))
    except Exception:
        try: o.data.use_auto_smooth = True; o.data.auto_smooth_angle = math.radians(angle)
        except Exception: pass

def apply_mods(o):
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.select_all(action="DESELECT"); o.select_set(True)
    for m in list(o.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)

def subsurf(o, lvl=2):
    m = o.modifiers.new("sub", "SUBSURF"); m.levels = lvl; m.render_levels = lvl
    apply_mods(o)

def cube(name, size, loc, material, bevel=0., rot=(0, 0, 0), seg=2):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    o = obj_from_bm(name, bm, material); o.location = loc; o.rotation_euler = rot
    if bevel:
        b = o.modifiers.new("bev", "BEVEL"); b.width = bevel; b.segments = seg; b.limit_method = "NONE"
        apply_mods(o)
    return o

def cyl(name, r, depth, loc, material, verts=32, axis="Y", bevel=0., seg=3, r2=None):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=verts, radius1=r, radius2=r2 if r2 is not None else r, depth=depth)
    o = obj_from_bm(name, bm, material); o.location = loc
    if axis == "Y": o.rotation_euler = (math.pi / 2, 0, 0)
    elif axis == "X": o.rotation_euler = (0, math.pi / 2, 0)
    if bevel:
        b = o.modifiers.new("bev", "BEVEL"); b.width = bevel; b.segments = seg; b.limit_method = "ANGLE"
        apply_mods(o)
    return o

def tube(name, R, r, width, material, seg=40, vseg=12, y=0., flat=0.):
    """pneu / anneau autour de l'axe Y : rayon R, section elliptique (r radial, width/2 axial)"""
    bm = bmesh.new(); rings = []
    for i in range(seg):
        a = 2 * math.pi * i / seg; ca, sa = math.cos(a), math.sin(a); ring = []
        for j in range(vseg):
            b = 2 * math.pi * j / vseg; cb, sb = math.cos(b), math.sin(b)
            # section arrondie mais aplatie sur la bande de roulement
            cbx = max(-1, min(1, cb * (1 + flat))); rr = R + r * cbx
            ring.append(bm.verts.new((rr * sa, y + sb * width / 2, rr * ca)))
        rings.append(ring)
    for i in range(seg):
        a, b = rings[i], rings[(i + 1) % seg]
        for j in range(vseg):
            k = (j + 1) % vseg; bm.faces.new((a[j], b[j], b[k], a[k]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return obj_from_bm(name, bm, material)

def join(objs, name):
    objs = [o for o in objs if o]
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    bpy.ops.object.join(); objs[0].name = name
    return objs[0]

def catmull(pts, x):
    """interpolation lisse (Catmull-Rom) d'une liste [(x, y)] triée"""
    if x <= pts[0][0]: return pts[0][1]
    if x >= pts[-1][0]: return pts[-1][1]
    for i in range(len(pts) - 1):
        if pts[i][0] <= x <= pts[i + 1][0]: break
    p0 = pts[max(0, i - 1)][1]; p1 = pts[i][1]; p2 = pts[i + 1][1]; p3 = pts[min(len(pts) - 1, i + 2)][1]
    t = (x - pts[i][0]) / (pts[i + 1][0] - pts[i][0])
    return .5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3)

def loft(name, stations, section, material, closed_ends=True):
    """stations : liste de x ; section(x) -> liste de points (y, z) (boucle fermée, sens constant)"""
    bm = bmesh.new(); rings = []
    for x in stations:
        rings.append([bm.verts.new((x, y, z)) for (y, z) in section(x)])
    n = len(rings[0])
    for a, b in zip(rings, rings[1:]):
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((a[i], a[j], b[j], b[i]))
    if closed_ends:
        bm.faces.new(list(reversed(rings[0]))); bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return obj_from_bm(name, bm, material)

# ------------------------------------------------------------------ voiture
def build_car(cid, P, paint_color=None):
    L, Wd, H, wr, wb = P["L"], P["Wd"], P["H"], P["wr"], P["wb"]
    hl = L / 2; hw = Wd / 2 - .03
    sport = P.get("sport", 0)
    paint = mat("paint", paint_color or P["color"], metal=P["metal"], rough=.28 if P["metal"] > .7 else .35, coat=1.)
    trim = mat("trim", (.015, .016, .02), rough=.45)
    glass = mat("glass", (.02, .03, .045), metal=.2, rough=.04, coat=1.)
    chrome = mat("chrome", (.9, .92, .95), metal=1., rough=.08)
    lightF = mat("lightF", (1, 1, 1), emit=(1, .97, .9))
    lightR = mat("lightR", (.6, 0, 0), emit=(1, .03, .02))
    tire = mat("tire", (.025, .025, .027), rough=.85)
    rim = mat("rim", P["rim"], metal=.9, rough=.22)
    calip = mat("caliper", P["caliper"], rough=.35, coat=.5)
    disc = mat("disc", (.35, .35, .37), metal=1., rough=.35)

    fx, rx = wb / 2 + (.06 if sport else .04), -wb / 2 + (.02 if sport else 0)  # essieux (avant légèrement décalé)
    # --- profils longitudinaux
    clear_z = .16 if sport else .2 if not P.get("suv") else .28
    AR = wr + .055  # rayon des passages de roue
    need = 2 * wr + .055 + .07          # hauteur mini du capot / de la malle au-dessus des roues
    nose = max(P["nose"], .5 if sport else P["nose"])
    zf = max(need, (P["belt"] + nose) / 2 + .04)
    top = [(-hl, P["tail"] - .08), (-hl + .14, P["tail"]), (rx, max(need, min(P["tail"], P["belt"]) - .01)), (P["re"], P["belt"]),
           (P["ws"], P["belt"] + .02), (fx, zf), ((fx + hl - .16) / 2, zf * .58 + (nose + .03) * .42), (hl - .16, nose + .03), (hl, nose - .05)]
    top = sorted({round(x, 3): z for x, z in top}.items())
    bot = [(-hl, clear_z + .2), (-hl + .35, clear_z + .04), (-hl + .8, clear_z), (hl - .8, clear_z), (hl - .3, clear_z + .05), (hl, clear_z + .18)]

    def half_w(x):
        u = abs(x) / hl
        w = hw * (1 - .12 * max(0, (u - .72) / .28) ** 2.2)   # bouts arrondis en plan
        for ax in (fx, rx):                                    # ailes galbées au-dessus des roues
            d = (x - ax) / (wr * 1.7)
            w += (.045 if sport else .02) * math.exp(-d * d)
        return w

    def arch_z(x, zb):
        for ax in (fx, rx):
            d = abs(x - ax)
            if d < AR: zb = max(zb, wr + math.sqrt(AR * AR - d * d))
        return zb

    def body_sec(x, endk=1.):
        zt, w = catmull(top, x), half_w(x) * endk
        zb = arch_z(x, catmull(bot, x))
        zb = min(zb, zt - .14)
        sh = zt - .1 if zt - zb > .35 else zb + (zt - zb) * .7   # épaule
        mid = (zt + zb) / 2
        if endk < 1:  # bouts : section resserrée pour un nez / une poupe arrondis
            zt, zb = mid + (zt - mid) * (.55 + .45 * endk), mid + (zb - mid) * (.55 + .45 * endk); sh = mid + (sh - mid) * (.55 + .45 * endk)
        tumble = .05
        pts_r = [(0, zb), (w * .55, zb - .005), (w - .05, zb + .03), (w, zb + min(.12, (sh - zb) * .3)), (w + .005, (zb + sh) / 2), (w - .01, sh),
                 (w - tumble, zt - .02), (w * .6, zt + .012), (0, zt + .02)]
        pts_l = [(-y, z) for (y, z) in reversed(pts_r[1:-1])]
        return pts_r + pts_l

    N = 48
    xs = [-hl + .04 + i * (L - .08) / N for i in range(N + 1)]
    secs = {x: body_sec(x) for x in xs}
    secs[-hl + .005] = body_sec(-hl + .04, .82); secs[hl - .005] = body_sec(hl - .04, .82)
    xs = sorted(secs)
    body = loft("body", xs, lambda x: secs[x], paint)
    sub = body.modifiers.new("sub", "SUBSURF"); sub.levels = 1; apply_mods(body)
    smooth(body, 50)

    parts_paint, parts_trim, parts_glass, parts_chrome, parts_lf, parts_lr, parts_cal = [body], [], [], [], [], [], []
    # --- habitacle (verre) et pavillon peint
    if not P.get("roadster"):
        belt = P["belt"]
        def roof_z(x):
            pts = [(P["re"] - .02, belt), (P["rr"], H), (P["rf"], H), (P["ws"] + .02, belt)]
            if P["rr"] - P["re"] > .15: pts.insert(1, ((P["re"] + P["rr"]) / 2, belt + (H - belt) * .75))
            if P["ws"] - P["rf"] > .15: pts.insert(-1, ((P["ws"] + P["rf"]) / 2, belt + (H - belt) * .62))
            return catmull(sorted(pts), x)
        def gh_sec(x):
            z, w = roof_z(x), half_w(x) - .06
            wt = w * (.8 if not P.get("suv") else .88)
            return [(0, belt - .04), (w, belt - .04), (w, belt + .02), (wt, max(belt + .03, z - .05)), (wt * .8, z), (0, z + .01),
                    (-wt * .8, z), (-wt, max(belt + .03, z - .05)), (-w, belt + .02), (-w, belt - .04)]
        xs2 = [P["re"] + i * (P["ws"] - P["re"]) / 24 for i in range(25)]
        gh = loft("greenhouse", xs2, gh_sec, glass)
        s = gh.modifiers.new("sub", "SUBSURF"); s.levels = 1; apply_mods(gh); smooth(gh, 60)
        parts_glass.append(gh)
        # pavillon : panneau peint posé sur le toit (entre montants), légèrement au-dessus du verre
        def roof_sec(x):
            z, w = roof_z(x), (half_w(x) - .06) * (.8 if not P.get("suv") else .88) * .82
            return [(0, z - .02), (w, z - .045), (w + .01, z - .02), (w * .7, z + .012), (0, z + .02), (-w * .7, z + .012), (-w - .01, z - .02), (-w, z - .045)]
        r0, r1 = P["rr"] + (.1 if P["rr"] - P["re"] > .3 else .02), P["rf"] - .05
        if r1 - r0 > .3:
            roof = loft("roof", [r0 + i * (r1 - r0) / 12 for i in range(13)], roof_sec, paint)
            s = roof.modifiers.new("sub", "SUBSURF"); s.levels = 1; apply_mods(roof); smooth(roof, 60)
            parts_paint.append(roof)
        # montants B noirs
        bx = (P["rf"] + P["rr"]) / 2 - .1
        for sd in (1, -1):
            z0 = belt + .03; z1 = roof_z(bx) - .04
            parts_trim.append(cube("pillar", (.09, .02, z1 - z0), (bx, sd * ((half_w(bx) - .06) * .9 + .005), (z0 + z1) / 2), trim, rot=(sd * .25, 0, 0)))
    else:
        # roadster : pare-brise, arceaux, sièges
        ws = P["ws"]
        parts_glass.append(cube("windscreen", (.04, Wd * .78, .34), (ws - .05, 0, P["belt"] + .15), glass, bevel=.015, rot=(0, -.75, 0)))
        for sd in (1, -1):
            parts_trim.append(cube("seat", (.5, .5, .5), (-.25, sd * .42, P["belt"] - .05), trim, bevel=.12, seg=3))
            parts_paint.append(cube("hoop", (.35, .14, .28), (-.7, sd * .42, P["belt"] + .1), paint, bevel=.06, seg=3))

    zt_f, zt_r = catmull(top, hl - .12), catmull(top, -hl + .1)
    # --- optiques avant : fine signature LED sur le bord avant + bloc optique sombre affleurant
    for sd in (1, -1):
        lx = hl - .2; lw = half_w(lx)
        lz = catmull(top, lx) + .004
        slope = math.atan2(catmull(top, lx - .08) - catmull(top, lx + .08), .16)
        parts_trim.append(cube("lamp", (.16, .4, .03), (lx, sd * (lw - .3), lz - .008), trim, bevel=.01, rot=(0, slope, sd * .2)))
        parts_lf.append(cube("drl", (.03, .4, .02), (lx + .07, sd * (lw - .3), lz - .004 - .07 * math.sin(slope)), lightF, bevel=.006, rot=(0, slope, sd * .2)))
    # lame avant (splitter)
    sx = hl - .12
    parts_trim.append(cube("splitter", (.3, Wd * .8, .03), (sx, 0, arch_z(sx, catmull(bot, sx)) + .005), trim, bevel=.01))
    for sd in (1, -1):
        # rétroviseurs
        mx = P["ws"] - .12 if not P.get("roadster") else P["ws"] - .2
        parts_paint.append(cube("mirror", (.16, .2, .1), (mx, sd * (half_w(mx) + .1), P["belt"] + .1), paint, bevel=.035, seg=3))
        parts_trim.append(cube("mirror_arm", (.06, .14, .03), (mx + .02, sd * (half_w(mx) + .02), P["belt"] + .06), trim))
        # poignées affleurantes
        parts_trim.append(cube("handle", (.2, .012, .025), (-.15 if sport else .0, sd * (half_w(0) + .003), P["belt"] - .07), trim))
    # bandeau arrière continu (LED)
    parts_lr.append(cube("taillight", (.04, Wd * .82, .045), (-hl + .03, 0, zt_r - .07), lightR, bevel=.01))
    parts_trim.append(cube("tailband", (.05, Wd * .86, .12), (-hl + .05, 0, zt_r - .08), trim, bevel=.02))
    # calandre / entrées d'air (sur la face avant réelle)
    gx = hl - .06
    gzb = arch_z(gx, catmull(bot, gx)); gzt = catmull(top, gx); fz = (gzb + gzt) / 2 - .02
    gh_ = max(.08, (gzt - gzb) * .45)
    parts_trim.append(cube("grille", (.06, Wd * (.5 if sport else .44), gh_), (gx, 0, fz), trim, bevel=.02))
    if P.get("intake"):
        for sd in (1, -1): parts_trim.append(cube("intake", (.06, .3, gh_ * .8), (gx - .05, sd * (half_w(gx) - .3), fz - .01), trim, bevel=.02))
    if P.get("chrome"):
        parts_chrome.append(cube("grille_chrome", (.09, Wd * .3, .03), (hl - .03, 0, fz + .14), chrome, bevel=.01))
    # bas de caisse, diffuseur, échappements
    for sd in (1, -1): parts_trim.append(cube("skirt", (wb - wr * 2.3, .04, .08), ((fx + rx) / 2, sd * (half_w(0) - .01), clear_z + .06), trim, bevel=.015))
    parts_trim.append(cube("diffuser", (.3, Wd * .7, .1), (-hl + .2, 0, clear_z + .08), trim, bevel=.02))
    if P.get("diffuser"):
        for k in range(5): parts_trim.append(cube("fin", (.3, .015, .12), (-hl + .2, (k - 2) * .22, clear_z + .05), trim))
    for sd in ((1, -1) if sport else (1,)):
        parts_chrome.append(cyl("exhaust", .045, .12, (-hl + .02, sd * Wd * .26, clear_z + .1), chrome, verts=16, axis="X"))
    if P.get("wing"):
        wz = zt_r + .22
        parts_trim.append(cube("wing", (.3, Wd * .9, .03), (-hl + .25, 0, wz), trim, bevel=.012, rot=(0, .08, 0)))
        for sd in (1, -1): parts_trim.append(cube("wing_post", (.12, .025, .22), (-hl + .3, sd * Wd * .3, wz - .11), trim))
    # passages de roue (intérieur noir) + étriers (fixes)
    for ax in (fx, rx):
        for sd in (1, -1):
            w_ = cyl("well", wr + .06, .5, (ax, sd * (hw - .42), wr), trim, verts=32); parts_trim.append(w_)
            parts_cal.append(cube("caliper", (.2, .07, .12), (ax - wr * .3, sd * (hw - .19), wr + wr * .35), calip, bevel=.02, rot=(0, .9, 0)))

    groups = [("paint", parts_paint), ("trim", parts_trim), ("glass", parts_glass), ("chrome", parts_chrome),
              ("lightF", parts_lf), ("lightR", parts_lr), ("caliper", parts_cal)]
    statics = [join(objs, "car_" + k) for k, objs in groups if objs]
    # --- roues (objets séparés, pivot au moyeu, pour tourner dans le jeu)
    wheels = []
    for name, ax, sd in (("wheel_FL", fx, 1), ("wheel_FR", fx, -1), ("wheel_RL", rx, 1), ("wheel_RR", rx, -1)):
        wy = sd * (hw - .17)
        tw = .27 if sport else .22
        rr_ = wr * (.72 if sport else .66)
        t = tube("tire", (wr + rr_) / 2, (wr - rr_) / 2, tw, tire, seg=36, vseg=10, flat=.35)
        lip = tube("lip", rr_ - .012, .016, tw * .5, rim, seg=32, vseg=6, y=sd * tw * .22)
        hub = cyl("hub", rr_ * .2, .06, (0, sd * tw * .3, 0), rim, verts=20, bevel=.015, seg=2)
        spokes = []
        nsp = 5 if sport else 6
        for k in range(nsp):
            a = k * 2 * math.pi / nsp
            for off in ((-.13, .13) if sport else (0,)):
                sp = cube("spoke", (.045 if sport else .06, .04, rr_ * .82), (0, 0, 0), rim, bevel=.012, seg=1, rot=(0, a + off, 0))
                sp.location = (math.sin(a + off) * rr_ * .52, sd * tw * .27, math.cos(a + off) * rr_ * .52)
                spokes.append(sp)
        d = cyl("disc", rr_ * .8, .025, (0, sd * tw * -.02, 0), disc, verts=24)
        dark = cyl("barrel", rr_ * .99, .02, (0, -sd * tw * .2, 0), trim, verts=24)
        face = None
        w = join([t, lip, hub, d, dark] + spokes, name)
        # la face de jante devient un anneau : on garde la face sombre visible entre les branches
        w.location = (ax, wy, wr)
        wheels.append(w)
    for w in wheels:
        bpy.context.view_layer.objects.active = w
        bpy.ops.object.select_all(action="DESELECT"); w.select_set(True)
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    for o in statics: smooth(o, 45)
    for o in wheels: smooth(o, 40)
    return statics, wheels

# ------------------------------------------------------------------ export + rendu
def export_glb(path):
    kw = dict(filepath=path, export_format="GLB", export_apply=True, export_yup=True, use_selection=False,
              export_materials="EXPORT", export_normals=True)
    try: bpy.ops.export_scene.gltf(**kw, export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6)
    except TypeError: bpy.ops.export_scene.gltf(**kw)

def studio(view, out, P):
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"; sc.cycles.samples = SAMPLES; sc.cycles.use_denoising = True
    try: sc.cycles.device = "CPU"
    except Exception: pass
    sc.render.resolution_x, sc.render.resolution_y = (1600, 900)
    sc.render.film_transparent = True; sc.render.image_settings.file_format = "PNG"; sc.render.image_settings.color_mode = "RGBA"
    try: sc.view_settings.view_transform = "AgX"; sc.view_settings.look = "AgX - Medium High Contrast"
    except Exception:
        try: sc.view_settings.view_transform = "Filmic"
        except Exception: pass
    if not sc.world: sc.world = bpy.data.worlds.new("w")
    w = sc.world; w.use_nodes = True
    bg = w.node_tree.nodes.get("Background"); bg.inputs[0].default_value = (.55, .6, .7, 1); bg.inputs[1].default_value = .35
    # sol attrapeur d'ombres
    if "floor" not in bpy.data.objects:
        bpy.ops.mesh.primitive_plane_add(size=40); fl = bpy.context.active_object; fl.name = "floor"
        fl.is_shadow_catcher = True
        # lumières de studio (softboxes)
        for name, loc, rot, en, size in (("key", (2.5, 4, 5), (-.6, .3, 2.6), 900, 4), ("fill", (-4, -3, 3), (.9, -.2, -2.2), 350, 5),
                                         ("top", (0, 0, 7), (0, 0, 0), 600, 6), ("rim", (-5, 3, 2), (1.2, 0, -2.4), 500, 3)):
            ld = bpy.data.lights.new(name, "AREA"); ld.energy = en; ld.size = size
            lo = bpy.data.objects.new(name, ld); lo.location = loc; lo.rotation_euler = rot; sc.collection.objects.link(lo)
    cam = bpy.data.objects.get("cam")
    if not cam:
        cd = bpy.data.cameras.new("cam"); cam = bpy.data.objects.new("cam", cd); sc.collection.objects.link(cam); sc.camera = cam
    cam.data.lens = 50
    tgt = Vector((0, 0, P["H"] * .42))
    if view == "34": pos = Vector((P["L"] * 1.05, -P["L"] * 1.0, 1.35))
    elif view == "side": pos = Vector((0, -P["L"] * 1.85, .75)); cam.data.lens = 55
    else: pos = Vector((-P["L"] * 1.1, -P["L"] * .9, 1.4))
    cam.location = pos; cam.rotation_euler = (tgt - pos).to_track_quat("-Z", "Y").to_euler()
    sc.render.filepath = out
    bpy.ops.render.render(write_still=True)

if __name__ == "__main__":
    for cid in (IDS or list(PROFILES)):
        clear()
        P = PROFILES[cid]
        build_car(cid, P)
        export_glb(os.path.join(OUT, cid + ".glb"))
        print("ok", cid, os.path.getsize(os.path.join(OUT, cid + ".glb")) // 1024, "Ko", flush=True)
        if RENDER and cid not in ("sedan", "suv", "hatch"):
            for v in ("34", "side"):
                studio(v, os.path.join(OUT, f"{cid}-{v}.png"), P)

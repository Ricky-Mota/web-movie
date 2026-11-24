"""Zboss-speed : génère des personnages humains réalistes, riggés et animés (glb).

Base : maillage et cibles MakeHuman / MPFB2 (licence CC0). Le script lit SEULEMENT
les fichiers de données (base.obj, targets/*.target.gz, rig.game_engine.json,
weights.game_engine.json) ; il n'importe aucun code MPFB.

Usage (bpy 4.x/5.x en module Python, ou blender -b -P) :
  python blender_humans.py <dossier mpfb/data> <sortie.glb> [--render dossier] [--tex 1024]

Sortie : un seul glb avec 7 personnages (hommes, femmes, morphologies et tenues
variées), une texture de peau partagée, et 4 animations sur le squelette commun :
idle, walk, run, cower. Chaque os porte userData.n = son vrai nom (three.js renomme
les doublons). Les matériaux portent des noms stables (skin, eye, shirt, pants,
shoes, hair, wax) pour recolorer chaque piéton dans le jeu.
"""
import bpy, bmesh, gzip, json, math, os, random, sys
import numpy as np
from mathutils import Vector, Matrix, Quaternion

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
DATA, OUT = argv[0], argv[1]
RENDER = argv[argv.index("--render") + 1] if "--render" in argv else None
TEX = int(argv[argv.index("--tex") + 1]) if "--tex" in argv else 1024
random.seed(7)
np.random.seed(7)

# ---------------------------------------------------------------- personnages
# g: 1 homme / 0 femme ; mus, wt, h : 0..1 (0.5 = moyen) ; tone : facteur sur la peau
VARIANTS = [
    dict(id="m1", g=1.0, mus=.62, wt=.42, h=.62, tone=1.00, top="tee", bottom="pants", hair="short"),
    dict(id="m2", g=1.0, mus=.50, wt=.78, h=.48, tone=.80, top="shirt", bottom="pants", hair="short"),
    dict(id="m3", g=.95, mus=.80, wt=.38, h=.72, tone=.68, top="tank", bottom="shorts", hair="bald"),
    dict(id="m4", g=1.0, mus=.55, wt=.55, h=.55, tone=.88, top="long", bottom="pants", hair="short"),
    dict(id="f1", g=0.0, mus=.45, wt=.55, h=.45, tone=.90, top="tee", bottom="pagne", hair="wrap"),
    dict(id="f2", g=0.0, mus=.40, wt=.80, h=.40, tone=.75, top="long", bottom="pagne", hair="wrap"),
    dict(id="f3", g=.02, mus=.50, wt=.45, h=.60, tone=1.00, top="tank", bottom="pants", hair="puff"),
]
FINGERS = ("thumb", "index", "middle", "ring", "pinky")

# ---------------------------------------------------------------- lecture OBJ
def read_obj(path):
    V, VT, F = [], [], []
    g = None
    for line in open(path):
        if line.startswith("v "):
            V.append([float(x) for x in line.split()[1:4]])
        elif line.startswith("vt "):
            VT.append([float(x) for x in line.split()[1:3]])
        elif line.startswith("g "):
            g = line.split()[1]
        elif line.startswith("f "):
            vi, ti = [], []
            for t in line.split()[1:]:
                p = t.split("/")
                vi.append(int(p[0]) - 1)
                ti.append(int(p[1]) - 1 if len(p) > 1 and p[1] else 0)
            F.append((tuple(vi), tuple(ti), g))
    return np.array(V, dtype=np.float64), np.array(VT), F

V0, VT, FACES = read_obj(os.path.join(DATA, "3dobjs", "base.obj"))
GROUPS = {}
for f in FACES:
    GROUPS.setdefault(f[2], []).append(f)
TD = os.path.join(DATA, "targets", "macrodetails")
_tcache = {}

def target(name):
    if name not in _tcache:
        p = os.path.join(TD, name + ".target.gz")
        idx, d = [], []
        with gzip.open(p, "rt") as fh:
            for line in fh:
                s = line.split()
                if len(s) == 4 and not line.startswith("#"):
                    idx.append(int(s[0])); d.append([float(x) for x in s[1:]])
        _tcache[name] = (np.array(idx, dtype=np.int64), np.array(d, dtype=np.float64).reshape(-1, 3))
    return _tcache[name]

def tri(v, lo, mid, hi):
    """poids MakeHuman pour une valeur 0..1 -> {min, average, max}"""
    if v < .5:
        return {lo: (.5 - v) * 2, mid: 1 - (.5 - v) * 2}
    return {mid: 1 - (v - .5) * 2, hi: (v - .5) * 2}

def morph(P):
    V = V0.copy()
    gw = {"male": P["g"], "female": 1 - P["g"]}
    mw = tri(P["mus"], "minmuscle", "averagemuscle", "maxmuscle")
    ww = tri(P["wt"], "minweight", "averageweight", "maxweight")
    def add(name, w):
        if w <= 1e-4:
            return
        i, d = target(name)
        V[i] += d * w
    for g, a in gw.items():
        add("african-%s-young" % g, a)
        for m, b in mw.items():
            for w, c in ww.items():
                add("universal-%s-young-%s-%s" % (g, m, w), a * b * c)
                hk = "maxheight" if P["h"] >= .5 else "minheight"
                add("height/%s-young-%s-%s-%s" % (g, m, w, hk), a * b * c * abs(P["h"] - .5) * 2)
                add("proportions/%s-young-%s-%s-idealproportions" % (g, m, w), a * b * c * .7)
    # obj : décimètres, Y haut, Z avant -> Blender : mètres, Z haut, -Y avant
    B = np.stack([V[:, 0], -V[:, 2], V[:, 1]], 1) * .1
    return B

# ---------------------------------------------------------------- squelette
RIG = json.load(open(os.path.join(DATA, "rigs", "standard", "rig.game_engine.json")))
WRAW = json.load(open(os.path.join(DATA, "rigs", "standard", "weights.game_engine.json")))["weights"]

def keep_bone(n):
    return not n.startswith(FINGERS)

def merged_weights():
    """poids par os ; les doigts sont fusionnés dans la main"""
    W = {}
    for b, lst in WRAW.items():
        tgt = b if keep_bone(b) else "hand_" + b[-1]
        d = W.setdefault(tgt, {})
        for i, w in lst:
            d[i] = d.get(i, 0) + w
    return W

WEIGHTS = merged_weights()
NV = len(V0)
BONES = [b for b in RIG if keep_bone(b)]
BI = {b: k for k, b in enumerate(BONES)}
WM = np.zeros((NV, len(BONES)), dtype=np.float32)
for b, d in WEIGHTS.items():
    for i, w in d.items():
        WM[i, BI[b]] = w
WM /= np.maximum(WM.sum(1, keepdims=True), 1e-6)

def joint_pos(B, spec):
    if spec["strategy"] == "CUBE":
        vs = sorted({v for f in GROUPS[spec["cube_name"]] for v in f[0]})
        return B[vs].mean(0)
    return B[spec["vertex_indices"]].mean(0)

def bone_frames(B):
    J = {}
    for b in BONES:
        h = joint_pos(B, RIG[b]["head"])
        t = joint_pos(B, RIG[b]["tail"]) if b != "Root" else h + np.array([0, .12, 0])
        if np.linalg.norm(t - h) < 1e-3:
            t = h + np.array([0, 0, .05])
        J[b] = (h, t)
    return J

# ---------------------------------------------------------------- utilitaires
def smooth(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)

def bone_t(B, J, b):
    h, t = J[b]
    d = t - h
    return ((B - h) @ d) / (d @ d)

def make_mesh(name, B, faces, mat):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in B], [], [f[0] for f in faces])
    uv = me.uv_layers.new(name="UVMap")
    lu = []
    for f in faces:
        for t in f[1]:
            lu.extend(VT[t] if len(VT) else (0, 0))
    uv.data.foreach_set("uv", lu)
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    for b in BONES:
        ob.vertex_groups.new(name=b)
    at = me.attributes.new("oi", "INT", "POINT")
    at.data.foreach_set("value", np.arange(len(B), dtype=np.int32))
    used = sorted({v for f in faces for v in f[0]})
    for i in used:
        for k in np.nonzero(WM[i] > 1e-3)[0]:
            ob.vertex_groups[int(k)].add([i], float(WM[i, k]), "REPLACE")
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bm.to_mesh(me); bm.free()
    me.update()
    return ob

def vnormals(ob):
    n = np.zeros(len(ob.data.vertices) * 3)
    ob.data.vertices.foreach_get("normal", n)
    return n.reshape(-1, 3)

def vcos(ob):
    c = np.zeros(len(ob.data.vertices) * 3)
    ob.data.vertices.foreach_get("co", c)
    return c.reshape(-1, 3)

def set_cos(ob, c):
    ob.data.vertices.foreach_set("co", c.ravel())
    ob.data.update()

def inflate(ob, d):
    """gonfle le long des normales ; d scalaire ou fonction(co, n) -> distances"""
    c, n = vcos(ob), vnormals(ob)
    dd = d(c, n) if callable(d) else d
    set_cos(ob, c + n * np.asarray(dd).reshape(-1, 1))

def orig_index(ob):
    """indice d'origine (base.obj) de chaque sommet, via un attribut posé avant le nettoyage"""
    a = np.zeros(len(ob.data.vertices), dtype=np.int32)
    ob.data.attributes["oi"].data.foreach_get("value", a)
    return a

def decimate(ob, ratio, protect=None):
    m = ob.modifiers.new("dec", "DECIMATE")
    m.ratio = ratio
    m.use_symmetry = True
    m.symmetry_axis = "X"
    if protect:
        m.vertex_group = protect
        m.vertex_group_factor = 4.0
        m.invert_vertex_group = True
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.modifier_apply(modifier=m.name)

def tris(ob):
    return sum(len(p.vertices) - 2 for p in ob.data.polygons)

# ---------------------------------------------------------------- matériaux
def srgb(h):
    h = h.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [x / 12.92 if x <= .04045 else ((x + .055) / 1.055) ** 2.4 for x in c] + [1]

def material(name, color, rough=.7, img=None, metal=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bs = m.node_tree.nodes["Principled BSDF"]
    bs.inputs["Base Color"].default_value = color
    bs.inputs["Roughness"].default_value = rough
    bs.inputs["Metallic"].default_value = metal
    if img is not None:
        tx = m.node_tree.nodes.new("ShaderNodeTexImage")
        tx.image = img
        m.node_tree.links.new(tx.outputs["Color"], bs.inputs["Base Color"])
    return m

def wax_image():
    """tissu wax procédural (motifs ronds et bandes) 256 px, sans source externe"""
    S = 256
    y, x = np.mgrid[0:S, 0:S] / S
    col = np.zeros((S, S, 3))
    base = np.array([.93, .45, .08]); c2 = np.array([.06, .22, .55]); c3 = np.array([.98, .82, .15]); c4 = np.array([.05, .05, .06])
    col[:] = base
    cx, cy = (x * 4) % 1 - .5, (y * 4) % 1 - .5
    r = np.hypot(cx, cy)
    col[r < .38] = c2
    col[r < .26] = c3
    col[r < .12] = c4
    band = ((y * 8) % 1) < .12
    col[band] = c4
    dots = (np.hypot((x * 16) % 1 - .5, (y * 16) % 1 - .5) < .14) & (r > .38)
    col[dots] = c3
    im = bpy.data.images.new("wax", S, S)
    px = np.ones((S, S, 4)); px[..., :3] = col ** 2.2
    im.pixels.foreach_set(px[::-1].ravel().astype(np.float32))
    im.file_format = "PNG"
    return im

def eye_image():
    S = 64
    y, x = (np.mgrid[0:S, 0:S] + .5) / S - .5
    r = np.hypot(x, y) * 2
    col = np.zeros((S, S, 3))
    col[:] = [.82, .78, .74]                       # sclère légèrement teintée
    iris = r < .55
    ang = np.arctan2(y, x)
    ir = np.array([.23, .13, .07]) * (0.75 + .25 * np.cos(ang * 23)[..., None] * (r[..., None] > .2))
    col[iris] = ir[iris]
    col[r < .5] *= 1.0
    col[(r > .5) & (r < .56)] = [.06, .04, .03]
    col[r < .22] = [.01, .01, .01]
    hl = np.hypot(x + .12, y - .12) < .06          # reflet
    col[hl] = [.95, .95, .95]
    im = bpy.data.images.new("eye", S, S)
    px = np.ones((S, S, 4)); px[..., :3] = np.clip(col, 0, 1) ** 2.2
    im.pixels.foreach_set(px[::-1].ravel().astype(np.float32))
    im.file_format = "PNG"
    return im

# ---------------------------------------------------------------- texture de peau
def bake_maps(ob):
    """position et normale (espace objet) + occlusion ambiante, cuites dans l'espace UV"""
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = 1
    out = {}
    me = ob.data
    mat = bpy.data.materials.new("bake"); mat.use_nodes = True
    nt = mat.node_tree; nt.nodes.clear()
    o = nt.nodes.new("ShaderNodeOutputMaterial")
    em = nt.nodes.new("ShaderNodeEmission")
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    mp = nt.nodes.new("ShaderNodeVectorMath"); mp.operation = "MULTIPLY_ADD"
    mp.inputs[1].default_value = (.25, .25, .25); mp.inputs[2].default_value = (.5, .5, .05)
    nt.links.new(geo.outputs["Position"], mp.inputs[0])
    nt.links.new(mp.outputs[0], em.inputs["Color"])
    nt.links.new(em.outputs[0], o.inputs["Surface"])
    img = nt.nodes.new("ShaderNodeTexImage")
    old = list(me.materials)
    me.materials.clear(); me.materials.append(mat)
    for o_ in bpy.context.view_layer.objects: o_.select_set(False)
    ob.select_set(True); bpy.context.view_layer.objects.active = ob

    def run(kind, samples=1):
        im = bpy.data.images.new("bk_" + kind, TEX, TEX, float_buffer=True)
        img.image = im; nt.nodes.active = img
        sc.cycles.samples = samples
        sc.render.bake.margin = 6
        if kind == "pos":
            bpy.ops.object.bake(type="EMIT")
        elif kind == "nor":
            sc.render.bake.normal_space = "OBJECT"
            bpy.ops.object.bake(type="NORMAL")
        else:
            bpy.ops.object.bake(type="AO")
        a = np.zeros(TEX * TEX * 4, dtype=np.float32)
        im.pixels.foreach_get(a)
        return a.reshape(TEX, TEX, 4)[::-1]
    out["pos"] = run("pos")
    out["nor"] = run("nor")
    out["ao"] = run("ao", 48)
    me.materials.clear()
    for m in old: me.materials.append(m)
    sc.cycles.samples = 64
    return out

def skin_image(maps, J):
    from PIL import Image
    pos = (maps["pos"][..., :3] - [.5, .5, .05]) / .25
    nor = maps["nor"][..., :3] * 2 - 1
    ao = maps["ao"][..., 0]
    cov = maps["pos"][..., 3] > .5
    S = TEX
    base = np.array(srgb("#8a5a3e")[:3])
    col = np.ones((S, S, 3)) * base
    # variations basse et haute fréquence (grain de peau)
    rng = np.random.default_rng(3)
    def noise(sz, amp):
        n = rng.standard_normal((sz, sz))
        im = Image.fromarray(((n - n.min()) / (n.max() - n.min()) * 255).astype(np.uint8)).resize((S, S), Image.BICUBIC)
        return (np.asarray(im) / 255. - .5) * 2 * amp
    col *= (1 + noise(24, .07) + noise(160, .035) + noise(S // 2, .03))[..., None]

    def mask(name):
        im = Image.open(os.path.join(DATA, "textures", "mpfb_%s.jpg" % name)).convert("L").resize((S, S), Image.BILINEAR)
        return (np.asarray(im) / 255.)[..., None]
    lips = mask("lips")
    col = col * (1 - lips * .75) + np.array(srgb("#5c3834")[:3]) * lips * .75
    lid = mask("eyelids")
    col *= 1 - lid * .25
    nails = np.clip(mask("fingernails") + mask("toenails"), 0, 1)
    col = col * (1 - nails * .8) + np.array(srgb("#b88d7a")[:3]) * nails * .8
    # paumes et plantes plus claires
    hl, hr = J["hand_l"][0], J["hand_r"][0]
    dh = np.minimum(np.linalg.norm(pos - hl, axis=-1), np.linalg.norm(pos - hr, axis=-1))
    palm = smooth(.16, .09, dh) * smooth(-.1, -.55, nor[..., 2])
    sole = smooth(.035, .01, pos[..., 2]) * smooth(-.3, -.8, nor[..., 2])
    light = np.array(srgb("#b98a6e")[:3])
    for m in (palm, sole):
        col = col * (1 - m[..., None] * .75) + light * m[..., None] * .75
    # sourcils : arc au-dessus de chaque oeil, sur la face avant
    for side in ("l", "r"):
        e = np.array([sorted({v for f in GROUPS["helper-%s-eye" % side] for v in f[0]})]).ravel()
        c = EYEC[side]
        dx = (pos[..., 0] - c[0]) * (1 if side == "l" else -1)      # >0 vers l'extérieur
        u = dx / .032
        zc = c[2] + .019 + .006 * (1 - u * u) - .004 * np.clip(u, 0, 1)
        thick = .0055 * (1 - np.clip(u, -1, 1) * .35) * (np.abs(u) < 1.15)
        dz = np.abs(pos[..., 2] - zc)
        front = (nor[..., 1] < -.2) & (pos[..., 1] < c[1] + .02)
        b = smooth(thick, thick * .45, dz) * front * smooth(1.2, .9, np.abs(u - .05))
        hair = .65 + .35 * np.sin(pos[..., 0] * 2400 + pos[..., 2] * 900) ** 2
        b = (b * hair)[..., None]
        col = col * (1 - b * .85) + np.array([.012, .008, .006]) * b * .85
    # occlusion ambiante cuite
    col *= (np.clip(ao, 0, 1) ** .7)[..., None] * .85 + .15
    col = np.clip(col, 0, 1)
    out = np.where(cov[..., None], col, base)
    s = np.where(out <= .0031308, out * 12.92, 1.055 * np.power(out, 1 / 2.4) - .055)
    im = bpy.data.images.new("skin", S, S)
    px = np.ones((S, S, 4), dtype=np.float32)
    px[..., :3] = out
    im.pixels.foreach_set(px[::-1].ravel())
    im.file_format = "JPEG"
    Image.fromarray((np.clip(s, 0, 1) * 255).astype(np.uint8)).save(os.path.splitext(OUT)[0] + "_skin.jpg", quality=88)
    return im

# ---------------------------------------------------------------- vêtements
def region(B, J, spec):
    """somme des poids des os listés ; spec = {os: (tmin, tmax) ou None}"""
    s = np.zeros(NV, dtype=np.float32)
    for b, lim in spec.items():
        w = WM[:, BI[b]].copy()
        if lim:
            t = bone_t(B, J, b)
            w *= (t >= lim[0]) & (t <= lim[1])
        s += w
    return s

def sides(*names):
    out = []
    for n in names:
        out += [n + "_l", n + "_r"]
    return out

def top_spec(kind):
    sp = {b: None for b in ("spine_01", "spine_02", "spine_03")}
    sp.update({b: None for b in sides("clavicle")})
    sp["pelvis"] = None
    if kind == "tank":
        sp.update({b: None for b in ()})
        for b in sides("clavicle"):
            sp[b] = (-1, .55)
    elif kind in ("tee", "shirt"):
        for b in sides("upperarm"):
            sp[b] = (-1, .42 if kind == "tee" else .55)
    elif kind == "long":
        for b in sides("upperarm"):
            sp[b] = None
        for b in sides("lowerarm"):
            sp[b] = (-1, .9)
    return sp

def bottom_spec(kind):
    sp = {"pelvis": None}
    if kind == "shorts":
        for b in sides("thigh"):
            sp[b] = (-1, .62)
    else:
        for b in sides("thigh"):
            sp[b] = None
        for b in sides("calf"):
            sp[b] = (-1, .9)
    return sp

SHOE = lambda: {**{b: None for b in sides("foot", "ball")}, **{b: (.88, 2) for b in sides("calf")}}

def faces_where(group, ok):
    return [f for f in GROUPS[group] if all(ok[v] for v in f[0])]

# ---------------------------------------------------------------- un personnage
EYEC = {}

def build_variant(P, mats):
    B = morph(P)
    J0 = bone_frames(B)
    zmin = B[[v for f in GROUPS["body"] for v in f[0]]][:, 2].min()
    B[:, 2] += -zmin + .012
    J = bone_frames(B)
    for s in ("l", "r"):
        EYEC[s] = B[sorted({v for f in GROUPS["helper-%s-eye" % s] for v in f[0]})].mean(0)
    parts = []
    hide = np.zeros(NV, bool)
    # haut
    tsp = top_spec(P["top"])
    rt = region(B, J, tsp) * smooth(J["thigh_l"][0][2] - .02, J["thigh_l"][0][2] + .01, B[:, 2])
    parts.append(("shirt", faces_where("helper-tights", rt > .45), .010 if P["top"] != "tank" else .006))
    hide |= rt > .985
    # bas
    if P["bottom"] == "pagne":
        sk = GROUPS["helper-skirt"]
        parts.append(("wax", sk, .004))
        legs = region(B, J, {"pelvis": None, **{b: None for b in sides("thigh")}, **{b: (-1, .8) for b in sides("calf")}})
        hide |= legs > .9
        top_only = region(B, J, {"pelvis": (.0, .5)})
    else:
        bsp = bottom_spec(P["bottom"])
        rb = region(B, J, bsp)
        parts.append(("pants", faces_where("helper-tights", rb > .45), .008))
        hide |= rb > .985
    # chaussures (sandales pour les femmes en pagne)
    rs = region(B, J, SHOE())
    if P["bottom"] == "pagne":
        sole = rs * (B[:, 2] < .035)
        parts.append(("shoes", faces_where("helper-tights", sole > .5), .006))
    else:
        parts.append(("shoes", faces_where("helper-tights", rs > .45), .016))
        hide |= rs > .985
    # corps (faces visibles seulement)
    body_faces = [f for f in GROUPS["body"] if not all(hide[v] for v in f[0])]
    body = make_mesh("body_" + P["id"], B, body_faces, mats["skin"])
    # protéger le visage pendant la décimation
    hg = body.vertex_groups["head"]
    # yeux
    eyes = []
    for s in ("l", "r"):
        ob = make_mesh("eye_" + s, B, GROUPS["helper-%s-eye" % s], mats["eye"])
        c = EYEC[s]
        co = vcos(ob)
        d = co - c
        r = np.linalg.norm(d[:, [0, 2]], axis=1).max()
        uv = ob.data.uv_layers[0].data
        for poly in ob.data.polygons:
            for li in poly.loop_indices:
                v = ob.data.loops[li].vertex_index
                uv[li].uv = (.5 + d[v, 0] / (2.2 * r), .5 + d[v, 2] / (2.2 * r))
        eyes.append(ob)
    # vêtements
    objs = []
    for name, faces, off in parts:
        if not faces:
            continue
        ob = make_mesh(name + "_" + P["id"], B, faces, mats[name])
        inflate(ob, off)
        if name == "wax":
            c = vcos(ob)
            ang = np.arctan2(c[:, 0], -c[:, 1])
            uvs = np.stack([ang / (2 * math.pi) * 3, c[:, 2] * 2.2], 1)
            uv = ob.data.uv_layers[0].data
            for poly in ob.data.polygons:
                for li in poly.loop_indices:
                    uv[li].uv = uvs[ob.data.loops[li].vertex_index]
        objs.append(ob)
    # cheveux / foulard (calotte du crâne dupliquée et gonflée)
    if P["hair"] != "bald":
        E = (EYEC["l"] + EYEC["r"]) / 2
        hd = WM[:, BI["head"]] + WM[:, BI["neck_01"]] * (P["hair"] != "short")
        rel = B - E
        y = rel[:, 1]  # <0 = devant
        if P["hair"] == "short":
            line = np.interp(y, [-.12, -.07, 0, .05, .12], [.055, .05, .035, -.02, -.07])
        else:
            line = np.interp(y, [-.12, -.07, 0, .05, .12], [.04, .035, .01, -.03, -.085])
        z = rel[:, 2]
        if P["hair"] == "short":
            ear = smooth(.05, .065, np.abs(rel[:, 0])) * smooth(.025, .045, y) * smooth(.135, .115, y) * smooth(.05, .03, z)
        else:
            ear = np.zeros(NV)
        # masque lisse : la limite des cheveux passe sous la peau au lieu d'un bord en escalier
        HM = smooth(line - .012, line + .012, z) * (1 - ear)
        ok = (hd > .5) & (z > line - .03)
        hf = faces_where("body", ok)
        ob = make_mesh("hair_" + P["id"], B, hf, mats["wax" if P["hair"] == "wrap" else "hair"])
        oi = orig_index(ob)
        m = HM[oi]
        top = B[:, 2].max()
        if P["hair"] == "short":
            inflate(ob, lambda c, n: -.004 + .011 * m)
        elif P["hair"] == "puff":
            def puff(c, n):
                k = smooth(E[2] + .02, top - .01, c[:, 2])
                return -.004 + m * (.014 + .022 * k + .004 * np.sin(c[:, 0] * 300) * np.sin(c[:, 1] * 280) * np.sin(c[:, 2] * 260))
            inflate(ob, puff)
        else:  # foulard gélé, volume vers le haut et l'arrière
            def wrap(c, n):
                k = smooth(E[2] + .01, top, c[:, 2])
                back = smooth(-.02, .09, c[:, 1] - E[1])
                return -.004 + m * (.02 + .05 * k + .03 * k * back)
            inflate(ob, wrap)
            c = vcos(ob)
            ang = np.arctan2(c[:, 0], -(c[:, 1] - E[1]))
            uvs = np.stack([ang / (2 * math.pi) * 2, c[:, 2] * 3], 1)
            uv = ob.data.uv_layers[0].data
            for poly in ob.data.polygons:
                for li in poly.loop_indices:
                    uv[li].uv = uvs[ob.data.loops[li].vertex_index]
        objs.append(ob)
    return B, J, body, eyes, objs

# ---------------------------------------------------------------- armature
def build_armature(name, J):
    ad = bpy.data.armatures.new(name)
    arm = bpy.data.objects.new(name, ad)
    bpy.context.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    for o in bpy.context.view_layer.objects: o.select_set(False)
    arm.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    eb = {}
    for b in BONES:
        e = ad.edit_bones.new(b)
        e.head, e.tail = Vector(J[b][0]), Vector(J[b][1])
        e.roll = RIG[b].get("roll", 0)
        eb[b] = e
    for b in BONES:
        p = RIG[b]["parent"]
        if p:
            eb[b].parent = eb[p]
            eb[b].use_connect = False
    bpy.ops.object.mode_set(mode="OBJECT")
    for b in ad.bones:
        b["n"] = b.name
    return arm

# ---------------------------------------------------------------- animations
def rx(a): return Quaternion((1, 0, 0), math.radians(a))
def ry(a): return Quaternion((0, 1, 0), math.radians(a))
def rz(a): return Quaternion((0, 0, 1), math.radians(a))

def make_actions(arm, J):
    pb = arm.pose.bones
    R = {b.name: b.bone.matrix_local.to_quaternion() for b in pb}
    # bras le long du corps à partir de la pose A
    D0, E0 = {}, {}
    for s, sg in (("l", 1), ("r", -1)):
        h, t = J["upperarm_" + s]
        cur = Vector(t - h).normalized()
        D0[s] = cur.rotation_difference(Vector((.13 * sg, .02, -1)).normalized())
        # l'avant-bras est plié vers l'avant au repos : rotation qui le remet dans l'axe
        h2, t2 = J["lowerarm_" + s]
        E0[s] = (D0[s] @ Vector(t2 - h2).normalized()).rotation_difference(Vector((.1 * sg, -.05, -1)).normalized())
    ad = arm.animation_data_create()

    def key(f, rot, loc=None):
        for b in pb:
            q = rot.get(b.name, Quaternion())
            b.rotation_mode = "QUATERNION"
            b.rotation_quaternion = R[b.name].inverted() @ q @ R[b.name]
            b.keyframe_insert("rotation_quaternion", frame=f)
            if b.name == "pelvis":
                w = Vector(loc or (0, 0, 0))
                b.location = R[b.name].inverted() @ w
                b.keyframe_insert("location", frame=f)

    def clip(name, n, fn):
        act = bpy.data.actions.new(name)
        ad.action = act
        for f in range(n + 1):
            rot, loc = fn(2 * math.pi * f / n, f)
            key(f + 1, rot, loc)
        tr = ad.nla_tracks.new(); tr.name = name
        st = tr.strips.new(name, 1, act)
        ad.action = None
        return act

    def arms(rot, swing_l, swing_r, elbow_l, elbow_r, out=0):
        rot["upperarm_l"] = rx(-swing_l) @ ry(-out) @ D0["l"]
        rot["upperarm_r"] = rx(-swing_r) @ ry(out) @ D0["r"]
        # coude : rotation autour de l'axe X du monde une fois le bras baissé
        cl, cr = ry(-out) @ D0["l"], ry(out) @ D0["r"]
        rot["lowerarm_l"] = cl.inverted() @ rx(-elbow_l) @ E0["l"] @ cl
        rot["lowerarm_r"] = cr.inverted() @ rx(-elbow_r) @ E0["r"] @ cr

    def walk_like(hip, knee, bob, armsw, elbow, lean, ankle):
        def fn(ph, f):
            rot = {}
            for s, o in (("l", 0), ("r", math.pi)):
                p = ph + o
                rot["thigh_" + s] = rx(-hip * math.sin(p))
                k = knee[0] + knee[1] * max(0, math.cos(p + .35)) ** 2
                rot["calf_" + s] = rx(k)
                rot["foot_" + s] = rx(-ankle * math.cos(p + .9) - k * .25)
            arms(rot, -armsw * math.sin(ph), armsw * math.sin(ph), elbow + 6 * math.sin(ph), elbow - 6 * math.sin(ph), 3)
            rot["pelvis"] = rz(5 * math.sin(ph)) @ rx(-lean * .3)
            rot["spine_01"] = rx(-lean * .4)
            rot["spine_02"] = rz(-6 * math.sin(ph)) @ rx(-lean * .3)
            rot["spine_03"] = rz(-3 * math.sin(ph))
            rot["head"] = rz(3 * math.sin(ph)) @ rx(lean * .6)
            return rot, (0, 0, bob * math.cos(2 * ph) - bob)
        return fn

    clip("walk", 32, walk_like(24, (6, 55), .016, 17, 14, 4, 12))
    clip("run", 20, walk_like(40, (18, 85), .035, 34, 80, 14, 20))

    def idle(ph, f):
        rot = {}
        b = math.sin(ph)
        arms(rot, 2 + b, 2 - b, 10, 9, 2)
        rot["spine_02"] = rx(-1.4 * b)
        rot["spine_03"] = rx(-.8 * b)
        rot["head"] = rz(4 * math.sin(ph * .5 + 1)) @ rx(1.2 * b)
        rot["pelvis"] = ry(1.5 * math.sin(ph * .5))
        rot["thigh_l"] = rx(-2); rot["thigh_r"] = rx(3); rot["calf_r"] = rx(4)
        return rot, (0, 0, -.004 * (1 + b))
    clip("idle", 90, idle)

    def cower(ph, f):
        rot = {}
        tr = math.sin(ph * 6) * 1.5
        for s in ("l", "r"):
            rot["thigh_" + s] = rx(-55)
            rot["calf_" + s] = rx(95)
            rot["foot_" + s] = rx(-35)
        rot["pelvis"] = rx(0)
        rot["spine_01"] = rx(-18); rot["spine_02"] = rx(-14 + tr); rot["spine_03"] = rx(-8)
        rot["head"] = rx(-20)
        rot["upperarm_l"] = rx(-120) @ ry(-25) @ D0["l"]
        rot["upperarm_r"] = rx(-120) @ ry(25) @ D0["r"]
        cl, cr = ry(-25) @ D0["l"], ry(25) @ D0["r"]
        rot["lowerarm_l"] = cl.inverted() @ rx(-120) @ E0["l"] @ cl
        rot["lowerarm_r"] = cr.inverted() @ rx(-120) @ E0["r"] @ cr
        return rot, (0, .06, -.33)
    clip("cower", 24, cower)
    for b in pb:
        b.rotation_quaternion = Quaternion(); b.location = (0, 0, 0)

# ---------------------------------------------------------------- principal
def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    wax = wax_image()
    mats = {
        "skin": material("skin", [1, 1, 1, 1], .62),
        "eye": material("eye", [1, 1, 1, 1], .15, eye_image()),
        "shirt": material("shirt", srgb("#e8e4dc"), .85),
        "pants": material("pants", srgb("#2b3346"), .85),
        "shoes": material("shoes", srgb("#1a1a1c"), .5),
        "hair": material("hair", srgb("#0d0a09"), .9),
        "wax": material("wax", [1, 1, 1, 1], .8, wax),
    }
    skin_img = None
    rigs = []
    for k, P in enumerate(VARIANTS):
        B, J, body, eyes, objs = build_variant(P, mats)
        arm = build_armature("rig_" + P["id"], J)
        if skin_img is None:
            # cuisson sur un corps complet (sans vêtements ni faces cachées)
            hidden = list(bpy.context.view_layer.objects)
            for o in hidden: o.hide_render = True
            full = make_mesh("bakebody", B, GROUPS["body"], mats["skin"])
            maps = bake_maps(full)
            bpy.data.objects.remove(full)
            for o in hidden: o.hide_render = False
            skin_img = skin_image(maps, J)
            m = mats["skin"]
            tx = m.node_tree.nodes.new("ShaderNodeTexImage"); tx.image = skin_img
            m.node_tree.links.new(tx.outputs["Color"], m.node_tree.nodes["Principled BSDF"].inputs["Base Color"])
        # teinte de peau par personnage : matériau dérivé (facteur de couleur)
        if P["tone"] != 1:
            sm = mats["skin"].copy(); sm.name = "skin"
            mix = sm.node_tree.nodes.new("ShaderNodeMix"); mix.data_type = "RGBA"; mix.blend_type = "MULTIPLY"
            # l'exportateur glTF traduit MULTIPLY(texture, couleur) en baseColorFactor
            mix.inputs[0].default_value = 1
            tx = [n for n in sm.node_tree.nodes if n.type == "TEX_IMAGE"][0]
            sm.node_tree.links.new(tx.outputs["Color"], mix.inputs[6])
            mix.inputs[7].default_value = (P["tone"],) * 3 + (1,)
            sm.node_tree.links.new(mix.outputs[2], sm.node_tree.nodes["Principled BSDF"].inputs["Base Color"])
            body.data.materials[0] = sm
        decimate(body, .3)
        for e in eyes:
            m = e.modifiers.new("s", "SUBSURF"); m.levels = 1
            bpy.context.view_layer.objects.active = e; bpy.ops.object.modifier_apply(modifier="s")
        for o in objs:
            decimate(o, .35)
        allo = [body] + eyes + objs
        for o in allo:
            if "oi" in o.data.attributes:
                o.data.attributes.remove(o.data.attributes["oi"])
        for o in bpy.context.view_layer.objects: o.select_set(False)
        for o in allo: o.select_set(True)
        bpy.context.view_layer.objects.active = body
        bpy.ops.object.join()
        for p in body.data.polygons: p.use_smooth = True
        body.name = "human_" + P["id"]
        body.parent = arm
        md = body.modifiers.new("Armature", "ARMATURE"); md.object = arm
        arm.location.x = (k - (len(VARIANTS) - 1) / 2) * .8
        arm["variant"] = P["id"]
        rigs.append((arm, body, J))
        print(P["id"], "triangles", tris(body))
    make_actions(rigs[0][0], rigs[0][2])
    os.makedirs(os.path.dirname(os.path.abspath(OUT)), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=OUT, export_format="GLB", export_yup=True, export_apply=False,
        export_skins=True, export_animations=True, export_animation_mode="NLA_TRACKS",
        export_extras=True, export_image_format="JPEG", export_jpeg_quality=86,
        export_def_bones=False, export_optimize_animation_size=True,
        export_force_sampling=True)
    if RENDER:
        render(rigs)

def render(rigs):
    os.makedirs(RENDER, exist_ok=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"; sc.cycles.samples = 64; sc.cycles.device = "CPU"
    sc.render.resolution_x, sc.render.resolution_y = 1600, 760
    sc.render.film_transparent = False
    sc.view_settings.view_transform = "AgX"
    w = bpy.data.worlds.new("w"); sc.world = w; w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[0].default_value = (.55, .58, .62, 1)
    w.node_tree.nodes["Background"].inputs[1].default_value = .6
    bpy.ops.mesh.primitive_plane_add(size=30)
    fl = bpy.context.object
    fl.data.materials.append(material("floor", srgb("#8f8a82"), .9))
    sun = bpy.data.lights.new("sun", "SUN"); sun.energy = 3.5; sun.angle = .08
    so = bpy.data.objects.new("sun", sun); bpy.context.collection.objects.link(so)
    so.rotation_euler = (math.radians(50), math.radians(10), math.radians(-35))
    cam = bpy.data.cameras.new("cam"); cam.lens = 50
    co = bpy.data.objects.new("cam", cam); bpy.context.collection.objects.link(co)
    co.location = (0, -7.2, 1.25); co.rotation_euler = (math.radians(88), 0, 0)
    sc.camera = co
    walk = bpy.data.actions.get(os.environ.get("ZB_CLIP", "walk"))
    for arm, body, J in rigs:
        if arm.animation_data:
            for t in arm.animation_data.nla_tracks:
                t.mute = True
        if os.environ.get("ZB_REST"):
            break
        arm.animation_data_create().action = walk
        try:
            arm.animation_data.action_slot = walk.slots[0]
        except Exception:
            pass
    for i, f in enumerate((1, 9)):
        sc.frame_set(f)
        if os.environ.get("ZB_DEBUG"):
            pb = rigs[0][0].pose.bones
            for n in ("upperarm_l", "lowerarm_l"):
                bb = rigs[0][0].data.bones[n]
                print("REST", n, tuple(round(x, 2) for x in (bb.tail_local - bb.head_local).normalized()), [round(x,2) for x in bb.matrix_local.to_quaternion()])
                print("ROT", n, [round(x, 3) for x in pb[n].rotation_quaternion])
            for n in ("upperarm_l", "lowerarm_l", "thigh_l", "calf_l"):
                print("DBG", f, n, tuple(round(x, 2) for x in (pb[n].tail - pb[n].head).normalized()))
            continue
        sc.render.filepath = os.path.join(RENDER, "humans_walk_%d.png" % i)
        bpy.ops.render.render(write_still=True)
    for arm, body, J in rigs:
        if arm.animation_data: arm.animation_data.action = None
        for b in arm.pose.bones:
            b.rotation_quaternion = Quaternion(); b.location = (0, 0, 0)
    # gros plan visage
    hz = rigs[0][2]["head"][0][2] + .07
    co.location = (rigs[0][0].location.x, -1.1, hz); cam.lens = 85
    co.rotation_euler = (math.radians(90), 0, 0)
    sc.render.resolution_x, sc.render.resolution_y = 900, 900
    sc.render.filepath = os.path.join(RENDER, "humans_face.png")
    bpy.ops.render.render(write_still=True)

main()

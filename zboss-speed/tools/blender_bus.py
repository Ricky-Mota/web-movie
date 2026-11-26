"""2 Life : bus urbain de Kinshasa modélisé dans Blender (bpy), exporté en .glb pour le jeu.

Modèle original (aucune marque réelle) : midibus à plancher bas, 7,2 m (mêmes cotes que la simulation),
caisse arrondie, grandes vitres teintées avec montants, pare-brise bombé, girouette lumineuse,
climatiseur de toit, portes vitrées côté trottoir, sièges visibles à travers les vitres,
roues détaillées, rétroviseurs « oreilles de lapin », optiques LED, livrée jaune et bleu de la ville.

Usage : python blender_bus.py <dossier_sortie> [--render] [--samples N]
Repère Blender : x vers l'avant, z vers le haut ; le côté des portes est y < 0 (il devient +z dans three.js).
"""
import bpy, bmesh, math, os, sys
from mathutils import Vector
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import blender_cars as BC   # outils communs (matériaux, cubes biseautés, cylindres, pneus, export, studio)

OUT = BC.OUT
L, W, H = 7.2, 2.3, 2.85          # longueur, largeur, hauteur du toit
FLOOR = .42                        # plancher bas
WB_F, WB_R, WR = 1.85, -2.1, .46  # essieux avant / arrière, rayon de roue
DOORS = [(2.9, .95), (-.75, 1.2)]   # (centre x, largeur) des portes côté trottoir

def build():
    M = dict(
        paint=BC.mat("paint", (1.0, .5, .0), metal=.1, rough=.38, coat=.5),
        blue=BC.mat("blue", (.02, .12, .45), metal=.2, rough=.35, coat=.6),
        white=BC.mat("white", (.92, .93, .95), metal=.1, rough=.4, coat=.4),
        black=BC.mat("trim", (.02, .02, .025), rough=.55),
        glass=BC.mat("glass", (.04, .07, .09), metal=.6, rough=.05, alpha=.55),
        chrome=BC.mat("chrome", (.85, .86, .88), metal=1., rough=.12),
        rim=BC.mat("rim", (.72, .74, .78), metal=.95, rough=.2),
        tire=BC.mat("tire", (.025, .025, .028), rough=.85),
        lightF=BC.mat("lightF", (1, .97, .9), emit=(1, .95, .85)),
        lightR=BC.mat("lightR", (.6, .02, .01), emit=(1, .05, .02)),
        amber=BC.mat("amber", (1, .45, 0), emit=(1, .55, .05)),
        sign=BC.mat("sign", (.02, .02, .02), emit=(1, .62, .08)),
        seat=BC.mat("seat", (.05, .22, .62), rough=.8),
        floor=BC.mat("floorin", (.25, .26, .28), rough=.9),
        grille=BC.mat("grille", (.06, .06, .07), metal=.5, rough=.4),
    )
    parts = []
    C = lambda *a, **k: parts.append(BC.cube(*a, **k)) or parts[-1]
    # caisse : boîte très arrondie, jupe bleue en bas, toit blanc
    body = C("body", (L, W, H - FLOOR - .05), (0, 0, FLOOR + (H - FLOOR) / 2 - .02), M["paint"], bevel=.16, seg=4)
    # caisse creuse, percée des vitres, des portes, du pare-brise et de la lunette : on voit l'intérieur
    zw0, zw1, x0, x1 = 1.25, 2.45, -L / 2 + .45, L / 2 - 1.3
    cutters = [BC.cube("k", (L - .14, W - .14, H - FLOOR - .2), (0, 0, FLOOR + (H - FLOOR) / 2), M["black"])]
    for side in (-1, 1): cutters.append(BC.cube("k", (x1 - x0, .4, zw1 - zw0), ((x0 + x1) / 2, side * W / 2, (zw0 + zw1) / 2), M["black"]))
    for x, w in DOORS: cutters.append(BC.cube("k", (w, .4, 2.05), (x, -W / 2, FLOOR + 1.08), M["black"]))
    cutters.append(BC.cube("k", (.5, W - .3, 1.5), (L / 2, 0, 1.78), M["black"]))
    cutters.append(BC.cube("k", (.5, W - .6, .75), (-L / 2, 0, 2.05), M["black"]))
    for c in cutters:
        m_ = body.modifiers.new("cut", "BOOLEAN"); m_.operation = "DIFFERENCE"; m_.object = c
        try: m_.solver = "EXACT"
        except Exception: pass
    BC.apply_mods(body)
    for c in cutters: bpy.data.objects.remove(c, do_unlink=True)
    C("skirt", (L + .02, W + .02, .42), (0, 0, FLOOR + .16), M["blue"], bevel=.1, seg=3)
    C("roof", (L - .25, W - .1, .08), (0, 0, H - .02), M["white"], bevel=.04, seg=2)
    C("stripe", (L + .03, W + .03, .09), (0, 0, FLOOR + .55), M["white"], bevel=.04, seg=2)
    # climatiseur de toit
    C("ac", (2.1, 1.5, .26), (-.4, 0, H + .12), M["white"], bevel=.1, seg=3)
    for k in (-1, 1): C("acgrille", (1.6, .02, .14), (-.4, k * .76, H + .12), M["grille"])
    # vitres latérales : bandeau vitré + montants noirs (côté portes : on laisse la place des portes)
    for side in (-1, 1):
        y = side * (W / 2 + .005)
        C("winband", (x1 - x0, .04, zw1 - zw0), ((x0 + x1) / 2, y, (zw0 + zw1) / 2), M["glass"], bevel=.03)
        n = 6
        for i in range(n + 1):
            x = x0 + i * (x1 - x0) / n
            C("pillar", (.09, .05, zw1 - zw0 + .04), (x, y + side * .005, (zw0 + zw1) / 2), M["black"])
        C("winframe", (x1 - x0 + .1, .05, .05), ((x0 + x1) / 2, y + side * .006, zw1 + .02), M["black"])
        C("winframe", (x1 - x0 + .1, .05, .05), ((x0 + x1) / 2, y + side * .006, zw0 - .02), M["black"])
    # côté trottoir (y < 0) : encadrements des portes (les battants vitrés sont animés dans le jeu)
    for x, w in DOORS:
        for dx_ in (-w / 2 - .03, w / 2 + .03): C("doorpost", (.07, .06, 2.12), (x + dx_, -W / 2 - .01, FLOOR + 1.08), M["black"])
        C("doorhead", (w + .12, .06, .07), (x, -W / 2 - .01, FLOOR + 2.12), M["black"])
        if x != DOORS[0][0]:   # porte du milieu (la porte avant est animée dans le jeu)
            for k in (-1, 1): C("doorleaf", (w / 2 - .03, .04, 2.0), (x + k * w / 4, -W / 2 + .02, FLOOR + 1.06), M["glass"])
            C("doorseal", (.03, .05, 2.0), (x, -W / 2 + .01, FLOOR + 1.06), M["black"])
        C("step", (w, .3, .06), (x, -W / 2 + .1, FLOOR - .02), M["chrome"])
    # pare-brise bombé (légèrement incliné) + girouette lumineuse au-dessus
    ws = BC.cube("windshield", (.06, W - .22, 1.55), (L / 2 + .01, 0, 1.75), M["glass"], bevel=.05, rot=(0, math.radians(-6), 0)); parts.append(ws)
    C("wsframe", (.07, W - .1, .08), (L / 2 + .03, 0, 2.55), M["black"])
    C("destsign", (.05, W - .5, .26), (L / 2 + .03, 0, 2.7), M["sign"])
    C("destframe", (.06, W - .4, .34), (L / 2 + .015, 0, 2.7), M["black"])
    # essuie-glaces
    for k in (-1, 1): C("wiper", (.03, .9, .03), (L / 2 + .08, k * .45, 1.12), M["black"], rot=(math.radians(20 * k), 0, 0))
    # face avant : calandre, phares LED, clignotants, pare-chocs
    C("grille", (.04, 1.1, .32), (L / 2 + .02, 0, .82), M["grille"], bevel=.02)
    for k in (-1, 1):
        C("headlight", (.05, .42, .16), (L / 2 + .02, k * .82, .82), M["lightF"], bevel=.03)
        C("drl", (.05, .38, .03), (L / 2 + .025, k * .82, .95), M["lightF"])
        C("indicator", (.05, .12, .1), (L / 2 + .02, k * 1.05, .66), M["amber"], bevel=.02)
    C("bumperF", (.2, W + .04, .28), (L / 2 + .02, 0, .48), M["black"], bevel=.06, seg=3)
    C("plateF", (.03, .52, .12), (L / 2 + .13, 0, .48), M["white"])
    # rétroviseurs « oreilles de lapin »
    for k in (-1, 1):
        arm = BC.cyl("mirrorarm", .025, .75, (L / 2 + .25, k * (W / 2 + .12), 2.35), M["black"], verts=10, axis="Y"); arm.rotation_euler = (math.pi / 2, 0, math.radians(-40 * k)); parts.append(arm)
        C("mirror", (.06, .2, .4), (L / 2 + .42, k * (W / 2 + .3), 2.12), M["black"], bevel=.04)
        C("mirrorglass", (.01, .17, .36), (L / 2 + .388, k * (W / 2 + .3), 2.12), M["chrome"])
    # arrière : lunette, compartiment moteur, feux
    C("rearwin", (.04, W - .5, .8), (-L / 2 - .005, 0, 2.05), M["glass"], bevel=.03)
    C("enginegrille", (.04, W - .6, .5), (-L / 2 - .005, 0, 1.1), M["grille"])
    for k in (-1, 1):
        C("taillight", (.05, .16, .55), (-L / 2 - .01, k * .98, 1.15), M["lightR"], bevel=.03)
        C("rearamber", (.05, .14, .12), (-L / 2 - .01, k * .98, .78), M["amber"], bevel=.02)
    C("bumperR", (.2, W + .04, .3), (-L / 2 - .02, 0, .48), M["black"], bevel=.06, seg=3)
    C("brake3", (.03, .6, .05), (-L / 2 - .01, 0, 2.6), M["lightR"])
    # feux de gabarit sur le toit
    for x in (L / 2 - .15, -L / 2 + .15):
        for k in (-1, 1): C("marker", (.06, .06, .04), (x, k * (W / 2 - .15), H + .01), M["amber"] if x > 0 else M["lightR"])
    # intérieur visible : plancher, sièges bleus, barres de maintien
    C("floorin", (L - .4, W - .2, .04), (0, 0, FLOOR + .02), M["floor"])
    for i in range(6):
        x = 1.6 - i * .78
        if abs(x - DOORS[1][0]) < .7: continue
        for k in (-1, 1):
            if k < 0 and abs(x - DOORS[0][0]) < .8: continue
            C("seat", (.42, .45, .1), (x, k * .72, FLOOR + .45), M["seat"], bevel=.03)
            C("seatback", (.08, .45, .55), (x - .2, k * .72, FLOOR + .75), M["seat"], bevel=.03)
    for x in (2.0, .4, -1.2):
        parts.append(BC.cyl("pole", .02, H - FLOOR - .2, (x, -.32, FLOOR + (H - FLOOR) / 2), M["chrome"], verts=10, axis="Z"))
    C("driverseat", (.48, .48, .5), (L / 2 - 1.05, .5, FLOOR + .55), M["black"], bevel=.05)
    wheelobj = BC.cyl("steering", .2, .04, (L / 2 - .6, .5, 1.25), M["black"], verts=20, axis="X"); wheelobj.rotation_euler = (0, math.radians(60), 0); parts.append(wheelobj)
    # passages de roue découpés dans la caisse (booléen), fond noir, roues détaillées
    wheels = []
    cut = []
    for x in (WB_F, WB_R):
        cut.append(BC.cyl("cut", WR + .1, W + .4, (x, 0, WR), M["black"], verts=40, axis="Y"))
    for o in [p for p in parts if p.name.split(".")[0] in ("body", "skirt", "stripe", "winband", "pillar", "winframe", "floorin")]:
        for c in cut:
            b = o.modifiers.new("arch", "BOOLEAN"); b.operation = "DIFFERENCE"; b.object = c
            try: b.solver = "EXACT"
            except Exception: pass
        BC.apply_mods(o)
    for c in cut: bpy.data.objects.remove(c, do_unlink=True)
    for x in (WB_F, WB_R):
        for k in (-1, 1):
            parts.append(BC.cyl("well", WR + .09, .02, (x, k * (W / 2 - .42), WR), M["black"], verts=32, axis="Y"))
            t = BC.tube("tire", WR - .1, .11, .3, M["tire"], seg=36, vseg=10, flat=.4); t.location = (x, k * (W / 2 - .17), WR); wheels.append(t)
            r = BC.cyl("rim", WR - .17, .28, (x, k * (W / 2 - .16), WR), M["rim"], verts=24, axis="Y", bevel=.02); wheels.append(r)
            for s in range(8):
                a = s * math.pi / 4
                sp = BC.cube("lug", (.05, .04, .05), (x + math.cos(a) * .12, k * (W / 2 - .01), WR + math.sin(a) * .12), M["chrome"]); wheels.append(sp)
            hub = BC.cyl("hub", .07, .06, (x, k * (W / 2 - .01), WR), M["chrome"], verts=16, axis="Y"); wheels.append(hub)
    for o in parts: BC.smooth(o, 35)
    for o in wheels: BC.smooth(o, 40)
    # un seul objet par matériau : peu d'appels de dessin dans le navigateur
    groups = {}
    for o in parts + wheels: groups.setdefault(o.data.materials[0].name, []).append(o)
    return [BC.join(objs, name) if len(objs) > 1 else objs[0] for name, objs in groups.items()]

if __name__ == "__main__":
    BC.clear()
    build()
    p = os.path.join(OUT, "bus.glb")
    BC.export_glb(p)
    print("ok bus", os.path.getsize(p) // 1024, "Ko", flush=True)
    if BC.RENDER:
        P = dict(L=L, H=H)
        for v in ("34", "side"): BC.studio(v, os.path.join(OUT, f"bus-{v}.png"), P)

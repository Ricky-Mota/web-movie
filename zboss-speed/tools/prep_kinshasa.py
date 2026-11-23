"""Prépare la carte réelle de Kinshasa (Gombe et alentours) pour Zboss-speed.

Source : Overture Maps (transportation, buildings, base/water), données dérivées
d'OpenStreetMap, licence ODbL : « © les contributeurs d'OpenStreetMap ».

Entrées : GeoJSON extraits par zone (kin_roads.json, kin_buildings.json, kin_water.json).
Sortie : assets/kinshasa.js (window.ZBOSS_MAP), coordonnées en px de simulation (1 px = 0,1 m),
x vers l'est, y vers le sud (le fleuve Congo est en haut).

Usage : python prep_kinshasa.py <dossier_geojson> <sortie.js>
"""
import json, math, random, sys, collections
from shapely.geometry import shape, box, LineString, Polygon, MultiPolygon, Point
from shapely.ops import unary_union
from shapely import affinity

SRC, OUT = sys.argv[1], sys.argv[2]
W_, S_, E_, N_ = 15.2756, -4.3270, 15.3066, -4.2960
LATC = (S_ + N_) / 2
KX = 111320 * math.cos(math.radians(LATC)) * 10  # px par degré de longitude
KY = 110574 * 10
WPX, HPX = round((E_ - W_) * KX), round((N_ - S_) * KY)
random.seed(243)

def proj(geom):
    return affinity.affine_transform(geom, [KX, 0, 0, -KY, -W_ * KX, N_ * KY])

BBOX = box(0, 0, WPX, HPX)
# largeur des routes (px) : élargies par rapport au réel pour la conduite à haute vitesse
WIDTH = {"motorway": 200, "trunk": 190, "primary": 170, "secondary": 150, "tertiary": 130,
         "residential": 110, "unclassified": 110, "living_street": 100}
CLS = list(WIDTH)

def load(name):
    return json.load(open(f"{SRC}/{name}"))["features"]

# ------------------------------------------------------------------ Routes
roads, names = [], []
name_idx = {}
for f in load("kin_roads.json"):
    p = f["properties"]
    if p.get("subtype") != "road" or p.get("class") not in WIDTH: continue
    g = proj(shape(f["geometry"])).intersection(BBOX)
    if g.is_empty: continue
    parts = [g] if g.geom_type == "LineString" else list(getattr(g, "geoms", []))
    nm = (p.get("names") or {}).get("primary") if isinstance(p.get("names"), dict) else None
    for part in parts:
        if part.geom_type != "LineString" or part.length < 30: continue
        part = part.simplify(12)
        pts = [(round(x), round(y)) for x, y in part.coords]
        if len(pts) >= 2: roads.append({"c": p["class"], "w": WIDTH[p["class"]], "n": nm, "p": pts})

# garder la plus grande composante connexe (pas d'îlots inaccessibles)
adj = collections.defaultdict(set)
for i, r in enumerate(roads):
    for a, b in zip(r["p"], r["p"][1:]): adj[a].add(b); adj[b].add(a)
seen, best = set(), set()
for start in adj:
    if start in seen: continue
    comp, st = set([start]), [start]
    while st:
        u = st.pop()
        for v in adj[u]:
            if v not in comp: comp.add(v); st.append(v)
    seen |= comp
    if len(comp) > len(best): best = comp
roads = [r for r in roads if r["p"][0] in best]
for r in roads:
    if r["n"] and r["n"] not in name_idx: name_idx[r["n"]] = len(names); names.append(r["n"])
print("routes", len(roads), "noeuds", len(best))

road_buf = unary_union([LineString(r["p"]).buffer(r["w"] / 2 + 25, cap_style=1) for r in roads])

# ------------------------------------------------------------------ Eau (fleuve)
water = []
for f in load("kin_water.json"):
    p = f["properties"]
    if p.get("subtype") in ("human_made",) or f["geometry"]["type"] not in ("Polygon", "MultiPolygon"): continue
    g = proj(shape(f["geometry"])).buffer(0).intersection(BBOX).difference(road_buf)
    if g.is_empty: continue
    for poly in (g.geoms if hasattr(g, "geoms") else [g]):
        if poly.geom_type != "Polygon" or poly.area < 400 * 400: continue
        poly = poly.simplify(20)
        water.append([[[round(x), round(y)] for x, y in poly.exterior.coords]] + [[[round(x), round(y)] for x, y in r.coords] for r in poly.interiors])
print("eau", len(water))
water_u = unary_union([Polygon(w[0], w[1:]) for w in water]) if water else Polygon()

# ------------------------------------------------------------------ Bâtiments
blvd = unary_union([LineString(r["p"]) for r in roads if r["n"] == "Boulevard du 30 Juin"])
blds = []
for f in load("kin_buildings.json"):
    p = f["properties"]
    g = proj(shape(f["geometry"])).buffer(0)
    g = g.intersection(BBOX).difference(road_buf).difference(water_u)
    if g.is_empty: continue
    polys = [g] if g.geom_type == "Polygon" else [x for x in getattr(g, "geoms", []) if x.geom_type == "Polygon"]
    for poly in polys:
        if poly.area < 3500: continue  # < 35 m²
        poly = poly.simplify(8)
        if poly.is_empty or poly.geom_type != "Polygon": continue
        area_m2 = poly.area / 100
        h = p.get("height") or (p.get("num_floors") and p["num_floors"] * 3.2)
        if not h:
            d = blvd.distance(poly.centroid) / 10 if not blvd.is_empty else 9999  # mètres
            if area_m2 > 900 and d < 450: h = random.uniform(28, 95)
            elif area_m2 > 600: h = random.uniform(12, 36)
            elif area_m2 > 250: h = random.uniform(6, 16)
            else: h = random.uniform(3.5, 8)
        pts = [round(c) for xy in list(poly.exterior.coords)[:-1] for c in xy]
        if len(pts) >= 6: blds.append([round(h * 10)] + pts)
print("bâtiments", len(blds))

# ------------------------------------------------------------------ Départ : boulevard du 30 Juin, vers le centre
cx, cy = WPX / 2, HPX / 2
cand = [(r, i) for r in roads if r["n"] == "Boulevard du 30 Juin" for i in range(len(r["p"]) - 1)]
if not cand: cand = [(r, i) for r in roads if r["c"] == "primary" for i in range(len(r["p"]) - 1)]
r, i = min(cand, key=lambda t: math.hypot(t[0]["p"][t[1]][0] - cx, t[0]["p"][t[1]][1] - cy))
(ax, ay), (bx, by) = r["p"][i], r["p"][i + 1]
start = {"x": round((ax + bx) / 2), "y": round((ay + by) / 2), "a": round(math.atan2(by - ay, bx - ax), 3)}

out = {
    "w": WPX, "h": HPX, "bbox": [W_, S_, E_, N_],
    "attribution": "© les contributeurs d'OpenStreetMap (ODbL), via Overture Maps",
    "cls": CLS, "names": names,
    "roads": [[CLS.index(r["c"]), r["w"], name_idx.get(r["n"], -1)] + [c for xy in r["p"] for c in xy] for r in roads],
    "buildings": blds, "water": water, "start": start,
}
js = "// Carte de Kinshasa (Gombe) générée par tools/prep_kinshasa.py\n// " + out["attribution"] + "\nwindow.ZBOSS_MAP=" + json.dumps(out, separators=(",", ":"), ensure_ascii=False) + ";\n"
open(OUT, "w").write(js)
print("taille", len(js) // 1024, "Ko", "monde", WPX, "x", HPX, "départ", start)

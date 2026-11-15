# Voitures 3D (Hyper3D Rodin) pour la démo

Déposez ici les modèles 3D des voitures, au format **GLB**, avec ces noms exacts :

| Fichier | Voiture | Description à coller dans Hyper3D (texte vers 3D) |
| --- | --- | --- |
| `ketch.glb` | Ketch | Compact yellow taxi sedan from Kinshasa, rounded 1990s shape, roof taxi sign, blue side stripe, chrome bumpers, photorealistic, realistic proportions, PBR materials, game-ready |
| `zigzag.glb` | Zigzag R | Modern compact sports hatchback, blue with purple accents, big rear wing, aggressive diffuser, photorealistic, realistic proportions, PBR materials, game-ready |
| `mbote.glb` | Mbote E | Sleek white electric fastback sedan, full-width LED light bar, no exhaust, smooth aerodynamic body, photorealistic, realistic proportions, PBR materials, game-ready |
| `blinde.glb` | Blindé X | Muscular black sport SUV, wide fenders, orange accents, roof rails, off-road tyres, photorealistic, realistic proportions, PBR materials, game-ready |
| `kingt.glb` | Kin GT | Elegant green grand tourer coupe, long hood, round tail lights, quad exhaust, photorealistic, realistic proportions, PBR materials, game-ready |
| `fleuve.glb` | Fleuve V8 | Orange American-style muscle car with black racing stripes, wide rear tyres, twin exhaust, photorealistic, realistic proportions, PBR materials, game-ready |
| `turbo.glb` | Turbo GT | Red mid-engine supercar, low and wide, cyan underglow, large rear wing, photorealistic, realistic proportions, PBR materials, game-ready |
| `leopard.glb` | Léopard | Yellow hypercar with subtle leopard-spot pattern, X-shaped tail lights, central exhaust, carbon diffuser, photorealistic, realistic proportions, PBR materials, game-ready |

### Le trafic (véhicules que l'on double)

| Fichier | Véhicule | Description à coller dans Hyper3D (texte vers 3D) |
| --- | --- | --- |
| `trafic-voiture.glb` | Voiture ordinaire | Ordinary 2000s family hatchback, silver grey, slightly worn, everyday city car, photorealistic, realistic proportions, PBR materials, game-ready |
| `trafic-bus.glb` | Bus urbain | City bus, white and blue livery with yellow stripe, large rear window, rear destination sign, photorealistic, realistic proportions, PBR materials, game-ready |
| `trafic-camion.glb` | Camion | Old cargo truck with cream box body, colourful stripe, mud flaps, African city delivery truck, photorealistic, realistic proportions, PBR materials, game-ready |
| `trafic-fula.glb` | Fula-fula | Old converted truck used as a crowded bus in Kinshasa, blue lower body, yellow upper body, open rear with passengers, luggage piled on the roof, photorealistic, realistic proportions, PBR materials, game-ready |
| `trafic-moto.glb` | Moto-taxi | Small 125cc motorcycle taxi with rider wearing a yellow helmet and colourful shirt, photorealistic, realistic proportions, PBR materials, game-ready |
| `trafic-police.glb` | Police | White police patrol sedan with dark blue side band, roof light bar, generic "POLICE" text, no real force logos, photorealistic, realistic proportions, PBR materials, game-ready |

Les taxis du trafic reprennent automatiquement le modèle `ketch.glb`. Les gyrophares de la police continuent de clignoter par-dessus le modèle.

Voitures réalistes mais sans marque : pas de logo, de calandre ni de nom de constructeur réels (les marques exigent une licence payante pour un jeu commercial). Dans Hyper3D, choisissez la meilleure qualité proposée.

## Mettre les voitures dans le jeu

```bash
cd g-challenge-landing/scripts/sprites
npm install
node sprites-voitures.cjs
cd ../..
python3 scripts/assembler.py
```

Le script photographie chaque modèle de l'arrière, sous 5 angles (pour les virages), et écrit les images dans `public/voitures/` avec `liste.json`. La démo les utilise automatiquement (garage, course, rivaux) ; les voitures sans modèle restent dessinées comme avant.

- Une voiture apparaît de face ou de côté : réglez sa `rotation` dans `reglages.json` (90, 180 ou 270), puis relancez le script.
- Les peintures du garage ne changent pas la couleur d'une voiture 3D : elle garde les couleurs du modèle.
- Les mêmes fichiers GLB s'importent dans Unreal Engine (glisser-déposer dans le Content Browser) et dans Blender.

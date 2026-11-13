# Fiches MetaHuman — Where is Zando?

À utiliser dans **MetaHuman Creator** (intégré à Unreal Engine 5.6+, menu *Window › MetaHuman Creator*).
Référence visuelle : la fiche Deevid (`references/deevid_personnages.png`) et les fiches Blender (`../rendu/references/`).
Règle d'or du projet : **une seule version de chaque personnage**, jamais modifiée d'un plan à l'autre.

Les couleurs sont données en hexadécimal (à coller dans le sélecteur de couleur d'Unreal).

---

## 1. Mr. Chen — le visiteur

| Réglage MetaHuman | Valeur |
|---|---|
| Point de départ (preset) | un visage d'homme est-asiatique d'environ 40 ans |
| Corps | taille moyenne (≈ 1,72 m), corpulence normale, épaules étroites |
| Visage | ovale, pommettes discrètes, mâchoire fine, léger sourire au repos |
| Peau | claire, sous-ton chaud — `#E2B994` ; rugosité moyenne, pas de rides marquées |
| Yeux | bruns foncés `#2B1A10`, paupières légèrement tombantes (air un peu perdu) |
| Sourcils | noirs, droits, assez fournis |
| Cheveux | noirs `#111111`, courts, **volume sur le dessus, raie sur le côté gauche**, tempes courtes |
| Barbe | aucune, rasé de près |
| Lunettes | **fines lunettes rectangulaires**, monture noire mate (asset à ajouter : MetaHuman n'en fournit pas) |
| Haut | chemise **bleu clair `#9CC3EA`** à manches courtes, col classique, boutons blancs, **rentrée dans le pantalon** |
| Ceinture | cuir marron `#4A2612`, boucle dorée |
| Bas | pantalon chino **beige `#D2B98A`** |
| Chaussures | derbies **marron `#5A3218`** |
| Accessoires | petit sac à dos **gris `#6B6E72`** à bretelles noires ; valise à roulettes **gris foncé `#2A2B2F`** ; smartphone noir |
| Attitude | poli, un peu perdu, sourit facilement ; incline la tête pour saluer |
| Voix | ElevenLabs « Andy Lin » (accent chinois léger, voix douce) |

## 2. Papa Fiston — l'homme assis qui se trompe

| Réglage MetaHuman | Valeur |
|---|---|
| Point de départ (preset) | un visage d'homme d'Afrique centrale d'environ 55 ans |
| Corps | taille moyenne, **corpulent, ventre rond**, épaules larges |
| Visage | **rond et jovial**, joues pleines, rides du sourire marquées, grand sourire avec dents visibles |
| Peau | brun foncé, sous-ton chaud — `#5A3522` ; un peu de brillance sur le front et le nez |
| Yeux | bruns `#2A160B`, plissés quand il rit |
| Sourcils | **gris** `#8A8782`, épais |
| Cheveux | **gris très courts** `#9A9894`, légèrement dégarnis sur le dessus |
| Barbe | **barbe courte grise** sur le menton et les joues + moustache grise `#B5B2AC` |
| Haut | **chemise en tissu wax** à manches courtes : grands **losanges orange `#C9450A` et vert `#2E5A16`**, motifs bruns `#5E2A0C` et jaunes `#F2C230` (texture wax à appliquer sur la chemise) |
| Bas | pantalon **marron `#4C2A14`** |
| Chaussures | **sandales** en cuir marron foncé `#2A170B` |
| Accessoires | **montre** au poignet gauche (bracelet sombre, cadran doré) ; **journal** plié ; **tabouret en bois** ; kiosque bleu derrière lui |
| Attitude | sûr de lui, gestes larges, **grand rire** ; reste assis toute la scène |
| Voix | ElevenLabs « RemJac » (grave, chaleureuse, accent d'Afrique de l'Ouest) |

## 3. Grace — l'étudiante qui corrige

| Réglage MetaHuman | Valeur |
|---|---|
| Point de départ (preset) | un visage de femme d'Afrique centrale d'environ 24 ans |
| Corps | taille moyenne-petite (≈ 1,65 m), **mince**, posture droite et assurée |
| Visage | **fin et souriant**, pommettes hautes, yeux en amande |
| Peau | brun moyen, sous-ton chaud — `#6E4128` ; peau lisse |
| Yeux | bruns foncés `#24130A` |
| Sourcils | noirs, bien dessinés |
| Cheveux | noirs `#140D09`, **tirés en queue de cheval haute et lisse** (pas de tresses), élastique noir |
| Maquillage | très léger, lèvres naturelles |
| Haut | chemisier **jaune `#F6C41A`** à **col en V**, **manches retroussées aux trois-quarts** |
| Bas | **jean bleu foncé `#1C2A55`**, coupe droite |
| Chaussures | **baskets blanches** `#F4F4F4` |
| Accessoires | **sac en toile beige `#CDB68A`** porté à l'épaule droite ; smartphone à coque rose `#D96680` |
| Attitude | assurée, bienveillante, gestes précis ; lève la main poliment avant de corriger |
| Voix | ElevenLabs « Gift » (claire, jeune, accent d'Afrique de l'Ouest) |

## 4. Le receveur du taxi-bus (figurant)

Homme d'environ 30 ans, peau brun foncé, cheveux ras noirs, tee-shirt blanc, pantalon sombre. Penché à la porte du
taxi-bus, il crie « Zando! Zando! » en faisant de grands gestes. Voix ElevenLabs « Michael Onoja ».

---

## Animation des MetaHumans

- **Lèvres et visage** : dans Unreal 5.5+, *MetaHuman Animator › Audio Driven Animation* crée l'animation du visage
  directement à partir de chaque fichier de `../voix/audio/` (une réplique = un fichier).
- **Corps** : nos personnages Blender sont des maquettes sans squelette ; leurs déplacements (`anime.fbx`) servent de
  guide. Pour les MetaHumans, utilisez des animations prêtes à l'emploi (marche, assis, pointer du doigt, saluer, rire)
  depuis le *Fab* ou le pack gratuit *Game Animation Sample*, placées dans le Sequencer aux temps de `export/plans.csv`.
- **Position** : attachez chaque MetaHuman à l'acteur du même nom (`CHEN`, `FISTON`, `GRACE`) importé depuis
  `anime.fbx` : il suit alors exactement les déplacements de la scène Blender.

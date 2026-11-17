"""Fabrique dist-publique/ : la version du site à publier (Netlify, Cloudflare Pages).
- par défaut, les noms des sponsors restent, avec une mention en bas de page : marques citées comme exemples
  d'emplacements publicitaires, sans partenariat officiel (à retirer quand les accords sont signés) ;
- --sans-sponsors : remplace les marques par des espaces « Votre marque ici » et « M-PESA » par « Mobile Money » ;
- le formulaire bêta annonce l'ouverture prochaine tant que la fonction d'inscription n'est pas branchée.
Usage : python3 scripts/version-publique.py [--sans-sponsors]   (depuis g-challenge-landing)"""
import re, shutil, pathlib, sys
SANS_SPONSORS = '--sans-sponsors' in sys.argv

racine = pathlib.Path(__file__).resolve().parent.parent
src, dist = racine / 'public', racine / 'dist-publique'
shutil.rmtree(dist, ignore_errors=True)
shutil.copytree(src, dist)
(dist / '_redirects').unlink(missing_ok=True)  # pas de fonction d'inscription dans cette version

page = (dist / 'index.html').read_text(encoding='utf8')
if not SANS_SPONSORS and 'aucun partenariat officiel' not in page:
    a = '<span>© 2026 G-Challenge RDC · Kinshasa</span>'
    assert page.count(a) == 1
    page = page.replace(a, a + '\n<span style="flex-basis: 100%; font-size: 12px">Les marques affichées dans le jeu (panneaux, bande en direct) sont des exemples d\'emplacements publicitaires : aucun partenariat officiel n\'est conclu à ce jour.</span>')
debut = page.index('var PUBLICITES = [')
fin = page.index('];', debut)
bloc = page[debut:fin]
neutres = [
    "{ id: 'sponsor1', nom: 'VOTRE MARQUE ICI', ligne: 'Devenez sponsor de la Course des Ketch', fond: ['#1B2A5C', '#0E1630'], texte: '#FFFFFF', accent: '#FFC814' }",
    "{ id: 'sponsor2', nom: 'ESPACE SPONSOR', ligne: 'Écran LED · visible par tous les pilotes', fond: ['#7A1F2B', '#4A121A'], texte: '#FFFFFF', accent: '#FFD23F' }",
    "{ id: 'sponsor3', nom: 'VOTRE PUB ICI', ligne: 'Bande en direct · tournois', fond: ['#0E6B3A', '#08462A'], texte: '#FFFFFF', accent: '#FFD23F' }",
]
for marque in ['vodacom', 'bralima', 'canal', 'rawbank', 'bracongo', 'folucco']:
    m = re.search(r"\{ id: '" + marque + r"'[^\n]*\},?\n", bloc)
    assert m, marque
    remplacement = (neutres[['vodacom', 'bralima', 'canal'].index(marque)] + ',\n    ') if marque in ('vodacom', 'bralima', 'canal') else ''
    bloc = bloc.replace(m.group(0), remplacement + '' if remplacement else '')
if SANS_SPONSORS:
    page = page[:debut] + bloc + page[fin:]
    page = re.sub(r'M-PESA|M-Pesa|M-pesa', 'Mobile Money', page)

# Formulaire bêta : pas encore branché sur la version publique.
a = "      tel.focus();\n      return;\n    }\n    var bouton = form.querySelector('button');"
assert page.count(a) == 1
page = page.replace(a, "      tel.focus();\n      return;\n    }\n    dire('Merci ! Les inscriptions à la bêta ouvrent très bientôt : revenez dans quelques jours.', 'ok');\n    return;\n    var bouton = form.querySelector('button');")

if SANS_SPONSORS:
    restes = re.findall(r'(?i)vodacom|bralima|coca-cola|canal\+|canalbox|rawbank|bracongo|folucco|m-pesa', page)
    assert not restes, restes
(dist / 'index.html').write_text(page, encoding='utf8')
print('dist-publique prêt :', sum(1 for _ in dist.rglob('*') if _.is_file()), 'fichiers')

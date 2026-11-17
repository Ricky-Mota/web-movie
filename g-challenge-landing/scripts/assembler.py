"""Insère src/jeu.js dans public/index.html (entre <script id="script-jeu"> et </script>).
Usage, depuis le dossier g-challenge-landing : python3 scripts/assembler.py"""
import pathlib, re
racine = pathlib.Path(__file__).resolve().parent.parent
page = racine / 'public' / 'index.html'
jeu = (racine / 'src' / 'jeu.js').read_text(encoding='utf8')
html = page.read_text(encoding='utf8')
nouveau, n = re.subn(r'(<script id="script-jeu">)(.*?)(</script>)', lambda m: m.group(1) + '\n' + jeu + m.group(3), html, flags=re.S)
if n != 1:
    raise SystemExit('Repère <script id="script-jeu"> introuvable dans public/index.html')
page.write_text(nouveau, encoding='utf8')
print('jeu.js inséré dans public/index.html')

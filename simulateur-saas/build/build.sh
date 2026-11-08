#!/usr/bin/env bash
# Reconstruit simulateur-saas.html à partir des sources, puis vérifie les leçons.
set -euo pipefail
cd "$(dirname "$0")"
python3 -I - <<'PY'
c = open('course_v1.js', encoding='utf8').read()
a = open('course_add.js', encoding='utf8').read()
assert c.count('\nreturn out;\n') == 1
open('course.js', 'w', encoding='utf8').write(c.replace('\nreturn out;\n', '\n' + a + '\nreturn out;\n'))
PY
python3 -I assemble.py
node check.js simulateur-saas.html | grep -E '^lessons|warns|main'
{ printf '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>\n'; cat simulateur-saas.html; printf '\n</body></html>\n'; } > ../index.html
echo "OK : ../index.html mis à jour"

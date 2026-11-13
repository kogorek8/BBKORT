#!/usr/bin/env bash
# Składa cały kod z app/js w JEDEN plik app/app.js.
# Dzięki temu przeglądarka nigdy nie dostanie mieszanki starych i nowych plików.
# Użycie:  npm install   (raz)   →   npm run build
set -euo pipefail
cd "$(dirname "$0")/.."
ESBUILD="${ESBUILD:-./node_modules/.bin/esbuild}"
VERSION="$(date -u +%Y%m%d-%H%M)"
"$ESBUILD" app/js/main.js --bundle --format=esm --target=safari13,chrome80,firefox78 \
  --minify --legal-comments=none --define:__BB_VERSION__="\"$VERSION\"" --outfile=app/app.js --log-level=warning
# wersja w adresach plików → przeglądarka pobiera świeże po każdej aktualizacji
sed -i -E "s|app\.js\?v=[^\"]*|app.js?v=$VERSION|; s|css/style\.css\?v=[^\"]*|css/style.css?v=$VERSION|; s|data-version=\"[^\"]*\"|data-version=\"$VERSION\"|" app/index.html
echo "Zbudowano app/app.js  (wersja $VERSION, $(wc -c < app/app.js) bajtów)"

#!/usr/bin/env bash
# Buduje wtyczkę WordPress: dist/bbkort-wordpress.zip (tylko gotowe pliki, bez kodu źródłowego)
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf dist/bbkort && mkdir -p dist/bbkort/app
cp wordpress/bbkort/bbkort.php dist/bbkort/
cp -r app/index.html app/app.js app/css app/img app/manifest.webmanifest app/sw.js dist/bbkort/app/
( cd dist && rm -f bbkort-wordpress.zip && python3 -c "
import shutil; shutil.make_archive('bbkort-wordpress', 'zip', '.', 'bbkort')" )
rm -rf dist/bbkort
cp dist/bbkort-wordpress.zip wordpress/bbkort-wordpress.zip
echo "Gotowe: wordpress/bbkort-wordpress.zip"

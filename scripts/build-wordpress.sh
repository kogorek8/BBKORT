#!/usr/bin/env bash
# Buduje wtyczkę WordPress: dist/bbkort-wordpress.zip
# (folder app/ kopiowany do środka wtyczki)
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf dist/bbkort && mkdir -p dist
cp -r wordpress/bbkort dist/bbkort
cp -r app dist/bbkort/app
( cd dist && rm -f bbkort-wordpress.zip && python3 -c "
import shutil; shutil.make_archive('bbkort-wordpress', 'zip', '.', 'bbkort')" )
rm -rf dist/bbkort
echo "Gotowe: dist/bbkort-wordpress.zip"

#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "Usage: $0 PLATFORM_STATIC_DIR OUTPUT_DIR" >&2
  exit 2
fi

platform_source=$1
output=$2
script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
repo_root=$(cd "$script_dir/../../.." && pwd)
site_source="$repo_root/maya-os-site"

for required in \
  "$site_source/index.html" \
  "$site_source/assets" \
  "$platform_source/app.html" \
  "$platform_source/oauth-callback.html" \
  "$platform_source/manifest.json" \
  "$platform_source/service-worker.js" \
  "$platform_source/fonts.css" \
  "$platform_source/fonts"; do
  if [[ ! -e "$required" ]]; then
    echo "Missing release input: $required" >&2
    exit 1
  fi
done

if [[ -e "$output" ]]; then
  echo "Output already exists: $output" >&2
  exit 1
fi

mkdir -p "$output/app"
cp "$site_source/index.html" "$output/index.html"
cp -R "$site_source/assets" "$output/assets"

cp "$platform_source/app.html" "$output/app/index.html"
cp "$platform_source/manifest.json" "$output/app/manifest.json"
cp "$platform_source/service-worker.js" "$output/app/service-worker.js"
cp "$platform_source/fonts.css" "$output/app/fonts.css"
cp -R "$platform_source/fonts" "$output/app/fonts"
cp "$platform_source/apple-touch-icon.png" "$output/app/apple-touch-icon.png"
cp "$platform_source/icon-192.png" "$output/app/icon-192.png"
cp "$platform_source/icon-192-maskable.png" "$output/app/icon-192-maskable.png"
cp "$platform_source/icon-512.png" "$output/app/icon-512.png"
cp "$platform_source/icon-512-maskable.png" "$output/app/icon-512-maskable.png"
cp "$platform_source/oauth-callback.html" "$output/oauth-callback.html"

cp "$script_dir/beget-edge/.htaccess" "$output/.htaccess"
cp "$script_dir/beget-edge/maya-platform-api.php" "$output/maya-platform-api.php"

# The neutral site is mounted below /app/. Keep OAuth and PWA paths exact.
perl -0pi -e 's#<title>Мужская Эстетика</title>#<title>MAYA OS</title>\n<link rel="icon" href="/app/icon-192.png"/>#; s#content="Malesthetic"#content="MAYA OS"#' "$output/app/index.html"
perl -0pi -e 's#url\(/fonts/#url(/app/fonts/#g' "$output/app/fonts.css"
perl -0pi -e 's#href="/fonts\.css"#href="/app/fonts.css"#; s#/app\.html#/app/?booking_tenant=maya-os#g' "$output/oauth-callback.html"

node - "$output/app/manifest.json" <<'NODE'
const fs = require('fs');
const file = process.argv[2];
const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
manifest.start_url = '/app/?booking_tenant=maya-os';
manifest.scope = '/app/';
manifest.id = '/app/';
manifest.icons = (manifest.icons || []).map((icon) => ({
  ...icon,
  src: '/app/' + String(icon.src || '').replace(/^\/+/, ''),
}));
fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n');
NODE

find "$output" -type f -exec chmod 0644 {} +
find "$output" -type d -exec chmod 0755 {} +

# Candidate inspection is mandatory, including PWA compatibility and relay copies.
node "$script_dir/beget-edge/verify-edge-candidate.cjs" "$output"

echo "MAYA OS edge release prepared at: $output"

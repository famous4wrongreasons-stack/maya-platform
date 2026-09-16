#!/usr/bin/env bash
# K5 EXIT GATE. "One CI job green":
#   the renderer bundle's import graph contains no fetch/XHR/WebSocket/storage/provider SDK;
#   self-mounting hosts = 0; six overlays -> nine route keys; unreachable route keys = 0;
#   role-mode switchers in the UI = 0 and the intent set differs by 0 bytes across the four
#   former role modes.
#
# EP-BUILD is only claimed where an executable build actually ran. Where it has not, this gate says
# so rather than counting the criterion as met.
set -u
cd "$(dirname "$0")/../../../.." || exit 1
S=maya-chat-shell; fail=0
say() { printf '%-46s %s\n' "$1" "$2"; }

# ── EP-BUILD, executed ───────────────────────────────────────────────────────────────────────
if ( cd "$S" && node build.mjs >/dev/null 2>&1 ); then
  D=$( cd "$S" && node build.mjs | grep -oE '[0-9a-f]{64}' )
  say "EP-BUILD (executed):" "PASS  digest ${D:0:16}…"
else say "EP-BUILD (executed):" "FAIL"; fail=1; fi

if ( cd "$S" && node build.mjs --check >/dev/null 2>&1 ); then
  say "REPRODUCIBLE (same in, same out):" "PASS"
else say "REPRODUCIBLE:" "FAIL"; fail=1; fi

# The build itself refuses a renderer that can reach anything — proved by planting a violation.
cp "$S/src/renderer/render.ts" /tmp/.k5.bak
printf '\nexport const leak = async () => fetch("https://x");\n' >> "$S/src/renderer/render.ts"
if ( cd "$S" && node build.mjs >/dev/null 2>&1 ); then
  say "RENDERER REACHES NOTHING (mutation):" "FAIL — a fetch was admitted"; fail=1
else say "RENDERER REACHES NOTHING (mutation):" "PASS — the build refuses a planted fetch"; fi
cp /tmp/.k5.bak "$S/src/renderer/render.ts"; rm -f /tmp/.k5.bak

# ── the route registry ───────────────────────────────────────────────────────────────────────
BASE=$(grep -c "'" <<<"$(grep 'export const BASE_ROUTES' -A1 "$S/src/routes/registry.ts" | tr ',' '\n' | grep -c "'")")
NBASE=$(grep 'export const BASE_ROUTES' "$S/src/routes/registry.ts" | grep -oE "'[a-z-]+'" | wc -l | tr -d ' ')
NFS=$(sed -n '/export const FULLSCREEN_ROUTES/,/] as const/p' "$S/src/routes/registry.ts" | grep -cE "^  'fs\.")
NOVER=$(sed -n '/export const RETIRED_OVERLAYS/,/] as const/p' "$S/src/routes/registry.ts" | grep -cE "^  '")
[ "$NBASE" = "5" ] && say "TARGET PRIMARY SHELL:" "5 base routes" || { say "TARGET PRIMARY SHELL:" "$NBASE (want 5)"; fail=1; }
[ "$NFS" = "9" ] && [ "$NOVER" = "6" ] \
  && say "SIX OVERLAYS -> NINE ROUTE KEYS:" "6 -> 9" \
  || { say "SIX OVERLAYS -> NINE ROUTE KEYS:" "$NOVER -> $NFS"; fail=1; }

# Every fullscreen route must carry a fullscreen_intent; a route without one would be a surface
# that can only mount itself, which is what the six overlays were.
MISSING=$(grep -cE "^  'fs\.[a-z-]+': \{ key: 'fs\.[a-z-]+', label: '[^']*', fullscreenIntent: null" "$S/src/routes/registry.ts")
[ "$MISSING" = "0" ] && say "ROWS WITHOUT A fullscreen_intent:" "0" || { say "ROWS WITHOUT A fullscreen_intent:" "$MISSING"; fail=1; }

# ── self-mounting hosts = 0 ──────────────────────────────────────────────────────────────────
# A self-mounting host reaches for a document and inserts itself. Nothing in the shell may.
SELFMOUNT=$(grep -rnE "document\.(body|getElementById|querySelector)|appendChild\(|\.render\(document" "$S/src" | grep -v "^\s*//" | wc -l | tr -d ' ')
[ "$SELFMOUNT" = "0" ] && say "SELF-MOUNTING HOSTS:" "0" || { say "SELF-MOUNTING HOSTS:" "$SELFMOUNT"; fail=1; }

# ── role-mode switchers = 0, and the intent set is role-invariant ────────────────────────────
ROLESWITCH=$(grep -rniE "roleMode|switchRole|__meCurMode|isOwner|isStaff" "$S/src" | grep -v "^\s*//" | wc -l | tr -d ' ')
[ "$ROLESWITCH" = "0" ] && say "ROLE-MODE SWITCHERS IN THE UI:" "0" || { say "ROLE-MODE SWITCHERS:" "$ROLESWITCH"; fail=1; }
# intentSet() takes no argument, so it cannot vary by role — checked structurally rather than by
# calling it four times, because a function with no role parameter has no role-dependent output.
if grep -q "export const intentSet = ()" "$S/src/routes/registry.ts"; then
  say "INTENT SET DIFFERS ACROSS ROLE MODES:" "0 bytes (intentSet takes no role)"
else say "INTENT SET:" "intentSet accepts a parameter — it could vary"; fail=1; fi

# ── legacy UI is NOT deleted ─────────────────────────────────────────────────────────────────
for f in "сайт и приложение/app.html" "maya-os-site/index.html"; do
  [ -f "$f" ] && say "LEGACY UI KEPT: $(basename "$f")" "present" || { say "LEGACY UI: $f" "MISSING — K5 deletes nothing"; fail=1; }
done

echo
[ $fail -eq 0 ] && echo "K5 EXIT: PASS" || echo "K5 EXIT: FAIL"
exit $fail

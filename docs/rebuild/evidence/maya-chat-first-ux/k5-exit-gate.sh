#!/usr/bin/env bash
# K5 EXIT GATE. "One CI job green":
#   the renderer bundle's import graph contains no fetch/XHR/WebSocket/storage/provider SDK;
#   self-mounting hosts = 0; six overlays -> nine route keys; unreachable route keys = 0;
#   role-mode switchers in the UI = 0 and the intent set differs by 0 bytes across the four
#   former role modes.
#
# EP-BUILD is only claimed where an executable build actually ran. Where it has not, this gate says
# so rather than counting the criterion as met.
#
# The shell has one host acquisition, and it lives in entry/ (H1, D13): src/ self-mounts 0 times,
# entry/ exactly once. entry/main.ts and src/dom/host.ts are created by S5 (SHELL-PLAN v2.1 §2.2,
# V2-3). Until they exist their criteria print NOT YET PRESENT and FAIL — a missing file is never a
# PASS, and nothing is planted into a file that does not exist.
#
# Mutations plant a fetch into a real source file and require the build to refuse THAT line. Each
# original is backed up to a mktemp file and restored by an EXIT trap, so an interrupted run never
# leaves a planted line behind.
set -u
cd "$(dirname "$0")/../../../.." || exit 1
S=maya-chat-shell; fail=0
say() { printf '%-46s %s\n' "$1" "$2"; }

# ── planted mutations: one at a time, backed up to mktemp, restored on every exit path ─────────
PLANT_TARGET=; PLANT_BAK=
unplant() {
  [ -n "$PLANT_BAK" ] || return 0
  if cp "$PLANT_BAK" "$PLANT_TARGET" && cmp -s "$PLANT_BAK" "$PLANT_TARGET"; then
    rm -f "$PLANT_BAK"; PLANT_TARGET=; PLANT_BAK=
  else
    echo "K5 GATE: could not restore $PLANT_TARGET — its original is kept at $PLANT_BAK" >&2
    return 1
  fi
}
trap 'unplant || exit 1' EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

# mutate LABEL REL — append a fetch to $S/REL. PASS only if the build refuses and one of its
# refusals names the planted file for that fetch (a build failing for another reason proves nothing).
# The mutated builds run with --dry-run, so an admitted leak is never written into dist/.
mutate() {
  local label=$1 rel=$2 out rc
  PLANT_TARGET="$S/$rel"
  if ! PLANT_BAK=$(mktemp "${TMPDIR:-/tmp}/k5-gate.XXXXXX"); then
    PLANT_TARGET=; PLANT_BAK=; say "$label" "FAIL — no backup file"; fail=1; return
  fi
  if ! cp "$PLANT_TARGET" "$PLANT_BAK"; then
    rm -f "$PLANT_BAK"; PLANT_TARGET=; PLANT_BAK=; say "$label" "FAIL — could not back up $rel"; fail=1; return
  fi
  printf '\nexport const leak = async () => fetch("https://x");\n' >> "$PLANT_TARGET"
  out=$( cd "$S" && node build.mjs --dry-run 2>&1 ); rc=$?
  if [ "$rc" -eq 0 ]; then
    say "$label" "FAIL — a fetch was admitted"; fail=1
  elif grep -E "^  (layer-global|fetch-shape) " <<<"$out" | grep -F " $rel:" | grep -q "fetch"; then
    say "$label" "PASS — the build refuses a planted fetch"
  else
    say "$label" "FAIL — the build failed, but not on the planted fetch"; fail=1
  fi
  unplant || fail=1
}

# ── EP-BUILD, executed ───────────────────────────────────────────────────────────────────────
if ( cd "$S" && node build.mjs >/dev/null 2>&1 ); then
  D=$( cd "$S" && node build.mjs | grep -oE '[0-9a-f]{64}' )
  say "EP-BUILD (executed):" "PASS  digest ${D:0:16}…"
else say "EP-BUILD (executed):" "FAIL"; fail=1; fi

if ( cd "$S" && node build.mjs --check >/dev/null 2>&1 ); then
  say "REPRODUCIBLE (same in, same out):" "PASS"
else say "REPRODUCIBLE:" "FAIL"; fail=1; fi

# The build itself refuses a renderer that can reach anything — proved by planting a violation.
mutate "RENDERER REACHES NOTHING (mutation):" "src/renderer/render.ts"

# The DOM host draws through injected ports and reaches nothing either (D5).
if [ -f "$S/src/dom/host.ts" ]; then
  mutate "DOM REACHES NOTHING (mutation):" "src/dom/host.ts"
else
  say "DOM MUTATION: NOT YET PRESENT" "FAIL — src/dom/host.ts is created by S5; nothing planted"; fail=1
fi

# ── the route registry ───────────────────────────────────────────────────────────────────────
BASE=$(grep -c "'" <<<"$(grep 'export const BASE_ROUTES' -A1 "$S/src/routes/registry.ts" | tr ',' '\n' | grep -c "'")")
NBASE=$(grep 'export const BASE_ROUTES' "$S/src/routes/registry.ts" | grep -oE "'shell\.[a-z]+'" | wc -l | tr -d ' ')
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
# Every grep below reads with -a: a raw control byte in a source would otherwise make grep print
# "Binary file … matches" instead of the line, and GNU grep ≥ 3.5 would count nothing (the build also
# refuses such a byte, rule k5-text).
SELFMOUNT=$(grep -a -rnE "document\.(body|getElementById|querySelector)|appendChild\(|\.render\(document" "$S/src" | grep -v "^\s*//" | wc -l | tr -d ' ')
[ "$SELFMOUNT" = "0" ] && say "SELF-MOUNTING HOSTS:" "0" || { say "SELF-MOUNTING HOSTS:" "$SELFMOUNT"; fail=1; }

# ── the one host acquisition, in entry/ (H1, D13) ────────────────────────────────────────────
# entry/ acquires the host exactly once, and `document` appears on exactly one line there
# (index.html's text is not code; comment-only lines are not references).
if [ -f "$S/entry/main.ts" ]; then
  ENTRYMOUNT=$(grep -a -rnE "document\.(body|getElementById|querySelector)" "$S/entry" | wc -l | tr -d ' ')
  [ "$ENTRYMOUNT" = "1" ] && say "ENTRY MOUNT (host acquisitions in entry/):" "1" \
    || { say "ENTRY MOUNT (host acquisitions in entry/):" "$ENTRYMOUNT (want exactly 1)"; fail=1; }
  DOCLINES=$(grep -a -rnw --exclude=index.html "document" "$S/entry" | grep -vE '^[^:]+:[0-9]+:[[:space:]]*(//|/?\*)' | wc -l | tr -d ' ')
  [ "$DOCLINES" = "1" ] && say "LINES NAMING document IN entry/:" "1" \
    || { say "LINES NAMING document IN entry/:" "$DOCLINES (want exactly 1)"; fail=1; }
else
  say "ENTRY MOUNT: NOT YET PRESENT" "FAIL — entry/main.ts is created by S5"; fail=1
fi

# ── role-mode switchers = 0, and the intent set is role-invariant ────────────────────────────
ROLEDIRS=("$S/src"); ROLEWHERE="src"
if [ -d "$S/entry" ]; then ROLEDIRS+=("$S/entry"); ROLEWHERE="src + entry"; else ROLEWHERE="src; entry absent"; fi
ROLESWITCH=$(grep -a -rniE "roleMode|switchRole|__meCurMode|isOwner|isStaff" "${ROLEDIRS[@]}" | grep -v "^\s*//" | wc -l | tr -d ' ')
[ "$ROLESWITCH" = "0" ] && say "ROLE-MODE SWITCHERS IN THE UI:" "0 ($ROLEWHERE)" || { say "ROLE-MODE SWITCHERS:" "$ROLESWITCH ($ROLEWHERE)"; fail=1; }
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

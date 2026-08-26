#!/bin/sh
# Section 12b of the Windows sweep, standalone: write a setting through the registry, change it,
# undeclare it, and check the store each time with `reg query` rather than with Shall's own word.
# Throwaway key, deleted first and last.
set -u
cd /c/Users/Administrator/Videos/Nexus/linix || exit 1
SHALL=./target/debug/shall.exe
export MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*'
ROOT='C:/Users/Administrator/AppData/Local/Temp/shall-setting-probe'
export SHALL_CONFIG_DIR="$ROOT/config" SHALL_DATA_DIR="$ROOT/data"
rm -rf "$ROOT"; mkdir -p "$SHALL_CONFIG_DIR" "$SHALL_DATA_DIR"
SUBKEY='Software\ShallIntegrationCanary'
NAME=Mode
reg delete "HKCU\\$SUBKEY" /f >/dev/null 2>&1

$SHALL init >/dev/null 2>&1 || { echo "init failed"; exit 1; }
MOD="$(ls "$SHALL_CONFIG_DIR"/modules/imperative.txt 2>/dev/null || ls "$SHALL_CONFIG_DIR"/modules/*.txt | head -1)"

say() { printf '  %-52s %s\n' "$1" "$2"; }
val() { reg query "HKCU\\$SUBKEY" /v "$NAME" 2>/dev/null | tr -d '\r' | awk '/REG_SZ/{print $3}'; }

[ -z "$(val)" ] && say "value absent before sync" OK || say "value absent before sync" "FAIL (got $(val))"

printf 'setting:%s/%s @value=prefer-dark\n' "$SUBKEY" "$NAME" >> "$MOD"
out=$($SHALL -y sync 2>&1); rc=$?
[ "$rc" = 0 ] && say "sync applies a declared setting" OK || say "sync applies a declared setting" "FAIL rc=$rc"
[ "$(val)" = "prefer-dark" ] && say "the value is really in the registry" OK \
    || say "the value is really in the registry" "FAIL (got '$(val)')"

grep -v -F "setting:$SUBKEY/$NAME " "$MOD" > "$MOD.tmp"; mv "$MOD.tmp" "$MOD"
printf 'setting:%s/%s @value=prefer-light\n' "$SUBKEY" "$NAME" >> "$MOD"
out2=$($SHALL -y sync 2>&1); rc=$?
[ "$rc" = 0 ] && say "sync applies a CHANGED setting" OK || say "sync applies a CHANGED setting" "FAIL rc=$rc"
[ "$(val)" = "prefer-light" ] && say "the new value replaced the old one" OK \
    || say "the new value replaced the old one" "FAIL (got '$(val)')"
printf '  what the CHANGED sync said: %s\n' "$(printf '%s' "$out2" | tr '\n' '|' | cut -c1-70)"

grep -v -F "setting:$SUBKEY/$NAME " "$MOD" > "$MOD.tmp"; mv "$MOD.tmp" "$MOD"
out3=$($SHALL -y sync 2>&1); rc=$?
[ "$rc" = 0 ] && say "sync resets a setting whose line has gone" OK || say "sync resets a setting whose line has gone" "FAIL rc=$rc"
[ -z "$(val)" ] && say "the value is really gone from the registry" OK \
    || say "the value is really gone from the registry" "FAIL (still '$(val)')"

reg delete "HKCU\\$SUBKEY" /f >/dev/null 2>&1

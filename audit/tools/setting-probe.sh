#!/bin/sh
# Drive `setting:` against the real Windows registry, exactly as section 12b of
# scripts/integration-windows.sh does, but standalone so the whole sweep need not run.
set -u
cd /c/Users/Administrator/Videos/Nexus/linix || exit 1
SHALL=./target/debug/shall.exe
export SHALL_CONFIG_DIR='C:/Users/Administrator/AppData/Local/Temp/shall-setting-probe/config'
export SHALL_DATA_DIR='C:/Users/Administrator/AppData/Local/Temp/shall-setting-probe/data'
rm -rf "$SHALL_CONFIG_DIR" "$SHALL_DATA_DIR"
mkdir -p "$SHALL_CONFIG_DIR" "$SHALL_DATA_DIR"
export MSYS_NO_PATHCONV=1
export MSYS2_ARG_CONV_EXCL='*'
$SHALL init >/dev/null 2>&1 || { echo "init failed"; exit 1; }
echo "--- priority as init wrote it"
cat "$SHALL_CONFIG_DIR/priority"
grep -qx setting "$SHALL_CONFIG_DIR/priority" || printf 'setting\n' >> "$SHALL_CONFIG_DIR/priority"
ls "$SHALL_CONFIG_DIR/modules"

SUBKEY='Software\ShallIntegrationCanary'
NAME=Mode
MOD="$(ls "$SHALL_CONFIG_DIR"/modules/*.txt 2>/dev/null | head -1)"
[ -n "$MOD" ] || { echo "no module file to write into"; exit 1; }
echo "module: $MOD"

reg delete "HKCU\\$SUBKEY" /f >/dev/null 2>&1

echo "--- control: the value must not exist"
reg query "HKCU\\$SUBKEY" /v "$NAME" >/dev/null 2>&1 && echo "CONTROL FAILED: value already present" || echo "ok: absent"

printf 'setting:%s/%s @value=prefer-dark\n' "$SUBKEY" "$NAME" > "$MOD"
echo "--- sync 1"
$SHALL -y sync; echo "sync1 rc=$?"
reg query "HKCU\\$SUBKEY" /v "$NAME" 2>&1

printf 'setting:%s/%s @value=prefer-light\n' "$SUBKEY" "$NAME" > "$MOD"
echo "--- sync 2 (changed value)"
$SHALL -y sync; echo "sync2 rc=$?"
reg query "HKCU\\$SUBKEY" /v "$NAME" 2>&1

: > "$MOD"
echo "--- sync 3 (declaration removed)"
$SHALL -y sync; echo "sync3 rc=$?"
reg query "HKCU\\$SUBKEY" /v "$NAME" >/dev/null 2>&1 && echo "STILL PRESENT (reset did not run)" || echo "ok: gone"

reg delete "HKCU\\$SUBKEY" /f >/dev/null 2>&1

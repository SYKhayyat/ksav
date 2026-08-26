#!/bin/sh
# Does a sync that CHANGES a setting say so? Measured, not assumed.
set -u
cd /c/Users/Administrator/Videos/Nexus/linix || exit 1
SHALL=./target/debug/shall.exe
export SHALL_CONFIG_DIR='C:/Users/Administrator/AppData/Local/Temp/shall-setting-probe/config'
export SHALL_DATA_DIR='C:/Users/Administrator/AppData/Local/Temp/shall-setting-probe/data'
export MSYS_NO_PATHCONV=1
export MSYS2_ARG_CONV_EXCL='*'
SUBKEY='Software\ShallIntegrationCanary'
NAME=Mode
MOD="$SHALL_CONFIG_DIR/modules/starter.txt"

reg delete "HKCU\\$SUBKEY" /f >/dev/null 2>&1

printf 'setting:%s/%s @value=alpha\n' "$SUBKEY" "$NAME" > "$MOD"
echo "=== A: first sync, value absent -> alpha"
$SHALL -y sync 2>&1; echo "rc=$?"

echo "=== B: second sync, unchanged declaration (should be a genuine no-op)"
$SHALL -y sync 2>&1; echo "rc=$?"

printf 'setting:%s/%s @value=beta\n' "$SUBKEY" "$NAME" > "$MOD"
echo "=== C: third sync, declaration CHANGED alpha -> beta"
$SHALL -y sync 2>&1; echo "rc=$?"
echo "--- registry now:"
reg query "HKCU\\$SUBKEY" /v "$NAME" 2>&1

echo "=== D: what plan says about the same change"
printf 'setting:%s/%s @value=gamma\n' "$SUBKEY" "$NAME" > "$MOD"
$SHALL plan --dry-run 2>&1; echo "rc=$?"

: > "$MOD"
$SHALL -y sync >/dev/null 2>&1
reg delete "HKCU\\$SUBKEY" /f >/dev/null 2>&1

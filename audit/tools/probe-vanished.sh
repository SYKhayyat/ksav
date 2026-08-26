#!/bin/sh
# A managed package removed behind Shall's back, then undeclared. The planner deliberately does
# NOT gate the removal on "is it still installed" — so the removal command runs against a package
# the manager no longer has. apt says "not installed, so not removed" and exits 0; pacman -R exits
# 1 with `target not found`. If that failure keeps the registry entry, every later sync retries it
# and the machine can never converge.
set -u
export SHALL_CONFIG_DIR=/tmp/pv-config SHALL_DATA_DIR=/tmp/pv-data
rm -rf "$SHALL_CONFIG_DIR" "$SHALL_DATA_DIR"
shall init >/dev/null 2>&1
BE="${1:-pacman}"
PKG="${2:-jq}"

echo "=== install $BE:$PKG through Shall ==="
shall -y install "$BE:$PKG" 2>&1 | tail -2
MOD="$SHALL_CONFIG_DIR/modules/imperative.txt"

echo "=== remove it behind Shall's back ==="
case "$BE" in
    pacman) sudo pacman -Rs --noconfirm "$PKG" 2>&1 | tail -2 ;;
    apt)    apt-get remove -y "$PKG" 2>&1 | tail -2 ;;
esac
command -v "$PKG" >/dev/null 2>&1 && echo "STILL ON PATH (probe setup failed)" || echo "gone from PATH"

echo "=== delete the declaration, then sync ==="
grep -v "$PKG" "$MOD" > "$MOD.new" && mv "$MOD.new" "$MOD"
out="$(shall -y sync 2>&1)"; rc=$?
echo "sync rc=$rc"
printf '%s\n' "$out" | tail -8

echo "=== does a SECOND sync still try it? (the wedge test) ==="
out2="$(shall -y sync 2>&1)"; rc2=$?
echo "second sync rc=$rc2"
printf '%s\n' "$out2" | tail -6

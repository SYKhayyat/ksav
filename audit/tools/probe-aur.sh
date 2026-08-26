#!/bin/sh
# Why does `yay -S --noconfirm --needed jq` say "target not found: jq" on an image where
# `pacman -S jq` works? And does adopt really write one package three times?
set -u
echo "=== who am i ==="; id
echo "=== pacman knows jq? ==="
pacman -Si jq >/dev/null 2>&1 && echo "pacman -Si jq: OK" || echo "pacman -Si jq: NOT FOUND"
echo "=== yay -Si jq ==="
yay -Si jq >/dev/null 2>&1 && echo "yay -Si jq: OK" || echo "yay -Si jq: NOT FOUND"
echo "=== yay install, verbatim argv Shall uses ==="
yay -S --noconfirm --needed jq 2>&1 | tail -5
echo "rc=$?"
echo "=== paru install, verbatim argv Shall uses ==="
paru -S --noconfirm --needed jq 2>&1 | tail -5
echo "rc=$?"
echo "=== yay --version / paru --version ==="
yay --version 2>&1 | head -2; paru --version 2>&1 | head -2
echo "=== does yay see a sync db? ==="
ls /var/lib/pacman/sync/ 2>&1
echo "=== -Qe counts (the three backends over ONE database) ==="
printf 'pacman -Qe: '; pacman -Qe 2>/dev/null | wc -l
printf 'yay    -Qe: '; yay -Qe 2>/dev/null | wc -l
printf 'paru   -Qe: '; paru -Qe 2>/dev/null | wc -l
echo "=== what does shall adopt write? ==="
export SHALL_CONFIG_DIR=/tmp/probe-config SHALL_DATA_DIR=/tmp/probe-data
rm -rf "$SHALL_CONFIG_DIR" "$SHALL_DATA_DIR"
shall init >/dev/null 2>&1
shall adopt -y 2>&1 | tail -3
echo "--- grep jq in every module ---"
grep -rn 'jq' "$SHALL_CONFIG_DIR"/modules/ 2>/dev/null
echo "--- how many lines per backend prefix ---"
cat "$SHALL_CONFIG_DIR"/modules/*.txt 2>/dev/null | sed -n 's/^\([a-z][a-z0-9-]*\):.*/\1/p' | sort | uniq -c | sort -rn | head
echo "--- total declared lines ---"
cat "$SHALL_CONFIG_DIR"/modules/*.txt 2>/dev/null | grep -c .

#!/bin/sh
# Why did a bare `bc` freeze to cargo on an image whose priority names slackpkg?
set -u
export SHALL_CONFIG_DIR=/tmp/ps-config SHALL_DATA_DIR=/tmp/ps-data
rm -rf "$SHALL_CONFIG_DIR" "$SHALL_DATA_DIR"
shall init >/dev/null 2>&1
echo "=== priority ==="; cat "$SHALL_CONFIG_DIR/priority" 2>/dev/null
echo "=== does slackpkg itself find bc? ==="
slackpkg search bc 2>&1 | head -12
echo "=== and these, as alternatives ==="
for c in htop dc cdrtools rsync lsof; do
    printf '%-10s ' "$c"
    slackpkg search "$c" 2>&1 | grep -c "$c"
done
echo "=== what does shall think? ==="
shall install bc --dry-run 2>&1 | head -12
echo "=== shall search bc, per backend ==="
shall search bc 2>&1 | head -15

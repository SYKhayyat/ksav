#!/bin/sh
# Mirror harness sections 5 -> 8 -> 10 to catch the exact command that says "target not found".
set -u
export SHALL_CONFIG_DIR=/tmp/p2-config SHALL_DATA_DIR=/tmp/p2-data
rm -rf "$SHALL_CONFIG_DIR" "$SHALL_DATA_DIR"
shall init >/dev/null 2>&1
echo "=== [5] install jq ==="
shall -y install jq 2>&1 | tail -3
echo "=== [8] adopt ==="
shall adopt -y >/dev/null 2>&1
echo "jq lines in the model:"; grep -rn '^[a-z]*:*jq$' "$SHALL_CONFIG_DIR"/modules/ 2>/dev/null
echo "=== [10] uninstall jq ==="
shall -y uninstall jq 2>&1 | tail -12
echo "rc=$?"
echo "=== jq still on PATH? ==="
command -v jq || echo "jq gone"
echo "=== jq lines left in the model ==="
grep -rn 'jq' "$SHALL_CONFIG_DIR"/modules/*.txt 2>/dev/null | grep -v '^.*#' || echo "(none)"
echo "=== the undeclared census: how many entries for ONE package? ==="
shall check absent 2>&1 | head -20
echo "=== plan ==="
shall plan 2>&1 | head -25

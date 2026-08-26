set -u
# Is `uninstall jq` -> `yay:jq` a resolution-order question, or a bug in yay's removal argv?
# Measured rather than reasoned about — the harness only showed the symptom.
LOG=/mnt/c/Users/Administrator/Videos/Nexus/shall-scratch/wrapper-removal.log
docker run --rm --entrypoint sh shall-it-arch -c '
  export SHALL_CONFIG_DIR=/tmp/wr-config SHALL_DATA_DIR=/tmp/wr-data
  rm -rf "$SHALL_CONFIG_DIR" "$SHALL_DATA_DIR"; mkdir -p "$SHALL_CONFIG_DIR" "$SHALL_DATA_DIR"
  shall init >/dev/null 2>&1
  echo "=== priority, as init wrote it ==="
  grep -v "^#" "$SHALL_CONFIG_DIR/priority" | grep -v "^$"
  echo "=== install jq through shall (bare name) ==="
  shall -y install jq 2>&1 | tail -4
  echo "=== which manager holds it? ==="
  pacman -Q jq 2>&1
  echo "=== does yay itself remove it, outside Shall? ==="
  yay -R --noconfirm jq 2>&1 | tail -4; echo "yay -R rc=$?"
  echo "=== put it back, then ask Shall to remove the bare name ==="
  sudo pacman -S --noconfirm jq >/dev/null 2>&1
  shall why jq 2>&1 | head -20
  shall -y uninstall jq 2>&1 | tail -6; echo "shall uninstall rc=$?"
' > "$LOG" 2>&1
echo "WRAPPER_RC=$?"
cat "$LOG"

set -u
cd /mnt/c/Users/Administrator/Videos/Nexus/linix
OUT=/mnt/c/Users/Administrator/Videos/Nexus/shall-scratch/ubuntu-harness.log
docker run --rm \
  -v "$PWD/docker/integration/run-in-container.sh:/src/docker/integration/run-in-container.sh:ro" \
  -v "$PWD/scripts/lifecycle-floor.txt:/src/scripts/lifecycle-floor.txt:ro" \
  shall-it-ubuntu apt jq > "$OUT" 2>&1
echo "UBUNTU_HARNESS_RC=$?"
echo "--- section 14c and the result line:"
sed -n '/\[14c\]/,/\[15\]/p' "$OUT"
tail -12 "$OUT"

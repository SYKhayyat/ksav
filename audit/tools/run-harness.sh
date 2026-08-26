set -u
# run-harness.sh <image-tag> <backend> <package> [extra docker args...]
#
# **The script is SNAPSHOTTED before the container starts.** `sh` reads a script incrementally,
# so editing the file a running container has bind-mounted corrupts the run in progress: measured
# twice today as `line 1424: he: command not found` and `1582: Syntax error: "else" unexpected`,
# both of them my edit landing in the middle of a live harness. The copy costs nothing and makes
# the failure impossible.
IMG="$1"; BE="$2"; PKG="$3"; shift 3
SCRATCH=/mnt/c/Users/Administrator/Videos/Nexus/shall-scratch
SNAP="$SCRATCH/snapshot-$IMG"
mkdir -p "$SNAP"
cd /mnt/c/Users/Administrator/Videos/Nexus/linix
cp docker/integration/run-in-container.sh "$SNAP/run-in-container.sh"
cp scripts/lifecycle-floor.txt "$SNAP/lifecycle-floor.txt"
OUT="$SCRATCH/harness-$IMG.log"
docker run --rm "$@" \
  -v "$SNAP/run-in-container.sh:/src/docker/integration/run-in-container.sh:ro" \
  -v "$SNAP/lifecycle-floor.txt:/src/scripts/lifecycle-floor.txt:ro" \
  "$IMG" "$BE" "$PKG" > "$OUT" 2>&1
echo "HARNESS_RC=$? image=$IMG"
echo "--- section 14c:"
sed -n '/\[14c\]/,/\[15\]/p' "$OUT"
echo "--- tail:"
tail -8 "$OUT"

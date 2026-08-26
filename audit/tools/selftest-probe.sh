#!/bin/sh
# Can the terminator probe actually FAIL on slackpkg's row, or would a wrong row pass?
# bugs.md VI.9 claims wiring slackware into the CI matrix arms this gate. Prove it.
#
# Flip the row back to the wrong value, run the probe, restore. The tree is restored on every
# exit path, including the failing one — a self-test that leaves a wrong constant behind is a
# worse bug than the one it was checking.
set -u
SRC=/mnt/c/Users/Administrator/Videos/Nexus/linix/src/core/argv.rs
OUT=/mnt/c/Users/Administrator/Videos/Nexus/shall-scratch/selftest-probe.log

cp "$SRC" /tmp/argv.rs.bak
restore() { cp /tmp/argv.rs.bak "$SRC"; echo "--- tree restored"; }
trap restore EXIT INT TERM

# The `false,` on the line after `"slackpkg",` — back to the value that shipped the bug.
sed -i '/"slackpkg",/{n;s/false,/true,/}' "$SRC"
echo "--- row now reads:"
grep -A 2 '"slackpkg",' "$SRC" | head -3

cd /mnt/c/Users/Administrator/Videos/Nexus/linix
docker run --rm -u 0 --entrypoint sh \
  -e TERMINATOR_PROBE=1 -e CARGO_TARGET_DIR=/tmp/target \
  -v /mnt/c/Users/Administrator/Videos/Nexus/linix:/src \
  shall-it-slackware -c \
  "cd /src && cargo test --test suite -- terminator_probe_tests:: --nocapture" > "$OUT" 2>&1
echo "PROBE_RC=$?  (nonzero is the PASS for this self-test)"

echo "--- what it said about slackpkg:"
grep -i "slackpkg" "$OUT" | head -20
echo "--- verdict line:"
grep -E "test result|binaries measured" "$OUT"

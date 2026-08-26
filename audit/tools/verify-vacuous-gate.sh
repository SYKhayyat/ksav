#!/bin/sh
# The new assertion must FAIL unprivileged (where the probe measures nothing) and PASS as root
# (where it measures pacman, yay and paru). A gate that is green both ways is decoration.
set -u
cd /mnt/c/Users/Administrator/Videos/Nexus/linix

run() {
    label="$1"; shift
    echo "=== $label ==="
    docker run --rm "$@" --entrypoint sh \
      -e TERMINATOR_PROBE=1 -e CARGO_TARGET_DIR=/tmp/target \
      -v /mnt/c/Users/Administrator/Videos/Nexus/linix:/src \
      shall-it-arch -c \
      "cd /src && cargo test --test suite -- terminator_probe_tests:: --nocapture" \
      > /tmp/$label.out 2>&1
    echo "rc=$?"
    grep -E "measured:|inconclusive:|could measure none|test result" /tmp/$label.out | head -12
    echo
}

run unprivileged
run asroot -u 0

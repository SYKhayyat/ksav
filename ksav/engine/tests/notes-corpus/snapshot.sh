#!/bin/sh
# Dump every corpus document's laid-out page into one directory, so two builds
# can be diffed against each other.
#
#     sh tests/notes-corpus/snapshot.sh /some/dir
#
# `run.sh` prints the measurements a person reads. This prints the whole page, in
# a form `diff -r` can answer questions about, because the regression bar in
# NOTES-PLAN Part 2c is *every document that passes today still passes* and no
# person reads forty pages of coordinates to check that.
#
# Both instruments, because neither sees the whole page: `probe` cannot see a
# fill or a slant and reports both as "no difference", which is indistinguishable
# from a pass. That mistake is why colour was recorded as dead for a month while
# it was live.
set -e
cd "$(dirname "$0")/../.." || exit 1
out="${1:?usage: snapshot.sh <directory>}"
mkdir -p "$out"
for f in tests/notes-corpus/*.ksav; do
  name=$(basename "$f" .ksav)
  cargo run -q --release --example probe   -- "$f" > "$out/$name.probe" 2>&1 || true
  cargo run -q --release --example svgdump -- "$f" > "$out/$name.svg"   2>&1 || true
done
printf 'snapshot of %s documents in %s\n' "$(ls tests/notes-corpus/*.ksav | wc -l)" "$out"

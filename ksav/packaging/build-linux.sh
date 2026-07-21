#!/usr/bin/env bash
# Build the Linux installers (.deb + .AppImage) through Docker.
#
#   ksav/packaging/build-linux.sh
#
# Requires Docker (Docker Desktop with the WSL2 backend is fine on Windows).
# The image carries the toolchain and is cached, so only the first run is slow.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
IMAGE=ksav-linux-build

echo "==> Building the toolchain image (cached after the first run)"
docker build -t "$IMAGE" -f "$HERE/linux.Dockerfile" "$HERE"

echo "==> Building installers"
# A named volume for the Rust target directory: without it every run recompiles
# the whole Typst compiler from cold, which is the difference between a two
# minute rebuild and a twenty minute one.
docker run --rm \
  -v "$REPO:/work" \
  -v ksav-linux-cargo-target:/work/ksav/app/src-tauri/target \
  -v ksav-linux-cargo-registry:/root/.cargo/registry \
  -v ksav-linux-node-modules:/work/ksav/app/node_modules \
  "$IMAGE"

echo
echo "Installers are in ksav/packaging/out/"

#!/usr/bin/env bash
# Runs inside the Linux build container (see linux.Dockerfile).
set -euo pipefail

cd /work/ksav/app

echo "==> Installing front-end dependencies"
# `node_modules` and `src-tauri/target` are mounted as named Docker volumes (see
# build-linux.sh), NOT as part of the bind-mounted repo. Two reasons, both
# load-bearing:
#   - esbuild and rollup ship platform-native binaries, so installing Linux ones
#     over the host's Windows copy would break the host's own `npm run build`;
#   - cargo over a 9p bind mount is punishingly slow, and a volume keeps the
#     incremental build cache on the Linux side where it belongs.
npm ci --no-audit --no-fund

echo "==> Front-end tests"
npm test

echo "==> Building .deb and .AppImage"
npm run tauri build -- --bundles deb,appimage

# The bundle lands inside the target volume, which the host cannot see, so copy
# the installers back out onto the bind mount.
echo "==> Collecting artifacts"
OUT=/work/ksav/packaging/out
mkdir -p "$OUT"
find src-tauri/target/release/bundle -type f \
  \( -name '*.deb' -o -name '*.AppImage' \) -exec cp -v {} "$OUT/" \;
ls -lh "$OUT"

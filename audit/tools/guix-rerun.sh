#!/bin/sh
set -u
cd /mnt/c/Users/Administrator/Videos/Nexus/linix
docker build -f docker/integration/Dockerfile.guix -t shall-it-guix . \
  > /mnt/c/Users/Administrator/Videos/Nexus/shall-scratch/guix-build.log 2>&1
echo "GUIX_BUILD_RC=$?"
sh /mnt/c/Users/Administrator/Videos/Nexus/shall-scratch/run-harness.sh \
   shall-it-guix guix hello --security-opt seccomp=unconfined

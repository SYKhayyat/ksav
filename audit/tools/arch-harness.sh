set -u
cd /mnt/c/Users/Administrator/Videos/Nexus/linix
docker run --rm \
  -v "$PWD/docker/integration/run-in-container.sh:/src/docker/integration/run-in-container.sh:ro" \
  -v "$PWD/scripts/lifecycle-floor.txt:/src/scripts/lifecycle-floor.txt:ro" \
  shall-it-arch pacman jq > /mnt/c/Users/Administrator/Videos/Nexus/shall-scratch/arch-harness.log 2>&1
echo "ARCH_HARNESS_RC=$?"
tail -70 /mnt/c/Users/Administrator/Videos/Nexus/shall-scratch/arch-harness.log

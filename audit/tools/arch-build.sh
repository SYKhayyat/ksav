set -u
cd /mnt/c/Users/Administrator/Videos/Nexus/linix
docker build -f docker/integration/Dockerfile.arch -t shall-it-arch . \
  > /mnt/c/Users/Administrator/Videos/Nexus/shall-scratch/arch-build.log 2>&1
echo "ARCH_BUILD_RC=$?"
tail -30 /mnt/c/Users/Administrator/Videos/Nexus/shall-scratch/arch-build.log
docker run --rm --entrypoint env shall-it-arch | sort

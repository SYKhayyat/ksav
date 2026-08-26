set -u
cd /mnt/c/Users/Administrator/Videos/Nexus/linix
docker build -f docker/integration/Dockerfile.ubuntu -t shall-it-ubuntu . \
  > /mnt/c/Users/Administrator/Videos/Nexus/shall-scratch/ubuntu-build.log 2>&1
echo "UBUNTU_BUILD_RC=$?"
tail -12 /mnt/c/Users/Administrator/Videos/Nexus/shall-scratch/ubuntu-build.log

set -u
cd /mnt/c/Users/Administrator/Videos/Nexus/linix
docker build -f docker/integration/Dockerfile.slackware -t shall-it-slackware . \
  > /mnt/c/Users/Administrator/Videos/Nexus/shall-scratch/slackware-build.log 2>&1
echo "SLACK_BUILD_RC=$?"
tail -40 /mnt/c/Users/Administrator/Videos/Nexus/shall-scratch/slackware-build.log

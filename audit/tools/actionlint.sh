set -u
cd /mnt/c/Users/Administrator/Videos/Nexus/linix
docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:latest -color \
  > /mnt/c/Users/Administrator/Videos/Nexus/shall-scratch/actionlint.log 2>&1
echo "ACTIONLINT_RC=$?"
cat /mnt/c/Users/Administrator/Videos/Nexus/shall-scratch/actionlint.log

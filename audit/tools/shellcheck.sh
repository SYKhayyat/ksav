set -u
cd /mnt/c/Users/Administrator/Videos/Nexus/linix
docker run --rm -v "$PWD:/mnt" koalaman/shellcheck:stable -S warning \
  scripts/*.sh docker/integration/*.sh .githooks/* \
  > /mnt/c/Users/Administrator/Videos/Nexus/shall-scratch/shellcheck.log 2>&1
echo "SHELLCHECK_RC=$?"
tail -60 /mnt/c/Users/Administrator/Videos/Nexus/shall-scratch/shellcheck.log

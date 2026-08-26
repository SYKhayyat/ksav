set -u
LOG=/mnt/c/Users/Administrator/Videos/Nexus/shall-scratch/guix-probe.log
{
  echo "=== image entrypoint / guix presence ==="
  docker run --rm --entrypoint sh metacall/guix:latest -c 'command -v guix; guix --version 2>&1 | head -3; id'
  echo
  echo "=== can the daemon run, and can it install? ==="
  docker run --rm --entrypoint sh metacall/guix:latest -c '
    set -x
    guix-daemon --build-users-group=guixbuild --disable-chroot >/tmp/daemon.log 2>&1 &
    sleep 5
    guix install hello 2>&1 | tail -20
    ls -l /root/.guix-profile/bin/hello 2>&1
    hello 2>&1 | head -2 || /root/.guix-profile/bin/hello
  '
} > "$LOG" 2>&1
echo "GUIX_PROBE_RC=$?"
cat "$LOG"

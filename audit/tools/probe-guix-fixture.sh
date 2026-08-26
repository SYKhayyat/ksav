set -u
LOG=/mnt/c/Users/Administrator/Videos/Nexus/shall-scratch/guix-fixture.log
docker run --rm --security-opt seccomp=unconfined --entrypoint sh metacall/guix:latest -c '
  D=/var/guix/profiles/per-user/root/current-guix/bin/guix-daemon
  "$D" --disable-chroot --build-users-group=guixbuild >/dev/null 2>&1 &
  i=0; while [ $i -lt 30 ] && [ ! -S /var/guix/daemon-socket/socket ]; do i=$((i+1)); sleep 1; done
  timeout 900 guix install hello sed >/dev/null 2>&1
  echo "=== guix package -I, cat -A (exact bytes) ==="
  guix package -I | cat -A
  echo "=== guix package -I, raw ==="
  guix package -I
  echo "=== guix --version ==="
  guix --version | head -1
' > "$LOG" 2>&1
echo "FIXTURE_RC=$?"
cat "$LOG"

set -u
LOG=/mnt/c/Users/Administrator/Videos/Nexus/shall-scratch/guix-probe4.log
docker run --rm --security-opt seccomp=unconfined --entrypoint sh metacall/guix:latest -c '
  D=/var/guix/profiles/per-user/root/current-guix/bin/guix-daemon
  "$D" --disable-chroot --build-users-group=guixbuild >/tmp/daemon.log 2>&1 &
  i=0; while [ $i -lt 30 ] && [ ! -S /var/guix/daemon-socket/socket ]; do i=$((i+1)); sleep 1; done
  echo "--- guix install hello (seccomp unconfined):"
  timeout 900 guix install hello 2>&1 | tail -8
  echo "--- did it land?"
  ls -l /root/.guix-profile/bin/hello 2>&1 && /root/.guix-profile/bin/hello
  echo "--- guix package -I:"
  guix package -I 2>&1 | head -5
  echo "--- guix remove hello:"
  timeout 300 guix remove hello 2>&1 | tail -4
  ls -l /root/.guix-profile/bin/hello 2>&1 || echo "gone"
' > "$LOG" 2>&1
echo "GUIX4_RC=$?"
cat "$LOG"

set -u
LOG=/mnt/c/Users/Administrator/Videos/Nexus/shall-scratch/guix-probe3.log
docker run --rm --entrypoint sh metacall/guix:latest -c '
  D=$(ls -d /var/guix/profiles/per-user/root/current-guix/bin/guix-daemon 2>/dev/null \
      || find /gnu/store -maxdepth 3 -name guix-daemon -type f 2>/dev/null | head -1)
  echo "daemon at: ${D:-<not found>}"
  [ -n "$D" ] || exit 1
  "$D" --disable-chroot --build-users-group=guixbuild >/tmp/daemon.log 2>&1 &
  i=0; while [ $i -lt 30 ] && [ ! -S /var/guix/daemon-socket/socket ]; do i=$((i+1)); sleep 1; done
  echo "waited ${i}s; socket:"; ls -l /var/guix/daemon-socket/ 2>&1
  echo "--- daemon log:"; tail -5 /tmp/daemon.log
  echo "--- guix install hello:"
  timeout 600 guix install hello 2>&1 | tail -12
  echo "--- did it land?"
  ls -l /root/.guix-profile/bin/hello 2>&1 && /root/.guix-profile/bin/hello
  echo "--- guix package -I (list):"
  guix package -I 2>&1 | head -5
  echo "--- guix remove hello:"
  timeout 300 guix remove hello 2>&1 | tail -5
  ls -l /root/.guix-profile/bin/hello 2>&1
' > "$LOG" 2>&1
echo "GUIX3_RC=$?"
cat "$LOG"

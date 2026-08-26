set -u
LOG=/mnt/c/Users/Administrator/Videos/Nexus/shall-scratch/guix-probe2.log
docker run --rm --entrypoint sh metacall/guix:latest -c '
  set -x
  getent group guixbuild || echo "no guixbuild group"
  ls -ld /var/guix /gnu/store 2>&1 | head
  guix-daemon --disable-chroot --build-users-group=guixbuild >/tmp/daemon.log 2>&1 &
  i=0; while [ $i -lt 20 ] && [ ! -S /var/guix/daemon-socket/socket ]; do i=$((i+1)); sleep 1; done
  echo "--- daemon log:"; cat /tmp/daemon.log
  ls -l /var/guix/daemon-socket/ 2>&1
  echo "--- install:"
  guix install hello 2>&1 | tail -15
  ls -l /root/.guix-profile/bin/hello 2>&1
' > "$LOG" 2>&1
echo "GUIX2_RC=$?"
cat "$LOG"

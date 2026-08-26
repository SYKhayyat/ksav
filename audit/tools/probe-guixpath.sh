#!/bin/sh
# Where does `guix install` actually put a binary, and is that on PATH?
DAEMON=/var/guix/profiles/per-user/root/current-guix/bin/guix-daemon
"$DAEMON" --disable-chroot --build-users-group=guixbuild >/tmp/d.log 2>&1 &
i=0; while [ $i -lt 30 ] && [ ! -S /var/guix/daemon-socket/socket ]; do i=$((i+1)); sleep 1; done
echo "socket after ${i}s"

echo "=== PATH as the harness sees it ==="
echo "$PATH"

guix install hello >/tmp/i.log 2>&1; echo "install rc=$?"
tail -3 /tmp/i.log

echo "=== where did it land ==="
ls -l /root/.guix-profile/bin/hello 2>&1 | head -2
find /root -maxdepth 4 -name hello -type l -o -maxdepth 4 -name hello -type f 2>/dev/null | head -5

echo "=== command -v hello, before ==="
command -v hello || echo "NOT ON PATH"

echo "=== after adding the profile bin, as guix's own installer instructs ==="
PATH="/root/.guix-profile/bin:$PATH"; export PATH
command -v hello || echo "STILL NOT ON PATH"
hello 2>&1 | head -1

echo "=== what guix says to source ==="
ls -l /root/.guix-profile/etc/profile 2>&1 | head -2

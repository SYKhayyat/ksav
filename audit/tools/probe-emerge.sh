set -u
LOG=/mnt/c/Users/Administrator/Videos/Nexus/shall-scratch/emerge-probe.log
docker run --rm --entrypoint sh gentoo/stage3:latest -c '
  echo "=== is there a portage tree? ==="
  ls /var/db/repos/gentoo 2>&1 | head -5
  echo "ebuild count:"; ls /var/db/repos/gentoo/app-misc 2>/dev/null | wc -l
  echo "=== binhost config as shipped ==="
  grep -rn "binhost\|GENTOO_MIRRORS\|FEATURES" /etc/portage/make.conf 2>&1 | head
  ls /etc/portage/binrepos.conf* 2>&1 | head
  echo "=== can it resolve a binary package? ==="
  timeout 600 emerge --getbinpkg --usepkgonly --pretend app-misc/jq 2>&1 | tail -20
' > "$LOG" 2>&1
echo "EMERGE_PROBE_RC=$?"
cat "$LOG"

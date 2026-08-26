#!/bin/sh
# Who actually holds /var/lib/pacman/db.lck when an AUR helper is the one running?
#
# stale_lock.rs claims: "the process holding it is called `pacman` whichever of them started it".
# If that is false, `heal` sees a lock with no `pacman` process, calls it stale, and deletes a
# lock a LIVE yay/paru run is holding.
set -u

probe() {
    helper="$1"
    echo "=== $helper ==="
    : > /tmp/holder.$helper
    "$helper" -Sy --noconfirm > /tmp/$helper.out 2>&1 &
    bg=$!
    # Sample for as long as the helper is alive, not a fixed count: the first attempt used 200
    # iterations and finished before the lock was ever taken.
    while kill -0 $bg 2>/dev/null; do
        if [ -e /var/lib/pacman/db.lck ]; then
            ps -eo comm= >> /tmp/holder.$helper
            echo "--" >> /tmp/holder.$helper
        fi
    done
    wait $bg
    rc=$?
    echo "$helper exited $rc; last lines of its output:"
    tail -4 /tmp/$helper.out | sed 's/^/    /'
    if [ ! -s /tmp/holder.$helper ]; then
        echo "INCONCLUSIVE: never observed db.lck while $helper ran"
        return
    fi
    echo "samples while locked: $(grep -c '^--$' /tmp/holder.$helper)"
    echo "  pacman seen: $(grep -c '^pacman$' /tmp/holder.$helper)"
    echo "  $helper seen: $(grep -c "^$helper\$" /tmp/holder.$helper)"
    # The dangerous sample: locked, helper running, no pacman process anywhere.
    awk -v h="$helper" '
        /^--$/ { if (seen_h && !seen_p) bad++; seen_h = 0; seen_p = 0; next }
        $0 == "pacman" { seen_p = 1 }
        $0 == h { seen_h = 1 }
        END { print "  DANGEROUS (helper running, lock held, no pacman process): " bad + 0 }
    ' /tmp/holder.$helper
}

id
probe yay
probe paru

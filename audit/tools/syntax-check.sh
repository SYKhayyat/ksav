#!/bin/sh
cd /mnt/c/Users/Administrator/Videos/Nexus/linix || exit 1
rc=0
for f in docker/integration/run-in-container.sh scripts/integration-windows.sh docker/integration/run.sh scripts/release-check.sh scripts/unix-check.sh scripts/install.sh; do
    if sh -n "$f" 2>/tmp/synerr; then
        echo "OK     $f"
    else
        echo "SYNTAX $f"; cat /tmp/synerr; rc=1
    fi
done
exit $rc

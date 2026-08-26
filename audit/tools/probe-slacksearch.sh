#!/bin/sh
# `slackpkg search bc` finds bc-1.07.1-x86_64-5; `shall search bc` returns no slackpkg row.
# The first attempt used SHALL_LOG, which Shall does not read — it is RUST_LOG.
export SHALL_CONFIG_DIR=/tmp/c
shall init -y >/dev/null 2>&1

echo "=== everything the trace says about slackpkg during a search ==="
RUST_LOG=trace shall search bc 2>&1 | grep -i "slackpkg" | head -30

echo
echo "=== which backends the search fanned out to ==="
RUST_LOG=debug shall search bc 2>&1 | grep -i "Querying backend" | head -30

echo
echo "=== any error surfaced for slackpkg ==="
shall search bc 2>&1 | grep -iv "^[a-z]* " | head -10

echo
echo "=== and the install resolution ==="
RUST_LOG=trace shall install bc --dry-run 2>&1 | grep -i "slackpkg\|resolv\|candidate" | head -20

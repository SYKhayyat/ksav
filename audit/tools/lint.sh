#!/bin/sh
# CI's `Shell scripts` job, locally. The shellcheck-alpine image has no bash, so the globstar
# expansion CI does in bash is done here instead and the file list is passed in — same files,
# and printed so a shrinking list cannot pass quietly.
cd /mnt/c/Users/Administrator/Videos/Nexus/linix || exit 1

FILES=$(ls scripts/*.sh docker/*/*.sh docker/*.sh .githooks/* 2>/dev/null | sort -u | tr '\n' ' ')
echo "=== files ($(echo $FILES | wc -w)): $FILES"
echo "=== shellcheck -S warning ==="
docker run --rm -v "$PWD:/w" -w /w koalaman/shellcheck-alpine:stable \
  shellcheck -S warning $FILES
echo "shellcheck_rc=$?"

echo
echo "=== actionlint ==="
docker run --rm -v "$PWD:/w" -w /w rhysd/actionlint:latest -color
echo "actionlint_rc=$?"

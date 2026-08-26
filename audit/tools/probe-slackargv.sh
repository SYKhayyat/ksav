#!/bin/sh
# core/argv.rs marks slackpkg GETOPT, so Shall inserts a `--` terminator before the names.
# slackpkg is a shell script. Does it understand `--`?
echo "=== slackpkg search bc ==="
slackpkg search bc 2>&1 | grep -c -- "- bc-"

echo "=== slackpkg search -- bc  (what Shall sends) ==="
slackpkg search -- bc 2>&1 | head -8
echo "matching rows: $(slackpkg search -- bc 2>&1 | grep -c -- '- bc-')"

echo
echo "=== install: does the terminator break that too? ==="
echo "--- slackpkg -batch=on -default_answer=y install -- bc"
slackpkg -batch=on -default_answer=y install -- bc 2>&1 | tail -6
echo "is bc installed now? $(ls -1 /var/log/packages 2>/dev/null | grep -c '^bc-')"

echo
echo "--- and without the terminator"
slackpkg -batch=on -default_answer=y install bc 2>&1 | tail -6
echo "is bc installed now? $(ls -1 /var/log/packages 2>/dev/null | grep -c '^bc-')"

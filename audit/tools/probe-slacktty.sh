#!/bin/sh
# slackpkg is a shell script. Shall captures its stdout through a pipe; my hand-check read it
# on a TTY. If the two differ, that is the whole bug.
echo "=== on a TTY (well, whatever this is) — byte count ==="
slackpkg search bc > /tmp/a.out 2>&1; echo "rc=$? bytes=$(wc -c < /tmp/a.out)"

echo "=== through a pipe, which is what Shall does ==="
slackpkg search bc | cat > /tmp/b.out 2>&1; echo "bytes=$(wc -c < /tmp/b.out)"

echo "=== do they differ? ==="
if cmp -s /tmp/a.out /tmp/b.out; then echo "IDENTICAL"; else echo "DIFFERENT"; diff /tmp/a.out /tmp/b.out | head -20; fi

echo
echo "=== what the parser is actually handed: the bc line and its neighbours ==="
grep -n -- "-" /tmp/b.out | head -12

echo
echo "=== does slackpkg exit non-zero on search? ==="
slackpkg search bc >/dev/null 2>&1; echo "rc=$?"

echo
echo "=== and with the batch flags Shall uses for install ==="
slackpkg -batch=on -default_answer=y search bc 2>&1 | head -8

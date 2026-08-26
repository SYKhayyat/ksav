#!/bin/sh
echo hello > /tmp/t
echo "sh is: $(ls -l /bin/sh)"
echo "--- 1: tail -c 300 FILE";      tail -c 300 /tmp/t 2>&1
echo "--- 2: cat FILE | tail -c 300"; cat /tmp/t | tail -c 300 2>&1
echo "--- 3: tail -c 300 < FILE";     tail -c 300 < /tmp/t 2>&1
echo "--- 4: tr < FILE | tail -c 300"; tr '\n' ' ' < /tmp/t | tail -c 300 2>&1
echo "--- 5: /usr/bin/tail explicit"; tr '\n' ' ' < /tmp/t | /usr/bin/tail -c 300 2>&1
echo "--- 6: tail -c300 (no space)";  tr '\n' ' ' < /tmp/t | tail -c300 2>&1
echo "--- 7: type tail";             type tail 2>&1
echo "--- 8: is there a busybox?";    ls -l /usr/bin/tail; command -v busybox
echo "--- 9: POSIXLY_CORRECT?";       env | grep -i posix

#!/bin/sh
# Does removing the LAST `exec:` line run its `@undo=`? Two runs, one variable: whether a
# second declaration keeps the sync out of its converged early-return.
set -u
cd /c/Users/Administrator/Videos/Nexus/linix || exit 1
SHALL=./target/debug/shall.exe
export MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*'

probe() { # $1 = label, $2 = extra line to leave declared (may be empty)
  root='C:/Users/Administrator/AppData/Local/Temp/shall-exec-probe'
  export SHALL_CONFIG_DIR="$root/config" SHALL_DATA_DIR="$root/data"
  rm -rf "$root"; mkdir -p "$SHALL_CONFIG_DIR" "$SHALL_DATA_DIR"
  $SHALL init >/dev/null 2>&1 || { echo "init failed"; return 1; }
  MOD="$(ls "$SHALL_CONFIG_DIR"/modules/*.txt | head -1)"
  mkdir -p "$SHALL_CONFIG_DIR/bin"
  mark="$root/ran.txt"; undone="$root/undone.txt"
  printf '#!/bin/sh\necho ran > %s\n' "$mark" > "$SHALL_CONFIG_DIR/bin/canary.sh"
  printf '#!/bin/sh\necho undone > %s\n' "$undone" > "$root/undo.sh"
  chmod 0755 "$SHALL_CONFIG_DIR/bin/canary.sh" "$root/undo.sh"

  printf 'exec:./bin/canary.sh @runs=1,undo=%s\n' "$root/undo.sh" > "$MOD"
  [ -n "$2" ] && printf '%s\n' "$2" >> "$MOD"
  $SHALL lock >/dev/null 2>&1
  $SHALL -y sync >/dev/null 2>&1
  [ -f "$mark" ] && echo "  $1: the script ran" || { echo "  $1: SETUP FAILED — script never ran"; return 1; }

  # Remove ONLY the exec line; whatever `$2` is stays declared.
  if [ -n "$2" ]; then printf '%s\n' "$2" > "$MOD"; else : > "$MOD"; fi
  out="$($SHALL -y sync 2>&1)"; rc=$?
  printf '  %s: sync rc=%s said: %s\n' "$1" "$rc" "$(printf '%s' "$out" | tr '\n' '|' | cut -c1-90)"
  [ -f "$undone" ] && echo "  $1: UNDO RAN" || echo "  $1: UNDO DID NOT RUN"
}

echo "--- A: the exec: was the only declaration (converged early-return is taken)"
probe A ""
echo "--- B: a link: line stays declared, so the sync has non-package work"
LINKSRC='C:/Users/Administrator/AppData/Local/Temp/shall-exec-probe/src.txt'
mkdir -p 'C:/Users/Administrator/AppData/Local/Temp/shall-exec-probe' 2>/dev/null
printf 'hello\n' > "$LINKSRC" 2>/dev/null
probe B "link:$LINKSRC @target=C:/Users/Administrator/AppData/Local/Temp/shall-exec-probe/dst.txt"

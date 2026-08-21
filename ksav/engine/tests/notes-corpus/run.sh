#!/bin/sh
# Re-check every claim in NOTES-PLAN.md. Run from ksav/engine:
#     sh tests/notes-corpus/run.sh
#
# This prints the numbers the document cites. It does not assert — the point is to
# put the measurements in front of you, because every bug in this area compiled
# cleanly and was wrong on the page.
set -e
cd "$(dirname "$0")/../.." || exit 1
C="tests/notes-corpus"
probe()  { cargo run -q --example probe   -- "$C/$1.ksav" 2>&1; }
svg()    { cargo run -q --example svgdump -- "$C/$1.ksav" 2>&1; }
# NOTE: probe prints `y={:7.2}`, so y=1477.69 has NO space after `y=` while
# y=  78.79 has two. Splitting on whitespace and taking $2 therefore silently
# reads "x=" for any y >= 1000 — i.e. it under-reports exactly the catastrophic
# overflows this script exists to find. Extract the number, don't field-split.
maxy()   { probe "$1" | grep -o 'y=[ ]*[0-9.]*' | tr -d 'y= ' | sort -g | tail -1; }
pages()  { probe "$1" | grep -c "──────── page"; }
hdr()    { printf "\n\033[1m== %s ==\033[0m\n" "$1"; }

hdr "THE SHEET IS 841.89pt. The page number normally sits at y=799.02."

hdr "Parallel columns flow (flowtest)"
probe flowtest | awk '/page /{p=$3} /MAIN[0-9]+/{if(match($0,/MAIN[0-9]+/)) m[p]=m[p]" "substr($0,RSTART+4,RLENGTH-4)} /PERUSH[0-9]+/{if(match($0,/PERUSH[0-9]+/)) c[p]=c[p]" "substr($0,RSTART+6,RLENGTH-6)} END{for(i=1;i<=6;i++) if(m[i] c[i]) printf "  page %s\n    main:%s\n    comm:%s\n", i, m[i], c[i]}'

hdr "Rows give register (perdaf) — both columns must break at the same point"
probe perdaf | awk '/page /{p=$3} /R[0-9]c[0-9]+/{if(match($0,/R[0-9]c[0-9]+/)) r[p]=r[p]" "substr($0,RSTART,RLENGTH)} /G[0-9]m[0-9]+/{if(match($0,/G[0-9]m[0-9]+/)) g[p]=g[p]" "substr($0,RSTART,RLENGTH)} END{for(i=1;i<=3;i++) if(r[i]) printf "  page %s\n    rashi: %s\n    gemara:%s\n", i, r[i], g[i]}'

hdr "Rows are NOT bands (rows) — top row must finish before the bottom starts"
probe rows | awk '/page /{p=$3} /TOP[0-9]+/{if(match($0,/TOP[0-9]+/)) t[p]=t[p]" "substr($0,RSTART+3,RLENGTH-3)} /BOT[0-9]+/{if(match($0,/BOT[0-9]+/)) b[p]=b[p]" "substr($0,RSTART+3,RLENGTH-3)} END{for(i=1;i<=3;i++) if(t[i] b[i]) printf "  page %s\n    top:%s\n    bot:%s\n", i, t[i], b[i]}'

hdr "The Vilna wrap (vilna) — 3 columns, then 2, then full width"
probe vilna | head -18

hdr "Per-column independent numbering (asym) — left א–ה, right א–ב"
probe asym

hdr "Design A, pinned breaks (pinned) — run-in MB, pooled ShT, per page"
probe pinned | cut -c1-64
printf "  max y = %s   (nothing may exceed 799.02)\n" "$(maxy pinned)"

hdr "A nested band cannot split (spanning vs spanning_flat)"
printf "  spanning      (nested notes) max y = %s  pages = %s\n" "$(maxy spanning)" "$(pages spanning)"
printf "  spanning_flat (no nesting)   max y = %s  pages = %s\n" "$(maxy spanning_flat)" "$(pages spanning_flat)"

hdr "Design B, box under the footnotes (boxdesign) — two independent counts"
probe boxdesign | cut -c1-62

hdr "Boxes overflow at nine (boxover) — 20 notes, count the distinct y values"
printf "  distinct y positions: %s   max y = %s\n" "$(probe boxover | grep 'שער הציון' | awk '{print $2}' | sort -u | wc -l)" "$(maxy boxover)"

hdr "Side notes walk off the paper (dense)"
printf "  max y = %s\n" "$(maxy dense)"

hdr "hide() is a perfect spacer (pass_real vs pass_hide)"
for f in pass_real pass_hide; do
  printf "  %-10s " "$f"
  probe $f | awk '/page /{p=$3} /LN[0-9]+/{if(match($0,/LN[0-9]+/)) {n=substr($0,RSTART+2,RLENGTH-2); if(!s[p]++) printf "p%s→LN%s  ", p, n}} END{print ""}'
done

hdr "Character-level justification (n_base vs n_wide) — must differ"
printf "  n_base lines=%s   n_wide lines=%s\n" "$(probe n_base | grep -c '^y=')" "$(probe n_wide | grep -c '^y=')"

hdr "Rotation does not paginate (rot)"
printf "  pages = %s   max y = %s\n" "$(pages rot)" "$(maxy rot)"

hdr "Two tagged streams share one counter (twostream) — A must be 1,3,5"
probe twostream | grep -E "ALEF|BET" | cut -c1-58

hdr "DEAD KNOBS — identical output means the setting does nothing"
printf "  ריווח  gap  0em vs 6em : %s\n" "$([ "$(probe gap_0em | md5sum)" = "$(probe gap_6em | md5sum)" ] && echo 'DEAD' || echo live)"
printf "  סגנון  slant (svg)     : %s\n" "$([ "$(svg k_slant_a | md5sum)" = "$(svg k_slant_b | md5sum)" ] && echo 'DEAD' || echo live)"
printf "  צבע    colour (svg)    : %s   <- probe cannot see this; svgdump can\n" "$([ "$(svg k_col_a | md5sum)" = "$(svg k_col_b | md5sum)" ] && echo DEAD || echo 'live')"

hdr "Run-in is impossible in native footnotes (runin, runin2)"
probe runin  | tail -8 | cut -c1-46

hdr "Design C — A and B composed (compose, compose_long)"
probe compose | cut -c1-66
printf "  compose_long  max y = %s   (design A on the same content: 1477.69)\n" "$(maxy compose_long)"
printf "  spanning      max y = %s   <- design A, nested notes, off the sheet\n" "$(maxy spanning)"

hdr "Side notes break their paragraph (sn_p_none vs sn_p_note) — must match"
printf "  no notes : "; probe sn_p_none | awk '/בראשית|אלקים|מרחפת/{printf "%s ", $2}'; echo
printf "  two notes: "; probe sn_p_note | awk '/בראשית|אלקים|מרחפת/{printf "%s ", $2}'; echo
hdr "…because layout() is block-level (lay_none / lay_bare / lay_boxed)"
for f in lay_none lay_bare lay_boxed; do printf "  %-10s " "$f"; probe $f | awk '/בראשית|אלקים|מרחפת/{printf "%s ", $2}'; echo; done
printf "\ndone.\n"

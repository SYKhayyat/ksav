# Writing a kuntres in it

**2026-08-16**

`ksav/README.md`'s last open box, and it calls this the most important line on
the page: build the assembled application and *write a sefer in it*. The
previous hour of real use, on 7 August, found three bugs the whole suite was
green over.

So: `npm run build`, `cargo build --release --features embed-ui`, `ksav serve`,
and a browser. A kuntres on the sugya of lechem mishneh — three simanim, a
footnote, a source note, gershayim inside parentheses, a table, two apparatus
bands, an org import and a PDF.

## What the 7 August hour found, checked again

**A sefer numbered from the toolbar came out סימן א׳ three times.** Inserting
three simanim from the Insert menu now produces `#סימן[א׳]`, `#סימן[ב׳]`,
`#סימן[ג׳]`, and the page prints *סימן א׳ — דין נטילת ידים* and its two
successors. `numbering.ts` reads the series out of the document rather than
reproducing the registry's literal.

**The gershayim you press for רש״י produced Typst's raw `unclosed string`.**
Typed inside parentheses in a real sentence — *כתב הטור (עיין רש״י ברכות ל״ה.)
דצריך לברך* — it compiles in 14 ms with no diagnostic and prints as written.

**The Mekoros panel dropped the reference.** Not re-checked here: Girsa is not
running on this machine, and the six errands answer *the library is not open*,
which is the honest answer and not the bug. It stays checked at the seam
(`engine/tests/`), not from the pen.

## What the hour did work

Everything else on the list. Three simanim, a footnote from `Ctrl+Shift+F`, a
source note from the Insert menu — which drew the `info` mark on its line saying
it carries no `מקור:` and is therefore not in the index, exactly as
`sourcenote-lint.ts` promises — a two-column table from the table menu, and the
notes chooser's *fixed regions at the foot of the page*, which wrote
`#הגדרות_מדפים(גבהים: (1.5cm, 1cm))` at the top of the document and left the
caret in a note. The page came out with three stacked bands under one rule
each: the ordinary footnotes, then מדף א, then מדף ב.

An `.org` shiur imported into a **new** document rather than over the open one,
with its title, its headings and its footnote intact, and the kuntres still in
the open set beside it.

One thing worth recording because it is easy to mistake for a bug and is not:
choosing a note arrangement inserts a note *at the caret*, and the caret was in
a table header cell at the time, so the arrangement landed inside the table. One
`Ctrl+Z` took back both the note and the configuration line — one action, one
undo — which is the behaviour to want.

## And the bug it found

**The status bar said *rendering…* after the PDF had been written.**

`exportPdf` sets the status to *rendering…*, compiles, hands the file over, and
then says something **only if something was wrong** — a warning diagnostic, or a
healed bracket. On the ordinary path there is no ending at all. Measured at
eleven seconds after the file had landed in the downloads folder; it would have
stayed there until the next keystroke happened to trigger a compile.

Three routes are worse. Markdown, Org and plain text hand a file over and say
**nothing whatever**, so they leave standing whatever the last operation put
there — which, right after a PDF export, is *rendering…* about a PDF.

That is this repository's own family, in the smallest possible form: a working
engine, a file correctly written, and a surface describing work that finished.

## The fix, and why it is not seven fixes

There were seven `download(…)` call sites in `exports.ts` and two of them
remembered to say what they had done. Adding five more lines would have left the
eighth route to remember.

The announcement belongs to the act of handing a file over. `handOver(name,
blob)` downloads and says `Wrote <name>` — and `exports.test.mjs` now fails on
any route in that file that reaches for the bare `download`, which is the only
way a new export can go quiet again. A warning after it still wins, deliberately:
both sentences are true, and *a file went out, but read this first* is the more
useful of the two.

Mutated by pointing four routes back at `download`, which produced exactly three
red assertions naming the four lines and the three routes.

## Also verified from the pen

The pane places from earlier today, end to end in the assembled application: two
source panes on one kuntres, one standing on the title and one on the line about
lechem mishneh, switched to the imported shiur and back — and each pane came
back to its own line. That is the fix `paneplaces.ts` describes, seen the way a
writer would see it rather than the way a test does.

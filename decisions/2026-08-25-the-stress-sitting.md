# 2026-08-25 · The stress sitting

The 23 August audit was answered by fences written one mechanism at a time;
this sitting stacked them into whole documents and drove the result end to
end. Three product defects came out of it, two instruments were found broken
at birth, and the deferred footer-walk question was measured and closed.

## A writer's own `#מסמך(...)` wiped the scanned reserve

The worst of the three, and the quietest. The engine injects the scanner's
reserve through its own `#show: מסמך.with(…)` wrapper — but a writer who
opens their document with a `#מסמך(...)` call of their own re-runs the margin
setup with the parameter's default, which is *reserve nothing*. Every foot-band
entry printed in the bottom margin and the page number was pushed past the
edge of the sheet, on any document shaped exactly like the repository's own
test documents. The identical body without the wrapper laid out perfectly,
which is why no existing fence had ever met it: they all pass bare bodies.

Fixed by injecting the scanned value *into the writer's own call* when it
does not name one — the same surgery `grow_inline_reserve` performs on an
inline number, for the same reason: a nested call cannot inherit, because its
own margin arithmetic needs the value. An explicit writer value is untouched.
Fenced twice: once focused in `placements.rs`, once inside the standing
stress sefer.

## `"refuse"` saw the configured reserve and not the inline one

The too-small switch's refusal read only `DocConfig.notes_region_cm`, so a
document that fixed its reserve inline — `#מסמך(אזור_הערות: 1cm)` — under
regions asking for six lines compiled and flowed under `"refuse"`: silently
doing what the writer asked it never to do. The refusal now reads the inline
declaration when no configured one exists (`inline_reserve_cm` extracted from
the grow path so both policies answer the same question). Fenced in
`placements.rs`.

## The footer walk measured, then cut

The deferred remainder of E4/E5 asked for numbers first, and got them:
a document of forty pages carrying four notes each into a fixed foot band
spent **2.14 s compiling, of which 89 ms was the pages themselves** — the
apparatus cost twenty-four times the layout it served, doubling worse than
quadratically across ten, twenty and forty pages. The trace said why: one
whole-document assignment walk per page's footer evaluation, each measuring
every entry afresh (41 walks × 160 entries).

Built: `_ap_on_page` truncates its input to entries anchored at or before the
page it is asked about. The walk never places a note earlier than its anchor,
so the suffix cannot change the answer — no memory, no state tricks, no new
semantics. After: **699 ms**, a 3.1× cut, with every apparatus fence green.

Refused: caching assignment results across footer evaluations. That wants
either function memoisation Typst does not offer or a state-cache whose last
two implementations disabled overflow moves silently; the record that
deferred the work exists precisely so this refusal is a decision. The
remaining cost is noted honestly: superlinear still, ~16× base layout at
forty pages, and worth revisiting if Typst grows memoised calls.

## The instruments themselves

`bench-scaling` — built to replace prose numbers with a re-runnable
instrument — had never once executed. Its endnote case put a space between
the note's arguments and its body bracket, which Typst reads as separate
markup, so the case refused with "missing argument: body" and `timed()`
printed pages=0 where the audit recorded 225 ms. The same file paginated its
foot-band case with `#עמוד_חדש`, which is a parameter name and not a command;
the command is `#מעבר_עמוד`. Both fixed; both cases
now compile and answer. Committed in the same chunk as the hot paths it
instrumented, unrun — the trunk wave's disease, one more instance.

## What stays

`tests/stress_sitting.rs` joins the suite: the mixed eight-siman sefer (two
channels over a fixed band plus native footnotes plus a margin channel, names
and referrals and one name deliberately duplicated, a numbering restart, a
300-word note spilling under the tripwire, a channel named with a quoted
parenthesis), the margin document (both wrappers dense, carries landing
across pinned glosses), and the three reserve policies against an inline
over-ask. Each assertion binds the *combination* — nothing below the page's
own folio line, whatever geometry puts it there; no lost words; no reference
mark without an entry; a pin that carries never overprint.

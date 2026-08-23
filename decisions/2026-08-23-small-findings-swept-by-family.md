# 2026-08-23 · Small findings, swept by family

The audit's minor findings from the spell checker, the inbox, the services
seam, and the prelude's smaller wrong answers — each fixed where it lives, with
the sibling it implied.

## The spell checker

**A closing curly quote joined the Hebrew word it closed.** `GERESH_FORMS`
includes U+2018/U+2019 because pasted text genuinely uses them as geresh — so
`'אמת'` glued its closing mark on, and a correct word was flagged. The geresh
arm of `joins` now has what the gershayim arm always had: a lookahead. Curly
forms join only mid-word (the English side's own apostrophe rule); the
canonical spellings a Hebrew keyboard types keep joining at the end of the
word, because that is where an abbreviation geresh lives and the lexicon stores
it there. Trade-off stated plainly: a curly-pasted `תוס'` now reads as תוס,
and a false negative on an abbreviation is the accepted direction here.

**The Hebrew-year exemption swallowed the citation apparatus.** It allowed any
3–5 letter ש/ת-initial gershayim word, so שו"ס was never checked. A year's
thousands glyph is ת, always; and the gershayim sits one letter from the end.
Both bounds now hold, which keeps every year exempt and returns שו"ס, שב"ס and
their siblings to the checker.

**`sh'ma`, the docstring's own motivating example, was flagged** — its stem is
two letters, below the prefix machinery's floor, and the floor is right. Listed
whole in the English supplement instead: the docstring naming one word is the
sign of a closed set to enumerate, not a bound to loosen.

**A malformed `/spell` request answered a clean bill** — unparseable JSON read
as empty text and reported zero misspellings while `/mekoros` refused loudly.
It refuses now, in the shape `services.rs` answers refusals with.

## The Girsa seam

**`saved-here` collapsed every outcome into `{"told": false}`.** Still not an
error — a save must never fail because the library is closed — but `why`
travels now, so *closed* reads differently from *heard and declined*.

**The inbox handover was three critical sections**, and two concurrent polls
each walked the same handed-out list: the same source offered twice, and an
acknowledged arrival passing through a moment in neither list. One section now
holds both locks across the whole handover.

**Every poll rewrote the inbox file byte-for-byte.** `remember` skips an
unchanged body now; disk churn on a timer for an answer already on it was not a
write anyone asked for.

## The prelude

**A footnote fallback printed two markers from two unrelated series** — ours
in the entry beside Typst's own number for it. The fallback passes no mark;
Typst's series numbers that entry alone.

**Declared-height regions vanished from pages with no assigned entries**, be-
cause the whole footer block sat inside `mine.len() > 0`. Fixed geometry does
not wait for content: a page with nothing assigned still draws the regions
whose `שומר_מקום` says hold — computed through `_sf_holds`, one function for
both places that ask, since the channel-fallback rule had just grown a second
copy otherwise.

**`גרשיים: "none"` silently meant marks-on**: the mode was compared against a
Hebrew set the English spelling never joined. The modes are in `_en_values`
now, and both consumers (`מסמך`'s validation and `_hb_num`) canonicalise before
comparing or refusing.

**A row plan's `יישור` reached Typst's `align()` as a string** and stopped the
compile; it goes through `_doc_align` like every other written alignment.

**The overflow refusal advised `אזור_הערות` to a band above the text**, where
that knob changes nothing; the advice follows the region's placement now.

## The engine

**Unknown paper names got A4's height for `%` reserve arithmetic**, desyncing
the scan from the prelude's real sheet by exactly the ratio of the guess.
Papers this side knows answer their height (the ISO B sizes most likely typed
joined the table); an unknown name answers `None`, and a `%` height against no
known sheet counts as undeclared — the working default, which keeps everything
on the page — rather than resolved against a fiction.

**`dir` was the one config string never sanitised**: `"RTL"` reached the
prelude whole and silently meant whatever the reader's default was. Two tags,
either case; anything else is dropped where it arrives, matching how
`text_align` is handled one key over.

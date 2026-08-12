# Nothing ever asked what language the interface was

*12 August 2026*

The report, in the writer's own words, at the end of a run of four escalating
comments on one document: *"Wait! now, everything is coming in in Hebrew. I
don't know why. this is puzzling."*

The 11 August markup put this down to a missing field: every command in
`facts.gen.json` carries `he`, `en`, `desc_he`, `desc_en` and exactly one
`insert`, so the reasoning went that the interface language was honoured
everywhere except in the text it wrote. That reasoning was wrong, and worth
recording as wrong, because it named a cause that had already been fixed.
`mode.ts` has held a `translated()` since 9 August; `insertionAt` calls it on
the document's language, and every insertion goes through `insertionAt`.

Almost every insertion.

## Four faults, one symptom

**One. Notes never went through it.** `plan` answers *this snippet is a note*
before it calls `insertionAt`, because a note is a layout rather than a string —
it may need a wrapper around the section, a configuration line at the top and a
dump call at the end of the file, and its body may not be going in at the caret
at all. That branch returns early, and everything downstream of it — the marker,
the scaffolding, the presence checks that decide whether the scaffolding is
already there — wrote the chooser's Hebrew literals. Notes are the largest
command family in this application, which is why the writer met this first.

The presence check deserves its own sentence: `hasLine` asked whether the
document contained `#הערות_בסוף`, so an English document already holding
`#endnotes()` answered no and got a second dump call in the other language. Two
apparatus footers, one document, the notes printed twice.

**Two. Three commands are written without a `#`.** `פריט`, `תא` and
`כותרת_תא` — the list item, the table cell and the header cell — are bare names,
because they are written inside an argument list. `scan` reads a bare name in a
bare snippet as prose, quite correctly, so nothing translated them. Those are
three of the most-pressed buttons in the application.

**Three. The prose rule was a ratchet.** `docLang`'s third tier read

```ts
/\p{Script=Hebrew}/u.test(doc) ? "he" : "en"
```

— *any* Hebrew letter anywhere made the whole document Hebrew. An English sefer
quotes Hebrew: a posuk, a tractate name, a word in a translation. One such word
flipped every later insertion to Hebrew, which put more Hebrew in the document,
which made the next test even less likely to come out the other way. Nothing was
intermittent and nothing was puzzling; it was a one-way test on a document that
is bilingual by nature, and the writer felt it as the application changing its
mind for no reason.

It counts now. A page of English with a posuk in it is English, and stays
English as it grows. Hebrew wins a tie, which matters only for the handful of
documents that are exactly half.

**Four, and the largest: the interface was never in English at all.**
`setLang` was called from exactly one place in the application —
`setSetting("lang", …)`, which is the chip — and **nothing ever handed it what
was stored**. So the interface booted Hebrew every time, however many times the
writer had chosen English, and only pressing the chip put it right, for that
session.

That is what the help panel's Hebrew title was really about. The 11 August
markup noted that `helpTitle` is in both dictionaries and concluded that *the
lookup or the surface is at fault*, which was the right instinct pointed at the
wrong half. The interface was not English-with-one-Hebrew-string; it was Hebrew.

## The second half of the fourth

Pressing the chip does not fix it either, and this is the part that generalises.
`rerenderChrome` rebuilds the header and the settings drawer. Every other
surface — the help panel, the styles panel, the review panel, the notes chooser,
the outline and notes drawers, the palette's placeholder, the version-history
modal — is built **once**, at boot, and keeps the language it was born in.

The mechanism to fix that was already there. `rerenderChrome` has swept for
`[data-i18n]` for as long as anyone can remember, and **nothing in `src/`
produced one**. A loop over an empty list, run on every language change,
reporting success.

So `panelHead` takes an i18n *key* rather than a translated string, and marks
what it builds; `localise()` in `panels.ts` says every marked label again, in
four kinds — text, tooltip, accessible name, placeholder, because a label is not
always text and all four were as stuck as the headings were. A title that is
genuinely not a key — a section's own name in the page-setup modal — is passed
as `{ text }` and left alone.

This also answers, without being aimed at it, the 11 August finding that *the
history modal is in Hebrew regardless of interface language*.

## What the templates stopped shipping

A slot the writer has to fill now arrives **empty**. Four commands used to
arrive pre-filled: `#רשימת_הגדרות` as `הגדרה[מונח][]`, `#גמרא` as
`[ברכות][ב.]`, `#פסוק` as `[מקור][]` and `#עם_פירוש` as `([], [הפירוש])`. Those
put the words *term*, *Berachos*, *2a* and *the commentary* into the document
looking exactly like text the writer had typed, so they either shipped them or
deleted them by hand, and the sample taught nothing either way.

A **default** is a different thing and stays: `#הערות_בסוף(כותרת: [הערות])`
titles a block that needs a title, and `#סימן[א׳]` starts a series the numbering
commands continue from. Neither is standing in for something. Defaults are
translated — an English command titling its block in Hebrew was the visible half
of the same complaint — through a table of the words the templates ship as
content, applied to whole values only, and never to the writer's own text, which
`plan` splices in after translation.

## One question, one answer

`main.ts` had a second `docLang()` that read the page direction and nothing
else, while `mode.docLang` — the one the insertion path consults — reads what
the document is written in. Two answers to one question, disagreeing on any
document whose direction and content point different ways, each authoritative
over a different set of surfaces.

There is one now, and the direction has the job it is actually good for: saying
what a document that has said *nothing yet* is going to be. That is not a corner
case. A blank left-to-right document took a Hebrew first command, and the next
insertion then found one Hebrew command and no English ones — which is a
majority, and the ratchet again, started on an empty page.

## What is still owed

Three kinds of value stay Hebrew in an English document, and they are listed by
hand in `app/test/language.test.mjs` rather than waved past by a pattern:

- **Numbering schemes.** `מספור: "א"` says *number these with Hebrew letters*,
  which an English work on Hebrew sources does as often as not. A typographic
  choice, not a language.
- **The sample ordinal** on `#סימן` and `#סעיף`, for the same reason.
- **`פריסה: "צד"` and `תצוגה: "סופי"`.** These are enum values the prelude
  compares against Hebrew literals and nothing else, so an English spelling
  would be a document that does not compile. The engine accepts English
  parameter *names* and not English parameter *values*; that is the engine's
  half of this finding and it is not fixed here. It is on the list because the
  list is the count.

## The fence

`app/test/language.test.mjs` walks the registry and the note chooser rather than
a handful of examples, because the defect was never in one command: no template
and no note layout may write Hebrew into an English document except through the
list above, and no template may ship placeholder content in a positional slot.
`app/test/panels.test.mjs` builds a panel head, changes the language and reads
it back. The engine's own `insertion` fence compiles every regenerated insertion
in the language it is offered in.

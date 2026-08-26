# 2026-08-25 · Spill defaults, a tripwire, and a name that says so

Two engine chunks of 24 August, both about silence: an outgrowing region that
said nothing while it spent near-blank leaves, and a duplicated note name that
answered every reference with the wrong note and no word about it.

## Spill defaults and the tripwire (`508115e`)

What an undeclared fixed region does when its notes outgrow it is now a
document-level default: `בררת_גלישה` on `#מסמך`, read through the same
validated reader the regions use, so a misspelled move is refused with the
vocabulary named. A region's own `גלישה`, or its channel's, still wins over
the default; the default only fills the `auto` the writer left.

Beside it, `אזהרת_גלישה`: once that many continuation leaves have passed,
each further leaf carries a small grey notice naming the region and which
leaf it is — visible, above the folio, rather than pages of near-blank paper
in silence. Unset means silent, as before.

Fenced three ways in `placements.rs`: the notice appears past its threshold
and prints nowhere below the folio; a document that asked for quiet gets
quiet; an explicit regional `גלישה` composes with a document default without
breaking. The stray `check-spans.mjs` probe script went with this chunk.

## A duplicated note name says so at the reference (`7b9632d`)

`#הפניה_להערה("x")` used to answer silently with the first note named x —
the same mistake as a dangling reference wearing a quieter coat. Two notes of
one name now print red at the reference (`שם כפול`) while still answering
with the first number, so nothing is lost by saying so. Fenced in
`notes_acceptance.rs`.

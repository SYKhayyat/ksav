# 2026-08-20 · A style is an action, and notes share one look

Three reports, and the handoff is right that they are one complaint pointed at
different objects — so they are built on one mechanism, as it asked.

## #29 · Editing a style, from where you see it

> *"There is one edit-styles button that opens an editor for every style at
> once. Each style should have its own edit affordance, the way Word does."*

The styles panel is that one button. What was missing underneath it is that
**the writer's own styles were on no surface at all** except the ribbon
dropdown, where a style could be applied and never inspected: the pencil beside
the dropdown edits *what the caret is standing in*, so reaching a style's
formatting meant applying it to something first. There was nowhere for a
per-style affordance to live, which is why nobody had added one.

So the panel has a **My styles** section, first, with a row per style: its name,
its chord, and its own pencil.

### The chord, and why a style is an *action*

> *"Each style should be assignable a key combination, and that binding must
> appear wherever the style appears and in the shortcut list."*

`actions()` is what makes something bindable in this application. Everything
downstream — the palette, the keys drawer, the chord printed beside a menu row,
the vim `:name` and Emacs `M-x name` spellings — reads from that one list, and
saved macros are already in it for exactly this reason. So a custom style
becomes an action, `style.<name>`, and every one of those surfaces gets it for
free.

A styles-only binding table would have been a second answer to a question this
application already answers once, and it would have been the one that went
stale. The prefix is load-bearing: a writer may name a style `bold`, and an
unprefixed id would have quietly taken over the action that exists.

Per *document*, because a style is — so the keymap is reconfigured whenever the
set of names changes, which is the same moment the dropdown is refilled. Without
that, a style defined a keystroke ago is in the dropdown, in the palette and in
the keys drawer, and its chord does nothing.

### The knobs

> *"The knobs are too coarse."*

Size was a dropdown of seven percentages, so 105% was unsayable — and the
**unit** was not a question the control asked at all. It is a typed number with
a `%`/`pt` chooser now. Those are different questions: `em` is a proportion of
whatever the text sits inside, which is what a style used in a heading *and* in
a footnote needs; `pt` is a measurement, which is what a title set to exactly
24pt means. Switching the unit keeps the number rather than converting, the same
rule `regionHeightControl` follows.

Font is a knob now — a datalist, so the fonts on this machine are offered and a
family this machine has never heard of is still typable, which a sefer typeset
here and printed elsewhere needs.

### The level ceiling, which was a leak

> *"Find out what the apparent 'level 6' ceiling actually is."*

Both, in a way that is worth writing down. `MAX_LEVEL` is 9 and has been:
`#כותרת(רמה: 9)` writes, the outline knows it, the numbering knows it, and the
engine's own indent ramp draws levels 7–9 differently on the page. What was six
is `MAX_NAMED_LEVEL` — the count of *named* commands, `#כותרת1`…`#כותרת6` — and
it had leaked into the styling: `_hd_levels = 6`, six `#הגדרות_כותרתN` doors, and
a panel dropdown offering six rows. So levels 7, 8 and 9 were real everywhere
except where you could style them, and `_cfg_pick` handed them level 6's values.

Lifted, on both sides: `_hd_levels` is `MAX_LEVEL`, there are doors for 7, 8 and
9, and the panel counts its rows off `MAX_LEVEL` rather than off a literal. The
shipped ramps are still six entries long and `_hd_set` grows them by repeating
the last, so nothing on any existing page moves.

## #34 · One look for every note

> *"Footnotes and endnotes should share a default style, and either should be
> easy to change on its own."*

Both halves were true and the second was worse than reported. Footnotes had a
full set of knobs. **Endnotes had none at all** — `#הגדרות_הערות_סיום` carried a
numbering scheme and nothing else, and the section at the back was set in the
body face at the body size with no way to say otherwise. "Change either on its
own" was not a UI gap for one of the two; there was nothing to change.

There are **six** note apparatuses, not two: the page-foot footnotes, the
endnote section, the stacked section bands, the per-page bands, the parallel
streams and the side column. Each shipped its own size, slant, colour and gap,
so *"make the notes a little smaller"* was six edits and the two apparatuses a
sefer most often has looked different from each other by default.

`#הגדרות_טקסט_הערות` is the layer all six fall back to. The rule that makes
"shared, and still changeable" mean something is that **a knob the writer set on
the apparatus wins, and one they did not is answered by the shared layer** —
which requires knowing what the writer set, since a shipped default and a chosen
value are the same thing in a dictionary. Each `#הגדרות_*` records the keys it
was given, under `_מפורש`, and `_nt_under` reads that. Without it the shared
layer would be either always or never in force.

And it is **visible**: an apparatus overruling the shared style says so, by knob
name. Otherwise the shared control appears to do nothing for that apparatus and
nothing on the screen says why — which is this repository's whole failure mode
in miniature.

## #37 · The word above the section

The heading over the endnote section is the writer's own word, or none at all.
`none` leaves no gap, because the heading and the space around it are inside one
condition. It is a **document** property — `#הגדרות_הערות_סיום(כותרת: …)`, with a
per-call override — so it travels with the sefer, and a sefer written in English
says its own word in English because the *document* has a language, not the
render.

## What is deliberately not here

`INSTANCE_FIELDS` has no entry for the shared note style or for the endnote
section, and that is the point rather than an omission: neither has a *this
one*. A shared default six apparatuses fall back to has no single element, and
"this endnote is lettered while its neighbours are numbered" is not a style, it
is two streams — which `#הערתסיום(זרם: …)` already says.

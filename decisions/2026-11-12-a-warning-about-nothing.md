# A warning about nothing — #176

**2026-11-12.** The fix for #176: *"templates open with 'no italic face'"*. The
record is the *reasoning*; the mechanism is `first_italic` and `italic_warning`
in `engine/src/lib.rs`. The fences are
`engine/tests/templates.rs:every_bundled_template_opens_without_a_warning` and
`engine/tests/english_commands.rs:every_mark_that_ships_a_slant_slants_without_saying_it_cannot`.

## What the issue said, and what measuring found

The issue reported that seven of the twelve bundled templates opened with a
warning in the status strip before the writer had typed anything. Counting the
templates that open with a diagnostic found **ten of the twelve**, and every one
of them said the same kind of thing: *"לגופן Frank Ruhl אין גרסה נטויה, ולכן
#מקור משאיר את הטקסט זקוף"* — Frank Ruhl has no italic face, so `#מקור` leaves
the text upright.

The text was not upright. It was sheared into a synthetic oblique by `_ks_style`
→ `_ks_skew` in `ksav.typ`, which is the same path `#נטוי` takes, and
`notes_acceptance::a_marks_shipped_slant_reaches_the_page` measures that it
prints. The warning was a sentence about a defect that had been fixed, left in
place because nothing compared it to the thing it was about.

## How it got there, in three steps

1. **The slant was invisible.** `#נטוי` was Typst's `emph`, and `emph` is a
   *request* for an italic face. None of the six bundled faces is italic, so
   Typst returned the upright face and said nothing. `#גמרא`, `#פסוק`,
   `#ציון_מקור` and `#מקור` shipped `סגנון: "italic"` and never once printed a
   slant — see `decisions/2026-08-16-green-here-red-there.md` §2, which found
   that by counting quotation marks in the marks table and moved the warning onto
   those four commands. **That was right on its date.**
2. **The slant was drawn instead.** `_ks_style`/`_ks_skew` arrived: the frame is
   sheared around each word, in paper output only, with `emph` left inside so a
   family that does carry a real italic still uses it. `#נטוי` stopped warning.
3. **Nobody moved the warning.** The four marks were served too — `_mk_render`
   routes `סגנון` through `_ks_style` — and `italic_warning` went on naming them,
   because its trigger was *"a command that asks for a slant"* read off the
   prelude rather than *"a request that came back upright"*.

The prelude had already written down the correct reading of its own file, in the
comment above `_ks_skew`: *"The fence is `slanting_commands()` in `lib.rs`,
inverted: it used to find the commands whose slant would go missing … and it now
has to come back **empty**, because a `text(style:)` left anywhere in this file
is a slant that goes missing again."* Two files recorded two different answers
and neither test compared them.

## The fence that was not one

`every_command_that_asks_for_a_slant_says_it_did_not_get_one` was written to hold
the *19 August* rule — every mark that asks for a slant must warn — and it read
its list of commands off `ksav.typ`, which is the right instinct. But it asserted
the same belief the code held, so when the code stopped being right the test kept
agreeing with it. A sweep derived from the same premise as the code it fences is
a copy of the code, not a check on it. The suite was green, and ten templates
opened red.

The replacement keeps the derivation and inverts the claim: every command whose
row carries `סגנון: "italic"` must **slant and be silent**. The slant is measured
where it is observable (`notes_acceptance`, run positions), and silence is
measured here. `templates.rs` holds the same rule from the writer's side: **no
bundled template may open with any warning at all** — the count of templates is
the count of the loop, so a template added tomorrow is covered.

## The decision

**The warning is about a request to Typst itself, and about nothing else.**

A prelude command that asks for a slant is a command this repository serves; a
diagnostic that tells the writer to fix it is asking them to repair a button they
did not press. What is left is the two spellings that reach straight past the
prelude and into the font book:

- `#emph[…]` — Typst's own emphasis, which the prelude deliberately leaves alone
  so a real italic face is used where a family has one;
- `#text(style: "italic")[…]` — written out by hand, usually pasted from a Typst
  snippet.

Both still come back upright in every bundled family, both are rare enough that
the sentence means something when it appears, and both are found through Typst's
own parse rather than a search for a word, so a font named `"italic"` is not a
request (the rule `spans.ts` states on the other side of the seam).

The message offers `#נטוי`, which does work in any font, in both scripts, on
paper and in HTML — a command the writer can actually reach.

## What this costs

A family with a real italic and a `#emph` over it now warns if the *document's*
font has none and the attached asset does; that case is unchanged from before and
is still answered from the font book rather than from a note about the default
family (`an_attached_font_with_an_italic_face_is_believed`).

A writer who types `#נטוי` and sees the shear gets no diagnostic, and the shear
is the answer — `decisions/2026-08-16-a-look-of-its-own.md` argues why a drawn
slant is the right answer for a script with no italic in any family.

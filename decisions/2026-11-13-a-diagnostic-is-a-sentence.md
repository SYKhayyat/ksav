# A diagnostic is a sentence, and the status bar is one line — #124

**2026-11-13.** Compile errors were drawn into the status bar: a 32px strip with
`overflow: hidden` and an ellipsis. The message that made this a bug was 1,215px
of text in a 957px slot, so the writer got the first two thirds of the reason
their sefer would not compile — at the moment they needed all of it. UAT item 11
reported it as *"the preview covers the message"*.

Diagnostics have their own region now: `#diagnostics`, above the status bar and
**in the layout** rather than over it, wrapping and scrolling, with the whole
message instead of the strip form.

## What was wrong, stated properly

The report named the symptom (the preview covers it) and the diagnosis is one
level up: **the strip was never the right owner.** The status bar is chrome for
one-word facts — "ready", "rendering…", "3 pages" — and it is the one place in
the window that cannot grow. A compiler message is a sentence with a location, an
action and a length nobody controls. Two facts in one element means one of them
loses, and the one that lost was the one that mattered.

Underneath that were three smaller defects of the same shape, all fixed here:

- `said` was `where + shorten(message)` — capped at 200 characters, with a `…`.
  The cap existed because the strip could not hold more. The `Shown` value now
  carries both: `said` (still capped, still the dismissal key and the identity)
  and `detail` (the whole message, whitespace collapsed onto one line, because a
  compiler's own eighty-column wrapping is not the writer's).
- The dismiss button said `aria-label="dismiss"` in a Hebrew interface, in
  English, untranslated — the #178 rule ("a control is named, or it is not a
  control") applied to a control that already had a name, in the wrong language.
  It reads `t("dismiss")` now, with `data-i18n-label` so the language switch
  renames it.
- Warnings and errors were the same red. A warning is the same story told
  quieter, and it is the only one the writer may wave away — so the two rows say
  which they are (`data-severity`), and only the warning's carries the ×.

## Why in the layout and not over it

An overlay would have been the obvious repair, and it is the worse one. The claim
to satisfy is "the message cannot be obscured by the preview"; **the only surface
that cannot be covered is one that is not overlapped.** So the region takes the
space it needs, the panes get the rest, and the geometry is right by construction
rather than by choosing a `z-index` larger than every pane's and hoping.

The cost is honest and visible: with a long message up, the document area is
shorter. That is the right way round — the writer has a document that does not
compile, and the reason is more important than four more lines of preview.
`.diagnostics:empty` hides the region, and `drawDiagnostics` empties it when there
is nothing to say, so the space comes back the moment the error is fixed. There is
no separate "shown" flag to drift: an empty region and a never-populated one are
the same thing.

## The fence

`acceptance.mjs` step 19 types an error into a real window and holds five
properties, none of which the old arrangement had:

1. **nothing is clipped or truncated** — `scrollWidth <= clientWidth` for every
   row, and no `…` anywhere in the region's text (the strip form is capped at 200
   characters; the message is longer than that);
2. **no pane overlaps the region**, and `elementFromPoint` at its centre is
   inside it — which an overlay repair would fail, because an overlay *is* an
   overlap;
3. **clicking goes to the line it names** — measured by moving the caret to the
   top first and reading `.cm-line` back, since a "navigation" from a caret that
   is already there is indistinguishable from a button that does nothing;
4. **the message survives the click**, because the writer needs to read the
   reason *after* the navigation;
5. **the region is not inside the status bar, and the bar stays one line** —
   verified red by putting the region back: the bar measured 86px and the first
   of the two failed.

Plus `diagview.test.mjs` on the value itself: `said` is capped and marked as cut,
`detail` is neither, both carry the location, and neither invents one.

One thing worth recording about the verification: with the *CSS* fix alone (the
region still inside the status bar) nothing was clipped — the bar simply grew to
86px. Readability was bought by wrapping; the *arrangement* is what keeps the
status bar chrome and keeps panes from being able to overlap the message. The two
claims needed two checks, and only the second one is about where the element
lives.

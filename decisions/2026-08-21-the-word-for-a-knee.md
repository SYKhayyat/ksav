# 2026-08-21 · The word for a knee

`NOTES-PLAN` calls it *"L-shape"* and *"the Vilna wrap"*. Both are borrowed from
English tooling — the first from CSS and frame-layout systems, the second from
describing a daf to somebody who has not seen one.

The trade has a word. **ברך** — a knee — is the step where a frame indents around
its neighbour, and **ברכיים** for several of them down a page. It is what a
Hebrew typesetter calls the thing, and the command built tonight is named for it.

## Why this is worth a record rather than a commit message

Decision 14 says the naming is Shaul's and *"whoever builds it asks before
inventing them."* This one was not invented — it was **found**, which is a
different case and arguably a stronger one: the shape already had a name in the
craft this application is for, and the plan used two English descriptions of it
instead.

That is the same failure as `#מדף_ב` being *"tier two at the foot of the page"*
wearing a command's clothes: a borrowed vocabulary makes a writer translate their
own work into somebody else's terms before they can ask for it.

## What it is called now

| | |
|---|---|
| `#ברך(טקסט, שכן, רוחב:, גובה:, מרווח:, תפר:)` | one knee |
| `knee` | the English spelling, through `_en` |

`ברכיים` is not a command. Several knees are several `#ברך` calls, or rows of a
grid region — which is what `vilna.ksav` draws by hand and what the region is
growing into.

## The one still open

`פריסה` is contested in the naming record: on a region it means how the channels
inside it sit, and thing three wanted it for grid-versus-box. That turned out not
to need a word at all — a region whose channels sit side by side **is** the
parallel-column arrangement — so the contest is off. But the record still carries
the row saying `פריסה` is taken and `סוג` was rejected for vagueness, and that
row is now describing a question nobody is asking.

Worth a look when the naming is reviewed, along with `קובץ` versus `כרך` for a
companion volume, which is the one I would still change.

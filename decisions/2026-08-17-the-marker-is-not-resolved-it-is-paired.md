# The marker is not resolved, it is paired

**17 August 2026.** The notes drawer now shows the marker the page actually
printed. What this record is for is the part that was wrong before a line was
written: the design the handoff carried, and why the layout could not answer the
question it was asked.

## The item, as it stood

`HANDOFF.md` had this open, and it was explicit about the shape:

> The right shape is a `Wants` flag and a walk over the laid-out frames — every
> glyph carries the `Span` of the source it came from, which is what
> `pagelines.rs` already leans on — so the response can carry (marker, source
> offset) pairs and the drawer's number becomes *the* number by construction.

Half of that is right and it is the half that matters: the flag, the walk, the
pairs, and the reason — that reproducing a numbering scheme in TypeScript is a
second implementation of numbering the engine already owns, which is the one
thing this codebase is named after not doing.

The other half is the mechanism, and it does not work.

## What was measured

A throwaway module dumped every laid-out text run for six documents — native
footnotes, a stream with a scheme of its own, a nested note, an empty body,
endnotes, and a deferred body — with each glyph's span resolved against the
writer's text. The relevant lines, for the stream:

```text
group
  <super> TEXT "א"        at=[-]
  TEXT " ראשונה"          at=[85]
```

**Every marker run in every arrangement resolved to nothing.** A marker is
generated: `super(numbering(scheme, n))`, evaluated inside the prelude, so its
span points at `ksav.typ` — which is a real file with a real name and is not a
file the writer has. `body_byte_of` correctly declines it, exactly as it declines
a span in the two-line header.

The premise that "every glyph carries the span of the source it came from" is
true and is not the same claim as "every glyph carries a span *into the writer's
document*". `pagelines.rs` never noticed the difference because it is asking
which of the writer's lines printed, and a glyph the writer did not write is
correctly not one of them.

## What does resolve

The note's own prose, because that is the writer's content handed through
untouched. And every apparatus in this product lays an entry out the same way —
«marker» «body» — with the two as **siblings in one frame**. That is true of
Typst's native footnote entries, of the collected apparatus at the page foot, of
endnotes, and of a deferred body at the end of the file, because all four are one
entry shape.

So the marker is not resolved. It is **paired**: the run that resolves to
nothing, beside the run that resolves to somewhere.

Three rules make the pairing exact, and each was mutation-tested:

- **Pending state is one frame's own.** It is not inherited by a child frame and
  never survives one. Without it, a note's marker printed in the prose is still
  pending when the walk reaches the apparatus at the foot of the page, and pairs
  with the first note's body down there. Mutating it red three tests, including
  `Some("ב")` where `Some("א")` was wanted — the drawer would have been wrong
  about every row while looking exactly right.
- **A tag closes a marker to further text.** An endnote prints `1` and `.` as
  two runs with nothing between them and the reader sees `1.`; a parent's `1` and
  a nested child's `2` have four tags between them. Mutating it produced `"12"`.
- **The first of two adjacent markers wins.** A body that opens with a nested
  note prints both markers before any prose. Mutating it gave the parent its
  child's number.

The third test is the one that exists for the second and third rules together,
and it did not exist until the mutation runs asked for it: the first two
mutations passed a green suite, which is the shape this repository calls
`ONLY_AT_TOP` and the reason the rule is *break the fence*, not *write the fence*.

## What the engine hands back, and what it does not

A flat list of `(marker, at)` pairs behind `Wants::markers` / `want_markers`,
off by default, sharing `Wants::lines`'s re-parse of the main source so a
document asking for both pays for the parse once.

It is deliberately **not** a list of notes. The engine has no idea what a note
is — `app/src/notes.ts` does — and a second opinion about it in Rust is the
defect family this repository is named for. So the list carries pairs that belong
to no note at all: the marker printed in the prose is followed by the sentence it
interrupts, which is a real pair, correctly reported, about nothing the caller
wants. Suppressing it here would need a rule about which region of the page the
walk is in, and being wrong about *that* would drop a note's marker silently.

`notes.markersFor` intersects. Two rules on that side, both mutation-tested:

- **The innermost containing note wins.** A note written inside another note's
  prose is inside its parent's body range, textually, so an offset is inside two
  notes and only the deeper one printed the marker beside it.
- **The earliest offset inside a body wins.** An entry prints its marker in front
  of the first word of its body, so the pair that lands earliest is the one that
  entry made.

The first of those two also had a fence that could not fail. It asserted the
chips came back `["1", "2"]`, and under the mutation the child fell back to
counting and its count was `2` — the same string, for the opposite reason. Both
tests now assert a glyph no count can produce.

## A note the page cannot mark counts instead

`#הערה[]` prints a marker over an empty entry, so there is no prose to pair with
and no honest answer. That note comes back `null` and the drawer counts for it,
as do a note typed since the last compile and every note in a document that has
never compiled.

This is the whole bargain and it is worth stating plainly: **the answer is either
the marker that printed or no answer, never a plausible number.** A value clamped
into the legal range is what produced the caret bug recorded in
[`2026-08-17-a-clamp-is-not-a-mapping.md`](2026-08-17-a-clamp-is-not-a-mapping.md),
where every value was a position that existed and almost none was the right one.

## Two smaller things it turned up

**A marker from an included chapter is dropped, not translated.** This is the
counterpart of `pagelines::relabel` and it deletes where that one translates: a
`LineRun` is *about a page*, so a run from a chapter still belongs on the page it
printed on; a marker is about *a note the client holds*, and the client holds the
document that is open. An offset into `פרק א.ksav` would land inside whatever
note of the open document happened to cover that number.

**`onAfterCompile` was a hook nobody had registered.** It was defined, exported
and called, and no module anywhere passed it a function. It is what the drawer
needed — a compile is the only thing that can say what a marker printed as, and
it lands seconds after the edit that caused it — so it is wired rather than
removed, per the standing rule.

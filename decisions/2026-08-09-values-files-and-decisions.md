# The last three verdicts of the 7 August report — 9 August 2026

Three items of the whole-repo report were still open when the ranked table was
last touched: the god-file's remaining half, the concatenated prelude, and the
generator that read Rust source text. They are the three that had estimates
rather than fixes beside them, which is another way of saying they were the
three nobody wanted to start. All three are done, and each of them turned out to
be one idea:

> **A value that crosses a boundary as text is a value that can be silently
> wrong on the other side.** A Rust default read by a regex, a prelude
> concatenated onto a document, a chip's glyph decided inside a 200-line DOM
> builder — same failure, three sizes.

---

## `emit-engine.mjs`'s byte-range parse of `lib.rs`

### What was wrong

Four tables in the engine reached the client by parsing this repository's own
Rust source:

| table | how it was read | fence on it |
|---|---|---|
| `impl Default for DocConfig` | `indexOf` + `.slice` + a regex per field | **none** |
| `pub static NOTICES` | slice to `\n];`, split on `Notice {`, regex per field | a name/copyright check |
| `pub static COMMANDS` | a character-level reader of the `cmd!` macro | the count floor |
| `pub const SERVICES` | one regex, anchored to one `svc(…)` **per line** | `#[rustfmt::skip]` + a paragraph |

Two of the four had noticed the danger and answered it with a warning. The one
with nothing on it is the one where the failure is silent and total: the Rust
value always wins on the wire, so a default the parser missed shows up as the
editor's sliders reading one number while the page is laid out to another. No
error, no diagnostic, no test.

`#[rustfmt::skip]` is a fence around a symptom. It stops rustfmt. It does not
stop a hand, a field gaining a comment of its own, or the three tables that had
no skip.

### What it is now

`engine/src/facts.rs` serialises all four. `engine/facts.gen.json` is committed;
`cargo test --test facts` fails when it is stale and `KSAV_BLESS=1` rewrites it.
Every generator on the app side reads the JSON and nothing else.

**Checked, not claimed.** `cargo fmt` was run over `services.rs` — with the skip
removed it duly exploded all thirteen rows to seven lines each, exactly as the
old comment predicted — and `services.gen.ts` and `sw-services.gen.js`
regenerated **byte-identical**. Every generated file came out identical to the
parsed version apart from its header comment, which is the evidence that the
swap changed the mechanism and not the values.

The skip is back, and the comment above it now says what it is: taste. Thirteen
rows of five short fields read better as thirteen lines than as ninety-one, and
nothing downstream can tell either way.

### What still reads Rust, deliberately

`app/tools/facts.mjs` counts declarations — `cmd!(`, `svc(`, `Notice {`, and the
fields of `struct DocConfig` — and refuses when a count disagrees with the JSON.
That is a text scan of Rust and it is the *opposite* failure mode: a count that
is wrong can only produce a loud refusal, never a wrong value, and it is
invariant under every reflow rustfmt can perform. It exists so an unblessed Rust
edit is a red `npm test` and not only a red `cargo test` in CI.

`runner.test.mjs`'s prohibition widened accordingly: it used to say *only
`tools/commands.mjs` parses the command macro*; it now says **nothing outside
`tools/facts.mjs` opens a `.rs` file at all**, with two exemptions that each read
Rust for something that is not a value. Both new fences were checked under
mutation.

---

## The prelude as a resolved file

### What was wrong

Every compile handed Typst one string: 34 KB of sefer catalogue, 2,324 lines of
`ksav.typ`, the `#show` wrapper, then the writer's text. 137 KB, of which all but
the last part was identical to the previous keystroke's.

It was parsed every time. It was parsed **again** by `Located` whenever the
document produced so much as a warning. And `body_offset` `format!`ed the whole
thing a third time, with an empty body, to learn one integer.

The cost was the smaller half. The prelude and the writer's text were the *same
file* at different byte offsets, so:

- "is this span the writer's?" was `range.start >= body_offset` — arithmetic,
  and unable to tell a prelude span from a wrapper span at all;
- naming the command a prelude span belonged to meant scanning backwards through
  111 KB for the nearest **column-0** `#let`, a rule held up by the fact that
  `ksav.typ` happens to spell all 187 of its nested bindings without a hash. A
  spelling convention, across 2,324 lines, with a 361-binding sweep run on every
  `cargo test` to keep it true.

### What it is now

`prelude_source()` is a parsed `Source` behind a `OnceLock`, registered with the
engine and imported by name. A compile is handed:

```typst
#import "ksav.typ": *
#show: מסמך.with(…)

{body}
```

Measured, `cargo run --release --example bench-prelude`:

| sections | old bytes | new bytes | old parse | new parse | saved |
|---|---|---|---|---|---|
| 1 | 137,358 | 1,312 | 3.70 ms | 0.03 ms | 99.1% |
| 10 | 140,887 | 4,841 | 4.00 ms | 0.11 ms | 97.2% |
| 40 | 152,677 | 16,631 | 4.35 ms | 0.43 ms | 90.1% |

The 137 KB parse is now paid once per process. Only the parse column is a
before-and-after: the old arrangement's whole compile cannot be measured without
putting it back, and it was more than its parse anyway — a main source whose text
changed every keystroke gave comemo a new file to evaluate, so all 361 of the
prelude's bindings were re-evaluated too.

`enclosing_let` asks the syntax tree for the outermost `LetBinding` containing
the span. A nested `#let` cannot steal a name and a `#let` inside a string or a
comment is not a binding at all. The 361-binding sweep stays — not to hold up a
convention, but because a resolver this far down the error path is worth checking
against every binding it resolves — and it now compares the parser with a
column-0 line scan, name for name and in order. They agree on all 361.

### What did not happen, and why

**`body_offset` did not die.** It shrank from a 137 KB `format!` to a two-line
header, and the report's estimate assumed it would go entirely. It cannot: Typst
gives an `#include`d file **its own scope**, so a body in its own file would not
see the import above it and every `#הדגשה` in it would be an unknown variable.
That is the same fact `include.rs` opens with and the reason `#כלול` is expanded
textually by the engine. So there is a prefix, it is two lines and a blank one,
and it is measured by subtraction off two strings the caller already holds.

**The catalogue did not go to `sys.inputs`.** It is inside the prelude module
instead. The report's argument for `sys.inputs` was that the catalogue-first
ordering is a constraint created by the concatenation — true, and a module file
dissolves it just as completely, for no per-compile cost. `sys.inputs` in
`typst-as-lib` clones the whole `Library` per compile; a second static `Source`
costs an `Arc` bump.

### The risk it created, and the fence

"Export .typ" still has to inline the prelude — a writer who asks for plain Typst
cannot be handed a file that imports a file they do not have. That is two
arrangements of one prelude, and the failure is one-sided and silent: every test
in this repository compiles through the *first* one, so the export could stop
being self-contained and everything would stay green until somebody opened the
file somewhere else.

`tests/assemble.rs` compiles it through an engine with **no source resolver on
it**. An engine that cannot resolve an import is what makes "self-contained" a
thing a test can check rather than a thing a comment claims, and the pages and
the text are compared against the compiled arrangement's.

---

## `main.ts`: the header and the panel renderers

### What was wrong

The report's §7 is one claim: every feature is half in a tested module and half
in `main.ts`, and the seam is where the bugs are. `insert.ts` took what an
insertion becomes. What was left was the chrome.

**Twenty chips**, each deciding a glyph, a name, and two booleans, inline in a
200-line function. The chipbar is the surface whose entire job is *reporting the
state*, and it was the least checkable thing in the application.

**Four list panels** — the outline, the notes pane, the version history and the
command palette — each building rows inline, and between them answering four
questions four times:

1. **How far to indent.** `8 + level * 14` in one, `8 + depth * 14` in the other.
2. **What a row's words are.** The notes pane flattens the markup. The history
   panel took the first non-blank line **verbatim**, so every snapshot of a
   document that opens with a title page was listed as `#שער[קונטרס בעניני שבת]`.
   Same question, and one of the answers is the source showing through.
3. **What to say when there is nothing.** Three had an empty state. The palette
   had none — a blank rectangle, from the one surface whose whole job is finding
   things.
4. **What to do about a cap.** The palette shows 30 operations and 60 commands.
   There was no sixty-first and nothing said so; an empty query listed 60 of the
   registry's 115 and read as all of them.

### What it is now

`header.ts` and `panelrows.ts`, both pure, with 103 assertions between them on
decisions no test could previously reach. What is left in `main.ts` is the
effect: `drawList` and `drawRow` are the one place a row becomes DOM.

The chip handler table is `Record<header.ChipId, () => void>`, so a chip
described with nothing to run — or a handler for a chip that no longer exists —
is a `tsc` error rather than an `onClick` of `undefined` that throws on the first
press and nowhere before it. Checked by mutation.

### The bug it found, which was found by pressing it

**The theme toggle never changed.** It flipped the page to dark, flipped the
editor to dark, saved the setting — and went on showing 🌙, *switch to dark*, for
the rest of the session. `setSetting`'s `theme` branch applied the theme and did
not rebuild the header; its four siblings (`lang`, `prose`, `layout`,
`editingMode`) all did. One missing line, in the toggle a writer presses first,
and every reading test in this repository was green through it — including the
new ones, because `header.chips` was right and nothing was calling it again.

That is the report's own thesis arriving on schedule: this was found by opening
the application and pressing the button, on the same afternoon the module that
makes the decision was given a hundred assertions. The fence is the class rather
than the instance — every settings key `headerState()` reads has to be a key
whose `setSetting` branch rebuilds the chrome, and the list is read off
`headerState()` rather than written down. It goes red naming `theme` when the
line is removed.

### What was left alone, and why

The styles, review and notes-chooser renderers were not moved. They already
delegate their decisions to `styles.ts`, `review.ts` and `NOTE_CHOICES`; what is
left in `main.ts` for each is form construction, which is effect. `renderHelp`
and `renderHydra` are three lines of DOM over `help.ts` and `hydra.ts` and were
never the problem.

`main.ts` is 6,036 lines, against 6,067 before. **That number is not the
result**, and the report said so first: naming the file's size did nothing last
time and the file grew 68 lines. What moved is twenty chip decisions, three menu
decisions and four panels' row models — out of the module no test can import and
into two that 103 assertions now ask questions of.

---

## The state of the run

- `cargo test`: 436 tests, 29 binaries, green.
- `npm test`: 4,003 assertions across 66 files, green.
- `npm run accept`: 44 checks, the assembled application works.
- `npx tsc --noEmit`: clean.
- Driven by hand through Chrome: the chipbar, all twenty chips, the four panels,
  and the theme toggle before and after the fix.

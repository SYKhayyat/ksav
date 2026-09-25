# 2026-09-25 · The command pairing crosses as a value

Fixes #27, second half. The parameter tables moved in
[2026-09-23](2026-09-23-the-english-parameter-tables-cross-as-values.md); this
is the third table the original issue named, and the one that issue was reopened
for. `COMMAND_EN` — 189 of the 167 commands' Hebrew↔English pairings, plus the
tiers the palette registry stops short of — was still built by `readAliases()`,
a `/^#let ([A-Za-z][A-Za-z0-9_]*) = …/` per line over `ksav.typ`.

## What the engine serialises now

`diagnostics::command_aliases` walks Typst's own parse of the prelude and
returns `(english, hebrew)` pairs in declaration order. `facts()` carries them
as `command_en`; `aliasesFromFacts` in the generator builds the Hebrew-keyed map
from that value alone, and the prelude's text is read only to contradict it.

Two rules, and neither is a pattern that happens to work:

- **What makes a binding a command** is Typst's own distinction. A document-level
  `#let` is a markup expression, so its parent is a `Markup` node; a `let` inside
  a function body sits under `Code`. That is the only thing separating the
  prelude's 810 local bindings from the 190 aliases — one of them,
  `let _gmin = רשת_מרווח_מזערי`, is a bare Hebrew value no shape test could
  reject. (The `Hash` cannot decide it: it is a *sibling* of the `LetBinding`,
  not a child of it. A first attempt that required a `Hash` child found nothing
  at all, which is how the shape was found.)
- **Which value is a command** is the first *positional* argument of an `_en(…)`
  wrapper, unwrapping a parenthesised one, or a bare `Ident` for a plain alias.
  A `Named` argument ends the search rather than being skipped, so
  `_en(extra: (…), מדור)` cannot report `extra` as the command.

`אות` is declared twice (`#let os = אות` and `#let osource = אות`), so
first-wins is load-bearing and the JSON keeps **both** rows: the choice belongs
to the reader, and `aliasesFromFacts` is the reader.

## What the line regex got right, and why that was not the reason

The old reader agreed with the walk on all 189 pairs of today's prelude, and it
had to. Typst will not parse a `#let` whose value is on the next line — it is an
`Error` node — so a bare alias is always on one line, and no bare alias can be
one reader finds and the other misses. First-wins and declaration order agreed
too, because both iterate the same bindings in the same order.

That is not a reason to have kept it. Measured against the regex, in both
directions, and pinned by `test/commanden.test.mjs` so this paragraph stays a
measurement:

- **Over-reads.** A block comment whose contents are the alias, a multi-line
  string quoting a command, and a fenced raw block all start a line, so all three
  read as commands. (A one-line `// #let …` is safe: the anchor needs `#` first.)
  A commented-out *block* of aliases is the ordinary way to disable several at
  once, and nothing in a line distinguishes it from the code under it.
- **Under-reads.** `#box[#let cell = תא]` is a command a document may
  legitimately declare and is invisible to a line anchor. `_en((מדור_בדרגה))` is
  a real binding — it compiles, and names the same command — and `_en\(([^\s,)]+)`
  stops at the first paren, so it read as nothing at all. Both readers missed
  that one; the walk is the reason it no longer does.
- **`_en (מדור_בדרגה)`, with a space, is not an example.** Typst rejects it and
  the parse is an `Error` node. It was in the first draft of the comment above,
  and the test is what caught it.

## The fence that stays

`preludeAliasesFromText` still runs the line regex — not as a source, only as a
fence. Every pair is compared in both directions, and any disagreement is a loud
`process.exit(1)` naming the command in Hebrew and both English names, never a
wrong value. That is the opposite failure mode from regex-as-source: the text
scan can only refuse, never ship. Verified by mutation, not by inspection:

- `הדגשה → strong` in `facts.gen.json` exits 1 and names `הדגשה`, `bold` and
  `strong`;
- a new alias added to `ksav.typ` with the artefact not re-blessed exits 1 and
  names the command both ways.

## What was proven before the old path stopped being the source

`COMMAND_EN` came out of the first regeneration **byte-identical** to the
pre-change `engine.gen.ts`; only its doc comment changed, because it now says
`facts` where it said "the prelude's own `#let` lines". The floor moved with the
source (`aliases (engine/typst/ksav.typ)` → `aliases (engine/facts.gen.json)`).

New tests, each of which can fail:

- `the_command_pairing_is_present` — the floor (≥120), that every row is a pair
  of strings, and that *both* English spellings of `אות` are in the table, since
  a walk that deduplicated in Rust would leave the client right by accident and
  the reader's rule with nothing to apply.
- `the_first_english_spelling_of_a_command_wins` — the reader's rule, stated.
- `the_alias_walk_only_opens_for_document_commands` — six over-reads, six
  under-reads and four non-aliases on synthetic preludes, each rejected for a
  stated reason. A walk that accepted all of them would pass every floor and
  every byte-identity check against today's artefact.
- `every_registry_command_agrees_with_the_preludes_spelling` — the registry and
  the prelude, asked from Rust, so a disagreement is a red `cargo test` and not
  only a red Node run. It also caps the "registry-only twin" fallback at five,
  because that fallback growing is what would mean the aliasing had stopped being
  the mechanism.
- `commanden.test.mjs`, twenty-four assertions — the fence fires for a wrong pair, an
  invented pair, a missing pair and a size skew; the problem names the command;
  and the line scan's own blind spots, measured.

Editor assertions 7,607 / 107 files → 7,632 / 108. Engine tests 987 → 991.
README's tally updated to match.

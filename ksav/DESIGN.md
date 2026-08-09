# Ksav — how this repository stopped being wrong

This is `ksav/README.md`'s other half. The README is for somebody who wants to
use Ksav or work on it; **this** is for somebody who wants to know why it is
shaped the way it is — one registry per surface, one authority per fact, a
documentation fence, and a pin on the shared crates that cost more to get right
than any feature in the product.

It was split out because the README had grown to 903 lines of which roughly 161
were how-to-use and roughly 310 had a past defect as their subject: two to one
against the reader who came to use the thing. That is the same seam `decisions/`
was invented to cut, reproduced inside the file that describes `decisions/`.

**This is not a log.** `decisions/YYYY-MM-DD-*.md` is the dated record, written
once and never edited. What is here is the *current* design and the reasoning
that produced it, edited in place like any living page and swept by the same
documentation fence — so a number in it is as checked as a number in the README.

---

### One registry of surfaces

The chrome has the same shape of problem and the same shape of answer. Seventeen
panels — drawers, modals, the command palette, the contextual ribbon, the
pointer-anchored menus — each used to fetch an element by id, put the class
`open` on it, hand-build its own `×`, and add its own line to a list of close
calls in the global Escape handler. Four hand-maintained pairings per surface,
and each one right on its own is not the same as all of them agreeing: the
settings drawer shipped with an opener and no closer, the welcome overlay with
no way out at all, and the hydra — the one panel that takes over the keyboard —
was never added to the Escape list.

**`app/src/panels.ts`** declares each surface once: what kind it is, whether
Escape closes it, and how a person gets out of it from inside. It is then the
only module in `src/` that spells the `open` class, the only one that builds a
`×`, and the only one that wires a dismissing backdrop — so a surface cannot
appear on screen without being declared, `panelHead(id)` cannot be given the
wrong panel's closer, and the Escape sweep is derived from the list rather than
remembered. `panels.test.mjs` builds every declared surface against a DOM and
clicks its way out of each one; `chrome.test.mjs` sweeps `src/` for anyone
spelling those things by hand.

### One authority per fact

The third instance of the same shape, and the widest. Eight things this
repository knows were written down two or three times, in two or three
languages, with nothing comparing the copies: the document defaults (Rust,
Typst, TypeScript), the Hebrew↔English command pairing (the prelude's `#let`
lines, the registry, and ~200 pairs re-typed by hand across four modules), the
licence notices for the six embedded fonts and four word lists (the Markdown,
`licenses/`, and a fourth copy in the About panel), the `#כלול` directive rule,
the Hebrew name normaliser, the running head's alignment table, and "strip the
markup, leave the words" — asked in six places, answered six ways.

Every one of them had already been corrected by hand in every copy at least
once, which is the tell. There are two answers, and which applies is decided by
whether a language boundary is genuinely in the way:

- **Generate it.** `app/src/engine.gen.ts` is written from `engine/facts.gen.json`
  and `engine/typst/ksav.typ` by `app/tools/emit-engine.mjs`; `npm test` runs the
  `--check` form, so a default changed in Rust and not regenerated is a red test
  rather than sliders that disagree with the page.

  The Rust half of that chain used to be *parsing Rust source text*:
  `src.indexOf("impl Default for DocConfig")`, then a `.slice`, then a regex per
  field, and the same shape again for the notices, the command registry and the
  service registry. Which means a table's **formatting** was a build input.
  `services.rs` had spotted the risk about itself and answered with a
  `#[rustfmt::skip]`; `impl Default for DocConfig` had nothing, and it is the one
  where the failure is silent — the Rust value wins on the wire, so a default the
  parser missed shows up as the editor's sliders reading one number while the
  page is laid out to another. `engine/src/facts.rs` serialises all four tables
  now, `cargo test --test facts` keeps the artefact honest, and `runner.test.mjs`
  sweeps `test/` and `tools/` for anything that opens a `.rs` file at all.

  The command tables in `markdown.ts`, `spans.ts`
  and `ksav-lang.ts` are now keyed by the Hebrew name alone and expanded through
  the prelude's own pairing — which also gets them the four tiers per note
  family that the palette registry deliberately stops short of.
- **Execute an oracle.** A Typst prelude cannot call Rust and a browser tab
  cannot call either, so `fold` — which spellings of a sefer's name are the same
  name — exists three times of necessity. It is fenced by a corpus every
  implementation is run against (`engine/tests/fixtures/fold-cases.json`,
  `engine/tests/one_want.rs`, `app/test/sefarim.test.mjs`), and the Typst half is
  asserted *inside the compiler*, so a disagreement arrives as a diagnostic
  naming the case. The first run found that the Typst copy iterated grapheme
  **clusters**, so a pointed letter was deleted along with its nikud: `שַׁבָּת`
  folded to the empty string, which does not merely fail to find the masechta —
  it makes every fully-pointed name collide with every other. Two
  implementations read carefully by hand had agreed with each other for as long
  as they had existed.

`app/test/enginefacts.test.mjs` holds the prohibitions: no module but the
generated one may write a Hebrew command name beside its English twin, and no
module but `spans.ts` may strip markup with a regex.

### The documentation, checked the way the application is

The fourth instance, and the one nothing had ever asserted. Prose compiles no
matter what it says, so the pages describing Ksav drifted exactly as the code
copies did and with nothing to notice: nineteen false claims across five pages,
including a command count short by a dozen, a binding count short by twenty-two,
one CI job unaccounted for, and `docs/shortcuts.md` seventeen rows short with
`Ctrl+Alt+D` printed as "Mark as deleted" long after the application had rebound
it to **Endnote**. Every one of those survived a green suite.

`app/test/documentation.test.mjs` and `app/test/docfacts.mjs` close it, and the
shape is two sweeps in opposite directions, because a hand-written list of
claims fails by omission and a regex over prose fails by leaking:

- **Forward** — every counted claim in a living page must equal what measures
  it, at its home: `cmd!(` in the registry, `DEFAULT_KEYS` in the bindings the
  editor installs, `.ksav` files in `engine/templates`, `#[test]` in the engine,
  non-comment lines in each lexicon (checked against the count the generator
  writes into its own header), jobs in `ci.yml`.
- **Backward** — a number standing beside one of those nouns in a living page
  must be a *declared* claim. Inventing a fresh count in `docs/` fails the suite
  until somebody declares it, which is the half that is still true a year from
  now. It caught this section while it was being written, twice.

`docs/shortcuts.md` is diffed against `node tools/card.mjs`, which reads
`bindings.ts` and `i18n.ts` through the same esbuild path the runner uses — the
card was always unable to disagree with the application and was simply never
re-run. Relative links must resolve to tracked paths, and so must file paths
named in prose, which is a separate sweep because the ones that rot mostly are
not links: `LICENSE` argued its whole case on the behaviour of the Hebrew spell
checker and named a path that stopped existing when that module became a
directory — a sentence, not a link, and wrapped across a line break besides.

The append-only record is exempt, because a dated entry was true on its date —
and the record now has an **address** rather than a list. `spec.md`, `fixes.md`
and `plan-notes-and-ui.md` were each two documents with opposite lifecycles
bolted together, a spec edited in place and a log written once, and every stale
number in the repository lived at that seam. The nine dated waves, audits and
resolutions are [`decisions/YYYY-MM-DD-*.md`](../decisions/README.md), one file
each; `spec.md` kept the part that is a specification and is swept like any
other page.

The exemption is the dangerous part and it is checked from every end: the
directory must be excusing something real, every page it covers must carry its
date in its name — which is what makes the lifecycle a fact rather than a claim
— and no exemption may reach a page that is documentation by definition. A new
`.md` is fenced by arriving, since anything not covered is swept. The
load-bearing rule exists because the first version of this fence did not have
it, and adding a living page to the log list with a plausible sentence turned
its sweep off with the suite green — `ONLY_AT_TOP`, rebuilt inside the check
written against it. (That constant is gone: it exempted nine commands from
`registry.rs`'s nesting sweep, six of them were being compiled in those exact
nestings by `insertion.rs` at the same time, and both tests were green. The file
is deleted and `the_grid_exempts_nothing` asserts the grid has no holes instead.)

Two facts live in `test/run.mjs` instead: how many assertions the suite runs and
across how many files. Nothing knows those without running, and a test that
counted itself would never settle.

### Nesting depth

Any structure can contain any other — lists in tables, headings in footnotes,
headings in tables, tables in footnotes, footnotes in footnotes, etc. Verified in
`engine/examples/nesting.ksav` (regression-tested):

- **Headings** — unbounded: any level number (`#כותרת(רמה: 1000)`), unlimited count.
- **Lists** — nest ~30–60 deep.
- **Footnotes** — nest ~40–60 deep.

The list/footnote ceilings are **Typst's own recursion safety limits**
(`MAX_SHOW_RULE_DEPTH = 64`, parser `MAX_DEPTH = 256`), shared by every Typst
document — they exist so pathological input errors cleanly instead of crashing the
process. For comparison, Word caps list nesting at 9 levels; no real document
nests past a handful.

## The shared crates

Every command above works from a plain `git clone`, with nothing set up first.
That sentence is new, and it is the whole point of this section.

Ksav compiles five crates from a second repository,
[`sefer-crates`](https://github.com/SYKhayyat/sefer-crates):

| Crate | What Ksav uses it for |
| --- | --- |
| `girsa-source` | the Source Packet — the wire shape a source arrives in from Girsa |
| `girsa-ksav` | the markup writer, so Girsa's Ksav buffer emits the commands this engine compiles |
| `girsa-post` | the token-gated localhost loopback, and the `ksav://insert` deep link |
| `girsa-ref`, `girsa-hebrew` | transitively, under the three above |

They are not a library Ksav happens to use. Girsa is the library and Ksav is the
pen; the crates are the **seam between two halves of one product**, so that a
change to what a quote block *is* lands on both sides as one edit rather than as
an agreement in prose between two repositories that drifts until a sefer is
printed (spec.md §10.3).

The 0.5.1 bump is what that looks like in practice. A ref names *places*, so a
reader who quoted half a se'if in Girsa had a document that said *this se'if* —
and regenerating it against a corrected edition would have handed back the
whole se'if, which is the one thing the pairing exists to make impossible. The
packet grew an optional `range`, `#מראה_מקום` grew a `תווים:` argument to
keep it in the document, and `typst/ksav.typ` learned to accept it. Three
repositories, one change, and the test that proves it is here: only this side
can put a partial quote through the **real Typst engine**. Absent means the
whole place, so every document already written is untouched.

They are pinned by commit:

```toml
girsa-source = { version = "=0.5.1", git = "https://github.com/SYKhayyat/sefer-crates", rev = "c8edeaa…" }
```

**This used to be `path = "../../../sefer-crates/crates/…"`** — a sibling of the
checkout root, so `git clone ksav && cargo build` failed inside `cargo metadata`,
before any compiler ran, naming a directory the reader had never heard of. No
submodule, no `[patch]`, nothing vendored, and **no page in this repository
mentioned it**, including this one, which handed you a `cargo run` that could not
work. CI worked around it with a second checkout in four of five jobs and in the
release matrix, and `ci.yml`'s first run is the record of what happens without
that. `= 0.5.0` beside a path read as a pin and was not one: with a path
dependency the path always wins and there is no version to fall back to. A commit
SHA is the pin it was pretending to be.

### Working on Ksav and sefer-crates at the same time

That is what the path dependency actually bought, and it is kept. Copy the
example override and a local checkout wins over the pinned commit:

```sh
cp .cargo/config.toml.example .cargo/config.toml     # at the repository root
```

It expects `sefer-crates` beside this repository (`Videos/Ksav`,
`Videos/sefer-crates`, `Videos/Girsa`); edit the paths if yours differ — they
resolve from the repository root, not from `.cargo/`. Cargo finds the file by
walking up from wherever you invoked it, so one copy at the root covers
`engine`, `wasm` and `app/src-tauri` alike, and deleting it puts the pin back.

It is a `paths` override and not `[patch]` on purpose: `[patch]` re-resolves and
rewrites `Cargo.lock`, which erases the pin from it — five entries to zero on
the first `cargo metadata`, measured both ways — and a lock file committed in
that state is the fresh-clone build broken again by the fix for it. `paths`
leaves the lock byte-identical. It does print a warning about an altered
dependency list on every invocation, which is expected while all five crates are
overridden together; the example file says why.

### What the pin costs the other repository

One thing, and it needs fixing there rather than here. `sefer-crates` runs
`tools/check-dependents.sh` — *"a break shows up in this repository's PR, not
weeks later inside an app"* — by building each sibling checkout against its
working tree. That worked because the sibling *was* the dependency. Now Ksav
builds against the pinned commit, so the Ksav half of that check would compile
old code and pass no matter what the change broke. Girsa is unaffected; it still
reaches `sefer-crates` by path.

The check keeps its meaning with one flag on the Ksav build, no state and no
file to clean up:

```sh
cargo build --manifest-path "$siblings/Ksav/ksav/engine/Cargo.toml" --all-targets \
  --config "paths=['$siblings/sefer-crates/crates/girsa-source', …]"
```

Worth being plain about which way this trades. Before, a change next door could
turn this repository red with no commit landing anywhere near it; now it cannot,
and the price is that the other repository has to opt back in to finding out.
The opt-in is one line and it lives where the change is being made, which is the
right end for it.

### Bumping the pin

Push to `sefer-crates`, then edit the `rev` in **both** `engine/Cargo.toml` and
`app/src-tauri/Cargo.toml`, and run `cargo metadata` (or any build) in each of
`engine`, `wasm` and `app/src-tauri` so all three lock files record the new
commit. Both manifests, because the desktop binary links the engine and the
Tauri shell into one
process: two revs would put two `girsa-post`s in it, the loopback desk and the
deep-link parser disagreeing about the wire between them. `engine/tests/manifests.rs`
fails by name if they diverge, if a lock file falls behind, if a path dependency
is ever reintroduced that points outside the repository, or if this section stops
existing.

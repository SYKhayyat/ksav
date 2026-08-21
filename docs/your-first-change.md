# Your first change

[`CONTRIBUTING.md`](../CONTRIBUTING.md) gives you the rules. This page walks one
real change end to end so that the rules stop being abstract.

The change is a **new setting on a region** — the thing you are most likely to
want to add, and the one that touches the most machinery. The worked example
came to **eight files, one of them generated** — and you will not have to
remember which eight: **a fence tells you about each one in turn.** That is the
whole experience this page exists to give you.

Set aside an hour. Most of it is builds.

> The worked example is `סימן_חיתוך`, which is real and already in the tree.
> `git log -S'סימן_חיתוך'` shows the whole thing as one commit if you would
> rather read it than type it. Do it by hand once anyway — the point is the loop,
> not the diff.

---

## 0 · Get to green first

```sh
cd ksav
node tools/gate.mjs
```

Nine checks, and on a clean clone all nine pass. If they do not, stop: you are
about to spend an hour unable to tell your breakage from the one that was
already there. That is not a hypothetical — three commits went out on a green
`cargo test`, which is **one of the nine**, while formatting, clippy and a stale
generated file were all red.

The engine tests take a few minutes. Everything else is seconds.

---

## 1 · Decide what the setting *is*

Before any code: what question does a writer answer with it, and what happens if
they say nothing?

For the worked example: *a box told not to spill clips what does not fit — what
should it say at the edge?* Default: an ellipsis. `none` for the clean edge.

Two rules from `CONTRIBUTING.md` bind this and both are load-bearing:

- **A judgement-call constant becomes a setting, with the old value as its
  default.** If you are about to write a number into the renderer, it wants to be
  a knob. The two column gaps in a grid region were numbers in the renderer until
  somebody wanted a different one.
- **Build, don't delete.** If the thing you want already half-exists under
  another name, wire it up rather than replacing it.

---

## 2 · The engine end

Everything a region accepts lives in `ksav/engine/typst/ksav.typ`.

**Add the key to `_rg_own`.** That tuple is the list of arguments `#אזור`
accepts; a key not in it is refused by name, which is correct and is why you add
it here first.

```typst
#let _rg_own = (
  …,
  // What a box that could not hold its contents says at its edge.
  "סימן_חיתוך",
)
```

**Give it an English name in `_en_params`.** Ksav is a bilingual language, not a
Hebrew one with a translation layer, so a key with no English spelling is a key
an English document cannot say. If the setting takes *words* as values rather
than numbers, they go in `_en_values` too.

```typst
clip_mark: "סימן_חיתוך",
```

**Then make it do something.** This is the part that is actually about your
change; the rest of this page is about the surfaces that have to agree with it.

Two things to watch:

- **Definition order is real.** A name has to be bound before the code that uses
  it is *evaluated*, and Typst will tell you `unknown variable: _foo` at document
  compile time rather than at build time. If a helper is used by something above
  it, move the helper up — or move the caller down.
- **Do not measure content to find out what the layout did.** `measure` on an
  apparatus answers 64.26pt for a four-word note in a 34.02pt box, because what
  it is handed is the region's furniture and not only its prose. Facts about the
  layout belong to the walk that decided them; carry them out on the record.

---

## 3 · Prove it on the page, not in the abstract

Write the test now, before the surfaces. `probe` reads the laid-out document, so
you can assert what actually landed where.

```rust
let doc = probe::layout(&body, &DocConfig::default()).expect("did not compile");
let runs = probe::text_runs(&doc);
assert!(runs.iter().any(|r| r.text.contains("…")));
```

Then **assert the quiet case too**. A setting that fires when it should is half
the claim; a setting that stays silent when it should is the other half, and it
is the half that catches a knob wired to the wrong signal. The worked example has
four cases: it clips and says so, it has room and stays quiet, it spills and
stays quiet, and it can be silenced.

Two instrument traps that have each produced a confidently wrong finding here:

| Trap | What happens |
|---|---|
| Hebrew and digits shape into **separate runs** | no run contains `מילה20`; read `probe::lines(...).reading`, which concatenates them |
| `probe` cannot see a **clip** | a clip is a paint operation, so a masked note and a printed one measure identically. `examples/svgdump.rs` sees the rectangle |

**Then mutate.** Break the thing you just built — invert a condition, drop the
call — and watch the test fail. A fence that has never failed is a fence you have
no evidence about, and three tests written in one day here passed under the exact
mutation they were written to catch.

---

## 4 · Now the fences find the other files for you

Run the engine group:

```sh
cd ksav && node tools/gate.mjs engine
```

> Always through the gate, and never by spelling the command out yourself.
> Every check lives in `ksav/tools/gate.mjs` and there is a fence — which you
> will meet if you write one into a page — against a second copy of it drifting
> from the first. `node tools/gate.mjs --help` lists the groups.

You will get, roughly in this order:

**`region_matrix.rs` — "no values for `סימן_חיתוך`"**

Every value of every region key has to survive contact with the engine. Add
yours to `values()`. Read the list out of the prelude with `vocab("_name")` when
there is one, so a value added tomorrow is swept the day it is added.

**`region_settings.rs` — "these region keys have no contrasting values"**

Stronger, and the more useful of the two: it renders the page twice, with two
different values, and fails if the page does not change. **A knob nothing reads
is a control that lies**, and four of `#אזור`'s keys were exactly that before
this file existed.

This is where you find out whether your setting works. Give it a `Vary` with two
values and a document that *reaches* it — which is usually the hard part. If your
setting only matters when a box overflows, the document has to overflow.

If the fence says your key changes nothing, believe it. "I cannot demonstrate
this setting" has meant *something underneath is broken* more often than it has
meant the fence was wrong.

**`english_commands.rs`** sweeps `_rg_own` for English spellings, so a key you
gave no English name fails here.

---

## 5 · The editor end

```sh
cd ksav && node tools/gate.mjs editor
```

**"generated files are stale"** — run `node tools/emit-engine.mjs`. If your
setting's values come from a tuple in the prelude, add it to `readVocabularies`
in `tools/emit-engine.mjs` first, so the editor reads the list rather than
keeping a copy of it. A hand-copied list is the drift this whole arrangement
exists to prevent.

**"regions: every key `#אזור` accepts has a knob"** — `channels.ts` holds
`RegionSettings` and `REGION_KNOBS`. Add a field and a row. The row names an
i18n key, so a knob cannot exist without a label.

**"`סימן_חיתוך` is a word in Hebrew / …and in English"** — `i18n.ts`, both
tables. If your setting takes value *words*, they need `regionValue.<name>` in
both languages too, and the English name comes from `EN_VALUES` in `channels.ts`.

> **One Hebrew word cannot carry two English names.** `שורה` already means *line*
> in the value table, so the leftover-row answer had to be `שורה_נוספת`. The
> fence catches this; the fix is a better word, not a second entry.

---

## 6 · The counts

```
FAIL ksav/README.md says "954 tests"
```

Not a nuisance. A page that states a number nothing measures is a page that goes
quietly wrong, so the numbers in `ksav/README.md` are fenced. You added a test;
move the number. The assertion count moves too, and both are reported with the
value they should be.

---

## 7 · The gate, then the commit

```sh
cd ksav && node tools/gate.mjs
```

**Format after your last edit, not before.** Formatting early and then
adding one more test is how a red build reaches CI, and it is the single
commonest way to do that here.

Commit messages say **what changed and what it was wrong about before**. Look at
`git log` for the register: the first line is a sentence, the body is the
argument. If your change fixed a bug, the body says what the bug did to a page.

If the change was a decision rather than a fix, it wants a dated record in
[`decisions/`](../decisions/README.md) and a row in that index — there is a test
that every file there is indexed.

---

## What that exercised

- The prelude's argument table, and the two-language rule that binds it
- `probe`, and what it can and cannot see
- Mutation-testing a fence you wrote
- Four fences finding four different surfaces you had not updated
- The generated file, and why it is generated
- The counted claims, and why prose can fail a build

Which is most of Ksav's machinery, on a change small enough to hold in your head.

## Where to next

| | |
|---|---|
| the rules, in full | [`CONTRIBUTING.md`](../CONTRIBUTING.md) |
| how it fits together | [`../ksav/README.md`](../ksav/README.md) |
| when something breaks | [`troubleshooting.md`](troubleshooting.md) |
| why something is the way it is | [`../decisions/README.md`](../decisions/README.md) |
| what is open | [`../HANDOFF.md`](../HANDOFF.md) |

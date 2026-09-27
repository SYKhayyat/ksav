# 2026-09-25 · The engine's SVG reaches the DOM through a measured allow-list

Fixes #53. Three sites did `host.innerHTML = svg` with no sanitizer and no
allow-list, and `flattenGlyphs` made it sharper by rewriting `<use>` into `<path>`
with string surgery that kept every attribute the `<use>` carried.

## The measurement first, because it changed the verdict

The report said any attribute a hostile payload could reach the engine's output
would ride into the serve origin, and called it an XSS vector. Two routes into
that output were measured before any code was written, and **both are closed**:

- **An SVG asset.** A `.ksav` can carry `image("logo.svg")`, and an SVG can carry
  `<script>`. Built the hostile file and compiled it: Typst does **not** inline
  it, it emits `<image xlink:href="data:image/svg+xml;base64,…">`. A base64
  payload in an `href` on an `<image>` is not script, and `innerHTML` parsing does
  not make it one. `grep -c script` over the emitted page: **0**.
- **Document text.** Typst escapes text content in SVG, so a document whose body
  is `<script>alert(1)</script>` produces escaped text, not an element.

And the third measurement is the one the fence is built on: **`alarming` is empty
over the whole corpus.** `engine/examples/emit-svg-vocabulary.rs` compiles every
template plus two documents for shapes they do not reach, scans every page, and
records every tag and attribute name together with anything that reads as a
payload. Nothing does. That is a number rather than an argument, and it is the
number a future Typst that starts emitting `onload` would move.

So this is **hardening, not the close of a live hole** — and that is exactly why
it wants a fence. A path that is safe today because of somebody else's encoder is
one Typst version from not being, and nothing here would notice.

## The list is measured, and the one name on it is the argument for measuring

A hand-written allow-list is a reading of one SVG file, and it is wrong in a way
nobody would notice. The measurement over the whole corpus is:

- **elements** — `a clipPath defs g image path rect svg symbol use`
- **attributes** — 22, from `d` to `xmlns:xlink`

And there is a name in that list that nobody would have written down. Typst emits
an **`<a>` with a transparent `<rect>` and no `href` of its own** for a link's hit
area. An allow-list written by reading the markup and missing it drops **every link
in every document**, silently, with nothing in the suite in a position to see it —
and there was a test in the repository that renders documents and asserts nothing
about links.

So: `engine/examples/emit-svg-vocabulary.rs` measures, `tests/fixtures/svg-vocabulary.json`
holds it, `app/tools/emit-svg-vocabulary.mjs` generates `app/src/svg-vocabulary.gen.ts`
from it, and `svgsafe.ts` uses the generated lists. The same three-step shape as
`containers.json` and `facts.gen.json`, for the same reason: the answer is a
property of an exporter and nobody can read it off a file.

The **denied** list is *not* generated. Refusing a name is a judgement about
safety and a measurement cannot make it. `engine/tests/svg_output.rs` asserts the
two never disagree about a name the engine actually emits — the only disagreement
with a consequence.

## Three bugs the tests found, and what each says

**Dropping a tag is not dropping the thing.** The first version dropped the
`<style>` tags and passed the body through, emitting
`*{background:url(javascript:…)}` as text inside the `<svg>`. The hostile-input
list caught it because the string still said `javascript:`. A filter that removes
a tag and keeps what was between the tags has not removed anything — it has
reclassified it, and "inert text" is a claim about a consumer nobody has checked.
Dropping an element now drops its content, with same-name nesting counted.

**A denied *self-closing* element spun the scanner forever.** `<animate
attributeName="href" values="javascript:1"/>` — the two `continue` branches that
handle a refused or unlisted element advanced `i` only when the element had
content to skip, so a self-closing one was re-read at its own `<` for ever. It is
a **crash**, found by the hostile-input list, and the two shapes that hang are the
two no engine output has ever contained. `i = gt + 1` now happens in the branch
rather than after it.

**The measurement itself was wrong first.** The attribute reader split a tag body
on whitespace, so every path segment in every `d="M3.15 3.6…"` was collected as
though it were an attribute name — 30,000 names that were numbers. A measurement
that does that is worse than none, because it looks like a vocabulary. The reader
now steps over a value with whatever quoting it uses.

## Why a string filter and not `DOMParser`

The first shape was "parse with `DOMParser`, build with `createElementNS`", which
is structurally the best one: a name not on the list is never created.

It is also untestable here, and that decided it. `test/harness.mjs` says in so
many words that a `document` on `globalThis` is enough to convince
`@codemirror/view` it is in a browser, so it installs none, and the suite fakes
the handful of nodes each module touches. A `DOMParser` would have meant
`linkedom` or `jsdom` as a new dependency, and **the fence for a security property
that only runs where a real DOM is present is a fence that gets skipped wherever it
is inconvenient.**

The same constraint answered a second question. The first attempt at wiring it in
built the page panes with `document.createElement`, and three suites went red with
`ReferenceError: document is not defined` — the harness's own comment, quoted
above, refusing exactly that. The fake host's `innerHTML` setter parses a flat run
of `<div class="page">` because that is the shape `drawPages` emitted before; the
wrapper here is *our* markup and the string inside it has been through the filter,
so composing through the host is both the supported shape and the safe one.

## The prohibition, and its three claims

`prohibitions.test.mjs` gained a rule that engine SVG never reaches `innerHTML`.
`innerHTML = ""` is allowed — that is how a pane is emptied and not what this is
about — and three files are exempt, each a claim the harness checks is still true
of the file rather than a name on a skip list:

- `svgsafe.ts` **is** the allow-list; `svgsafe.test.mjs` says the right-hand side has
  been through the filter.
- `preview.ts` composes `<div class="page">…</div>` **around** a filtered page.
- `ksav-lang.ts` is a CodeMirror widget rendering the application's own table
  markup. It is not engine output and never was; it is listed because it is the
  *other* `innerHTML` in `src/`, and a rule naming only the one it noticed reads
  like it was written for the one it noticed.

## Fences, and what each was shown to do

| Where | Mutation | Result |
|---|---|---|
| `svgsafe.ts` | a `<style>` body | the body leaked as text, and the test said `javascript:` |
| `svgsafe.ts` | a denied self-closing element | the scanner hung, and the process died |
| `preview.ts` | back to `node.innerHTML = flattenedPage(...)` | the prohibition went red on `preview.ts` |
| `svg-vocabulary.json` | `<a>` removed | the generator refuses, and `svg_output.rs` goes red on the measured set |
| `skips.test.mjs` | — | rejected the staleness test for measuring without a floor; it now asserts at least fourteen pages came back |

The last one is the same complaint it has made four times today, and it is right
each time: a walk that stopped finding pages would measure an empty vocabulary,
write it, and leave every other assertion green over a measurement of nothing.

Engine tests 1006 → 1009, binaries 69 → 70. Editor assertions 7,639 → 7,775
across 109 files — the jump is the new `svgsafe.test.mjs`, which is mostly the
hostile-input list, and every entry in it is one input the previous shape would
have mishandled.

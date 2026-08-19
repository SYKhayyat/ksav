# A `.ksav` is not always text, and only the browser knew

*19 August 2026.*

Found by trying to check something else. The tester's map in `Documents\` was
being brought up to date and the obvious way to confirm the edits was to compile
it — so `ksav.exe ksav-test-map.ksav`, and thirty-seven errors came back on a
document that is perfectly fine.

It was not the document.

## 1 · The finding

`app/src/docs.ts` decides what a `.ksav` file is, and it decides two things:

```ts
if (!doc.assets.length && !custom && !hasConfig) return doc.body; // the common case stays text
return JSON.stringify({ format: FILE_MAGIC, version: 1, title, body, assets, … });
```

Plain text when it can be, and a JSON wrapper the moment the document carries an
image, its own `#let` commands, or page setup of its own. The plain-text half is
deliberate and worth keeping — that is what makes a sefer diffable, greppable and
openable in any editor, which matters to someone keeping one in git.

That rule was written on the browser side and told to nobody else. It has exactly
one implementation, `parseDoc`, and it lives in a browser tab.

**Instance 1, the CLI.** `main.rs` read the file with `read_to_string` and handed
the result to the compiler. A JSON-form document therefore compiled its own
wrapper as prose, and printed

```
✓ compiled ksav-test-map.ksav → ksav-test-map.pdf (16 page(s), 208347 bytes PDF)
```

over sixteen pages of `{"format": "ksav-document", …}`. Its usage line has said
`ksav <input.ksav>` since the day the binary existed.

**Instance 2, Emacs.** `ksav.el` puts `.ksav` in `auto-mode-alist` and sends the
buffer as a body. Opening a document with a picture in it showed the writer their
own JSON and typeset that.

**Instance 3, the plain-text case was wrong too.** Even when the file *was* its
own text, the CLI compiled it with `DocConfig::default()`. A sefer set to A5 with
a gutter came out of the CLI as shipped-default A4 — a PDF that disagreed with
the application's own preview, silently. And nothing outside the browser had ever
heard of `customCommands`, so a document that defines a command of its own could
not be compiled anywhere but in a tab.

Three instances, one class: **every client that is not the browser assumed the
format was the simpler of its two forms.**

## 2 · What was built

`engine/src/docfile.rs` — one reader for the format, returning the body, the
title, the page setup, the assets split into images and fonts, and the
custom-command preamble. It never fails: JSON that does not parse, or parses to
something that is not ours, is a text document that happens to begin with a
brace, and refusing it would be refusing a legitimate file on the strength of its
first character.

`main.rs` goes through it, compiles `compile_with(source, cfg, assets)`, and
subtracts the preamble from every diagnostic's line so the number named is a line
of the writer's document. `Diagnostic::line` asked for exactly that in its own
doc comment — *"a caller that prepends anything subtracts its own line count. It
knows what it added; the engine does not"* — and the CLI was the caller that
never had.

Emacs unwraps on the way in and wraps on the way out. The container is kept
whole rather than rebuilt, so every field this package does not understand —
including one a later version of the format adds — survives the round trip; a
writer must not be able to strip a sefer by opening and saving it. The two lossy
JSON spellings are avoided on purpose: reading `false` as nil and writing it back
gives `null`, which would quietly turn a two-sided document into a nonsense one,
so the container is read and written with `json-parse-string` / `json-serialize`
and their sentinels rather than with the convenient alist spelling.

And `ksav-request` in `ksav-engine.el`, because six call sites spelt the request
`((body . ,(buffer-string)))` and nothing else. That is the same finding one
layer up: a client that knows what a document carries and does not send it.

## 3 · The fence

Two implementations of one format is what the house rule forbids without an
oracle both sides are executed against, and the precedent was already here —
`emit-scan-oracle.mjs` → `scan-oracle.json` → `scan_oracle.rs`.

So `app/tools/emit-docfile-oracle.mjs` runs the **real `parseDoc`** over a corpus
and writes down what it believes; `engine/tests/docfile_oracle.rs` fails when the
Rust reader disagrees. Six claims per file: wrapped or not, the body, the title,
the preamble, which asset list each entry lands in, and which page-setup keys
survived the read — that last one being what catches a renamed `DocConfig` field,
since the editor's key names *are* the engine's field names and nothing has ever
enforced that.

The corpus is mostly `serializeDoc`'s own output, crossed over every reason to
wrap and every awkward body, so the two functions that have to agree are the two
the fixture is made of. A hand-written sample of the wrapper would be a sample of
what its author believed on the day, which is precisely the class of test that
stayed green while the CLI compiled JSON. The rest is what no serialiser writes:
truncated wrappers, wrong magic, a `body` that is not a string, prose in braces.

Mutation-tested, three ways. Never unwrap — five of six tests red. Put fonts and
images in one list — `images_and_fonts_go_to_their_own_lists` red, naming
`ser:font:plain:shipped`. Ignore the file's `config` —
`the_page_setup_is_read_from_the_same_keys` red, naming `dir`. The Emacs half was
mutated too: stop unwrapping, and three of its tests go red while the plain-text
and prose-in-braces tests stay green.

## 4 · The second bug, found by the oracle on its first run

The emitter crashed building the corpus:

```
TypeError: Cannot read properties of undefined (reading 'length')
    at assetHash (docs.mjs:2451)
```

`parseDoc` read a file's assets as `v.assets as DocAsset[]` — a cast, over a file
somebody could have hand-edited or a write could have truncated — two lines below
a `config` field that goes through `readPageSetup` for exactly this reason. An
entry whose `data` was absent rather than empty reached `assetHash`, which does
`a.data.length`, so **opening that document threw on its next compile**.

Normalised rather than dropped: `DocAsset.data` already documents the empty
string as *"the blob has gone missing, which is a diagnostic rather than a reason
to drop the asset"*, so a malformed entry becomes that same known state and the
document still says which pictures it wanted.

An oracle finding a bug in the authority it was written to check is the argument
for oracles, restated.

## 5 · What is not done

The `AUDIT-2026-08-18-external.md` in the repository root fails the documentation
sweep on two counts — it states `6,596 assertions`, which was true before the
audit was answered, and names `.tmp-test/api.mjs`, which does not exist. It is a
dated record sitting outside `decisions/`, which is the one place a page is
allowed to state a historical count. Moving it there is the fix and it is
somebody's file, so it is named here rather than moved.

# 2026-08-23 · The hot paths, measured and then cut

The audit's inefficiency findings. Two rules governed this chunk: an answer
pure over static inputs is computed once (`slanting_commands` already showed
the shape), and a layout walk nobody has measured is not "optimised" by
someone who cannot run it — that lesson is written down twice in this
repository's own lessons file, both times expensively.

## Built

- **E1 · The bundled font bytes were cloned per compile.** `families_with_italic`
  copied every bundled face (~2 MB) to answer whether one family slants — on
  the keystroke path. The bundled answer sits in a `OnceLock` beside
  `slanting_commands`; fonts attached to a request are still read fresh,
  because they arrive and go with requests.
- **E2 · Three full parses of the body per compile** beyond Typst's own:
  `first_italic` once and `dangling_references` twice (one per command name).
  One parse now serves both checks; both take the tree.
- **E3 · The auto-reserve rescan ran for unchanged text.** A watcher tick or a
  settings-only compile paid several whole-document passes at the bottom of
  `show_rule`. One cached answer keyed on (body, sheet); a keystroke that
  changed the text misses it, which is correct.
- **E6 · The palette re-derived the command model per character**, registry
  mapping and preamble regex included. `commands.available` memoises on its
  two inputs; the model is pure over them.
- **E7 · The reviewer-name field serialised every setting to localStorage per
  letter** — `input` where `change` was meant. The name commits on leaving the
  field or Enter.
- **E8 · A git status request spawned git eight times.** `--version` was a
  spawn per status (twice over) and is asked once per process now; identity's
  two `config --get` calls are one `--get-regexp`.
- **E9 · Reading a document file cloned every asset entry** — multi-megabyte
  base64 payloads — to build the two-array request shape for a reader that
  then walked it again. `Assets::from_docfile` reads the single array in one
  pass over references.
- **E4, partial · The spill policy was validated per entry.** `_sf_spill`'s
  answer for a region cannot change between two entries on one page; it is
  computed once per region per evaluation now, keyed by region — which is also
  decision 12 made literal: channels sharing a region share its answer.
- **E5, partial · B3 already halved the side column's work**: one merged walk
  and assignment per page instead of one per stream. The remaining cost is
  bounded by Typst's measure cache.

## Deliberately not built

The rest of E4/E5 — caching assignment walks across pages inside the footer
machinery — wants `examples/timing.rs` numbers before and after, and the last
two attempts to make this apparatus clever without measuring disabled every
overflow move silently. It stays as it is until someone measures it; this
record exists so that is a decision rather than an omission.

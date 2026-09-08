# 2026-09-07 · The eleventh scanner retires

Fixes #24 (Ksav Lamdan 1). The page-foot reserve — `auto_notes_region_cm` and
its scanner family — re-lexed Typst by hand: comments, strings, parens and
identifiers each had their own hand-written matcher, in a crate that ships the
real Typst lexer and already uses it in `parse::partition`. The two halves had
already drifted (`BAND_GAP_CM=0.45` carried against a measured 0.41), and every
edit to a piece of Typst syntax had to be re-taught to Rust constants. This is
the one top prior finding still outright live, and the audit's known-live
recurrent.

The rebuild is exactly the audit's refine: one `parse::partition(body)` pass —
the parser's own `FuncCall`/`Args`/`Ident` nodes supply the calls, the
`LeftParen`/`RightParen` pair bounds each argument list, and the comment and
string leaves supply the "not live code" set — plus the existing arithmetic,
which is untouched. `parse::apparatus_shape(body)` returns `{ calls, comments,
strings }`; the reserve reads its facts from that and keeps the same sum.

## How the flip was gated

The audit's first commit was to run the two halves side by side and flip only
when byte-identical. A differential gate test read the whole real corpus — every
document in `tests/notes-corpus/`, every template body, and the adversarial
shapes the hand scanners were written to survive (commented-out apparatuses,
running heads that quote a command, unbalanced brackets mid-keystroke) — and
asserted the old scanner and the new parser path returned the same reserve, on
an A4 and an A3 sheet. It passed on every document, so the flip is evidence and
not faith. The hand lexers then retired: `code_only*`, `apparatus_is_called`,
`apparatus_is_named_as_kind`, `channel_declarations`, `declared_region_cm`,
`channel_region_cm` are gone. `closing_paren` and `named_arg` survive, because
`inject_reserve_into_writer_masmer` still needs them.

## Two behaviors that changed, both correct

The gate proved the parser and the scanner agreed on every document either of
them was ever asked about, which is the contract that matters. On documents the
scanner was *wrong* about, the parser is now right, and the differences are
deliberate:

- **A prose false-positive is gone.** The old `apparatus_is_called` did not
  check for a `#`, so a bare `המדף_א[פרטים]` in prose — no command at all —
  reserved a full page foot. The parser only produces a call for real call
  syntax, so prose can never reserve.
- **A spaced call is no longer a call.** `#מדף_א [הערה]` and
  `#הגדרות_מדפים (גבהים: …)` are not calls to Typst (the space ends the hash
  expression), and the reserve now agrees with what Typst actually does instead
  of reserving for an apparatus that is not configured.

The old scanner's known 3 cm over-reserve for a running head that quotes a
command (`#כותרת_עליונה("ראה #מדף_א[שם]")`) is gone too — the test that used to
assert `>= 0.0` about it now asserts exactly `0.0`.

## The permanent net

The ~twenty reserved-region tests are the regression net, as the audit said.
The differential gate's corpus is replaced by one permanent test pinning the
parser's answers on the adversarial shapes — commented-out apparatuses reserve
nothing, a string is not a call, a comment cannot join two halves of a name,
an unbalanced `#מדף_א[` still counts while `#הערה(` and an unfinished config
reserve nothing. `the_page_foot_reserve_list_matches_the_prelude` still
derives the footer-rendered command family out of `ksav.typ` and checks the
lists in both directions, so the command tables cannot drift from the prelude.

Counts: engine tests 980 → 980. The differential gate became the adversarial
test, and the `code_only` unit test died with the function it tested, so the
README's engine-test claim stays true untouched.

Also carried on this push: two pre-existing formatting hunks the engine fmt
gate was red on at HEAD (`examples/glue.rs`, `src/notemarks.rs`), fixed
mechanically so the remote's fmt job is green again.
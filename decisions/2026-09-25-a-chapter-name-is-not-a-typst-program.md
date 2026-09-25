# 2026-09-25 · A chapter name is a filename, and a filename is not a Typst program

Fixes #50. `include.rs`'s `marker()` was `format!("#חסר_הכללה[{what}]")`, and
`what` is a chapter name out of the sefer.

## The bug

A content block is not a string. A `]` inside `[…]` closes the enclosing call, and
everything after the close is **live Typst**. So a sefer containing

```ksav
#כלול("a]#evil[")
```

expanded to a body in which `evil` was a function call. A file name is not a
trusted input: it is whatever the writer typed, or whatever arrived in a `.ksav`
file somebody was sent. The issue's own reproduction was a part named `a]#evil[`
and it was correct.

Three call sites reached it — a missing part, a cycle, and an over-deep nesting —
and all three build the same string for the same reason, which is the argument
for the fix living where it did.

## The fix, and where it lives

`marker` now runs its argument through `escape::content`, the engine's one answer
to "what does Typst read as markup" — the same table `girsa-ksav` and
`app/src/typst-escape.ts` each had their own wrong copy of, per `escape.rs`'s own
header.

It is in `marker` rather than at the three call sites on purpose. An escaper
somebody has to remember to call is an escaper that is missed on the fourth
`format!` at 3am, and `marker(what: &str) -> String` leaves no way to reach the
content block without going through it: the callers cannot emit an unescaped one
even by accident.

## The fences, and what each is *for*

**`a_chapter_name_cannot_become_typst`** — fifteen hostile names through the real
request path, asserted on the body Typst is handed. Two things went wrong writing
it, and both are the interesting part:

- The first version asserted on the **diagnostics**, and went red on the fix. The
  missing-document problem is `אין מסמך בשם "a]#evil["` — it quotes the name
  **unescaped on purpose**, because it is a sentence for a person and the person
  needs to see the name they typed. Escaping that would be a different bug and
  asserting on it tests the wrong string. The surface that matters is the
  compiled body.
- The second version asserted `!expanded.contains("#evil")`, and went red on the
  fix too: the *escaped* form is `a\]\#evil\[`, which **contains** `#evil` as a
  substring. A `contains` check cannot tell an escape from a hole. The assertion
  is now **equality** against `#חסר_הכללה[` + `escape::content(…)` + `]`, which is
  the stronger claim — it catches a name that escaped too *much* as readily as one
  that escaped too little.

**`the_missing_chapter_marker_escapes_every_markup_character`** — one case per
character in `escape::MARKUP`, through `expand` rather than by calling `marker`,
so it goes the way a real sefer goes. It also states *why* the marker uses the
engine's table rather than a list of its own: a character added to the engine's
answer is escaped by the marker for free, and two earlier copies of that answer
were already wrong.

**A new prohibition in `app/test/prohibitions.test.mjs`** — the class, repo-wide.
The rule is a `format!` that builds Typst markup with a `{…}` in a **content
block**, which is the interpolation `escape::content` answers and the one that is
dangerous; a `{…}` inside a *string literal* argument is `escape::string_literal`'s
job, and the two are not interchangeable, which is why the rule names the bracket
rather than the brace. Scoped to `ksav/engine/src/*.rs`, and `include.rs` is the
one exemption — a claim with a Rust test attached rather than a name on a skip
list, so the marker ceasing to escape takes the exemption with it.

Shown to fire: a `format!("#הערת_צד[על {title}]", …)` added to `lib.rs` turns the
sweep red, in a file that holds twenty-nine *correct* interpolations. That
discrimination is the rule's whole worth — a prohibition that flagged `show_rule`
would have been switched off.

## One limit worth stating

`include.rs` reads the name as the **text** of a string literal without unescaping
it, so a name cannot contain a quote and cannot express an odd backslash. That is
a separate (minor, non-injecting) limitation, out of scope here and not fixed; the
backslash is covered in the test by the `MARKUP` sweep, which reaches it through
`expand` directly. Said here so the next reader does not think the omission in the
hostile-name list is an oversight.

## Numbers

Engine tests 999 → 1001. Editor assertions 7,633 → 7,638. README's tallies
updated; the documentation fence asked for both.

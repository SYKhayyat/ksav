# The diagnostic knew where it was, and two of three surfaces threw it away

*16 August 2026.*

Found by writing a sefer, which is what `ksav/README.md` calls the most
important line on its page and what HANDOFF says nothing else has ever found
this class of bug with. Seven simanim, a tiered apparatus, a side column, an
index and an export. It did not compile, and the reason it did not compile was
this:

```
[error] לפקודה כאן חסר ארגומנט: גוף · the command here is missing an argument: body
```

*The command here.* Which command, and where is here?

## What the engine already knew

`Diagnostic` carries seven fields and four of them exist to answer exactly that:

| field | what it holds |
|---|---|
| `line`, `column` | 1-based, the column counted in characters because a Hebrew letter is two bytes |
| `about` | the command it is about, from Typst's own call trace or from the text |
| `did_you_mean` | the nearest real name, when the one written does not exist |
| `file` | the included document the line came from, so a sefer built from twelve chapters does not report at a line in a document that exists nowhere |

Every one of them is computed on every diagnostic. The browser editor puts a
mark in its gutter from them. The command line printed `[{severity}] {message}`
and the Emacs client printed `{severity}: {message}`, and neither had ever
printed anything else.

So the engine did the work three times over and two of the three readers were
told nothing. A writer compiling a kuntres in a terminal had a message, no line,
no command, and three hundred lines to search.

## What it says now

```
kuntres.ksav:5:2: error: לפקודה #סעיף חסר ארגומנט: גוף · #סעיף is missing an argument: body [#סעיף]
```

`file:line:column: severity: message` — the shape every compiler has printed
since the seventies, which is what makes it navigable by `compilation-mode`, by
`next-error`, by a CI log's error parser. Not merely more detailed: *walkable*.

`Diagnostic::one_line` is where the formatting lives, so the CLI asks for a line
of text rather than inventing one, and the Emacs client says the same thing. It
is not literally shared — one is Rust and one is Emacs Lisp — and the price of
that was paid immediately: **both drafts printed `[##סעיף]`**, because `about`
carries its own hash and I added another, twice, in two languages, within an
hour. Fenced on both sides now.

## The one underneath, which was the bigger half

The message said *the command here* rather than naming it, and that is not a
missing sentence — `rephrase` names the command whenever `about` is set:

```rust
let (he_which, en_which, …) = match about.as_deref() {
    Some(c) => (format!("הפקודה {c}"), c.to_string(), " כאן", " here"),
    None => ("הפקודה כאן".into(), "the command here".into(), "", ""),
};
```

`about` was not set. `where_it_happened` returns a name from Typst's call trace,
and falls back to `enclosing_command(body, at)` — which scanned backwards for an
unmatched **`(`**.

Ksav is a `#name[…]` language. `#טבלה(עמודות: "שתיים")` was findable;
`#סעיף[א]`, `#הערה[…]`, `#סימן[א׳]` and every other command called the ordinary
way were not, so every argument error on any of them read *the command here* and
named nothing. The exception was findable and the rule was not.

Two changes, both in `enclosing_command`:

- `[` counts as well as `(`, with its own depth, so a span inside a bracketed
  body finds the call it is in;
- and before either, `command_at` — because a missing argument is reported **at**
  `#סעיף` rather than between its brackets, so the byte is inside the name and
  there is no enclosing bracket to find at all. That was the case that produced
  this whole record.

## Not fixed, and worth a decision rather than a patch

`#פריט` and `#תא` are `#let פריט(body) = body` — the identity. They mean
something only as arguments of `#רשימה(…)` and `#טבלה(…)`, which is why the
registry's own snippets spell them without a `#`.

Written in prose — `#רשימה[#פריט[א] #פריט[ב]]` — the compile succeeds, says
nothing, and prints a one-item list containing both. Same for a table: one row.
Both happened in the kuntres above, and the page was quietly wrong.

The editor's `legalAt` greys a page break inside a container and a merge between
two cells; it has no rule for a structural argument outside its container, and
neither has the engine. Whether it should is a question about the language
rather than a bug with an obvious fix: `#פריט` in markup is a misuse the grammar
permits, and the toolbar never writes it. It is in HANDOFF.

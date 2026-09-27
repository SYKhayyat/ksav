# 2026-09-26 · An asset name is a filename, and a filename is not a path

Closes #52. The issue said asset names are unvalidated and that
`ksav.typ` "replaces or confuses the trusted prelude". The fix list is right; the
impact is wrong; and the part of the impact that *is* real is worse and was not in
the report.

## The shadowing is closed, by resolver order — and measuring it is the point

`main_source` does `#import "ksav.typ"`, and the chain is built like this:

```rust
.with_static_source_file_resolver([prelude_source().clone())   // the prelude, first
.with_static_file_resolver(files)                              // the document's assets
.add_file_resolver(FileSystemResolver::new(packages_root()))    // bundled packages, last
```

So the prelude is consulted **first** and a document carrying an asset called
`ksav.typ` gets its asset shadowed. Measured: the attacker's `#let`s never bind,
`#attack` is reported as an unknown command, and nothing hostile reaches the page.
`ksav.TYP` is inert too, because `VirtualPath` is case-sensitive.
`nothing_replaces_the_prelude` is that measurement as a test.

The rule is kept anyway, and the reason is now the honest one: **a name the
resolver will never reach is a name that should not be accepted**, because the
chain is a two-line change and a plausible one, and on the day it is reordered the
same file stops being inert. And `ksav.TYP` is *deliberately not* a rule — a rule
I cannot justify is a rule that trains people to skip the list.

## What is real, and what nobody had looked at

The probe walked a list of hostile names through `compile_with`. Two of them
**killed the process**:

```
thread 'main' panicked at typst-as-lib-0.16.0/src/conversions.rs:23:44:
valid virtual path: Escapes        ← for ".."
valid virtual path: Backslash      ← for "C:\"
```

`typst-as-lib` builds a `VirtualPath` from each name and `.expect()`s it, and
there is **no `catch_unwind` in this crate or in `server.rs`**. So one
unauthenticated request to `ksav serve` — an asset named `../x.png` — takes the
worker thread down with it. Every other name tested was inert: an absolute path,
`sub/dir.png`, `x/../y.png`, `a b.png`, the prelude's name, a case variant.

That is a denial of service, not a compromise, and it is the reason
`diagnose_name` is a gate rather than a check on one field.

## Two gates answering two different questions

Neither substitutes for the other, and the tests are split to say so:

- **At the reader** (`from_request`, `from_docfile`, `from_json`) the gate exists
  so a **writer is told** their file was refused. It runs *before* the payload is
  decoded, so a multi-megabyte base64 blob for a name that will be refused is not
  decoded to find out.
- **At `compile_with`**, which is `pub`, so a library caller can hand `Assets`
  straight in. This is what makes the panic unreachable at all.

Mutation-tested independently: removing the `compile_with` filter brings the
panic back and the process dies; removing the reader gate leaves the two
"a refusal is announced" tests red while the no-panic test stays green. Two
gates, two tests, and either can be deleted without the other noticing — which is
the failure a single test would have hidden.

## A refusal is not a missing asset

The existing `Vec<String>` means *"a hash this engine does not hold — send the
bytes again"*, and the client's answer to that is to re-send. **A refusal reported
there would loop for ever**, so it is a different type — `Refused` — carrying a
message per entry and rendering as a **warning** diagnostic, which is the channel
for "this arrived and will not be used".

And a `.ksav` has no preview, so on that path the refusal rides on
`DocFile::advisories()` beside the other two, because from a writer's side a
refused name and a missing one look identical — an image that is not on the page
— and only one of them is fixable by sending the file again.

## What was removed rather than gated

`read_list` and `read_one` were a second, cache-free pair of readers with the
same rules written twice and the same hole in both. They are gone rather than
fixed: `from_json` now goes through `read_list_cached` with a throwaway `missing`,
so there is one reader and a name refused on one path is refused on the other by
being the *same* code. House rule: fix the class, not the instance.

## The other half, which a rule written from a threat model always loses

Eleven ordinary names have to survive, and they are in a test: `sub/dir/photo.jpeg`,
`a..b.png`, `my logo.png`, `שם-בעברית.png`, `2026-09-25_scan.png`, `..hidden.png`.
`..` is checked as a **segment**, not as a substring, because `a..b.png` is a
legal file name and refusing it refuses something a person wanted — and the next
person removes the gate.

The floor, too: `the_gate_does_not_refuse_an_ordinary_document` runs the shapes
the editor actually sends — a `data:` URL as the bytes, a hash-only entry for an
unchanged image, a font — and a gate that refused everything would pass every
other assertion in the file.

## One test bug worth recording

`with_asset` took a `&str` and put it in a `json!` array, so `json!` produced an
array of **strings**. The reader finds no object in an entry and quietly reads it
as nothing, so the test was asserting an empty asset list for a reason that had
nothing to do with the name it was about. Fixed by taking a `serde_json::Value`,
and the docstring on the helper says why.

Engine tests 1009 → 1019, binaries 70 → 71. Editor assertions 7,775 → 7,776.

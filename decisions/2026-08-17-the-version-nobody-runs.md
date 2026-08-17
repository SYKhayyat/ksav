# The Emacs version nobody runs, and the badge nobody could read

*17 August 2026.*

The handoff's three in-flight items and three of its tracker items, closed. Two
of them were bookkeeping and one of them was a package that did not work.

## 1 · The release rehearsal read

`release.yml` run `31972563118`, a `workflow_dispatch` from `main`: eleven jobs,
every one green — the gate, the matrix reader, four installers, four engine
binaries, the Emacs tarball. `gh api repos/SYKhayyat/ksav/releases` returns
**one** object, `v0.1.0`, `draft=false`, created 24 July. Nothing was published.

The guard is what it claims to be. `tagName` empty on anything that is not a tag
means `tauri-action` builds without uploading, and the two `gh release upload`
steps are behind `startsWith(github.ref, 'refs/tags/')`. Rehearsing a release no
longer cuts one.

## 2 · The Emacs live tests, run on Linux for the first time

They had never run on a Linux machine. That was the whole of the item, and it
was worth its own line: **sixteen of the fifty failed.**

Not sixteen faults. One:

```elisp
(defun ksav-running-p ()
  (condition-case nil
      (with-current-buffer
          (url-retrieve-synchronously (ksav-server-address) t t 2)
        (prog1 t (kill-buffer)))
    (error nil)))
```

That asks *did `url.el` hand me a buffer*. The question is *did a server answer*,
and against a port with nothing listening the two have different answers, which
differ by platform as well as by version:

| | connection refused returns | `ksav-running-p` |
|---|---|---|
| Emacs 27.1, Ubuntu (what CI runs) | — | nil |
| Emacs 30.2, Windows | `nil` | nil, through the `with-current-buffer` error |
| Emacs 30.2, GNU/Linux | a live buffer, body empty, no signal | **t** |

On the third row `ksav-start` takes its `((ksav-running-p) (ksav-server-address))`
branch, starts nothing, and returns an address. Every call after it fails with
`Ksav: no reply from http://127.0.0.1:7879/compile`, with a working engine
sitting on `exec-path` the whole time. Fifteen live tests fail at their first
call, and `ksav-with-no-engine-anywhere-the-message-names-the-command` fails
because a `should-error` finds no error to catch.

This is not a test problem. **The package does not work on a current Emacs on
GNU/Linux**, which is a fair description of most of the people it is for.

`ksav-running-p` now reads an HTTP status, which is the question the other two
callers in the file were already asking — `ksav--download` checks
`url-http-response-status` and `ksav-call` checks `url-http-end-of-headers`. One
of three asked the wrong thing, and it was the one everything else went through.

Fifty-one tests, fifty-one green, Emacs 30.2 on NixOS.

### Why CI could not see it

`ci.yml`'s Emacs job runs `emacs-nox` on `ubuntu-22.04`, which is **27.1** — the
version `Package-Requires` declares, deliberately, so the declared floor is a
floor somebody stands on rather than a claim. It is also, as it happens, a
spelling where the wrong question gets the right answer.

So the floor was tested and nothing else was. A second job, `the Emacs package,
current Emacs`, runs the offline half on `ubuntu-24.04`. No engine and no
`KSAV_EMACS_LIVE`, so the fifteen live tests skip and it costs an apt install
rather than a Typst compile — and that is not a gap, because the assertion that
catches this class needs no engine by construction. The fault *is* that no engine
gets started:

```elisp
(ert-deftest ksav-nothing-listening-is-not-an-engine-running ()
  (let ((ksav-server-url nil) (ksav-port 47893))
    (should-not (ksav-running-p))))
```

Mutation-tested by restoring the old body under the new test: red, naming the
test, the form and the value.

The same job runs `package-lint` and `checkdoc` exactly as MELPA does — see §4.

## 3 · The badge that named a command in the wrong language

`#פריט` and `#item` are one command. An unconsumed structural child wears a red
badge naming itself, and the badge was built from the kind string the prelude
carries, which is always the Hebrew one — so an English sefer told a writer who
has never typed a Hebrew letter that `פריט` is out of place.

The prelude can know: `text.lang` is what the page setup set from `שפה`, and it
is the same thing `#תוכן_עניינים` already reads to choose between תוכן העניינים
and Contents. `_kd_stray` is a `context` block now and picks both the command
name and the message from it.

`_kd_english` is a second spelling of five names already in this file, so it is
fenced against them: `every_english_name_the_badge_uses_is_a_real_alias` fails
unless the prelude defines `#let item = פריט` for every row. A badge naming a
command that does not exist would render, and would be wrong only to a reader.

### The half that was nearly a silent hole

Two test files searched for the literal `"outside its container"`. Making the
badge speak one language at a time would leave `insertion.rs` searching for the
English half of a badge drawn in Hebrew — and its assertion is that a *refused*
insertion **does** carry the badge, so it would have become an assertion that
passes on nothing. `common::has_badge` accepts either phrase, and both files go
through it.

## 4 · MELPA, drafted and not opened

[`ksav/editors/emacs/melpa-submission.md`](../ksav/editors/emacs/melpa-submission.md)
is the recipe, the pull request body and every checklist line answered with what
was run. It is not opened: it is a pull request to somebody else's repository
under a real person's name.

Two things came out of writing it that are not clerical:

- **It cannot be opened before 23 August 2026.** MELPA asks for a public
  repository of one month or more; this one went public on 23 July.
- **`package-lint` and `checkdoc` are now CI's job.** Both were clean when the
  recipe was written, which is worth what any other measurement nothing repeats
  is worth. `package-lint` needed `package-lint-main-file` set — without it every
  file is linted as its own package, `ksav-write.el` is reported forty times for
  definitions not starting with `ksav-write-`, and the `Package-Requires` header
  that lives in `ksav.el` alone is invisible, so 27.1 features are reported as
  needing a dependency the package already declares.

Its real feedback was one line — `Emacs` in the summary is redundant — and
`checkdoc` had eleven, all addressed. `ksav-release.el` is generated, so that fix
went into `emit-release-assets.mjs`.

## 5 · v0.1.1

Bumped and tagged. The reason is not a feature: `v0.1.0` predates the `engine`
and `elisp` jobs, so three of the four ways an Emacs user installs Ksav resolve
to 404s. One release fixes all three.

**Six files carry the version and the fence covered four.** `wasm/Cargo.toml`
and `app/src-tauri/Cargo.toml` are tracked, are shipped by the same tag, and were
outside the one check whose subject is that the versions agree. The crates are
swept now rather than listed, with an assertion that every crate in `ksav/` is
covered — mutation-tested by bumping five of six, which names the sixth.

## 6 · Documentation, finished

`ksav/README.md`, `docs/from-word.md` and `docs/girsa.md` — the three pages the
16 August pass did not reach. Same rule as the four it did: a living page
describes what is, and what changed on a day belongs here. Roughly a hundred and
fifty lines of *it used to be broken this way* came out, and the anecdotes that
justify a rule a reader follows stayed as clauses.

Two things that were not trims:

- `ksav/README.md` said the scanner oracle sweeps "Three thousand documents" in
  one place and `4,165` in another. The second is fenced by a marker and the
  first was invisible to the sweep, because `documents` is too common a noun to
  fence — a retreat `NOUNS` documents in its own comment.
- The forward claim check was `body.includes(want)`, a raw literal against
  prose that wraps at eighty columns. Rewriting the paragraph around *"green
  across all eight jobs"* failed the suite over a line break, with the page
  saying exactly what it should. `numericClaimsIn` had already reached the
  conclusion — *"every space in a pattern is `\s+`"* — after a reflow put a
  newline inside "engine tests" and hid a number wrong by nineteen. The forward
  direction never got the fix. Fail-safe rather than fail-open, so a papercut
  and not a hole, and still one rule spelled two ways in one file. `says()` is
  the one spelling; `documentation.test.mjs` and `run.mjs` both read it.

## 7 · One more fence, widened

`skips.test.mjs` recognised four shapes of "this walk found something" and
`assert_eq!(rows, 5)` was not among them, so a loop with an exact count under it
read as a loop with no floor. A fifth shape, restricted to a non-zero literal —
`assert_eq!(n, 0)` is the assertion a fully-skipped walk passes, which is the
thing being looked for rather than a floor under it. Mutation-tested both ways.

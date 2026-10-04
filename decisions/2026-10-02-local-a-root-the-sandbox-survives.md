# #72 — a sefer can now read *a* disk: `@local`, set once at startup, and the sandbox intact

**Date:** 2026-10-02
**Issue:** #72 — *Decision: a sefer cannot read the disk — give it a root, or ship `@local` alone*
**Verdict:** **Ship the cheap half.** `@local` resolves against a packages directory beside the dictionary. The sefer is still **one file**, so nothing about autosave, dirty-tracking, git or a file-tree UI moved.

The issue's own words: *"That answers 'can I bring my own Typst library', which is most of the value, and touches no editor, no autosave and no git."* It was also the reason it was deferred, and the deferral was right — so this record is mostly about the thing the deferral said did not exist.

---

## 1. The deferral, and what it was correct about

The issue was closed as "defer" on a measured ground: the engine **had no way to be
told where anything is**. `packages_root()` was `pub`, took no argument, and was
hardcoded. The compile channel is `(name, String)` — no path, no `AppHandle`, nothing
on the request. So a packages directory in `app_data_dir()` meant **inventing a
process-global seam** in the one place this repository has deliberately never had
one, and the issue declined to invent it unilaterally.

That was correct, and it was correct for a reason worth preserving rather than
working around:

> **set by the app at startup** — safe, and the only version I would ship;
> **arriving on the request** — any client of the loopback, and the browser build,
> could point a compile at an arbitrary directory. That is the sandbox gone.

So the seam is here, and it is the first version. `set_local_packages_root` is called
exactly once, from `tauri`'s `.setup()`, and **nothing on any request can move it.**
The property that earned `packages_root` its keep is preserved rather than traded:

> *its root **is** the package directory: a document cannot reach anything else on
> the disk through it.*

---

## 2. What shipped

**Engine.**
- `set_local_packages_root(dir)` — points `@local` at `dir`, **once**. The first
  `set` wins, so two callers that disagree cannot both be believed: the second is
  told what the first set rather than being allowed to widen it.
- `local_packages_root()` — the root in force, or `None`. Separate from
  `packages_root()`, which is a constant baked in at build time; this one is a
  decision the shell makes.
- `package_resolvers()` — bundled root **first**, `@local` second. The order is the
  fence: a user directory can never shadow what ships.

**Shell** — `src-tauri/src/lib.rs`, `.setup()`: `create_dir_all(app_data_dir()/packages)`,
then `set_local_packages_root`. The directory is created if absent, because a writer
who has added no packages should still find it waiting rather than have to guess its
path. Nothing else is created inside it.

**A missing directory is not an error.** `set_local_packages_root` on a path that is
not there returns the bundled root and changes nothing. "You have no packages" is a
true sentence, and a writer must be able to compile before they have added one.

---

## 3. The three measured warts, closed

The deferral measured three `searched-at` path shapes and found two degraded the
diagnostic. `missing_package` split on the literal `"packages/"`, so:

| searched at | before | now |
|---|---|---|
| `…/packages/preview/nothing-here/9.9.9/typst.toml` | `@preview/nothing-here:9.9.9` | same |
| `…/lib/nothing-here/9.9.9/typst.toml` | **`None`** | `@local/nothing-here:9.9.9` |
| `…/packages/nothing-here/9.9.9/typst.toml` | `nothing-here:9.9.9` (ns lost) | `@local/nothing-here:9.9.9` |

The middle row is the one that mattered, and it is why this had to be fenced rather
than noted: **a user's root is chosen by the writer and need not be called
`packages`.** So the namespace is now recovered from the *shape* — four segments and
a manifest is a package — with `local/` and `packages\` added as spellings, because a
shell on Windows sets a root too.

The regression test is
`tests/packages.rs::a_missing_local_package_is_named_from_a_root_not_called_packages`,
and it **asserts that its own root is not named `packages`**, so it cannot pass by
accident.

`bundled_packages()` — the "what can I import?" list on the error path — now reads
**every** root. A writer who added a package under `@local` and mistyped a name
should be shown both directories, or the list answers a question they did not ask.

---

## 4. What is still not true

This is the ceiling the issue named, and it has not moved:

| | |
|---|---|
| split a 40-chapter sefer across files | **still no** |
| `#let` for a recurring kuntres in a shared file | **still no** — but `#import "@local/…"` is the same answer for library code |
| `read()` a list of names, a hash-hash list, a CSV of parshiyos | **still no** |
| a personal `.typ` of house conventions | **now yes**, as a package |

And explicitly **not** done, per the issue: loosening the sandbox, and fetching
packages over the network.

### The browser build

`packages_root()` falls back to `env!("CARGO_MANIFEST_DIR")`, a build-machine path
that does not exist in a browser. `local_packages_root()` has no wasm equivalent at
all, so **"no `@local` root" is the wasm answer by construction** — the `OnceLock` is
simply never set, and `package_resolvers()` returns the bundled root alone. That is
a stated answer, not an accident, and it is why the tests are written against
`set_local_packages_root` rather than against an environment variable that the
browser build might honour.

---

## 5. The fences

Four tests in `tests/packages.rs`, and each exists because of a specific way this
could be wrong:

| test | what breaks without it |
|---|---|
| `a_local_package_imports_and_runs` | the resolver chain is consulted at all |
| `a_local_root_does_not_shadow_the_bundled_one` | **shadowing.** `package_resolvers` returns bundled first; if that order reversed, `@preview` would break for *exactly* the writers who had added a package — and only for them |
| `a_missing_local_package_is_named_from_a_root_not_called_packages` | the diagnostic degrades to *"a file (e.g. an image) wasn't found"*, the exact wart #67 closed |
| `a_local_root_does_not_open_the_disk` | **the point of the whole exercise.** All four rows — absolute import, sibling import, `read()`, and `@local/../../../etc/hostname` — were refused before `@local` existed and must be refused after it |

That last one is the assertion that matters, and it is deliberately the only test
that would catch a second root quietly *not* being confined. A feature whose entire
justification is *"still a sandbox"* is not done until something says so.

---

## 6. What is left for the multi-file sefer

Recorded so the next decision starts from a fact rather than a thread, and it is a
**different issue** with a different answer — not a continuation of this one:

- one sefer, one save unit? (autosave and dirty-tracking gain a tree)
- **`engine/src/git.rs` exists.** A directory changes what *"this sefer is a git
  repo"* means, and a sefer whose files are a repo is a different thing from a
  sefer that *is* a file in one.
- **there is no "add file" affordance and no file-tree UI.** Editor work, not a
  resolver change.

The seam built here is the piece that decision needs and did not have: there is now
exactly one place the engine is told where a root is, it is set once, and it cannot
be moved by a request. A multi-file sefer would add a second root **the same way**,
rather than inventing a second mechanism.

---

## Related

- **#67** — the bundled, never-fetched resolver this extends. The fence that must not
  be traded away.
- **#73** — the same mechanism, read for a different reason: the shelf is still empty
  *on purpose*, and the "prelude depends on no third-party package" fence now holds
  whatever is put there.
- **#80** — where the genuinely-absent residue of text-critical editing is recorded:
  line numbers and lemmata, both a Ksav question rather than an adoption one.
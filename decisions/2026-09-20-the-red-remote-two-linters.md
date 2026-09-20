# 2026-09-20 — The red remote: two linters reading data as prose

`main` was red, and per the standing brief a red remote is the top of the queue.
Both failing jobs failed on commits that touched **nothing but documentation** —
which is the tell that the code was fine and two readers were wrong about what
they were reading.

## What was red

- **editor** — red since `aacbb01` (a PLAN.md-only commit). The editor suite's
  documentation fence, test *no living page states a fenced count that nothing
  checks*, reported two stray counts: `PLAN.md: "29 commands"` and
  `PLAN.md: "28 template"`. Those are the work queue's issue references —
  `#29 commands registry prose-in-wire`, `#28 template coverage gate` — and the
  backward sweep in `numericClaimsIn` read the number beside the noun as a claim
  that twenty-nine commands exist. The sweep's own comment already knew the
  shape of this failure (*"the sweep's first catch was itself"*); this was its
  second catch being itself.
- **the Emacs package, current Emacs** — red since at least 24 August, longer
  than the remote was being watched. `package-lint`, installed fresh from melpa
  on every run, came back on 3 September as version 20260903 with a new
  database entry: the function `all` exists from Emacs 31.1. The floor this
  package declares is 27.1, so the check fired:

  ```
  ksav-git.el:71:5: error: You should depend on (emacs "31.1") … if you need `all'.
  ksav-git.el:76:27: error: …
  ```

  What is at those lines is not a call. It is the git service's prompt table —
  `(all . "Everything that changed, not only this document? ")` — and the flags
  list — `'(all create set_upstream)`. The name `all` is the engine's own wire
  argument for *commit everything, not only this document*. package-lint does
  not read forms; it matches a regexp — an open paren followed by a symbol —
  over the source, so any alist entry whose key is a word that some future
  Emacs version turns into a function is a red that nobody can fix by writing
  better code. Quoted data is not exempt, and there is no suppression.

## The two fixes

**The sweep declines the reference shape.** `numericClaimsIn`'s number now
carries `(?<!#)`: a digit a `#` holds is an issue reference, not a count. The
retreat is narrow on purpose — `# 29 commands` (a markdown heading, space
included) is prose and is still swept. Two assertions were added beside the
backward sweep, so the retreat cannot rot back: `#29 commands registry
prose-in-wire` is declined, and the same words without the `#` still count.
Mutation-tested: with the lookbehind removed, both the unit assertion and the
main sweep go red, and the main sweep names `PLAN.md` again.

**The git tables carry the wire names as strings.** The argument names are the
engine's JSON keys; they are now written the way the engine spells them —
`("commit" . ("message" "all"))` — in `ksav-git-arguments`, `ksav-git-prompts`
and `ksav-git-flags`. A string in car position is never a function-call shape,
so the class is dead for *every* future engine argument, not only `all`:
`rev`, `side`, `name` and the rest were one database row away from the same
red. The lookups follow the key type (`assoc`, `member` — equal, not `eq`).
What goes over the wire is unchanged byte for byte: `json-encode` printed the
symbol names as strings before, so `{"all": true}` is `{"all": true}` either
way, and `ksav-git-commit` still builds its request alist the way every other
service call in the package does.

**The fence that scoped itself by coincidence.** `app/test/emacs.test.mjs`
reads the arguments table out of the elisp with `\("([a-z-]+)"\s*\.` — a
pattern that only stayed honest while the two tables had different key types.
The prompts table's keys became strings with the fix, its rows fed the
operation read, and the suite failed with nine prompts reported as operations
the engine does not have. A fence whose correctness rests on another file's
representation choice is the `ONLY_AT_TOP` shape wearing a different coat, so
the pattern now anchors on the row's shape — a name mapped to a *parenthesized
argument list* — which is what the fence means to read.

## What was run

- `node tools/gate.mjs editor` — green, on the nix shell's Node 24, the version
  CI pins.
- Byte-compile with `byte-compile-error-on-warn`, the ERT offline half
  (60 tests, 0 unexpected), package-lint over all eight files against a fresh
  install of 20260903, and checkdoc — the whole `emacs-current` job, locally.
- The editor assertion count moved 7,585 → 7,587 with the two new fence
  assertions; `ksav/README.md` says so. Fixed once, at the end, from the final
  run — the lesson this repository paid for twice already.

## The standing lesson

Two red jobs, one shape: a reader that cannot tell a document's *mentions* from
its *uses*. Prose counts and wire names are mentions; the sweep and the linter
both read them as uses. The fix in both cases was not to reword the mention
(rewriting `PLAN.md` around the sweep, renaming the engine's argument) but to
make the reader decline the mention shape — and then to write down the retreat
where the next reader, human or machine, will trip over it.

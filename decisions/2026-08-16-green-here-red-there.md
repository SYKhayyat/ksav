# Green here, red there

**2026-08-16**

Three findings with one shape: a thing that is true on the machine it was
written on, and was never true anywhere else.

---

## 1 · The race in the acceptance run

CI went red on `026bfcc` with no assertion in it:

```
the run itself broke: locator.pressSequentially: Timeout 30000ms exceeded.
Call log:
  - waiting for locator('.cm-editor.cm-focused .cm-content').first()
    at type (.github/scripts/acceptance.mjs:509:17)

the run stopped after 500 checks; the rest never ran
```

The same commit, built and run on this desk: **728 checks, all green**. That gap
is the finding. A failing assertion tells you what is wrong with the product; a
runner that breaks in one place and not the other tells you the *harness* holds
an assumption about timing, and the two machines disagree about it.

### What it was

`type()` chose a pane and typed into it:

```js
const focused = page.locator(".cm-editor.cm-focused .cm-content");
const where = (await focused.count()) ? focused.first() : page.locator(".cm-content").first();
await where.pressSequentially(text, { delay: 4 });
```

A Playwright locator is a **query, not an element**. That reads the page twice:
once to count, once when the keystrokes go out. `cm-focused` is a class the
browser adds and removes, so the two reads can disagree — and step 11 is where
they do, because it switches documents, which tears the editor down and builds a
new one. The outgoing view still carried `cm-focused` when the count was taken,
and had dropped it before the first key. So the run waited thirty seconds for a
class that was never coming back.

Nothing about that is CI-specific except the timing, which is why it had never
been seen here. It has presumably been latent since step 14 split the window and
the selector gained the class in the first place.

### Reproduced before it was fixed

A diagnosis that cannot be made to fail on demand is a guess. `KSAV_ACCEPT_BLUR=1`
drops the focus between choosing a pane and typing into it — the CI timing made
deliberate, and made relentless, since it fires on every `type` rather than on
the one that happened to lose. Against the old locator it stops at check **500**
with the runner's own error, word for word. That is the whole of the claim, and
it is now a switch anybody can throw.

### The fix

Read the class **once**, per pane, off a selector that does not mention it — and
having chosen a pane, take the focus rather than hope for it. `.focus()` on the
contenteditable leaves CodeMirror's selection alone, so this still means
*wherever the caret already is*.

One thing the first attempt got wrong, and it is the same mistake one call
further down: it asserted `cm-focused` **in the same expression** as `.focus()`.
The browser moves focus at once; CodeMirror noticing is a separate handler on a
later turn. So the assertion has to be a wait, not a read. With that, the harsh
mutation runs to **728 of 728**.

---

## 2 · The command that stopped warning about its own italics

Caught by the gate, in the same hour, and it is the same shape in Rust.

No bundled family has an italic face, so every command that asks for one warns
that it did not get it — and the set of commands that ask is **read off the
prelude** rather than listed, on the reasoning that a list would rot. The reader
found a mark's italic default by counting quotation marks:

```rust
if entry[2].contains(": (סגנון: ") && entry[3] == "italic" { … }
```

which reads `"פסוק": (סגנון: "italic")` and is blind to

```typst
"מקור": (גודל: 0.85em, סגנון: "italic", צבע: luma(90)),
```

because there the slant is the *second* thing said. `#מקור` gained a size on the
day the block classes were written, and stopped being found — a writer presses
italic, gets no italic, and is told nothing.

The reader is now keyed off the row rather than off its first key.

**And the test was worse than the bug.** Its docstring says, at length, that the
set is read off `ksav.typ` so that a new slanting command is covered without the
test changing. Under that paragraph:

```rust
let asked = ["מקור", "גמרא", "פסוק", "ציון_מקור"];
```

Four names, typed out. It caught this failure by luck — `#מקור` was on the list
because somebody put it there in the first place — and it would have missed the
next one. It now derives its own list, by a *different* parse from the engine's:
two readers of one file agreeing is worth something, one reader checked against a
copy of its own output is worth nothing.

---

## 3 · macOS was never run

The README says, in the present tense, that this runs on Linux, macOS and
Windows. Behind that sentence:

| | |
|---|---|
| **Linux** | eight CI jobs, every push |
| **Windows** | the desk this is written on; the gate before every push |
| **macOS** | built by the release matrix on tag day, and never run |

So one third of the claim rested on a compiler exiting zero, occasionally. There
is a `.dmg` for both architectures and no evidence that anything inside it works.

`ci.yml` now has a `macos` job on `macos-14` — arm64, which is also the
architecture the release matrix builds and nobody had executed. It runs the
engine group, which is where a platform difference would actually live: paths,
the filesystem, the `git` on the machine, the loopback desk, the deep-link
scheme. Not a matrix over every job: the editor suite is Node and the same Node,
and the fonts are compiled into the binary, so the layout is byte-identical
everywhere by construction.

Windows is deliberately not there. It is this desk, checked by the same gate
before every push, and a runner would be paying for a third copy of the slowest
job in the file to learn what the commit already knows.

`gate.test.mjs` caught the job's own bug before a runner saw it: `engine` names a
group **and** a tree, the union runs, so the job selects `cargo fmt` too — and it
had installed only `clippy`.

---

## 4 · The browser you already have

`playwright-core` ships no browser (14 MB against 150), so the acceptance run
drives one that is installed. It named `chrome` and nothing else, which is right
on a GitHub runner and on this desk, and wrong on the two machines a contributor
is most likely to have: a Mac without Chrome, and WSL — where the Chrome that is
installed belongs to Windows and is not reachable from inside the distro.

It now tries Chrome, Edge, then Chromium, takes the first that starts, and if
none does it names the install command for the platform it is on and says the WSL
part out loud. All three are Chromium and this run asserts on the DOM rather than
on pixels, so which one answers changes nothing about what is measured.

`--no-sandbox` is added only when running as root, which is Chrome's own
condition for refusing to start — the default WSL and container account. Narrow
on purpose: it is a real weakening of the browser, and every other case keeps the
sandbox it should have.

---

## What this costs

One more Rust build per push, on a slower runner. The header of `ci.yml` says
this file has to be fast enough that people wait for it, and that is still the
constraint — the job runs in parallel with the Linux one and does not lengthen
the critical path unless macOS is slower than Linux at the same work. If it turns
out to be, the answer is to narrow what it runs, not to stop running it.

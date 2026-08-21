# When something goes wrong

This page is organised by **what you are looking at**, not by what is broken —
because when a sefer comes out wrong, what you have is a page, not a diagnosis.

Every entry here is something that has actually happened, to a writer or to
whoever was working on Ksav that day. Nothing on this page is hypothetical.

| I am… | Go to |
|---|---|
| trying to open Ksav at all | [Getting it to start](#getting-it-to-start) |
| looking at a page that is wrong | [The page is wrong](#the-page-is-wrong) |
| looking at an error message | [Ksav is telling me something](#ksav-is-telling-me-something) |
| losing work, or afraid of losing it | [Saving and losing](#saving-and-losing) |
| working on Ksav itself | [Building and testing](#building-and-testing) |

---

## Getting it to start

### The installer is blocked, or the app "is damaged"

Not broken — unsigned. Ksav has not bought a code-signing certificate, so every
operating system stops the first launch. The four ways past it are in the
[README](../README.md#download) and in the body of every release, which is the
page somebody who clicked *Download* is actually looking at.

### The window opens and stays blank for a long time

**The first compile of a document builds the prelude.** `ksav.typ` is over ten
thousand lines of Typst and it is compiled before your first page can be. It
is cached afterwards, so this is a one-time cost per session and not a hang.

If it stays blank for more than about a minute, it is not this — and which
entry to read next depends on which build you are in:

- **The desktop app** runs the engine **in-process**. There is no server, no
  port and nothing to connect to; if it is stuck, it is stuck inside the
  application. Nothing in the next entry applies to it.
- **The browser build** talks to an engine over the loopback interface, and the
  next entry is about exactly that.

### The browser build cannot reach the engine

The editor and the engine are two processes talking over HTTP on the loopback
interface. In development the editor is served by Vite and proxies to
`http://127.0.0.1:7878`, which is where `cargo run -- serve` listens by default.

- **Nothing is listening.** Start it: `cargo run -- serve` from `ksav/engine`,
  or `ksav serve` if you have the released binary. It prints the address.
- **Something else has 7878.** `ksav serve 127.0.0.1:7900` takes another port —
  but the development proxy is written to 7878 in `ksav/app/vite.config.ts`, so
  in a dev session change both or free the port.
- **You browsed to `127.0.0.1` and got nothing.** Use `localhost`. Vite binds
  `::1`, and `127.0.0.1` is a different address.

**None of this applies to the installed desktop app.** It has no HTTP server at
all: the frontend calls the engine in-process through Tauri, against the same
service registry the HTTP server routes from and the wasm build exports through —
three transports, one contract. If you go looking for a port there you will not
find one, and nothing is wrong.

### Firefox behaves differently from Chrome

Deliberately, and Ksav is honest about it rather than pretending. Firefox has no
File System Access API, so *Save* cannot write back to a file you opened: it
degrades to a download. That is the one real difference, it is the same in every
browser without that API, and the desktop build has no such limit.

---

## The page is wrong

### A note printed nowhere at all

The marker is in the sentence and the prose is on no page. This has been a real
bug more than once, so first check that it is not one again:

1. **Which destination is the note filed into?** A note sent to a named region
   prints where that region is *shown*. A region placed at the back of the sefer
   with nothing to draw it prints nothing — `#הצג_אזור("name")` draws it, and a
   region placed at `"סוף"` is drawn for you at the end of the document.
2. **Does the channel exist?** `#הערה(ערוץ: "x")` where nothing declares `x`
   files into a page-foot region of its own. That is deliberate — a note is
   never dropped for want of a declaration — but it is not where you meant.
3. **If none of that explains it, it is a bug in Ksav, not in your sefer.**
   `engine/tests/nothing_is_truncated.rs` is the fence for exactly this class;
   a case that reaches this line belongs in it.

### A note is short — it stops mid-sentence

Look at the end of it for a **`…`**. That is a box saying it clipped.

A region with `גלישה: ()` is a box you asked to stay fixed, and it is the one
arrangement in Ksav that may lose text. It marks the edge so the loss is
visible; `סימן_חיתוך` changes the mark and `סימן_חיתוך: none` removes it.

If you did not want the box fixed, give it somewhere to put the overflow:

```typst
#אזור("הערות", מיקום: "רגל", גובה: 2cm, גלישה: ("עמוד_הבא",))
```

That is the default for a region that says nothing, so this only bites a
document that turned it off.

If the note stops short and there is **no** mark, that is not this — it is a
bug, and it is the most serious kind Ksav has.

### A commentary beside the text is in the wrong margin

`"חוץ"` and `"פנים"` are relative to the binding and swap on facing pages, which
is what they are for. `"ימין"` and `"שמאל"` name an edge outright and never
move. A one-sided document has no spine, so `"חוץ"` keeps the meaning it had.

### The columns of a parallel page drift apart

Give the region a synchronisation unit. Without one, each column is a single
long cell and they drift by however much their contents differ:

```typst
#אזור("דף", פריסה: "צד", טורים: (1fr, 2fr, 1fr), יחידה: "סימן")
```

One grid row per siman, and a grid row starts level by construction.

If they are level per page and still drift *within* it — the body at 12pt and the
commentary at 9pt sliding against each other — that is the baseline grid, and
`#מסמך(רשת_בסיס: true)` is the answer. It is off by default because it is a real
constraint on the page.

### The numbers in two apparatuses are both `¹`

They are two streams sharing one shape. Give the second its own:

```typst
#ערוץ("שער", מקור: "הערה", מספור: "א")
```

### A citation does not open its source

The citation is Ksav's; the opening is Girsa's. Ksav asks the library over the
loopback interface, so if Girsa is not running there is nothing to answer. See
[`docs/girsa.md`](girsa.md) for the seam, and [Girsa's own troubleshooting
page](https://github.com/SYKhayyat/girsa/blob/main/docs/troubleshooting.md) for the
library end.

---

## Ksav is telling me something

Compile errors arrive in the language the document is written in, and they name
the command they are about. Three that are worth knowing by sight:

| What it says | What it means |
|---|---|
| *There is no command `#…`* | a misspelling, or a command that lives under **Your commands** and was not defined |
| *`#הערה` is missing an argument: body* | the square brackets are missing, or a space crept in between `)` and `[` — `#הערה(…) [גוף]` is not the same call as `#הערה(…)[גוף]` |
| *unknown overflow move* | a `גלישה` value that is not one of the seven; the message lists them |

An error mentioning a `_`-prefixed name is Ksav's own internals talking, and it
is a bug in Ksav rather than in your sefer. It is worth reporting with the
document that caused it.

---

## Saving and losing

### *Out of storage — your text is not being saved*

Exactly what it says, and it is the one message in Ksav that must never be
ignored. The browser has refused to write. **Download a backup first**, then
delete documents or images to free space. Nothing is lost yet at the moment you
see it; something will be if you keep typing.

### A document opens empty

Check whether the library still lists it. If it does and the page is blank, the
body did not come back from storage — export whatever else you have before doing
anything else. If it does not, it was deleted or the browser cleared its site
data, which some privacy settings do on close.

The desktop build stores documents outside the browser and does not have that
failure mode. It is the safer place for a sefer you care about.

### Where my documents actually live

In the browser: IndexedDB, on that machine, in that browser profile. Not in a
cloud, not on a server, and not visible to another browser on the same machine.
Ksav has no account and uploads nothing, which is a promise about privacy and
also a warning about backups: nobody else has a copy.

---

## Building and testing

For working on Ksav rather than writing in it. The full route from clone to
landed change is [`CONTRIBUTING.md`](../CONTRIBUTING.md); this is what goes
wrong along the way.

### The gate fails and I did not touch that code

Most likely one of the two generated files or a counted claim:

| Check | Usually |
|---|---|
| `generated files are stale` | run `node tools/emit-engine.mjs` in `ksav/app` — a Rust table changed and the editor's copy of it did not |
| `ksav/README.md says "N tests"` | you added a test; the number in the README is fenced on purpose and has to move with it |
| `no living page states a fenced count that nothing checks` | a page states a number that nothing measures; either measure it or stop stating it |
| `engine formatting` | `cargo fmt --all`, and **after** your last edit — running it before you add the final test is how this reaches CI |

A prose-only change failing the gate is working as intended. See
[`CONTRIBUTING.md`](../CONTRIBUTING.md) for why.

### `cargo` fails with a linker error, or a truncated archive

Check free disk before believing the error. A full `cargo test` needs tens of
gigabytes, and building near a full disk leaves rustc writing truncated `.rlib`
files whose errors read exactly like faults in your code. `LNK1104` and *failed
to build archive* are the two that have happened here.

`target/**/*.pdb` is usually where the space went.

### `cargo` sits there doing nothing

Look for a stale lock: a `cargo` process with no `rustc` children, and
`target/.cargo-lock` on disk. Killing the process and removing the lock is safe
and is what a killed build leaves behind.

### A test asserts against Hebrew text and never matches

Two traps, both of which have cost real time here:

1. **Hebrew and digits shape into separate runs.** No text run contains
   `מילה20`; it is `מילה` and `20`. Read off `probe::lines(...)`, whose
   `reading` concatenates the runs, rather than off a single run.
2. **`probe` cannot see everything.** It walks laid-out frames, so it reads
   position, size, weight and fill — and it cannot see a clip, because a clip is
   a paint operation. A masked note and a printed one measure identically.
   `examples/svgdump.rs` sees the rectangle. Ksav has no italic Hebrew face
   either; it shears the glyphs, and `probe` answers *upright* about a word that
   is visibly slanted.

Asking an instrument a question it cannot see has produced three confidently
wrong findings in this repository. If a test result surprises you, check what
the instrument can actually observe before believing it.

### The compile got much slower

`cargo run --release --example timing -- doc.ksav trace.json --summary` prints
where the time went, keyed by line of `ksav.typ`. It exists because five
hypotheses were formed by reading and every one was refuted by measurement,
at a fifteen-minute release rebuild apiece; the profiler answered it in one run.

Measure before theorising. And measure on a **release** build — debug timings
here are worth ±100% and have got the *sign* of a change wrong.

### The suite is green and the application is broken

The oldest bug family here, and the reason for most of the conventions: the
engine is right and the surface lies about it. A green suite is evidence about
the modules it covers, not about the thing a writer touches. The acceptance
checks that drive the real panel are the ones that catch this, and they need a
rebuilt and re-embedded binary — a `cargo test` alone cannot see it.

---

## Reporting something

What makes a report actionable, in order of how much it helps:

1. **The document.** A `.ksav` file that reproduces it is worth more than any
   description of it.
2. **What you expected on the page**, in one sentence.
3. **Which build** — desktop, browser, or Emacs — and which version
   (`ksav --version`, or *About*).
4. The error text, if there was one, in whichever language it appeared.

A page that is wrong is a better report than a guess about why.

# Ksav and Girsa

**Girsa is the library. Ksav is the pen.**

They are two applications and one product. Girsa holds the corpus — you search
it, read it, and find the מקור you want. Ksav is where you write, and what you
are writing is a sefer that quotes what Girsa holds. Neither is a plugin for the
other; they are separate programs with a process boundary between them, and this
page is the map of that boundary.

If you have never run both, do that first. Most of the confusion about this seam
is somebody standing in one application and assuming the other one's behaviour.

---

## Why two applications at all

Because one of them runs Typst in a browser.

Ksav's engine compiles to WebAssembly so that the editor can typeset with no
server at all. Girsa's corpus is gigabytes of indexed text with a search engine
over it, and it is not going into a browser tab. The moment that was decided,
one process could not be both, and everything below follows from it.

That is a *forced* decision and worth separating from a weaker one it gets
confused with: the shared code lives in a **third** repository,
[`sefer-crates`](https://github.com/SYKhayyat/sefer-crates), and that is a
choice rather than a necessity.

---

## The shared crates

`sefer-crates` is not a library that both applications happen to use. It is the
seam itself, so that a change to what a quote block *is* lands on both sides as
one edit instead of as an agreement in prose between two repositories.

| Crate | What it owns |
|---|---|
| `girsa-source` | **The Source Packet** — the wire contract. A schema version, a ref, the text, the citation. |
| `girsa-ref` | Canonical refs, citation parsing, and the **redirect table**: refs get stored inside Ksav documents, so when the corpus is re-segmented the pen is the one holding the old name. |
| `girsa-cite` | Citation formatting. The application that *produces* citations and the one that *prints* them are not allowed to disagree. |
| `girsa-ksav` | Writing real Ksav markup. It lives here, not in Ksav, so that Girsa can render a quote into the pen's own language without a second implementation. |
| `girsa-post` | The loopback between the two: token-gated, localhost, no network. |
| `girsa-hebrew` | What a Hebrew letter, mark, prefix and word boundary *are*. |

`girsa-hebrew` is the one worth pausing on. Ksav's speller had written those
tables out by hand and got the word boundaries wrong — maqaf, paseq and sof
pasuq were deleted rather than broken on, so `אֶת־הַשָּׁמַיִם` was absorbed as the single
non-word `אתהשמים` and the shipped dictionary carried eighty-odd of them. The
crate was **already in the binary**, resolved through `girsa-source`, and
nothing referenced it. The correct definition of a word shipped inside Ksav for
months while a wrong copy did the work.

### How they are pinned, and how you edit both halves

Every one of them is a git dependency pinned by commit SHA, in
`ksav/engine/Cargo.toml` and `ksav/app/src-tauri/Cargo.toml`. Bumping is
deliberate: edit the rev in both, and `engine/tests/manifests.rs` fails if the
two ever disagree, because one product must not compile two `sefer-crates`.

They used to be `path = "../../../sefer-crates/crates/…"`, which resolves to a
sibling of the *checkout root*. `git clone ksav && cargo build` therefore failed
inside `cargo metadata`, before a compiler ran, naming a directory the reader
had never heard of — and four CI jobs carried a second checkout purely to fake
somebody's desk layout.

What the path dependency really bought was editing both halves at once, and that
is kept. Copy `.cargo/config.toml.example` to `config.toml` beside it, and a
local `sefer-crates` checkout overrides the pinned one for every crate. The
example is committed; the copy you make is ignored — which is also why this
paragraph does not spell its name as a path, since a page naming a file that is
not in the tree is a thing the documentation fence refuses, and it refused this
one.

---

## The three ways something crosses

### 1 · The loopback — a source, while both are open

The live path, and the one the process boundary earns itself on.

```text
Girsa ──POST /insert──▶ Ksav's desk     a Source Packet
                          │
                          ▼
                       the inbox
                          │
         POST /inbox ◀────┘  the editor, which is where a cursor is
```

Ksav opens a *desk*: a listener on localhost with a token, and it publishes an
endpoint file so Girsa can find it. Girsa posts a packet. Ksav turns it into
real markup **immediately, in Rust**, and puts it in an inbox; the editor polls
and takes it.

Three details that are each load-bearing:

- **An inbox, not a direct insertion.** The desk is a listener on a thread; the
  cursor is in a text editor in a webview. Nothing on that side of the process
  knows where the reader is typing, and a helpful insertion at the end of the
  document would be a source landing where nobody asked for it.
- **What arrives is markup, not a packet.** There is one renderer, in Rust
  (`girsa-ksav`). If the editor were handed a packet and left to render it there
  would be a second renderer in TypeScript, and the two would drift.
- **`/inbox` is a `POST` and it looks like a read.** It *drains* — it empties
  the queue and truncates the file behind it, because two windows asking would
  otherwise each insert the same source. As a `GET` it was drainable by
  `<img src="http://localhost:7878/inbox">` on any page the writer had open; an
  image load sends no `Origin`, so no CORS check anywhere could have refused it.
  The method is what makes the request unforgeable.

### 2 · The clipboard — a source, one application at a time

Girsa writes a Source Packet to the system clipboard **under a real native
format**, taking eighty-six careful lines to do it, because a webview can only
write Chromium's *web custom format* and no native application can read that.

Ksav reads it in the engine, for the same reason: a `paste` event exposes
`text/plain`, `text/html` and files, and a custom native format is not among
them on any platform. So the read happens in the process that can open the real
clipboard, and `POST /clipboard-source` hands back rendered markup.

`{"markup": null}` is the ordinary answer and is **not** a failure — the reader
copied from a text editor, or there is no clipboard on this machine, and the
caller pastes as text. A packet that arrives and cannot be *read*, though, is
not silence: a schema mismatch comes back carrying both version numbers, because
turning that into a quiet plain-text paste is precisely what a schema version
exists to prevent.

### 3 · `ksav://` — a source, when Ksav is not running

A deep link. Girsa fires `ksav://insert?packet=…`, the operating system starts
Ksav, and the packet arrives on the way up.

This is three files agreeing or it is nothing, and it has been wrong in each of
them:

- With Ksav already open, the URL used to start a **second Ksav**. On Windows
  and Linux the deep-link plugin only ever hears a cold start; handing a URL to
  a running process is a companion plugin's job. The packet then waited in a
  window nobody was typing in, and — worse — the duplicate published its own
  endpoint file and **took over the pairing**, so every later send went to it,
  and when it closed Girsa reported that Ksav was not running while the writer
  was looking straight at it.
- The scheme was re-registered on every start, so whichever copy ran last owned
  `ksav://`. It is claimed once, with the claim recorded, and
  `app/src-tauri/src/scheme.rs` decides between *ours*, *vacant*, *stale* and
  *theirs* as a pure function with tests.
- Uninstalling left the registration behind, pointing at a binary that was no
  longer there. The NSIS uninstall hook removes it.

---

## What Ksav asks Girsa for

Six of Ksav's engine services need the installed application beside it. They
exist in the registry on every build — the name, the path and the cost are facts
about the service — and on the browser build they answer with a stated refusal
rather than not existing.

| Service | The question |
|---|---|
| `inbox` | anything handed over since I last asked? (drains) |
| `mekoros` | where is this phrase from? — or, with one flag, *open your search on it* |
| `linkify` | turn the citations in this prose into live refs, the certain ones only |
| `refresh` | every citation in this **document**, as the library has it now |
| `clipboard-source` | is there a packet on the clipboard? |
| `saved-here` | this document lives at this path — for *where did I use this* |

`refresh` is the one that pays for the process boundary. It comes back as rows
the editor shows the writer, offered and never applied: a correction somebody
else made silently rewriting the words in a sefer being written is the one
surprise the whole arrangement exists to avoid. It had a generated client, a
generated registry row, and **no caller in `src/`** — the service that justifies
the seam had no interface at all.

`saved-here` is the mirror of it, and had the same fault from the other end:
Girsa's document registry, its *who cites this* query and its tests were all
built, and nothing ever sent it a path — so the query walked Girsa's own toy
editor's directory and a document written in the real Ksav answered *nothing
cites this*.

---

## The fences across the seam

A contract between two repositories is exactly where a check stops running,
because each half can be green about its own copy.

| Test | What it holds |
|---|---|
| `engine/tests/from_girsa.rs` | a packet **Girsa really produced**, landing on a Ksav page — the hand-built ones in `source.rs` only prove the shape agrees with itself |
| `engine/tests/manifests.rs` | the two Ksav manifests pin the same `sefer-crates` rev |
| `engine/tests/pairing.rs` | the desk, and the moment it is let go of |
| `engine/tests/deep_link.rs` | the scheme is claimed once, and uninstalling takes it away |

The packet-drift check is worth its own sentence, because it was found by
noticing where it *ran*: the fixture proving the two halves agree was checked
only in **Girsa's** CI, so a change on Ksav's side could break the contract and
every job in this repository would still be green. It runs here now, against the
same fixture.

---

## Standing in the right place

When something goes wrong across this seam, the first question is which half
owns the behaviour:

- **The markup is wrong** → `girsa-ksav`, in `sefer-crates`. Not Ksav.
- **The citation prints wrong** → `girsa-cite`. Not Ksav.
- **The ref no longer resolves** → `girsa-ref`'s redirect table, and Girsa's
  corpus. Ksav is holding an old name on purpose.
- **Nothing arrives** → the desk, the endpoint file, and whether a second
  process took the pairing.
- **It arrives and looks wrong on the page** → now it is Ksav's.

And one rule with no exceptions: the two applications must never each hold their
own copy of a shared answer. Every time they have, the copies drifted and the
drift was silent.

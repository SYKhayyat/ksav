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

`girsa-hebrew` is the one worth pausing on, because it is the easiest to
reimplement by accident. Hand-written boundary tables get maqaf, paseq and sof
pasuq wrong in the same way every time — deleted rather than broken on, so
`אֶת־הַשָּׁמַיִם` is absorbed as the single non-word `אתהשמים` — and that mistake reaches
the shipped dictionary. Anything in Ksav that needs to know what a Hebrew word
is asks this crate. It is already in the binary, resolved through
`girsa-source`; there is nothing to add and nothing to write a second time.

### How they are pinned, and how you edit both halves

Every one of them is a git dependency pinned by commit SHA, in
`ksav/engine/Cargo.toml` and `ksav/app/src-tauri/Cargo.toml`. Bumping is
deliberate: edit the rev in both, and `engine/tests/manifests.rs` fails if the
two ever disagree, because one product must not compile two `sefer-crates`.

A pin rather than `path = "../../../sefer-crates/crates/…"`, because that
resolves to a sibling of the *checkout root*: `git clone ksav && cargo build`
fails inside `cargo metadata`, before a compiler runs, naming a directory the
reader has never heard of, and every CI job needs a second checkout to fake
somebody's desk layout.

What the path dependency bought was editing both halves at once, and that is
kept. Copy `.cargo/config.toml.example` to `config.toml` beside it, and a local
`sefer-crates` checkout overrides the pinned one for every crate. The example is
committed; the copy you make is ignored.

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
  otherwise each insert the same source. The method is not cosmetic: as a `GET`
  it is drainable by `<img src="http://localhost:7878/inbox">` on any page the
  writer has open, and an image load sends no `Origin`, so no CORS check
  anywhere can refuse it. The method is what makes the request unforgeable.

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

This is three files agreeing or it is nothing, and each of the three fails
silently on its own:

- **A running Ksav has to receive it.** On Windows and Linux the deep-link
  plugin only ever hears a cold start; handing a URL to a running process is a
  companion plugin's job. Without it the URL starts a *second* Ksav, the packet
  waits in a window nobody is typing in, and the duplicate publishes its own
  endpoint file and takes over the pairing — so every later send goes to it, and
  when it closes Girsa reports that Ksav is not running while the writer is
  looking straight at it.
- **The scheme is claimed once, not on every start**, with the claim recorded,
  or whichever copy ran last owns `ksav://`. `app/src-tauri/src/scheme.rs`
  decides between *ours*, *vacant*, *stale* and *theirs* as a pure function with
  tests.
- **Uninstalling takes the registration away**, through the NSIS uninstall hook.
  Left behind, it points at a binary that is no longer there.

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
surprise the whole arrangement exists to avoid.

`saved-here` is its mirror, and the two share a failure mode worth naming,
because both have had it: a service can be generated on both sides — client,
registry row, query, tests — and still have no caller. Girsa cannot discover
where a reader keeps documents, so if Ksav never sends the path, *who cites
this* searches the wrong directory and answers *nothing cites this* about a
document that cites it.

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

The packet-drift check is worth its own sentence, and the sentence is about
*where it runs*. A fixture proving the two halves agree, checked only in Girsa's
CI, lets a change on Ksav's side break the contract with every job in this
repository green. It runs here as well, against the same fixture.

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

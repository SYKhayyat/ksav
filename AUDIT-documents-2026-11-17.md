# Audit — what an opened document can make the app do

2026-11-17. Covers M3's security item: **links, includes, paths**, and whatever
else a `.ksav` the writer did not write can reach. Scope is the whole path a
document travels — the engine that compiles it, the preview that draws it, the
importers that read other people's files into it, and the two ways a document
arrives from a stranger (a share fragment and a deep link).

Method: read the surface, then find the test that holds it. A claim with no test
behind it is written down here as unverified rather than assumed, and every one of
those became an issue rather than a sentence.

## The surfaces

| surface | what a document could reach | held by |
|---|---|---|
| Typst code — `#read`, `#include`, `#import` by path | the filesystem | `engine/tests/packages.rs::a_local_root_does_not_open_the_disk` (4 rows, all refused: absolute import, sibling import, `read()`, `../../../` out of the package root) and `engine_for`'s builder, which installs **static** resolvers only — prelude, the request's files, bundled packages, optional `@local` root. There is no `FileSystemResolver` over the document's directory at all. |
| `#תמונה(…)` / fonts | any file on disk | They are not paths: bytes arrive on the request and are registered under a name. `assets::diagnose_name` refuses an empty name, the prelude's own name, `..` as a *segment*, leading `/` or `\`, `C:/`-style drive roots and control characters — checked twice, at the reader (so the writer is told) and in `engine_for` (so a library caller cannot reach a panic in `typst-as-lib`'s `VirtualPath`). `engine/tests/asset_names.rs`. |
| `#link("…")` | a navigation: the webview, or the tab | **Finding 1 (#202).** `svgsafe.ts` now keeps only `http:`, `https:`, `mailto:`, `tel:` (or a scheme-less href), drops the rest while keeping the hit area, and adds `target="_blank" rel="noopener noreferrer"`. Fenced in `app/test/svgsafe.test.mjs`. |
| the engine's SVG, assigned to `innerHTML` | arbitrary markup in the app's own origin | `svgsafe.ts`'s allow-list, generated from the **measured** vocabulary (`engine/tests/svg_output.rs`), with `on…` refused by prefix, script-bearing elements denied, `javascript:`/`vbscript:`/`data:text/html` refused on every URL-carrying attribute, and comments/CDATA dropped whole. `app/test/svgsafe.test.mjs` and `engine/tests/svg_output.rs::nothing_the_engine_emits_is_a_payload` (the measurement, not an opinion). |
| prose mode's table widget | the same origin, via `innerHTML` | `ksav-lang.ts`'s `renderInline` escapes **per character**; the only markup in the result is the tags it generates itself. |
| a `.docx` the writer was sent | memory: a zip bomb | **Finding 2 (#203).** `decompress.ts` counts bytes as they arrive and `unzip` is told which three entries the importer reads. `app/test/decompress.test.mjs`; `prohibitions.test.mjs` refuses a new unbounded `DecompressionStream` anywhere. |
| a `.docx`'s XML | entity expansion, DTD | `docx.ts` parses with a hand-rolled reader that implements no DTDs and no entities beyond the five. `app/test/docx.test.mjs`. |
| a share fragment `#ksav=…` | memory (deflate), then the editor | Bounded as above. The document **never leaves the fragment**, so it is not sent to whatever serves the static build — the property the feature exists for. |
| a deep link `ksav://…` | anything but a citation | `deliver` accepts exactly one errand, `girsa_post::Errand::Insert`, and hands it to `post::arrived`. `engine/tests/deep_link.rs` holds it to one call site, and the three routes that can deliver a URL (argv, second-instance argv, open-url event) all go through it. |
| a request to the compile server | memory, threads | `server.rs::max_body_bytes` — 64 MB, `read_to_string` over `take(max + 1)`, movable by `KSAV_MAX_BODY_BYTES` for a deployment that knows better. |

## What is *not* defended, on purpose

- **Image and font decoders.** Typst parses the bytes of a PNG, JPEG or SVG image
  and of a user font. A hostile image or font exploits a decoder in Typst's own
  dependency tree, not anything in this repository, and the honest answer is to
  keep that tree current rather than to filter bytes here (#131's signed builds
  are the related release-side work).
- **A document that is simply enormous.** A 60 MB `.ksav` compiles slowly and
  takes memory; the body cap bounds the request and nothing pretends a
  pathological document is fast. `#183` measured the ordinary case (3.3 ms per
  keystroke at 235 pages).

## What is unverified here, and where it went

1. **Where a link goes in the desktop shell.** The sanitizer's refusal does not
   depend on the answer, but the *behaviour* does: Tauri may open a new window, or
   hand the URL to the system browser, or refuse. Nobody in this repository has
   measured it. Proposed fix is an `on_navigation` guard that permits only the
   app's own origin, plus an explicit door for a document's link — #202.
2. **Whether the installed build's CSP is the same one `policy.rs` states.** The
   gate checks the file and `build.rs` fences it; the runtime header was not
   observed on an installed build. (`AUDIT-shell-2026-11-17.md` records the same
   gap from the shell side.)
3. **AT-SPI / accessibility on Linux** — not security, but the same "unverified on
   a second platform" shape: #189 is open about the webview never reaching `setup`
   on the CI runner.

## Findings filed

- **#202** — a document's link navigates the app: schemes of the document's
  choosing, no tab, and the desktop's own window as the destination. *Fixed in
  `81c8d5e`; the desktop navigation policy is the open half.*
- **#203** — two decompression routes let the input decide how much memory to
  allocate: a `.docx` import and a share link. *Fixed in `e4e5b88`.*

Both were found by measurement — the `#link` one by a document added to
`svg_output.rs`'s corpus, which moved a committed vocabulary the client's
allow-list is generated from; the decompression one by reading the two `inflate`
call sites against the shape of the platform's API. Neither was reachable by
looking at the page.
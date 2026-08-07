# Borrowed Wave II — typstify, and the fourteen features around it (2026-08-04)

[typstify](https://github.com/typstify/typstify) is a Go/Gio desktop IDE for
Typst — tinymist LSP, a package manager, `publish package`, git diff gutters,
Zotero sync, an embedded coding-agent chat with an MCP server. Its README tells
you to *"place the executables `typst` and `tinymist` in the root folder"*, which
is the whole philosophical difference: it drives external binaries, Ksav embeds
the compiler. Apache-2.0, so code could have come across; none did, and none
needed to. What came across is which problems are real.

Most of typstify's surface is aimed at somebody who wants to write *Typst*, not
somebody who wants to write a *sefer*. The intersection is four things, and this
wave took all four plus the ten features that reading it prompted.

## What was taken from typstify

| | |
|---|---|
| **The overview ruler** (`editor/ruler.go`) | A strip beside the scrollbar with a tick per problem. Ksav already computed every one of them — compile errors, misspellings, unclosed brackets, orphaned deferred notes, changed lines — and threw away the only view that makes them useful at length. In a three-hundred-page sefer "four problems" is not knowledge; "all in perek gimmel" is. |
| **The diff gutter** (`editor/diff.go`) | Theirs is against `git HEAD`. A bochur has no repository, but Ksav takes periodic snapshots, and *"what did I change since Shabbos"* is the question actually being asked — so that is the baseline, and taking a snapshot clears the gutter. |
| **The file watcher** (`service/filewatcher.go`) | Not a feature: a hole. See below. |
| **Crash report + update check** (`ui/crash_report.go`, `ui/settings/update_check.go`) | Both routine, both missing. |

**Explicitly not taken:** the package manager and Zotero sync. Both are the right
idea pointed at the wrong ecosystem — `@preview/*` is English academic packages,
and supporting it means putting a network, a resolver and a cache inside an engine
whose entire design is that it has no filesystem. The needs *underneath* them are
real, and they became the source index and the sefer catalogue.

## The hole worth naming first

`files.ts` binds a document to a real path and `save.ts` writes to it on a
thirty-second timer, and **nothing anywhere asked whether that file still held
what Ksav last put there**. Dropbox pulling an older copy down, a second window,
a text editor open on the same file, `git checkout` — in every one of those the
next autosave silently overwrote somebody's work with no error, no prompt and
nothing in the log. It had been there since the file binding shipped.

The unit is a **stamp** — mtime and size at the moment Ksav last read or wrote —
which polls identically through Tauri, a browser file handle, a focus event and a
timer, and needs no privileged watcher. The decision worth recording is the
*direction of the default*: **"cannot tell" reports as unchanged.** A false
"changed" means a prompt on every save on any platform that cannot stamp, which
teaches the writer to dismiss the prompt without reading it — and a prompt nobody
reads is worse than none, because it also convinces everyone the problem is
handled. Everything else follows: the background autosave never resolves a
conflict, it stands down; a manual Save asks, because the writer is there to
decide; reload-from-disk snapshots first, since the version history is the only
thing that makes it reversible.

## The fourteen

1. **מפתח מקורות** — the generated source index. The flagship, and the one thing
   here Word cannot do at all. It needs three facts a string does not carry: that
   ב״ב and בבא בתרא are one masechta, that בבא בתרא follows בבא מציעא
   (alphabetically it precedes it), and that ג. precedes ג: precedes ד.
   `engine/src/sefarim.rs` is the single catalogue — Tanach, all 63 masechtos in
   seder order, Rambam, Shulchan Aruch — and it generates both the prelude's
   lookup and the editor's autocomplete, so the two cannot become two opinions.
   `every_alias_is_unambiguous` immediately found that מ״ב was claimed by both
   מלכים ב and משנה ברורה.
2. **מפתח ענינים** — the topic index, on the same machinery. Page numbers are
   right by construction: read off the finished layout, never predicted. They
   follow the document's own numbering, so a sefer numbered א,ב,ג gets a Hebrew
   index with nothing configured. Terms sort by their *letters* — the gershayim
   is U+05F4, above every Hebrew letter, so a raw sort exiles every abbreviated
   term past the end of its own letter's run.
3. **A sefer is many files** — `#כלול("פרק ג")`, expanded in the engine with a
   line map so a diagnostic still reads *"פרק ב · שורה 2"* and clicking it opens
   that chapter. Typst's own `include` could not be used: it takes a string
   literal (so `#כלול` could not be a function) and gives the included file its
   own scope (so the prelude would be invisible inside a chapter).
4. **Import .docx** — the easy direction, which had been skipped; Ksav solved the
   hard one first. No dependencies: a zip reader plus `DecompressionStream`.
5. **Two-sided page setup** — inside/outside margins that mirror by page parity,
   a binding gutter, verso/recto running heads, outside-edge page numbers. A
   uniform `margin_cm` was a hard stop for anyone taking a file to a printer.
6. **Real PDF export options** — PDF/A standards, tags, metadata, page ranges.
   `typst_pdf::pdf(..).ok()` had been throwing every export diagnostic away, so a
   failed export came back as `ok: true` with no bytes and no explanation.
7. **PWA** — manifest and service worker. The wasm build was *already* a static
   site running the real compiler in-browser with documents in IndexedDB; this is
   the whole difference between that and an app on a phone that works on the bus.
8. **Share links** — the document in the URL *fragment*, which is never sent to a
   server. The review tools already rewrite the source, so "a link for comments"
   needs nothing installed at the far end and no infrastructure at this one.
9. **Vim and Emacs** — the real implementations, loaded on demand. The mode wins
   over Ksav's own shortcuts, and each gets its native save (`:w`, `C-x C-s`);
   an Emacs mode without C-k and C-y is the costume this was asked not to be.
10. **Focus and typewriter modes** — two settings, because they are two things:
    one is about what you can see, the other about where the line you are on sits.
11. **Orphan letters** — a one-letter preposition is never left at a line end.
    Off by default: it changes where lines break, and turning it on for every
    document ever written would silently repaginate all of them.
12. **Rashi script** — `#כתב_רשי`, with a fallback chain. Ksav bundles no Rashi
    font and will not; every one worth using is commercial or of unclear licence.
13. **Crash recovery** — the text is stashed *synchronously* before anything else
    is attempted, then offered as a download, then the stack. typstify's
    priorities inverted on purpose: for a Go IDE the stack is the point; for a
    writing tool it is a distant second to the words.
14. **In-app update check** — one named CSP origin, no telemetry, no
    auto-download, and nothing on the request but the request.

    > **Corrected, 5 August 2026.** "One named CSP origin" was true of *one of
    > the three copies of the policy*. Vite's had `https://api.github.com`; the
    > engine's and Tauri's did not, and a browser **intersects** the policies
    > delivered to a document rather than letting the last one win — so the
    > feature was dead in both builds that ship an installer, which are the only
    > two that cannot update by pressing reload. The policy is now
    > `ksav/policy/csp.txt`, read by all three, and the desktop build fails if
    > `tauri.conf.json` disagrees with it.

## What this wave did not do

- **Nobody has clicked any of it.** The headless browser on this machine cannot
  reach loopback. What is verified is 301 engine tests, 1313 app tests, `clippy
  -D warnings`, `tsc`, `cargo check` on the Tauri crate, and a production build —
  which covers the arithmetic and the wire and does not cover the pixels. Vim
  mode in particular has never had a key pressed in it.

  > **Overtaken, 6 August 2026.** Both halves were wrong, and the second one was
  > hiding a bug. The headless browser *does* reach loopback — as `localhost`,
  > not `127.0.0.1` — so this bullet's premise had expired. And a key has now
  > been pressed in vim mode. It found this: with vim or emacs on, **none of the
  > hydra's keys did anything**. Press the `a` the panel offers for "new item"
  > and vim went to INSERT; press `b` and the caret moved back a word, left the
  > list, and the structure watch closed the panel. Escape did not close it
  > either — vim took that to leave visual mode. Eleven operations on screen,
  > each with its key printed beside it, and not one of them connected.
  >
  > The keys were a `Prec.highest` keymap entry under a comment claiming it sat
  > "ahead of everything, including the mode keymaps". No position in that array
  > could have made that true: `@replit/codemirror-vim` handles keys from a
  > **ViewPlugin event handler**, and a plugin's DOM handlers run ahead of the
  > whole `keymap` facet whatever its precedence. Precedence orders facet inputs
  > against one another; it does not order a facet against a plugin. The keys
  > are a capture-phase listener on `window` now, installed when a hydra opens
  > and removed by the panel registry's own close hook — first by a fact about
  > the DOM rather than by a hope about a library.
  >
  > Verified afterwards in a browser, both modes: `a` adds an item and vim stays
  > in NORMAL, `a a a` adds three because staying open is the point, Escape
  > closes the panel and not the mode, `Mod-S` still reaches the save, and with
  > the panel shut vim gets every key back exactly as before. Which is the whole
  > argument for `plan-notes-and-ui.md:165` restated: an hour of use beat three
  > audits by six to nothing, and one keypress beat 3,528 assertions by one.
- **The wasm module must be rebuilt** for `ksav_sefarim` to exist in the browser
  backend. The Rust is in; `wasm-pack build` is not part of a normal checkout.

  > **Overtaken, 5 August 2026.** Worse than this bullet knew. The Rust was in
  > and the *worker's dispatch table* was not, so rebuilding would not have
  > helped: `FNS["sefarim"]` was `undefined`, the call threw, and `sefarim.ts`
  > swallowed it. That is the whole of finding §2 in
  > `lamdan/whole-repo-2026-08-05.md`, and the fix was to delete the four
  > hand-written registries rather than to add a ninth export to one of them.
  > There is now one table — `engine/src/services.rs` — and one wasm export,
  > `ksav_call(name, input)`, so the browser build cannot be missing a service
  > the engine has. See `ksav/README.md` § *The engine's services*.
- **The `#כלול` directive rule is now written twice**, once in Rust and once in
  TypeScript. If the two disagree, the client never sends a chapter the engine
  then reports as missing. Both suites pin the same cases deliberately; that is a
  mitigation, not a fix.
- **Auto-nikud was dropped** from this wave on purpose.
- **Still nobody has written a real sefer in Ksav.** Unchanged, and still worth
  more than the next fourteen features.

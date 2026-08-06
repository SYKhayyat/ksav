# `policy/`

One file per rule that more than one build has to obey.

## `csp.txt`

The Content-Security-Policy every Ksav build delivers, as one line, with no
comments in it — because three programs read it as data.

| Reader | How |
|---|---|
| `ksav serve` | `engine/src/policy.rs` — `include_str!`, sent as a header on HTML |
| the built SPA | `app/vite.config.ts` — `readFileSync`, injected as a `<meta>` tag |
| the desktop app | `app/src-tauri/tauri.conf.json` — Tauri needs the literal in its own config, and `app/src-tauri/build.rs` fails the build if it differs from this file |

It used to be three hand-written strings, and `vite.config.ts` carried a comment
asserting they were the same policy. They were not. Only Vite's allowed
`https://api.github.com`, and **multiple CSPs delivered to one document are
intersected, not overridden** — so the update check (`app/src/update.ts`), whose
entire purpose is that *"an installed Ksav has no way at all to learn that a
newer one exists"*, was blocked in both builds that ship an installer and worked
only in the browser build, where you update by pressing reload. Tauri's copy was
also missing `worker-src` outright, which nobody had noticed either.

The comment asserted the invariant instead of the build checking it. Now the
build checks it, and there is nothing left to assert.

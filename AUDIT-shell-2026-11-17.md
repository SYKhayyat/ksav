# Shell audit — 2026-11-17

PLAN line 116: *"Tauri shell audit (it was not covered by the #140 sweep): IPC
surface, file-system scope, updater."* This is that audit, done as a reading of
the boundary rather than a pen test: every claim below names the line that
enforces it, and the section at the end says what was **not** verified.

The shell is small on purpose (one engine command, eight file commands), so the
surface is short enough to hold in one head — which is why this audit could be
finished in an afternoon and `#140`'s sweep could not cover it.

## 1 · The capability grant says "nothing"

`app/src-tauri/capabilities/default.json` grants `core:default` and nothing else:
no `fs`, no `shell`, no `http`, no `dialog`. The dialogs the application uses are
opened **from Rust** (`app.dialog()` on an `AppHandle`), which does not go through
the webview's permission set at all. So a script running in the webview cannot
reach a file, a process or a dialog through Tauri's own APIs; the only doors are
the `generate_handler!` list, each of which checks something.

Fenced in `app/test/wire.test.mjs`: every `ksav_…` name the frontend invokes is
in that list, so a command cannot be *invoked* and unregistered, and — the
direction that matters here — a command in `src/*.ts` that the shell never
registered fails the suite rather than the writer.

## 2 · Every file operation is keyed on a dialog

`AllowedPaths` (`src-tauri/src/lib.rs:212`) is a session set of paths the writer
picked in a native dialog. `ksav_read_file`, `ksav_write_file` and
`ksav_file_stamp` all refuse anything else, and each refusal names the reason.
`ksav_save_file` and `ksav_save_export` write **the path the dialog returned** —
the frontend never supplies one — so a Save-As binds only what the writer chose.

Two properties worth stating because they are the ones that usually fail:

- **The key is normalized** (`normalize`, `lib.rs:234`): `canonicalize` where the
  file exists, which defeats `..` and symlinks; the path as given where it does
  not, because Save-As names a file that is not there yet. A traversal test exists
  (`tests::traversal_does_not_reach_a_path_that_was_never_chosen`).
- **`ksav_confirm_write` appends the path itself** to the message
  (`lib.rs:520`), so the dialog cannot name one file while the allow-list admits
  another. The wording comes from the frontend because the two languages live
  there; the *fact* does not.

## 3 · The one command that reaches the engine filters by name, not by reach

`ksav_call` (`lib.rs:134`) dispatches any service in the registry, including the
seven `Reach::Native` ones — `git`, `inbox`, `clipboard-source`, `saved-here`,
`mekoros`, `linkify`, `refresh`. This is intended: those are the desktop
integrations, and the browser build hides them because it has no route to them.
The consequence is worth writing down: **the desktop webview's blast radius
includes running the writer's `git` in a directory named in the request.**

That is bounded by the service's own args, not by the caller's good manners:
`engine/src/git.rs:122` builds every invocation from a fixed argument list, adds
`-c protocol.ext.allow=never` (which closes `ext::sh -c …` as a transport),
disables terminal prompts, and never passes a shell. So the worst a name-and-JSON
caller achieves is *a fixed git operation in a directory the process can reach* —
a real capability, and not a command injection.

The loopback desk, the other network edge, binds `127.0.0.1:0`
(`girsa-post/src/desk.rs:102`) with a token written beside the endpoint file, and
`Drop` closes the listener (`Server::unblock` then join) rather than leaking a
bound port. Verified in the dependency's source, since it is the one piece of
this boundary that lives outside the repository.

## 4 · Document text cannot become markup

The three `innerHTML` sites on a document's path, and why each is closed:

- **Preview pages** go through `sanitizeSvg` (allow-list of elements and
  attributes, `app/src/svgsafe.ts`) before `host.innerHTML`
  (`preview.ts:1089`). The module's comment records the two payload routes that
  were measured closed — an SVG asset arrives as a base64 `xlink:href` on an
  `<image>` (not script), and Typst escapes text content — and says plainly that
  this is hardening, not the close of a live hole.
- **Prose-mode tables** build their HTML from `renderInline`
  (`ksav-lang.ts:466`), which escapes **every character** of document text
  individually and emits only tags from a fixed `INLINE_TAG` table. A document
  containing `<img onerror=…>` renders as those characters.
- **`preview.ts:566`** assigns `""`.

## 5 · The CSP is one file, and it is fenced

`engine/src/policy.rs` holds the policy; `app/src-tauri/build.rs` fails the
desktop build when `tauri.conf.json` disagrees, and a `cargo test` fails without
Tauri. Properties read off the delivered policy:

- `script-src 'self' 'wasm-unsafe-eval'` — no inline script, so an injected
  `<script>` in any markup that did slip through would not execute;
- `object-src 'none'`, `base-uri 'self'`, `form-action 'none'`,
  `frame-ancestors 'none'`;
- `connect-src` names **one** network origin: `https://api.github.com`, for the
  update check. It is the only egress channel the webview has, it is deliberate,
  and there is a test named for it (`the_update_check_has_somewhere_to_ask`).

## What this audit did not verify

- **Behaviour inside an installed build.** Everything above is a reading of the
  source and of the config that build.rs holds to it. The packaged binary was
  exercised in #133 (install, launch, bound file, uninstall), not for these
  properties.
- **The updater's downloads.** `#131` (signed or checksum-verified builds) is
  still open. The policy permits the *check*; nothing here says the artifact that
  comes back is authentic, and that is the gap the plan already records.
- **The other applications on the machine.** The loopback desk is authenticated
  by a token in the endpoint file, but any local process that can read that file
  can post to it. That is the shared design with Girsa and not a defect found
  here.
- **Nothing was found at the level of "issue".** The audit closes PLAN line 116's
  reading; the remaining work in it is `#131`, which is already filed, and the
  packaged-build verification that belongs with #134.

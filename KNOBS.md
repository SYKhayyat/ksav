# KNOBS.md — a config-surface audit of Ksav

Run 2026-10-16, against `HEAD = bdb7af8` plus one uncommitted file
(`ksav/app/src-tauri/src/main.rs` — in-flight Wayland/X11 work for #103).

No source file was changed by this run. Eleven issues were filed; this document is the
full reasoning behind them, including everything that was considered and **rejected**.

---

## Start here

### What this audit was looking for

Values that the code has hardcoded, which a person deploying or running Ksav might
reasonably want to change — ports, timeouts, limits, paths, endpoints — but cannot
change without editing the source and rebuilding.

The test applied to each one was **not** "is this number ugly?" It was **"does this
value already differ between places it appears?"** A large, ugly, well-named number
that is the same everywhere is a perfectly good constant. A quiet `2` that is `2` in
development and `16` in production is a real problem.

### The short version

Ksav has an unusually complete **writer**-facing settings system, and almost no
**deployment**-facing one. Roughly fifty `#הגדרות_*` document settings, forty-odd typed
`DocConfig` fields, unknown keys rejected by name, and a test that renders twice and
diffs to prove every setting moves something. That is genuinely strong work.

But the whole engine reads exactly **two** environment variables. `settings.ts` is
`localStorage` — per-writer preferences, not deployer config. So there is no
deployment configuration surface at all, which is what most of the findings below are
the shape of.

A second, separate class of finding is **drift**: one policy written down twice, in two
places, with nothing checking they agree. Some of those are more serious than the
configuration ones. The paper-size bug (#106) is the worst thing this audit found, and
it is not a configuration problem.

### The eleven filed issues

| Issue | In one sentence |
| --- | --- |
| [#106](https://github.com/SYKhayyat/ksav/issues/106) | **The paper-size table is written twice and the copies disagree.** Ask for B5 and you get A4. Critical. |
| [#107](https://github.com/SYKhayyat/ksav/issues/107) | Three different Node versions written down; the one building the shipped Linux installers is end-of-life. |
| [#108](https://github.com/SYKhayyat/ksav/issues/108) | Setting `KSAV_TOKEN` silently disables seven features for every browser user. |
| [#109](https://github.com/SYKhayyat/ksav/issues/109) | The client's compile timeout is hardcoded and only matches the server's by coincidence. |
| [#110](https://github.com/SYKhayyat/ksav/issues/110) | Four engine limits have no override, while the engine's other two do. |
| [#111](https://github.com/SYKhayyat/ksav/issues/111) | The dev-server address allowlist is closed, and holds a dead port. |
| [#112](https://github.com/SYKhayyat/ksav/issues/112) | The update-feed address is hardcoded and welded to a checked CSP. |
| [#113](https://github.com/SYKhayyat/ksav/issues/113) | Two unlinked `5173` literals and no `strictPort` means a blank window with no error. |
| [#114](https://github.com/SYKhayyat/ksav/issues/114) | A queue sized for one writer is enforced on a server built for many. |
| [#115](https://github.com/SYKhayyat/ksav/issues/115) | The "write it once" rule is only enforced in two kinds of file, and skips build commands entirely. |
| [#116](https://github.com/SYKhayyat/ksav/issues/116) | **The editor test suite does not run at `HEAD`.** Found while verifying this audit. |

Two further findings were **folded into existing issues** rather than filed separately,
because they share a root cause: the window-geometry duplication went to
[#102](https://github.com/SYKhayyat/ksav/issues/102), and a third unfenced copy of the
`ksav://` scheme literal went to
[#104](https://github.com/SYKhayyat/ksav/issues/104).

One candidate was **dropped entirely**: the Rashi font chain. Its own comment explains
the decision deliberately, which makes it a documented choice rather than an unwritten
policy. Filing it would have been noise.

### If you read nothing else

Read §B first if you want the bugs. §A if you want the configuration surface. §D if you
want to know what was deliberately *not* touched, and why — which in a repo this
well-defended is most of the work.

### A few words this document uses

- **knob** — a value a deployer can move without a code change. A named constant is
  *not* a knob, however well named.
- **variance** — evidence that a value genuinely differs between environments, machines
  or customers. This is what makes something a candidate. Guesswork that it *might*
  vary is not enough.
- **fence** — this repository's word for a test that fails when a specific thing goes
  wrong. `prohibitions.test.mjs` is the general one; there are many specific ones.
- **duplication / drift** — one policy stated in two places with nothing checking they
  still agree. Different from a knob, and often worse.
- **evidence of variance** — the same literal appearing twice with different values; a
  comment saying "hardcoded for now"; two config files disagreeing; a CI matrix that
  already varies. Loudness of a number is **not** evidence.

---

## Why most of this repository is correctly *not* a knob

A naive search for hardcoded numbers in this codebase returns hundreds of hits. Almost
all of them are correct, and the reason is structural rather than a matter of judgement:

- **The document axis is already fully knobbed.** `ksav/engine/typst/ksav.typ` carries
  ~50 `#הגדרות_*` commands over 13 `_*_defaults` tables, and `DocConfig`
  (`engine/src/lib.rs:126-290`) carries 40+ clamped fields. `settings_keys.rs` rejects an
  unknown key **by name** at the moment of the call; `settings_live.rs` renders twice and
  diffs, so a setting that moves nothing fails. That is a *stronger* version of the
  drift check a config audit would normally have to ask this repository to add.
- **The deploy axis is nearly empty.** The entire engine reads exactly **two**
  environment variables: `KSAV_COMPILE_TIMEOUT_MS` (`server.rs:239`) and `KSAV_TOKEN`
  (`server.rs:621`). `ksav/app/src/settings.ts` is `localStorage` (`settings.ts:769`
  key, `:906` write) — per-writer preferences, **not** deployer config. The dead
  `HttpBackend.base` parameter (`api.ts:1471`) is never passed by either of its two
  constructors, which is the clearest single sign that nobody expected a deploy
  surface here.

So the honest shape of this audit is: **a mature product with an empty deploy-config
layer**, plus a smaller set of drift defects that a literal sweep found on the way.

## Baseline, captured before anything

`cd ksav && node tools/gate.mjs` → **6 of 9 checks fail on a clean tree**. Captured at
`95da28c`, before this run touched anything. All six failures are pre-existing; none was
caused by this run, which changed no source file.

| Check | Result | Why |
| --- | --- | --- |
| engine / wasm / desktop-shell formatting | ✗ ×3 | **this machine only** — `cargo fmt` is not installed here (`error: no such command: fmt`) |
| desktop-shell lints, desktop-shell tests | ✗ ×2 | **this machine only** — `gobject-2.0` not found, so the Tauri crate cannot build here at all |
| editor suite | ✗ | **real** — `browserlang.test.mjs` asserts nothing. The other **124** test files pass |
| editor typecheck, engine lints, engine tests | ✓ | — |

Two consequences worth stating plainly:

- **No Tauri-region finding in this document has been executed.** The desktop-shell
  checks cannot run on this machine, so everything about `ksav/app/src-tauri/` is a
  static reading of the code, not an observed behaviour.
- **The baseline went stale under the audit, and that is its own finding.** `HEAD` moved
  four commits while this audit was running (see §F). By the end, the editor suite could
  no longer start at all — `768b414` added four `url()` references to `styles.css` that
  the test bundler cannot resolve. That is [#116](https://github.com/SYKhayyat/ksav/issues/116),
  and it was found because this audit tried to re-run the gate and could not. The
  `124 files pass` figure above applies to `95da28c`, not to `HEAD`.

## Excluded, said out loud

`docs/`, `decisions/`, `lamdan/`, `audit/`, `.preview-tmp/`, `.scratch/` (the prose
record — `prohibitions.test.mjs` skips `decisions/` and `lamdan/` for the same reason);
`node_modules/`, `target/`, `dist/`, `.tmp-test/`, `wasmpkg/` (vendored, generated,
build output); all `*.md`; the 22 `.ksav` template bodies (document content — a phone
number, a blessing); all of `engine/tests/` and `app/test/` (read as fences, not swept
for candidates). Regions swept: engine core, the Typst prelude, the Tauri shell,
app/src, packaging + CI + Nix, and wasm/editors/tools/examples.

---

## A. True knobs — real variance, a deployer cannot move them

These are the values that genuinely differ between situations and that nobody can move
without a rebuild. The **Axis** column is shorthand for *why* they differ:

- **Environment** — it depends on the machine, the network, or how the thing was
  deployed. Ports, timeouts, memory limits, paths. Changing it needs a rebuild today.
- **Tenant/operator** — it depends on who is using it and how many of them there are.
  Quotas, capacities, per-customer limits.
- **Mode** — it depends on what the program is currently doing. Debug flags, log levels.
  The right home for these is usually a command-line flag, not a config file, and most
  of the Mode row below was rejected on exactly that ground.

Ranked by how certain the variance is, multiplied by how much breaks if the value is
wrong for your situation.

| # | Value | Axis | Evidence it already varies |
| --- | --- | --- | --- |
| A1 | Node pinned **three ways**: `.nvmrc:1` `26.4.0`, 14 workflow sites `node-version: 24`, `flake.nix:72` `nodejs_24`, `linux.Dockerfile:47` `setup_20.x` | Environment | Three live values. `.nvmrc` (committed `0d0b013`) is referenced by **nothing** — no `node-version-file:`, no `engines` in any of the three `package.json`s. The Docker path builds the shipped `.deb`/`.AppImage` on **Node 20**, which `flake.nix:66-70` records as EOL since 2026-04-30 |
| A2 | Rust: `rust-toolchain.toml:4` pins `1.97.1`; 11 workflow sites say `dtolnay/rust-toolchain@stable` | Environment | The pinned file's own comment says *"Do not change this to `stable` — an exact version is what makes this project still build years from now"*. Inside a checkout the pin wins, so 1.97.1 is the effective version today; the divergence is in what each file *asserts* |
| A3 | `server.rs:539-544` `DEV_SERVERS` — a closed CORS allowlist with **no override** | Environment | Contains port **1420**, Tauri 1's old dev port. Three hits repo-wide: the two list entries and `server.rs:1004`, the test that asserts the list. Nothing else. Meanwhile the real dev origin is `tauri.conf.json:8` `5173` and `vite.config.ts:217` `5173`. A stale entry with a green test around it is proof the list rots unfenced |
| A4 | `api.ts:1493-1503` never sends `X-Ksav-Token` | Environment | `X-Ksav-Token` exists at `server.rs:601,627,640` and **zero times in any `.ts`**. `server.rs:603-604` admits the design (*"a per-run secret the embedded bundle cannot be given is a secret the served page cannot send"*), but the consequence is not documented: setting `KSAV_TOKEN` bricks the 7 `nativeOnly` services (`services.gen.ts:38-44`) for **every** shipped client |
| A5 | `api.ts:1564` `COMPILE_TIMEOUT_MS = 20_000` | Environment | Its comment says *"mirroring the server's"*. True only at the default: `server.rs:238-245` is also 20 s but overridable. No test relates them (3 hits for `KSAV_COMPILE_TIMEOUT_MS`, all Rust/docs). Raise the server's budget and the desktop app abandons at 20 s while `api.ts:1588-1606` tells the writer it *"will finish in the background"* |
| A6 | `git.rs:62` `DEADLINE = 120s` — the only network timeout in the product | Environment | Used at `git.rs:201`, no override. The engine's other timeout has one. Its own doc comment justifies the number by link speed, i.e. by environment |
| A7 | `server.rs:201,289` in-flight compile cap = `worker_count()`, clamped `2..16` | Environment | `run_bounded`'s **two** policy arguments are asymmetric: the deadline is env-overridable, the cap is not, and `server.rs:319` prints `{taken}/{max}` to the writer. `worker_count()` is also the thread-pool size (`server.rs:455,507`) — two distinct policies welded to one expression |
| A8 | `server.rs:190` `MAX_BODY_BYTES = 64 MiB` | Environment | Enforced twice (`:211`, `:219-220`). Its comment sizes it to *"a document plus every image and font attached to it"* — i.e. to client upload behaviour, which is exactly what differs per deployment |
| A9 | `assets.rs:61` `CACHE_CAP_BYTES = 256 MiB` | Environment | Its comment scopes it to *"every document a **long-running `ksav serve`** compiles"* — an explicit statement that the cap is sized per deployment |
| A10 | `post.rs:111` `WAITING_ROOM = 64` | Environment/tenant | Justified as *"far more than a writer queues by hand"* — a judgement about one writer, applied to a queue on a server `server.rs:406` documents as bindable to `0.0.0.0`. The 65th sender is refused with "editor not running", which is false there |
| A11 | `update.ts:18` release-feed URL | Environment | The product's only outbound origin with no deployer control, coupled to `policy/csp.txt`, a file whose equality three programs assert. `policy/README.md` records this exact coupling already breaking the feature once. `update.ts:76-78` swallows every failure, so a moved feed dies silently |
| A12 | `lib.rs:682` bare `"ksav"` scheme literal | Environment | `post::scheme()` exists at `post.rs:701` **for this purpose**, and `deep_link.rs:182-216` fences `tauri.conf.json`'s copy against it — but `scheme()` is called **only from that test**. Rename the scheme and the fence stays green while `lib.rs:682` silently stops claiming it |
| A13 | `ksav.typ:8019` Rashi font chain | Environment | Five families, **none bundled**; fonts arrive per request via `assets.fonts` (`assets.rs:112`). Only reachable per-call via `גופן:` |
| A14 | `tauri.conf.json:8` `devUrl` `5173` vs `vite.config.ts:217` `port: 5173` | Environment | Two unlinked literals, no `strictPort`, and no test either. Vite slides to 5174, the shell loads 5173, `npm run tauri dev` opens a blank window with no error |
| A15 | `lib.rs:626` `<app_data_dir>/packages` | Environment | Its sibling in the same directory *is* env-overridable — `KSAV_DICTIONARY` at `lib.rs:72`. An asymmetry the code decided against for one path and not the other |
| A16 | `lib.rs:588` `LevelFilter::Info`, no `RUST_LOG` | Mode | Hardcoded; release detaches stdout (`lib.rs:580-585`) so the file target is the only sink |
| A17 | `main.rs:59` `unwrap_or("127.0.0.1:7878")` | Environment | A flag exists (positional), but the literal is restated as prose at `main.rs:30` and again at `server.rs:534`. `docs/troubleshooting.md:51` documents overriding it. The Emacs client deliberately uses `7879` (`ksav-engine.el:71`) — this repo has *already demonstrated* the value diverges |
| A18 | `ubuntu-22.04` in 17 sites | Environment | `ci.yml:492` is already `ubuntu-24.04`. One support-floor policy, 17 restatements |
| A19 | `release.yml:225-231` hardcoded artifact filenames | Environment | The real names are computed by `tauri-action` from `tauri.conf.json`; rename the product or bump the scheme and the download table — the page a reader actually follows — is wrong |
| A20 | `eyes.mjs:149` `8731 + (pid % 200)` | Environment | The only tool that had to solve port collision, solved by arithmetic, with **no flag and no env**, and `--strictPort` (`:153`) making collision a hard failure. Its sibling `acceptance.mjs:155` solves the identical problem with a `--port` flag |
| A21 | `emacs/ksav-engine.el:202` 600 s download deadline | Environment | For a ~100 MB binary; the file's own comment says it downloads *"a hundred megabytes over somebody's connection"*, and it already has `ksav-start-timeout` (`:87`) as a `defcustom` for this class |
| A22 | `main.ts` file-extension policy in 6 hand-typed sites | Environment | Open accepts `.ksav,.typ,.txt` (`files.ts:37,113`); save accepts `.ksav` only (`files.ts:231`). No fence |

**The right vehicle for A3–A21 is an env var read next to the constant, not a config
file.** The repo already does this twice in the same file (`server.rs:239`, `:621`),
and the editor side already has `ksav-port` as a `defcustom` with a comment explaining
exactly why it differs from 7878. Adding a properties file here would be the second
source of truth anyone warns against, with no existing config system to extend —
because there isn't one.

## B. Real defects that are **not** knobs

Everything in §A is about configuration. This section is not, and it is here because
some of it matters more.

These are **bugs**: a policy written down twice with nothing checking the two copies
agree, a value the code reads from a place that has quietly stopped existing, a message
that says something false. None of them vary by environment — they are simply wrong.
Calling them knobs would be a category error, so they are listed separately.

The serious ones are **B1** (two disagreeing paper-size tables, one of which silently
turns anything it does not recognise into A4) and **B2/B3** (a hand-maintained list
across a language boundary, and a test that fences a copy of a constant that nothing
uses). **B10** is a plain user-facing bug: an English document that picks "image" from
the palette prints a Hebrew placeholder string.

Found on the way. These are drift and correctness bugs, and calling them knobs would be
wrong — they do not vary by environment. Listed because they are the stronger findings.

| # | Defect |
| --- | --- |
| B1 | **Two paper-size tables that disagree.** `ksav.typ:2426-2434` `_pg_paper_width` knows `a3`/`a5`/`us-letter`/`letter` and falls back to **210 mm silently**; `lib.rs:590-604` `paper_cm_of` knows ten papers and returns `None` otherwise. `b5` → **176 mm vs 210 mm** (34 mm wrong). `a2` → 420 mm vs 210 mm. `a6`, `b4`, `b6`, `us-legal` missing entirely from the Typst side. `"letter"` is known to one side only, and `sanitize_paper` (`lib.rs:1288-1293`) does not map it. `lib.rs:576` then answers `.unwrap_or((21.0, 29.7))` — a **silent A4**. Bonus: `sheet_cm_of` passes `&cfg.paper` **raw** at `lib.rs:576` while its sibling `sheet_height_cm` passes `&sanitize_paper(&cfg.paper)` at `:615`, and the comment at `:571-572` claims they agree |
| B2 | `api.ts:1913,1926,1927,1938` + `files.ts` — the **ten shell commands** are two hand-maintained lists with no shared registry and no fence: ten literals in TS against ten names in `generate_handler!` (`lib.rs:756-768`). Forgetting the Rust half is a runtime rejection, which is what `lib.rs:8-11` says happened before |
| B3 | **A fence on the wrong copy.** `save.test.mjs:251` asserts `FILE_AUTOSAVE_MS === 30_000` on the import from `save.ts:276` — and `save.ts:276` has **no production importer**. The interval that actually runs is a private copy at `main.ts:10330`. The test's own comment (*"stated once … the watcher and the settings text both depend on it"*) is false against the code beside it |
| B4 | `ci.yml:102` builds `dist/` with `npx vite build`; `package.json:9` `build` is `tsc --noEmit && vite build`. Same artifact, two recipes, in the job `#91`'s comment says exists *because* `dist/` had to exist before the browser-language tests measured it |
| B5 | Window geometry is stated twice with **no fence**: `lib.rs:509-516` `MAX_*`/`MIN_*` vs `tauri.conf.json:16-19`. `set_size` at `lib.rs:550` is unconditional, so on any display ≥1032 px the **config `width`/`height` are dead** and the consts decide. `MIN_WIDTH`/`MIN_HEIGHT` duplicate `minWidth`/`minHeight` verbatim, and the comment says *"Mirrors `minWidth`/`minHeight` in `tauri.conf.json`"* — with no test comparing them |
| B6 | `uninstall.nsh:33` hardcodes `$APPDATA\org.ksav.app`, duplicating the `identifier` at `tauri.conf.json:5`. The fence at `deep_link.rs:365` is a substring `contains()`, so it passes on a stale identifier |
| B7 | Eleven `ksav.*` `localStorage` keys across six modules, of which exactly one (`ksav.settings`) is typed. Five are raw strings with no schema |
| B8 | `ksav.typ:7656,7739,7741,10479,10485,10488` — the running-head/page-number look is copied **six** times and is the only page furniture with no `_*_defaults` entry, while headings, lists, tables and all six note apparatuses have one |
| B9 | `ksav.typ:3081` resolves a `שורות(n)` region height from the document's live line box; `lib.rs:513` resolves it from hardcoded `12.0 * (1.0 + 0.75)`. Its comment says *"change one, change both"* |
| B10 | `ksav.typ:9515-9521` — the image **placeholder** prints the literal Hebrew `[🖼 (תמונה — בחרו קובץ)]` with no `text.lang` branch, unlike `:6366`, `:8412`, `:8632` which all branch. Every English document that picks "image" from the palette gets a Hebrew UI string. **This is a user-facing correctness bug, not a knob** |
| B11 | `templates/gemara.ksav:2` names a symbol `NOTE_CHOICES` that **does not exist anywhere in the repo**; the app writes the identical literal from `main.ts:12265` |
| B12 | `engine/examples/render-pages.rs:7` says `cargo run --example tmprender`; the file is `render-pages.rs` |
| B13 | `package.json:19-20` `overrides` pins `@codemirror/view "6.38.8"` exactly while the dep at `:26` says `"^6.38.8"` — same pin, two precisions, one file, no statement of intent |

## C. The gate's single-source invariant does not cover what it claims to

This is one issue (#115) rather than a list, because it is one defect with many
symptoms. In short: `CONTRIBUTING.md` promises that build and check commands are
written in exactly one place, and a test is supposed to enforce it. The test only looks
in two kinds of file, and it has no concept of a build command at all — so the promise is
honoured for some commands and quietly not honoured for the rest.

`CONTRIBUTING.md` states the check commands live **only** in `ksav/tools/gate.mjs`, and
`app/test/gate.test.mjs` is supposed to fail if one reappears. It sweeps exactly two
file classes — `workflows()` (`gate.test.mjs:57`) and `livingPages()`
(`docfacts.mjs:497`) — which is `.github/workflows/*.y{a}ml` plus tracked `*.md`. So
`ksav/app/tools/`, `ksav/packaging/` and `.github/scripts/` are **invisible to it**.
Two first-pass reports disagreed on the cause; the verification pass resolved it:
`workflows()` does glob all workflows. The hole is the **file-class allowlist**.

Worse, `GATE_VERBS` (`gate.mjs:233-240`) holds six entries — `cargo fmt`, `cargo clippy`,
`cargo test`, `npx tsc`, `npm test`, `node test/run.mjs` — and **no build verb at all**.
So every build command in the repo is structurally exempt: `wasm-pack build` in 4
places, `npx vite build` / `npm run build` in the workflows, `npm test` re-spelled at
`packaging/entrypoint.sh:18`. And `facts.mjs:52` exports a `REGENERATE` constant
saying the bless command is written once — which has **zero importers**, while three
files in the same directory re-spell it byte-identically. Three tools also re-derive
repository paths instead of importing `paths.mjs`, which exists as the declared single
source and which 8 of 22 tools already use.

## D. Rejected — the variance test, applied

Everything here was a candidate at some point and was deliberately **not** filed. This
section is not padding: in a repository as well-defended as this one, rejecting things
correctly is most of the work, and a list of what was left alone is the only honest way
to show the test was applied rather than assumed.

The largest rejection by far is the entire `DocConfig` default block and every
`ksav.typ` default table. Those look exactly like hardcoded policy to a literal sweep.
They are not: they are all reachable by a `#הגדרות_*` setting command, and they vary per
**document**, which is a different question from varying per **deployment**.

Not a short list. The prelude alone is a table of document defaults, and rejecting it
correctly is most of the work:

- **The entire `impl Default for DocConfig` block** (`lib.rs:1012-1063`) — every field
  is serialised, clamped in `from_json`, and exercised by `settings_live.rs`. This is
  the largest block a naive sweep would flag and the most thoroughly knobbed thing in
  the repo.
- **`ksav.typ` `_pg_*`, `_ap_*`, `_md_*`, `_pp_*` default tables** — every one reachable
  by a `#הגדרות_*` command. They vary per **document**, which is a different axis from
  per-**deploy**.
- **`include.rs:160-172` `Limits { warn: 100_000, refuse: 500_000 }`** — already threaded
  into `DocConfig` and consumed per request; the derivation is domain reasoning.
- **`KSAV_COMPILE_TIMEOUT_MS` and `KSAV_TOKEN`** — already knobs, correctly. `KSAV_TOKEN`
  is the one secret in the region and is implemented right: env-only, never logged, never
  serialised, length-then-constant-time compare (`server.rs:628-637`).
- **`policy.rs:24` `csp()` and `services.rs:160` `SERVICES`** — these are the *extraction
  already done*. `services.rs` replaced four hand-written copies and generates
  `services.gen.ts` with a staleness test. Models of the right shape, cited throughout
  this document.
- **`server.rs:41` `include_dir!(...)`** — build-time, feature-gated, failure mode
  already documented in `build.rs`.
- **`Cargo.toml:181-183` `[profile.bench] lto = false`** — verified dead: CI sets
  `CARGO_PROFILE_RELEASE_LTO` at `ci.yml:163,244` and `release.yml:95,180`.
- **Typographic constants** — `lib.rs:517,567,774,776,783,785` (line box, text floor,
  band gap, region reserve), `zoom.ts:45-48`, all of `main.ts`'s `px` literals. One
  obvious correct value, derivation stated in the comment.
- **`ksav.typ:460` skew and `:487` smallcaps** — a *strategy* (synthesise the slant),
  and one that already self-disables and already varies with attached fonts.
- **`:8099` monospace chain** — Cascadia Mono *is* bundled, so entry 1 always resolves.
  The tail is dead code, correctly.
- **`:4610 _ch_walk_max`, `include.rs:138 MAX_DEPTH = 8`, `bidi.ts SCAN_LIMIT`,
  `diff.ts MAX_EDIT_DISTANCE`, `store.ts DB_VERSION = 3`, `spans.ts CACHE_SIZE`** —
  termination invariants, algorithmic guards, schema versions.
- **Timeouts and debounces generally** (`save.ts:27`, `compile.ts:149,176`,
  `main.ts:4797,4832`, `api.ts:2015`) — mode/time; the right vehicle is a flag, not a
  config file.
- **The `ksav.typ:8019` Rashi chain, partly** — its comment states the decision
  deliberately (*"Ksav bundles no Rashi font"*), so it is a documented choice rather
  than an unwritten policy. Only the missing override is arguable.
- **CSP as a knob** — `tauri.conf.json:25` cannot be an env var, because Tauri reads it
  before Rust runs (`build.rs:3-7`). Already centralised and triple-fenced.
- **`#[cfg(any(windows, target_os = "linux"))]`** — a compile-time platform capability
  difference, not a deployer-movable value, and already fenced.

## E. Secrets

**Nothing found, and that is a real result rather than an absence of looking.** A
config audit is exactly the kind of sweep that turns up committed credentials, so the
check was done deliberately.

No hardcoded credential, token, API key, connection string or password exists anywhere
in the repository. The one secret this codebase has — `KSAV_TOKEN` — is read from the
environment, never written as a literal, never logged, never serialised, and compared
length-then-constant-time. That is how it should be done.

**Negative.** No hardcoded credential, token, DSN, key or password exists anywhere in
the repository. Swept for `ghp_`/`gho_`/`github_pat_`, `sk-…`, `AKIA…`, PEM headers,
`xox[baprs]-`, `AIza…`. The only credential references are `secrets.GITHUB_TOKEN`
indirection (`release.yml:186,342,388`), the **names** of unset signing secrets in a
comment, `"0".repeat(32)` in a fixture, and `"secret.ksav"` which is a path-traversal
test fixture. `KSAV_TOKEN` is env-only and never a literal.

## F. Self-indictment — re-running the variance test over the result

A verification pass that can only report success is not a verification pass. So this
section is the part where the audit argues against itself, and it found real problems.

The second pass was run by separate agents with no knowledge of the first pass's
reasoning, and it **refuted three of the claims this audit would otherwise have filed**.
Those corrections are stated above where they apply, and they matter: an issue with a
wrong line number or a misread comment costs the reader more than no issue at all.

The rule for this audit is that a verification pass must be able to return "wrong", and
it did:

- **Three of my own citations were wrong before filing and are corrected above.** The
  window-geometry comment claim (that `lib.rs:485-487` narrates `1280×820` as current)
  is **refuted** — it says *"used to be"*, which is correct history, and I dropped that
  half. The claim that `post::scheme()` is "used elsewhere" is **refuted** — it is
  test-only, which makes A12 *stronger*, not weaker. And the gate-fence cause was
  **misattributed** to `workflows()` before the second pass corrected it to the
  file-class allowlist.
- **The line number for A12 moved 665 → 682 mid-run**, because `c288a3b` landed between
  the first pass and the verification pass. The audit's own premise — this repo, this
  hour — was not stable. Every number in this document was re-read from disk
  immediately before filing.
- **A4 was reframed.** The first pass called the missing `X-Ksav-Token` header a
  capability gap. Verification confirmed the literals but also found `server.rs:603-604`
  already documents the design, so the honest finding is narrower and sharper:
  *setting `KSAV_TOKEN` disables seven services for every shipped client*, which
  nothing states anywhere.
- **By my own variance test, I think 4 of the 22 section-A rows should not be filed as
  knobs.** A18 (ubuntu floor) and A19 (artifact names) are support-matrix duplication
  with no deployer asking for them. A21 is one command-line script. A22 is format
  policy with no variance evidence — it is a B-class drift defect wearing a knob's
  clothes. If someone wants the list smaller, those are the four I would pull.
- **A13 I would not file at all**, on the strength of its own comment.
- **What I did not do:** extract anything. No config file was added, because this
  repository has no deploy-config system to extend and the correct fix for A3–A21 is an
  env var beside each constant — a change, and this run was scoped to report.
# GitHub issue implementation notes

Prepared 2026-08-27 from the open issue bodies and repository audit. These notes are recommendations only; no issue is closed here.

## #2 — Fix remaining rendering and note-layout correctness hazards

**Root cause:** note destination, reservation, carried placement, and final drawing are resolved in separate Typst paths. They use inconsistent destination aliases and typography/height calculations, while side-stream occupancy is not globally coordinated. Parenthesis handling also relies on a pre-blanked representation that loses quoted-string structure.

**Recommended implementation:** introduce one typed intermediate note-placement record per note containing destination, stream, height, pin state, source span, and page constraints. Validate `ערוץ`/`אזור` against declared destinations before layout. Feed the same typography/config object into both walking and drawing; clamp declared heights before allocation. Use one occupancy allocator for all side streams and carried notes, including pinned notes. Replace ad-hoc parenthesis counting with structural parser spans or a quote-aware scanner.

**Regression coverage:** fixtures for mixed destinations, undeclared regions, multiple side streams, page carry with pinned notes, declared-height clamping, quoted `)` in channel arguments, and footer/page-number collision. Assert each note is drawn exactly once or fails with a source-located diagnostic.

## #3 — Make the Ksav UI language switch complete and reliable

**Root cause:** UI language state is centralized, but rendering is not. The language switch rebuilds only selected shell controls; open panels, generated controls, ARIA/title/placeholder attributes, status/error notices, and CodeMirror search UI can retain old-language strings. UI language and document source vocabulary are also insufficiently separated for English generation.

**Recommended implementation:** define a typed catalog with exhaustive keys and a test that rejects missing translations. Make every user-visible string resolve at render time. Add a panel-registry localization/rebuild hook and a CodeMirror localization refresh/recreate path. Keep persisted UI language independent from document language. Centralize command/parameter alias mapping, including `mark` and nested configuration keys, so generated source follows the document language.

**Regression coverage:** browser test opens every panel, switches both directions, checks visible text plus ARIA/title/placeholder values, verifies status/error text, reloads, and confirms persistence. Add generation tests for English `mark`, nested dictionary keys, and mixed UI/document-language combinations.

## #4 — Preserve git drawer input and improve panel/document workflows

**Root cause:** Git panel refresh reconstructs the entire panel and creates the commit message/name/email fields from empty defaults, so save/status refresh destroys user input. Panel lifecycle and focus restoration are not modeled as durable state transitions.

**Recommended implementation:** store Git form state keyed by document/repository/panel instance, update it on input, and hydrate fields during rebuild. Prefer keyed status/file-row updates over body replacement. Extend the panel registry with a common close/escape/scrim/focus contract; capture the originating editor selection and restore it after close. Model footnote insertion as an explicit localized multi-step command with cancellation.

**Regression coverage:** type a commit message, trigger save/status/language refresh, assert value and selection survive; test name/email too. Test visible close, Escape, scrim dismissal where appropriate, focus return, cancellation, and narrow-window behavior.

## #5 — Harden remaining parser, configuration, and installer edge cases

**Root cause:** configuration setters historically accepted unknown keys; parser diagnostics and destination validation are inconsistent; external probes and filesystem/install paths require common safety policy. The repository currently has no `purge_ratio` owner/reference, so adding that setting would invent a contract.

**Recommended implementation:** retain centralized per-setter schemas and reject unknown keys with exact field/source location. Carry source spans through grammar errors. If `purge_ratio` is introduced by a real owning subsystem, constrain it to its documented domain (normally 0..=1) and test NaN/infinity/boundaries; otherwise do not add dead configuration. Use bounded, cancellable machine-readable tool probes. Centralize validated path handling, Windows reserved-name checks, archive traversal prevention, dry-run behavior, and atomic temp-write/rename semantics.

**Regression coverage:** unknown keys in every setter, invalid numeric values including NaN/infinity/out-of-range, malformed module names with line/column assertions, quoted-parenthesis parser cases, probe timeout/cancellation, `CON`/`NUL`/`COM1`-style names, `..` archive entries, absolute paths, cross-volume rename fallback, and dry-run no-write assertions.

## #6 — Audit and bound fire-and-forget UI actions and async failure reporting

**Root cause:** `void` async handlers form an implicit error policy. Some failures are surfaced, others are only logged or leave progress/disabled state behind. Cancellation is not consistently distinct from failure.

**Recommended implementation:** add one approved async-action runner accepting an action label, optional initiating control, cancellation predicate/signal, and localized failure reporter. It must set/clear progress and disabled state in `finally`, ignore expected cancellation separately, and preserve actionable error context. Route every user-triggered async action through it or await it directly. Add a static prohibition that flags bare fire-and-forget calls outside the wrapper, with narrowly documented infrastructure exceptions.

**Regression coverage:** document save/export, Git operations, panel refresh, asset operations, spell actions, and interop actions under resolve/reject/cancel paths. Assert notices, no unhandled rejections, and controls/progress restored after every outcome.

## #7 — Replace full DOM rebuilds with stable keyed updates

**Root cause:** panel body, row lists, and preview surfaces replace whole containers in hot paths. This destroys DOM identity and resets scroll/focus/selection even when only one row/page changed.

**Recommended implementation:** add a framework-free keyed reconciliation utility with stable row/page IDs, model equality short-circuit, create/update/remove/move phases, and preservation of scroll plus focused element identity. Apply it first to panel rows and Git status, then preview pages/windowing. Keep expensive serialization outside keystroke handlers where possible.

**Regression coverage:** mutate one row in a large list and assert unchanged node identity, scrollTop/scrollLeft, focused control, and selected row remain. Add preview page hash/window tests and a repeat-update benchmark/threshold appropriate for CI.

## #8 — Provide a first-class LibreOffice-style document workflow

**Root cause:** list/table/note operations exist as source-generating commands but are scattered across hydras, menus, and contextual surfaces. Keyboard and caret semantics are not presented as a coherent editor workflow.

**Recommended implementation:** add discoverable list toolbar/context actions backed by existing list operations; expose create, indent, outdent, move, and list-type changes with bilingual catalog entries and bindings. Specify and implement Enter/Tab/Shift+Tab/Backspace continuation/breakout behavior. Ensure generated markup uses document language, while UI labels use UI language. Add focus/caret restoration around dialogs and generated insertions.

**Regression coverage:** fresh/nested/mixed lists, continuation and breakout, selection/caret placement, mixed document language, footnote/table insertion, narrow-screen panel focus, and browser journeys from toolbar/menu/shortcut.

## #9 — Overhaul UI for intuitive LibreOffice-style editing

**Root cause:** the shell distributes common actions across contextual bars, menus, palettes, hydras, drawers, and source controls without a stable information architecture. This overlaps #3, #6, #7, and #8.

**Recommended implementation:** write a short navigation specification first. Establish conventional menu/toolbar groupings, contextual formatting controls, predictable panel lifecycle, shortcut discoverability, and Hebrew/English responsive layouts. Make the spec the contract for changes rather than attempting a wholesale visual rewrite. Coordinate each new action with the async runner, i18n catalog, and keyed rendering utility.

**Regression coverage:** browser journeys for create/edit/style/list/table/note/language/direction/panel/save/export; bilingual and narrow viewport runs; assert close/escape/outside-click/focus behavior and help/shortcut documentation parity.

## #10 / #12 — README binding-count regression / open PR

**Root cause:** README rewrite removed the generated binding-count claim while the documentation test intentionally checks it against `Object.keys(DEFAULT_KEYS).length`.

**Recommended implementation:** retain the source-derived claim or replace the hard-coded count with generated documentation if the project wants to eliminate drift. Current local fix restored `all 97 bindings`; #12 is a PR duplicating that fix. Leave issue/PR state unchanged per request.

**Regression coverage:** documentation test computes the count from bindings and checks README/docs claims; add a generation/check command if hard-coded text is retained.

## #11 — Adopt Leo editor-style node workflow

**Root cause:** current notes/sections/panels approximate hierarchy, but there is no durable node identity or many-to-one clone model. Adding a UI outline without a document-level model would create divergence between outline, editor, undo, persistence, and export.

**Recommended implementation:** stage this behind an opt-in document format/version. First define a node model with stable IDs, headline/body/children, clone references, directives, serialization, undo/redo semantics, and flatten/export rules. Then add outline panel/operations using the existing structure and panel infrastructure. Implement clone propagation through shared IDs rather than duplicated text. Add directive parsing (`at-document`, `at-note`, `at-shared`, `at-export`) with source spans, then migrate notes compatibly.

**Regression coverage:** model-only tests for create/rename/move/promote/demote/clone/edit propagation/cycle rejection/undo/persistence; parser tests for directives; export tests; panel tests for focus/scroll/keyed updates. Do not make the legacy format silently reinterpret as nodes.

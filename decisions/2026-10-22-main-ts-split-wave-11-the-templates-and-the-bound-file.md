# The main.ts split, wave 11: the templates and the bound file

Frontend · 2026-10-22 · decided by Shaul

## The decision

The extra wave. Wave 10's record counted §4 item 1's line number as the
refactor's one open gap and named the shape of the move that would close part
of it: templates/exports, the one feature region §3 never slated. This is
that wave, authorised as wave 11.

- `templates.ts` (152 lines): the engine's template registry ordered for the
  menu, the writer's own saved templates (localStorage, quota-reported), and
  the two doors — `startFromTemplate` (an empty document takes the template
  in place; anything else gets a document of its own) and `loadTemplate`
  (the template's direction written through `setSetting`, arrived registered
  in a `TemplatesWiring`).
- `fileui.ts` (649 lines): the bound file's UI half — open and its
  bound-file identity check (`docBoundTo`), save and its three routes,
  save-as, reload-from-disk, the crash panel and the recovery offer, the
  update check, the importers, the share links, the service worker, and the
  autosave tick.
- `loadBody`, `newBlankDoc`, `newDoc` joined `docswitch.ts` (456) — the body
  swap is a lifecycle verb; the starter's and git's wirings re-point at the
  same import.
- The chrome notice banner (`NoticeAct`, `showChromeNotice`,
  `clearChromeNotice`) moved to `ribbon.ts` — the chrome module's own
  surface, reached by fileui and main alike.

main.ts 5,068 → 4,261 lines. The import graph stands at 134 modules, acyclic
(`bbc148f`). 28 definitions moved (16 fileui, 7 templates, 3 docswitch,
2 ribbon), 0 wiring drift.

## What the carve said

1. **One region, two files, split at the slash.** The banner read
   "templates / exports" and the census held three lives: templates (a
   feature), the bound file's doors (the file's UI half), and the lifecycle
   verbs (`loadBody`, `newDoc`) that sat among them by accident of ordering.
   Each went to the file named for it; the plan's granularity rule — the
   name says what it took — decided rather than a size target.
2. **`loadBody` is a lifecycle verb, not a template's.** The opening fence
   had already named it: a whole-document replacement, one document under
   another version of itself — snapshot restore, git restore, re-read from
   disk. docswitch.ts owns the document's life; the verb lives there, and
   the three wirings that carried it (git, starter, snapshots) re-point
   without changing shape.
3. **The notice banner is chrome, and ribbon is the chrome module.** It
   touched the DOM, the i18n guard and the notice host — nothing main-only —
   and fileui needed it. Moving it retired nothing and wired nothing: a
   direct import in both directions of use, no cycle.
4. **`setSetting` stays main's, and templates reach it the honest way.** A
   template's direction write reconfigures the editor's text direction;
   that is the setting-mutation machinery wave 6 kept in main. The wiring
   is one method, named for what it carries.

## What the fences said, and what was rekeyed

- opening's line list gains fileui.ts and templates.ts (attribution by
  enclosing top-level function, so the template and file doors must be
  findable there); the empty-document guard fence reads templates.ts.
- services' worker-registration fences read fileui.ts; share's
  `__PUBLIC_BASE__` fences read fileui.ts.
- docs.test registers `wireTemplates` (handback identity) and smoke-imports
  the file doors for the runner's every-module-imported fence.
- README's count rekeyed (12,905 → 12,908).

## The end state

main.ts 4,261 lines: boot, the notebook assembly, the wirings, the header
map — and no feature region left that any wave's census can name. The
§4 item 1 number remains out of reach (the assembly itself is the bulk of
what remains), but the contents test now holds without an asterisk: there
is no feature region in main.ts left to point at. 134 modules, acyclic;
every fence green; the gate 11 checks.

# Frontends are views in boxes

Decides every editing surface Ksav has. Written question by question with the
owner; the answers are recorded as **Q1…Q12** so the reasoning can be traced.
Absorbs #118, is the frontend half of #184, narrows #126 to raw source.

**The model is Emacs:** a small number of concepts, each fully general, so
that features are combinations rather than code. Emacs has buffers (what),
windows (where) and modes (how). Ksav has **views** (scope × mode), shown in
**boxes**, configured by **links** and **layers**, all registered through one
registry that Ksav's own features use too.

---

## 1. The concepts

### View = scope × mode (Q1, Q2)

A **view** is *what* is shown. It has two independent parts:

- **Scope**: which part of which document.
- **Mode**: how that part is drawn and edited.

Any scope can be combined with any mode. A combination that cannot work is
refused with a sentence saying why, not hidden. Example: paged preview of a
single follow-the-caret note ("a note has no pages of its own").

### Scopes: one query over the note tree (Q3, Q4)

A scope is a query, written as data:

```ts
interface Scope {
  doc: DocRef;                       // "this document" or another one (Q11)
  part: "body" | "notes" | "file";   // the body, notes matching the filters, or the whole raw file
  series?: string[];                 // notes: which series (footnotes, endnotes, commentary, a named stream…). Omitted = all
  depth?: number | [number, number]; // notes: 1 = notes on the body, 2 = notes on notes…
  under?: "all" | "caret" | NoteId;  // notes: everything, children of the leader's caret note, or of one pinned note
  within?: SectionRef;               // narrowing: body/notes inside one siman/section only
}
```

Every case asked for is this one shape:

| You want | Scope |
|---|---|
| the main text | `{part:"body"}` |
| footnotes | `{part:"notes", series:["footnotes"], depth:1}` |
| endnotes | `{part:"notes", series:["endnotes"]}` |
| all notes on notes | `{part:"notes", depth:2}` |
| the sub-notes of the footnote I'm in | `{part:"notes", depth:2, under:"caret"}` |
| one pinned note | `{part:"notes", under:<NoteId>}` (that note itself) |
| siman 3 only (Emacs narrowing) | `{part:"body", within:<siman 3>}` |
| raw Typst of the whole file | `{part:"file"}` with mode `source` |
| the parallel text / translation (#43) | `{doc:<other>, part:"body"}` |

A **series** is whatever `NoteSpan.series` (`channels.seriesOf`) already says.
Named streams (`#הערה_זרם`) are series. They need no concept of their own.

**Independent flows (Q11).** Texts that share the printed page without markers
(#43: top/bottom halves, text and translation) are **separate documents**. A
box shows one through `doc:<other>`, and the page compositor of #43 merges them.
Chunk sync (verse ↔ translation) is a later link mode.

### Note identity (Q3): the most robust option

- **While open:** a box holding a specific note maps its range through every
  change, the way CodeMirror maps a selection. That is exact, with no lookup.
- **Pinned:** pinning a box to one note writes a stable id into *that note's*
  source (a hidden argument, e.g. `מזהה: "n7f3"`). That survives restarts,
  edits made outside Ksav, git merges and reordering. Unpinned notes carry
  no id, so the raw source stays clean. If the id is deleted outside Ksav, the
  box reports "this note is gone". It never guesses.
- Query scopes (`series`, `depth`, `under:"caret"`) are recomputed on each
  change and need no identity.

### Modes

| Mode | Draws | Edits |
|---|---|---|
| **writer** (default) | pageless, RTL-aware rich prose; **never paginated**, no page hints | yes; markup is never visible |
| **source** | raw Typst of the scope's ranges | yes, raw motion |
| **preview** | real Typst pages | no; click jumps the leader's caret there |
| **outline** | headings / note tree of the scope | no; click jumps |

Prose mode (`proseMode` + Alt reveal), the `prose?:` flag on `panes.Leaf` and
the semantic `sourceMotions` setting are **deleted**. Writer replaces the
first; source is raw by definition.

### Box = where (Q5)

A **box** is a frame in the existing layout tree (`panes.ts` splits). It holds
one view. There is only one kind of placement: the "comments rail" is a narrow
box beside the body with the `aligned` link. Every box can be split, dragged,
swapped, closed and saved, and can be changed to show any other view.

**Each box has a header: a mode line.** It shows `scope · mode · link →
leader`, and each part is clickable to change it. The **open-box** command is
Emacs's `switch-to-buffer`: a picker of scopes (recent, the document's series,
saved views) and then a mode. "Open an empty box and decide what goes in it" is
this command.

### Link (Q5, Q6)

```ts
interface Link {
  leader: BoxId | null;                     // null = unlinked
  mode: "unlinked" | "scroll" | "aligned";
}
```

- **scroll:** the list scrolls with the leader. The notes for the leader's
  visible lines are in view, and the leader's caret note is highlighted (Q4).
- **aligned:** each note sits beside its marker's line, with gaps between.
- `under:"caret"` uses the **leader's** caret.
- The leader is a specific box, by default the box this one was opened from,
  changeable from the mode line. **Chains are allowed:** notes-on-notes →
  footnotes → body. Cycles are refused when you try to link.

### Layers: commands, keys, ribbon (Q8)

One command and key registry, resolved through the **focused box**:

```
global  <  mode (writer/source/…)  <  scope (body / notes / series X)  <  box
```

A layer can add, override or hide a command. The ribbon, context menus, the
palette and the key hints show what the focused box's layers offer. Examples:

- In a notes scope, the note command inserts a note-on-note.
- In preview, typing keys navigate.

Vim and Emacs keymaps are layers like any other. `bindings.ts` and the ribbon
placements (`placement.ts`) become contributions to layers, not global tables.

### The registry (Q7)

Scopes (filter kinds), modes, link modes, commands and layers are all
registered through one API, and **Ksav's built-ins are written against it**
(Emacs's core in Elisp). There is no private back door.

- **Now:** users compose declaratively (saved views, layouts, scope queries) as
  data in settings or beside the document (§3).
- **Later:** a scripting layer for user code on the same API, with no redesign.
  The API is internal until then, but it is shaped as if it were public.

---

## 2. Behaviours

### Inserting a note (Q9)

The marker lands at the caret. The caret then moves into the new note's body
**in the box whose scope contains it**, chosen by the first box in the layout
whose query matches. If no box matches, one opens by the derived-layout rule
(§3). **Esc**, or the note key again, returns the caret to just after the
marker in the box it came from.

### Deleting a note (a setting: `noteDelete`)

In the writer, a marker is atomic. The owner left the behaviour to the writer:

- **`twoStep`** (default): the first Backspace/Delete onto a marker *selects* it,
  showing the note's first words in a hint. The second deletes the marker and its
  body together.
- **`immediate`**: one Backspace/Delete removes the marker and its body.

In both, emptying a note's text in its box never deletes the note; an
empty note is flagged. Both are undoable as one step.

### One history

All boxes edit one primary document with one undo history. Box editors carry
no history of their own. Ctrl+Z in any box undoes on the primary. If the restored
selection lies outside the focused box, focus moves to the box that shows it.
If none does, the leader chain's root shows it.

---

## 3. Layouts (Q10, Q12)

- **Derived default** (no saved layout): the body, plus one scroll-linked box
  per series the document declares or uses, plus a notes-on-notes box once one
  exists, plus a box per linked independent-flow document. A plain document
  opens as **body + footnotes**. Preview and source are not in the default.
- **The document's layout** is saved in a small file beside the document
  (`<name>.ksav-layout.json`). It travels through git, so a collaborator opens
  the same boxes. Pins live in the document itself (Q3).
- **Named layouts** ("kuntres with commentary") live in user settings and can
  be applied to any document. Scopes in a named layout name series by role, so
  they apply anywhere. Pinned NoteIds are dropped when a named layout is
  applied to a different document.
- `panes.ARRANGEMENTS` (the six shipped shapes) is deleted. The derived default
  and named layouts replace it.

---

## 4. Implementation

### Sub-range editors

- **A single-range view** (body, one note, `file`) is a CodeMirror
  `EditorView` whose doc is the projection of its range. Child-note bodies are
  replaced by atomic marker widgets, so the writer is just "the box whose range
  is the body". Edits are forwarded to the primary, offset by the range start,
  and the primary's changes are mapped back. This is the split-pane mirror
  (`decisions/2026-08-14-every-pane-is-the-editor.md`) generalized to a range.
- **A multi-note view** (a series, a depth) is a **virtualized list of
  single-range editors**, one per note, with the note number as a row header.
  Arrow keys cross from one note to the next at the edges. Only rows near the
  viewport are live editors.
- **Writer scaffolding** is replace decorations registered as
  `EditorView.atomicRanges`, so the caret can never stand inside markup. Bodies
  of formatting commands (`#הדגשה[…]`) stay editable; only the `#name(…)[` and
  `]` edges are atomic. This removes the need for #126's semantic motion.
- **A range deleted from outside** (the writer deletes a marker whose note is
  open in a box) closes that row or editor cleanly. It must never throw `wrong
  length`. There is a test for exactly this.

### Mapping to today's code

| Today | Becomes |
|---|---|
| `panes.Leaf.role` | `Leaf.view: {scope, mode}` |
| `Leaf.linked`, `Leaf.docId` | `Leaf.link`, `scope.doc` |
| `Leaf.prose` | deleted |
| `panes.ARRANGEMENTS`, `panearrangements.ts` | derived default + named layouts |
| `notes.ts` `NoteSpan` / `notesIn` | the scope evaluator's input |
| `bindings.ts`, ribbon `placement.ts` | layer contributions in the registry |
| `proseMode`/`proseReveal`, `sourcemotion.ts` semantic path | deleted |
| notes pane | an `outline`-mode view over a notes scope |

### Prerequisites and risks

- **#238 first.** The note index and scan run in TS on the typing path (55–540
  ms per keystroke at sefer size). Scope evaluation, scroll links and aligned
  links all read that index on every change, so it must move to the engine
  before step 4.
- **Aligned link at depth.** Past about 3 levels of chained aligned boxes,
  there's no room. The deepest falls back to `scroll`.
- **#163** (single-preview sync): preview is now a mode in any box, so its sync
  must be per box (each box's leader) as a matter of course.

---

## 5. Order of work

1. This record (+ index row); #118 points at it.
2. The registry skeleton: scope, mode, link and layer registration; built-ins
   registered through it from the first commit.
3. `Leaf.view`/`Leaf.link` in the pane tree; the mode line; open-box picker.
   Today's source/preview/outline/notes re-expressed as views.
4. (After #238) Writer mode: atomic scaffolding over the body scope.
5. Single-range note box: projection, forwarding, one history, pins with ids.
6. Multi-note views: the virtualized list, scope queries, `scroll` link.
7. `aligned` link; chains; `under:"caret"`.
8. Layers: commands/keys/ribbon resolved through the focused box.
9. Insert/delete-note flows (§2); derived default layout; layout file and named
   layouts. Prose mode, `ARRANGEMENTS` and semantic `sourceMotions` deleted.
   Ribbon, help and the acceptance journeys updated.
10. Independent flows as linked documents. This waits on #43's compositor for print.

## Related

#118 (absorbed), #184 (this is its structured frontend; the scope query over
`NoteSpan` is the seed of its document model), #126 (narrowed to raw source),
#238 (prerequisite), #43 (independent flows), #163, #11 (a scoped view is close
to a Leo node), #8/#9 (the shell around it).

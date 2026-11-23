# The shell: menus as the floor, tabs as a switch

*A proposal, not a record. Nothing here is decided until the owner picks inside
it; when they do, the choice becomes a dated file in [`decisions/`](../decisions/)
and this page becomes the spec the shell is built to.*

## 1 · What this decides, and what it does not

It decides **how the shell is shaped**: where a command lives, how many ways there
are to reach it, and what a writer can switch off. It does not decide the visual
skin, the icon set, or the technology underneath — see §10 for the last of those,
because #117 proposes replacing the frontend outright and the answer here has to
survive whichever way that goes.

The reference is **LibreOffice's architecture, not its wardrobe**: menus are the
floor that never goes away, a notebookbar-style tab strip is a switch a writer can
turn on, and both are views of one table. LibreOffice has accreted three kinds of
toolbar chrome and four icon sizes; we are copying the switch and the taxonomy, not
the accumulation.

## 2 · What exists today, in one line each

| surface | where | the honest problem |
|---|---|---|
| menu bar | `ribbon.ts`, `lazyMenu` — File, Documents, Export, Insert, Format, Table, Sources, Macros | correct and complete, but two of them (File, Documents) are about the *library*, and six are about the *document* |
| toolbar | `ribbon.buildToolbar` — groups of buttons, `header .tb-group` | one row of glyph buttons with no names, and only a fraction of the commands fit, so it is a *partial* surface with no rule for what belongs |
| command palette | `palette.ts` | the real answer for regulars, and invisible to a new writer |
| keyboard map | `DEFAULT_KEYS`, shown by `keysdrawer.ts` | complete, and only useful after somebody has learned the names |
| contextual strip | `contextbar.ts` | appears near the caret; previously the only home of several list operations |
| drawers and panels | `stylespanel`, `settingsdrawer`, `noteschooser`, `commandsdrawer` | the remaining commands live in whichever of five places they were written into |

Five surfaces, no statement about which holds what. That is the actual defect — not
that any one of them is ugly. `#128` fixed the sharpest end of it (one home per
action, and an identity line a writer can read); this page fixes the rest.

The table that already exists is the important part: **`actionsurface.BUILT_IN`
is every action the shell can run**, and `menus.MENU_OF` is the rule for which
menu a registry category belongs in. The tab strip is not a new taxonomy. It is a
third view onto those two tables, beside the menu tree and the keyboard map.

## 3 · The model

Three statements, and everything else in this page follows from them.

1. **Every action has exactly one home in the menu tree.** `header.ACTION_HOME`
   is the mechanism for the ones with a second door (Save as lives in File and in
   Documents; the Documents copy says *Also in File*). An action with no menu row
   is a defect, not a shortcut.
2. **A tab strip is a view, never a home.** Every button on a tab names an action
   that is also in a menu, and a fence asserts that. A tab that holds something no
   menu holds is a second taxonomy growing back.
3. **A writer can turn the tab strip off and lose nothing.** The menus are the
   floor; the tabs are for the people who want everything one level up.

## 4 · Three variants, one setting

A single preference, `shell` — *how much furniture* — with three values. This is
the LibreOffice `View ▸ User Interface` switch, reduced to the three that differ
in something other than taste:

| variant | what the writer sees | who it is for |
|---|---|---|
| **תפריטים** · *menus* | the identity line, then the menu bar. No toolbars, no tabs. | the writer who types and uses the keyboard; the smallest build; the one that must never be able to lose a command |
| **תפריטים וסרגל** · *menus + toolbar* | menus, plus today's one row of grouped buttons | the current default, kept because it works |
| **לשוניות** · *tabs* | menus (or a `☰` that opens the same tree), plus a tab strip over a row of named buttons | the writer who came from Word and expects to see the verbs |

The switch lives in **View** and in the settings drawer, and it persists like every
other preference (`settings.ts`; `2026-08-12-no-preference-ever-survived-a-reload`
is the record of what happens when a setting is drawn but not stored).

Two consequences that are cheap to state now and expensive to discover later:

- **The keyboard map is the same in all three.** A chord is a property of the
  action, not of the furniture, so switching the shell must not change what any
  key does. This is a fence, not a promise: the same action must be reachable by
  its chord in every variant.
- **Switching re-renders; it does not rebuild the app.** The variant chooses which
  containers `appheader.buildHeader` mounts, so a switch is a DOM swap over an
  editor that does not reload. Losing the caret position on a settings change is
  the kind of thing a writer reports as data loss.

## 5 · The tab set

Named for a writer, not for the engine, and few. Tabs are the *document*; the
library and the file stay in menus, because a sefer is not a tab (see Q2).

| tab | holds | where it comes from |
|---|---|---|
| **בית** · *home* | the everyday text verbs: undo, styles, emphasis, alignment, direction, the list controls | registry categories `style`, `align`; list actions |
| **הכנס** · *insert* | things that put something new on the page | categories `heading`, `list`, `footnote`, `block`, `math`, `image` |
| **פריסה** · *layout* | page size, margins, columns, page breaks, sections, numbering | categories `layout`, `table`-independent page actions |
| **טבלאות** · *tables* | insert, and the twenty operations that act on a table; cell configuration | category `table`, `structure` table verbs |
| **מקורות** · *sources* | notes, apparatus, citations, Girsa's three routes, the review marks | categories `torah`, `reference`, `review` |
| **תצוגה** · *view* | panes, zoom, prose-only, the shell switch, theme, language | `panes`, `zoom`, `hiding`, `settings` |

The `MENU_OF` table gains a second column — `TAB_OF` — so a category has one menu
and one tab, and a fence fails if either is missing. That is the whole mechanism:
the tab strip cannot drift from the menus because it is not written down anywhere
the menus are not.

**Contextual tabs** (LibreOffice's *contextual groups*): when the caret is inside a
table or a note, a tab appears for it, drawn from the same category. It is a view
that appears and disappears — never an action that exists only there. `contextbar.ts`
already knows how to answer *what is around the caret*, so this is wiring, not
invention.

## 6 · The header, top to bottom

```
שֵׁם הַמְחַבֵּר · kuntres.ksav · not saved        ⚙ ◐ ?        ← identity + chrome
[File] [Documents] [Export] [Insert] [Format] [Table] [Sources] [Macros]   ← menus (floor)
┌ בית ┬ הכנס ┬ פריסה ┬ טבלאות ┬ מקורות ┬ תצוגה ┐                    ← tabs (optional)
│  ↶ ↷ │ H1 H2 │ • ≡ ⇥ │ … │                      ← named buttons
└──────┴──────┴─────┴────┴────────┴───────┘
```

- **Identity first, and it is a sentence** — `#128` landed that: `header.docTitle()`
  returns `{title, file, line, label}`, drawn by one function, so the header and the
  title bar cannot disagree again.
- **The chips stay where they are.** The chip bar is the interface's report on its
  own state; it is not part of the furniture and moving it is not part of this.
- **In the tabs variant the menu bar remains.** A `☰` that hides the floor would make
  the floor a rumour. LibreOffice keeps its menus visible in the tabbed notebookbar
  for the same reason: the fast lane is beside the slow lane, not instead of it.

## 7 · Labels, not glyphs

`#128` settled the *row* controls with a permanent legend rather than wider rows.
The tab strip must not reopen that question: **a button that is not universally
understood carries its name.** In a table of ten buttons, three glyphs and seven
names reads as unfinished; that is why the tab row is *named buttons* and the
menu rows keep glyphs, where the menu's own text is the name.

RTL: the tab row is a `tablist` in document direction, the tabs flow right to left,
and nothing in it mirrors its glyph (`#136`'s lesson about the alignment buttons).
The arrow keys move along the flow, not along the screen.

## 8 · What this costs, per surface

- `menus.ts`: `TAB_OF` beside `MENU_OF`; `categoriesIn` gains a sibling.
- `ribbon.ts`: the group table becomes a *tab* table — the groups that already exist
  are the natural content of the Home and Insert tabs, which is why this is a
  reshaping rather than a rewriting.
- `appheader.buildHeader`: mounts one of three containers by variant.
- `settings.ts`, `settingsdrawer.ts`: one preference, one control, one persistence row.
- `header.ts`: unchanged — the identity line is already right.
- `actionsurface.ts`: unchanged — the table already holds everything, which is the
  reason the whole proposal is affordable.

## 9 · The fences, and what each would have caught

| fence | what goes red if it is reverted |
|---|---|
| every `BUILT_IN` action has a menu home | an action reachable only from a tab, a palette or a chord |
| every tab button names an action that is also in a menu | the second taxonomy this page exists to prevent |
| every registry category has a menu **and** a tab | a category that silently appears in neither |
| the variant persists and restores the same DOM | the setting that is drawn but not stored (`2026-08-12`) |
| a chord works in all three variants | the shell switch changing what the keyboard does |
| the boot fence asserts the variant that was asked for | a build that boots into the wrong shell — the shape of #229 |
| the tab strip is a `tablist` with arrow-key movement | a keyboard user locked out of the furniture |

## 10 · What this does not decide

**#117** proposes replacing this whole frontend with a native Rust `egui` ribbon
(storytold/wordcraft). That is a technology decision, and it is bigger than this
page — but note what survives it: the taxonomy in §3 and §5 is a statement about
*ksav*, not about TypeScript. Whichever frontend is chosen, it needs one action
table, one menu placement per category, a menu floor, and a tab strip that is a
view. The work here is therefore not thrown away by #117; it is the specification
#117 would have to satisfy.

Also out of scope: the icon set, the visual skin, the panes' contents, #118's
prose-only editor surface (orthogonal — the furniture does not care how much of the
page the editor holds).

## 11 · Open questions, each with a recommendation

**Q1 · Which variant is the default?** *Recommendation: menus + toolbar.* It is what
exists, it is what has been driven, and the tab strip then ships as an opt-in that
nobody is forced into. The alternative — tabs by default — is defensible for a
Word-shaped product, and it is one line either way; the point is that it is chosen
rather than defaulted into.

**Q2 · Is File a tab?** *Recommendation: no.* LibreOffice's tabbed notebookbar does
have a File tab, and for ksav it would undo `#128`: the file and the library are
statements about a *file*, and the tab strip is about the page. They stay in the
menu bar, where they already have one home each.

**Q3 · Does the menu bar stay visible in the tabs variant?** *Recommendation: yes.*
Covered in §6; stated as a question because the answer decides whether a `☰` is a
second door or the only one.

**Q4 · What happens in a narrow window?** *Recommendation: the tab strip collapses
to the menus, and says so on the switch* — not a horizontally scrolling tab row.
A writer on a half-screen should lose the fast lane, never a command.

**Q5 · The Hebrew names.** The six in §5 are proposed, not settled. `בית` and `הכנס`
are the conventional translations; `פריסה` and `מקורות` are choices a writer should
hear aloud before we spend them on six permanent labels.

**Q6 · Do the two optical levels survive contact?** The tab row and the menu row are
both horizontal strips of words in a right-to-left page. If they read as two
answers to one question on screen (which is #128's complaint one storey up), the
answer is not a third strip: it is fewer tabs, or the menu bar folding into the
`☰` behind a single labelled button.

## 12 · Order of work

Each step is shippable and fenced on its own, and each one is smaller than it looks
because the tables already exist.

1. `TAB_OF` beside `MENU_OF`, with the fence that every category has both — no UI
   change yet, so the taxonomy is reviewable before anything moves on screen.
2. The orphan fence: every `BUILT_IN` action has a menu home. Whatever it finds is
   real, and cheap to fix while nothing else is moving.
3. The `shell` preference and the *menus* variant — the floor, with no tabs. This is
   the variant that has to be complete, so it is built first.
4. The tab strip, from `TAB_OF`, in the *tabs* variant.
5. Contextual tabs, from what `contextbar.ts` already answers.
6. The boot fence for the variant, and the RTL / keyboard checks on `tablist`.

Deciding after step 1 means the expensive part (2–6) has a spec; deciding after
step 3 means the tab strip is a rendering of a table somebody has already read.

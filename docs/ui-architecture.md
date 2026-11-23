# The shell: menus as the floor, tabs as a switch

*The spec the shell is built to. The owner's choices are recorded in
[`decisions/2026-11-23-the-shell-is-built-from-placements`](../decisions/2026-11-23-the-shell-is-built-from-placements.md);
this page is the living version and is edited as the build teaches us things.*

## 1 · What this decides, and what it does not

It decides **how the shell is shaped**: where a command lives, how many ways there
are to reach it, how the furniture is built from data, and what a writer can
change. It does not decide the visual skin, the icon set, or the technology
underneath (§12, #117).

The reference is **LibreOffice's architecture, not its wardrobe**: menus are the
floor that never goes away, a tab strip is a switch a writer can turn on, and both
are views of one table. In LibreOffice's Tabbed interface the menu bar folds into a
`☰` button by default and View ▸ Menubar brings it back; we copy that, the switch
and the taxonomy, not the accumulated toolbars.

## 2 · What exists today, in one line each

| surface | where | the honest problem |
|---|---|---|
| menu bar | `ribbon.ts`, `lazyMenu` — File, Documents, Export, Insert, Format, Table, Sources, Macros | each menu is hand-written; `MENU_OF` sends `torah`, `reference`, `review` and `layout` to Insert while a Sources menu exists beside it |
| toolbar | `ribbon.buildToolbar` | one row of unnamed glyphs, a fraction of the commands, no rule for what belongs |
| command palette | `palette.ts` | the real answer for regulars, invisible to a new writer |
| keyboard map | `DEFAULT_KEYS`, `keysdrawer.ts` | complete, useful only after the names are learned |
| contextual strip | `contextbar.ts` | knows *what is around the caret* |
| drawers and panels | `stylespanel`, `settingsdrawer`, `noteschooser`, `commandsdrawer` | commands live in whichever of five places they were written into |

Five surfaces and no statement of which holds what. The defect is the missing
statement, and the fix is to make placement **data** that every surface renders.

## 3 · The model

1. **Every action has exactly one menu home.** Enforced by the type: `Place.menu`
   is required (§4).
2. **A tab is a view, never a home.** `Place.tab` is optional and defaults from the
   menu; there is no way to write a tab placement without a menu placement.
3. **A writer can turn the tabs off and lose nothing.** Menus are the floor.
4. **Nothing in the shell is laid out by hand.** Menus, tabs, Home, the toolbar and
   the contextual tabs are all renderings of one list of placed actions.
5. **Every word the shell draws exists in Hebrew and English**, and follows
   `settings.lang` — the interface language, which is not the document's
   (`2026-08-12-nothing-ever-asked-what-language-the-interface-was`).

## 4 · Placement is data

### The record

```ts
// placement.ts
export type TabId = "home" | "insert" | "layout" | "table" | "notes" | "sources" | "view";

export interface Place {
  menu: MenuId;     // required — the floor
  group: string;    // section in the menu, button group on the tab (i18n key)
  tab?: TabId;      // defaults to TAB_OF_MENU[menu]
  face?: boolean;   // drawn on the tab row; otherwise reachable behind the group's "⋯"
  home?: boolean;   // also drawn on the Home tab
  order?: number;   // within the group; otherwise registry / declaration order
  glyph?: string;   // optional icon; the label is always drawn beside it on a tab
}
```

Two rules are applied by `placed()` itself, so nobody has to remember them per row:

- **A `*_config` command (`הגדרות_…`) is never on `face`.** It goes into its group's
  `⚙` list at the end of the group: every group that has settings gets one `⚙`
  button that lists them, after the `⋯`. There are about fifty of these, and drawing them as
  buttons would make every tab a wall of "how X is set".
- **A deprecated command has no place** (`#הערה_על_הערה`, `#הערה_א`). It stays in
  the palette and completions for old documents. A fence asserts that deprecated
  and placed are disjoint.

A tab button's label is a **short label** (`btn.<id>` in i18n, e.g. *סמן הוספה*
for the review command `#הוספה`, so it doesn't collide with the tab called
הוספה). It falls back to the command's name with `_` read as a space.

`MenuId` grows to the full menu bar (§5). An action's **label** and **description**
are not in the record — they come from i18n by id (`sc.<id>`, `<id>Lede`) for shell
actions and from the registry's own Hebrew/English pair for engine commands.

### Where each kind of action gets its `Place`

| kind | source of the action | source of the place |
|---|---|---|
| shell actions | `actionsurface.BUILT_IN` | a `place` field on each entry, beside `id` and `run` |
| engine commands (`#הערה`, `#מעבר_עמוד`, …) | the registry, `commands.rs` | `PLACE_OF_CATEGORY` (the grown-up `MENU_OF`), then `PLACE_OVERRIDE` keyed by command name |
| generated actions | macros, custom styles (`actionsurface.ts`) | assigned where they are generated: macros → Tools, styles → Format / Home's styles group |
| the writer's own ribbon | `settings.shell.ribbon` | replaces the default tab layout (§8); it can arrange the tabs however it likes but cannot touch `menu` |

The engine still does not decide the menubar: the category is what a command is
*about*, and where it is shown remains the client's table, as `menus.ts` argues.
`PLACE_OVERRIDE` is where mixed categories are split — `block` and `layout` both
hold "put a thing on the page" and "set up the page", so the page half is
overridden to the Layout tab rather than the engine growing a new category.

### Building

```ts
export function placed(): PlacedAction[]   // { id, label, desc, place, run }
```

One function collects all four sources, merges in order, and returns the list.
Every surface is a pure function of it:

- **menus**: group by `menu` → `group`; each item is label, chord, description.
  This replaces the hand-written item lists in `ribbon.ts` (`buildSourcesMenu`,
  `buildTableMenu`, …).
- **tabs**: group by `tab` → `group`; draw `face` items as named buttons; each
  group ends in `⋯`, which opens that menu section.
- **Home**: the `home: true` items, grouped by their own `group`.
- **toolbar**: the tab renderer pinned to one tab with the tab headers hidden.
- **contextual tab**: the tab renderer filtered to one tab, mounted when
  `contextbar.ts` reports the caret is in a table or a note.

`placed()` is recomputed when settings, the macro list or the custom styles
change, and the shell re-renders from it. It never rebuilds the editor.

## 5 · What goes where

### Names

The names follow **Hebrew Word and LibreOffice**, because that is the shell a
Hebrew-speaking writer has already used. The Torah-specific words are the ones a
yeshiva bochur already says: *מראי מקומות*, *מפתחות*, *דיבור המתחיל*, not a
translation of an English term.

**Menu bar**, in document direction:

| he | en | holds |
|---|---|---|
| **קובץ** | File | new, open, save, save as, export (submenu), print, snapshots, git |
| **מסמכים** | Documents | the library: switch, recent, close, new document tab |
| **עריכה** | Edit | undo, redo, find, replace, spelling, heal brackets |
| **הוספה** | Insert | things put on the page |
| **עיצוב** | Format | text, paragraph, styles, and **Page** (the Layout tab's menu home) |
| **טבלה** | Table | the table and its operations |
| **הערות** | Notes | notes, note systems, numbering, references, review |
| **מקורות** | Sources | sefer structure, מראי מקומות, Girsa, מפתחות |
| **תצוגה** | View | panes, zoom, folding, the shell switch, theme, language |
| **כלים** | Tools | macros, keyboard, commands, **customize the ribbon…**, settings |
| **עזרה** | Help | help, keys, about |

`עריכה`, `הערות`, `תצוגה`, `כלים` and `עזרה` are new; Export folds into File and
Macros into Tools. `הוספה`, `קובץ`, `מסמכים` and `מקורות` are already the i18n strings.

**Tabs:** **בית** · **הוספה** · **פריסה** · **טבלה** · **הערות** · **מקורות** · **תצוגה**
(Home · Insert · Layout · Table · Notes · Sources · View).

### The default ribbon

Each group shows its **face** buttons, then `⋯` (the rest of the group), then `⚙`
(its `הגדרות_…` commands) when it has any. A face holds at most six buttons per
group by default, so a tab fits on a laptop screen in Hebrew.

**בית · Home**: what a writer reaches for every minute. Everything here is a `home`
pick; each item's menu home is elsewhere.

| group | face | behind `⋯` |
|---|---|---|
| עריכה | undo, redo | find |
| גופן | הדגשה, נטוי, קו תחתון, סימון, גדול, קטן | קו חוצה, עילי, תחתי, רברבתי, כתב רש"י, צבע, רקע, גופן שונה, גודל גופן, מרווח אותיות, קוד, עיצוב |
| פסקה | ימין, מרכז, שמאל | מימין לשמאל, משמאל לימין |
| סגנונות | the first custom styles | the styles panel |
| מבנה | כותרת 1, כותרת 2, כותרת 3, סימן, סעיף | אות, דיבור המתחיל, שער, תת שער |
| הערות | הערה, הערה ב | הערתסיום |

The `הערות` group on Home is there because a footnote is the most-used command in
a sefer. Its own tab has the rest.

**הוספה · Insert**

| group | face | `⋯` | `⚙` |
|---|---|---|---|
| כותרות | שער, תת שער, כותרת… | כותרת בהערה | headings, title, subtitle, h1–h9 |
| רשימות | רשימה, ממוספרת, ממוספרת עברית | פריט, רשימת הגדרות | lists |
| בלוקים | ציטוט, תיבה, מקור | הערת צד, אזהרה, הצלחה | each box |
| אובייקטים | טבלה, תמונה, נוסחה | נוסחה בשורה | image, formulas |
| שונות | קו מפריד, חסר | כלול (a chapter from another document) | rule |

**פריסה · Layout** (menu home: עיצוב ▸ עמוד)

| group | face | `⋯` |
|---|---|---|
| עמוד | מקטע עמוד, כותרת עליונה, כותרת תחתונה | |
| מעברים | מעבר עמוד, מעבר טור | מעבר שורה, מעבר פסקה |
| טורים | טורים | |
| מרווחים | מרווח, הזחה | רווח אופקי |

**טבלה · Table**: also the contextual tab when the caret is in a table.

| group | face | `⋯` |
|---|---|---|
| טבלה | טבלה | |
| שורות ועמודות | insert row above/below, insert column before/after, delete row, delete column | the rest of the table verbs |
| תאים | מיזוג, כותרת תא, תא | split, cell configuration |
| ⚙ | | tables |

**הערות · Notes**: also the contextual tab when the caret is in a note.

| group | face | `⋯` |
|---|---|---|
| הערות | הערה, הערה ב, הערה ג, tiered note | הערה בדרגה |
| הערות סיום | הערתסיום, הערות בסוף | הערות בסוף צד |
| הערות צד | עם הערות צד, הערת גיליון | עם הערות דו צד, הערת ימין, הערת שמאל |
| מערכות הערות | ערוץ, אזור, הצג אזור | מדור א–ג, הערות מדורגות, מדף א–ג, הערה זרם, הערה בשם, גוף הערה, גופי הערות |
| מספור | התחל מספור, המשך מספור, renumber | מונה, render notes |
| הפניות | הפניה, סמן, הפניה להערה | |
| סקירה | סמן הוספה, סמן מחיקה, הערת עורך | review view |

Each group's `⚙` collects its own `הגדרות_…` (notes, note text, numbering, bands,
page-bands, streams, endnotes, counters, review).

**מקורות · Sources**

| group | face | `⋯` |
|---|---|---|
| מבנה הספר | סימן, סעיף, אות, דיבור המתחיל | עם פירוש |
| מראי מקומות | מראה מקום, ציון, גמרא, פסוק, ציון מקור | |
| גירסא | חפש מקור לקטע, קשר מראי מקומות, רענן מקורות | hydra |
| מפתחות | תוכן, מפתח מקורות, מפתח ענינים, ערך | רשימת סימונים |

**תצוגה · View**

| group | face | `⋯` |
|---|---|---|
| חלונות | swap panes, minimap | pane zoom, narrow/widen |
| קיפול | fold all, unfold all | fold to level 1–6, fold lists to depth |
| תצוגה | prose only, zoom in, zoom out | reveal places |
| ממשק | shell switch, theme, interface language | **customize the ribbon…** |

### The rules behind the defaults

So the next command added lands in the right place without a meeting:

1. A category's default tab is `TAB_OF_MENU[menu]`; `PLACE_OVERRIDE` is for the
   exceptions, and it is short.
2. `face` is the **noun form** of a group: the command a writer would name if
   asked "what is in here". Variants and "at any level" forms go behind `⋯`.
3. `הגדרות_…` → `⚙`. Deprecated → not placed.
4. Home holds **per-minute** verbs only; a command used once per document (title,
   table of contents) is never a Home pick.

## 6 · The header, top to bottom

```
שֵׁם הַמְחַבֵּר · kuntres.ksav · not saved                 ⚙ ◐ ?   ← identity + chrome
menus variant:   [קובץ] [מסמכים] [עריכה] [הוספה] [עיצוב] … [עזרה]
toolbar variant: menus, then one row: the Home tab without headers
tabs variant:    [☰ תפריט] ┌ בית ┬ הוספה ┬ פריסה ┬ טבלה ┬ הערות ┬ מקורות ┬ תצוגה ┐
                           │ ↶ ↷ │ ב נ ק │ ⋯ ⚙ │ …                       ← named buttons
```

- **Identity first, and it is a sentence** (`header.docTitle()`, #128).
- **The chips stay where they are**; they report state and are not furniture.
- **In the tabs variant the menu bar folds into `☰ תפריט`.** The button has a
  name, is always visible, and opens the same tree, so the floor is still visible.
  A writer who wants the full menu bar back turns on `shell.menubar` (§7).

## 7 · Settings change the UI

Everything the writer can change lives in one settings object, persisted by
`settings.ts` and edited in the settings drawer, the View menu and the customize
dialog (§8):

```ts
shell: {
  variant: "menus" | "toolbar" | "tabs";   // default "toolbar"
  menubar: "auto" | "always";              // tabs variant: "auto" folds into ☰
  toolbarTab: string;                      // which tab the toolbar variant pins (default home)
  labels: "names" | "names+glyphs";        // a button always has its name
  contextual: boolean;                     // contextual table / notes tabs
  ribbon?: RibbonLayout;                   // absent = the default ribbon of §5
}
```

plus the existing `lang` (interface language) and theme.

- Changing any of these re-renders the shell from `placed()`; the caret and the
  scroll stay put.
- **The keyboard map is the same under every setting.** A chord belongs to the
  action, not the furniture.
- A narrow window collapses the tab strip to `☰ תפריט` and says so; there is no
  horizontally scrolling tab row.

## 8 · Customizing the ribbon

### What a writer can do

One dialog, **כלים ▸ התאמת הסרגל…** (Tools ▸ Customize the ribbon…), also reachable
from right-clicking the tab strip. Everything in it applies live behind the dialog,
so the writer sees the ribbon change as they edit it.

```
┌ התאמת הסרגל ─────────────────────────────────────────────────────────┐
│ הסרגל שלי                         │ כל הפקודות                        │
│ ▾ בית                     👁 ✎ 🗑 │ [ חיפוש…               ] [הכול ▾] │
│    ▾ גופן                         │  הדגשה        עיצוב · בית         │
│       ● הדגשה                     │  מראה מקום    מקורות · מקורות     │
│       ● נטוי                      │  הערת עורך    הערות · הערות       │
│       ○ קו חוצה   (מאחורי ⋯)      │  …                                │
│    ▸ פסקה                         │                                   │
│ ▸ הוספה                           │        [ ← הוסף ]                 │
│ ▸ הלשונית שלי             👁 ✎ 🗑 │                                   │
│ [+ לשונית] [+ קבוצה] [מזג לשוניות] │                                   │
│ [↑] [↓]  [על הסרגל / מאחורי ⋯]     │                                   │
├────────────────────────────────────┴──────────────────────────────────┤
│ [איפוס הלשונית] [איפוס הכול]  [ייבוא…] [ייצוא…]            [סגירה]    │
└───────────────────────────────────────────────────────────────────────┘
```

- **Tabs:** add a new tab, rename, hide (👁), delete, reorder, **merge** two tabs
  (the second's groups are appended to the first, and the merged tab keeps the
  first's name until renamed).
- **Groups:** add, rename, delete, reorder, move to another tab.
- **Commands:** add any command, from the searchable list on the left, to any group;
  remove; reorder; and toggle **on the ribbon (●) / behind `⋯` (○)**. The list
  shows where each command currently lives in the menus and on the ribbon. A filter
  narrows it by menu, or to "not on my ribbon".
- **A command may appear on more than one tab.** A writer's own *Kuntres* tab
  with siman, seif, הערה and מראה מקום is the point of this dialog.
- **Reset** one tab or everything, back to §5.
- **Import / export** the layout as a file, so a chavrusa or a whole yeshiva can
  share one ribbon.
- **The menus are not editable.** The dialog says so in one line: *every command
  remains in its menu; this changes only the ribbon.* That sentence is why the
  dialog can be this powerful without any risk of a command becoming unfindable.

The quick path is the same operations from a **right-click on a ribbon button**
(*move to ⋯ / remove from tab / add to Home / customize…*) and on a tab header
(*rename / hide / customize…*). Every right-click action is also in the dialog, so
nothing depends on a mouse.

Keyboard: the left tree is a `tree`; Alt+↑/↓ reorders the focused node, `Space`
toggles ●/○, `Delete` removes, F2 renames. Drag and drop works too, but it is
never the only way to do something.

### The data

```ts
interface RibbonLayout {
  version: 1;
  tabs: {
    id: string;                        // built-in TabId, or "user:<uuid>"
    from?: TabId[];                    // built-in tabs this one is, or merges
    name?: string;                     // set when renamed; built-in names stay bilingual otherwise
    hidden?: boolean;
    groups: {
      id: string;
      name?: string;
      items: { action: string; face: boolean }[];
    }[];
  }[];
  known: string[];                     // every action id that existed when it was saved
}
```

- The first edit copies the default ribbon into `ribbon`; **reset** deletes it.
- **Commands added in a later version** are the ones not in `known`. They are added
  to their default group in whichever saved tab lists the default tab in `from`.
  If that tab was deleted, they go behind the `⋯` of a tab the writer kept. They
  are never dropped, and the dialog marks them *new* once.
- **Commands removed in a later version** are dropped from the layout when it is
  loaded, silently, and a fence checks that loading never throws on an unknown id.
- A renamed or user-created tab has the one name the writer typed. Built-in tabs
  that are not renamed keep following `lang`.
- An imported file is validated before it is applied: unknown actions are dropped
  and counted ("N commands in this file do not exist in this version"), never run.

## 9 · Labels and language

- A tab button that is not universally understood carries its name; `labels`
  can add glyphs but cannot remove names.
- Every tab name, menu name, group name, short label and description exists in
  `i18n-he.ts` and `i18n-en.ts`; engine commands use the registry's own pair.
  Switching `lang` re-renders the shell, and the customize dialog, with no reload.
- RTL: the tab row is a `tablist` in interface direction, arrows move along the
  flow, and no glyph is mirrored (#136).

## 10 · The fences

| fence | what goes red if it is reverted |
|---|---|
| `Place.menu` is required (type) | an action reachable only from a tab, the palette or a chord |
| `RibbonLayout` has no way to name a menu (type) | a customisation that hides a command |
| every `BUILT_IN` and generated action has a `place`; deprecated ones have none | an orphan, or a deprecated command advertised |
| no `*_config` command is on a default `face` | a tab full of "how X is set" |
| every registry category has a `PLACE_OF_CATEGORY` row; every override names a real command | a missing section; a dead override |
| every placed action, group, menu, tab and short label has Hebrew **and** English | an id drawn in one language |
| each default group has ≤ 6 face buttons | a default tab becoming a wall |
| menus from `placed()` hold every item the old hand-written menus held | the conversion dropping an item |
| a saved ribbon survives a version that adds and one that removes actions | a writer's layout lost, or a new command invisible on their ribbon |
| a ribbon with every tab deleted still leaves a working `☰ תפריט` | customising your way out of the app |
| export → import round-trips; an import with unknown ids loads and reports them | a shared layout that breaks another install |
| every `shell` setting, including `ribbon`, persists and restores the same DOM | the setting drawn but not stored (`2026-08-12`) |
| a chord works under every variant and every ribbon | the furniture changing what the keyboard does |
| the boot fence asserts the requested variant | booting into the wrong shell (#229) |
| the tab strip is a `tablist` and the dialog tree a `tree`, with keyboard reordering, in both languages | a keyboard user locked out |

## 11 · Order of work

All of it lands in this wave, on one branch, in this order. Each step leaves the
tree green, so it can be reviewed in pieces even though it ships together.

1. **The data.** `placement.ts`: `Place`, `TAB_OF_MENU`, `PLACE_OF_CATEGORY`,
   `PLACE_OVERRIDE`, `placed()`, the `⚙` and deprecated rules; `place` on every
   `BUILT_IN` entry, macro and style; the §5 names and short labels in both
   languages; the data fences. No visible change.
2. **Menus from data.** The menu bar rendered from `placed()`; the new menus; Export
   into File, Macros into Tools; the parity fence; the hand-written lists deleted.
3. **The `shell` settings** and their controls; the *menus* variant; persistence
   and boot fences.
4. **The tab renderer**: tabs, Home, `⋯`, `⚙`, `☰ תפריט`; the *tabs* variant.
5. **The toolbar as a pinned tab**, replacing `ribbon.buildToolbar`.
6. **Contextual tabs** for tables and notes, from `contextbar.ts`.
7. **`RibbonLayout`**: load, save, version migration (`known`), import/export, and
   their fences, rendered by the same tab renderer.
8. **The customize dialog** and the right-click shortcuts, with its keyboard
   tree; then the RTL, keyboard and both-languages checks across every variant.

## 12 · What this does not decide

**#117** proposes a native Rust `egui` frontend. Whatever is chosen, §3–§5 and §8's
data are statements about *ksav*: one action list, one menu home per action, a
menu floor, tabs as a view, placements and the writer's ribbon as data. A
different frontend inherits this page as its spec.

Out of scope: the icon set, the visual skin, the panes' contents, #118's prose-only
editor surface, and customizing the **menus** (deliberately never).

## 13 · Left to the build

- The exact verbs of the twenty table operations on the Table tab's face are
  chosen from `structure`'s list in step 1, by the §5 rules.
- Short labels where the command name reads badly on a button are written in
  step 1 and reviewed as one table in both languages.
- **Built after the eight steps (#233):** drag and drop in the customize tree
  (`ribbonedit.drop`, wired in `ribboncustomize.ts`). It is never the only way:
  every drop is also Alt+↑/↓ or a drawer button.

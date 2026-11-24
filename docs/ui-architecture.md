# The shell: one ribbon, built from placements

*The spec the shell is built to. The owner's choices are recorded in
[`decisions/2026-11-23-the-shell-is-an-office-ribbon`](../decisions/2026-11-23-the-shell-is-an-office-ribbon.md),
which supersedes
[`the-shell-is-built-from-placements`](../decisions/2026-11-23-the-shell-is-built-from-placements.md).
This page is the living version and is edited as the build teaches us things.*

## 1 · What this decides

It decides **how the shell looks and is shaped**: the one ribbon, where a command
lives, how the furniture is built from data, how it behaves on a small or half
screen, and what a writer can change. It does not decide the editor surface
(#118's WYSIWYG) or the technology underneath (#117).

**The reference is Word 365**, because that is the shell a Hebrew-speaking writer
already has in their hands: a title row with a Quick Access bar, a tab row, a ribbon
of named groups with large and small buttons, a full-window File backstage,
contextual tabs that appear coloured, key tips on Alt, and a status bar that shows
state. **From LibreOffice we take one thing:** the full menus behind a `☰` at the
end of the tab row, so every command has a menu home that no customisation can
remove.

There is **one shell**. No menus variant, no toolbar variant, no switch. A writer
who wants the room collapses the ribbon to its tab names (Ctrl+F1, or double-click
a tab); that is the only shape change.

## 2 · The model

1. **Every action has exactly one menu home.** `Place.menu` is required (§3). The
   menus are reachable from `☰` at all times.
2. **A tab is a view, never a home.** `Place.tab` defaults from the menu.
3. **Nothing in the shell is laid out by hand.** The ribbon, the `☰` menus, the
   backstage, the contextual tabs, the key tips and the shrink order are all
   renderings of one list, `placed()`.
4. **Every word the shell draws exists in Hebrew and English** and follows
   `settings.lang`, the interface language
   (`2026-08-12-nothing-ever-asked-what-language-the-interface-was`).
5. **The ribbon never wraps and never changes height.** It shrinks (§7).

## 3 · Placement is data

### The record

```ts
// placement.ts
export type TabId = "home" | "insert" | "layout" | "notes" | "sources" | "review" | "view" | "table";
export type FaceSize = "large" | "small" | "icon";

export interface Place {
  menu: MenuId;      // required — the floor
  group: string;     // section in the menu, group on the tab (i18n key grp.<group>)
  tab?: TabId;       // defaults to the tab whose TAB_GROUPS row lists the group
  face?: boolean;    // drawn on the ribbon; otherwise behind the group's ⋯
  home?: boolean;    // also drawn on Home
  order?: number;
  icon?: IconId;     // from icons.ts; a face without one is drawn as its label
  size?: FaceSize;   // default "small"; at most two "large" per group
}
```

`placed()` applies three rules itself:

- **A `*_config` command (`הגדרות_…`) is never a face.** It goes in its group's
  dialog launcher, the small `⚙` corner button in the group's label row, which is
  where Word puts *paragraph settings…*.
- **A launcher is behind `⚙` too.** `LAUNCHER` names the shell actions that open
  a group's dialog (*page setup…*, the Notes chooser); in the menu they keep
  their place rather than sinking with the settings rows.
- **A deprecated command has no place.** It stays in the palette for old documents.
- **A face's icon comes from `ICON_OF`** (keyed by action id) when the row does not
  set one, so the registry never has to know about icons.

Which groups a tab draws, and in what order, is `TAB_GROUPS`: one row per tab
but Home, the §5 tables below. A group no row lists — File's, Edit's, the conceal
rows, the interface toggles that live in the status bar — is a menu's and no
tab's. Home is `HOME`, which borrows faces from other groups.

Labels and descriptions are not in the record: `btn.<id>` (short label),
`sc.<id>` / the registry pair (long label), `<id>Lede` (description).

### Sources of a place

| kind | source of the action | source of the place |
|---|---|---|
| shell actions | `actionsurface.BUILT_IN` | `ACTION_PLACE` keyed by id |
| engine commands | the registry, `commands.rs` | `PLACE_OF_CATEGORY`, then `PLACE_OVERRIDE` by name |
| generated | macros, custom styles | where they are generated: macros → Tools, styles → Home ▸ Styles |
| the writer's ribbon | `settings.shell.ribbon` | replaces the default tab layout (§9); cannot touch `menu` |

## 4 · The window, top to bottom

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ כתב  [💾][↶][↷][▾]     קונטרס.ksav · נשמר                               ⓘ  ⚙ │ title row
│ קובץ  בית  הוספה  פריסה  הערות  מקורות  סקירה  תצוגה  [טבלה]           ☰ ⌃ │ tab row
│ ┌──────────┬───────────────────────┬────────────┬──────────┬────────────────┐ │
│ │  📋      │ [David  ▾][12▾] A⁺ A⁻ │ ≡ ≡ ≡      │ ¶ סגנון ▾│  ✱      §     │ │ ribbon
│ │ הדבקה    │  B  I  U  S  🖍▾ A▾   │            │          │ הערה   סימן   │ │ ~92px
│ ├──עריכה───┴─────גופן─────────⚙───┴──פסקה───⚙─┴─סגנונות─┴──מבנה──────────┤ │
│ └────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                │
│                               the editor                                       │
│                                                                                │
│ שמור · 1,204 מילים · מנוע wasm       ⑂  עב  ＃  ⏺  אָ  ☀           status bar │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Title row

- **Brand**, then the **Quick Access bar**: save, undo, redo, then the writer's own
  additions (`shell.quick`), then a `▾` that lists them with checkboxes. Right-click
  any ribbon button ▸ *add to Quick Access*.
- **The document title**, as a sentence (`header.docTitle()`, #128). Click to rename.
- **ⓘ help** and **⚙ settings**, small, at the end. They are the only two icons in
  the title row that are not the writer's choice.

### Tab row

`קובץ` (backstage, §6) · `בית` · `הוספה` · `פריסה` · `הערות` · `מקורות` · `סקירה` ·
`תצוגה` · contextual tabs (§5) · then at the far end **`☰`** (every menu, as a
cascading dropdown) and **`⌃`** (collapse / pin the ribbon). The ribbon draws the
row as `.ribbon-head`: the `tablist`, then what the header hands it for the end.

The tab row is a `tablist` in interface direction; ←/→ follow the flow, Home/End
jump, and no glyph is mirrored (#136).

### The ribbon

One row of **groups**, each with its name underneath and an optional `⚙` launcher
in the name row. Inside a group, buttons are one of three sizes:

| size | shape | used for |
|---|---|---|
| **large** | 32px icon above a label, full height | the group's noun (הדבקה, הערה, טבלה, תמונה) |
| **small** | 16px icon beside a label, stacked three high | most verbs |
| **icon** | 16px icon only, tooltip names it | the universally known: B I U, alignment |

The ribbon is **92px** high and the tab row **28px**: about 120px together, the
same as Word, on a 1366×768 screen.

**Collapsed** (Ctrl+F1, double-click a tab, or `⌃`): only the tab row shows; a click
on a tab drops that tab's ribbon over the document until the next click outside or
Esc, or until a command on it runs; pressing the same tab again takes it back. The
dropped ribbon is a `PANELS` popup (`ribbon-panel`), so outside-click and Esc are
the ones every popup has. `⌃` sits at the end of the tab row. Stored in
`shell.collapsed`.

### Status bar

Left: save state, word count, engine badge (as today). Right: **the controls that
show state**, each small with a tooltip: version control (`⑂` clean, `●` changed,
`⚠` conflicted, `↑`/`↓` ahead or behind — the glyph is the report, so it is the one
face here that is not an icon), interface language (`עב`/`EN`),
code/prose surface (`＃`/`🅐`), recording a macro (`⏺`/`⏹`), nikud (`אָ`), theme
(`☀`/`🌙`). They keep `data-chip` so the acceptance run finds them.

### What used to be the chip row

The 22-icon chip row is gone. Each chip went to the surface its kind belongs on:

| was a chip | now |
|---|---|
| undo, redo (and save, which was a File-menu row) | Quick Access bar |
| help, settings | title row ⓘ ⚙ |
| language, prose, record, nikud, theme | status bar |
| outline, notes chooser, notes pane, marks pane, arrangement, fold all, unfold all, find, styles, commands | ribbon buttons on View / Home |
| git | its state glyph in the status bar; the panel also on Review ▸ Versions |
| history, review | Review ▸ Versions / Comments, and the backstage's Versions section |

## 5 · What goes where

### Names

Hebrew Word and LibreOffice names, plus the Torah words a yeshiva bochur already
says: *מראי מקומות*, *מפתחות*, *דיבור המתחיל*, never a translation of an English term.

**Menus**, under `☰`, in document direction:

| he | en | holds |
|---|---|---|
| **קובץ** | File | new, open, save, save as, export, print, versions |
| **מסמכים** | Documents | the library: switch, recent, close, new document tab |
| **עריכה** | Edit | undo, redo, cut, copy, paste, find, replace, heal brackets |
| **הוספה** | Insert | things put on the page |
| **עיצוב** | Format | text, paragraph, styles, page |
| **טבלה** | Table | the table and its operations |
| **הערות** | Notes | notes, note systems, numbering, references |
| **מקורות** | Sources | sefer structure, מראי מקומות, Girsa, מפתחות |
| **סקירה** | Review | spelling, editor's comments, insert/delete marks, versions, history, git |
| **תצוגה** | View | panes, zoom, folding, theme, language, ribbon |
| **כלים** | Tools | macros, keyboard, commands, settings |
| **עזרה** | Help | help, keys, about |

**Tabs:** קובץ · בית · הוספה · פריסה · הערות · מקורות · סקירה · תצוגה, and **טבלה**
only as a contextual tab. *Insert table* lives on Insert.

### The default ribbon

`L` large, `S` small, `I` icon only. ⋯ is the rest of the group. ⚙ is the launcher.

**בית · Home**: what a writer reaches for every minute.

| group | faces | ⋯ |
|---|---|---|
| לוח | הדבקה L · גזירה S · העתקה S | |
| גופן | font box · size box · A⁺ I · A⁻ I · הדגשה I · נטוי I · קו תחתון I · קו חוצה I · סימון I (split) · צבע I (split) | עילי, תחתי, רברבתי, כתב רש"י, רקע, מרווח אותיות, קוד |
| פסקה | ימין I · מרכז I · שמאל I · מימין לשמאל I · משמאל לימין I | |
| סגנונות | style box · סגנונות S | |
| מבנה | כותרת 1 S · כותרת 2 S · כותרת 3 S · סימן L · סעיף S | אות, דיבור המתחיל, שער, תת שער |
| הערות | הערה L · הערה ב S | הערתסיום |
| חיפוש | חיפוש S · החלפה S | |

A group draws in lanes, as Word's do: each L is a column of its own, S faces
stack three to a column, I faces sit in two rows; ⋯ joins the last lane, and ⚙
sits in the caption's corner.

**הוספה · Insert**

| group | faces | ⋯ |
|---|---|---|
| טבלאות | טבלה L | |
| איורים | תמונה L · נוסחה S | נוסחה בשורה |
| כותרות | שער S · תת שער S · כותרת S | כותרת בהערה |
| רשימות | רשימה S · ממוספרת S · ממוספרת עברית S | פריט, רשימת הגדרות |
| בלוקים | ציטוט S · תיבה S · מקור S | הערת צד, אזהרה, הצלחה |
| שונות | קו מפריד S · חסר S · כלול S | |

**פריסה · Layout**

| group | faces | ⋯ |
|---|---|---|
| עמוד | מקטע עמוד L · כותרת עליונה S · כותרת תחתונה S | |
| מעברים | מעבר עמוד S · מעבר טור S | מעבר שורה, מעבר פסקה |
| טורים | טורים L | |
| מרווחים | מרווח S · הזחה S | רווח אופקי |

**הערות · Notes**

| group | faces | ⋯ |
|---|---|---|
| הערות | הערה L · הערה ב S · הערה ג S · tiered S | הערה בדרגה |
| הערות סיום | הערתסיום S · הערות בסוף S | הערות בסוף צד |
| הערות צד | עם הערות צד S · הערת גיליון S | עם הערות דו צד, הערת ימין, הערת שמאל |
| מערכות הערות | ערוץ S · אזור S · הצג אזור S | מדור א–ג, הערות מדורגות, מדף א–ג, זרם, בשם, גוף הערה |
| מספור | התחל מספור S · המשך מספור S · מספר מחדש S | מונה |
| הפניות | הפניה S · סמן S · הפניה להערה S | |

**מקורות · Sources**

| group | faces | ⋯ |
|---|---|---|
| מבנה הספר | סימן L · סעיף S · אות S · דיבור המתחיל S | עם פירוש |
| מראי מקומות | מראה מקום L · ציון S · גמרא S · פסוק S | ציון מקור |
| גירסא | חפש מקור S · קשר מראי מקומות S · רענן מקורות S | |
| מפתחות | תוכן L · מפתח מקורות S · מפתח ענינים S · ערך S | רשימת סימונים |

**סקירה · Review**

| group | faces | ⋯ |
|---|---|---|
| הגהה | בדיקת איות L | |
| הערות עורך | הערת עורך L · חלון סקירה S | |
| מעקב | סמן הוספה S · סמן מחיקה S | |
| גרסאות | שמור גרסה S · היסטוריה S · גיט S | |

**תצוגה · View**

| group | faces | ⋯ |
|---|---|---|
| חלונות | מתאר S · הערות S · סימונים S · סידור S · החלף חלונות S · מפת מסמך S | |
| קיפול | קפל הכול S · פתח הכול S | קפל לרמה 1–6 |
| מרחק | הגדל I · הקטן I | גלה מקומות |
| פקודות | פקודות S · מקרו S | |
| סרגל | התאמת הסרגל S · צמצום הסרגל S | |

**טבלה · Table** (contextual)

| group | faces | ⋯ |
|---|---|---|
| שורות ועמודות | שורה מעל S · שורה מתחת S · עמודה לפני S · עמודה אחרי S · מחק שורה S · מחק עמודה S | the rest |
| תאים | מיזוג S · פיצול S · כותרת תא S | תא |

### The rules behind the defaults

1. A category's place is its menu group; the tab is whichever `TAB_GROUPS` row
   lists that group. `PLACE_OVERRIDE` is short.
2. A face is the **noun form** of its group. At most **two large** faces, **six
   labelled** (large or small) faces and **ten icon** faces per group; variants go
   behind ⋯. Comparing two versions is not a face: it is done inside the history
   and git panels, where the two versions are chosen.
3. `הגדרות_…` → the group's ⚙. Deprecated → not placed.
4. Home holds **per-minute** verbs only.
5. A large face has an icon; a face with no icon is never `icon` size.

## 6 · File is a backstage

`קובץ` is not a tab. It opens a **full-window page** over the editor, in interface
direction: a coloured column of sections on the start side and the section's page
beside it, exactly Word's shape.

| section | contents |
|---|---|
| **חדש** New | new document, duplicate, then the templates |
| **פתיחה** Open | open a file, import, the open documents and the library |
| **שמירה** Save | save, save as, rename |
| **שיתוף** Share | the share and send rows |
| **ייצוא** Export | each format, with the pages box for PDF |
| **הדפסה** Print | print, with the pages box |
| **גרסאות** Versions | snapshots and git history |
| **הגדרות** Settings | opens the settings drawer, over the document |
| **אודות** About | version, licences, where to report a problem |

`←` at the top of the column, or Esc, returns to the document with the caret where
it was. Up and Down walk the column, and Home and End jump to its ends. Settings and
About sit at the foot of the column, as Word's Options and Account do. A row that
acts closes the page before it acts, so a dialog it opens is on top. Rows that edit
the page in place stay on the page: deleting a template, closing an open document,
and the pages box. Below 640px the column keeps its icons and drops its words.

The sections are `placement.backstageTree`. It is built from the `file` and `docs`
menu groups (`BACKSTAGE_OF_GROUP`), a few rows moved by id (`BACKSTAGE_OF_ACTION`),
and the template, pages and library extras. A command added to File therefore
appears in the backstage without a line of layout. `placement.test` fails if a File
or Documents group is in no section. The one group left out is `docTabs`
(`NOT_IN_BACKSTAGE`): moving between open tabs is not a page, and it stays in `☰`.
The backstage is a registered modal panel (`PANELS`, z 48). Its `←` is
`panelHead`'s exit, so the exit and Escape fences hold it like every other panel.

## 7 · Small screens and half screens

The target is **1366×768**, and ksav must look right in **half of that screen**
(about 680px wide).

| width | the ribbon |
|---|---|
| ≥ 1100px | every group at its full shape |
| 640–1100px | groups shrink one step at a time, in priority order, until the row fits |
| < 640px | **simplified ribbon**: one 36px row of icon buttons for the open tab, then `⋯` for the rest |

The widths are the ribbon panel's, not the window's: half a screen with the
panes beside it is what the ribbon actually has.

**Shrinking** is planned by pure functions in `shrink.ts` (`shrinkSteps`,
`shrinkPlan`). Each group has four levels: **0** full · **1** every large face
becomes small · **2** every face with an icon is the icon alone · **3** the whole
group is one dropdown button with its icon and name. The groups that hold **B/I/U,
the footnote, siman and seif shrink last**; the rest go the row's end first, every
one through level 1 before any reaches level 2, and a level that would change
nothing in a group is not a step for it. The DOM loop applies one step at a time
while the panel overflows. A `ResizeObserver` starts it a frame later, and only for
a new width: refitting inside the observer's callback is a resize loop, which
Chromium reports as an error.

The **simplified ribbon** starts every group at level 2 and never folds one: a
folded group is its name in words, wider than its icons. What does not fit goes
into a `⋯` at the row's end, in the same order.

The ribbon **never wraps** and its height is fixed (92px, or 36px simplified);
`shrink.test` asserts both in the built application at 1366, 1100, 800, 680 and
500px.

## 8 · Behaviour

- **Contextual tabs appear and never switch.** When the caret enters a table, the
  `טבלה` tab appears at the end of the tab row in the contextual colour
  (`--contextual`, not the accent, which is hover and focus); when it leaves, the
  tab goes, and if the writer had opened it the ribbon returns to the tab that was
  open before it. The Notes tab takes the contextual colour while the caret is in
  a note, and stays open if opened. Nothing changes the open tab except the writer;
  ←/→ and Home/End walk only the tabs on the row.
- **Key tips.** Alt pressed and released alone, or F10, shows a letter on every tab;
  a letter opens that tab and shows letters on its buttons; Esc steps back. Letters
  are in the interface language and are **generated** from the placement data
  (`keyTips(labels)`: first letter of the label, then the next free letter in it,
  then any free letter). They are matched by **physical key** (`event.code`), so a
  Hebrew tip works with an English layout active and vice versa. The Hebrew letters
  use the SI-1452 positions; final letters are never assigned.
- **Unavailable buttons** are greyed, never struck through, with a tooltip that says
  why (`whyNot()`: "the engine is still loading", "the registry did not load", "not
  in a table").
- **Pressed state.** B/I/U, alignment and every toggle carry `aria-pressed` from the
  caret's context. The font and size boxes show the caret's values. (Both become
  exact when #118's WYSIWYG lands; until then they read the markup around the
  caret.)
- **The keyboard map is the same in every state.** A chord belongs to the action.
- Changing `lang`, the ribbon layout or `collapsed` re-renders the shell from
  `placed()`; the caret and the scroll stay put.

## 9 · Settings and customizing

```ts
shell: {
  collapsed: boolean;      // ribbon folded to tab names
  quick: string[];         // Quick Access additions, after save/undo/redo
  ribbon?: RibbonLayout;   // absent = the default ribbon of §5
}
```

### The customize dialog

**תצוגה ▸ התאמת הסרגל** (and כלים ▸ התאמת הסרגל…, and right-click on the tab row).
Everything applies live behind it.

```
┌ התאמת הסרגל ─────────────────────────────────────────────────────────┐
│ הסרגל שלי                         │ כל הפקודות                        │
│ ▾ בית                     👁 ✎ 🗑 │ [ חיפוש…               ] [הכול ▾] │
│    ▾ גופן                         │  הדגשה        עיצוב · בית         │
│       ● הדגשה                     │  מראה מקום    מקורות · מקורות     │
│       ○ קו חוצה   (מאחורי ⋯)      │  הערת עורך    סקירה · סקירה       │
│ ▸ הלשונית שלי             👁 ✎ 🗑 │        [ ← הוסף ]                 │
│ [+ לשונית] [+ קבוצה] [מזג לשוניות] │                                   │
├────────────────────────────────────┴──────────────────────────────────┤
│ [איפוס הלשונית] [איפוס הכול]  [ייבוא…] [ייצוא…]            [סגירה]    │
└───────────────────────────────────────────────────────────────────────┘
```

- **Tabs:** add, rename, hide, delete, reorder, merge.
- **Groups:** add, rename, delete, reorder, move to another tab.
- **Commands:** add any command to any group, more than once if wanted; remove;
  reorder; toggle on the ribbon (●) / behind ⋯ (○).
- **Reset** one tab or everything. **Import / export** as a file.
- **The menus are not editable**, and the dialog says so in one line. That is why
  the ribbon can be this free: no layout can make a command unfindable.

The quick path is right-click on a button (*behind ⋯ / remove / add to Home / add to
Quick Access / customize…*) and on a tab (*rename / hide / customize…*). Keyboard:
the tree is an ARIA `tree`; Alt+↑/↓ reorders, Space toggles ●/○, Delete removes, F2
renames. Drag and drop works too and is never the only way.

### The data

```ts
interface RibbonLayout {
  version: 1;
  tabs: {
    id: string;                 // built-in TabId, or "user:<uuid>"
    from?: TabId[];             // built-in tabs this one is, or merges
    name?: string;
    hidden?: boolean;
    groups: { id: string; name?: string; items: { action: string; face: boolean }[] }[];
  }[];
  known: string[];              // every action id that existed when it was saved
}
```

- The first edit copies the default into `ribbon`; reset deletes it.
- Commands not in `known` are added to their default group in whichever saved tab
  lists the default tab in `from`, or behind the ⋯ of a kept tab; never dropped.
- Commands that no longer exist are dropped on load, silently; loading never throws.
- An import is validated first: unknown actions are dropped and counted, never run.

## 10 · Icons

**Tabler Icons** (MIT), outline style, 24-unit grid with a 2-unit stroke, drawn at
16 or 32px with `stroke: currentColor` so they follow the theme. Only the icons
used are copied, by `tools/icons.mjs`, from the `@tabler/icons` devDependency into
`src/icons.gen.ts`, with the licence at its head; the app never loads an icon font.

Torah terms that Tabler does not have (סימן, סעיף, מראה מקום, דיבור המתחיל, הערה
בדרגה, גמרא, פסוק) get **custom icons** in `src/icons-ksav.ts`, drawn on the same
grid and stroke, so they cannot be told apart from Tabler's by weight.

## 11 · The fences

| fence | what goes red if it is reverted |
|---|---|
| `Place.menu` is required (type) | an action reachable only from a tab or a chord |
| `RibbonLayout` cannot name a menu (type) | a customisation that hides a command |
| every built-in and generated action has a place; deprecated ones have none | an orphan, or a deprecated command advertised |
| no `*_config` command is a default face | a ribbon full of "how X is set" |
| every face has an icon or a label; every large face has an icon; ≤ 2 large and ≤ 6 faces per group | a blank button, a wall |
| every placed action, group, menu, tab, section and short label has Hebrew **and** English | an id drawn in one language |
| the ribbon never wraps and keeps its height at 1366, 1100, 800, 680, 500px | the ribbon growing a second row |
| `shrinkPlan` shrinks B/I/U, footnote, siman, seif last | the most used buttons hidden first |
| key tips are unique per level, never final letters, matched by `event.code` | two buttons on one key; a tip that only works in one layout |
| a contextual tab never changes the open tab | the ribbon jumping under the writer |
| a ribbon with every tab deleted still leaves a working `☰` | customising your way out of the app |
| a saved ribbon survives a version that adds and one that removes actions | a lost layout, an invisible new command |
| export → import round-trips; unknown ids load and are reported | a shared layout that breaks another install |
| every `shell` setting persists and restores the same DOM | the setting drawn but not stored (`2026-08-12`) |
| a chord works with the ribbon collapsed, customised or simplified | the furniture changing what the keyboard does |
| Esc closes the backstage and returns the caret | the document lost behind a page |

## 12 · Order of work

All of it lands on `shell-office`, in this order; each step leaves the full gate
(`node tools/gate.mjs`) green.

1. **One shell.** The menus and toolbar variants, their settings, actions, drawer
   rows and tests are deleted. `shell` becomes `{collapsed, quick, ribbon?}`.
2. **The new taxonomy.** `review` menu and tab; Table contextual only; insert table
   on Insert; `Place.icon` and `Place.size`; the §5 tables.
3. **Icons.** `tools/icons.mjs`, `icons.gen.ts`, `icons-ksav.ts`, the three sizes.
4. **The window.** Title row with Quick Access and ⓘ ⚙; tab row with `☰` and `⌃`;
   status-bar controls; the chip row deleted and its actions placed.
5. **The backstage.**
6. **Contextual tabs** that never switch.
7. **Shrinking** and the simplified ribbon; collapse with Ctrl+F1.
8. **Key tips.**
9. **The Font group**: font and size boxes, colour split buttons, pressed state;
   greyed unavailable buttons.
10. **The acceptance run, `tools/surfaces.mjs`, and screenshots** with the real
    wasm engine at 1366×768 and 680×768, in both languages.

## 13 · What this does not decide

**#117** proposes a native Rust `egui` frontend. Whatever is chosen, §2–§5 and §9's
data are statements about *ksav* and a different frontend inherits this page.

**#118** makes a WYSIWYG surface with boxes for footnotes the default. It changes
nothing here except that §8's pressed state and font boxes become exact.

Out of scope: the panes' contents, and customizing the **menus** (deliberately never).

# The shell is an Office ribbon

Supersedes the default and the variants in
[`the-shell-is-built-from-placements`](2026-11-23-the-shell-is-built-from-placements.md),
which stays true in its core: placement is data, every action has a menu home, the
ribbon is fully customizable and the menus are not. The spec is
[`docs/ui-architecture.md`](../docs/ui-architecture.md).

The owner audited the shell plan one question at a time and decided:

## Decided

- **The look is Word 365**, plus LibreOffice's `☰` with the full menus at the end of
  the tab row.
- **One shell, the ribbon.** The menus and toolbar variants are deleted, with their
  settings. Ctrl+F1 or a double-click on a tab collapses the ribbon to tab names.
- **Icons:** an MIT icon set (Tabler) plus custom icons for Torah terms, in three
  button sizes: large, small, and icon only.
- **The chip row is removed.** Its contents go to a Quick Access bar (save, undo,
  redo, the writer's own), the status bar (things that show state), ribbon buttons
  (everything else), and ⓘ ⚙ at the end of the title row.
- **File is a full-window backstage**: New, Open, Save as, Export, Print, Versions,
  Settings, About; Esc returns.
- **Contextual tabs appear, coloured, and never switch the open tab.**
- **Tabs:** קובץ · בית · הוספה · פריסה · הערות · מקורות · סקירה · תצוגה; טבלה is
  contextual only and *insert table* is on הוספה. סקירה holds spelling, editor's
  comments, insert/delete marks and versions.
- **Alt key tips**, in the interface language, matched by physical key so any
  keyboard layout works, generated from the placement data.
- **Size:** built for 1366×768 and for half of it. The ribbon shrinks group by group
  in priority order and becomes a one-row simplified ribbon below 640px; it never
  wraps and never changes height.
- **WYSIWYG (#118) is a later wave**; when it lands it fills in the pressed state and
  the font boxes, and changes nothing else here.

## Why

In the owner's words: "we have no legacy users and no legacy codebase. we are not
timid and we make the best product, unburdened by what has been". A writer arrives
knowing Word; three shells and a row of twenty-two unnamed glyphs asked them to
learn ksav's furniture before they could write. One ribbon they already know, with
the menus always one click away, asks nothing.

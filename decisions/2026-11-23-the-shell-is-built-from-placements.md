# The shell is built from placements

The owner decided on the shell proposal in
[`docs/ui-architecture.md`](../docs/ui-architecture.md), which is now its spec.

## Decided

- **Placement is data.** Every action carries a `Place` (`menu` required, `tab`
  optional), and menus, tabs, Home, the toolbar and the contextual tabs are all
  rendered from one list, `placed()`. Nothing in the shell is laid out by hand.
- **Default variant: menus + toolbar.** Tabs are opt-in.
- **In the tabs variant the menu bar folds into `☰ תפריט`**, a labelled button that
  is always visible, as LibreOffice's Tabbed interface does. A setting brings the
  full menu bar back.
- **Notes get their own menu and tab, `הערות`**, separate from `מקורות`. Review
  marks go with notes.
- **Everything ships in one wave**, built in the order of the spec's §11.
- **Every word the shell draws exists in Hebrew and English** and follows the
  interface language.
- **Settings change the UI:** variant, menu bar, the toolbar's row, labels,
  contextual tabs, and the writer's own ribbon.
- **The ribbon is fully customizable** in one dialog (Tools ▸ Customize the
  ribbon…): add, rename, hide, delete, reorder and merge tabs; add, move and
  reorder groups; put any command into any group, more than once if wanted; choose
  per command whether it sits on the ribbon or behind `⋯`; reset; import/export.
  Right-click gives the quick path. **The menus are not customizable**, and that
  is why the ribbon can be: no layout can make a command unfindable.
- **Names follow Hebrew Word / LibreOffice**, with Torah terms a yeshiva bochur
  already uses (מראי מקומות, מפתחות, דיבור המתחיל). The owner left the names and
  the default face sets to the spec (§5).

## Why

The five surfaces had no statement of which holds what, and every menu was
hand-written. Making placement data means the "no command without a menu home"
rule is a property of the type rather than a test, and every later surface,
including a writer's own customisation, is a rendering of the same table.

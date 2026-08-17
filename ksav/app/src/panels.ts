// Every surface that opens over the document — declared once, and opened,
// closed and built through that declaration.
//
// # Why this file exists
//
// `main.ts` grew the same three lines seventeen times: fetch an element by id,
// put the class `open` on it, and somewhere else take it off again. Around that
// triple each surface hand-wrote its own × button, its own backdrop click, and
// its own entry in a list of close calls in the global Escape handler. Nothing
// tied the four together, so each could be right on its own and wrong together,
// and each of those failures has actually shipped here:
//
//   - The settings drawer had an opener and no closer. Below 720px a drawer is
//     the full viewport, so the ⚙ chip that opened it was *underneath it* and
//     there was no way out of Settings on a phone at all.
//   - The welcome overlay had no ×, ignored Escape, and its only exits replaced
//     whatever was in the buffer.
//   - The hydra — a panel that takes over the keyboard — was never added to the
//     Escape list. It answers Escape only through a CodeMirror keymap, so it
//     answers only while the editor has focus; click one of its own buttons and
//     Escape stopped reaching it. A thirteenth panel silently not getting
//     Escape is precisely what a hand-written list of twelve close calls costs.
//
// The guard test written against all this read `main.ts` as *text*, and text is
// the wrong thing to read: it credited the welcome overlay with the command
// palette's opener because both had bound a local called `overlay`, and it
// looked for the Escape wiring inside a window bounded by the first `Escape` in
// the file and the first `Alt` — 70% of `main.ts`, wide enough that the five
// names it wanted matched their own *function definitions*. The whole global
// Escape handler could be deleted and the guard stayed green. (Verified: it
// does. One comment in the right region bought back the sixth assertion.)
//
// So this module is not a tidier `main.ts`. It is the difference between a
// property being asserted about a string and a property being true by
// construction:
//
//   - `openPanel` / `closePanel` / `togglePanel` are the only code in `src/`
//     that spells the `open` class. A surface that wants to appear has to be in
//     `PANELS` to do it.
//   - `panelHead` is the only code that builds a `×`, and it wires that × to
//     `closePanel(id)` for the id it was given — a close button for the wrong
//     panel is not expressible.
//   - `overlayPanel` is the only code that builds a backdrop, and it wires the
//     backdrop to the same id.
//   - `closeOnEscape` derives the Escape sweep *from* `PANELS`, so a new modal
//     answers Escape by existing rather than by being remembered.
//
// `chrome.test.mjs` then sweeps `src/` for anyone spelling those things
// themselves, and `panels.test.mjs` builds every declared surface against a
// DOM and clicks its way out of each one.
//
// # What is deliberately *not* here
//
// The contents. A settings drawer is two hundred lines of fields about this
// application and belongs with the application; what it shares with the command
// palette is the frame, the way out, and the fact that Escape closes both. Only
// the frame moved.

import { el } from "./dom";
import { hasKey, t } from "./i18n";

// ---------------------------------------------------------------- the shapes

/**
 * How a surface relates to the document underneath it. This is not decoration:
 * it decides whether the surface *must* answer Escape.
 *
 *   modal   — covers the document and takes the keyboard. Escape, always.
 *   drawer  — slides in beside the document. Escape only if it is transient;
 *             the outline and notes panes are a persisted layout choice, and
 *             Escape throwing that away would be its own bug.
 *   strip   — an inline band that covers nothing.
 *   popup   — anchored at the pointer, dismissed by clicking anywhere else.
 */
export type PanelKind = "modal" | "drawer" | "strip" | "popup";

/**
 * The writer's way out, from *inside* the surface.
 *
 * A toggle chip in the header is not one: at phone widths the surface is the
 * whole viewport and the chip is behind it. Each variant is a claim with
 * evidence attached, and the evidence is what the tests check — a prose reason
 * is what the welcome overlay had.
 */
export type Exit =
  /** A `×` in the panel head. `panelHead` is the only thing that builds one. */
  | { via: "head" }
  /** Clicking the backdrop. `overlayPanel` is the only thing that wires one. */
  | { via: "scrim" }
  /** Clicking anywhere outside it. `closeOnOutsideClick` does this for all of them. */
  | { via: "outside" }
  /**
   * An inline strip that covers nothing, so the control that opened it is still
   * reachable at every width. The CSS rule for `selector` is the evidence, and
   * it has to keep saying so.
   */
  | { via: "toggle"; selector: string }
  /** It follows the caret and empties itself when the caret leaves. */
  | { via: "caret" };

export interface Panel {
  readonly id: string;
  readonly kind: PanelKind;
  /**
   * `class`   — the element is always in the document; `open` shows it.
   * `mounted` — it is built when shown and removed when dismissed.
   */
  readonly presence: "class" | "mounted";
  /** Does the global Escape sweep close it. */
  readonly escape: boolean;
  /**
   * Its visibility *is* a saved preference, so it is still there next launch.
   *
   * The only argument for declining Escape that does not amount to "nobody
   * remembered". Escape is pressed constantly; a surface that answers it has to
   * be one the writer can put back in a gesture, and a layout choice thrown away
   * by a keystroke is a bug of its own. `panels.test.mjs` will not let any other
   * kind of surface set `escape: false`, which is what would have caught the
   * hydra — a panel that owns the keyboard and was simply left off the list.
   */
  readonly persisted?: boolean;
  /** At least one, and every one of them is checked. */
  readonly exits: readonly Exit[];
  /**
   * For surfaces with no id of their own — the pointer-anchored menus, of
   * which there can be several on screen at once. `id` is still their name
   * here, because a thing that can be opened and closed needs one.
   */
  readonly selector?: string;
}

// ---------------------------------------------------------------- the registry

/**
 * Every surface in the application that opens over or beside the document.
 *
 * Two entries that used to be in the guard test's list are *not* here, and
 * their absence is the point. `palette-list` and `welcome` were both detected
 * by a regex that tested a local variable's name against the whole file: three
 * different surfaces had bound a local called `overlay`, and the palette's
 * inner list and a header dropdown had both bound one called `list`. Neither
 * `palette-list` nor `welcome` ever touches the `open` class — `palette-list`
 * is a plain div, and `welcome` is born with `class="overlay open"` and dies by
 * `.remove()`. One of them was carrying an *exemption*, with evidence, from a
 * check it never needed. `welcome` is here on its own terms, as a mounted
 * surface; `palette-list` is not a surface at all.
 */
export const PANELS: readonly Panel[] = [
  // ---- drawers ----
  {
    id: "settings-drawer",
    kind: "drawer",
    presence: "class",
    // Transient, unlike the other two drawers: nothing about the application
    // depends on it still being there, and it is the one that shipped with no
    // way out.
    escape: true,
    exits: [{ via: "head" }],
  },
  {
    id: "outline-drawer",
    kind: "drawer",
    presence: "class",
    // A persisted layout choice (`settings.outline`). Escape must not discard it.
    escape: false,
    persisted: true,
    exits: [{ via: "head" }],
  },
  {
    id: "notes-drawer",
    kind: "drawer",
    presence: "class",
    // Persisted, as above (`settings.notesPane`).
    escape: false,
    persisted: true,
    exits: [{ via: "head" }],
  },
  {
    id: "marks-drawer",
    kind: "drawer",
    presence: "class",
    // The third list, and persisted like the other two (`settings.marksPane`).
    escape: false,
    persisted: true,
    exits: [{ via: "head" }],
  },
  // Every command the writer can type, grouped and searchable.
  //
  // A drawer rather than a modal, so that running a command does not close the
  // list you are working through — the palette is the modal, and it answers a
  // different question (see `panelrows.commandGroups`). Not persisted, and this
  // is the line it falls on: the outline, the notes and the marks are *views of
  // the document* and a writer keeps one open beside the text, while this is a
  // reference surface like the help page, which is the panel it sits next to
  // here for exactly that reason.
  {
    id: "commands-drawer",
    kind: "drawer",
    presence: "class",
    escape: true,
    exits: [{ via: "head" }],
  },
  { id: "help-panel", kind: "drawer", presence: "class", escape: true, exits: [{ via: "head" }] },
  // Every rebindable action and the chord it holds. A reference surface, beside
  // the command list and the help page for the same reason they are here: it is
  // consulted while working, not while setting the application up, which is
  // where sixty rows of it used to live — below the paper size, the margins and
  // the asset list, in one drawer with two subjects.
  { id: "keys-drawer", kind: "drawer", presence: "class", escape: true, exits: [{ via: "head" }] },
  { id: "styles-panel", kind: "drawer", presence: "class", escape: true, exits: [{ via: "head" }] },
  { id: "review-panel", kind: "drawer", presence: "class", escape: true, exits: [{ via: "head" }] },
  // Version control. A drawer and not a modal, for the review panel's reason:
  // deciding what to commit means reading the document while you decide, and a
  // window over it would be a window over the thing being described.
  //
  // Not persisted. It is a reference surface like the help page rather than a
  // view of the document like the outline — and, unlike those three, what it
  // shows costs a subprocess to find out, so leaving it open across launches
  // would mean starting a `git status` before the writer has asked for one.
  { id: "git-panel", kind: "drawer", presence: "class", escape: true, exits: [{ via: "head" }] },

  // ---- modals ----
  {
    id: "form-modal",
    kind: "modal",
    presence: "class",
    escape: true,
    exits: [{ via: "head" }, { via: "scrim" }],
  },
  { id: "palette", kind: "modal", presence: "class", escape: true, exits: [{ via: "scrim" }] },
  // The open documents, most recently used first. Declared like every other
  // surface, which is what gets it an Escape and a dismissing backdrop without
  // anybody remembering to add one.
  { id: "switcher", kind: "modal", presence: "class", escape: true, exits: [{ via: "scrim" }] },
  // The arrangements this application ships, as a picker. Replaces two chips
  // that cycled; see the comment on the chip in .
  { id: "arrangement", kind: "modal", presence: "class", escape: true, exits: [{ via: "scrim" }] },
  {
    id: "notes-chooser",
    kind: "modal",
    presence: "class",
    escape: true,
    exits: [{ via: "head" }, { via: "scrim" }],
  },
  { id: "preview-modal", kind: "modal", presence: "class", escape: true, exits: [{ via: "scrim" }] },
  { id: "history-modal", kind: "modal", presence: "class", escape: true, exits: [{ via: "scrim" }] },
  {
    id: "welcome",
    kind: "modal",
    presence: "mounted",
    escape: true,
    exits: [{ via: "head" }, { via: "scrim" }],
  },

  // ---- strips ----
  {
    id: "hydra",
    kind: "strip",
    presence: "class",
    // It owns the keyboard, so it needs Escape more than anything else here —
    // and it is the one surface the hand-written list forgot.
    escape: true,
    exits: [{ via: "head" }],
  },
  {
    id: "nikud-bar",
    kind: "strip",
    presence: "class",
    escape: false,
    // `settings.nikud`: the bar is on until the writer turns it off.
    persisted: true,
    exits: [{ via: "toggle", selector: ".nikud-bar" }],
  },
  {
    id: "context-bar",
    kind: "strip",
    presence: "class",
    escape: false,
    // The contextual ribbon: it appears and disappears with the caret, covers
    // nothing and captures no keys. Closing it means moving the caret out of
    // the table, which is a thing a writer does by writing.
    exits: [{ via: "caret" }, { via: "toggle", selector: ".context-bar" }],
  },

  // ---- pointer-anchored menus ----
  //
  // No id of their own, and the spell menu can be one of several. They are here
  // because Escape has to reach them, and a sweep that is derived from this list
  // for twelve surfaces and hand-written for two is still a hand-written list.
  {
    id: "spell-menu",
    kind: "popup",
    presence: "mounted",
    escape: true,
    exits: [{ via: "outside" }],
    // The citation list below borrows `.spell-menu` for its styling, so this
    // one has to say it means the other kind.
    selector: ".spell-menu:not(.mekoros)",
  },
  {
    id: "mekoros",
    kind: "popup",
    presence: "mounted",
    escape: true,
    exits: [{ via: "outside" }],
    selector: ".mekoros",
  },
  {
    // A pane's own ⋯ menu: swap with a numbered pane, move it to an edge, move
    // it to another tab, keep this arrangement. Anchored under the button that
    // opened it, so it is a popup and not a drawer — it is read and dismissed in
    // one gesture, and it describes *this* pane, which the writer is looking at.
    id: "pane-menu",
    kind: "popup",
    presence: "mounted",
    escape: true,
    exits: [{ via: "outside" }],
    selector: ".pane-menu",
  },
  {
    // Every citation in the document, as the library has it now — spec.md
    // §10.2's promise about a *document* rather than about a place.
    //
    // A dialog and not a popup: it is a list of forty rows the writer reads and
    // decides about, one at a time, and it must survive them clicking into the
    // document to look at where a citation sits. Escape closes it, because
    // nothing about the application depends on it still being there.
    //
    // The service behind it — `POST /refresh` — was named in Girsa's own
    // `post.rs` as *"the clearest of them"*, the errand the loopback earns
    // itself on, and in this README as *"the errand that pays for the
    // loopback"*. It had a generated client, a generated table row, and **no
    // caller in `src/`**: the service that justifies the process boundary had
    // no UI at all.
    id: "refresh-panel",
    kind: "modal",
    presence: "class",
    escape: true,
    exits: [{ via: "head" }, { via: "scrim" }],
  },
] as const;

const BY_ID = new Map(PANELS.map((p) => [p.id, p]));

/** The panel with this id, or a thrown error naming it. */
export function panelOf(id: string): Panel {
  const p = BY_ID.get(id);
  if (!p) throw new Error(`panels: no surface named "${id}"`);
  return p;
}

/** Does this panel offer this kind of way out? */
export function hasExit(p: Panel, via: Exit["via"]): boolean {
  return p.exits.some((e) => e.via === via);
}

// ---------------------------------------------------------------- side effects

/**
 * What opening and closing a surface does beyond showing and hiding it.
 *
 * Splitting the Escape sweep off the named close functions is only safe if the
 * sweep still does everything they did. `closeModal` forgets a pending callback,
 * `closeHydra` drops the operation set it was driving, `closePalette` hands
 * focus back to the editor — a sweep that only stripped a class would leave the
 * application holding all three. So the registry owns the side effects too, and
 * there is one way to close a panel rather than two that must agree.
 */
export interface PanelHooks {
  /** Fill it. Runs *after* it is shown, so a control inside it can take focus. */
  open?: () => void;
  /** Put back whatever opening took. Runs only if it was actually open. */
  close?: () => void;
}

const HOOKS = new Map<string, PanelHooks>();

/** Attach the side effects for one surface. Throws on a name that is not one. */
export function wirePanel(id: string, hooks: PanelHooks): void {
  panelOf(id);
  HOOKS.set(id, hooks);
}

/** Forget every registered hook. For tests, which build the chrome repeatedly. */
export function resetPanels(): void {
  HOOKS.clear();
}

// ---------------------------------------------------------------- open / close

function nodesOf(p: Panel): HTMLElement[] {
  if (p.selector) return [...document.querySelectorAll<HTMLElement>(p.selector)];
  const n = document.getElementById(p.id);
  return n ? [n] : [];
}

/** Is it on screen? For a mounted surface, existing *is* being open. */
export function isPanelOpen(id: string): boolean {
  const p = panelOf(id);
  const nodes = nodesOf(p);
  if (p.presence === "mounted") return nodes.length > 0;
  return nodes.some((n) => n.classList.contains("open"));
}

/**
 * Show it.
 *
 * The class goes on before the hook runs, and that order is load-bearing: every
 * one of these surfaces is `display: none` until it is open, and `focus()` on a
 * hidden input does nothing — which is how a command palette comes up with the
 * caret somewhere else.
 */
export function openPanel(id: string): void {
  const p = panelOf(id);
  if (p.presence === "mounted") {
    throw new Error(`panels: "${id}" is built when shown — use mountPanel`);
  }
  for (const n of nodesOf(p)) n.classList.add("open");
  HOOKS.get(id)?.open?.();
}

/**
 * Hide it — and do nothing at all if it was not showing.
 *
 * The guard is what makes a derived Escape sweep honest. Escape is pressed
 * constantly and the sweep touches every transient surface, so a close that
 * ran its side effects unconditionally would mark a reader onboarded, or steal
 * focus back to the editor, every time they pressed it to cancel a completion.
 * `dismissOnboard` used to carry that check by hand, with the reasoning in a
 * comment; now no panel needs to.
 */
export function closePanel(id: string): void {
  const p = panelOf(id);
  if (!isPanelOpen(id)) return;
  for (const n of nodesOf(p)) {
    if (p.presence === "mounted") n.remove();
    else n.classList.remove("open");
  }
  HOOKS.get(id)?.close?.();
}

/**
 * Show or hide it, or flip it when `on` is **left out**.
 *
 * Left out, not `undefined` — and the rest parameter is what makes those two
 * different things, because as `on?: boolean` with `on ?? !isPanelOpen(id)` they
 * were the same thing and it cost the writer 45 pixels of every window.
 *
 * `settings.nikud` is an optional boolean: absent means the writer has never
 * asked for the vowel bar, which is nearly all of them. `togglePanel("nikud-bar",
 * settings.nikud)` therefore passed `undefined`, `??` read that as *no argument
 * given*, and startup **flipped the bar on** — a full-width row of fourteen
 * buttons, on screen for everyone who had never wanted it, with the chip in the
 * header correctly reporting it as off. The same call shape was on the outline
 * drawer, so a first run opened that too.
 *
 * A caller that means "flip" passes nothing; a caller holding a value passes the
 * value, and an unset optional is now `false`, which is what an unset preference
 * has always meant everywhere else in this file.
 */
export function togglePanel(id: string, ...on: [boolean?]): boolean {
  const next = on.length ? !!on[0] : !isPanelOpen(id);
  if (next) openPanel(id);
  else closePanel(id);
  return next;
}

/**
 * Put a built surface on screen.
 *
 * The mounted ones are constructed at the moment they are shown, because what
 * they contain depends on where the pointer was or what the writer has already
 * done. Opening one closes any other of its kind first: two pointer-anchored
 * menus on screen at once is never what was meant, and the spell menu and the
 * citation list used to enforce that on each other by sharing a CSS class.
 */
export function mountPanel(id: string, node: HTMLElement, host: HTMLElement): void {
  const p = panelOf(id);
  if (p.presence !== "mounted") {
    throw new Error(`panels: "${id}" is always in the document — use openPanel`);
  }
  closePanel(id);
  if (p.kind === "popup") for (const other of PANELS) if (other.kind === "popup") closePanel(other.id);
  node.classList.add("open");
  host.append(node);
  HOOKS.get(id)?.open?.();
}

// ---------------------------------------------------------------- the sweeps

/**
 * Escape: close everything that says Escape closes it.
 *
 * This is the sentence the old guard test wrote in English in a comment while
 * asserting something else entirely. Returns what it closed, so the caller can
 * tell "nothing was open" from "the palette went away" — which is the
 * difference between Escape being free to mean something else and Escape having
 * already meant this.
 */
export function closeOnEscape(): string[] {
  const closed: string[] = [];
  for (const p of PANELS) {
    if (!p.escape || !isPanelOpen(p.id)) continue;
    closePanel(p.id);
    closed.push(p.id);
  }
  // The header's dropdowns as well, and here rather than at the call site
  // because the call site may not have a list: `chrome.test.mjs` forbids any
  // second `close…()` in the Escape branch, on the grounds that a hand-written
  // list of closers is what left the hydra out of this in the first place. It
  // is right, so the sweep grows instead.
  //
  // The dropdowns are deliberately not in `PANELS` — see `closeMenus` below —
  // and the argument for leaving them out of *this* was that "a click anywhere
  // closes them". True of a mouse, and only of a mouse: a menu opened from the
  // keyboard stayed open, on the one key every other surface in the
  // application answers to. They are not named in the return value because
  // they have no ids to name.
  closeMenus();
  return closed;
}

/** A click that landed outside a pointer-anchored menu dismisses it. */
export function closeOnOutsideClick(target: Element | null): void {
  for (const p of PANELS) {
    if (!hasExit(p, "outside") || !isPanelOpen(p.id)) continue;
    if (p.selector && target?.closest(p.selector)) continue;
    closePanel(p.id);
  }
}

/**
 * The header's dropdown menus.
 *
 * Not in `PANELS`: there is one per menu button, they are built with the header
 * rather than fetched by id, and none of them can trap anybody — a click
 * anywhere closes them. They are here because they are the *other* users of the
 * `open` class, and leaving them outside would mean the prohibition in
 * `chrome.test.mjs` had to carry an exemption, which is how this whole family
 * of bugs got in.
 */
export function closeMenus(): void {
  document.querySelectorAll(".menu-list.open").forEach((m) => {
    m.classList.remove("open");
    m.previousElementSibling?.setAttribute("aria-expanded", "false");
  });
}

/**
 * Open one dropdown, closing every other. Returns whether it ended up open.
 *
 * `fill` runs only on the way open, which is what keeps a menu built at boot
 * from freezing what the data looked like then — the document library said
 * "Untitled" long after the document had been titled. It is a parameter rather
 * than the caller's business because deciding to fill means reading the `open`
 * class, and reading it outside this module is what the surface prohibition
 * forbids.
 */
export function toggleMenu(list: HTMLElement, btn: HTMLElement, fill?: () => void): boolean {
  const wasOpen = list.classList.contains("open");
  closeMenus();
  if (!wasOpen) {
    fill?.();
    list.classList.add("open");
  }
  btn.setAttribute("aria-expanded", String(!wasOpen));
  return !wasOpen;
}

// ---------------------------------------------------------------- construction

/**
 * The head every panel wears: its name, and the `×` that closes *it*.
 *
 * The only place in `src/` that spells `styles-close`. Ten surfaces used to
 * build this by hand and pass their own close function to it, which is one
 * hand-written pairing per panel and therefore one chance each to pass the
 * wrong one. Here the id is the only argument and the closer is derived from
 * it, so a `×` wired to another panel's closer cannot be written down.
 *
 * The button carries an accessible name as well as a tooltip: `title` alone is
 * not a name, and a screen reader announced every one of these as "×, button" —
 * the same rule `iconBtn` states for the toolbar, applied to the control that
 * gets people out of things.
 *
 * # Why the title is a key and not a string
 *
 * Because these panels are built **once**, at boot, and switching the interface
 * language rebuilds the header and the settings drawer and nothing else. The
 * help panel was reported reading *מה אפשר לעשות* with the interface in
 * English — and `helpTitle` is in both dictionaries, so nothing was missing. It
 * was translated at boot, in Hebrew, and never asked again.
 *
 * Taking the key rather than the answer is what lets `localise` ask again. A
 * caller that passes `t("helpTitle")` gets a title that is right once; a caller
 * that passes `"helpTitle"` gets one that is right whenever anybody looks.
 */
export function panelHead(
  id: string,
  /** An i18n key. Pass `{ text }` for a title that is not one — a file's name. */
  title: string | { text: string },
  opts: { level?: "h2" | "h3"; cls?: string; extra?: Node[] } = {},
): HTMLElement {
  const p = panelOf(id);
  if (!hasExit(p, "head")) {
    throw new Error(`panels: "${id}" does not claim a head exit, so it must not build one`);
  }
  const keyed = typeof title === "string";
  if (keyed && !hasKey(title)) {
    // Almost always `t("someKey")` written where `"someKey"` belongs. `t` falls
    // back to returning what it was given, so the title looks right and never
    // changes language again — which is how the notes drawer came to be
    // reported as untitled by somebody reading the interface in English.
    throw new Error(`panels: "${title}" is not an i18n key — pass the key, or { text } for a name`);
  }
  return el("div", { class: opts.cls ?? "styles-head" }, [
    el(opts.level ?? "h2", keyed ? { "data-i18n": title } : {}, [
      keyed ? t(title) : title.text,
    ]),
    ...(opts.extra ?? []),
    el(
      "button",
      {
        class: "styles-close",
        type: "button",
        title: t("close"),
        "aria-label": t("close"),
        "data-i18n-title": "close",
        "data-i18n-label": "close",
        onClick: () => closePanel(id),
      },
      ["×"],
    ),
  ]);
}

/**
 * Say every marked label again, in whatever language is current now.
 *
 * The mechanism was already here — `rerenderChrome` has swept for `[data-i18n]`
 * for as long as anyone can remember — and **nothing in `src/` produced one**.
 * A sweep with no producers is a loop over an empty list, run on every language
 * change, reporting success. So the surfaces built once at boot kept the
 * language they were born in, and the writer met that as a Hebrew title over an
 * English panel with no way to explain it.
 *
 * Four attributes, because a label is not always text: a tooltip, an accessible
 * name and a placeholder are all read by somebody, and all three were as stuck
 * as the headings were.
 */
export function localise(root: ParentNode = document): void {
  const say = (sel: string, set: (e: HTMLElement, s: string) => void) => {
    root.querySelectorAll<HTMLElement>(`[${sel}]`).forEach((e) => {
      set(e, t(e.getAttribute(sel)!));
    });
  };
  say("data-i18n", (e, s) => (e.textContent = s));
  say("data-i18n-title", (e, s) => e.setAttribute("title", s));
  say("data-i18n-label", (e, s) => e.setAttribute("aria-label", s));
  say("data-i18n-placeholder", (e, s) => e.setAttribute("placeholder", s));
}

/**
 * A modal and the backdrop that dismisses it.
 *
 * The backdrop test is `target.id === id` rather than "not inside the box",
 * which is what makes a click on the panel's own contents fall through to the
 * contents. Written once here rather than five times with five ids in it.
 */
export function overlayPanel(
  id: string,
  boxClass: string,
  children: (Node | string)[],
): HTMLElement {
  const p = panelOf(id);
  if (!hasExit(p, "scrim")) {
    throw new Error(`panels: "${id}" does not claim a scrim exit, so it must not build one`);
  }
  return el(
    "div",
    {
      id,
      class: "overlay",
      onClick: (e: Event) => {
        if ((e.target as HTMLElement).id === id) closePanel(id);
      },
    },
    [el("div", { class: boxClass }, children)],
  );
}

// What a browser has to look at, and how each surface is put on the screen.
//
// # The finding
//
// Relayed from Girsa. Every guard in this repository reads *source*: the editor
// suite over bundled modules, the engine tests, a parse oracle, an insertion
// grid, a documentation sweep. Girsa's two worst bugs were a
// commentary block sitting at `opacity: 0` and a pane title measured at 0px,
// and neither is a fact about source — both files said exactly what they should
// say. A sweep of this repository would have missed the same pair for the same
// reason.
//
// The sharper half of the finding is that `.github/scripts/acceptance.mjs`
// **already drives a real Chrome** through eight steps of using the product,
// and every assertion in it was a count or a string: page counts, the `#status`
// class, console errors, the PDF's first bytes. There was a browser open on the
// real stylesheet and nothing ever asked it what was on the screen.
//
// This module is the list of what to ask about, and how to get each surface
// there. The measuring lives in `acceptance.mjs`, because it needs the page; the
// classification lives here, because `test/visibility.test.mjs` has to check it
// without a browser.
//
// # Derived, not written down
//
// The surfaces come from `src/panels.ts`'s `PANELS` — the registry that already
// owns the `open` class, the `×`, the backdrop and the Escape sweep. A list of
// panel ids copied into a test is a list that is right on the day it is written,
// and the whole family of bugs `panels.ts` exists to prevent is a hand-written
// list of twelve where there are thirteen surfaces.
//
// So the *list* is never written here: `planFor` takes `PANELS` and produces one
// entry per declared surface, in registry order. What is written here is only
// what the registry does not know — which gesture opens each surface.
//
// And there is deliberately **no default**. An unclassified panel throws with
// its own name in the message rather than falling back to the cheapest probe,
// because a fallback is the silent skip one level up: the weakest measurement,
// chosen by nobody, applied to whichever surface happened to be added last. A
// twenty-third panel is a sentence somebody has to write.
//
// # Why the gesture, and not the class
//
// The first version of this did add `open` to each panel and measure. It is the
// cheap answer, it is right for the surfaces built along with the chrome, and the
// first run said where it stops: five panels came back with **no `×` in them at
// all** — `styles-panel`, `review-panel`, `form-modal`, `notes-chooser`, `hydra`.
//
// Not a bug in any of the five. Every one of them builds its body — and with it
// the head that `panelHead` puts the `×` in — at the moment it is *filled*, and
// filling is what the `open` hook does. Bolting the class on from outside skips
// the hook, so what got measured was an empty shell of the right size, and the
// way out of it did not exist yet. A probe that reports on a surface the reader
// never sees is worth less than no probe, because it looks like the question
// was asked.
//
// So the gesture is the mechanism wherever there is one. `chip` clicks the
// control in the header that a reader clicks; `driven` runs the keystrokes; and
// `class` survives for the two surfaces with no opener this run can reach, where
// it is honest about measuring rather less and says so in its reason.
//
// The chip ids are `header.ts`'s `ChipId`, which the compiler already holds
// `main.ts`'s `CHIP_RUN` to. The pairing of chip to panel is the one genuinely
// hand-written thing in this file, and it is a claim with evidence attached
// rather than a note: a wrong pairing does not open the panel, and the sweep
// fails naming it.
//
// # Why an excuse is a declaration
//
// `unreachable` is allowed and is deliberately expensive: it needs a reason long
// enough to argue with, and `planFor` refuses a plan where excuses are half the
// registry. A sweep that can excuse its way down to nothing is the failure this
// whole item is about, one level up.

/** How a surface is put on the screen for measuring. */
export const HOW = {
  /** Click the header chip that opens it. `putAway` uses its declared exits. */
  chip: "chip",
  /** A recipe drives the application until it appears. */
  driven: "driven",
  /**
   * Add `open`, measure, take it off again.
   *
   * The registry's own mechanism, minus the hook — so it is the right answer
   * only for a surface built with the chrome. Read the note above before
   * choosing it for anything that has a way in of its own.
   */
  class: "class",
  /** Already on the screen when the application starts. */
  boot: "boot",
  /** Not reachable from this harness, and the reason is written down. */
  unreachable: "unreachable",
};

/** A reason has to be long enough to be a reason. `gate.mjs` uses the same bar. */
const REASON = 20;

/**
 * The surfaces whose way in the registry does not describe.
 *
 * Keyed by panel id. `drive` receives the acceptance script's page helper and
 * has to leave the surface on the screen; `undrive` puts the application back,
 * because the checks after it are not expecting a menu over the document.
 */
export const RECIPES = new Map([
  // ---- opened by a chip in the header ----
  //
  // Twelve of the twenty-two, and every one of them is one gesture from a
  // reader's hand. `acceptance.mjs` clicks the chip, measures what appears, and
  // clicks it again — which also exercises the toggle, because four of these
  // decline Escape on purpose and a chip that only opens is the settings-drawer
  // bug that started `panels.ts`.
  ["settings-drawer", { how: HOW.chip, chip: "settings" }],
  ["outline-drawer", { how: HOW.chip, chip: "outline" }],
  ["notes-drawer", { how: HOW.chip, chip: "notesPane" }],
  ["marks-drawer", { how: HOW.chip, chip: "marksPane" }],
  ["commands-drawer", { how: HOW.chip, chip: "commands" }],
  ["help-panel", { how: HOW.chip, chip: "help" }],
  ["styles-panel", { how: HOW.chip, chip: "styles" }],
  ["review-panel", { how: HOW.chip, chip: "review" }],
  ["git-panel", { how: HOW.chip, chip: "git" }],
  ["notes-chooser", { how: HOW.chip, chip: "notesChooser" }],
  ["arrangement", { how: HOW.chip, chip: "arrangement" }],
  ["history-modal", { how: HOW.chip, chip: "history" }],
  ["nikud-bar", { how: HOW.chip, chip: "nikud" }],

  // ---- opened by a keystroke or a menu ----
  [
    "palette",
    {
      how: HOW.driven,
      why: "No chip: it is a keystroke, and `bindings.ts` calls it `palette: \"Mod-k\"`.",
      drive: async (p) => {
        await p.press("Control+k");
        await p.waitFor("#palette.open", 10_000);
      },
    },
  ],
  [
    "keys-drawer",
    {
      how: HOW.driven,
      why:
        "No chip, deliberately: the chipbar is two dozen controls already and this " +
        "is a reference surface rather than a mode. " +
        '`bindings.ts` calls it `keysDrawer: "Shift-F1"`, beside the help panel\'s ' +
        "F1, and a drawer with a key is a drawer that appears in the generated " +
        "shortcut card and in F1 — which is the argument `gitPanel` makes for " +
        "having one at all.",
      drive: async (p) => {
        await p.press("Shift+F1");
        await p.waitFor("#keys-drawer.open", 10_000);
      },
    },
  ],
  [
    "switcher",
    {
      how: HOW.driven,
      why:
        "`bindings.ts`: `switcher: \"Mod-Alt-o\"` — and `openSwitcher` refuses with " +
        "onlyOneOpen below two documents, which is right and which this run had not " +
        "noticed, because a run that makes one sefer from one template has exactly " +
        "one, and the sefer it starts from is loaded into the buffer from a template " +
        "rather than opened, so it is not in the set either. Two documents are made " +
        "first, by `newDoc: \"Mod-Alt-n\"`, and the list has something to be a list of.",
      // Through the binding rather than through the command palette, and that is
      // the second version. The first ran `newDoc` twice from the palette and
      // failed on one run in four: Playwright will not click a row until its box
      // has been still for two frames, and the palette list is rebuilt whenever a
      // compile lands underneath it. The click never timed out on the *element*
      // being absent — it timed out on the element never holding still. A key
      // needs nothing to hold still.
      //
      // `settled` between them because making a document is asynchronous and ends
      // in a compile, so the compile is the signal that the first one finished.
      drive: async (p) => {
        await p.focus();
        await p.settled(() => p.press("Control+Alt+n"));
        await p.settled(() => p.press("Control+Alt+n"));
        await p.press("Control+Alt+o");
        await p.waitFor("#switcher.open", 10_000);
      },
    },
  ],
  [
    "hydra",
    {
      how: HOW.driven,
      why:
        "`bindings.ts`: `hydra: \"Mod-Alt-k\"` — and it opens on whatever the caret " +
        "is *in*, so pressing it on an ordinary paragraph writes hydraNothingHere to " +
        "the status line and nothing appears. The list is inserted first for that " +
        "reason: the ribbon leaves the caret inside the structure it made.",
      drive: async (p) => {
        await p.newLine();
        await p.click('.toolbar [data-command="רשימה"]');
        await p.press("Control+Alt+k");
        await p.waitFor("#hydra.open", 10_000);
      },
    },
  ],
  [
    "form-modal",
    {
      how: HOW.driven,
      why:
        "The dialog every command that needs an argument borrows. It has no opener " +
        "of its own — Insert → ∑ is the cheapest real one, and the glyph is the " +
        "selector because the label beside it is translated and the run is in Hebrew.",
      drive: async (p) => {
        await p.click('[data-menu="insert"] .menu-btn');
        await p.click('[data-menu="insert"] .menu-item:has-text("∑")');
        await p.waitFor("#form-modal.open", 10_000);
      },
    },
  ],
  [
    "spell-menu",
    {
      how: HOW.driven,
      why:
        "It exists only after the spell service has answered about a word that is " +
        "actually in the document, so a word no dictionary has is typed and the wait " +
        "is on the decoration rather than on a delay. The route is the key rather " +
        "than the right-click — `bindings.ts`: `spellSuggest: \"Mod-.\"` — because " +
        "that one takes the word from the caret instead of from pointer coordinates, " +
        "and `misspellingAt` deliberately counts the boundary after the last letter, " +
        "which is where typing leaves it.",
      drive: async (p) => {
        await p.newLine();
        await p.type("בלגרנדזש");
        await p.waitFor(".cm-spell-error", 30_000);
        await p.press("Control+.");
        await p.waitFor(".spell-menu:not(.mekoros)", 10_000);
      },
    },
  ],

  [
    "pane-menu",
    {
      how: HOW.driven,
      why:
        "A pane's own ⋯ menu, anchored under the button in its strip. It is not a " +
        "chip because it is not one surface: every pane has one, and each is built " +
        "from the arrangement as it stands — which panes there are to swap with, " +
        "which tabs there are to move to. The gesture is the button, and the first " +
        "pane's is the one measured; they are the same builder.",
      drive: async (p) => {
        await p.click('[data-pane-act="menu"]');
        await p.waitFor(".pane-menu", 10_000);
      },
    },
  ],

  [
    "context-bar",
    {
      how: HOW.driven,
      why:
        "It has no opener: `updateContextBar` puts it up when the caret lands in " +
        "something structural and takes it down when the caret leaves, which is why " +
        "its declared exit is `caret`. Inserting a table is the gesture, because the " +
        "ribbon leaves the caret inside the table it made.",
      drive: async (p) => {
        await p.newLine();
        await p.click('.toolbar [data-command="טבלה"]');
        await p.waitFor("#context-bar.open", 10_000);
      },
    },
  ],

  // ---- and the ones with no gesture at all ----
  [
    "preview-modal",
    {
      how: HOW.class,
      why:
        "The only thing that opens it is `.float-preview-btn`, and `styles.css` " +
        "shows that button under `#app[data-page]` alone — the paged layout, which " +
        "this run is not in. Reaching it means driving the application at a phone " +
        "viewport, which is worth doing and is a wider check than this one: the " +
        "settings-drawer bug that started `panels.ts` was a below-720px bug, and " +
        "nothing here has ever looked at a narrow window.",
    },
  ],
  [
    "refresh-panel",
    {
      how: HOW.class,
      // Its head is not built on demand, so the `×` is a fair question even
      // though the hook never ran. The run is what settles that: this claim was
      // already passing before it was written down.
      head: true,
      why:
        "Filled from `POST /refresh`, which is Girsa's across the loopback, so the " +
        "gesture that opens it cannot complete in a run that boots Ksav alone. Unlike " +
        "`mekoros` it is still measured rather than excused: it is built with the " +
        "chrome — `overlayPanel` and `panelHead` at boot — so the element, the head " +
        "and the `×` are all real, and only the rows inside are missing.",
    },
  ],
  [
    "welcome",
    {
      how: HOW.boot,
      why:
        "The first screen anybody ever sees: it is mounted during boot and step 1 " +
        "dismisses it by picking a template out of it, so the only moment it can be " +
        "measured is before that step runs.",
    },
  ],
  [
    "mekoros",
    {
      how: HOW.unreachable,
      why:
        "The citation list is filled by `POST /mekoros`, which `services.gen.ts` " +
        "marks `nativeOnly` — it is answered by Girsa across the loopback, and this " +
        "run deliberately boots Ksav alone. Reaching it here would mean starting the " +
        "other application, which is a different check (G11's subject) and not a " +
        "reason to leave the other twenty-one unmeasured.",
    },
  ],
]);

/**
 * The surfaces that are not panels: the chrome every other step already leans on.
 *
 * This is a written list rather than a derived one, and that is the honest
 * description of it — there is no registry of "the editor" the way there is one
 * of the panels. What keeps it from being the hand-written list this file warns
 * about is that it does not grow with the product: each entry is something an
 * existing acceptance step already asserts the *existence* of, and all this does
 * is ask the stronger question about the same node. A sixth entry would be a new
 * claim about what the application is, which is exactly the kind of thing that
 * should need a sentence.
 */
export const CORE = [
  {
    name: "the ribbon",
    selector: ".toolbar",
    why:
      "Step 0 waits for it and steps 3 to 6 click buttons in it. If it is on the " +
      "screen at zero height every one of those clicks is Playwright reaching for " +
      "something a person cannot see.",
  },
  {
    name: "the editor",
    selector: ".cm-content",
    why:
      "Everything typed in the run goes here. An editor with no box is the one " +
      "surface whose absence would make every other assertion in the file a lie.",
  },
  {
    name: "a rendered page",
    selector: ".preview-host .page",
    why:
      "The check that counts pages has already been wrong once — it counted " +
      "`#preview .page` for thirteen runs after the window became a tree of panes " +
      "and reported `0 pages` on a build where the pages were on the screen. " +
      "Counting them says they are in the document; this says they are visible.",
  },
  {
    name: "the status line",
    selector: "#status",
    why:
      "Every compile verdict in this run is read off it, and the bug family this " +
      "product is named for is the application knowing something and not saying it. " +
      "A status line at `opacity: 0` is that bug in its purest form.",
  },
  {
    name: "the engine badge",
    selector: "#engine-badge",
    why:
      "It is how a reader knows whether they are on the server engine or the " +
      "in-browser one, and step 0 asserts its text. Text nobody can see is not an " +
      "answer to that question.",
  },
];

/**
 * The surfaces that are lists, and the row that says a list is empty.
 *
 * G5, relayed from Girsa: what a reader meets on a fresh install, before there
 * is anything. All five of `panelrows.ts`'s builders return an `empty` key when
 * they produce no rows, and `drawList` renders it — the mechanism is there and
 * is good. What was never done is *look at one*: the assembled run fills the
 * document with a heading, a list, a table and two notes before it opens a pane,
 * so every measurement of these four has been of a full one. The state a reader
 * starts in was the only state nothing drove.
 *
 * Named here rather than guessed at in the browser, because the alternative is a
 * silent skip: a panel that shows no empty row would be indistinguishable from a
 * panel that is not a list, which is exactly how a blank box survives. These
 * four are lists; the claim is that each says something when it holds nothing.
 * The palette is the fifth builder and is not here — it empties on a *query*
 * that matches nothing, which is a different sentence and a different moment.
 */
export const LISTS = ["outline-drawer", "notes-drawer", "marks-drawer", "history-modal"];

/** The row `drawList` renders in place of rows. One class, all four surfaces. */
export const EMPTY_ROW = ".outline-empty";

/**
 * The plan: one entry per declared surface, in registry order.
 *
 * Throws rather than returning a partial plan. A sweep that silently drops a
 * surface it could not classify is the shape of every finding in this document —
 * the class gets named in prose, one instance gets fixed, and the siblings are
 * never swept.
 */
export function planFor(panels) {
  const ids = new Set(panels.map((p) => p.id));
  for (const [id, r] of RECIPES) {
    if (!ids.has(id)) {
      throw new Error(
        `surfaces: there is a recipe for "${id}" and no such panel in PANELS — ` +
          `it was renamed or removed, and the recipe outlived it`,
      );
    }
    if (!Object.values(HOW).includes(r.how)) {
      throw new Error(`surfaces: "${id}" claims how="${r.how}", which is not one of the five`);
    }
    if (r.how === HOW.chip) {
      if (typeof r.chip !== "string" || !r.chip) {
        throw new Error(`surfaces: "${id}" is opened by a chip and does not say which`);
      }
    } else if (typeof r.why !== "string" || r.why.length < REASON) {
      // A chip needs no prose: the pairing is the whole claim and the run checks
      // it. Everything else is a departure from the registry's own mechanism and
      // has to say what the departure is for.
      throw new Error(`surfaces: "${id}" needs a reason for not being opened by a chip`);
    }
    if (r.how === HOW.driven && typeof r.drive !== "function") {
      throw new Error(`surfaces: "${id}" is driven and has no recipe to drive it with`);
    }
  }

  const plan = panels.map((p) => {
    const r = RECIPES.get(p.id);
    if (r) return { panel: p, ...r };
    // No default, and that is the decision this file turns on.
    //
    // Falling back to `class` for anything unclassified reads as tidy and is the
    // silent-skip shape one level up: the weakest measurement, chosen by nobody,
    // for whichever surface happened to be added last. A new panel is either
    // given the gesture that opens it or is a sentence explaining why it has
    // none — and until then this throws with its name in it.
    throw new Error(
      `surfaces: "${p.id}" is declared in PANELS and not classified here. Add it to ` +
        `RECIPES — how: chip with the chip that opens it, how: driven with a drive(), ` +
        `how: class with why there is no opener, or how: unreachable with why not at all.`,
    );
  });

  const excused = plan.filter((e) => e.how === HOW.unreachable);
  if (plan.length && excused.length * 2 >= plan.length) {
    throw new Error(
      `surfaces: ${excused.length} of ${plan.length} surfaces are excused ` +
        `(${excused.map((e) => e.panel.id).join(", ")}). A sweep that can excuse ` +
        `its way down to nothing is the failure it was written to catch.`,
    );
  }
  return plan;
}

/** The ones a browser is actually going to look at. */
export const measurable = (plan) => plan.filter((e) => e.how !== HOW.unreachable);

/**
 * Is this surface genuinely open when it is measured, hooks and all?
 *
 * Only then is it worth asking about its `×`. Under `class` the body has never
 * been filled, so a missing head says something about the probe rather than
 * about the panel — which is the mistake the note at the top of this file is
 * about, and it is written down here rather than remembered.
 */
export const reallyOpen = (entry) => entry.how !== HOW.class || entry.head === true;

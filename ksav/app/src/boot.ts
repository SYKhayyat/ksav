// The boot sequence: what happens, in what order, before the writer types.
//
// This was 238 lines in `main.ts`, and the order *is* the invariant. Three
// defects that are comments in this file rather than code — the interface
// language going unapplied (#122's sibling), `setPageSetup` running before a
// document existed (#135), and the fallback store skipping the registries and
// the unload guard — were all order bugs. A file whose job is to state the order
// should be a file somebody can read top to bottom.
//
// The seam carries four verbs the shell still owns: `installHooks` (187 lines and
// twenty-seven main-local names — its own wave), `wireKeys`, `actions` and
// `runAction`. Everything else here is a module export. `installBackgroundTimers`
// and `scheduleAutoSnapshots` moved in with it because they are boot's *ongoing*
// work — the timers it starts and the snapshot cadence a settings change resets.
//
// Nothing in this file decides what the window looks like; `render()` does that,
// and this calls it at the one moment there is something to draw.

import { makeWiring } from "./wiring";

import * as crash from "./crash";
import * as docs from "./docs";
import * as files from "./files";
import * as heads from "./headings";
import * as keymodes from "./keymodes";
import * as runtime from "./runtime";
import * as save from "./save";
import * as watch from "./watch";
import { FILE_AUTOSAVE_MS } from "./save";
import { createBackend } from "./transports";
import { docTextNow, showChromeNotice } from "./ribbon";
import { getLang, setLang, t, tf } from "./i18n";
import { gotoPart } from "./panehost";
import { installGirsaPoll } from "./girsa";
import { installScrollPolicy } from "./scrollpolicy";
import { noteAt } from "./notes";
import { offerRecovery, maybeCheckForUpdate, registerServiceWorker, showCrashPanel } from "./applifecycle";
import { onGoToPart } from "./diagview";
import { openPalette } from "./palette";
import { refreshBaseline, updateTitleBar } from "./docswitch";
import { render } from "./layout";
import { runCompile } from "./compile";
import { saveFile, reloadFromDisk, openSharedIfLinked, autosaveToFile } from "./fileui";
import { scheduleSpellCheck } from "./spellcheck";
import { setEditingMode } from "./compartments";
import { settings, settingsLoadFailure, reportSettingsWriteFailures, setPageSetup } from "./settings";
import { reportSaveFailure } from "./save";
import { starterDoc } from "./starter";
import { takeSnapshot } from "./snapshots";
import { voidAction } from "./asyncaction";

/** What boot reaches for that the shell still owns. */
export interface BootWiring {
  /** Install every listener the application has, once. */
  installHooks(): void;
  /** Bind the keyboard, including the modes that are not the editor's. */
  wireKeys(): void;
  /** The command list, for the key-mode bridge. */
  actions(): readonly { id: string }[];
  /** Run one command by id. */
  runAction(id: string): void;
  /** Load the shipped dictionary, so spell-check has one. */
  adoptDictionary(): Promise<void>;
  /** Fetch the command and template registries, with their retry. */
  loadRegistries(): Promise<void>;
}

const bootWire = makeWiring<BootWiring>("wireBoot");

export function wireBoot(w: BootWiring): void {
  bootWire.wire(w);
}

const wiring = (): BootWiring => bootWire.get();

let autoSnapshotTimer: number | null = null;
export function scheduleAutoSnapshots() {
  if (autoSnapshotTimer !== null) {
    window.clearInterval(autoSnapshotTimer);
    autoSnapshotTimer = null;
  }
  const every = docs.autoInterval(settings.autoSnapshot, settings.autoSnapshotMinutes);
  if (every === null) return;
  autoSnapshotTimer = window.setInterval(() => void takeSnapshot(), every);
}

export async function boot() {
  wiring().installHooks();
  // The interface language, before anything reads it — and this line did not
  // exist. `setLang` was called from exactly one place, `setSetting("lang", …)`,
  // which is the chip; nothing ever handed it what was stored. So the
  // application booted Hebrew every time however many times a writer had chosen
  // English, and only the chip put it right, for that session.
  //
  // That is what the help panel's Hebrew title was really about. The interface
  // was not "in English with one Hebrew string in it" — it was in Hebrew, and
  // the chip's rerender reached the header and the settings drawer and left the
  // panels where they were. Two faults, one symptom, and this is the first.
  //
  // Before `starterDoc()`, which asks `getLang()` to decide whether a new
  // document opens in English and left-to-right.
  if (settings.lang === "en" || settings.lang === "he") setLang(settings.lang);
  // The store opens before anything is drawn: the editor is constructed with
  // the document's text in it, so there is never a frame in which the writer
  // could type into a buffer that has no document behind it.
  const starter = starterDoc();
  // An English starter is a left-to-right document, and it is the only moment
  // where flipping the direction is unambiguously right: nothing else exists yet
  // to be disturbed by it.
  //
  // **This used to run here, and it did nothing.** `setPageSetup` returns early
  // when there is no current document, and at this line there is none — the
  // store has not opened yet, `runtime.currentDoc` is set forty lines below by
  // `setCurrentDoc(await docs.init(...))`. So an English first run got the
  // engine's shipped RTL default, which is #135's first defect: the writer asked
  // for English and was handed a right-to-left page with no way to see why.
  //
  // It is decided here and applied below, after the document exists. Deciding
  // and applying have to be the same expression or this happens again.
  const englishStarter = getLang() === "en" && !localStorage.getItem("ksav.onboarded");
  // Whether a durable store is available. When it is not — a private window, or
  // storage blocked — the fix is to lose *persistence* and nothing else. The old
  // fallback returned early here, and in doing so skipped the command/template
  // registries (leaving an empty toolbar, empty menus, no completions), the
  // unload guard (so closing the tab discarded the work with no prompt, in the
  // one case where nothing else was keeping it either), spell-check and the
  // timers. Everything below still runs; only the store-backed steps are guarded.
  let durable = true;
  try {
    runtime.setCurrentDoc(await docs.init(starter, t("untitled")));
  } catch (e) {
    durable = false;
    runtime.setCurrentDoc({ id: docs.newId(), title: t("untitled"), body: starter, assets: [], updated: Date.now() });
    reportSaveFailure(e); // the banner is honest; everything after it now works
  }
  // …and now there is a document to put it on. `dir` is page setup, so it belongs
  // to the starter rather than to the application — see the note above.
  if (englishStarter) setPageSetup({ dir: "ltr" });
  if (durable) {
    // A binding lives in the store, so there is nothing to recall without one.
    void files.bindingFor(runtime.currentDoc.id).then((b) => {
      runtime.setCurrentBinding(b);
      updateTitleBar();
    });
  }
  // Preferences that could not be read are preferences the writer has silently
  // lost. This banner exists because that failure had nowhere to go for the
  // whole life of the application: `loadSettings` threw on every boot and the
  // catch handed back the defaults, so every choice anybody ever made was
  // discarded on reload and nothing anywhere said a word about it. A fallback
  // that cannot report itself is indistinguishable from a feature that does not
  // work, which is what "emacs mode does nothing" turned out to be.
  const lostSettings = settingsLoadFailure();
  if (lostSettings) showChromeNotice(tf("settingsLost", lostSettings));
  // And the other half. A failed *read* has had a banner since it was written;
  // a failed *write* was swallowed, so a writer whose localStorage had filled
  // set preferences that the UI accepted, applied for the session, and lost on
  // reload — with no sentence anywhere. The string was already written.
  reportSettingsWriteFailures((why: string) => showChromeNotice(tf("settingsNotKept", why)));
  render();
  wiring().wireKeys();
  save.wireUnloadGuard();
  const status = document.getElementById("status")!;
  status.textContent = t("rendering");
  runtime.setBackend(await createBackend());
  const badge = document.getElementById("engine-badge");
  if (badge) {
    const labels: Record<string, string> = {
      server: "⬢ server",
      wasm: "⬡ wasm",
      desktop: "🖥 native",
    };
    badge.textContent = labels[runtime.backend!.kind] ?? runtime.backend!.kind;
  }
  // The dictionary as a file (B29) and the command/template registries are
  // independent of each other and both only need the backend, so they resolve
  // together rather than one behind the other in front of the first compile.
  // `adoptDictionary` still lands after the backend and before anything
  // spell-checks, so the first check already has the writer's own words. A
  // browser has no `dictionary()` and keeps using `localStorage`.
  await Promise.all([wiring().adoptDictionary(), wiring().loadRegistries()]);
  // The change gutter needs the document's newest snapshot, and boot does not
  // go through `openDoc`.
  void refreshBaseline();
  // What the modes are lent. Every route is the one the rest of the application
  // already uses: `:w` and C-x C-s reach the same save as the toolbar, `:name`
  // and M-x reach the same `runAction` the keyboard and the palette reach — so
  // the macro recorder sees a command run from `:` exactly as it sees one run
  // from a key — and `M-x` opens the palette this application already has rather
  // than a second, worse minibuffer built to be spelled the same way.
  keymodes.setBridge({
    save: () => void saveFile(),
    commands: () => wiring().actions().map((a) => a.id),
    run: (id) => void wiring().runAction(id),
    prompt: () => openPalette(),
    // The units a sefer is made of, from the same modules the outline pane, the
    // ribbon and the note register read. A second opinion about where a note
    // ends would disagree first with the pane sitting beside the text.
    units: (at) => {
      const doc = docTextNow();
      const out: Partial<Record<keymodes.SeferUnit, keymodes.Span>> = {};

      // A note. `a` is the marker with its body; `i` is the prose. A marker with
      // no body yet has no inside, and `hasBody` is how the register says so.
      const note = noteAt(doc, at);
      if (note) {
        out.note = {
          from: note.from,
          to: note.deferred ? note.deferred.defTo : note.to,
          inner: note.hasBody ? { from: note.bodyFrom, to: note.bodyTo } : undefined,
        };
      }

      // A heading, and *its section*: everything under it until the next heading
      // at the same level or above. `i` is the section without the heading line,
      // which is what a writer means by "this heading" when they say `dih`.
      // `sectionAt`, not `headingAt`. The difference is the whole feature:
      // `headingAt` matches only while the caret is *on the heading line*, so
      // `dah` did nothing from inside the section it is named after — which is
      // where a writer always is. `headings.ts` has carried the right function
      // all along, with a comment saying it is what "move this section" and
      // "fold this section" mean when the caret is in the body text.
      //
      // Recorded because the previous attempt at these text objects was
      // withdrawn with a note saying the arithmetic here was "right and is what
      // the next attempt needs". It was not; it was one function call wrong,
      // and calling the registration the only missing piece is what stopped
      // anybody looking.
      const all = heads.headings(doc);
      const here = heads.sectionAt(doc, at, all);
      if (here) {
        const after = all.find((h) => h.from > here.from && h.level <= here.level);
        const sectionTo = after ? after.from : doc.length;
        out.heading = {
          from: here.from,
          to: sectionTo,
          inner: { from: here.to, to: sectionTo },
        };
      }
      return out;
    },
    heading: (at, forward) => {
      const all = heads.headings(docTextNow());
      const next = forward
        ? all.find((h) => h.from > at)
        : [...all].reverse().find((h) => h.from < at);
      return next ? next.from : null;
    },
  });
  // An error in an included chapter opens *that* chapter and goes to the line.
  // `voidAction` and not `void`: opening a chapter awaits the document it is
  // switching to, and a failure there is a real one that the writer would
  // otherwise meet as a silent no-op. The fence in `asyncaction.test.mjs`
  // asked for exactly this answer rather than an inventory entry.
  // `voidAction` and not `void`: opening a chapter awaits the document it is
  // switching to, and a failure there is a real one the writer would otherwise
  // meet as a silent no-op. The fence in `asyncaction.test.mjs` asked for
  // exactly this answer rather than an inventory entry.
  //
  // `general` and not a new `Doing`: switching documents is not a compile, a
  // save, Girsa or a linkify, and `Doing` is a closed union on purpose — every
  // variant costs a sentence in both catalogues and earns its place by naming a
  // failure the writer could confuse with another kind.
  onGoToPart((file, line, column) => voidAction("general", () => gotoPart(file, line, column)));
  registerServiceWorker();
  voidAction("save_file", () => openSharedIfLinked());
  // Rescue the text before anything else, then say what happened.
  crash.install(
    () => ({
      title: runtime.currentDoc?.title ?? "",
      body: runtime.docText(),
      id: runtime.currentDoc?.id,
    }),
    (_e, detail) => showCrashPanel(detail),
  );
  voidAction("save_file", () => offerRecovery());
  voidAction("general", () => maybeCheckForUpdate());
  // A filesystem stat that nothing before the first compile reads, so it does
  // not gate the first page — void-fired like the other watch bookkeeping.
  void watch.markInSync(runtime.currentDoc.id, runtime.currentBinding);
  // Notice when the file changes underneath us — Dropbox pulling an older copy
  // down, a second window, a `git checkout`. On focus above all, because
  // alt-tabbing back from whatever touched it is the overwhelmingly common case.
  watch.watchForChanges(
    () => ({ docId: runtime.currentDoc?.id ?? "", binding: runtime.currentBinding }),
    () => {
      const name = runtime.currentBinding?.name ?? "";
      // A notice and not a modal. The conflict costs nothing until the next
      // save, and a dialog thrown up mid-sentence over something that can wait
      // is how writers learn to dismiss dialogs without reading them.
      showChromeNotice(tf("fileChangedNotice", name), {
        label: t("reloadFromDisk"),
        press: () => voidAction("save_file", () => reloadFromDisk()),
      });
    },
  );
  if (settings.editingMode && settings.editingMode !== "default") {
    voidAction("save_file", () => setEditingMode(settings.editingMode));
  }
  void runCompile();
  // The first check has to be scheduled explicitly: boot compiles directly
  // rather than through scheduleCompile, so nothing would be checked until the
  // writer's first keystroke.
  scheduleSpellCheck();
  // Periodic auto-snapshot, when the writer has left it on (only stores when the
  // text changed). Snapshots live in the store, so this is the one timer with
  // nothing to do without one — and the cadence is `scheduleAutoSnapshots`,
  // which reads the settings and can be called again when they change.
  if (durable) scheduleAutoSnapshots();
  // periodic write-back to the bound file, when there is one to write to. Kept
  // even with no store: a file binding made this session writes to disk, not to
  // the store, so it is exactly the escape hatch a private window still has.
  // This used to be a bare `setInterval` that ran forever — on a backgrounded
  // tab, a laptop on battery — with no guard against a slow call overlapping
  // itself. See `installBackgroundTimers`.
  installBackgroundTimers();
  // The Girsa handoff poll is girsa.ts's now (spec.md §10.6); same install
  // moment, its own file.
  installGirsaPoll();
  // The floating surfaces' scroll policy — native deltas, one honest
  // conversion, and the writer's own multiplier (#120), wired once at boot
  // because the document-level listener needs no rebuild after it.
  installScrollPolicy();
}

function tabHidden(): boolean {
  return typeof document !== "undefined" && document.visibilityState === "hidden";
}

export function installBackgroundTimers(): void {
  let autosaveBusy = false;
  window.setInterval(() => {
    if (tabHidden() || autosaveBusy) return;
    autosaveBusy = true;
    void Promise.resolve(autosaveToFile()).finally(() => {
      autosaveBusy = false;
    });
  }, FILE_AUTOSAVE_MS);
}

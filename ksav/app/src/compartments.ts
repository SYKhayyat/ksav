// ---------------------------------------------------------------- the notebook assembly
//
// The editor's own machinery: the compartments the application reconfigures,
// and the composition the split plan's wave 10 left in main because each piece
// looked like assembly. The pieces were the machinery; the *recipe* — the state
// factory that installs them and the dispatcher the keymaps call — is main's,
// and stays there. The audit's ledger named `syncGlobals`/`setEditingMode` as
// the ones the plan's own move-list wanted elsewhere; this is that move,
// authorised (see the wave-10 record's amendment, 2026-10-26).
//
// This file refuses to answer for: `makeState` (the composition) and `runAction`
// (the dispatcher). The one thing the keymap builder needs of the dispatcher
// arrives through a wiring, registered at boot, for the same reason docswitch's
// does: main cannot be imported for its own assembly, and a wiring says the
// dependency is deliberate and one-directional.

import { EditorView, keymap, type KeyBinding } from "@codemirror/view";
import { Compartment, Prec, EditorState } from "@codemirror/state";
import { autocompletion, type CompletionContext, type CompletionResult } from "@codemirror/autocomplete";
import * as runtime from "./runtime";
import { rerenderChrome } from "./runtime";
import { settings, docConfig, saveSettings } from "./settings";
import { voidAction } from "./asyncaction";
import { sourceViews } from "./panestate";
import * as keymodes from "./keymodes";
import { focusCompartment, focusExtension } from "./focus";
import { keybindings } from "./keyhint";
import { aliasesInForce } from "./bindings";
import { scheduleCompile } from "./compile";
import { t, getLang } from "./i18n";
import * as whitespace from "./whitespace";
import * as opendocs from "./opendocs";
import { nikudKeymap } from "./nikud";
import { proseMode, proseReveal } from "./ksav-lang";
import { pairedDelimiters } from "./brackets";
import * as sefarim from "./sefarim";
import { insertionAt } from "./mode";
import { docLang } from "./insert";
import { docTextOf } from "./spans";
import * as commands from "./commands";
import * as structure from "./structure";
import { BIDI_MARKS, visibleBidiMarks } from "./bidi";
import { makeWiring } from "./wiring";

// the declarations the region below carries are the machinery's exports
export const structureCompartment = new Compartment();


/**
 * Reconfigure the compartments that belong to the *application* rather than to
 * the document, after a state swap.
 *
 * A state carries the compartment values it was built with, which is right for
 * the document's own — its prose mode, its direction — and wrong for everything
 * else: a state created before the writer switched to the dark theme would come
 * back light, and one created before they rebound a key would come back with
 * the old binding. Cheaper and far more reliable than trying to reach into every
 * stored state whenever a setting changes, and it runs once per switch.
 */
export const proseCompartment = new Compartment();
export const dirCompartment = new Compartment();
export const themeCompartment = new Compartment();
export const phraseCompartment = new Compartment();

export const editorTheme = (dark: boolean) =>
  EditorView.theme(
    {
      // The source's own zoom, which is the half of *"zoom in the source and in
      // the preview"* that did not exist: this was a flat `15px`, so the one
      // surface a writing tool is for was the one surface whose size could not
      // be changed. `--source-zoom` is set on the root by `applySourceZoom`, and
      // the fallback keeps this rule correct before the first paint and in any
      // test that mounts an editor without the application around it.
      "&": { height: "100%", fontSize: "calc(15px * var(--source-zoom, 1))" },
      ".cm-content": {
        fontFamily: '"Frank Ruhl Libre","David Libre",serif',
        lineHeight: "1.7",
        caretColor: dark ? "#fff" : "#000",
      },
      ".cm-scroller": { overflow: "auto" },
      "&.cm-focused": { outline: "none" },
    },
    { dark },
  );

// ---------------------------------------------------------------- the application compartments
//
// The state carries the document's own compartments (prose, direction) and the
// shell re-reads the application's own after every swap: theme, focus, the
// shortcut keymap, the auto-complete, the structure keys. This is the notebook
// assembly the plan keeps in main — the recipe, not a feature.

export function syncGlobals() {
  const effects = [
    themeCompartment.reconfigure(editorTheme(settings.theme === "dark")),
    focusCompartment.reconfigure(
      focusExtension(
        !!settings.focusMode,
        !!settings.typewriter,
        settings.typewriterAnchor ?? "center",
      ),
    ),
    shortcutCompartment.reconfigure(Prec.highest(keymap.of(buildShortcutKeymap()))),
    autoCompartment.reconfigure(autoExtension()),
    structureCompartment.reconfigure(Prec.high(keymap.of(compartmentsWiring().structureKeymap()))),
    // The document's own, and it has to be re-read rather than inherited:
    // this is the incoming document's direction, not the outgoing one's.
    dirCompartment.reconfigure(EditorView.contentAttributes.of({ dir: docConfig().dir })),
  ];
  // Every source pane, because every source pane was just handed the incoming
  // document's state and a state carries the compartment values it was built
  // with. Reconfiguring only the focused one left the pane beside it on the
  // outgoing document's direction — a Hebrew sefer's panes rendering an English
  // one right-to-left, in the half of the window nobody was looking at.
  for (const v of sourceViews()) v.dispatch({ effects });
  // The editing mode is loaded asynchronously, so it is applied rather than
  // reconfigured inline — `applyMode` awaits the import and dispatches itself.
  voidAction("save_file", () => setEditingMode(settings.editingMode));
}

/**
 * Switch the editing mode, and rebuild Ksav's own keymap around the answer.
 *
 * The second half is not bookkeeping. `buildShortcutKeymap` returns nothing at
 * all while a mode is really installed — that is how the mode wins, instead of
 * by out-ranking anything — so the keymap has to be rebuilt *after* the import
 * resolves, and after a failed one too. Three call sites used to invoke
 * `applyMode` directly, and a fourth would have been added without this.
 */
export async function setEditingMode(mode: unknown): Promise<void> {
  const want = keymodes.isMode(mode) ? mode : "default";
  // Every source pane, and this one is not a tidiness argument.
  //
  // A mode was installed into `runtime.view` alone, so a writer in vim who
  // split the window got a second pane with no vim in it — and a pane with no
  // vim does not lack a feature, it **writes your commands into the sefer**.
  // `i` was typed as the letter `i`, `dd` as the letters `dd`. Measured, not
  // reasoned about: `iCHET` in the new pane produced `iCHET` on the line while
  // the same keys in the pane beside it produced `CHET`.
  const views = sourceViews();
  // All panes together, not one behind the next: `applyMode` awaits a dynamic
  // import, and a serial loop reaches pane 1 before pane 4 — a window in which
  // half the panes have the mode and half do not, which for vim means half of
  // them are writing the writer's commands into the sefer (see above).
  await Promise.all((views.length ? views : [runtime.view]).map((v) => keymodes.applyMode(v, want)));
  reconfigureShortcuts();
}

/**
 * What the keymap builder needs of the shell's dispatcher.
 *
 * `runAction` stays main: it is the one door every invoker goes through, and it
 * knows main's action table. The keymap must call it — that is the recorder's
 * whole point — so it arrives here through a wiring, the direction the audit's
 * #145 made the house style: registered at boot, one-directional, and the cycle
 * (importing main for its own assembly) avoided rather than hidden.
 */
export interface CompartmentsWiring {
  runAction(id: string, v: EditorView): boolean;
  /** Every action the keymap can bind — main's table, the macros included. */
  actionsForKeys(): { id: string }[];
  /** The structure keys: one keymap main builds from the structure registry. */
  structureKeymap(): KeyBinding[];
}

const W = makeWiring<CompartmentsWiring>("wireCompartments");
export const wireCompartments = W.wire;
const compartmentsWiring = W.get;

export function buildShortcutKeymap(): KeyBinding[] {
  // A mode that is really here takes the whole keyboard.
  //
  // Not a precedence, and that is the fix. The mode's keymap and this one were
  // both `Prec.highest` with the mode placed first, and the promise that the
  // mode wins rested on CodeMirror breaking that tie by array order. It broke
  // the other way in the production build and Emacs mode did nothing at all —
  // `C-k` killed nothing, `Ctrl+K` opened Ksav's palette — while the same page
  // in Vim mode worked, because vim bypasses the keymap facet entirely. Nothing
  // that returns no bindings can lose a tie.
  //
  // `activeMode`, not the setting: a failed fetch leaves the writer with plain
  // editing, and standing these down for a mode that never arrived would be an
  // editor with no keys at all. Every action is still reachable as `:name` and
  // under `M-x` — see `keymodes.registerCommands`.
  if (keymodes.activeMode() !== "default") return [];
  const kb = keybindings();
  const bindings: KeyBinding[] = [...nikudKeymap(scheduleCompile)];
  // Which aliases survive is `bindings.aliasesInForce`, not a `claimed` set built
  // here: it is the same rule the settings panel needs when it warns about a
  // conflict, and two copies of it is how one of them stops matching.
  const aliases = aliasesInForce(kb);
  for (const a of compartmentsWiring().actionsForKeys()) {
    // Structural operations are bound in `structureKeymap` instead. This keymap
    // sets `preventDefault`, which swallows the key whether or not the command
    // ran — fine for Mod-Alt-b, fatal for Enter and Tab, which must reach the
    // editor untouched the moment the caret leaves a list.
    if (structure.actionById(a.id)) continue;
    // Through `runAction`, not `a.run`. This binding is the path the macro
    // recorder is *for* — "I just did this fiddly thing eleven times" is done
    // with the keyboard — and calling `run` directly is what made every one of
    // these operations invisible to it.
    const press = (v: EditorView) => compartmentsWiring().runAction(a.id, v);
    if (kb[a.id]) bindings.push({ key: kb[a.id], run: press, preventDefault: true });
    for (const alias of aliases[a.id] ?? []) {
      bindings.push({ key: alias, run: press, preventDefault: true });
    }
  }
  return bindings;
}
export const shortcutCompartment = new Compartment();
export function reconfigureShortcuts() {
  const effects = [
    shortcutCompartment.reconfigure(Prec.highest(keymap.of(buildShortcutKeymap()))),
    // Both, or rebinding Tab in Settings would change the shortcut list and
    // leave the editor still doing the old thing.
    structureCompartment.reconfigure(Prec.high(keymap.of(compartmentsWiring().structureKeymap()))),
  ];
  // Every source pane. A binding is a property of the application, not of the
  // pane that happened to have focus when it was changed — rebinding a key with
  // the window split used to leave the other pane on the old one, which is a
  // shortcut list that is true of half the screen.
  for (const v of sourceViews()) v.dispatch({ effects });
}

export const autoCompartment = new Compartment();
// ---------------------------------------------------------------- pairing
//
// Which delimiters close themselves, as two switches rather than one.
//
// They are two questions and were one hard-coded answer. Brackets pairing is
// liked and stays on. Quotes are the ones that cannot be assumed: in a Hebrew
// document `"` is the gershayim of רש״י and שו״ע and `'` is the geresh of ר'
// — both sit *inside* words, several times a line, and pairing them turns
// ordinary typing into a fight. That is why they ship off. It is not a reason to
// withhold them from a writer setting an English sefer, or from anyone who wants
// them; it is a reason for the default and for the note under the switch.
export const pairCompartment = new Compartment();

export function pairExtension() {
  // `closeBrackets` takes its list from language data, and Ksav's highlighter is
  // a regex scanner with no grammar behind it, so the data is provided directly
  // rather than by a language.
  const brackets = pairedDelimiters(
    settings.autoPairBrackets !== false,
    !!settings.autoPairQuotes,
  );
  return EditorState.languageData.of(() => [{ closeBrackets: { brackets } }]);
}

/** Draw the whitespace that is not prose, or nothing at all. */
export function whitespaceExtension() {
  return settings.showWhitespace ? whitespace.whitespaceMarks() : [];
}

/**
 * A compartment for the above, and not a flag read inside the plugin.
 *
 * The plugin is a `ViewPlugin`, so a setting read inside it would be read once at
 * construction and then never again — the marks would keep showing, or keep not
 * showing, until the document was swapped. `pairExtension` above has the same
 * requirement and the same answer, which is why this sits beside it rather than
 * inventing a second arrangement.
 *
 * **Its own compartment, and not one shared with the pairing switches** — which is
 * the whole point of `whitespace.ts`. Those two replace ranges and this one does
 * not, so all three are free together. `bidi.ts:452` is why that is worth writing
 * down: two replacements over one range blanks the editor rather than merely
 * looking wrong.
 */
export const whitespaceCompartment = new Compartment();

export function autoExtension() {
  return settings.autocomplete === false
    ? []
    : autocompletion({ override: [ksavCompletions], icons: false });
}

/**
 * What goes in the prose compartment: the "looks like Word" view, or the raw
 * view's own extras.
 *
 * One compartment holds both because they must never both be installed. Prose
 * mode hides command syntax with replace decorations and the bidi-mark chips
 * replace single characters; a control character inside hidden syntax would be
 * replaced twice, which CodeMirror does not merely draw oddly — it rejects the
 * whole decoration set and the editor goes blank. Putting them in one slot makes
 * that impossible instead of forbidden.
 */
export function proseOrRaw(prose = proseHere()) {
  // The field and the plugin that drives its deferred reveal go in together:
  // `proseReveal` is the only thing that draws what a cursor move owes, so a
  // prose view installed without it would hide a command under the caret and
  // never take it back. They are one extension for the same reason the two
  // halves of this compartment are one slot — the pairing is enforced by there
  // being nowhere to install one of them alone.
  return prose ? [proseMode, proseReveal] : visibleBidiMarks(bidiMarkName);
}

/**
 * Prose or raw, for the document on screen.
 *
 * `settings.prose` is now the default a *newly opened* document starts from,
 * not the answer for the one in front of you. That is the fix for *"I closed
 * this document and reopened it, and it went into prose mode"*: the mode was an
 * application-wide flag, so it could not be remembered per document because
 * there was nowhere for it to be remembered.
 *
 * Falls back to the setting before anything is open, which is the state `boot`
 * is in when it builds the first editor.
 */
export function proseHere(): boolean {
  const id = opendocs.focusedId();
  const doc = id ? opendocs.opened(id) : undefined;
  return doc ? doc.prose : !!settings.prose;
}

/** Set prose or raw for the document on screen, and remember it there. */
export function setProseHere(prose: boolean) {
  const id = opendocs.focusedId();
  const doc = id ? opendocs.opened(id) : undefined;
  if (doc) doc.prose = prose;
  // Still written to settings, because it is the default the *next* document
  // opens with, and a writer who works in raw should not have to say so again
  // for every document they open.
  settings.prose = prose;
  saveSettings();
  runtime.view.dispatch({ effects: proseCompartment.reconfigure(proseOrRaw(prose)) });
  rerenderChrome();
}

/** What to call a command that is not the registry's. */
export function whose(from: "registry" | "document" | "yours"): string {
  if (from === "document") return t("fromDocument");
  if (from === "yours") return t("fromYou");
  return "";
}

// Command autocomplete: typing `#` offers Ksav commands from the registry plus
// any user-defined commands. Not a dictionary — only triggers on `#`.
function ksavCompletions(context: CompletionContext): CompletionResult | null {
  // A sefer name where a sefer name goes. Checked first, because inside
  // `#ציון_מקור("…` the `#` match below would still fire on the command itself
  // and offer commands in the middle of an argument.
  const cite = sefarimCompletions(context);
  if (cite) return cite;
  const word = context.matchBefore(/#[A-Za-z֐-׿_]*/u);
  if (!word) return null;
  if (word.from === word.to && !context.explicit) return null;
  const q = word.text.slice(1).toLowerCase();
  const insertApply =
    (raw: string) => (v: EditorView, _c: unknown, from: number, to: number) => {
      // The completion fired because a `#` was typed — but inside an argument
      // list that `#` is itself the error, so the completion replaces it with
      // the bare call rather than completing a mistake into a longer mistake.
      const snip = insertionAt(docTextOf(v.state.doc), from, raw, to);
      const pipe = snip.indexOf("|");
      const text = pipe >= 0 ? snip.slice(0, pipe) + snip.slice(pipe + 1) : snip;
      const cursor = pipe >= 0 ? from + pipe : from + text.length;
      v.dispatch({ changes: { from, to, insert: text }, selection: { anchor: cursor } });
    };
  // One list, from `commands.ts`. It carries the *document's* own commands when the
  // document has any, so a shared sefer's `#` completion offers what its compiler
  // will actually run.
  // The name in the language this document is written in, because that is the
  // name that will be in the source a moment later — and the *other* spelling
  // in the detail column, because a bilingual registry's second name is worth
  // knowing and this is the one surface with room to show it.
  const writing = docLang();
  const options = commands
    .available(runtime.commandsReg)
    .filter((c) => commands.matches(c, q))
    .map((c) => {
      const here = writing === "he" ? c.name : (c.en ?? c.name);
      const other = writing === "he" ? c.en : c.name;
      return {
        label: "#" + here,
        detail: (c.from === "registry" ? other : undefined) ?? whose(c.from),
        info: c.from === "registry" ? (getLang() === "he" ? c.desc_he : c.desc_en) : whose(c.from),
        apply: insertApply(c.insert),
      };
    });
  return { from: word.from, options, filter: false };
}

/**
 * Sefer names, offered inside a citation's first argument.
 *
 * What it inserts is the **canonical** name, not the abbreviation that was
 * typed: the index files a citation under the canonical name anyway, so
 * completing to it means the page and the index agree about what the sefer is
 * called without anyone doing a copy-editing pass.
 */
function sefarimCompletions(context: CompletionContext): CompletionResult | null {
  const arg = sefarim.seferArgAt(docTextOf(context.state.doc), context.pos);
  if (!arg) return null;
  if (arg.query === "" && !context.explicit) return null;
  const hits = sefarim.suggest(arg.query);
  if (!hits.length) return null;
  return {
    from: arg.from,
    to: arg.to,
    filter: false,
    options: hits.map((s) => ({
      label: s.canonical,
      // The abbreviations, so a writer can see that ב״ב is a thing they may type
      // and that it will come out as בבא בתרא.
      detail: s.aliases.join(" · "),
      apply: s.canonical,
    })),
  };
}

/** What to call a bidi control character, in the interface's language. */
export function bidiMarkName(code: number): string {
  const mark = BIDI_MARKS[code];
  if (!mark) return "";
  return `${mark.tag} — ${getLang() === "en" ? mark.en : mark.he}`;
}

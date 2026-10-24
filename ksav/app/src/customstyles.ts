// ---------------------------------------------------------------- custom styles
//
// The writer's own paragraph styles. `styles.ts` owns what one *is* and how it
// is read and rewritten; this is the three gestures — apply, remove, edit — and
// the small form that makes one.
//
// This file refuses to answer for: the panel that lists the document's styles
// and every other formatting section (`stylespanel.ts`); what one style *is*
// and how its call is read and rewritten (`styles.ts`).

import { el, fieldRow, textField } from "./dom";
import { t, tf } from "./i18n";
import { docTextOf, scanDoc } from "./spans";
import { paragraphAt } from "./focus";
import { docTextNow } from "./ribbon";
import { editDoc, setStatus } from "./runtime";
import * as runtime from "./runtime";
import { updateContextBar } from "./contextbar";
import { docLang } from "./insert";
import { scheduleCompile } from "./compile";
import * as styles from "./styles";
import { fieldControl, styleRow } from "./stylecontrols";
import { openModal } from "./formmodal";

/**
 * What the gestures borrow from the shell: the form modal (wave 9 still holds
 * it in main with the other form doors — here it is the only thing the module
 * cannot import).
 */

// ---------------------------------------------------------------- custom styles
//
// The writer's own paragraph styles. `styles.ts` owns what one *is* and how it
// is read and rewritten; this is the three gestures — apply, remove, edit — and
// the small form that makes one.

/**
 * Put a custom style on the paragraph, or on the selection if there is one.
 *
 * With nothing selected it takes the whole paragraph, which is what a paragraph
 * style means and what pressing one in Word does. Written directly rather than
 * through `insertSnippet`: a custom style's name is the writer's own word and
 * there is no second language to translate it into.
 */
export function applyCustomStyle(name: string): boolean {
  const view = runtime.view;
  const span = styleTarget();
  if (!span) {
    setStatus(t("noParagraphHere"), "warn");
    updateContextBar();
    return false;
  }
  const body = view.state.sliceDoc(span.from, span.to);
  const head = span.from + name.length + 2; // `#` + name + `[`
  view.dispatch({
    changes: { from: span.from, to: span.to, insert: `#${name}[${body}]` },
    selection: { anchor: head, head: head + body.length },
  });
  scheduleCompile();
  view.focus();
  return true;
}

/** What a paragraph style would go on: the selection, or the paragraph in hand. */
function styleTarget(): { from: number; to: number } | null {
  const view = runtime.view;
  const sel = view.state.selection.main;
  if (!sel.empty) return { from: sel.from, to: sel.to };
  const lines = paragraphAt(view.state, sel.head);
  const from = view.state.doc.line(lines.from).from;
  const to = view.state.doc.line(lines.to).to;
  return from === to ? null : { from, to };
}

/** Take the style off again — what "body text" means when one is applied. */
export function unwrapCustomStyle(name: string) {
  const view = runtime.view;
  const doc = docTextOf(view.state.doc);
  const pos = view.state.selection.main.head;
  // Innermost first, the same rule `customStyleAt` uses to decide which style the
  // dropdown is showing — so the pair always act on the same one.
  const node = scanDoc(view.state.doc)
    .nodes.filter((n) => n.hash && n.name === name && pos >= n.from && pos <= n.to && n.bodies.length)
    .sort((a, b) => b.depth - a.depth)[0];
  if (!node) return;
  const body = node.bodies[node.bodies.length - 1];
  const inner = doc.slice(body.from, body.to);
  view.dispatch({
    changes: { from: node.from, to: node.to, insert: inner },
    selection: { anchor: node.from + inner.length },
  });
  scheduleCompile();
  view.focus();
}

/** Every name a new style may not take: the registry's, and the ones already made. */
function takenStyleNames(): string[] {
  const doc = docTextNow();
  return [
    ...runtime.commandsReg.flatMap((c) => [c.he, c.en]),
    ...styles.findCustomStyles(doc).map((s) => s.name),
  ];
}

/**
 * The knob rows a style is made of, over whatever reads and writes them.
 *
 * In two groups, because three of the ten are not the same kind of question.
 * Alignment and the two spacings make `#עיצוב` a block, so a style carrying one
 * of them breaks any sentence it is applied inside — the writer's report was
 * *"when I make a word be in a style, it makes that word be in its own
 * paragraph"*, and the engine was doing exactly what the knob asked for. The
 * knob was the thing that said nothing. `PARAGRAPH_KNOBS` names the three, in
 * one place, and the note under the heading says what choosing one costs.
 */
function styleKnobRows(
  read: (key: string) => string | undefined,
  write: (key: string, value: string | null) => void,
): Node[] {
  const row = ([key, field]: [string, styles.Field]) =>
    styleRow(t(field.label), fieldControl(field, read(key), (v) => write(key, v)));
  const all = Object.entries(styles.STYLE_FIELDS);
  const inline = all.filter(([k]) => !styles.PARAGRAPH_KNOBS.includes(k));
  const paragraph = all.filter(([k]) => styles.PARAGRAPH_KNOBS.includes(k));
  return [
    ...inline.map(row),
    el("div", { class: "set-head" }, [t("paragraphKnobsHead")]),
    el("div", { class: "set-note" }, [t("paragraphKnobsNote")]),
    ...paragraph.map(row),
  ];
}

/** *Other…* — name a style, give it a look, and put it on this paragraph. */
export function openNewStyle() {
  const pending: Record<string, string> = {};
  const nameInput = textField();
  openModal(
    t("newStyleTitle"),
    t("newStyleLede"),
    [
      fieldRow(t("styleName"), nameInput),
      ...styleKnobRows(
        (k) => pending[k],
        (k, v) => {
          if (v === null) delete pending[k];
          else pending[k] = v;
        },
      ),
    ],
    () => {
      const name = nameInput.value.trim();
      const bad = styles.styleNameError(name, takenStyleNames());
      if (bad) {
        setStatus(t(bad), "warn");
        updateContextBar();
        return;
      }
      // **The use first, then the definition**, and the order is the whole of
      // it. `defineCustomStyle` writes at the top of the document, so doing it
      // first moves every offset underneath — including the paragraph the style
      // is being made *for*. Driven the other way round once, and it wrapped the
      // `#let` it had just written together with the rest of the page, into a
      // document that did not compile. Applying first leaves the second dispatch
      // a plain insertion above the caret, which CodeMirror maps for us.
      if (!applyCustomStyle(name)) return;
      editDoc(styles.defineCustomStyle(docTextNow(), name, pending, docLang()));
      scheduleCompile();
      setStatus(tf("styleCreated", name), "ok");
    },
    t("createAction"),
  );
  nameInput.focus();
}

/** The formatting behind a style that already exists, live. */
export function openStyleEditor(name: string) {
  const style = styles.findCustomStyle(docTextOf(runtime.view.state.doc), name);
  if (!style) {
    setStatus(t("noStyleToEdit"), "warn");
    return;
  }
  openModal(
    tf("editStyleTitle", name),
    t("editStyleLede"),
    styleKnobRows(
      (k) => style.args.get(k),
      (k, v) => {
        // Re-found on every change: the previous write moved the offsets this
        // one is about to use, and holding the stale range is how a panel
        // corrupts the very line it is editing.
        const doc = docTextOf(runtime.view.state.doc);
        const now = styles.findCustomStyle(doc, name);
        if (!now) return;
        editDoc(styles.setCustomStyleArgs(doc, now, { [k]: v }));
        scheduleCompile();
      },
    ),
    () => {},
    t("done"),
  );
}
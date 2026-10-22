// ---------------------------------------------------------------- styles panel
//
// One place for formatting, because there were three and they fought:
// app settings, presets that silently overwrote them, and the in-document
// #הגדרות_* commands — the most powerful styling in the product, with no UI at
// all. This panel puts page setup, presets and the document's own heading / list
// / table design side by side, so "where does my formatting live" has an answer.
//
// This file refuses to answer for: what one style *is* and how its call is read
// and rewritten (`styles.ts`); what the writer's own paragraph styles are and
// the gestures that apply them (`customstyles.ts`); what a destination is
// (`channels.ts`) — the panel renders its rows, borrowed through the wiring.

import { el, glyphBtn, iconBtn } from "./dom";
import { t, tf } from "./i18n";
import { docTextOf } from "./spans";
import { editDoc, closeMenus } from "./runtime";
import * as runtime from "./runtime";
import { scheduleCompile } from "./compile";
import { openPanel, panelHead } from "./panels";
import { docLang, insertSnippet } from "./insert";
import { typstString } from "./typst-escape";
import * as styles from "./styles";
import * as marks from "./marks";
import * as heads from "./headings";
import * as fonts from "./fonts";
import { BUNDLED_FONTS, COMMAND_EN } from "./engine.gen";
import { docConfig, SKINS, pendingUndo, saveSettings, settings } from "./settings";
import * as panelviews from "./panelviews";
import { captureShortcut } from "./settingsdrawer";
import { hintFor, keybindings } from "./keyhint";
import { docTextNow } from "./ribbon";

/**
 * What the panel borrows from the shell: the destinations section's rows (a
 * destination is the document's own declaration, and its rows read the living
 * document), and the preset machinery — app settings, applied and undone —
 * which stays main-held with the other settings mutations.
 */
export interface StylesWiring {
  destinationRows(): Node[];
  applySkin(name: string): void;
  undoSkin(): void;
  reconfigureShortcuts(): void;
  /** The edit affordance on a "my styles" row — the writer's own styles' editor. */
  openStyleEditor(name: string): void;
}

let stylesWiringInstance: StylesWiring | null = null;

/** Boot wires the panel's borrowings once. */
export function wireStyles(wiring: StylesWiring): void {
  stylesWiringInstance = wiring;
}

export function stylesWiring(): StylesWiring {
  if (!stylesWiringInstance) {
    throw new Error("wireStyles was never called before the styles panel reached for the shell");
  }
  return stylesWiringInstance;
}

// ---------------------------------------------------------------- styles panel
//
// One place for formatting, because there were three and they fought:
// app settings, presets that silently overwrote them, and the in-document
// #הגדרות_* commands — the most powerful styling in the product, with no UI at
// all. This panel puts page setup, presets and the document's own heading / list
// / table design side by side, so "where does my formatting live" has an answer.

export function openStyles() {
  closeMenus();
  openPanel("styles-panel");
}

/** Read the document's current value for one styling argument. */
function styleArg(target: styles.StyleTarget, key: string): string | undefined {
  const call = styles.findStyleCall(docTextOf(runtime.view.state.doc), target);
  return call?.args.get(key);
}

/**
 * The command a section is reading and writing right now.
 *
 * Every section but Marks has one, fixed. Marks has one **per class** — a door
 * named for the command, `#הגדרות_סימן` — so which command the section is about
 * depends on what the class chooser says.
 */
function styleTargetOf(kind: styles.StyleCommand): styles.StyleTarget {
  return kind === "marks" ? styles.markDoor(markClass) : kind;
}

/** Write styling arguments into the document, replacing the existing call.
 *
 *  A styling command the document does not have yet is written in the language
 *  the document is being set in, so clicking a control in an English document
 *  does not drop a Hebrew command into it. An existing call keeps whatever
 *  language it was already written in. */
function setStyleArgs(target: styles.StyleTarget, changes: Record<string, string | null>) {
  const doc = docTextOf(runtime.view.state.doc);
  const next = styles.setStyleArgs(doc, target, changes, docLang());
  if (next === doc) return;
  editDoc(next);
  scheduleCompile();
  renderStylesPanel();
}

/** A labelled row in the styles panel. */
export function styleRow(label: string, control: Node): HTMLElement {
  return el("label", { class: "set-row" }, [el("span", {}, [label]), control]);
}

/**
 * A free-text control for a value that is not a string literal.
 *
 * A region's name and a channel's height are both written bare in the source —
 * one is an identifier the writer chose, the other a length — so neither goes
 * through `fieldControl`'s `"text"` case, which quotes what it is given.
 */
export function textControl(
  current: string,
  onSet: (v: string) => void,
  placeholder = "",
): HTMLElement {
  const input = el("input", {
    type: "text",
    value: current,
    ...(placeholder ? { placeholder } : {}),
  }) as HTMLInputElement;
  input.addEventListener("change", () => onSet(input.value));
  return input;
}

/**
 * A numbering scheme **per level** — digits at the top, letters underneath.
 *
 * Typst has read a nested list's pattern one symbol per level for as long as it
 * has had lists: `"1.א.i."` numbers the top level `1.`, the one inside it `א.`
 * and the one inside that `i.`. Nothing said so, and the one control that wrote
 * the field offered five whole-pattern schemes, so *"letters at one level and
 * digits at another"* was a setting the engine had and the product did not.
 *
 * Three rows, or more when the document already asks for more — a pattern with
 * four levels in it must not lose its fourth by being looked at.
 */
function levelsControl(raw: string | undefined, set: (v: string | null) => void): HTMLElement {
  const levels = styles.readLevels(raw);
  const rows = Math.max(3, levels.length);
  const options: [string, string][] = [
    ["", t("notSet")],
    ["1.", "1. 2. 3."],
    ["1)", "1) 2) 3)"],
    ["א.", "א. ב. ג."],
    ["א)", "א) ב) ג)"],
    ["a.", "a. b. c."],
    ["A.", "A. B. C."],
    ["i.", "i. ii. iii."],
    ["I.", "I. II. III."],
  ];
  const picked = Array.from({ length: rows }, (_, i) => levels[i] ?? "");
  const write = () => set(styles.typstLevels(picked.map((p) => p || null)));
  return el(
    "span",
    { class: "level-rows" },
    picked.map((current, i) =>
      el("span", { class: "level-row" }, [
        el("span", { class: "level-tag" }, [String(i + 1)]),
        selectControl(options, current, (v) => {
          picked[i] = v;
          write();
        }),
      ]),
    ),
  );
}

export function selectControl(
  options: [string, string, boolean?][],
  current: string,
  onPick: (v: string) => void,
): HTMLElement {
  return el(
    "select",
    { onChange: (e: Event) => onPick((e.target as HTMLSelectElement).value) },
    options.map(([v, lbl, off]) =>
      el(
        "option",
        {
          value: v,
          ...(current === v ? { selected: "selected" } : {}),
          // An option that cannot be chosen says so where the writer is looking,
          // rather than snapping back after they choose it and explaining nothing.
          ...(off ? { disabled: "disabled" } : {}),
        },
        [lbl],
      ),
    ),
  );
}

// -------------------------------------------- global by default, per instance
//
// The writer's model has three layers and the panel could reach one:
//
//   1. the document's default for a kind of thing — every `#הגדרות_*` command;
//   2. one element's own settings, which overrule the default for that element;
//   3. `כפה` on the default, which overrules every element back.
//
// Layers 2 and 3 are `engine/typst/ksav.typ`'s, resolved there by one shared merge
// for all of headings, lists, tables, notes, bands and streams. What follows is
// how a control reaches them: which layer a section of the panel is writing, and a
// row per knob that the element may answer for itself.

/**
 * Which sections are writing the element the caret is in rather than the default.
 *
 * Panel state and not document state: it is a question about what the writer is
 * looking at, so it resets with the panel and never appears in the file.
 */
const styleScopes = new Set<styles.StyleCommand>();

/** Which heading level the *default* layer is being edited for; 0 = all of them. */
let headingLevel = 0;

/** The innermost element of this kind the caret is inside, if any. */
function styleInstance(kind: styles.StyleCommand): styles.InstanceCall | null {
  const view = runtime.view;
  if (!view) return null;
  return styles.findInstance(
    docTextOf(view.state.doc),
    kind,
    view.state.selection.main.head,
  );
}

/** The element this section is writing on, or null when it is writing the default. */
function scopedInstance(kind: styles.StyleCommand): styles.InstanceCall | null {
  return styleScopes.has(kind) ? styleInstance(kind) : null;
}

/** Write to whichever layer this section is writing. */
function setStyleArgsIn(kind: styles.StyleCommand, changes: Record<string, string | null>) {
  const inst = scopedInstance(kind);
  if (!inst) {
    setStyleArgs(styleTargetOf(kind), changes);
    return;
  }
  const doc = docTextOf(runtime.view.state.doc);
  const next = styles.setInstanceArgs(doc, inst, changes);
  if (next === doc) return;
  editDoc(next);
  scheduleCompile();
  renderStylesPanel();
}

/**
 * The scope switch and the overrule checkbox, for one section.
 *
 * Both belong at the top of a section because both change what every control
 * under them means. And the overrule state is said out loud in whichever scope
 * the writer is in: on the default, that individual settings are not applying; on
 * an element, that what they are about to change will not show. A control that
 * silently does nothing is the failure this whole change exists to end, and
 * turning the switch on is the one legitimate way to produce one.
 */
function scopeRows(kind: styles.StyleCommand, many: string, one: string): Node[] {
  const inst = styleInstance(kind);
  const here = !!scopedInstance(kind);
  // Through the target rather than the kind, so `כפה` on the Marks section is
  // *this class's* overrule — `#הגדרות_סימן(כפה: true)` means every siman and
  // says nothing about the gemara references.
  const target = styleTargetOf(kind);
  const forced = styles.isOverruled(docTextOf(runtime.view.state.doc), target);
  const rows: Node[] = [
    styleRow(
      t("styleScope"),
      selectControl(
        [
          ["all", tf("scopeAll", t(many))],
          ["this", inst ? tf("scopeThis", t(one)) : tf("scopeNoneHere", t(one)), !inst],
        ],
        here ? "this" : "all",
        (v) => {
          if (v === "this") styleScopes.add(kind);
          else styleScopes.delete(kind);
          renderStylesPanel();
        },
      ),
    ),
  ];
  if (here) {
    if (forced) rows.push(el("p", { class: "styles-note" }, [t("overruledHere")]));
    return rows;
  }
  rows.push(
    styleRow(
      t("overrule"),
      toggleControl(forced, (v) =>
        setStyleArgs(target, { [styles.OVERRULE]: v ? "true" : null }),
      ),
    ),
  );
  if (forced) rows.push(el("p", { class: "styles-note" }, [t("overruleOn")]));
  return rows;
}

/** A number input that writes `12pt` / `1.5em`, and clears when emptied. */
function unitControl(
  raw: string | undefined,
  unit: "em" | "pt",
  step: number,
  set: (v: string | null) => void,
): HTMLElement {
  const n = styles.readLength(raw, unit);
  const input = el("input", {
    type: "number",
    step: String(step),
    value: n === null ? "" : String(n),
  }) as HTMLInputElement;
  input.addEventListener("change", () => {
    const v = parseFloat(input.value);
    set(input.value.trim() === "" || !Number.isFinite(v) ? null : `${v}${unit}`);
  });
  return input;
}

/**
 * A text size: a number the writer types, and which of the two units it is in.
 *
 * This was a dropdown of seven percentages — 80, 90, 100, 115, 135, 160, 200 —
 * and a writer wanting 105% could not have it. The report is one sentence,
 * *"the knobs are too coarse"*, and a preset list is the coarsest a control
 * gets: it is not a shortage of options, it is a control that decides for you.
 *
 * The unit is the other half of it, and the half a preset list cannot express
 * at all. `em` is a proportion of whatever the text sits inside and `pt` is a
 * measurement; a style set to 115% is right in a heading and in a footnote,
 * and a title set to 24pt is 24pt wherever it lands. Both are things a writer
 * means, so both are sayable, and switching the unit keeps the *number* rather
 * than silently converting — the same rule `regionHeightControl` follows, for
 * the same reason.
 */
function sizeControl(raw: string | undefined, set: (v: string | null) => void): HTMLElement {
  const read = styles.readTextSize(raw);
  const unit = read?.unit ?? "%";
  const input = el("input", {
    type: "number",
    min: 0,
    step: unit === "%" ? 5 : 0.5,
    value: read == null ? "" : String(read.n),
    placeholder: "—",
    "aria-label": t("knobSize"),
  }) as HTMLInputElement;
  // Emptying the box is how a knob is unset, exactly as `unitControl` does it:
  // absent means *this layer says nothing*, which is not the same as any number.
  input.addEventListener("change", () => {
    const v = parseFloat(input.value);
    set(input.value.trim() === "" || !Number.isFinite(v) ? null : styles.writeTextSize(v, unit));
  });
  const units = selectControl(
    [["%", t("unitEm")], ["pt", t("unitPt")]],
    unit,
    (u) => {
      const n = read?.n ?? (u === "%" ? 100 : 12);
      set(styles.writeTextSize(n, u as "%" | "pt"));
    },
  );
  return el("span", { class: "knob-size" }, [input, units]);
}

/**
 * A typographic family, by name — the families this machine has, and any other.
 *
 * A `<datalist>` and not a `<select>`, because both halves are true: almost
 * everybody wants one of the fonts they have, and a sefer typeset here and
 * printed elsewhere may legitimately name a family this machine has never
 * heard of. A dropdown would make the second impossible; a bare text box would
 * make the first a spelling test.
 */
function fontControl(raw: string | undefined, set: (v: string | null) => void): HTMLElement {
  const id = `font-list-${(fontListSeq += 1)}`;
  const input = el("input", {
    type: "text",
    list: id,
    value: styles.readString(raw) ?? "",
    placeholder: t("notSet"),
    "aria-label": t("knobFont"),
  }) as HTMLInputElement;
  input.addEventListener("change", () =>
    set(input.value.trim() === "" ? null : styles.typstString(input.value.trim())),
  );
  return el("span", { class: "knob-font" }, [
    input,
    el(
      "datalist",
      { id },
      fonts
        .fontOptions(BUNDLED_FONTS, runtime.currentDoc?.assets ?? [], docConfig().font)
        .map((o) => el("option", { value: o.name })),
    ),
  ]);
}

/** One id per datalist on the page: two size rows must not share one list. */
let fontListSeq = 0;

/** A colour, with the means to unset it — a colour picker alone has no "none". */
function clearableColour(
  raw: string | undefined,
  set: (v: string | null) => void,
): HTMLElement {
  const kids: Node[] = [colorControl(styles.readColor(raw) ?? "#000000", (v) => set(styles.typstColor(v)))];
  if (raw !== undefined) {
    kids.push(
      glyphBtn("×", t("none"), () => set(null), "knob-clear"),
    );
  }
  return el("span", { class: "knob-colour" }, kids);
}

/**
 * One knob, as a control.
 *
 * Every one of these has a blank option meaning *not set here*, and that is the
 * whole point of the layer: an element that says nothing about a knob inherits the
 * document's answer, and an element that says `false` overrules a document that
 * said `true`. A checkbox cannot tell those two apart, which is why the booleans
 * are three-way selects and not tick boxes.
 */
export function fieldControl(
  field: styles.Field,
  raw: string | undefined,
  set: (v: string | null) => void,
): HTMLElement {
  // "Not set", and deliberately not "inherit" or "default": the same control
  // appears at three scopes, and the blank means the same thing at each of them —
  // *this layer says nothing, so the one under it answers*.
  const blank = ["", t("notSet")] as [string, string];
  const pick = (options: [string, string][], current: string) =>
    selectControl([blank, ...options], current, (v) => set(v || null));
  switch (field.kind) {
    case "font":
      return fontControl(raw, set);
    case "size-em":
      return sizeControl(raw, set);
    case "size-pt":
    case "length-pt":
      return unitControl(raw, "pt", 1, set);
    case "length-em":
      return unitControl(raw, "em", 0.25, set);
    case "colour":
      return clearableColour(raw, set);
    case "slant":
      return pick([['"normal"', t("slantUpright")], ['"italic"', t("slantItalic")]], (raw ?? "").trim());
    case "weight":
      return pick([['"bold"', t("weightBold")], ['"regular"', t("weightRegular")]], (raw ?? "").trim());
    case "bool":
      return pick([["true", t("valueOn")], ["false", t("valueOff")]], (raw ?? "").trim());
    case "rule":
      // `none` is a value and absence is not: absent means "whatever the document
      // says", and `none` means "no border on this one, whatever the document says".
      return pick([["none", t("valueOff")], ["0.5pt + luma(160)", t("valueOn")]], (raw ?? "").trim());
    case "marker":
      return pick([["[•]", "•"], ["[–]", "–"], ["[◆]", "◆"], ["[▪]", "▪"], ["[✦]", "✦"]], (raw ?? "").trim());
    case "align":
      return pick([["right", t("right")], ["center", t("center")], ["left", t("left")]], (raw ?? "").trim());
    case "numbering":
      return pick(
        [['"1."', "1. 2. 3."], ['"1.1"', "1.1 1.2"], ['"א."', "א. ב. ג."], ['"I."', "I. II."], ['"a."', "a. b. c."]],
        (raw ?? "").trim(),
      );
    case "numbering-levels":
      return levelsControl(raw, set);
    case "count": {
      const input = el("input", { type: "number", step: 1, value: (raw ?? "").trim() }) as HTMLInputElement;
      input.addEventListener("change", () => {
        const v = parseInt(input.value, 10);
        set(Number.isFinite(v) ? String(v) : null);
      });
      return input;
    }
    case "text": {
      const input = el("input", { type: "text", value: styles.readString(raw) ?? "" }) as HTMLInputElement;
      input.addEventListener("change", () =>
        set(input.value.trim() === "" ? null : styles.typstString(input.value)),
      );
      return input;
    }
  }
}

/** Every knob one element of this kind may answer for itself. */
function instanceRows(kind: styles.InstanceCommand, inst: styles.InstanceCall): Node[] {
  return Object.entries(styles.INSTANCE_FIELDS[kind]).map(([key, field]) =>
    styleRow(
      t(field.label),
      fieldControl(field, inst.args.get(key), (v) => setStyleArgsIn(kind, { [key]: v })),
    ),
  );
}

// ------------------------------------------------------ headings, per level
//
// `#הגדרות_כותרות` has taken a per-level array for every knob since it was
// written — `גודל: (1.6em, 1.35em, …)` — and the panel wrote scalars only, so
// every control in the Headings section was "all six levels at once" and the
// layer the inventory asked for first (*"heading styles per level, then per
// instance"*) was reachable only by typing the tuple.

/** The engine's own per-level ramps, so writing level 3 cannot restyle level 2. */
const HEADING_RAMP: Record<string, string[]> = {
  גודל: ["1.6em", "1.35em", "1.18em", "1.06em", "1em", "0.95em"],
  ריווח_לפני: ["1.2em", "1.1em", "1em", "0.9em", "0.8em", "0.8em"],
  ריווח_אחרי: ["0.6em", "0.55em", "0.5em", "0.45em", "0.4em", "0.4em"],
};

/**
 * A ramp as long as there are levels, grown by repeating its last entry.
 *
 * The shipped ramps are six long because the engine's are, and `_cfg_pick`
 * clamps — level 9 has always been drawn at level 6's size. Writing level 9
 * needs a tuple with a ninth slot in it, and padding with the last value is
 * what the engine's own `_hd_set` does, so a tuple written here and one written
 * by hand in Typst say the same thing about levels nobody touched.
 */
function rampFor(key: string): string[] {
  const base = HEADING_RAMP[key] ?? [HEADING_FLAT[key] ?? "none"];
  return Array.from({ length: heads.MAX_LEVEL }, (_, i) => base[Math.min(i, base.length - 1)]);
}

/** And its scalar defaults, for the knobs whose default is one value for all six. */
const HEADING_FLAT: Record<string, string> = {
  משקל: '"bold"',
  צבע: "luma(0)",
  סגנון: '"normal"',
  יישור: "none",
  קו_תחתון: "false",
  קו: "false",
  מספור: "none",
  רברבתי: "false",
  מרווח_אותיות: "0pt",
};

/** The value the Headings section is showing for one knob, at the chosen level. */
function headingArg(key: string): string | undefined {
  const raw = styleArg("headings", key);
  if (headingLevel === 0) return raw;
  const per = styles.readTuple(raw);
  // A scalar applies to every level, so it is what this level shows.
  return per ? per[headingLevel - 1] : raw;
}

/** Write one knob, at the chosen level or at all of them. */
function setHeadingArg(key: string, value: string | null) {
  if (headingLevel === 0) {
    setStyleArgs("headings", { [key]: value });
    return;
  }
  const now = styleArg("headings", key);
  // What the levels this write does not mention should keep. A tuple already says;
  // a scalar the writer set says so for every level and must not be thrown away
  // when one level is changed; and absent means the engine's own ramp.
  const fill =
    now !== undefined && styles.readTuple(now) === null
      ? Array<string>(heads.MAX_LEVEL).fill(now)
      : rampFor(key);
  const v = value ?? fill[headingLevel - 1] ?? "none";
  setStyleArgs("headings", { [key]: styles.withTier(now, headingLevel, v, fill) });
}

/** Which level the Headings section is editing. */
function headingLevelRow(): Node {
  return styleRow(
    t("headingLevel"),
    selectControl(
      [
        ["0", t("everyLevel")],
        // Every level the editor can write, which is nine. Six was the count of
        // *named* heading commands and it had leaked into the styling: levels 7
        // to 9 were real in the outline, in the numbering, in `#תוכן` and in the
        // indent ramp on the page, and this dropdown was the surface saying they
        // did not exist. The engine's `_hd_levels` moved with it, so each of the
        // three now has a door of its own rather than inheriting level 6's.
        ...(Array.from({ length: heads.MAX_LEVEL }, (_, i) => [
          String(i + 1),
          tf("oneLevel", String(i + 1)),
        ]) as [string, string][]),
      ],
      String(headingLevel),
      (v) => {
        headingLevel = parseInt(v, 10) || 0;
        renderStylesPanel();
      },
    ),
  );
}

function toggleControl(current: boolean, onPick: (v: boolean) => void): HTMLElement {
  const input = el("input", { type: "checkbox", ...(current ? { checked: "checked" } : {}) });
  input.addEventListener("change", () => onPick(input.checked));
  return input;
}

function colorControl(current: string, onPick: (v: string) => void): HTMLElement {
  const input = el("input", { type: "color", value: current });
  input.addEventListener("change", () => onPick(input.value));
  return input;
}

/**
 * Styles › Notes — the tiered apparatus, per tier.
 *
 * `#הגדרות_הערות` has always accepted per-tier size, slant, colour, indent,
 * numbering scheme and label prefix, plus the gap between entries. All of it,
 * and **none of it reachable except by typing the command**. This writes the
 * same line a writer would type by hand, which is the constraint that keeps the
 * panel from drifting away from the engine: there is no second representation
 * of a note style anywhere, only this call in the document.
 *
 * Three tiers, because a fourth is rarer than the width it would cost, and any
 * tier is still reachable by typing — the panel preserves every argument it does
 * not understand, including entries past the third.
 */
function noteStyleRows(): Node[] {
  const rows: Node[] = [];
  // Engine defaults, so filling in a gap in a short tuple restyles nothing.
  const D = {
    גודל: ["1em", "0.9em", "0.82em"],
    סגנון: ['"normal"', '"italic"', '"italic"'],
    צבע: ["luma(0)", "luma(55)", "luma(85)"],
    הזחה: ["0em", "1.4em", "2.8em"],
    מספור: ['"א"', '"1"', '"a"'],
  };
  const tierOf = (key: keyof typeof D, tier: number): string | undefined =>
    styles.readTuple(styleArg("notes", key))?.[tier - 1];
  const set = (key: keyof typeof D, tier: number, value: string) =>
    setStyleArgs("notes", { [key]: styles.withTier(styleArg("notes", key), tier, value, D[key]) });

  for (const tier of [1, 2, 3]) {
    rows.push(el("h4", { class: "style-tier" }, [tf("noteTier", String(tier))]));
    rows.push(
      styleRow(
        t("noteTierNumbering"),
        selectControl(
          [
            ["", t("noteNumberingRunning")],
            ['"א"', "א ב ג"],
            ['"1"', "1 2 3"],
            ['"a"', "a b c"],
            ['"i"', "i ii iii"],
            ['"*"', "* † ‡"],
          ],
          tierOf("מספור", tier) ?? "",
          (v) =>
            v
              ? set("מספור", tier, v)
              : setStyleArgs("notes", { מספור: null }),
        ),
      ),
    );
    rows.push(
      styleRow(
        t("noteTierSize"),
        selectControl(
          [["1em", "100%"], ["0.9em", "90%"], ["0.82em", "82%"], ["0.75em", "75%"]],
          tierOf("גודל", tier) ?? D["גודל"][tier - 1],
          (v) => set("גודל", tier, v),
        ),
      ),
    );
    rows.push(
      styleRow(
        t("noteTierStyle"),
        selectControl(
          [['"normal"', t("styleNormal")], ['"italic"', t("styleItalic")]],
          tierOf("סגנון", tier) ?? D["סגנון"][tier - 1],
          (v) => set("סגנון", tier, v),
        ),
      ),
    );
    rows.push(
      styleRow(
        t("noteTierIndent"),
        selectControl(
          [["0em", "0"], ["0.7em", "0.7em"], ["1.4em", "1.4em"], ["2.1em", "2.1em"]],
          tierOf("הזחה", tier) ?? D["הזחה"][tier - 1],
          (v) => set("הזחה", tier, v),
        ),
      ),
    );
    rows.push(
      styleRow(
        t("noteTierColor"),
        colorControl(styles.readColor(tierOf("צבע", tier)) ?? "#000000", (v) =>
          set("צבע", tier, styles.typstColor(v)),
        ),
      ),
    );
  }
  return rows;
}

/**
 * Styles › One look for every note — the layer the six apparatuses share.
 *
 * The report is *"footnotes and endnotes should share a default style, and
 * either should be easy to change on its own"*, and the half that was actually
 * missing is the sharing: each apparatus shipped its own size, slant, colour
 * and gap, so the two apparatuses a sefer most often has looked different from
 * each other by default and "make the notes smaller" was six edits. Endnotes
 * were worse than that — they had no ink knobs at all, so there was no *own*
 * to change either.
 *
 * Writes `#הגדרות_טקסט_הערות`, which the engine consults **under** each
 * apparatus's own config: a knob the writer set on the apparatus wins, and one
 * they did not is answered here. Which is what makes "shared, and still
 * changeable" mean something rather than being an order of precedence nobody
 * can see.
 */
/**
 * Styles › Endnotes — the back matter's numbering, and its ink.
 *
 * The five shared knobs plus the one thing that is only an endnote's: the
 * numbering scheme. That scheme is why the section matters even beyond the
 * report — a sefer with footnotes at the foot *and* endnotes at the back marked
 * every note in both apparatuses `1`, so a reader met two different `1` on one
 * page with nothing to tell them apart.
 */
function endnoteStyleRows(): Node[] {
  return [
    styleRow(
      t("noteTierNumbering"),
      selectControl(
        [
          ["", t("default")],
          ['"1"', "1 2 3"],
          ['"א"', "א ב ג"],
          ['"a"', "a b c"],
          ['"i"', "i ii iii"],
          ['"*"', "* † ‡"],
        ],
        (styleArg("endnotes", "מספור") ?? "").trim(),
        (v) => setStyleArgs("endnotes", { מספור: v || null }),
      ),
    ),
    // The word above the section — the writer's own, or none at all.
    //
    // *"It should be the writer's choice: their own word, or nothing at all,
    // with no leftover gap where it was."* Both halves are here: an empty box
    // is `none`, and the engine keeps the heading, the rule above it and the
    // space below it inside one condition so that nothing is left behind.
    styleRow(
      t("endnoteHeading"),
      fieldControl(
        { kind: "text", label: "endnoteHeading" },
        styleArg("endnotes", "כותרת"),
        (v) => setStyleArgs("endnotes", { כותרת: v ?? "none" }),
      ),
    ),
    // On its own page, or running on from the end of the body.
    styleRow(
      t("endnoteFreshPage"),
      fieldControl(
        { kind: "bool", label: "endnoteFreshPage" },
        styleArg("endnotes", "עמוד_חדש"),
        (v) => setStyleArgs("endnotes", { עמוד_חדש: v }),
      ),
    ),
    ...Object.entries(styles.SHARED_NOTE_FIELDS).map(([key, field]) =>
      styleRow(
        t(field.label),
        fieldControl(field, styleArg("endnotes", key), (v) =>
          setStyleArgs("endnotes", { [key]: v }),
        ),
      ),
    ),
  ];
}

function sharedNoteRows(): Node[] {
  return Object.entries(styles.SHARED_NOTE_FIELDS).map(([key, field]) =>
    styleRow(
      t(field.label),
      fieldControl(field, styleArg("noteText", key), (v) =>
        setStyleArgs("noteText", { [key]: v }),
      ),
    ),
  );
}

/**
 * Which of the shared knobs this apparatus is answering for itself.
 *
 * The visible half of the same rule. An apparatus section that has written one
 * of the five says so, by name — otherwise the shared control appears to do
 * nothing for that apparatus and there is nothing on the screen to say why.
 */
function overridingShared(kind: styles.SectionCommand): Node[] {
  const mine = Object.keys(styles.SHARED_NOTE_FIELDS).filter(
    (key) => styleArg(kind, key) !== undefined,
  );
  if (!mine.length) return [];
  const named = mine.map((k) => t(styles.SHARED_NOTE_FIELDS[k].label)).join(", ");
  return [el("p", { class: "styles-note style-overriding" }, [`${t("styleOverriding")}: ${named}`])];
}

/**
 * Styles › My styles — one row per style the document defines.
 *
 * The complaint was *"there is one edit-styles button that opens an editor for
 * every style at once"*, and the fix is not a smaller dialog: it is that a
 * style is edited **from where you see it**. So each row carries the three
 * things a style has — its name, the chord that applies it, and the way into
 * its formatting — and the chord is captured through exactly the same
 * `captureShortcut` the keys drawer uses, because a style is an action and
 * there is one way to bind an action.
 */
function myStyleRows(): Node[] {
  const own = styles.findCustomStyles(docTextNow());
  if (!own.length) return [el("p", { class: "styles-note" }, [t("styleNoneYet")])];
  const kb = keybindings();
  return own.map((st) => {
    const id = styles.styleActionId(st.name);
    const chord = kb[id] ?? "";
    // `hintFor` and not `readable`: under vim or Emacs none of these chords is
    // live, and a row printing `Ctrl+Alt+1` there would be naming a key that
    // does something else. `prohibitions.test.mjs` holds the whole application
    // to this, and a new surface is exactly what it is holding it for.
    const key = el("button", { class: "sc-key", title: t("styleKeyLabel") }, [
      hintFor(id, kb) || "—",
    ]) as HTMLButtonElement;
    key.addEventListener("click", () => captureShortcut(id, key));
    const kids: Node[] = [key];
    if (chord) {
      // The same `×` the keys drawer has, and for the same reason: capture can
      // only assign, so without this the only way off a chord is the reset that
      // discards every custom binding in the application.
      kids.push(
        glyphBtn("×", t("none"), () => {
          settings.keybindings = { ...(settings.keybindings || {}), [id]: "" };
          saveSettings();
          stylesWiring().reconfigureShortcuts();
          renderStylesPanel();
        }, "knob-clear"),
      );
    }
    kids.push(iconBtn("✎", tf("editStyleTitle", st.name), () => stylesWiring().openStyleEditor(st.name)));
    return styleRow(st.name, el("span", { class: "style-mine-row" }, kids));
  });
}

/**
 * A height and the unit it is written in, as one control.
 *
 * `cm` and `%` are not two spellings of one number. A centimetre is a
 * measurement somebody took off a printed page; a percentage is a proportion
 * that survives the sefer moving from A4 to A5, which is the only reason the
 * engine learned to resolve one. Offering the unit beside the number is what
 * makes that a choice rather than a fact about which was implemented first.
 */
function regionHeightControl(
  current: string | undefined,
  onChange: (value: string) => void,
): HTMLElement {
  const read = styles.readRegionHeight(current);
  const unit = read?.unit ?? "cm";
  const input = el("input", {
    type: "number",
    min: 0,
    // A percentage and a centimetre live on different scales, and a `max` of 12
    // on a percentage would cap the apparatus at a tenth of the page.
    max: unit === "%" ? 60 : 12,
    step: unit === "%" ? 1 : 0.1,
    value: read == null ? "" : String(read.n),
    placeholder: "—",
  }) as HTMLInputElement;
  const commit = (n: number, u: string) => {
    if (!Number.isFinite(n) || n < 0) return;
    onChange(`${n}${u}`);
  };
  input.addEventListener("change", () => commit(parseFloat(input.value), unit));
  const units = selectControl(
    [["cm", t("unitCm")], ["%", t("unitPercent")]],
    unit,
    // Switching the unit keeps the number, not the size: 2cm becoming 2% is a
    // different region and the writer can see that it is. Converting silently
    // would move page geometry from a control that says it changes a unit.
    (u) => commit(read?.n ?? (u === "%" ? 10 : 1.5), u),
  );
  return el("span", { class: "region-height" }, [input, units]);
}

/**
 * Styles › Fixed regions — the heights of the page-foot bands.
 *
 * The one styling control that moves page geometry rather than ink: the engine
 * reserves the foot of every page from exactly this tuple, so a number typed
 * here shortens the text area by the same amount. That is why it is a number and
 * not a slider — a sefer's apparatus is 1.5cm because somebody measured a page,
 * not because they dragged something until it looked right.
 *
 * Off (`גבהים` absent) is the honest default and stays reachable: each band then
 * takes the height its notes need, which is what you want until you are
 * type-setting facing pages that have to line up.
 *
 * **Any number of regions**, which is what the engine has always offered:
 * `#מדף_א…ז` is seven tiers and the prelude reserves a slot for every entry of
 * the tuple. This panel showed three, hard-coded, with a comment explaining that
 * a document with more would keep them — true, and no help at all to the writer
 * who wanted a fourth and had no way to ask for one. The cap was never in the
 * engine; it was in the loop.
 */
function bandStyleRows(): Node[] {
  const heights = styles.readTuple(styleArg("bands", "גבהים"));
  const on = heights !== null;
  const rows: Node[] = [
    styleRow(
      t("bandsFixed"),
      toggleControl(on, (v) =>
        setStyleArgs("bands", { גבהים: v ? styles.typstTuple(["1.5cm", "1cm"]) : null }),
      ),
    ),
  ];
  if (!on || !heights) return rows;
  heights.forEach((h, i) => {
    const tier = i + 1;
    rows.push(
      styleRow(
        tf("bandHeight", String(tier)),
        el("span", { class: "region-row" }, [
          regionHeightControl(h, (value) =>
            setStyleArgs("bands", {
              גבהים: styles.withTier(styleArg("bands", "גבהים"), tier, value, [
                "1.5cm",
                "1cm",
                "1cm",
              ]),
            }),
          ),
          el(
            "button",
            {
              class: "region-drop",
              title: t("regionRemove"),
              "aria-label": t("regionRemove"),
              onClick: () =>
                setStyleArgs("bands", {
                  גבהים: styles.withoutTier(styleArg("bands", "גבהים"), tier),
                }),
            },
            ["×"],
          ),
        ]),
      ),
    );
  });
  // Seven, because `מדף_א…ז` is seven commands: past that a region would exist
  // with no marker able to put a note in it, which is a control that does
  // nothing dressed as one that does something.
  if (heights.length < 7) {
    rows.push(
      styleRow(
        "",
        el(
          "button",
          {
            class: "region-add",
            onClick: () =>
              setStyleArgs("bands", {
                גבהים: styles.typstTuple([...heights, "1cm"]),
              }),
          },
          ["+ " + t("regionAdd")],
        ),
      ),
    );
  }
  rows.push(...markerRows("bands"));
  return rows;
}

/**
 * Styles › Parallel streams — the named peer apparatuses at the page foot.
 *
 * `#הערה_זרם("מקורות")` is a whole second page-foot apparatus that the product
 * has shipped for as long as the bands and never once offered a control for.
 * Where the bands are *tiers* — ordered layers, ב a note on א — these are
 * *peers*: a peirush, a mareh mekomos and a nuschaos band, each numbered on its
 * own, stacked or set side by side, and each pinned to a region of its own
 * height if you want the page geometry fixed.
 *
 * Keyed by name rather than by position, because that is what a stream is. Which
 * also means adding one here is adding a name, and the marker that fills it is
 * `#הערה_זרם` with that same name — written for the writer by the chooser's
 * "several parallel streams" card.
 */
function streamStyleRows(): Node[] {
  const heights = styles.readDict(styleArg("streams", "גבהים"));
  const layout = styles.readString(styleArg("streams", "פריסה")) ?? "מוערם";
  const rows: Node[] = [
    styleRow(
      t("streamLayout"),
      selectControl(
        [["מוערם", t("streamStacked")], ["צד", t("streamSideBySide")]],
        layout,
        (v) => setStyleArgs("streams", { פריסה: v === "מוערם" ? null : styles.typstString(v) }),
      ),
    ),
    styleRow(
      t("streamsFixed"),
      toggleControl(!!heights && heights.length > 0, (v) =>
        setStyleArgs("streams", {
          גבהים: v
            ? styles.typstDict([
                ["ביאור", "10%"],
                ["מקורות", "6%"],
              ])
            : null,
        }),
      ),
    ),
  ];
  if (!heights) return rows;
  for (const [name, value] of heights) {
    const rename = el("input", { type: "text", value: name, class: "stream-name" }) as HTMLInputElement;
    rename.addEventListener("change", () => {
      const to = rename.value.trim();
      // An empty name is not a stream, and two streams with one name are one
      // stream with its notes silently merged. Neither is worth writing to the
      // document, so the control snaps back rather than pretending it took.
      if (!to || to === name || heights.some(([k]) => k === to)) {
        rename.value = name;
        return;
      }
      setStyleArgs("streams", {
        גבהים: styles.renameDictKey(styleArg("streams", "גבהים"), name, to),
        // The order list and the titles are keyed by the same name. Renaming in
        // one and not the others leaves a stream that is ordered and titled
        // under a name nothing writes into any more — the region prints empty
        // and nothing says why.
        זרמים: renamedInTuple(styleArg("streams", "זרמים"), name, to),
        כותרות: styles.renameDictKey(styleArg("streams", "כותרות"), name, to),
        מספור: styles.renameDictKey(styleArg("streams", "מספור"), name, to),
      });
    });
    rows.push(
      styleRow(
        "",
        el("span", { class: "region-row" }, [
          rename,
          regionHeightControl(value, (v) =>
            setStyleArgs("streams", {
              גבהים: styles.withDictKey(styleArg("streams", "גבהים"), name, v),
            }),
          ),
          el(
            "button",
            {
              class: "region-drop",
              title: t("regionRemove"),
              "aria-label": t("regionRemove"),
              onClick: () =>
                setStyleArgs("streams", {
                  גבהים: styles.withDictKey(styleArg("streams", "גבהים"), name, null),
                }),
            },
            ["×"],
          ),
        ]),
      ),
    );
  }
  rows.push(
    styleRow(
      "",
      el(
        "button",
        {
          class: "region-add",
          onClick: () => {
            // A name nobody has used yet. `זרם 3` beside `זרם 3` would be one
            // stream, so it counts up until it is free.
            let n = heights.length + 1;
            while (heights.some(([k]) => k === tf("streamDefaultName", String(n)))) n++;
            setStyleArgs("streams", {
              גבהים: styles.withDictKey(
                styleArg("streams", "גבהים"),
                tf("streamDefaultName", String(n)),
                "6%",
              ),
            });
          },
        },
        ["+ " + t("streamAdd")],
      ),
    ),
  );
  rows.push(...markerRows("streams"));
  return rows;
}

// ------------------------------------------------------------ Styles › marks
//
// The mark register — the styling and collection layer behind `#ציון`, `#סימן`,
// `#פסוק` and the rest of them.
//
// This section used to write one command with the class keyed inside it:
// `#הגדרות_סימונים(גודל: ("סימן": 1.6em))`. Every styled command has a door
// named for it now, and this writes that instead — `#הגדרות_סימן(גודל: 1.6em)`,
// which is what a writer setting how simanim look would type, and reads in the
// document as a sentence about simanim rather than a class name buried in a
// call about marks in general.
//
// Two things follow from the door, and both are the point of it:
//
//   · **The knobs are the class's.** `_mk_set` stops the compile on a knob its
//     class has no answer for. The old spelling did not — it stored a fill on a
//     gemara reference and never read it — so this section offered fourteen
//     controls whatever the class was, half of them doing nothing for most of
//     them. `marks.knobsOf` is the split, held against the prelude.
//   · **The parts are reachable.** A siman prints four things and a pasuk two,
//     and `#הגדרות_פסוק(מקור: (גודל: 1.2em))` could be reached only by typing
//     it. The part chooser sits under the class chooser and the same knob rows
//     sit under that.
//
// `כפה` goes through `scopeRows`, which reads the same door, so the overrule is
// this class's rather than every class's — which is what a writer pressing it
// inside a section headed *siman* means by it.

/** Which mark class the *default* layer is being edited for. */
let markClass: string = marks.STYLED_CLASSES[0];

/** Which piece of it; "" = the command as a whole. */
let markPart = "";

/** The door this section is reading and writing: `#הגדרות_<class>`. */
function markTarget(): styles.StyleTarget {
  return styles.markDoor(markClass);
}

/** The knob rows to offer, which depend on the class and on the part. */
function markKnobs(): readonly string[] {
  if (markPart === "") return marks.knobsOf(markClass);
  // A part is drawn inside its command's own look, so what it can carry is a
  // text look and nothing else — a part of a callout does not draw a second
  // box. Plus the invented words, where the part has any.
  const text = (marks.PART_TEXT[markClass] ?? []).includes(markPart) ? ["טקסט"] : [];
  return [...marks.TEXT_KNOBS, ...text];
}

/** The value the Marks section is showing for one knob. */
function markArg(key: string): string | undefined {
  if (markPart === "") return styleArg(markTarget(), key);
  const dict = styles.readDict(styleArg(markTarget(), markPart));
  return dict?.find(([k]) => k === key)?.[1];
}

/** Write one knob, on the class or on the part of it. */
function setMarkArg(key: string, value: string | null) {
  if (markPart === "") {
    setStyleArgs(markTarget(), { [key]: value });
    return;
  }
  setStyleArgs(markTarget(), {
    [markPart]: styles.withDictKey(styleArg(markTarget(), markPart), key, value),
  });
}

function markClassRow(): Node {
  return styleRow(
    t("markClass"),
    selectControl(
      marks.STYLED_CLASSES.map((c) => [c, t("markClass." + c)] as [string, string]),
      markClass,
      (v) => {
        markClass = v;
        // A part belongs to the class that draws it, so it cannot survive the
        // class changing: `מקור` under `#פסוק` is not `מקור` under anything else.
        markPart = "";
        renderStylesPanel();
      },
    ),
  );
}

/** The part chooser, for the classes that draw more than one thing. */
function markPartRow(): Node | null {
  const parts = marks.CLASS_PARTS[markClass];
  if (!parts || parts.length === 0) return null;
  return styleRow(
    t("markPart"),
    selectControl(
      [
        ["", t("wholeCommand")],
        ...(parts.map((p) => [p, t("markPart." + markClass + "." + p)]) as [string, string][]),
      ],
      markPart,
      (v) => {
        markPart = v;
        renderStylesPanel();
      },
    ),
  );
}

/**
 * The class's own styling, plus the one button that prints the collection.
 *
 * The button is the point of the whole mechanism being reachable: *"there should
 * be a way to gather all of these, to make a list at the end"*. Without it the
 * collection exists and the only way to see it is to know the command's name.
 * It is offered per class, because a list of everything is not a list.
 */
/**
 * Styles › Tiers in the flow — `#הגדרות_מדורגות`.
 *
 * The in-flow apparatus: `#מדור_א` under the text, `#מדור_ב` under that, printed
 * where they are written rather than at the foot of the page. Every knob it has
 * — per-tier numbering, size, slant, weight, colour, and the rules and gaps
 * between the bands — has been in the engine since the apparatus was, and none
 * of it was reachable except by typing the command.
 *
 * This is the same complaint that produced the fixed regions and the streams
 * sections, and this file said so about this very command in a comment in
 * `styles.ts` — *a fourth configuration with no panel section of its own* —
 * which is a finding written down and left where it was found.
 */
/**
 * The rows for one apparatus's marker — its number, wherever that prints.
 *
 * A separate decision from the note's own look, and it had none at all: the
 * note sits at the foot of the page in its band and the number sits in the
 * middle of a sentence somebody is reading. A peirush set small and grey wants
 * its markers legible, and until this there was no way to ask.
 *
 * Written as a dictionary under one key, so an apparatus that gains a knob
 * gains it here and in the prelude and nowhere else.
 */
function markerRows(kind: styles.SectionCommand): Node[] {
  const read = (key: string) =>
    styles.readDict(styleArg(kind, "סימן"))?.find(([k]) => k === key)?.[1];
  const set = (key: string, v: string | null) =>
    setStyleArgs(kind, { סימן: styles.withDictKey(styleArg(kind, "סימן"), key, v) });
  return [
    el("h4", { class: "style-tier" }, [t("apparatusMarker")]),
    styleRow(
      t("noteTierSize"),
      selectControl(
        [["0.8em", "80%"], ["0.9em", "90%"], ["1em", "100%"], ["1.2em", "120%"]],
        read("גודל") ?? "1em",
        (v) => set("גודל", v),
      ),
    ),
    styleRow(
      t("noteTierStyle"),
      selectControl(
        [['"normal"', t("styleNormal")], ['"italic"', t("styleItalic")]],
        read("סגנון") ?? '"normal"',
        (v) => set("סגנון", v),
      ),
    ),
    styleRow(
      t("knobWeight"),
      selectControl(
        [['"regular"', t("weightRegular")], ['"bold"', t("weightBold")]],
        read("משקל") ?? '"regular"',
        (v) => set("משקל", v),
      ),
    ),
    styleRow(
      t("noteTierColor"),
      colorControl(styles.readColor(read("צבע")) ?? "#000000", (v) =>
        set("צבע", styles.typstColor(v)),
      ),
    ),
  ];
}
function tierStyleRows(): Node[] {
  const rows: Node[] = [];
  // Engine defaults, so filling in a gap in a short tuple restyles nothing.
  const D = {
    גודל: ["1em", "0.9em", "0.82em"],
    סגנון: ['"normal"', '"italic"', '"italic"'],
    משקל: ['"regular"', '"regular"', '"regular"'],
    צבע: ["luma(0)", "luma(55)", "luma(85)"],
    מספור: ['"א"', '"1"', '"a"'],
  };
  const tierOf = (key: keyof typeof D, tier: number): string | undefined =>
    styles.readTuple(styleArg("tiers", key))?.[tier - 1];
  const set = (key: keyof typeof D, tier: number, value: string) =>
    setStyleArgs("tiers", { [key]: styles.withTier(styleArg("tiers", key), tier, value, D[key]) });

  for (const tier of [1, 2, 3]) {
    rows.push(el("h4", { class: "style-tier" }, [tf("tierTier", String(tier))]));
    rows.push(
      styleRow(
        t("noteTierNumbering"),
        selectControl(
          [
            ['"א"', "א ב ג"],
            ['"1"', "1 2 3"],
            ['"a"', "a b c"],
            ['"i"', "i ii iii"],
            ['"*"', "* † ‡"],
          ],
          tierOf("מספור", tier) ?? D["מספור"][tier - 1],
          (v) => set("מספור", tier, v),
        ),
      ),
    );
    rows.push(
      styleRow(
        t("noteTierSize"),
        selectControl(
          [["1em", "100%"], ["0.9em", "90%"], ["0.82em", "82%"], ["0.75em", "75%"]],
          tierOf("גודל", tier) ?? D["גודל"][tier - 1],
          (v) => set("גודל", tier, v),
        ),
      ),
    );
    rows.push(
      styleRow(
        t("noteTierStyle"),
        selectControl(
          [['"normal"', t("styleNormal")], ['"italic"', t("styleItalic")]],
          tierOf("סגנון", tier) ?? D["סגנון"][tier - 1],
          (v) => set("סגנון", tier, v),
        ),
      ),
    );
    rows.push(
      styleRow(
        t("knobWeight"),
        selectControl(
          [['"regular"', t("weightRegular")], ['"bold"', t("weightBold")]],
          tierOf("משקל", tier) ?? D["משקל"][tier - 1],
          (v) => set("משקל", tier, v),
        ),
      ),
    );
    rows.push(
      styleRow(
        t("noteTierColor"),
        colorControl(styles.readColor(tierOf("צבע", tier)) ?? "#000000", (v) =>
          set("צבע", tier, styles.typstColor(v)),
        ),
      ),
    );
  }
  rows.push(...markerRows("tiers"));
  return rows;
}

/**
 * Styles › The side column — `#הגדרות_הערות_צד`.
 *
 * Flat rather than per tier: a side column is one apparatus, and `#הערת_ימין`
 * and `#הערת_שמאל` are two sides of it rather than two depths.
 *
 * The first two rows move page geometry and the rest move ink. The ratio is the
 * main column's width against the note column's, so lowering it narrows the
 * text the reader is reading — the same kind of control as the bands' heights,
 * and offered on the same terms rather than hidden because it is consequential.
 */
function sidenoteStyleRows(): Node[] {
  const em = (key: string, fallback: string, label: string) =>
    styleRow(
      t(label),
      selectControl(
        [["0.4em", "0.4em"], ["0.6em", "0.6em"], ["1em", "1em"], ["1.2em", "1.2em"], ["1.6em", "1.6em"]],
        styleArg("sidenotes", key) ?? fallback,
        (v) => setStyleArgs("sidenotes", { [key]: v }),
      ),
    );
  return [
    styleRow(
      t("sidenoteRatio"),
      selectControl(
        [["1", "1 : 1"], ["1.5", "3 : 2"], ["2", "2 : 1"], ["3", "3 : 1"], ["4", "4 : 1"]],
        styleArg("sidenotes", "יחס") ?? "2",
        (v) => setStyleArgs("sidenotes", { יחס: v }),
      ),
    ),
    em("מרווח", "1.2em", "sidenoteGutter"),
    em("ריווח", "0.6em", "sidenoteGap"),
    styleRow(
      t("noteTierSize"),
      selectControl(
        [["0.7em", "70%"], ["0.78em", "78%"], ["0.85em", "85%"], ["1em", "100%"]],
        styleArg("sidenotes", "גודל") ?? "0.78em",
        (v) => setStyleArgs("sidenotes", { גודל: v }),
      ),
    ),
    styleRow(
      t("noteTierStyle"),
      selectControl(
        [['"normal"', t("styleNormal")], ['"italic"', t("styleItalic")]],
        styleArg("sidenotes", "סגנון") ?? '"normal"',
        (v) => setStyleArgs("sidenotes", { סגנון: v }),
      ),
    ),
    styleRow(
      t("knobWeight"),
      selectControl(
        [['"regular"', t("weightRegular")], ['"bold"', t("weightBold")]],
        styleArg("sidenotes", "משקל") ?? '"regular"',
        (v) => setStyleArgs("sidenotes", { משקל: v }),
      ),
    ),
    styleRow(
      t("noteTierColor"),
      colorControl(styles.readColor(styleArg("sidenotes", "צבע")) ?? "#414141", (v) =>
        setStyleArgs("sidenotes", { צבע: styles.typstColor(v) }),
      ),
    ),
    ...markerRows("sidenotes"),
  ];
}

/**
 * The control for each knob this section can offer.
 *
 * `styles.INSTANCE_FIELDS.marks` is the authority for everything a *mark* takes,
 * and it is fenced against `_mk_own_keys` — so `טקסט` cannot live there: it is a
 * part's key and no mark carries it.
 */
const MARK_FIELDS: Readonly<Record<string, styles.Field>> = {
  ...styles.INSTANCE_FIELDS.marks,
  טקסט: { kind: "text", label: "knobText" },
  // A rule's thickness, which no *mark* carries either: `#קו_מפריד` takes no
  // arguments at all, so it has a class and no per-instance layer.
  עובי: { kind: "length-pt", label: "knobThickness" },
};

function markStyleRows(): Node[] {
  const rows: Node[] = [markClassRow()];
  const part = markPartRow();
  if (part) rows.push(part);
  const offered = markKnobs();
  for (const key of offered) {
    // `פטור` and `ברשימה` belong to one mark and to nothing else: a class that
    // exempts itself from its own styling is a class with no styling, and one
    // that leaves itself out of its own list is a list of nothing. They are not
    // in `knobsOf` for that reason, and this says so rather than relying on it.
    if (key === "פטור" || key === "ברשימה") continue;
    const field = MARK_FIELDS[key];
    if (!field) continue;
    rows.push(
      styleRow(t(field.label), fieldControl(field, markArg(key), (v) => setMarkArg(key, v))),
    );
  }
  // The list button is about the *class*, not about a piece of it, and only the
  // classes the register collects have a list to print.
  if (markPart === "" && marks.MARK_CLASSES.includes(markClass)) {
    rows.push(
      styleRow(
        "",
        el(
          "button",
          {
            class: "note-use",
            // The command name is translated on the way in by `insertionAt`; the
            // *class* is an argument value and is not, so it is written in the
            // document's own language here. The engine reads either spelling —
            // this is about what the writer finds in their file afterwards.
            onClick: () =>
              insertSnippet(
                `#רשימת_סימונים(${typstString(
                  docLang() === "en" ? (COMMAND_EN[markClass] ?? markClass) : markClass,
                )})\n`,
              ),
          },
          ["+ " + t("markInsertList")],
        ),
      ),
    );
  }
  return rows;
}

/** Rename one entry of a `("א", "ב")` order tuple, leaving the order alone. */
function renamedInTuple(src: string | undefined, from: string, to: string): string | null {
  const items = styles.readTuple(src);
  if (!items || !items.length) return null;
  return styles.typstTuple(
    items.map((s) => (styles.readString(s) === from ? styles.typstString(to) : s)),
  );
}

export function renderStylesPanel() {
  const box = document.getElementById("styles-body");
  if (!box) return;

  // --- presets ---
  const presets = el("div", { class: "style-presets" },
    Object.keys(SKINS).map((name) =>
      el("button", { class: "style-preset", onClick: () => stylesWiring().applySkin(name) }, [t("skin." + name)]),
    ),
  );

  // --- headings (in-document) ---
  const headInstance = scopedInstance("headings");
  const hNumbering = styles.readString(headingArg("מספור")) ?? "";
  const hRule = styles.readBool(headingArg("קו")) ?? false;
  const hUnderline = styles.readBool(headingArg("קו_תחתון")) ?? false;
  const hSmallcaps = styles.readBool(headingArg("רברבתי")) ?? false;
  const hColor = styles.readColor(headingArg("צבע")) ?? "#000000";
  const hAlign = (headingArg("יישור") ?? "none").trim();
  const hSize = (headingArg("גודל") ?? "").trim();

  const headings = headInstance
    ? instanceRows("headings", headInstance)
    : [
        headingLevelRow(),
        // The knob the per-level model exists for, and the one the panel never
        // offered: a six-level ramp is a ramp of sizes before it is anything else.
        styleRow(
          t("knobSize"),
          fieldControl({ kind: "size-em", label: "knobSize" }, hSize || undefined, (v) =>
            setHeadingArg("גודל", v),
          ),
        ),
        styleRow(t("headingNumbering"), selectControl(
          [["", t("none")], ["1.", "1. 2. 3."], ["1.1", "1.1 1.2"], ["א.", "א. ב. ג."], ["I.", "I. II."]],
          hNumbering,
          (v) => setHeadingArg("מספור", v ? styles.typstString(v) : null),
        )),
        styleRow(t("headingAlign"), selectControl(
          [["none", t("inherit")], ["right", t("right")], ["center", t("center")], ["left", t("left")]],
          hAlign,
          (v) => setHeadingArg("יישור", v === "none" ? null : v),
        )),
        styleRow(t("headingColor"), colorControl(hColor, (v) =>
          setHeadingArg("צבע", v === "#000000" ? null : styles.typstColor(v)))),
        styleRow(t("headingRule"), toggleControl(hRule, (v) =>
          setHeadingArg("קו", v ? "true" : null))),
        styleRow(t("headingUnderline"), toggleControl(hUnderline, (v) =>
          setHeadingArg("קו_תחתון", v ? "true" : null))),
        styleRow(t("headingSmallcaps"), toggleControl(hSmallcaps, (v) =>
          setHeadingArg("רברבתי", v ? "true" : null))),
      ];

  // --- lists (in-document) ---
  const lMarker = styleArg("lists", "סמן") ?? "";
  const lTight = styles.readBool(styleArg("lists", "הידוק")) ?? false;
  const lIndent = styles.readLength(styleArg("lists", "הזחה"), "em") ?? 1;

  const indentInput = el("input", { type: "number", min: 0, max: 5, step: 0.25, value: String(lIndent) });
  indentInput.addEventListener("change", () => {
    const v = parseFloat(indentInput.value);
    setStyleArgs("lists", { "הזחה": Number.isFinite(v) && v !== 1 ? `${v}em` : null });
  });

  const listInstance = scopedInstance("lists");
  const lists = listInstance
    ? instanceRows("lists", listInstance)
    : [
        styleRow(t("listMarker"), selectControl(
          [["", t("default")], ["[•]", "•"], ["[–]", "–"], ["[◆]", "◆"], ["[▪]", "▪"], ["[✦]", "✦"]],
          lMarker,
          (v) => setStyleArgs("lists", { "סמן": v || null }),
        )),
        styleRow(t("listIndent"), indentInput),
        styleRow(t("listTight"), toggleControl(lTight, (v) =>
          setStyleArgs("lists", { "הידוק": v ? "true" : null }))),
        // Per level, because that is how Typst has always read the pattern and
        // how a sefer is actually numbered: digits for the simanim, letters for
        // the se'ifim under them. Written on the document's config rather than
        // on one list, which is where "what does level two look like" belongs.
        styleRow(t("listNumbering"), levelsControl(styleArg("lists", "מספור"), (v) =>
          setStyleArgs("lists", { "מספור": v }))),
        styleRow(t("listStart"), fieldControl(
          { kind: "count", label: "knobStart" },
          styleArg("lists", "התחלה"),
          (v) => setStyleArgs("lists", { "התחלה": v }),
        )),
      ];

  // --- tables (in-document) ---
  const tStripe = styles.readBool(styleArg("tables", "פסים")) ?? false;
  const tHeaderFill = styles.readColor(styleArg("tables", "צבע_כותרת")) ?? "#ebebeb";
  const tInset = styles.readLength(styleArg("tables", "מרווח"), "pt") ?? 8;

  const insetInput = el("input", { type: "number", min: 0, max: 30, step: 1, value: String(tInset) });
  insetInput.addEventListener("change", () => {
    const v = parseFloat(insetInput.value);
    setStyleArgs("tables", { "מרווח": Number.isFinite(v) && v !== 8 ? `${v}pt` : null });
  });

  const tableInstance = scopedInstance("tables");
  const tables = tableInstance
    ? instanceRows("tables", tableInstance)
    : [
        styleRow(t("tableStripes"), toggleControl(tStripe, (v) =>
          setStyleArgs("tables", { "פסים": v ? "true" : null }))),
        styleRow(t("tableHeaderFill"), colorControl(tHeaderFill, (v) =>
          setStyleArgs("tables", { "צבע_כותרת": styles.typstColor(v) }))),
        styleRow(t("tableInset"), insetInput),
        styleRow(t("tableBorder"), toggleControl(
          (styleArg("tables", "קו") ?? "x") !== "none",
          (v) => setStyleArgs("tables", { "קו": v ? null : "none" }),
        )),
      ];

  // The three apparatus sections keep their per-tier and per-stream controls for
  // the document's default, and swap to the one note's own when the writer scopes
  // them there: a note has no tiers of its own and a tier selector on one note is
  // a control for a distinction that does not exist at that scope.
  const DEFAULT_STYLE_ROWS: Record<string, () => Node[]> = {
    notes: noteStyleRows,
    bands: bandStyleRows,
    streams: streamStyleRows,
    tiers: tierStyleRows,
    sidenotes: sidenoteStyleRows,
    marks: markStyleRows,
  };

  box.replaceChildren(
    panelHead("styles-panel", "stylesTitle"),
    el("p", { class: "styles-lede" }, [t("stylesLede")]),

    el("h3", {}, [t("stylePresets")]),
    el("p", { class: "styles-note" }, [t("presetWarning")]),
    presets,
    ...(pendingUndo()
      ? [el("button", { class: "style-undo", onClick: () => { stylesWiring().undoSkin(); renderStylesPanel(); } }, [
          "↶ " + tf("undoPreset", t("skin." + pendingUndo()!.name)),
        ])]
      : []),

    el("h3", {}, [t("stylePage")]),
    el("p", { class: "styles-note" }, [t("pageStyleNote")]),

    // Ten sections, from the table in `panelviews.ts` rather than written out
    // here. The rows are still built here — see `styleSection` for what moving
    // them would cost and why it has not been paid — but *which* sections there
    // are, in what order, with which note and which scope selector, is data a
    // test can hold.
    ...panelviews.STYLE_SECTIONS.map((section) => {
      const inst = scopedInstance(section.kind as styles.StyleCommand);
      const scope = section.scope
        ? scopeRows(section.kind as styles.StyleCommand, section.scope[0], section.scope[1])
        : [];
      const rows =
        section.kind === "noteText"
          ? sharedNoteRows()
          : section.kind === "endnotes"
          ? endnoteStyleRows()
          : section.kind === "mine"
          ? myStyleRows()
          : section.kind === "headings"
          ? headings
          : section.kind === "lists"
            ? lists
            : section.kind === "tables"
              ? tables
              : section.kind === "destinations"
                ? stylesWiring().destinationRows()
                : inst
                  ? instanceRows(section.kind as styles.InstanceCommand, inst)
                  : DEFAULT_STYLE_ROWS[section.kind]();
      // Every apparatus that reads the shared note style says so when it is
      // not: `NOTE_KINDS` is the six the engine's `_nt_under` covers.
      const overriding = (styles.NOTE_KINDS as readonly string[]).includes(section.kind)
        ? overridingShared(section.kind as styles.SectionCommand)
        : [];
      return panelviews.styleSection(section, scope, [...overriding, ...rows]);
    }),
    el("p", { class: "styles-note" }, [t("documentStyleNote")]),
  );
}
/** The ribbon's level picker opens the panel on a heading level directly. */
export function openStylesFor(level: number): void {
  headingLevel = level;
  openStyles();
}

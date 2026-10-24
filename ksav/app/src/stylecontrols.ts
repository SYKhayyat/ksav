// ---------------------------------------------------------------- style controls
//
// The knob family the styles panel, the writer's own styles and the
// destinations borrow: one control per `Field.kind`, every one of them with a
// blank option meaning *not set here* — the whole point of the layer, which is
// why the booleans are three-way selects and not tick boxes.
//
// This file refuses to answer for: which knobs exist (`styles.ts`'s tables),
// which section shows them (`stylespanel.ts`), and the three-layer model that
// decides where a write lands.

import { el, glyphBtn } from "./dom";
import { t } from "./i18n";
import * as styles from "./styles";
import * as runtime from "./runtime";
import * as fonts from "./fonts";
import { BUNDLED_FONTS, docConfig } from "./settings";

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
export function levelsControl(raw: string | undefined, set: (v: string | null) => void): HTMLElement {
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

/** A number input that writes `12pt` / `1.5em`, and clears when emptied. */
export function unitControl(
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
export function sizeControl(raw: string | undefined, set: (v: string | null) => void): HTMLElement {
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
export function fontControl(raw: string | undefined, set: (v: string | null) => void): HTMLElement {
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
export function clearableColour(
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

export function toggleControl(current: boolean, onPick: (v: boolean) => void): HTMLElement {
  const input = el("input", { type: "checkbox", ...(current ? { checked: "checked" } : {}) });
  input.addEventListener("change", () => onPick(input.checked));
  return input;
}

export function colorControl(current: string, onPick: (v: string) => void): HTMLElement {
  const input = el("input", { type: "color", value: current });
  input.addEventListener("change", () => onPick(input.value));
  return input;
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
export function regionHeightControl(
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

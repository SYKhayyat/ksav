// ---------------------------------------------------------------- formulas
//
// Typst's own maths notation, which is compact and readable but which nobody
// knows on their first day. The buttons write the constructs; the box is plain
// text, so anyone who does know the notation can simply type.

import { el, checkField, fieldRow } from "./dom";
import { t } from "./i18n";
import { closeMenus } from "./runtime";
import { insertSnippet } from "./insert";
import { scheduleCompile } from "./compile";
import { openModal } from "./formmodal";
import { typstString } from "./typst-escape";

const MATH_BITS: [string, string][] = [
  ["a/b", "(a)/(b)"],
  ["xⁿ", "^( )"],
  ["xₙ", "_( )"],
  ["√", "sqrt( )"],
  ["∑", "sum_(i=1)^n "],
  ["∏", "product_(i=1)^n "],
  ["∫", "integral_a^b "],
  ["≤", " <= "],
  ["≥", " >= "],
  ["≠", " != "],
  ["±", " plus.minus "],
  ["→", " arrow.r "],
  ["∞", "infinity"],
  ["α", "alpha"],
  ["π", "pi"],
  ["( )", "lr(( ))"],
  ["מטריצה", "mat(1, 2; 3, 4)"],
  ["מקרים", "cases(a &\"if\" x > 0, b &\"else\")"],
];

export function openFormula() {
  closeMenus();
  const src = el("textarea", { class: "set-textarea", rows: 3, placeholder: "x^2 + y^2 = z^2" }, [
  ]) as HTMLTextAreaElement;
  const display = checkField(true);
  const numbered = checkField();

  const insertAt = (snippet: string) => {
    const s = src.selectionStart ?? src.value.length;
    const e = src.selectionEnd ?? s;
    src.value = src.value.slice(0, s) + snippet + src.value.slice(e);
    src.focus();
    src.setSelectionRange(s + snippet.length, s + snippet.length);
  };

  openModal(t("formulaTitle"), t("formulaLede"), [
    src,
    el(
      "div",
      { class: "math-bits" },
      MATH_BITS.map(([label, snip]) =>
        el("button", { class: "math-bit", title: snip, onClick: () => insertAt(snip) }, [label]),
      ),
    ),
    fieldRow(t("formulaDisplay"), display),
    fieldRow(t("formulaNumbered"), numbered),
  ], () => {
    const body = src.value.trim();
    if (!body) return;
    const q = typstString(body);
    insertSnippet(
      display.checked
        ? `#נוסחה(${q}${numbered.checked ? ", ממוספרת: true" : ""})`
        : `#נוסחה_בשורה(${q})`,
    );
    scheduleCompile();
  });
}
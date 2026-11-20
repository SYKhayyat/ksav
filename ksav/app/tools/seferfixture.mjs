// The sefer this repository measures itself against.
//
// `bench-structure.mjs` and the suite's own fence (#219) have to measure the
// **same** document or the numbers in the README describe something nobody
// checks. It lives here rather than in either of them for that reason: a
// generator edited inside the benchmark would move the number the fence holds
// without the fence noticing.

/**
 * A sefer, in the shape Ksav documents are actually written in.
 *
 * Not a wall of one construct: headings, prose, notes, citations and the
 * occasional list and table, because the cost of a scan is in the *nodes* and a
 * document of nothing but table cells has a node profile no writer produces.
 */
export function sefer(sections) {
  const out = [];
  for (let i = 0; i < sections; i++) {
    out.push(`#כותרת1[פרק ${i}]`, "");
    out.push(`#כותרת2[סימן ${i}]`, "");
    for (let p = 0; p < 6; p++) {
      out.push(
        `דברי הפוסקים בענין זה, ועיין ב#הדגשה[שולחן ערוך] סימן ${p}, ` +
          `ובמה שכתב שם (רש"י) בד"ה כך.#הערה[עיין שם באריכות, ${i}.${p}]`,
        "",
      );
    }
    out.push("#רשימה(", `  פריט[ראשית ${i}],`, `  פריט[שנית ${i}],`, ")", "");
    if (i % 5 === 0) out.push(table(3), "");
  }
  return out.join("\n");
}

export function table(rows) {
  const body = Array.from(
    { length: rows },
    (_, r) => `  תא[א${r}], תא[ב${r}], תא[ג${r}],`,
  ).join("\n");
  return `#טבלה(עמודות: 3, פסים: true,\n${body}\n)\n`;
}

/**
 * The size the audit measured at, and the three below it.
 *
 * 810 sections is ~993 pages — the document a posek writes in, and the size the
 * overhead of an entry-level benchmark had been hiding (`#157`, then `#219`).
 */
export const SEFER_810 = sefer(810);

/** A list, for the "asking versus doing" table: one node per item. */
export function list(items) {
  const body = Array.from({ length: items }, (_, i) => `  פריט[סעיף ${i}],`).join("\n");
  return `#רשימה(\n${body}\n)\n`;
}

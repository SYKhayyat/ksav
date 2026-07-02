// ============================================================
//  כתָב · Ksav — Hebrew prelude for Typst
// ------------------------------------------------------------
//  Every Hebrew command below is a *real* Typst function.
//  Because Typst itself parses the document, unlimited nesting
//  (a table inside a footnote inside a heading inside a list)
//  works for free — we never re-implement a parser.
// ============================================================

// -------- מעטפת המסמך · document wrapper --------
// The engine injects `#show: מסמך.with(...)` so the whole
// document is wrapped in RTL, Hebrew-aware defaults driven by
// the editor's font / size / margin settings.
#let מסמך(
  גופן: "Frank Ruhl Hofshi",
  גודל: 12pt,
  שוליים: 2.5cm,
  כיוון: rtl,
  שפה: "he",
  יישור: true,
  body,
) = {
  set text(font: גופן, size: גודל, lang: שפה, dir: כיוון)
  set page(margin: שוליים, numbering: "1")
  set par(justify: יישור, leading: 0.75em, spacing: 1.15em)
  set heading(numbering: none)
  body
}

// -------- עיצוב פנימי · inline styles --------
#let הדגשה(body) = strong(body)          // bold
#let נטוי(body) = emph(body)             // italic
#let קו_תחתון(body) = underline(body)    // underline
#let קו_חוצה(body) = strike(body)        // strikethrough
#let גדול(body) = text(size: 1.4em, body)
#let קטן(body) = text(size: 0.85em, body)
#let צבע(גוון, body) = text(fill: גוון, body)
#let גופן_שונה(שם, body) = text(font: שם, body)

// -------- כותרות · headings (unlimited depth) --------
#let כותרת(body, רמה: 1) = heading(level: רמה, body)
#let כותרת1(body) = heading(level: 1, body)
#let כותרת2(body) = heading(level: 2, body)
#let כותרת3(body) = heading(level: 3, body)
#let כותרת4(body) = heading(level: 4, body)
#let כותרת5(body) = heading(level: 5, body)
#let כותרת6(body) = heading(level: 6, body)
#let שער(body) = align(center, text(size: 2em, weight: "bold", body))
#let תת_שער(body) = align(center, text(size: 1.2em, fill: luma(110), body))

// -------- יישור · alignment --------
#let מרכז(body) = align(center, body)
#let ימין(body) = align(right, body)
#let שמאל(body) = align(left, body)

// -------- רשימות · lists (nest freely) --------
#let רשימה(..פריטים) = list(..פריטים)     // bulleted
#let ממוספרת(..פריטים) = enum(..פריטים)   // numbered
#let פריט(body) = body                     // list item

// -------- הערות שוליים · footnotes --------
#let הערה(body) = footnote(body)

// -------- טבלאות · tables --------
#let טבלה(עמודות: 2, ..תאים) = table(
  columns: עמודות,
  stroke: 0.5pt + luma(150),
  inset: 8pt,
  ..תאים,
)
#let תא(body) = body
#let כותרת_תא(body) = table.cell(fill: luma(240), strong(body))

// -------- שונות · misc --------
#let קו_מפריד = line(length: 100%, stroke: 0.5pt + luma(180))
#let רווח(מידה: 1em) = v(מידה)

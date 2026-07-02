// ============================================================
//  כתָב · Ksav — Hebrew/English prelude for Typst
// ------------------------------------------------------------
//  Every command below is a *real* Typst function. Each has a
//  Hebrew name and a collision-free English alias, so the same
//  document can be written in either language. Because Typst
//  itself parses the document, unlimited nesting (a table inside
//  a footnote inside a heading inside a list) works for free.
// ============================================================

// ============================================================
//  מעטפת המסמך · document wrapper
//  The engine injects `#show: מסמך.with(...)` so editor settings
//  (font / size / margin / direction / numbering) become real
//  Typst set-rules around the whole document.
// ============================================================
#let מסמך(
  גופן: "Frank Ruhl Hofshi",
  גודל: 12pt,
  שוליים: 2.5cm,
  כיוון: rtl,
  שפה: "he",
  יישור: true,
  מספור: true,
  מספור_עברי: false,
  נייר: "a4",
  כותרת_עליונה: none,
  כותרת_תחתונה: none,
  ריווח_שורות: 0.75em,
  טורים: 1,
  body,
) = {
  let np = if מספור_עברי { "א" } else { "1" }
  set text(font: גופן, size: גודל, lang: שפה, dir: כיוון)
  set page(
    paper: נייר,
    margin: שוליים,
    numbering: if מספור { np } else { none },
    header: if כותרת_עליונה != none {
      align(center, text(size: 0.85em, fill: luma(100), כותרת_עליונה))
    } else { auto },
    footer: if כותרת_תחתונה != none {
      align(center, text(size: 0.85em, fill: luma(100), כותרת_תחתונה))
    } else { auto },
  )
  set par(justify: יישור, leading: ריווח_שורות, spacing: 1.2em)
  set heading(numbering: none)
  set list(indent: 1em)
  set enum(indent: 1em, numbering: np + ".")
  show heading: set block(spacing: 1.1em)
  if טורים > 1 {
    columns(טורים, body)
  } else {
    body
  }
}
#let document = מסמך

// ============================================================
//  עיצוב פנימי · inline text styles
// ============================================================
#let הדגשה(body) = strong(body)
#let נטוי(body) = emph(body)
#let קו_תחתון(body) = underline(body)
#let קו_חוצה(body) = strike(body)
#let סימון(body) = highlight(body)
#let עילי(body) = super(body)
#let תחתי(body) = sub(body)
#let רברבתי(body) = smallcaps(body)
#let גדול(body) = text(size: 1.4em, body)
#let קטן(body) = text(size: 0.85em, body)
#let גודל_גופן(מידה, body) = text(size: מידה, body)
#let צבע(גוון, body) = text(fill: גוון, body)
#let רקע(גוון, body) = highlight(fill: גוון, body)
#let מרווח_אותיות(מידה, body) = text(tracking: מידה, body)
#let גופן_שונה(שם, body) = text(font: שם, body)
#let קוד(body) = box(
  fill: luma(240), inset: (x: 3pt), outset: (y: 3pt), radius: 2pt,
  text(font: ("Cascadia Mono", "Consolas", "monospace"), body),
)

// English aliases (collision-free with Typst builtins)
#let bold = הדגשה
#let italic = נטוי
#let uline = קו_תחתון
#let sthrough = קו_חוצה
#let mark = סימון
#let sup = עילי
#let sub_ = תחתי
#let scaps = רברבתי
#let big = גדול
#let tiny = קטן
#let fsize = גודל_גופן
#let color = צבע
#let bg = רקע
#let track = מרווח_אותיות
#let usefont = גופן_שונה
#let mono = קוד

// ============================================================
//  כותרות · headings (unlimited depth)
// ============================================================
#let כותרת(body, רמה: 1) = heading(level: רמה, body)
#let כותרת1(body) = heading(level: 1, body)
#let כותרת2(body) = heading(level: 2, body)
#let כותרת3(body) = heading(level: 3, body)
#let כותרת4(body) = heading(level: 4, body)
#let כותרת5(body) = heading(level: 5, body)
#let כותרת6(body) = heading(level: 6, body)
#let שער(body) = align(center, text(size: 2em, weight: "bold", body))
#let תת_שער(body) = align(center, text(size: 1.2em, fill: luma(110), body))

#let hlevel(body, level: 1) = heading(level: level, body)
#let h1 = כותרת1
#let h2 = כותרת2
#let h3 = כותרת3
#let h4 = כותרת4
#let h5 = כותרת5
#let h6 = כותרת6
#let title = שער
#let subtitle = תת_שער

// ============================================================
//  יישור · alignment
// ============================================================
#let מרכז(body) = align(center, body)
#let ימין(body) = align(right, body)
#let שמאל(body) = align(left, body)
#let center_ = מרכז
#let right_ = ימין
#let left_ = שמאל

// ============================================================
//  כיווניות · directionality (mixed RTL/LTR)
// ============================================================
#let מימין_לשמאל(body) = text(dir: rtl, body)
#let משמאל_לימין(body) = text(dir: ltr, body)
#let rtl_ = מימין_לשמאל
#let ltr_ = משמאל_לימין

// ============================================================
//  רשימות · lists (nest freely)
// ============================================================
#let רשימה(..פריטים) = list(..פריטים)
#let ממוספרת(..פריטים) = enum(..פריטים)
#let ממוספרת_עברית(..פריטים) = enum(numbering: "א.", ..פריטים)  // Hebrew-lettered
#let פריט(body) = body
#let רשימת_הגדרות(..זוגות) = terms(..זוגות)
#let הגדרה(מונח, פירוש) = terms.item(מונח, פירוש)

#let bullets = רשימה
#let numbered = ממוספרת
#let henum = ממוספרת_עברית
#let item = פריט
#let deflist = רשימת_הגדרות
#let defitem = הגדרה

// תוכן · table of contents (from the document's headings)
#let תוכן(כותרת: [תוכן העניינים]) = outline(title: כותרת)
#let toc = תוכן

// ============================================================
//  הערות שוליים · footnotes
// ============================================================
#let הערה(body) = footnote(body)
#let fnote = הערה

// ---- הערות סיום · endnotes (collected in named streams) ----
// #הערתסיום[...] places a marker and stores the note; #הערות_בסוף renders the
// collected notes for a stream. Multiple streams give separate note sections
// (e.g. one for content notes, one for mekoros). Notes may themselves contain
// footnotes or other endnotes — they render when the stream is dumped.
#let _ksav_en = state("ksav-endnotes", (:))
#let הערתסיום(body, זרם: "הערות") = {
  _ksav_en.update(d => {
    let a = d.at(זרם, default: ())
    d.insert(זרם, a + (body,))
    d
  })
  context super[#(_ksav_en.get().at(זרם, default: ()).len())]
}
#let הערות_בסוף(זרם: "הערות", כותרת: none) = context {
  let items = _ksav_en.final().at(זרם, default: ())
  if items.len() > 0 {
    v(1em)
    line(length: 100%, stroke: 0.5pt + luma(150))
    if כותרת != none { heading(outlined: false, numbering: none, כותרת) }
    enum(..items)
  }
}
#let endnote = הערתסיום
#let endnotes = הערות_בסוף

// ---- הערות צד · side-column footnotes ----
// A substantial notes column beside the text (not a thin margin). Wrap a
// section in #עם_הערות_צד[...]; inside it, #הערת_צד[...] drops a numbered marker
// and its note flows, numbered to match, in the side column. Each block
// numbers independently.
#let _ksav_sn = state("ksav-sidenotes", ())
#let _ksav_snc = counter("ksav-sidenote")
#let הערת_גיליון(body) = {
  _ksav_snc.step()
  context super(_ksav_snc.display())
  _ksav_sn.update(l => l + (body,))
}
#let עם_הערות_צד(עיקר, יחס: 2) = {
  _ksav_sn.update(())
  _ksav_snc.update(0)
  grid(
    columns: (יחס * 1fr, 1fr),
    column-gutter: 1.2em,
    עיקר,
    {
      set text(size: 0.78em, fill: luma(65))
      context {
        for (i, n) in _ksav_sn.get().enumerate() {
          block(spacing: 0.6em)[#super[#(i + 1)] #n]
        }
      }
    },
  )
}
#let sidenote = הערת_גיליון
#let sidenotes = עם_הערות_צד

// ---- הפניות · cross-references (auto-numbered, auto-updating) ----
// #סמן("שם") marks a target; #הפניה("שם") prints its number. Numbers follow
// document order and update automatically when targets are added/reordered.
#let _ksav_xref = state("ksav-xref", ())
#let סמן(שם) = _ksav_xref.update(l => l + (שם,))
#let הפניה(שם) = context {
  let l = _ksav_xref.final()
  let idx = l.position(x => x == שם)
  if idx == none [?] else [#(idx + 1)]
}
#let anchor = סמן
#let xref = הפניה

// ============================================================
//  טבלאות · tables
// ============================================================
#let טבלה(עמודות: 2, יישור: auto, פסים: false, ..תאים) = {
  set table(fill: (_, row) => if פסים and calc.odd(row) { luma(245) } else { none }) if פסים
  table(
    columns: עמודות,
    align: יישור,
    stroke: 0.5pt + luma(160),
    inset: 8pt,
    ..תאים,
  )
}
#let תא(body) = body
#let כותרת_תא(body) = table.cell(fill: luma(235), strong(body))
#let מיזוג(מספר, body) = table.cell(colspan: מספר, body)

#let mktable = טבלה
#let cell = תא
#let headcell = כותרת_תא
#let colspan_ = מיזוג

// ============================================================
//  בלוקים · blocks, quotes, callouts, boxes
// ============================================================
#let ציטוט(body) = quote(block: true, body)
#let הערת_צד(body, גוון: rgb("#eff6ff"), קו: rgb("#2563eb")) = block(
  fill: גוון,
  inset: 12pt,
  radius: 6pt,
  width: 100%,
  stroke: (right: 3pt + קו),
  body,
)
#let תיבה(body) = block(stroke: 0.75pt + luma(150), inset: 12pt, radius: 6pt, width: 100%, body)
#let אזהרה(body) = הערת_צד(body, גוון: rgb("#fef2f2"), קו: rgb("#dc2626"))
#let הצלחה(body) = הערת_צד(body, גוון: rgb("#f0fdf4"), קו: rgb("#16a34a"))
#let מקור(body) = text(size: 0.85em, style: "italic", fill: luma(90), body)

#let blockquote = ציטוט
#let callout = הערת_צד
#let framebox = תיבה
#let warnbox = אזהרה
#let okbox = הצלחה
#let cite_ = מקור

// ============================================================
//  פריסה · layout helpers
// ============================================================
#let קו_מפריד = line(length: 100%, stroke: 0.5pt + luma(180))
#let מרווח(מידה: 1em) = v(מידה)
#let רווח_אופקי(מידה: 1em) = h(מידה)
#let מעבר_עמוד = pagebreak(weak: true)
#let מעבר_שורה = linebreak()
#let מעבר_טור = colbreak()
#let הזחה(body) = pad(right: 1.5em, body)
#let טורים_בלוק(מספר, body) = columns(מספר, body)
#let תמונה(נתיב, רוחב: auto) = image(נתיב, width: רוחב)

// חסר — a fill-in blank line (form field), e.g. for a kesubah or letter
#let חסר(רוחב: 3em) = box(width: רוחב, stroke: (bottom: 0.6pt + luma(60)))
#let blank = חסר

#let hrule = קו_מפריד
#let vspace = מרווח
#let hspace = רווח_אופקי
#let pbreak = מעבר_עמוד
#let lbreak = מעבר_שורה
#let cbreak = מעבר_טור
#let indent_ = הזחה
#let cols = טורים_בלוק
#let img = תמונה

// ============================================================
//  תורני · Torah / yeshiva writing
//  First-class support for divrei Torah, chiddushim and sefarim:
//  siman/seif structure, verse & source references, and mekoros
//  footnotes — so a bochur has no reason to reach for anything else.
// ============================================================

// סימן — a numbered chapter heading, "סימן א׳ — כותרת"
#let סימן(מספר, כותרת) = heading(level: 1, [סימן #מספר#if כותרת != none [ — #כותרת]])

// סעיף — a lettered/numbered halachic paragraph: "א. גוף ההלכה"
#let סעיף(אות, body) = block(spacing: 0.85em, {
  strong([#אות. ])
  body
})

// אות — an inline bold source/paragraph marker, e.g. #אות[ב]
#let אות(סימן) = strong([#סימן. ])

// פסוק — an emphasized quotation followed by its reference in parentheses
#let פסוק(מקור, body) = [#emph[#body] #text(size: 0.82em, fill: luma(95))[(#מקור)]]

// מראה_מקום — a source citation set as a footnote (the mekoros apparatus)
#let מראה_מקום(body) = footnote(text(size: 0.92em, body))

// ציון — an inline reference in small gray text, e.g. (רמב״ם הל׳ תפילין)
#let ציון(body) = text(size: 0.85em, fill: luma(95), [(#body)])

// דיבור_המתחיל — a bolded lemma opening a comment, "ד״ה ..."
#let דיבור_המתחיל(body) = strong(body)

// גמרא — format a Talmudic reference, e.g. #גמרא("ברכות", "ב.")
#let גמרא(מסכת, דף) = text(style: "italic", [#מסכת #דף])

// עם_פירוש — main text with commentary alongside it on the page (parallel
// columns, RTL: body on the right, commentary in the outer/left column). Not
// true wrap-around tzuras hadaf (Typst can't reflow around growing blocks), but
// real facing commentary.
#let עם_פירוש(עיקר, פירוש, יחס: 1.7) = grid(
  columns: (יחס * 1fr, 1fr),
  column-gutter: 1.2em,
  עיקר,
  text(size: 0.82em, fill: luma(75), פירוש),
)
#let commentary = עם_פירוש

#let siman = סימן
#let seif = סעיף
#let osource = אות
#let verse = פסוק
#let sourcenote = מראה_מקום
#let refmark = ציון
#let dh = דיבור_המתחיל
#let gemara = גמרא

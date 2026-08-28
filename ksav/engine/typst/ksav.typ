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
//  שמות פרמטרים באנגלית · English parameter names
// ------------------------------------------------------------
//  An English alias for every command is only half of "the same document can
//  be written in either language". The parameters were still Hebrew, so an
//  English table read `#mktable(עמודות: 3, פסים: true)` — which is not English
//  and is not something anyone would type.
//
//  So an English alias is not a plain binding but a wrapper that renames its
//  named arguments through the table below and forwards everything else
//  untouched. Positional arguments, trailing content blocks and Typst's own
//  argument errors all pass straight through. A name with no entry is passed as
//  written, so the Hebrew parameter names keep working on the English alias too
//  — the point is to accept both, not to swap one exclusion for another.
//
//  `extra` exists because two Hebrew parameters share one English word: טורים
//  (text columns) and עמודות (table columns) are both `columns`. Rather than
//  invent a second English word for one of them, the two functions that need
//  the other reading say so at their own alias.
// ============================================================
#let _en_params = (
  // page and text
  size: "גודל", font: "גופן", colour: "צבע", color: "צבע", align: "יישור",
  page_width: "רוחב_עמוד", page_height: "גובה_עמוד",
  weight: "משקל", paper: "נייר", margin: "שוליים", lang: "שפה", dir: "כיוון",
  thickness: "עובי",
  // Which structural level a count starts again at — one word for the notes
  // and for the numbers a siman carries, because it is one mechanism.
  restart_by: "אפס_לפי",
  shift: "הזזה",
  // The words a note is **on** — what an entry head prints as its dibbur
  // hamaschil — and whether the note may be the one that moves when its region
  // has to give something up. Neither is a look; both are set on one note.
  quote: "ציטוט",
  floats: "צף",
  landscape: "לרוחב", watermark: "סימן_מים", header: "כותרת_עליונה",
  footer: "כותרת_תחתונה", numbering: "מספור", hebrew_numbering: "מספור_עברי",
  // `justify` is **not** here, and `align` is. Both used to be, both mapping to
  // יישור — so `#headings_config(justify: center)` silently set heading
  // *alignment*, because a flat table applied to every alias cannot tell the two
  // readings of one Hebrew word apart. Everywhere but מסמך, יישור is an
  // alignment and nothing else, so `justify` belongs to מסמך's own `extra` and
  // nowhere else.
  //
  // On מסמך the two readings are now one parameter that takes either — `true`
  // for justified, an edge name for ranged — so `align` and `justify` both land
  // on יישור there and both mean what they read as. That is the reason the two
  // aliases can coexist at all: they are no longer two settings, they are two
  // English words for one control. See `_doc_align`.
  leading: "ריווח_שורות", para_spacing: "ריווח_פסקאות",
  first_indent: "הזחה_ראשונה", columns: "עמודות", notes_region: "אזור_הערות",
  // structure
  level: "רמה", title: "כותרת", titles: "כותרות", names: "שמות", by: "מאת",
  // How many heading levels enter #תוכן. One command uses it and it is here
  // rather than in that command's `extra` because it is an ordinary word: the
  // next thing that takes a depth should get the same Hebrew for it.
  depth: "עומק",
  caption: "כיתוב", width: "רוחב", ratio: "יחס", amount: "מידה",
  indent: "הזחה", body_indent: "הזחת_גוף", max_indent: "הזחה_מרבית", tight: "הידוק", marker: "סמן",
  // `start` is Typst's own name for it and always worked; there was no name for
  // it here, so a list could not begin at 0 without leaving the language.
  start: "התחלה",
  style: "סגנון", labels: "תוויות", layout: "פריסה", display: "תצוגה",
  // What a *generated* piece of a command says. A siman prints the word
  // `סימן` and an em dash that no writer typed, and both are its to change:
  // `#הגדרות_סימן(קידומת: (טקסט: "סי׳"))`, or `""` to drop the word entirely.
  // Only pieces whose text the command invents take it; on a piece that prints
  // the writer's own words it is refused, because it would silently do nothing.
  text_: "טקסט",
  heights: "גבהים", frame: "מסגרת", note: "הערה", numbered: "ממוספרת",
  // **A region's own keys, which had no English spelling at all.** `#region`
  // accepted four — placement, height, title, layout — and an English writer had
  // to switch languages for everything that makes a region *do* anything: how a
  // note too tall for it is continued, what it does when it asks for more room
  // than the page has, whether it holds its slot on a page it has nothing on,
  // what an entry's head is made of. Which is most of what a region is for.
  //
  // Ten of them, added as a set. A key here and not there is how the surface got
  // into this state, and `english_commands.rs` now sweeps `_rg_own` so the next
  // one cannot be Hebrew-only.
  //
  // `טורים` is **not** here, and that is deliberate: `columns` is already
  // `עמודות`, a page's columns, and one English word cannot mean two things a
  // writer sets on two different commands. It goes through each command's own
  // `extra`, which is where the banded apparatus has kept it since it had an
  // English name at all.
  spill: "גלישה", overflow: "חריגה", keeps_place: "שומר_מקום",
  shrink_floor: "הקטנה_מזערית", shrink_step: "הקטנה_צעד",
  tracking_amount: "כיווץ_מידה",
  head: "ראש", address_numbering: "מספור_כתובת", first_folio: "דף_ראשון",
  addresses: "כתובות",
  default_spill: "בררת_גלישה", spill_warning: "אזהרת_גלישה",
  new_page: "עמוד_חדש", unit: "יחידה",
  // The row plan of a grid region — the Vilna wrap. `רוחב` and `ערוצים` inside a
  // plan are `width` and `channels`, which are already in this table; these four
  // are the region's own.
  cycle: "מחזור", column_gap: "מרווח_טורים", row_gap: "ריווח_טורים",
  empty: "ריק", leftover: "עודף", clip_mark: "סימן_חיתוך",
  // How a note too tall for its region is continued onto the next page: how
  // far back the cut may look for a sentence break, and whether the continuation
  // carries the note number again.
  seam: "תפר", continued_mark: "סימן_בהמשך",
  // A rounded corner, which a box has and nothing else did until the blocks
  // took looks of their own.
  radius: "רדיוס",
  // notes and streams
  stream: "זרם", streams: "זרמים", channels: "ערוצים", tint: "גוון", rule: "קו",
  kind: "סוג", name: "שם",
  // channels. `placement` and not `place`, which is already מקום — a source
  // reference's page — and would have made one English word mean two things a
  // writer can set on two different commands.
  // `source` is already here, one section down, and it is the same Hebrew word:
  // what a citation points at and what a channel hangs off are both מקור.
  channel: "ערוץ", placement: "מיקום", region: "אזור", height: "גובה",
  // The one switch every `#הגדרות_*` command shares: make the global win over
  // every per-element override. See `_cfg_with`.
  force: "כפה",
  // spacing, in the several senses the prelude distinguishes
  spacing: "ריווח", inset: "מרווח", item_spacing: "ריווח_פריט",
  space_between: "ריווח_בין", space_before: "ריווח_לפני",
  space_after: "ריווח_אחרי", number_spacing: "ריווח_מספור",
  note_spacing: "ריווח_הערות", rule_between: "קו_בין",
  tracking: "מרווח_אותיות", underline: "קו_תחתון", smallcaps: "רברבתי",
  strike: "קו_חוצה",
  // citations and indexes — the seven that had no English spelling at all.
  // Twelve English aliases were plain bindings rather than `_en` wrappers, so
  // their parameters stayed Hebrew: `#sourceref("ב״ב", מקום: "ב.")` is not
  // English and is not something anybody would type, which is the sentence at
  // the top of this table applied to the commands that had escaped it.
  source: "מקור", sub: "תת", place: "מקום", brackets: "סוגריים",
  groups: "קבוצות", chars: "תווים", sort: "מיון",
  // The mark register's two non-style knobs: opt this mark out of its class's
  // styling, and out of its class's list.
  exempt: "פטור", listed: "ברשימה",
  // How a note's number is set wherever it prints. `watermark`, `clip_mark`,
  // `continued_mark` and `refmark` were here and plain `mark` was not — so the
  // apparatus configuration dictionaries that ship a `סימן:` knob took the
  // English writer's argument, stored it under `"mark"`, and no renderer read
  // that key.
  mark: "סימן",
  // named colours
  header_fill: "צבע_כותרת", stripe: "צבע_פס", striped: "פסים",
  insert_colour: "צבע_הוספה", delete_colour: "צבע_מחיקה",
  note_colour: "צבע_הערה",
)

/// Wrap a Hebrew-named command so its parameters may be given in English.
#let _en(f, extra: (:)) = (..a) => {
  let names = _en_params + extra
  let named = (:)
  for (k, v) in a.named() { named.insert(names.at(k, default: k), v) }
  f(..a.pos(), ..named)
}

// ============================================================
//  ערכים באנגלית · English parameter *values*
// ------------------------------------------------------------
//  An English name for every command and an English name for every parameter
//  still left `#streams_config(layout: "צד")` and `#review_config(display:
//  "סופי")` — an English command taking an English parameter and a Hebrew
//  value, because two parameters in this prelude are compared against a fixed
//  set of names rather than used as data.
//
//  There are only two of them, and that is the point: they were invisible
//  precisely because they are two lines in a file of two thousand. Every other
//  value a writer gives is data — a length, a colour, a numbering pattern, a
//  stream's own name — and data belongs to whoever wrote it, in whatever
//  language they wrote it in.
//
//  `יישור_כותרת` had already solved this for itself, in place, with its own
//  `in ("חוץ", "חיצוני", "outside", "outer")`. That is the right behaviour and
//  the wrong shape: a third enum would have needed a third hand-written list.
//  This is the same answer said once.
//
//  Hebrew in, Hebrew out. Nothing here changes what an existing document means.
#let _en_values = (
  // הגדרות_זרמים · פריסה
  stacked: "מוערם",
  side: "צד",
  // ערוץ / אזור · מיקום — where a channel's notes are printed.
  foot: "רגל",
  section: "סוף_מדור",
  document: "סוף",
  // A companion volume — its own sheet and its own page count. See `_ch_places`.
  file: "קובץ",
  // A band above the text, and the edges beside it. `side` is **not** repeated
  // here: it is above, where it has been since a region could lay its channels
  // out side by side, and it is the same word for the same idea — beside. One
  // key, two things that are one thing.
  top: "למעלה",
  outside: "חוץ",
  inside: "פנים",
  right: "ימין",
  left: "שמאל",
  end: "סוף",
  // הגדרות_סקירה · תצוגה
  marks: "סימון",
  marked: "סימון",
  final: "סופי",
  original: "מקורי",
  // הגדרות_סימונים · the mark classes, which are named by their own commands.
  // `#marklist("gemara")` and `#marks_config(size: ("gemara": 0.9em))` are the
  // spellings an English document would use, and a class name is data like any
  // other value here.
  refmark: "ציון",
  gemara: "גמרא",
  dh: "דיבור_המתחיל",
  verse: "פסוק",
  sourceref: "ציון_מקור",
  indexentry: "ערך",
  siman: "סימן",
  sourcenote: "מראה_מקום",
  // ערוץ / אזור · גלישה — thing four's overflow moves, the answer to a note
  // taller than the region it is filed into.
  compress: "דחיסה",
  run_in: "רצף",
  shrink: "הקטנה",
  tighten: "כיווץ_אותיות",
  divide: "חלוקה",
  float: "צף",
  next_page: "עמוד_הבא",
  // The three that always apply and cannot be listed. They are here so that
  // asking for one in English is refused *as that move*, with the sentence
  // explaining why it is an invariant — rather than reported as a move nobody
  // has heard of, which is a worse answer to the same mistake.
  shift: "הזזה",
  cascade: "מפל",
  clamp: "הצמדה",
  // אזור · חריגה — what a region does when it asks for more room than the page
  // under the text has.
  fit: "צמצום",
  refuse: "סירוב",
  // ערוץ / אזור · ראש — what an entry in a collected apparatus says before it
  // says anything of its own, and the addresses among those ingredients.
  number: "מספר",
  tag: "תווית",
  quote: "ציטוט",
  page: "עמוד",
  folio: "דף",
  amud: "אמוד",
  // The words an entry address prints around its numbers — `כתובות`'s keys.
  addresses: "כתובות",
  line: "שורה",
  // אזור · יחידה — what a grid region's columns are kept in register by.
  // `siman` is not repeated: it is above, and it is the same word for the same
  // thing.
  heading: "כותרת",
  tier: "מדור",
  // אזור · ריק — what a cell for a channel with nothing to say in this row does.
  // Holding the place is a parallel-text table; dropping it is the Vilna wrap,
  // where the column that ran out disappears and its neighbours take the width.
  blank: "ריק",
  skip: "דלג",
  // אזור · עודף — where a channel goes when its row plan gave it no column.
  extra_row: "שורה_נוספת",
  extra_column: "טור_נוסף",
  // מסמך · גרשיים — how a Hebrew number carries its marks. Compared against a
  // fixed set everywhere, so an English word that missed the set meant
  // marks-on: `"none"` silently printed gershayim.
  "none": "ללא",
  geresh: "גרש",
  gershayim: "גרשיים",
)

/// One value, said in Hebrew whichever language it arrived in.
#let _val(v) = if type(v) == str { _en_values.at(v, default: v) } else { v }

// Declared here, above everything that asks whether this document is on a grid —
// the apparatus leading, the line address, the region heights in lines. The
// grid block itself is further down with the arithmetic; this is only the
// state, and a state has no dependencies to order it against.
#let _bl_grid = state("ksav-baseline", none)
// The page geometry, which reads nothing but `page` and therefore has no
// ordering constraints of its own — it is here because several things above the
// apparatus now ask about the margins.
#let _pg_margin(key) = {
  // `page(height: auto)` is a real configuration — it is the digital output mode
  // — and `calc.min` of a length and `auto` is an error, not a large number. So
  // the fallback is only computed from the dimensions that are dimensions.
  let fb = if type(page.width) == length and type(page.height) == length {
    (2.5 / 21) * calc.min(page.width, page.height)
  } else if type(page.width) == length {
    (2.5 / 21) * page.width
  } else {
    2.5cm
  }
  let m = page.margin
  if type(m) == dictionary {
    let v = m.at(key, default: auto)
    // A two-sided document names its edges by binding rather than by side, so a
    // left/right question is answered by inside/outside when that is how the
    // page was set up. Which of the two is which depends on the page's parity,
    // and both are wanted here only as *a* bound: they are equal in every
    // document this prelude produces, because `#מסמך` mirrors one pair.
    if v == auto and key in ("left", "right") {
      v = m.at("outside", default: m.at("inside", default: auto))
    }
    if v == auto { v = m.at("rest", default: auto) }
    if v == auto { fb } else { v }
  } else if type(m) == length or type(m) == relative { m } else { fb }
}

// The top of the text block, wanted by the line address as well as by the side
// column — one call to `_pg_margin`, and no reason for it to live low.
#let _pg_text_top() = _pg_margin("top")

// ---- גרשיים · the marks inside a Hebrew number ----
//
// A Hebrew number in a printed sefer carries its own punctuation: a geresh after
// a single letter — א׳ — and gershayim before the last letter of several —
// י״ג. Typst's own `numbering("א", …)` produces the letters and none of the
// marks, and a pattern cannot express them, because the mark goes *inside* the
// number rather than after it. `numbering("א׳", 15)` gives טו׳, which is not a
// thing a sefer prints.
//
// It is invisible until note eleven. Every number up to י is a single letter, so
// the geresh case looks right by accident, and the first two-letter number is
// where it goes wrong — which is why this survived so long in a system whose
// whole point is Hebrew typesetting.
//
// # The letters are built here rather than post-processed
//
// `numbering` returns content and there is no way back to the string, so the
// marks cannot be inserted afterwards. The numeral is built from the values
// instead, which also puts the one rule that matters where it can be seen:
//
// **לשון נקי.** Fifteen is טו and sixteen is טז, never יה or יו, which spell a
// Name. Typst already honours this and so does the table below, and the rule has
// to survive the hundreds: 115 is קטו, not קיה.
#let _hb_hundreds = ((400, "ת"), (300, "ש"), (200, "ר"), (100, "ק"))
#let _hb_units = (
  (90, "צ"), (80, "פ"), (70, "ע"), (60, "ס"), (50, "נ"), (40, "מ"), (30, "ל"),
  (20, "כ"), (10, "י"), (9, "ט"), (8, "ח"), (7, "ז"), (6, "ו"), (5, "ה"),
  (4, "ד"), (3, "ג"), (2, "ב"), (1, "א"),
)

/// The Hebrew numeral for `n`, with no marks.
#let _hb_plain(n) = {
  let out = ""
  let k = n
  while k >= 100 {
    for (v, ch) in _hb_hundreds {
      if k >= v {
        out += ch
        k -= v
        break
      }
    }
  }
  // The two that are spelled out of order, and the reason. Checked on the
  // remainder after the hundreds, so 115 comes out קטו.
  if k == 15 {
    out + "טו"
  } else if k == 16 {
    out + "טז"
  } else {
    while k > 0 {
      for (v, ch) in _hb_units {
        if k >= v {
          out += ch
          k -= v
          break
        }
      }
    }
    out
  }
}

/// The marks, put where a sefer puts them.
///
/// `clusters()` and not `len()`: a Hebrew letter is two bytes, so byte length
/// would call every two-letter number a single letter and put the geresh in the
/// wrong place — on exactly the numbers this exists to fix.
#let _hb_marks(s, mode) = {
  let c = s.clusters()
  if mode == "גרש" or c.len() < 2 {
    s + "׳"
  } else {
    c.slice(0, c.len() - 1).join("") + "״" + c.last()
  }
}

#let _hb_modes = ("ללא", "גרש", "גרשיים")
/// The house style for Hebrew numbers, for the whole sefer.
///
/// `"ללא"` is the default and is what every document written before this got, so
/// nothing already set repaginates.
#let _hb_mode = state("ksav-gershayim", "ללא")

/// `numbering`, with the marks a Hebrew number carries.
///
/// **Not a `context`.** A `context` block inside content that `measure()` reads
/// comes back at almost nothing — the defect that silently disabled every
/// overflow move earlier — and a marker is measured. The mode is passed in by
/// the caller, which is already inside one.
///
/// Falls straight through for a scheme that is not Hebrew letters, and for a
/// pattern taking several numbers: `1.1.1` has no gershayim and neither does
/// `#numbering("א.א", 1, 2)`, whose marks would land between the parts.
#let _hb_num(scheme, mode, ..n) = {
  let nums = n.pos()
  // Said either way, compared in Hebrew: the mode travels from configuration
  // dictionaries that may carry the English spelling.
  let mode = _val(mode)
  let hebrew = type(scheme) == str and (scheme.contains("א") or scheme.contains("׳"))
  if mode == "ללא" or not hebrew or nums.len() != 1 {
    numbering(scheme, ..nums)
  } else {
    _hb_marks(_hb_plain(nums.first()), mode)
  }
}

// ---- שיפוע · the one slant, for commands and for configuration alike ----
//
// `emph` is a *request* for an italic face, and every Hebrew family this engine
// bundles ships none — so Typst hands back the upright face and the slant is
// invisible on paper. `#נטוי` has sheared the frame into a synthetic oblique for
// months and works. **Every other way of asking for a slant did not**, because
// they all went through `text(style: "italic")`, which is the request that comes
// back upright.
//
// Five sites asked that way, and they are not obscure: `_mk_render` carries the
// shipped italics for `#גמרא`, `#פסוק` and `#ציון_מקור`; `_ap_wrap` is every
// banded apparatus; `_fn_wrap` every native footnote tier; `_sn_wrap` the side
// column; and the heading rule slants every level past six. A writer setting
// `#הגדרות_הערות(סגנון: "italic")` got nothing, silently, and a `#גמרא` has
// shipped an italic default that has never once printed.
//
// So the slant is *one* function and both grammars reach it: `#נטוי` is this,
// and so is `סגנון: "italic"` wherever it is written. `emph` stays inside, so a
// family that does carry a real italic still uses it rather than the shear.
//
// The fence is `slanting_commands()` in `lib.rs`, inverted: it used to find the
// commands whose slant would go missing so the writer could be warned about
// them, and it now has to come back **empty**, because a `text(style:)` left
// anywhere in this file is a slant that goes missing again.
#let _ks_skew(body) = context {
  // Only on paper. HTML export is reflowable content where `<em>` is the right,
  // semantic answer and the browser synthesises the oblique itself.
  if target() == "html" {
    emph(body)
  } else {
    // Around each **word**, never around the passage. `skew` lays its content
    // out and shears the frame, and a sheared frame is a block: one box around a
    // whole sentence is an unbreakable slab that jumps to a line of its own, and
    // no box at all breaks the sentence into three paragraphs. Boxing each run
    // of non-space characters leaves every space an ordinary space in the
    // enclosing paragraph, which is what a line break — and justification —
    // needs to be able to happen at.
    show regex("\\S+"): it => box(skew(ax: -12deg, reflow: true, it))
    emph(body)
  }
}

/// Small capitals, drawn rather than requested.
///
/// `smallcaps` asks the font for the `smcp` feature and the six faces this
/// engine bundles have none, so `#הגדרות_כותרות(רברבתי: true)` printed exactly
/// nothing different — the same defect as the slant, one row down the same
/// dictionary, and found the same way.
///
/// So the lower-case letters are drawn as capitals a size smaller, which is what
/// a word processor does when the font cannot answer. `smallcaps` stays on the
/// outside, so a family that *does* carry the feature uses its real one and this
/// changes nothing for it.
///
/// Only Latin letters have a case at all; Hebrew is untouched by construction,
/// which is why this setting is worth having in a Hebrew document in the first
/// place — a sefer's English title page is where it is reached for.
#let _ks_smallcaps(body) = {
  show regex("\\p{Ll}+"): it => text(size: 0.78em, upper(it))
  smallcaps(body)
}

/// A `סגנון` value, applied. Every spelling of the request lands here, and none
/// of them reaches `text(style:)`.
///
/// `"נטוי"` is accepted alongside `"italic"` because it is not an invented word:
/// it is the name of the command this prelude already gives the writer, and a
/// Hebrew document asking for a slant in English was the odd thing. It is not
/// added to `_en_values`, which maps English *to* Hebrew — `text(style:)` would
/// then be handed a Hebrew word by every other caller of `_val`.
#let _ks_style(st, body) = if st in ("italic", "oblique", "נטוי") {
  _ks_skew(body)
} else {
  body
}

// ============================================================
//  גלובלי כברירת מחדל, פרטי כעקיפה · one override model
// ------------------------------------------------------------
//  Every `#הגדרות_*` command sets the default for a KIND of thing — headings,
//  lists, tables, notes, bands, streams. Every element of that kind also accepts
//  those same arguments for itself. Three rules, and they are the same for all of
//  them:
//
//    1. the global sets the default;
//    2. an element's own arguments overrule the global, for that element only;
//    3. `כפה: true` (`force:`) on the global overrules the elements back — one
//       switch that makes the document-wide setting win everywhere, which is what
//       a writer reaches for once a hundred one-off overrides have accumulated
//       and the sefer has to be made uniform again.
//
//  Written once and read by every kind. Nine copies of a two-line merge is nine
//  chances for one of them to resolve the argument the other way, in the one
//  construct nobody thought to check.
//
//  Before this, the global was the only layer that existed. Every element of
//  every kind took its style from the state and from nowhere else, so
//  `#רשימה(סמן: [–])` — the obvious thing to type, and the thing the writer asked
//  for — did not override the marker for that list. It reached Typst's own `list`,
//  which has no `סמן` parameter, and stopped the compile on *"unexpected
//  argument"*. Same for `#הערה(גודל: 1em)`, for `#כותרת1(צבע: red)`, and for six
//  of the eight table knobs.
#let _cfg_with(c, own) = {
  if own == none or own.len() == 0 { c }
  // Rule 3. Read off the global's own dictionary, so the switch travels with the
  // setting it belongs to rather than living in a tenth piece of state.
  else if c.at("כפה", default: false) { c }
  else { let d = c; for (k, v) in own { d.insert(k, v) }; d }
}

// Rule 3's switch is part of the override model itself, not a knob of any one
// kind, so every settings door that validates its arguments admits it whether
// or not its defaults dictionary happens to carry a value for it yet.
#let _cfg_global_keys = ("כפה",)

// ---- the note style every apparatus falls back to ----
//
// Ksav has six note apparatuses — the page-foot footnotes, the endnote section,
// the stacked section bands, the per-page bands, the parallel streams and the
// side column — and each shipped its own size, slant, colour and gap. So *"make
// the notes a little bigger"* was six edits in six sections of the panel, and
// two apparatuses in one sefer looked different for no reason anybody chose.
// The report is about footnotes and endnotes, which are the pair most seforim
// have; the answer has to cover all six or it is the same complaint waiting.
//
// One state, consulted **under** each apparatus's own — a fourth layer below
// `_cfg_with`'s three. The rule is the only one that makes "shared, and still
// changeable" mean anything: a knob the writer set on the apparatus wins, and a
// knob they did not is the shared answer. Which requires knowing what the
// writer set, since a shipped default is indistinguishable from a chosen value
// in a dictionary — so each `#הגדרות_*` records the keys it was actually given,
// under `_מפורש`, and nothing else reads that key.
#let _nt_keys = ("גופן", "גודל", "סגנון", "צבע", "ריווח")
#let _nt_cfg = state("ksav-nt-cfg", (:))
#let הגדרות_טקסט_הערות(..opts) = {
  _nt_cfg.update(c => {
    let d = c
    for (k, v) in opts.named() {
      if not _nt_keys.contains(k) {
        panic("הגדרות_טקסט_הערות: ארגומנט לא מוכר · unrecognised argument: " + k)
      }
      d.insert(k, v)
    }
    d
  })
  // The shared layer says `ריווח` too, and it reaches the footnote area the same
  // way the per-apparatus command does — see the note on `#הגדרות_הערות`, which
  // is also where the reason for the spread is written down. A shared setting
  // that every apparatus reads except the one with a `set` rule behind it would
  // be the same defect one layer down.
  set footnote.entry(..(if "ריווח" in opts.named() { (gap: opts.named().ריווח) } else { (:) }))
}

#let notes_text_config = _en(הגדרות_טקסט_הערות)

/// Record which keys a `#הגדרות_*` call was actually given.
///
/// Appended to rather than replaced: two calls at different points in a sefer
/// each set what they set, and the second must not un-say the first.
#let _nt_explicit(d, named) = {
  let out = d
  let seen = out.at("_מפורש", default: ())
  for (k, v) in named { if not seen.contains(k) { seen.push(k) } }
  out.insert("_מפורש", seen)
  out
}

/// One apparatus's configuration with the shared note style under it.
///
/// Called at the point of *use* rather than at the point of configuration,
/// because both states are read at a location: a `#הגדרות_טקסט_הערות` halfway
/// down a sefer has to reach the notes below it and not the ones above.
#let _nt_under(c) = {
  let shared = _nt_cfg.get()
  if shared.len() == 0 { c } else {
    let explicit = c.at("_מפורש", default: ())
    let d = c
    for (k, v) in shared { if not explicit.contains(k) { d.insert(k, v) } }
    d
  }
}

/// Split an element's named arguments into the ones that override its style and
/// the ones that are not ours.
///
/// `keys` is what **one element** of this kind may overrule. For most kinds that
/// is every knob the global has — every heading knob is a property of a heading,
/// every table knob of a table — and those pass `_xx_defaults.keys()` so a knob
/// added to the defaults is overridable the same day.
///
/// Four kinds pass a shorter list, and the exclusions are the point of writing it
/// down rather than assuming: a knob that belongs to the *arrangement* cannot be
/// answered by a member of it. A band's column count is the band's. A sidenote
/// column's width is the column's, and every note on the page is stacked against
/// the same one. A numbering scheme belongs to the sequence — one note lettered
/// while its neighbours are numbered is not a style, it is a second apparatus.
/// Accepting those per instance would be a control that reads back exactly what
/// the writer typed and changes nothing on the page, which is the whole failure
/// this change exists to end. Outside the list they are refused, by name.
///
/// Everything else is handed on to the Typst element underneath, which is the
/// half that matters: a misspelled knob still stops the compile with Typst's own
/// *"unexpected argument"* naming the argument, instead of being quietly dropped
/// on the floor and leaving the writer to wonder why a control did nothing.
#let _cfg_split(named, keys) = {
  let own = (:)
  let rest = (:)
  for (k, v) in named { if keys.contains(k) { own.insert(k, v) } else { rest.insert(k, v) } }
  (own, rest)
}

/// Stop on a named argument no knob answers to, naming it.
///
/// The kinds with a Typst element underneath — a list, a table, a footnote — hand
/// their strays to it and get Typst's own *"unexpected argument"* for free. The
/// three banded apparatuses have no such element: a banded note is a piece of
/// metadata and a query, and metadata accepts anything. So they say it
/// themselves, rather than accept a misspelled knob and format nothing.
#let _cfg_strict(name, rest) = if rest.len() > 0 {
  panic(name + ": ארגומנט לא מוכר · unrecognised argument: " + rest.keys().join(", "))
}

// The mark register and the alignment reader both sit here — above every
// command rather than beside the block commands they were written for —
// because Typst has no forward references. A `#let` is visible only after its
// own line, so a command defined before `_mk_render` cannot render through it,
// and half the commands that need a look of their own are defined early: the
// banded tiers, the sidenotes, a heading inside a note. The register is the
// authority for what a command looks like, so it belongs ahead of the
// commands, and the block commands that used to sit under it stay where they
// are.

// _doc_align(v) — the alignment half of מסמך's יישור, or `none`.
//
// `none` for `true` and `false`, which are the justify half, and `none` for a
// name that means nothing — an unrecognised alignment falls back to what the
// document already said rather than to an edge nobody chose. Both spellings of
// each edge, and a real Typst alignment passes straight through, so
// `#מסמך(יישור: center)` and `#document(align: "center")` are the same request.
#let _doc_align(v) = {
  if type(v) == alignment { v }
  else if type(v) != str { none }
  else if v in ("ימין", "right") { right }
  else if v in ("מרכז", "אמצע", "center", "centre") { center }
  else if v in ("שמאל", "left") { left }
  else { none }
}

// ============================================================
//  סימונים · the mark register
// ------------------------------------------------------------
//  A semantic mark that nothing ever collects is decoration. `#דיבור_המתחיל`
//  was `strong(body)` and `#ציון` was small grey text in brackets: the only
//  thing separating either from typing the formatting by hand was a name in the
//  source, and a name no surface reads is a comment with syntax.
//
//  So a mark of a class registers itself where it stands, and three things
//  follow at once:
//
//    · `#רשימת_סימונים("גמרא")` prints every mark of that class with the pages
//      it landed on — ONE printer over a class of marks, rather than a bespoke
//      index command per mark, which is what the two `#מפתח_*` commands were;
//    · `#הגדרות_סימונים(סגנון: ("גמרא": "italic"))` styles the whole class;
//    · `#גמרא("ברכות", "ב.", צבע: red)` overrules that for one of them, and
//      `פטור: true` opts one out of the class's styling altogether.
//
//  That is `_cfg_with`'s three-layer model applied to a **set** rather than to a
//  kind: the class is the global, the mark is the instance, and `כפה` on the
//  global overrules both the per-mark settings and the exemptions — because an
//  exemption is exactly one of the hundred one-off overrides that switch exists
//  to sweep up.
//
//  Eight classes, six of them styled here. The other two are styled by whatever
//  they already are — a `#סימן` is a heading and takes heading styles, a
//  `#מראה_מקום` is a footnote and takes the note styles — and giving either a
//  second styling channel would be two authorities for one fact. They register
//  for the collecting and no more.
#let _mk_label = label("ksav-mark")

/// The classes, and the look each one ships with. A class absent from here is
/// collected and printed exactly as its own command draws it.
#let _mk_defaults = (
  "ציון": (גודל: 0.85em, צבע: luma(95), סוגריים: true),
  "גמרא": (סגנון: "italic"),
  "דיבור_המתחיל": (משקל: "bold"),
  "פסוק": (סגנון: "italic"),
  "ציון_מקור": (סגנון: "italic"),
  "ערך": (:),
  // The source note, whose whole complaint was that it *looks exactly like a
  // footnote*. The 0.92em it has always been set at is written here now rather
  // than inline in `מראה_מקום`, so the value a writer sees in the panel is the
  // one the page uses — and every document written before this reads the same,
  // because the number has not changed.
  //
  // It is styled through this register rather than through a channel of its
  // own, and that is the whole reason the earlier answer was *no*: what a mareh
  // makom looks like is one fact, and two commands able to set it is the drift
  // this product keeps paying for. What was wrong was the conclusion, not the
  // rule — a class of marks already has one authority for its look, with a
  // per-instance override and `כפה` to sweep the one-offs back, and a source
  // note is a class of marks. It belongs *in* that authority, not beside it.
  //
  // The size compounds with the footnote's own, deliberately: this is the
  // difference between a mareh makom and the footnotes around it, which is what
  // was asked for, and it stays that difference when the note styles change.
  "מראה_מקום": (גודל: 0.92em),
  // The structure of a sefer, which is a separate command and therefore has a
  // look of its own — the rule this table is now the register for. A siman is a
  // heading and a seif is a block, so what they take from here is what a piece
  // of *text* can take; where they sit on the page is still the heading's and
  // the block's. Both ship with exactly what they printed before: a siman with
  // nothing of its own over the level-1 heading, a seif and an os with the bold
  // letter they were written with.
  "סימן": (:),
  "סעיף": (משקל: "bold"),
  "אות": (משקל: "bold"),
  // The blocks. Every value here was written inline in the command a moment ago
  // — a callout's blue, a box's grey border, the 12pt padding all of them share
  // — so a writer could see it on the page and reach none of it.
  "ציטוט": (:),
  "הערת_צד": (גוון: rgb("#eff6ff"), קו: rgb("#2563eb"), מרווח: 12pt, רדיוס: 6pt, רוחב: 100%),
  "אזהרה": (גוון: rgb("#fef2f2"), קו: rgb("#dc2626"), מרווח: 12pt, רדיוס: 6pt, רוחב: 100%),
  "הצלחה": (גוון: rgb("#f0fdf4"), קו: rgb("#16a34a"), מרווח: 12pt, רדיוס: 6pt, רוחב: 100%),
  "תיבה": (מסגרת: 0.75pt + luma(150), מרווח: 12pt, רדיוס: 6pt, רוחב: 100%),
  // The title page's two lines, which were `text(size: 2em, weight: "bold")`
  // and `text(size: 1.2em, fill: luma(110))` inside an `align(center, …)`.
  "שער": (גודל: 2em, משקל: "bold", יישור: "center"),
  "תת_שער": (גודל: 1.2em, צבע: luma(110), יישור: "center"),
  // A block citation, which is a look and nothing else: 0.85em, italic, grey.
  "מקור": (גודל: 0.85em, סגנון: "italic", צבע: luma(90)),
  // The three review marks. These had a channel already — `#הגדרות_סקירה` takes
  // `צבע_הוספה`, `צבע_מחיקה` and `צבע_הערה` — and it was the wrong shape twice
  // over: three colours and nothing else, so a reviewer could recolour a
  // deletion and not unstrike it or set it smaller; and a second table deciding
  // what a mark looks like, which is the drift this register exists to end.
  //
  // The switch still takes those three names — a document that sets them keeps
  // working — but it writes *here* now rather than beside here. What stayed in
  // `_rv_cfg` is what is genuinely not a look: which view the document is in,
  // and whether a comment prints its reviewer's name.
  "הוספה": (צבע: rgb("#15803d"), קו_תחתון: true),
  "מחיקה": (צבע: rgb("#b91c1c"), קו_חוצה: true),
  "הערת_עורך": (צבע: rgb("#b45309")),
  // A heading inside a note, which had a look and borrowed it. It read its
  // weight and its colour off `#הגדרות_כותרות` — the *document's* headings — so
  // a sefer that coloured its chapter titles coloured the lemmas in its
  // footnotes too, and there was no way to say otherwise.
  //
  // Nothing here, because what it ships is per level and computed: the
  // compressed size ramp, and the document's own heading weight and colour at
  // that level. Those stay the base, so nothing written before this changes;
  // the class sits over them and this heading's own arguments over that. See
  // `כותרת_בהערה` itself.
  "כותרת_בהערה": (:),
  // The endnote's reference mark — the superscript number `#הערתסיום` leaves in
  // the text. What it prints, and the only thing it prints: the note's body is
  // set by `#הערות_בסוף`, which is a command of its own.
  "הערתסיום": (:),
  // The two formulas. A formula is set in the document's own face at the
  // document's own size, which is fine as a default and is not a decision
  // anybody made — a displayed equation a shade smaller than the body, or a
  // grey one, or a heavier inline one, could not be asked for at all.
  "נוסחה": (:),
  "נוסחה_בשורה": (:),
  // The last two, and neither is a run of text.
  //
  // A rule is a line: thickness, colour, how far across the page it goes and
  // where it sits. Setting a *weight* or a *slant* on it would be a control
  // with nothing behind it, so it answers to four knobs of its own and to
  // none of the text ones — see `_mk_knobs_of`. Every value here is what it
  // has drawn since it was written.
  "קו_מפריד": (עובי: 0.5pt, צבע: luma(180), רוחב: 100%),
  // A picture draws two things and the register already has a shape for
  // that: the block knobs frame the picture, and the text knobs reach the
  // caption, which is the only text a figure prints. Ships nothing, because
  // an unframed picture under Typst's own caption is what it draws today.
  //
  // `רוחב` and `יישור` were parameters of the call and are knobs now, so a
  // sefer can say once that its pictures are 60% and centred instead of
  // saying it at every one of them. The parameters still work and win, which
  // is what an instance override is.
  "תמונה": (:),
)

/// What `#רשימת_סימונים` calls a class when the writer does not title it.
#let _mk_titles = (
  "ציון": "רשימת הציונים",
  "גמרא": "מראי המקומות בגמרא",
  "דיבור_המתחיל": "רשימת הדיבורים המתחילים",
  "פסוק": "רשימת הפסוקים",
  "ציון_מקור": "רשימת המקורות",
  "ערך": "רשימת הערכים",
  "סימן": "רשימת הסימנים",
  "מראה_מקום": "רשימת מראי המקומות",
)

/// What a mark's own arguments may say about how it looks.
///
/// `קו_חוצה` arrived with the review marks. A tracked deletion is struck
/// through, and that stroke was written into `#מחיקה` where no writer could
/// reach it — which is the same shape as every other value this register has
/// taken over, and there is no reason a line through a word should be a knob any
/// less than a line under one.
#let _mk_knobs = ("גודל", "סגנון", "משקל", "צבע", "קו_תחתון", "קו_חוצה", "סוגריים")

/// …plus the two that are not a look at all: `פטור` takes this mark out of its
/// class's styling, and `ברשימה: false` takes it out of the class's list. Two
/// separate wants — *this one is set differently on purpose* and *this one is
/// not worth listing* — and conflating them would make each unreachable half
/// the time.
/// The knobs a command that draws a *block* has, on top of the text ones.
///
/// A quotation, a callout, a box and a warning are not runs of text with a
/// colour: what a writer wants to set on them is the fill, the border, the
/// padding and the corner. Those cannot be said with `text()`, so they are a
/// second set, and only the classes that draw a block carry them —
/// `_mk_knobs_of` is what makes that per class rather than a flat list with six
/// controls that mean nothing on a gemara reference.
#let _mk_block_knobs = ("גוון", "קו", "מסגרת", "מרווח", "רדיוס", "רוחב", "יישור")

/// Which classes draw a block, and therefore answer to the knobs above.
#let _mk_block_classes = (
  "ציטוט",
  "הערת_צד",
  "אזהרה",
  "הצלחה",
  "תיבה",
  "שער",
  "תת_שער",
  // A figure is a block: what a writer wants to set on a picture is how wide
  // it is, where it sits, and whether it is framed. Its text knobs reach the
  // caption, because a caption is the only text it prints.
  "תמונה",
)

/// …and the knobs a *line* has, which are none of the above.
///
/// A rule prints no glyphs, so every text knob on it is a control with
/// nothing behind it, and it is not a box either — `רוחב` here is how far the
/// line runs, not how wide a block is. Four knobs, and they are its own.
#let _mk_rule_knobs = ("עובי", "צבע", "רוחב", "יישור")
#let _mk_rule_classes = ("קו_מפריד",)

/// The knobs one class answers to.
#let _mk_knobs_of(cls) = if _mk_rule_classes.contains(cls) {
  _mk_rule_knobs
} else if _mk_block_classes.contains(cls) {
  _mk_knobs + _mk_block_knobs
} else { _mk_knobs }

#let _mk_own_keys = _mk_knobs + _mk_block_knobs + ("פטור", "ברשימה")

/// The pieces a command draws separately, and the look each ships with.
///
/// *As granular as it can be*: a command's own look covers the whole of what it
/// prints, and several of them print more than one thing. A siman prints the
/// word, the number, the separator and the title; a pasuk prints the quotation
/// and then its reference in parentheses; a gemara reference prints a masechta
/// and a daf. Setting "the siman" larger should make all of it larger, and
/// setting *the number* bold should bold the number — which is two settings,
/// not one, and there was one.
///
/// Two of these were **hardcoded looks with no way to reach them**: a pasuk's
/// reference has always been `text(size: 0.82em, fill: luma(95))` written
/// inline, and that is what a part is for. Everything here ships exactly what it
/// printed before.
///
/// A part's look nests *inside* its command's, so it carries only what differs.
#let _mk_part_defaults = (
  "סימן": (
    // The word `סימן`, the number, the em dash between them, and the title.
    //
    // Two of these are text the *command* invents rather than text the writer
    // typed, so they ship a `טקסט` and it is theirs to change: a sefer that
    // opens its simanim `סי׳ א׳` says so, and `טקסט: ""` drops the word
    // altogether. The number and the title are the writer's words and take no
    // such key — offering one there would be a control that changes nothing.
    "קידומת": (טקסט: "סימן"),
    "מספר": (:),
    "מפריד": (טקסט: " — "),
    "כותרת": (:),
  ),
  "פסוק": ("מקור": (גודל: 0.82em, צבע: luma(95))),
  "גמרא": ("מסכת": (:), "דף": (:)),
  "ציון_מקור": ("מקום": (:)),
  // The pencil an editorial comment leaves in the line. Its own piece, and
  // not because it is decorative: a comment rides the side column, so the
  // class's size belongs to the body in the margin, and applying it to the
  // marker as well puts a 1.4em pencil in the middle of a sentence. That was
  // decided by writing the colour into the command and dropping the rest,
  // which is a decision with no way to disagree with it. This is the same
  // decision as a default.
  "הערת_עורך": ("סימן": (טקסט: "✎")),
)

/// Where a part's settings live inside `_mk_cfg`, keyed by class then by part.
/// A reserved key rather than a tenth piece of state, for the reason
/// `_cfg_with` gives about `כפה`: the setting travels with the thing it belongs
/// to.
#let _mk_parts_key = "חלקים"

/// The class styling, knob-major: `גודל: ("ציון": 0.8em)` — one dictionary per
/// knob, keyed by class, exactly as `#הגדרות_זרמים` keys its knobs by stream.
/// A plain value instead of a dictionary applies to every class.
#let _mk_cfg = state("ksav-mk-cfg", (:))

// Defined here rather than beside the block commands that use it: the side
// column's marker renderer needs it too, and that lives above the document
// wrapper — a Typst closure resolves its names where it is written.
#let _mk_part(cls, part) = {
  let shipped = _mk_part_defaults.at(cls, default: (:)).at(part, default: (:))
  let chosen = _mk_cfg.get().at(_mk_parts_key, default: (:)).at(cls, default: (:))
  _cfg_with(shipped, chosen.at(part, default: (:)))
}

#let הגדרות_סימונים(..opts) = {
  // The store is knob-major, so a legal top-level key is a knob, a class, or
  // the parts key. Anything else was inserted whole and read by nothing — a
  // typo became a dead key in silence.
  let legal = (
    _mk_knobs + _mk_block_knobs + _mk_rule_knobs + _mk_titles.keys()
      + _mk_part_defaults.keys() + (_mk_parts_key,)
      // The sweep-back switch is a knob of the global like any other: the
      // doors accept it (`_mk_set` exempts it twice) and `_mk_pick` reads it,
      // so refusing it here made `#הגדרות_סימונים(כפה: true)` impossible.
      + ("כפה",)
  )
  for k in opts.named().keys() {
    if not legal.contains(k) {
      panic("הגדרות_סימונים: ארגומנט לא מוכר · unrecognised argument: " + k)
    }
  }
  _mk_cfg.update(c => {
    let d = c
    for (k, v) in opts.named() { d.insert(k, v) }
    d
  })
}
#let marks_config = _en(הגדרות_סימונים)

/// Set one thing's look, by name — the door each command gets of its own.
///
/// The rule is that anything which is a separate command has a style you can
/// set, and *set it inside the marks configuration* is not that: a writer
/// setting how a siman looks should say so about simanim, not name one inside a
/// command about something else. So every styled command has a
/// `#הגדרות_<שמו>` of its own, three lines each, and they all write here.
///
/// One authority per class is untouched, and that is the point of routing them
/// through one setter: the doors are how you say it, `_mk_cfg` is where it is
/// said, and two doors cannot disagree because there is one place to disagree
/// in.
///
/// The store stays knob-major — `גודל: ("סימן": 1.6em)` — because that is what
/// `_mk_pick` reads and what `#הגדרות_סימונים` writes when a sefer sets six
/// classes at once. This turns a class-major call into that.
#let _mk_set(cls, raw-named) = {
  // English spellings arrive untranslated past the first level: `_en` renames
  // this call's own arguments, and the values of a part's argument are another
  // dictionary — `gemara_config(masechta: (weight: "bold"))` used to store the
  // English words whole and every renderer read Hebrew. Canonicalised here,
  // both levels, before anything validates or stores.
  let en(k) = _en_params.at(k, default: k)
  let named = (:)
  for (k, v) in raw-named {
    let v = if type(v) == dictionary {
      let inner = (:)
      for (kk, vv) in v { inner.insert(en(kk), vv) }
      inner
    } else {
      v
    }
    named.insert(en(k), v)
  }
  _mk_cfg.update(c => {
  let d = c
  // The parts first — `#הגדרות_סימן(מספר: (משקל: "bold"))`. A key that is
  // neither a knob nor one of this command's parts stops the compile naming
  // itself, because the alternative is a control that reads back what was typed
  // and changes nothing on the page.
  let parts = _mk_part_defaults.at(cls, default: (:))
  let mine = d.at(_mk_parts_key, default: (:)).at(cls, default: (:))
  let touched = false
  for (k, v) in named {
    if _mk_knobs_of(cls).contains(k) or k == "כפה" { continue }
    if not parts.keys().contains(k) {
      panic(
        "הגדרות_" + cls + ": ארגומנט לא מוכר · unrecognised argument: " + k
          + if parts.len() > 0 { " — " + parts.keys().join(", ") } else { "" },
      )
    }
    if type(v) != dictionary {
      panic("הגדרות_" + cls + ": " + k + " מקבל מילון של הגדרות · takes a dictionary of settings")
    }
    // `טקסט` only where the command invents the words. On a piece that prints
    // what the writer typed it would be accepted and ignored, which is the one
    // thing a control must never be.
    if "טקסט" in v and "טקסט" not in parts.at(k) {
      panic(
        "הגדרות_" + cls + ": " + k + " מדפיס את מה שנכתב, ואין לו טקסט משלו · "
          + k + " prints what you wrote, so it has no text of its own",
      )
    }
    // …and the same check one level in, which was missing. The knobs on a part
    // were read and never checked, so `#הגדרות_פסוק(מקור: (גדול: 2em))` was
    // accepted, stored, and changed nothing on the page — a misspelling that
    // looks exactly like a setting that did not take. A part is drawn through
    // `_mk_render`, so what it answers to is the text knobs, plus its own words
    // where it has any.
    for (kk, _) in v {
      if kk == "טקסט" { continue }
      if not _mk_knobs.contains(kk) {
        panic(
          "הגדרות_" + cls + ": " + k + ": ארגומנט לא מוכר · unrecognised argument: " + kk
            + " — " + _mk_knobs.join(", "),
        )
      }
    }
    mine.insert(k, _cfg_with(mine.at(k, default: (:)), v))
    touched = true
  }
  if touched {
    let all = d.at(_mk_parts_key, default: (:))
    all.insert(cls, mine)
    d.insert(_mk_parts_key, all)
  }
  for (k, v) in named {
    if not (_mk_knobs_of(cls).contains(k) or k == "כפה") { continue }
    let cur = d.at(k, default: none)
    // A plain value is *every class*, and a per-class write must not silently
    // discard it: it becomes that class's entry, and every other class keeps
    // the value it already had.
    let per = if type(cur) == dictionary { cur } else if cur == none { (:) } else {
      let m = (:)
      for name in _mk_defaults.keys() { m.insert(name, cur) }
      m
    }
    per.insert(cls, v)
    d.insert(k, per)
  }
  d
  })
}
// One door per command, which is the rule: *anything that is a separate command
// has a style you can set*. Each is the same three lines and each names exactly
// one thing, so `#הגדרות_סימן(גודל: 1.6em)` is a sentence about simanim rather
// than a class name buried in a call about marks.
//
// They are written out rather than generated because a `#let` name in Typst is a
// literal — there is no way to bind thirty names from a loop — and
// `app/test/enginefacts.test.mjs` holds the list against the registry so a
// styled command without a door is a red test rather than a missing control.
#let הגדרות_ציון(..opts) = _mk_set("ציון", opts.named())
#let ref_config = _en(הגדרות_ציון)
#let הגדרות_גמרא(..opts) = _mk_set("גמרא", opts.named())
#let gemara_config = _en(הגדרות_גמרא)
#let הגדרות_דיבור_המתחיל(..opts) = _mk_set("דיבור_המתחיל", opts.named())
#let dh_config = _en(הגדרות_דיבור_המתחיל)
#let הגדרות_פסוק(..opts) = _mk_set("פסוק", opts.named())
#let verse_config = _en(הגדרות_פסוק)
#let הגדרות_ציון_מקור(..opts) = _mk_set("ציון_מקור", opts.named())
#let sourceref_config = _en(הגדרות_ציון_מקור)
#let הגדרות_ערך(..opts) = _mk_set("ערך", opts.named())
#let indexentry_config = _en(הגדרות_ערך)
#let הגדרות_מראה_מקום(..opts) = _mk_set("מראה_מקום", opts.named())
#let sourcenote_config = _en(הגדרות_מראה_מקום)
#let הגדרות_סימן(..opts) = _mk_set("סימן", opts.named())
#let siman_config = _en(הגדרות_סימן)
#let הגדרות_סעיף(..opts) = _mk_set("סעיף", opts.named())
#let seif_config = _en(הגדרות_סעיף)
#let הגדרות_אות(..opts) = _mk_set("אות", opts.named())
#let os_config = _en(הגדרות_אות)
#let הגדרות_ציטוט(..opts) = _mk_set("ציטוט", opts.named())
#let blockquote_config = _en(הגדרות_ציטוט)
#let הגדרות_הערת_צד(..opts) = _mk_set("הערת_צד", opts.named())
#let callout_config = _en(הגדרות_הערת_צד)
#let הגדרות_אזהרה(..opts) = _mk_set("אזהרה", opts.named())
#let warnbox_config = _en(הגדרות_אזהרה)
#let הגדרות_הצלחה(..opts) = _mk_set("הצלחה", opts.named())
#let okbox_config = _en(הגדרות_הצלחה)
#let הגדרות_תיבה(..opts) = _mk_set("תיבה", opts.named())
#let framebox_config = _en(הגדרות_תיבה)
#let הגדרות_מקור(..opts) = _mk_set("מקור", opts.named())
#let cite_config = _en(הגדרות_מקור)
#let הגדרות_שער(..opts) = _mk_set("שער", opts.named())
#let title_config = _en(הגדרות_שער)
#let הגדרות_תת_שער(..opts) = _mk_set("תת_שער", opts.named())
#let subtitle_config = _en(הגדרות_תת_שער)

/// One knob's value for one class. The dictionary may be keyed in either
/// language — `("gemara": …)` in an English document — which is what `_val`
/// answers, so a class name is data like every other value in this prelude.
#let _mk_pick(cfg, key, cls) = {
  let a = cfg.at(key, default: none)
  if type(a) != dictionary { a } else {
    let out = none
    for (k, v) in a { if _val(k) == cls { out = v } }
    out
  }
}

/// The three layers, resolved for one mark: shipped default, class, this mark.
#let _mk_conf(cls, own) = {
  let base = _mk_defaults.at(cls, default: (:))
  let mine = (:)
  for (k, v) in own { if _mk_knobs_of(cls).contains(k) { mine.insert(k, v) } }
  let g = _mk_cfg.get()
  let c = base
  for k in _mk_knobs_of(cls) {
    let v = _mk_pick(g, k, cls)
    if v != none { c.insert(k, v) }
  }
  // Rule 3 first, and ahead of the exemption as well as of the override: `כפה`
  // is the switch for making a sefer uniform again, and it would not do that if
  // every `פטור: true` in it survived. See `_cfg_with`.
  //
  // Read per class as well as globally, because each command has a door of its
  // own now: `#הגדרות_סימן(כפה: true)` means *every siman, no exceptions* and
  // has nothing to say about the gemara references. Written through
  // `#הגדרות_סימונים` it is still one switch over everything, which is what a
  // writer setting six classes at once means by it.
  let forced = _mk_pick(g, "כפה", cls)
  if forced == true { c }
  else if own.at("פטור", default: false) { _cfg_with(base, mine) }
  else { _cfg_with(c, mine) }
}

#let _mk_render(c, body) = {
  if body == none { return }
  let out = body
  if c.at("סוגריים", default: false) { out = [(#out)] }
  if c.at("קו_תחתון", default: false) { out = underline(out) }
  if c.at("קו_חוצה", default: false) { out = strike(out) }
  let a = (:)
  if "גודל" in c { a.insert("size", c.גודל) }
  if "צבע" in c { a.insert("fill", c.צבע) }
  if "משקל" in c { a.insert("weight", _val(c.משקל)) }
  // The slant through `_ks_style`, not through `text(style:)` — which is the
  // request the bundled families answer with the upright face. Three of the
  // eight mark classes ship `סגנון: "italic"` as their *default* (`#גמרא`,
  // `#פסוק`, `#ציון_מקור`), so this is not a knob nobody set: it is a look this
  // register has promised since it was written and has never once printed.
  if "סגנון" in c { out = _ks_style(c.סגנון, out) }
  text(..a, out)
}

/// Draw one piece of a command in its own look.
///
/// It does **not** fold in the class's look, because it is drawn inside it —
/// `_mk_render(class, … _mk_render(part, piece) …)` — so a size on the command
/// scales the part too and the part carries only its difference. `_mk_part`,
/// which resolves the piece's own look, is defined much further up, beside the
/// register's other tables: the side column's marker renderer needs it and lives
/// above the document wrapper.
#let _mk_piece(cls, part, body) = _mk_render(_mk_part(cls, part), body)

/// Draw a block command's frame: fill, border, padding, corner, width, align.
///
/// Nothing is passed to `block` that the class did not ship or the writer did
/// not set, so a class with none of these is its body and no box at all.
///
/// `מסגרת` is a border all the way round and `קו` is the accent edge a callout
/// has on one side. They are two different things a writer means, and a command
/// that shipped one can be given the other.
#let _mk_frame(c, body) = {
  let args = (:)
  if "גוון" in c { args.insert("fill", c.גוון) }
  if "מרווח" in c { args.insert("inset", c.מרווח) }
  if "רדיוס" in c { args.insert("radius", c.רדיוס) }
  if "רוחב" in c { args.insert("width", c.רוחב) }
  if "מסגרת" in c { args.insert("stroke", c.מסגרת) }
  else if "קו" in c { args.insert("stroke", (right: 3pt + c.קו)) }
  let out = if args.len() == 0 { body } else { block(..args, body) }
  // Through `_doc_align`, which is the one place a written alignment becomes an
  // alignment — `"מרכז"`, `"center"` and `center` all mean the same thing and
  // this is not the second table that decides so.
  let al = if "יישור" in c { _doc_align(c.יישור) } else { none }
  if al != none { align(al, out) } else { out }
}

/// A block command, drawn: its text look inside its frame.
#let _mk_draw(cls, own, body) = {
  let c = _mk_conf(cls, own)
  _mk_frame(c, _mk_render(c, body))
}

// ============================================================
//  הערות שכבתיות · layered (tiered) footnotes — per page
// ------------------------------------------------------------
//  A note ON a note becomes its own stacked block at the foot of the page,
//  to any depth: #הערה_א[… #הערה_ב[… #הערה_ג[…]]]. Built on Typst's *native*
//  footnote so placement, page-breaking and unlimited nesting are guaranteed
//  and always converge. Each tier is independently styled (size / slant /
//  colour / indent / an optional bold label) via #הגדרות_הערות, so the tiers
//  read as distinct bands. Numbering is one running sequence (native, so it
//  never jumps) unless #הגדרות_הערות(מספור: …) asks for a scheme per tier, in
//  which case the marker itself says which tier a note belongs to. For fully
//  *regrouped* bands with per-tier numbering and
//  columns (all tier-1 together, then all tier-2, …), use the end/section
//  apparatus #הערות_מדורגות — that renders in the main flow, where such
//  regrouping converges (a page footer is re-laid-out too often to).
// ============================================================
// The defaults are deliberately loud. They used to step 0.9em → 0.88em → 0.86em
// — a 2% size change, which is not a visual distinction, so the indent was
// carrying the entire burden of telling two tiers apart and a reader could not
// see that a sub-note was a sub-note. Tier 1 is now 1em (i.e. exactly what an
// ordinary footnote is, which is what it *is*), and each tier below steps by
// roughly a tenth, slants, greys and indents. Two adjacent tiers have to read
// apart in print before anyone configures anything.
#let _fn_defaults = (
  גודל: (1em, 0.9em, 0.82em, 0.76em, 0.72em, 0.7em, 0.7em, 0.7em, 0.7em),   // per-tier size
  סגנון: ("normal", "italic", "italic", "italic", "italic", "italic", "italic", "italic", "italic"),
  צבע: (luma(0), luma(55), luma(85), luma(105), luma(120), luma(120), luma(120), luma(120), luma(120)),
  הזחה: (0em, 1.4em, 2.8em, 4.2em, 5.6em, 7em, 8.4em, 9.8em, 11.2em),  // per-tier indent (nesting)
  תוויות: none,        // none, or an array of per-tier bold label prefixes ("", "על הערה: ", …)
  ריווח: 0.85em,       // gap between footnote entries
  // What stands at the head of an entry, as a list of ingredients in the order
  // they should be printed — see `_eh_head`.
  ראש: ("מספר", "תווית"),
  // מספור — none = ONE running native sequence across every tier (1,2,3,4,…), so
  //   the numbers never jump and never repeat. Or an array of per-tier schemes,
  //   ("1", "א", "i"), and then each tier counts its own and the marker's *shape*
  //   tells the reader which block to look in — the one thing size and slant
  //   cannot say at the point of reference, where the reader actually is.
  מספור: none,
)
#let _fn_cfg = state("ksav-fn-cfg", _fn_defaults)
// What one note may overrule: its own text and its own indent. Not `מספור` — the
// scheme is the sequence's, and a note overriding it with a single value would
// leave the per-tier rank numbering altogether — and not `ריווח`, which is the gap
// *between* entries and so belongs to no single entry. See `_cfg_split`.
#let _fn_own_keys = ("גודל", "סגנון", "צבע", "הזחה", "תוויות")
// #הגדרות_הערות(סגנון: ("normal","italic","normal"), הזחה: (0em,1em,2em), ריווח: 1em, …)
//
// # ריווח, and why it takes a `set` rule as well as a state
//
// The gap between one footnote entry and the next was said **twice**: here,
// where a writer looks for it, and as `ריווח_הערות` on `#מסמך`, which is the one
// that reached the page through `set footnote.entry(gap: …)`. The key declared
// here was read by nothing at all — a knob with a name, a default, a line in the
// documentation and no wire behind it, which is the worst of the three states a
// setting can be in, because it looks exactly like a working one.
//
// It cannot be fixed by making the *document wrapper* read this state: a `set`
// rule is applied once, at the top, and `#הגדרות_הערות` may be written on page
// forty. So the command emits the `set` itself. Typst scopes a `set` from where
// it appears to the end of the enclosing block, which is precisely what a writer
// means by changing a setting half way through a sefer, and it leaves
// `ריווח_הערות` as what it should have been all along — the document-level
// default that this overrules.
//
// `ריווח` stays out of `_fn_own_keys`: the gap is *between* two entries and
// belongs to neither of them.
#let הגדרות_הערות(..opts) = {
  // Refused here and not inside the update, for the reason `#הגדרות_מספור`
  // gives below its own state: an update closure runs only when something
  // reads it, and a typo that compiles into a dead key is the defect this
  // repository exists to kill.
  for k in opts.named().keys() {
    if k not in _fn_defaults and k not in _cfg_global_keys {
      panic("הגדרות_הערות: ארגומנט לא מוכר · unrecognised argument: " + k)
    }
  }
  _fn_cfg.update(c => {
    let d = c
    for (k, v) in opts.named() { d.insert(k, v) }
    _nt_explicit(d, opts.named())
  })
  // **Spread, not an `if` block**, and this file has now paid for that twice.
  // A `set` is scoped to the block it appears in, so `if … { set … }` governs
  // the two lines of the `if` and nothing else — it compiles, it reads exactly
  // like a working feature, and `gap_0em` against `gap_6em` still rendered
  // byte-identical pages. Spreading an empty dictionary into the `set` is a set
  // of nothing, which is the no-op that was wanted, at the function's own level.
  // The heading rule uses the same idiom for `font`, and the note above
  // `set align` in the document wrapper is this trap written out in full.
  set footnote.entry(..(if "ריווח" in opts.named() { (gap: opts.named().ריווח) } else { (:) }))
}
#let footnote_config = _en(הגדרות_הערות)

// ============================================================
//  A string argument, written either way
// ------------------------------------------------------------
//  Every command in the README's core idea takes brackets — `#הדגשה[טקסט]`,
//  `#כותרת1[…]`, `#רשימה[…]`, `#הערה[…]`. A handful genuinely want a *string*: a
//  formula is evaluated, a label is an identifier, a stream and a font are names.
//  Given brackets, those answered *"expected string, found content"* — and the
//  toolbar and the palette insert the right form, so it only ever bit the writer
//  who **types**, which is the writer this markup language exists for.
//
//  So they take both. This flattens content back to the plain string they need.
//  There is nothing in those brackets but characters — no nested command to lose —
//  and the space element is the only thing that needs naming.
//
//  `join` needs the empty case named, because `().join("")` in Typst is **none**
//  and not `""`. `#גמרא[][]` — which is what the Insert menu writes before the
//  writer has typed the masechta — is a sequence with no children, so this
//  returned `none` and every caller that went on to `.trim()` or `+` it failed
//  with *"type none has no method trim"*, naming a method the writer never
//  called. It had been latent since this function was written: nothing asked it
//  for an empty body until a mark had to derive its own list entry from one.
#let _as_string(x) = {
  if type(x) == str { x } else if type(x) == content {
    if x.has("text") {
      x.text
    } else if x.has("children") {
      let parts = x.children.map(_as_string)
      if parts.len() == 0 { "" } else { parts.join("") }
    } else if x == [ ] {
      " "
    } else {
      ""
    }
  } else {
    str(x)
  }
}

// A per-tier value: an array is per-tier, 1-based, falling back outside its
// range; anything else is one value for every tier.
//
// The scalar arm was missing, and a scalar is the shape a writer types first:
// `#הגדרות_הערות(גודל: 1.2em)` fell past the array test to the fallback, so the
// size the writer asked for was silently replaced by the shipped default. The
// panel always wrote nine-element tuples, which is why it never showed there —
// only to whoever typed the command, which is the writer this markup exists for.
// `_cfg_pick` (headings) and `_ap_pick` (bands, streams) both accepted a scalar
// from the day they were written. This was the one picker of the three that did
// not, on the kind with nine tiers, where nobody writes the tuple by hand.
#let _fn_pick(arr, i, fb) = if type(arr) == array {
  if i >= 1 and i - 1 < arr.len() { arr.at(i - 1) } else { fb }
} else if arr == none { fb } else { arr }

// ---- shared apparatus helpers ----
// Every collect-then-render apparatus below has the same problem: when a stored
// note body is re-displayed inside the apparatus, the nested notes in that body
// run again and re-emit their metadata, so the raw query grows on every layout
// pass and the document never converges.
//
// The fix is to recognise those phantom registrations by WHERE they are. Every
// apparatus brackets its rendered block with an open and a close marker, so a
// registration is a re-display exactly when it sits inside such a bracket — which
// is true iff the number of open markers before it exceeds the number of closes.
// That is a document-ORDER test, not a geometric one: page coordinates cannot
// answer it, because native footnotes also land below an apparatus block on the
// page while being genuinely outside it.
//
// This replaces an earlier dedup-by-content-key, which merged any two notes whose
// text happened to be byte-identical: writing "עיין שם" twice produced ONE note
// carrying both markers. Position tells originals apart; content cannot.
#let _ksav_ap0 = label("ksav-ap0")
#let _ksav_ap1 = label("ksav-ap1")
#let _ksav_ap_open = [#metadata(none)#_ksav_ap0]
#let _ksav_ap_close = [#metadata(none)#_ksav_ap1]
//
// # One query, walked in order
//
// The test above is a bracket-depth test, and it used to be answered *per
// element*: `_ksav_is_real(e)` ran two `.before()` queries, and `_ksav_real`
// called it once for every element it was filtering. So the cost of deciding
// which notes are real was two full document queries per note — Θ(n²) per
// apparatus per layout pass, and the page-band apparatus re-derives the same
// document-global set inside the page *footer*, which page breaking runs several
// times per page. A 300-page sefer with 2,000 band notes came to millions of
// queries to compute one set, hundreds of times.
//
// The set can be had in one query. Ask for the elements *and both markers*
// together — `query` returns them in document order — and walk the result once,
// carrying the depth. An element is real exactly when the depth is zero where it
// stands, which is the same rule, computed by counting instead of by asking.
//
// The markers are told apart by their label rather than by their type, and read
// with `at(..., default: none)` because most elements have no label field at all.
#let _ksav_depth_step(e, depth) = {
  let lb = e.at("label", default: none)
  if lb == _ksav_ap0 { depth + 1 } else if lb == _ksav_ap1 { depth - 1 } else { depth }
}
#let _ksav_is_marker(e) = {
  let lb = e.at("label", default: none)
  lb == _ksav_ap0 or lb == _ksav_ap1
}
// Every element matching `sel` that is a real note rather than an apparatus
// re-display, in document order.
#let _ksav_real_of(sel) = {
  let depth = 0
  let out = ()
  for e in query(selector(sel).or(_ksav_ap0).or(_ksav_ap1)) {
    if _ksav_is_marker(e) {
      depth = _ksav_depth_step(e, depth)
    } else if depth <= 0 {
      out.push(e)
    }
  }
  out
}
// How many elements matching `sel` (that are real, not apparatus re-displays)
// run from the start of the scope up to and including the caller. Document order,
// via `.before()` — coordinates cannot be used, because several notes can sit on
// one line and would then all count each other.
//
// `.before(loc)` is inclusive, which is what makes this the caller's own rank
// rather than the count in front of it.
#let _ksav_count(sel, loc, pred) = {
  let depth = 0
  let n = 0
  for e in query(selector(sel).or(_ksav_ap0).or(_ksav_ap1).before(loc)) {
    if _ksav_is_marker(e) {
      depth = _ksav_depth_step(e, depth)
    } else if depth <= 0 and pred(e) {
      n += 1
    }
  }
  n
}
/// The same, as a number to print: never zero, because there is no note nought.
///
/// Split from `_ksav_count` because a caller that composes two counts — see
/// `_ap_note`, which adds a note's place in the sefer to its place inside the
/// entry being re-displayed — must clamp once at the end and not twice in the
/// middle.
#let _ksav_rank(sel, loc, pred) = calc.max(_ksav_count(sel, loc, pred), 1)

// ---- מספור מתחיל מחדש · restartable numbering ----
//
// # What is being asked
//
// > *"Note numbering should be restartable rather than running unbroken through
// > a whole sefer — most importantly in the endnote section, where per-chapter
// > numbering is the normal convention. Wanted: automatic restart at a chosen
// > structural level, plus explicit restart and explicit continue commands the
// > writer can place by hand."*
//
// And the same question is asked of simanim by another item, which is why this
// is one mechanism and not two: the two commands below are read here, for
// notes, and by the editor's `numbering.ts`, for the numbers a siman carries in
// the source. A writer who has learnt *"restart the count here"* has learnt it
// once.
//
// # How it works, and why it is a marker rather than a counter
//
// A note's number is a **query** — how many notes lie before this one — and has
// been since counters were found not to converge under page breaking. Restarting
// a query is therefore not a matter of setting anything to zero; it is a matter
// of moving where the counting *starts*. So every restart point drops a marker,
// and `_nr_origin` answers "which marker governs this spot", and the count is
// taken `.after()` it. Nothing is stored, nothing has to converge, and the
// answer is the same on every layout pass.
//
// Three kinds of marker, all in one label so that `query` returns them in
// document order and no two streams have to be merged by position:
//
//   - `("auto", level)` — emitted by every heading, by `_hd_show`. Whether it
//     restarts anything is decided *here*, against `אפס_לפי`, rather than by
//     emitting the marker conditionally. That way changing the setting changes
//     the answer without the markers having to be re-emitted, and a document
//     with the setting off pays one metadata element per heading, which is
//     nothing beside the query it already runs per note.
//   - `("restart",)` — `#התחל_מספור`, placed by hand.
//   - `("continue",)` — `#המשך_מספור`, placed by hand, and the reason the item
//     asks for *both*: an automatic rule the writer cannot override locally is
//     a rule they will turn off entirely the first time it is wrong.
//
// `continue` undoes the restart immediately in front of it, which is where a
// writer puts it: under the chapter heading whose numbering should run on. It
// restores the origin that was in force before that restart rather than
// clearing the origin altogether — otherwise a `#המשך_מספור` in chapter four
// would count from the start of the sefer, which is not "continue", it is
// "start again from the beginning".
#let _nr_label = <ksav-nr>
#let _nr_defaults = (
  // The heading level an automatic restart happens at, or `none` for never.
  //
  // `none` is the default because it is what every sefer written in Ksav so far
  // has done, and a numbering scheme that changes under a document on upgrade
  // is not an improvement. A writer asking for per-chapter endnotes says so.
  אפס_לפי: none,
)
#let _nr_cfg = state("ksav-nr-cfg", _nr_defaults)
// Whether this document restarts a count by hand anywhere.
//
// A **state** and not a query, and that is load-bearing rather than tidy.
// Everything downstream has to ask "does anything restart here" before it can
// decide how to number, and asking it as a query would be one query per note in
// every document ever written — which is precisely the Θ(n²) the comment above
// `_ap_entries` says was this apparatus's performance defect. A state is read
// without walking anything, and `.final()` is document-global, so a
// `#התחל_מספור` at the back of the sefer is known at the front.
#let _nr_used = state("ksav-nr-used", false)
#let _fnt_gov = state("ksav-fnt-gov", false)
#let הגדרות_מספור(..opts) = {
  // Checked **here** and not inside the update. A state's update closure runs
  // only when something reads the state, so a document that restarts nothing
  // never runs it — and a misspelt knob would then compile, print the old
  // numbering, and give the writer no way to tell a typo from a feature that
  // does not work. Which is the defect this whole repository is about.
  for (k, v) in opts.named() {
    if k not in _nr_defaults {
      panic("הגדרות_מספור: אין הגדרה בשם " + k)
    }
  }
  _nr_cfg.update(c => {
    let d = c
    for (k, v) in opts.named() { d.insert(k, v) }
    d
  })
}
#let numbering_config = _en(הגדרות_מספור)

// The marker itself. Boxed to nothing: it must leave no ink and take no space,
// and a bare `metadata` in markup is already spaceless — the label is what
// makes it findable.
#let _nr_mark(value) = [#metadata(value)#_nr_label]

// ---- הפניה להערה · "see note 12", and the 12 stays right ----
//
// `NOTES-PLAN` thing five: *"writing 'see note 12' and having the 12 stay
// correct after you insert a note earlier."* The plan's own answer is the one
// taken here — **position-based numbering and automatic cross-references are not
// in tension**, because a reference asks, at build time, what number the note
// turned out to be.
//
// So a note that was given a name records the number it printed, where it
// printed it, and a reference reads that. Nothing is stored across compiles and
// nothing has to converge: the note already knew its own number, and this is
// only writing it down where somebody else can read it.
//
// **Careful: something adjacent already exists and is not this.**
// `#הערה_בשם("א")` against `#גוף_הערה("א")` is the *deferred body* mechanism —
// the prose written at the end of the file — and two markers against one body
// there render the body **twice**. That is the opposite of what is wanted, and
// it is why this is a different name and a different label.
#let _xn_label = <ksav-xnote>
#let _xn_mark(name, num) = [#metadata((שם: _as_string(name).trim(), מספר: num))#_xn_label]

/// Start the count again from here.
///
/// With no argument: every count. With one: that named series only, which is
/// what `#מונה` needs — two series running at once are two counts, and a
/// restart that hit both would make them one again.
///
/// The argument is **optional and last-added on purpose**. `#התחל_מספור()` means
/// today exactly what it meant before this existed, in every sefer already
/// written, and the per-series form is a narrowing of it rather than a second
/// command with a second vocabulary to learn.
#let התחל_מספור(שם: none) = {
  _nr_used.update(true)
  _nr_mark(if שם == none { ("restart",) } else { ("restart", _as_string(שם).trim()) })
}
#let restart_numbering = _en(התחל_מספור)

/// Carry the count on through the restart just above — an automatic one or a
/// hand-placed one. The local override the automatic rule needs to be safe.
#let המשך_מספור() = { _nr_used.update(true); _nr_mark(("continue",)) }
#let continue_numbering = _en(המשך_מספור)


// Where the count that governs `loc` begins, or `none` for the start of the
// sefer.
//
// One pass over the markers in document order, carrying two values: the origin
// in force and the one before it. That is exactly enough for `continue` to mean
// "the restart above me did not happen" and no more — a deeper history would be
// a stack nobody can predict the behaviour of from the source.
/// `שם` is the named series being asked about, or `none` for *the* count —
/// which is what a note asks, and what every document written before named
/// series existed asks.
///
/// A restart that names a series governs that series and nothing else; a restart
/// that names none governs everything, including the named series. Two counts
/// running at once are two counts, and a `#התחל_מספור("דעות")` that also reset
/// the notes would make them one again.
#let _nr_origin(loc, שם: none) = {
  let lvl = _nr_cfg.get().at("אפס_לפי", default: none)
  let cur = none
  let prev = none
  for m in query(selector(_nr_label).before(loc)) {
    let v = m.value
    let kind = v.at(0)
    if kind == "auto" {
      if lvl != none and v.at(1) <= lvl {
        prev = cur
        cur = m.location()
      }
    } else if kind == "restart" {
      // A restart naming somebody else's series is not this one's business.
      let whose = if v.len() > 1 { v.at(1) } else { none }
      if whose == none or whose == שם {
        prev = cur
        cur = m.location()
      }
    } else {
      cur = prev
    }
  }
  cur
}

// Does anything in this document restart a count at all?
//
// The guard that keeps the default free. Everything below costs one query per
// entry, which is the shape the comment above `_ap_entries` says was the
// performance defect of this apparatus — so it is paid only by a document that
// actually asked for restarts, and a sefer with `אפס_לפי` unset and no
// `#התחל_מספור` in it does one query and stops.
#let _nr_any() = {
  _nr_cfg.get().at("אפס_לפי", default: none) != none or _nr_used.final()
}

// A selector restricted to the count that governs `loc`.
//
// The one door: every numbering that should restart goes through this, and a
// numbering that does not is one that was never asked to. Wrapping the selector
// rather than adding an argument to `_ksav_count` keeps the composition in
// `_ap_note` — a note's place in the sefer plus its place inside the entry
// being re-displayed — readable, which is where the numbering bug before this
// one lived.
#let _nr_scope(sel, loc) = {
  // Asked here rather than by each caller, so a document that restarts nothing
  // pays a state read and not a query — and the side column, which computes a
  // rank per neighbour per note, does not turn into a query per neighbour per
  // note. The callers that need the guard for their own reasons ask again.
  if not _nr_any() { return sel }
  let og = _nr_origin(loc)
  if og == none { sel } else { selector(sel).after(og) }
}

// ---- מונים · named series, counted anywhere ----
//
// # A numbering mechanism with notes as one customer
//
// `NOTES-PLAN` thing five: *"any number of named series, running at once, each
// renumbering on insert in the middle, each restartable, each with its own
// shape — **and not tied to notes**."* The last clause is the whole point. A
// writer numbering a list of opinions, a set of variants or a count of simanim
// wants exactly this and has no note anywhere; until now the only renumbering
// machinery in this engine was inside the footnote apparatus, which is the same
// mistake this whole plan is written to undo — a general capability trapped
// inside one of its customers.
//
// # It is a rank, not a counter, and that is not a detail
//
// `#מונה("דעות")` prints *how many marks of this series lie before it*, read out
// of a query. Nothing is stored and nothing has to converge, which is the rule
// this engine has been built on since counters were found not to survive page
// breaking (`_ksav_rank`) — and it is what makes *renumbering on insert* free:
// a mark typed in the middle is simply one more mark before the ones after it.
//
// Restarting is the same mechanism the notes use, so a writer who has learnt
// *"start the count again here"* has learnt it once: `#התחל_מספור()` restarts
// every series, and `#התחל_מספור("דעות")` restarts one.
#let _ct_label = <ksav-ct>
#let _ct_own = ("מספור", "סימן")
#let _ct_cfg = state("ksav-ct-cfg", (:))

/// This series' marks, restricted to the count that governs `loc`.
///
/// `_nr_scope`'s counterpart for a named series. Its own function rather than an
/// argument on that one, because the selector *is* the series' label and the
/// caller would otherwise have to say the same thing twice.
#let _nr_scope_of(name, loc) = {
  if not _nr_any() { return selector(_ct_label) }
  let og = _nr_origin(loc, שם: name)
  if og == none { selector(_ct_label) } else { selector(_ct_label).after(og) }
}

// #הגדרות_מונה("דעות", מספור: "א", סימן: (משקל: "bold"))
//
// The series' shape, and how its numbers are set. Both optional: a series nobody
// configures counts 1, 2, 3 in the document's own ink, which is what a writer
// who just wants a count means.
#let הגדרות_מונה(שם, ..opts) = {
  let name = _as_string(שם).trim()
  let (own, rest) = _cfg_split(opts.named(), _ct_own)
  _cfg_strict("הגדרות_מונה", rest)
  _ct_cfg.update(c => {
    let d = c
    let r = d.at(name, default: (:))
    for (k, v) in own { r.insert(k, v) }
    d.insert(name, r)
    d
  })
}

// #מונה("דעות") — the next value of that series, printed here.
//
// Named arguments style this one number, the same three-layer model every other
// command in this prelude uses: the series' own look, then this instance's.
#let מונה(שם, ..opts) = {
  let name = _as_string(שם).trim()
  let (own, rest) = _cfg_split(opts.named(), _ct_own)
  _cfg_strict("מונה", rest)
  // The mark first, so that `here()` below counts this one.
  [#metadata(name)#_ct_label]
  context {
    let loc = here()
    // Scoped to the series' own restart, and to the series: two counts running
    // at once are two counts, which is what "named" means.
    let n = _ksav_rank(_nr_scope_of(name, loc), loc, e => e.value == name)
    let cfg = _cfg_with(_ct_cfg.get().at(name, default: (:)), own)
    _mk_render(cfg.at("סימן", default: (:)), _hb_num(
      cfg.at("מספור", default: "1"),
      cfg.at("גרשיים", default: _hb_mode.get()),
      n,
    ))
  }
}
#let counter_config = _en(הגדרות_מונה)
#let count_ = _en(מונה)


// The number each of `locs` prints, `locs` being one apparatus group's entries
// in document order. `none` when nothing in the document restarts anything, so
// the caller keeps its own cursor and pays nothing.
//
// The entries are numbered by *walking the list* rather than by asking where
// each one is — that is the fix the marker bug before this one turned on — so a
// restart has to be expressed the same way: a run of entries sharing an origin
// is one count, and a new origin starts a new one. Comparing the origins rather
// than counting the markers between them is what makes a `#המשך_מספור` work
// here for free: it does not restart, so it does not change the origin, so the
// run carries on.
/// The numbers a list of entries carries, restarts included.
///
/// # One query, not one per entry
///
/// This used to ask `_nr_origin` for each location, and `_nr_origin` queries the
/// whole document — so an apparatus showing every note in the sefer at once did
/// one full query per note. That is the quadratic: measured on a twenty-chapter
/// sefer with a hundred and twenty collected notes, **48.8 seconds**, against
/// 3.7 for the same notes at the foot of the page where a block holds a handful
/// at a time and never feels it. Thirty chapters wanted 111 seconds and fourteen
/// gigabytes.
///
/// Both lists are in document order — Typst's `query` returns them that way, and
/// the entries come from one — so the markers can be walked **once**, beside the
/// entries, with a cursor that only ever moves forward. Same answer, one query.
///
/// The comparison is page and vertical position, which is what `_rg_key` uses a
/// few thousand lines down for the same reason: Typst gives no ordering on
/// locations themselves, and this is the only pair that is true across a page
/// break. It is written out here rather than borrowed because `_rg_key` is
/// defined below this and a closure is resolved where it is written.
#let _nr_numbers(locs) = {
  if not _nr_any() { return none }
  let lvl = _nr_cfg.get().at("אפס_לפי", default: none)
  let ms = query(_nr_label)
  let key(l) = (l.page(), l.position().y)
  // At or before, because `selector.before(loc)` is inclusive and this is
  // standing in for it.
  let upto(a, b) = a.at(0) < b.at(0) or (a.at(0) == b.at(0) and a.at(1) <= b.at(1))
  let out = ()
  let i = 0
  let cur = none
  let prev = none
  let base = 0
  let last = none
  let started = false
  for (j, l) in locs.enumerate() {
    let lk = key(l)
    while i < ms.len() and upto(key(ms.at(i).location()), lk) {
      let v = ms.at(i).value
      let kind = v.at(0)
      if kind == "auto" {
        if lvl != none and v.at(1) <= lvl {
          prev = cur
          cur = ms.at(i).location()
        }
      } else if kind == "restart" {
        // A restart naming somebody else's series is not this one's business,
        // and this list has no name of its own — so only an unnamed restart
        // counts, which is what `_nr_origin(l)` answered.
        let whose = if v.len() > 1 { v.at(1) } else { none }
        if whose == none {
          prev = cur
          cur = ms.at(i).location()
        }
      } else {
        cur = prev
      }
      i += 1
    }
    if not started or cur != last {
      base = j
      last = cur
      started = true
    }
    out.push(j - base + 1)
  }
  out
}
// Restrict a selector to the span between the surrounding pair of `marker`
// elements — i.e. "the current section". `loc` is the caller's own location.
// Used so a per-section apparatus sees only its own section's notes.
#let _ksav_between(sel, marker, loc) = {
  let s = sel
  let before = query(selector(marker).before(loc))
  if before.len() > 0 { s = s.after(before.last().location()) }
  let after = query(selector(marker).after(loc))
  if after.len() > 0 { s = s.before(after.first().location()) }
  s
}
/// What the document said the gap between two footnote entries is.
///
/// Written once by `#מסמך` so that `#הגדרות_הערות(ריווח:)` knows what it is
/// overruling — see `_fn_wrap`, where the overruling happens, and why it has to
/// happen there rather than through the setting Typst provides for it.
#let _fn_gap_base = state("ksav-fn-gap", 0.85em)

// ---- ראש הפריט · what stands in front of a note's prose ----
//
// `NOTES-PLAN` thing five: *"one setting, four ingredients, any combination — a
// number, a fixed label per stream, the quoted words from the body, or
// nothing."*
//
// So `ראש` is a **list**, in the order they print, for the same reason `גלישה`
// is: they compose. A Mishna Berura entry opens with a dibbur hamaschil and no
// number; a Shaar HaTziyun with a number and nothing else; a nusachos apparatus
// with a label and a number both.
//
// | ingredient | what it prints |
// |---|---|
// | `"מספר"` | the number, which is Typst's own for a native footnote |
// | `"תווית"` | the fixed label this tier or stream carries (`תוויות`) |
// | `"ציטוט"` | the words the note is **on** — `#הערה(ציטוט: "שמע ישראל")[…]` |
// | `()` | nothing at all |
//
// **`"מספר"` is not printed here.** Typst draws a footnote entry as
// «number» «body» itself, and the collected apparatus draws its own marker — so
// what this composes is everything *after* the number, and asking for `"מספר"`
// is the ordinary case where nothing extra is added. Leaving it out of the list
// is how a writer says *no number*, and that is the ingredient the plan asks for
// by name.
//
// # On the quotation
//
// The plan wants it **tracked live**, so that editing the sentence does not
// strand the note, with a frozen copy as the fallback. The engine only ever has
// the frozen copy: it is handed `ציטוט:` and prints it. Keeping it current is
// the editor's, which is the only side that can see the writer typing — and the
// constraint that makes live tracking realistic at all is the plan's own, that
// the quotation is one or two words.
//
// Default to no number when quoting, which the plan also asks for: a dibbur
// hamaschil *is* the address, and a number beside it is a second one.
// **The label is in the default**, and that is not a taste: `תוויות` prints
// nothing at all unless something asks for it, and it has been printing since it
// was written. A default of `("מספר",)` alone would have taken the labels out of
// every sefer that had set them, silently, on upgrade — which is the one thing a
// new setting may not do. It costs nothing to leave in, because a tier with no
// label has nothing to print.
//
// Asking for `("מספר",)` *explicitly* is therefore a real request — number only,
// no label — and different from saying nothing.
#let _eh_default = ("מספר", "תווית")
// ---- כתובת · where in the sefer an entry belongs ----
//
// A numbered note needs no address: the marker is the address, and the reader
// finds it by matching a number. A **markerless** apparatus — `ראש` without
// `"מספר"`, which is what a sefer sets constantly — puts nothing in the body at
// all, and the entry is found by reading its opening words back into the text
// by eye. That works while the entry is at the foot of its own page, and it
// stops working the moment the apparatus moves to the back of the sefer: the
// reader is on page 340 holding the words «וכל הפוסקים» and there are two
// hundred pages they might be on.
//
// So an entry can carry **where** as well as **what**, and it is four more
// ingredients in the same `ראש` list the number and the dibbur hamaschil are in,
// because it is the same question — what stands at the head of this entry.
//
//   #ערוץ("ביאורים", מיקום: "סוף", ראש: ("עמוד", "ציטוט"))
//
// # It is for the collected apparatuses, and only there
//
// Nothing here is offered to a note printed at the foot of its own page. The
// address of such a note is *this page*, printing it says nothing, and the place
// the entry is built has no access to the marker's location anyway — a footnote
// entry lays out at the foot, where `here()` is the foot. The banded and
// collected renderers carry the note's real place in the sefer with it, which is
// what makes this possible at all: `org` in `_ap_entries`.
// ---- the line address, and how Ksav came to have one ----
//
// `"שורה"` was refused by name for a while, and the reasoning was right about
// the two routes it had tried:
//
// **`counter(par.line)` cannot be read back.** Measured again before this was
// built: `counter(par.line).at(marker)` answers `(0,)` at a location whose
// margin visibly prints a number. Typst draws its line numbers out of the layout
// and keeps nothing behind them that a query reaches.
//
// **Arithmetic on the baseline grid counts the wrong thing.** Paragraph spacing
// occupies grid rows that are not lines, so a marker on the line the margin
// numbers 5 comes out 8 — exact arithmetic about the wrong quantity, which is
// the more dangerous of the two failures because it looks like an answer.
//
// What both missed is that Typst hands the layout to *us* once per line: the
// `numbering` function of `par.line` is **called at each numbered line, in that
// line's place**. So the function records where it was, and the address is a
// query over what it recorded — the same mechanism as every other thing in this
// prelude that has to survive page breaking.
//
// That also settles the honesty question the old comment raised. The number in
// the margin and the number in the entry now come from **one call**, so they
// cannot disagree; and an address by line is offered only where the lines are
// numbered, because the number is the reader's way back to the place and one
// they cannot see in the margin is a number they cannot use.
#let _ln_label = label("ksav-ln")

/// Every line the layout numbered, as `(number, page, y)`, in document order.
#let _ln_marks() = query(_ln_label).map(m => {
  let l = m.location()
  (m.value, l.page(), l.position().y)
})

/// The line `org` sits on, or `none` when the sefer numbers no lines.
///
/// **The last line at or above the marker, and not the nearest one.** Measured:
/// a line's mark comes back at 107.08pt and a marker written on that same line at
/// 112.63pt — the mark is placed where the line *starts* and the marker sits
/// below it, so a marker is always a few points under its own line's y.
///
/// Nearest was tried first and is wrong for a reason worth keeping: the flow is
/// full of paragraphs with no ink in them — the anchors this prelude drops to
/// mark where a region's scope ends, among others — and each is a line the
/// layout numbers. One of those falls between the last line of the prose and the
/// apparatus under it, closer to a marker on that last line than the line itself
/// is, so every note at the foot of a paragraph came out addressed to a blank.
/// Off by one, pointing at nothing, and confident.
/// # Why this is a binary search and not a walk
///
/// It was a walk, and a walk here is **quadratic in the sefer**. This function is
/// called once per entry and every call read every numbered line in the
/// document, so a work with four times the commentary paid sixteen times over.
/// Measured on a release build, an apparatus addressed by line:
///
/// | entries | by line | by dibbur hamaschil |
/// |---|---|---|
/// | 160 | 0.97s | 0.36s |
/// | 640 | **14.87s** | 1.59s |
///
/// Four times the entries, **15.3 times** the time — against 4.45 for the same
/// document with the address left out, which is the shape of a linear cost. The
/// same fault as `_ap_entry_height` a day earlier, in a function written a day
/// after it, which is what a walk inside a per-entry loop always is.
///
/// A query answers in **document order**, and document order is `(page, y)`
/// order for the body flow — so the last mark at or before the marker is found
/// by halving rather than by reading, and 640 entries pay about twelve position
/// reads each instead of three thousand.
///
/// After: **1.86s** for the 640-entry sefer against 14.87 before, and 4.15 times
/// the cost for four times the entries — within a sixth of what the same sefer
/// costs with no address at all, which is as close to free as this can get.
#let _ln_at(org) = {
  let marks = query(_ln_label)
  if marks.len() == 0 { return none }
  let key = (org.page(), org.position().y + 0.01pt)
  // Is mark `i` at or above the marker, reading the sefer in order?
  let before(i) = {
    let l = marks.at(i).location()
    let (mp, my) = (l.page(), l.position().y)
    mp < key.at(0) or (mp == key.at(0) and my <= key.at(1))
  }
  // Nothing at all above it — a marker on the first line of the sefer, before
  // that line's own number has been drawn.
  if not before(0) { return none }
  let lo = 0
  let hi = marks.len() - 1
  while lo < hi {
    let mid = lo + calc.div-euclid(hi - lo + 1, 2)
    if before(mid) { lo = mid } else { hi = mid - 1 }
  }
  // …and it has to be on the marker's **own** page. Landing on the last line of
  // the page before means this page has no numbered line above the marker, which
  // is a real answer and not this one.
  let l = marks.at(lo).location()
  if l.page() != org.page() { none } else { marks.at(lo).value }
}

#let _xa_kinds = ("עמוד", "דף", "סימן", "שורה")
#let _xa_unbuilt = ()

/// The ingredients of an entry head, checked.
///
/// It was never checked. An ingredient nobody recognised was silently dropped,
/// so `ראש: ("ציטט",)` — one letter out — produced an entry with no head at all
/// and no complaint, which is the same shape as every other bug in this file.
#let _eh_parts = ("מספר", "תווית", "ציטוט")
#let _eh_read(cfg) = {
  let want = cfg.at("ראש", default: _eh_default)
  let want = (if type(want) == array { want } else { (want,) }).map(_val)
  for part in want {
    if _xa_unbuilt.contains(part) {
      panic(
        "ראש: " + _as_string(part) + " עדיין לא נבנתה · this entry-head "
          + "ingredient is not built yet. The addresses that are: "
          + _xa_kinds.join(" · "),
      )
    }
    if not (_eh_parts.contains(part) or _xa_kinds.contains(part)) {
      panic(
        "ראש: מרכיב לא מוכר · unknown entry-head ingredient: " + _as_string(part)
          + " (" + (_eh_parts + _xa_kinds).join(" · ") + ")",
      )
    }
  }
  want
}


// The daf a page falls on, and which side of it. Two printed pages to a daf,
// counting from `דף_ראשון` — which is ב and not א, because in a gemara-numbered
// sefer daf א is the title page and nothing is ever cited from it.
#let _xa_daf_first = 2
#let _xa_daf(p, first) = {
  let n = p - 1
  (first + calc.div-euclid(n, 2), if calc.rem-euclid(n, 2) == 0 { "א" } else { "ב" })
}

/// The siman, perek or section an entry sits in: the last heading before it.
///
/// Read out of a query and not a counter, like everything else that has to
/// survive page breaking. `none` when the sefer has no divisions above the
/// entry, in which case the ingredient prints nothing rather than printing an
/// empty siman — an address that is blank is worse than no address, because it
/// looks like an answer.
#let _xa_section(org) = {
  let hs = query(heading.where(outlined: true).before(org))
  if hs.len() == 0 { none } else { hs.last() }
}

/// One address ingredient, rendered.
///
/// `cfg` is the apparatus's own configuration, so the page numbering an address
/// prints is the one the page itself prints — an entry that says «עמ' 47» about
/// a page whose corner reads «מז» is an address the reader cannot use.
///
/// The **words** around the numbers are the writer's too: `עמ'` and `דף` are
/// invented here, and this file's own rule is that an invented word takes a
/// `כתובות` answer — a dictionary keyed by ingredient, said either language,
/// because an English sefer citing «p. 47» was previously unwritable.
#let _xa_part(kind, org, cfg) = {
  if org == none { return none }
  let scheme = cfg.at("מספור_כתובת", default: none)
  let words = {
    let w = cfg.at("כתובות", default: (:))
    let out = (:)
    for (k, v) in w { out.insert(_en_params.at(k, default: k), v) }
    out
  }
  if kind == "עמוד" {
    let p = org.page()
    let np = if scheme != none { scheme } else {
      let c = org.page-numbering()
      if c == none { "1" } else { c }
    }
    [#{words.at("עמוד", default: "עמ'")} #numbering(np, p)]
  } else if kind == "דף" {
    let first = cfg.at("דף_ראשון", default: _xa_daf_first)
    let (d, amud) = _xa_daf(org.page(), first)
    [#{words.at("דף", default: "דף")} #_hb_num("א", _hb_mode.get(), d) #{words.at("אמוד", default: "ע\"")}#amud]
  } else if kind == "סימן" {
    let h = _xa_section(org)
    if h == none { none } else {
      // The heading's own body, not a number of our own: a sefer that numbers
      // its simanim has already said how, and one that titles them without
      // numbering them has said that too.
      let n = counter(heading).at(h.location())
      let sch = h.numbering
      if sch == none { h.body } else { [#numbering(sch, ..n)] }
    }
  } else if kind == "שורה" {
    // The line the marker sits on, from the record `par.line`'s own numbering
    // function left behind. See `_ln_at`.
    let n = _ln_at(org)
    if n == none {
      panic(
        "ראש: שורה · אין מספור שורות בספר · an entry cannot be addressed by line "
          + "in a sefer whose lines are not numbered. Turn them on with "
          + "#מסמך(מספור_שורות: true) — the number in the entry is the one the "
          + "reader finds in the margin, and one they cannot see there is one "
          + "they cannot use.",
      )
    }
    let np = cfg.at("מספור_כתובת", default: "1")
    [שורה #numbering(np, n)]
  }
}

/// Whatever `ראש` asked for out of the four, in the order it asked.
#let _eh_addr(cfg, org) = {
  let want = _eh_read(cfg)
  for part in want {
    if _xa_kinds.contains(part) {
      let a = _xa_part(part, org, cfg)
      if a != none {
        // Set apart from the entry rather than run into it — an address is
        // apparatus about the apparatus, and a reader scanning for it down the
        // left of a column should not have to read past the commentary to find
        // the next one.
        [#text(fill: luma(80), a) ]
      }
    }
  }
}

#let _eh_head(cfg, label_, quote) = {
  let want = _eh_read(cfg)
  for part in want {
    if part == "תווית" and label_ != none and label_ != "" {
      [#strong(label_) ]
    } else if part == "ציטוט" and quote != none and quote != "" {
      // Bold and followed by a thin space, which is how a sefer sets a dibbur
      // hamaschil — and through `_mk_render` so it takes the look of the
      // `#דיבור_המתחיל` class, because that is what it *is*.
      [#_mk_render(_mk_conf("דיבור_המתחיל", (:)), quote) ]
    }
  }
}

/// Does this entry head print a number at all?
///
/// Leaving `"מספר"` out of the list is how a writer says *no number* — the
/// fourth of the plan's four ingredients — and it is the one that has to reach
/// the marker rather than the entry, because Typst draws the number itself.
#let _eh_numbered(cfg) = _eh_read(cfg).contains("מספר")

#let _fn_wrap(cfg, tier, body) = {
  let sz = _fn_pick(cfg.at("גודל", default: ()), tier, 0.85em)
  let st = _fn_pick(cfg.at("סגנון", default: ()), tier, "normal")
  let cl = _fn_pick(cfg.at("צבע", default: ()), tier, luma(0))
  // Tier 1 is an ordinary footnote, and since #הערה now *is* tier 1 it has to
  // stay byte-identical to one: a text() wrapper forcing "normal" and black
  // would quietly strip a slant or a colour the surrounding document had set.
  if sz == 1em and st == "normal" and cl == luma(0) { body } else {
    text(size: sz, fill: cl, _ks_style(st, body))
  }
}

// The tiers of the native apparatus, named. A tier IS a channel — the one whose
// source is the tier above it and whose placement is the foot of the page — so
// the seven tier commands are seven built-in channels and this array is where
// they get their names. `#הערה` and `#הערה_א` are one channel and always were;
// see the channel section for what the rest of the model is.
//
// Numbering keys on this name rather than on the tier integer, which is the
// same set for the tier commands and is what lets a channel a writer *declared*
// number on its own without leaving the native apparatus.
#let _ch_tiers = ("הערה", "הערה_ב", "הערה_ג", "הערה_ד", "הערה_ה", "הערה_ו", "הערה_ז")
#let _ch_tier_name(n) = if n >= 1 and n <= _ch_tiers.len() {
  _ch_tiers.at(n - 1)
} else { "הערה_" + str(n) }

// הערה_בדרגה(דרגה, body) — a note in tier `דרגה` (1 = a note on the text, 2 = a note
// ON a tier-1 note, …). Nest freely: #הערה_א[… #הערה_ב[… #הערה_ג[…]]].
//
// Named arguments style THIS note: `#הערה(גודל: 1em, צבע: red)[…]` for the one
// note that has to stand out, without a second `#הגדרות_הערות` line that would
// restyle every note after it. Per-tier tuples still apply to the tiers this note
// is not in, so an override is one entry deep and not a fresh apparatus.
//
// `_ערוץ` and `_מספור` are the channel layer's, not the writer's. A channel is
// what numbers together, and a *declared* channel placed at the page foot is a
// tier of this apparatus with a name and a sequence of its own — so the layer
// above passes both, and a writer who never declares a channel sees exactly the
// per-tier behaviour this apparatus has always had.
#let הערה_בדרגה(דרגה, body, שם: none, ציטוט: none, _ערוץ: none, _מספור: none, ..opts) = context {
  let (own, rest) = _cfg_split(opts.named(), _fn_own_keys)
  let cfg = _cfg_with(_nt_under(_fn_cfg.get()), own)
  // Not ours: handed to `footnote` at both call sites below, so its own error
  // names it. A note takes no other named argument, which is precisely why a
  // silent drop here would be a typo that formats nothing and says nothing.
  let ind = _fn_pick(cfg.at("הזחה", default: ()), דרגה, 0em)
  let lbls = cfg.at("תוויות", default: none)
  let lbl = if type(lbls) == array { _fn_pick(lbls, דרגה, none) } else { none }
  // The tier indent must be INLINE (#h), never a block-level `pad`: a footnote
  // entry lays out as "«number» «body»", so wrapping the body in a block pushes
  // it onto the line below and orphans the number on a line of its own. #h keeps
  // the number and the first words of the note together, which is the whole
  // point of the entry.
  // # `ריווח`, and why the gap is added at the foot of the entry
  //
  // The gap between two footnote entries is `footnote.entry(gap:)` and Typst
  // resolves it **at page level**. Measured, every other lever leaves it at
  // exactly 16.93pt: that same `set` written in the document body, `clearance`,
  // `indent`, a `show footnote.entry: set block(spacing: 6em)`, wrapping the
  // entry in a `block(spacing: 6em)` from a `show` rule in `#מסמך`, and putting
  // `#מסמך`'s own `set` inside a `context` so it could read the writer's value.
  // The identical `set` at `#מסמך`'s own top level moves them 78.73pt — and that
  // level cannot read a state the body sets, because reading one needs a
  // `context` and the `context` is what breaks the reach.
  //
  // So the writer's gap is *drawn* rather than *set*: the difference between
  // what they asked for and what the document is already spacing entries by,
  // added under this entry's own last line. It is legal for that to be negative,
  // which is what lets `ריווח: 0em` tighten a document whose default is looser.
  //
  // Under the body and never over it: a footnote entry lays out as
  // «number» «body», and anything block-level at the *start* pushes the body
  // down and orphans the number on a line of its own.
  //
  // Read per note, at the note's own call site, so a sefer may change it at
  // siman ten and mean it — which is more than the setting Typst provides can
  // do. Untouched unless the writer said so: `_מפורש` records which keys a
  // `#הגדרות_*` call was actually given, so a document that never mentions
  // `ריווח` lays out byte-identically to one written before this existed.
  let extra = if cfg.at("_מפורש", default: ()).contains("ריווח") {
    cfg.at("ריווח", default: _fn_gap_base.get()) - _fn_gap_base.get()
  } else { 0em }
  let entry = _fn_wrap(cfg, דרגה, {
    if ind != 0em { h(ind) }
    _eh_head(cfg, lbl, ציטוט)
    body
    if extra != 0em { v(extra, weak: false) }
  })
  let schemes = cfg.at("מספור", default: none)
  // A channel's own scheme beats the per-tier array: the channel *is* the
  // sequence, and two channels sharing a tier are two sequences.
  //
  // **A single scheme means every tier**, which is `_ap_pick`'s convention for
  // the banded apparatuses and was not this one's: `#הגדרות_הערות(מספור: "א")`
  // fell through the array test and did nothing at all, so the setting worked
  // only when written as a tuple and was silent when written the obvious way.
  let scheme = if _מספור != none { _מספור } else if type(schemes) == array {
    _fn_pick(schemes, דרגה, "1")
  } else if type(schemes) == str {
    schemes
  } else { none }
  // The default channel is numbered by Typst's own footnote counter, which is
  // balanced and free but cannot be restarted - so a note whose count was
  // actually restarted moves onto the same query path every other channel
  // uses. *Whose count was restarted* is the whole question: asked with
  // `_nr_any()` alone it renumbered every nested note into its own colliding
  // 1..N whenever any sefer numbered a list of psakim anywhere in the
  // document. Governance is per note, so the decision sits inside the context
  // below, where the note's location exists.
  let numbered = _eh_numbered(cfg)
  if scheme == none {
    context {
      let loc = here()
      let governed = _nr_any() and _nr_origin(loc) != none
      _fnt_gov.update(governed)
      if not governed {
        if numbered { footnote(..rest, entry) } else { footnote(numbering: _ => [], ..rest, entry) }
      } else {
        // Per-channel numbering for the governed note: Typst has ONE footnote
        // counter, and it cannot be restarted from here - so the number is
        // this note's rank among the real notes of its own channel, read out
        // of a query scoped after the governing restart, exactly as the
        // collect-then-render apparatus does it.
        let key = if _ערוץ != none { _ערוץ } else { _ch_tier_name(דרגה) }
        [#metadata(key)#label("ksav-fnt")]
        let n = _ksav_rank(_nr_scope(selector(label("ksav-fnt")), loc), loc, e => e.value == key)
        footnote(
          numbering: _ => if numbered { _hb_num("1", _hb_mode.get(), n) } else { [] },
          ..rest,
          entry,
        )
        if שם != none { _xn_mark(שם, _hb_num("1", _hb_mode.get(), n)) }
      }
    }
    // The shared-counter note's name-mark, in its own later context: state
    // reads inside one context share one snapshot, so a read beside the
    // footnote saw the counter *before* this note stepped it and every named
    // note recorded its predecessor's number. Here the step has happened.
    if שם != none and not _fnt_gov.get() {
      context _xn_mark(שם, counter(footnote).get().first())
    }
  } else {
    // Per-channel numbering. Typst has ONE footnote counter, and the `numbering`
    // callback is handed that counter's value — so it cannot be used to count a
    // tier. The number is instead this note's *rank among the real notes of its
    // own channel*, read out of a query, exactly as the collect-then-render
    // apparatus does it; the callback then ignores the argument it was given.
    // Read-only, so it converges, and `_ksav_real_of` keeps a body that an
    // apparatus re-displays from being counted twice.
    let key = if _ערוץ != none { _ערוץ } else { _ch_tier_name(דרגה) }
    [#metadata(key)#label("ksav-fnt")]
    context {
      let loc = here()
      let n = _ksav_rank(_nr_scope(selector(label("ksav-fnt")), loc), loc, e => e.value == key)
      footnote(
        numbering: _ => if numbered { _hb_num(scheme, _hb_mode.get(), n) } else { [] },
        ..rest,
        entry,
      )
      // The *printed* number, not the rank: a channel numbered א ב ג is
      // referred to as "עיין הערה ב", and a reference that said 2 would name a
      // note the reader cannot find.
      if שם != none { _xn_mark(שם, _hb_num(scheme, _hb_mode.get(), n)) }
    }
  }
}

// `_en` and not a bare binding, now that these take named arguments: a bare
// binding is the same function under a second name, so `#tier2(size: 1em)[…]`
// would arrive as a Hebrew-named knob spelled in English and be rejected. That
// is the finding this file already recorded once about twelve other aliases —
// *"an English command taking an English parameter"* — and every command that
// grows a named argument joins the list.
//
// The seven tier aliases themselves are declared with the channel commands, one
// section down, because a tier IS a channel and they route through the table.
#let tier = _en(הערה_בדרגה)

// ============================================================
//  A banded apparatus, written once
// ------------------------------------------------------------
//  Three apparatuses below collect notes into named groups and print those
//  groups as stacked bands: #מדור_ (section bands, rendered in the flow at a
//  dump call), #מדף_ (per-page bands, rendered in the page footer) and
//  #הערה_זרם (parallel streams, also in the footer).
//
//  They used to be written out three times. That is not merely long: the
//  א,ב,ג-over-1,2,3 numbering convention shipped backwards, and the correction
//  then had to be made by hand in a second copy of the same array, months later
//  — one decision, two edits, and nothing that would have noticed if only one of
//  them had been made. See `engine/tests/apparatus_golden.rs`, which pins the
//  laid-out page of every one of these knobs, and `engine/tests/apparatus.rs`.
//
//  The three differ in exactly five things, and every one of them is an argument
//  here:
//
//    · which state holds the configuration
//    · which label the notes of this apparatus carry
//    · what a *group* is — a tier integer (bands) or a stream name (streams)
//    · what scope a note is numbered within — the surrounding section (in-flow
//      bands) or the whole document (both footer apparatuses)
//    · what is printed around the bands — a title, a per-band label, per-stream
//      headings, stacked or side by side
//
//  Everything else — the marker, the per-group styling, the entry blocks, the
//  columns, the fixed-height slots, the rules and the dividers — is this code
//  and only this code.
// ============================================================

// The band numbering convention, in one place because it is one decision.
// א,ב,ג for the primary band and 1,2,3 for the notes *on* it: the שער־הציון
// arrangement these bands exist to set — the Mishnah Berurah's letters over the
// Shaar HaTziyun's numbers. This is the array that shipped the other way round,
// backwards against the convention and against the chooser card that described
// it. Nothing in a coordinate dump shows it; it is obvious on the page.
// ---- שולי הטקסט · where the text area ends, in page coordinates ----
//
// A sidenote is `place`d at an absolute y on the page, so keeping it on the
// paper means knowing where the paper's text area stops. Every number a note
// stacks against — its marker's `position().y`, its neighbours' — is already in
// page coordinates, so this is the one missing term.
//
// `page.margin` is whatever was set, and the document wrapper always sets a full
// four-key dictionary. Everything else here is for a document that reached this
// point another way: a bare `#מקטע_עמוד`, a `margin: auto`, a single length for
// all four edges. Typst's own `auto` margin is 2.5/21 of the shorter side, which
// is where that ratio comes from — it is not a guess.
/// How wide a named paper is.
///
/// Only needed by the continuous mode, which sets `height: auto` — and Typst's
/// `paper:` and `width:`/`height:` are alternative spellings of one setting, so
/// asking for one page dimension means giving the other. The four a sefer is
/// actually set on, and the fallback is A4, which is this product's default and
/// what a writer naming something exotic already gets when they misspell it.
#let _pg_paper_width(name) = if name == "a3" {
  297mm
} else if name == "a5" {
  148mm
} else if name in ("us-letter", "letter") {
  216mm
} else {
  210mm
}


/// The last y a note may occupy on this page, or `none` when there is no bottom
/// — `page(height: auto)`, which is the digital output mode, where the page
/// grows instead and overflow is impossible by definition.
#let _pg_text_bottom() = if type(page.height) == length {
  page.height - _pg_margin("bottom")
} else { none }

/// The first y a note may occupy on this page.

#let _ap_numbering = ("א", "1", "a", "i", "*", "א", "1", "a", "i")
#let _ap_columns = (1, 1, 1, 1, 1, 1, 1, 1, 1)
// A band is set apart from the one above it by slant and by grey, not by size
// alone — size is the one axis the two tiered apparatuses genuinely differ on
// (the footer bands run a shade smaller, because they live in the margin).
#let _ap_styles = ("normal", "italic", "italic", "italic", "italic", "italic", "italic", "italic", "italic")
#let _ap_fills = (luma(0), luma(50), luma(80), luma(100), luma(115), luma(115), luma(115), luma(115), luma(115))

// What a knob's value is for THIS group. A dictionary is keyed by group name
// (which is how a stream is identified); an array is per-tier, 1-based, falling
// back outside its range (which is how a band is); anything else is one value
// for every group. Those are not three conventions bolted together — they are
// the three shapes a writer can reasonably answer the question in, and the two
// tiered apparatuses and the named one each only ever used one of them.
#let _ap_pick(cfg, key, g, fb) = {
  let a = cfg.at(key, default: fb)
  if type(a) == dictionary {
    a.at(_as_string(g), default: fb)
  } else if type(a) == array {
    if type(g) == int { _fn_pick(a, g, fb) } else { fb }
  } else {
    a
  }
}
// A declared region height, resolved to something `block(height:)` can be given.
//
// A percentage means a percentage of the SHEET — "make the apparatus a fifth of
// the page" is the only thing a writer means by `20%`, and it is what the Rust
// side reserves off the bottom margin for (`length_cm`). Handed to
// `block(height:)` raw, a ratio resolves against the *enclosing block* instead —
// which for the page-foot apparatus is the reserve block the bands already sit
// inside. So `20%` would come out a fifth of the reserve: a fifth of a fifth,
// and shrinking further the more page the writer asks for. The two halves of the
// feature would disagree about what the writer typed, and only one of them shows
// on the page.
//
// Defined above `_ap_group` and not beside it: a Typst closure captures the
// scope it was written in, so a helper declared after its caller is simply not
// there when the caller runs.
//
// `page.height` needs context, which is why the caller wraps the block in one.
// It is `auto` only when neither a paper nor an explicit height was set, which
// the document wrapper never leaves possible; a region that still cannot resolve
// takes the height it needs rather than a wrong one.
// What one note of a banded apparatus may overrule: its own text, and only that.
// The column count, the fixed heights, the rules, the gaps between bands and
// between entries, the band labels and the stream order all describe the
// arrangement, and a single note inside it has no standing to answer them.
// `מספור` is excluded for the reason given at `_fn_own_keys`. See `_cfg_split`.
// `צף` is not a look and nothing renders it — it is the note telling thing
// four's move eight *"if something has to move, move me"*. It travels in the
// same per-entry dictionary as the looks because that dictionary is already
// carried to the walk that decides, and a second channel for one boolean would
// be a second thing to keep in step.
// ---- חיתוך · the largest piece that fits, and the rest ----
//
// One function, and two problems reduce to it:
//
//   · **a note taller than its region** — the piece that fits this page's slot,
//     and the remainder carried to the next one. The windowed spill draws the
//     whole note through a moving window, which is exact on any content and
//     repeats the text in every frame it passes through; this cuts instead, and
//     gives a clean text layer on the content it can cut.
//   · **the berech** — the piece that fits beside a neighbouring block, and the
//     remainder set full width below it. The knee of a Vilna page.
//
// They looked like different problems for a long time. They are the same
// question asked about a page break and about a corner.
//
// # Why this is not a fold over lines
//
// Typst will not hand back a laid-out line list, so there is nothing to fold.
// What it will do is `measure`, and measure is exact — `measure.ksav` records
// height=210.96pt width=360pt on a real block. So the search is over *prefixes
// of the source*, and the exactness comes from the engine rather than from
// arithmetic about characters per line.
//
// The prior art estimates instead. sefer-engine's spec says "~45–50 Hebrew
// characters per line" and "lines ≈ height / 13.5"; talmudifier repeatedly
// renders test PDFs with line numbers and reads the heights back, which its own
// author calls ponderous and very hacky. One `measure` call answers what a test
// render answers, at compile time, with no file on disk.
//
// # Word granularity, and saying so
//
// The cut is between words. A paragraph break is preferred to a sentence break
// and a sentence break to a plain space, because that is the order a reader
// notices a seam — but a table, a figure or a nested structure has no seam at
// all, and for those this returns the whole thing and no remainder. The caller
// then has to fall back to something that does not cut, which is what the
// window is for. **A cut that silently drops what it cannot divide is the one
// failure this must not have.**
#let _ct_seps = (
  // In order of preference: a paragraph, then a sentence, then a word.
  ("\n\n", 3),
  (". ", 2),
  (" ", 1),
)

/// The words of `s`, with the separator that follows each kept on it.
///
/// Kept rather than dropped so that joining a prefix reproduces the source
/// exactly: a cut that loses the spaces it cut at would reflow the half it kept.
#let _ct_pieces(s) = {
  let out = ()
  let cur = ""
  for c in s.clusters() {
    cur += c
    if c == " " or c == "\n" {
      out.push(cur)
      cur = ""
    }
  }
  if cur != "" { out.push(cur) }
  out
}

/// How good a seam is: 3 at a paragraph, 2 at a sentence, 1 at a word.
#let _ct_rank(piece) = {
  if piece.ends-with("\n") { 3 } else if piece.contains(". ") { 2 } else { 1 }
}

/// The inline elements a note body may be built from and still be cut.
///
/// All of them are **one body with a look on it**, so a word out of one is that
/// word with the same look: `strong[א ב]` cut after `א` is `strong[א]`, and a reader
/// cannot tell the difference. That is not true of a table or a figure, which is
/// why this is a list and not a rule.
#let _ct_inline = (
  "strong", "emph", "underline", "overline", "strike", "highlight", "smallcaps",
  "sub", "super",
)

/// A body as a list of `(content, text)` atoms, one per word, or `none`.
///
/// # Why this exists, and what it cost not to have it
///
/// `_ct_text` answers `none` for anything that is not bare words, and a body it
/// refuses falls back to the window — which slides the whole note by a fixed
/// distance and **cuts through a line of type** to do it. Measured: a forty-word
/// note with **one bolded word in it** came out with a line sliced across two
/// pages, the top half on one and the bottom half on the next. One asterisk was
/// all it took, and words with a look on them are what a note is usually made of.
///
/// So the words come out of the markup rather than the markup disqualifying the
/// words. Each atom is a word *and its own look*, rebuilt from the element's own
/// fields — `fields()` minus the body, handed back to `func()` — so an underline
/// keeps its stroke and a highlight keeps its fill. A word with no look on it
/// stays a bare string, which leaves the ordinary case exactly as it was.
///
/// `none` still means the window, and it still has to: a table has no seam.
#let _ct_split(body) = {
  if body == none { return none }
  let f = repr(body.func())
  if f == "text" {
    let fs = body.fields()
    let raw = fs.at("text", default: "")
    let _ = fs.remove("text")
    let g = body.func()
    return _ct_pieces(raw).map(w => (if fs.len() == 0 { w } else { g(..fs, w) }, w))
  }
  if f == "space" { return ((" ", " "),) }
  if f == "linebreak" { return (("\n", "\n"),) }
  if f == "sequence" {
    let out = ()
    for c in body.children {
      let got = _ct_split(c)
      if got == none { return none }
      out += got
    }
    return out
  }
  if _ct_inline.contains(f) {
    let inner = _ct_split(body.at("body", default: none))
    if inner == none { return none }
    let g = body.func()
    let fs = body.fields()
    let _ = fs.remove("body")
    return inner.map(a => (g(..fs, a.at(0)), a.at(1)))
  }
  // A link, which is the same idea and needs its own two lines.
  //
  // It is not in `_ct_inline` because the rebuild above hands an element's own
  // fields back as **named** arguments, and a link's destination is
  // **positional** — `link(dest: "…", body)` is not a call Typst accepts. So the
  // destination is read off the element and passed where it belongs, and every
  // word of a cut link points where the whole link pointed.
  //
  // Until this was here a note carrying a link fell back to the window and was
  // repeated whole in the text layer of every page it spanned. Nobody was going
  // to find that by reading it: the note prints, in the right place, with every
  // word on it.
  if f == "link" {
    let inner = _ct_split(body.at("body", default: none))
    if inner == none { return none }
    let d = body.dest
    return inner.map(a => (link(d, a.at(0)), a.at(1)))
  }
  none
}

/// The largest prefix of `atoms` that fits, and the rest. See `_ct_fit`.
///
/// The atom list is the general case and a string is a special one: a word with
/// no look on it is its own content. Both go through here, so the seam rule, the
/// binary search and the one-word floor are written once.
#let _ct_fit_atoms(atoms, width, height, תפר: 8, עטיפה: none) = {
  if atoms.len() == 0 { return ((), ()) }
  let join(list) = if list.len() == 0 { [] } else { list.map(a => a.at(0)).join() }
  let set_as(list) = {
    let t = join(list)
    if עטיפה == none { t } else { עטיפה(t) }
  }
  let fits(n) = measure(block(width: width, set_as(atoms.slice(0, n)))).height <= height
  if fits(atoms.len()) { return (atoms, ()) }
  let lo = 0
  let hi = atoms.len()
  while lo < hi {
    let mid = calc.ceil((lo + hi) / 2)
    if fits(mid) { lo = mid } else { hi = mid - 1 }
  }
  // Not one word fits. Give it the one word anyway rather than looping for
  // ever: placed and overfull a reader can see, and a remainder that never
  // shrinks is a note that is never printed.
  if lo == 0 { lo = 1 }
  // Back up to a better seam, but only a little — a paragraph break four words
  // earlier is worth taking and one forty words earlier is a hole in the page.
  //
  // How little is `תפר`, and it is a setting because it is a judgement about
  // *this* sefer: a dense peirush would rather cut mid-sentence than leave a
  // gap, and a wide-set text would rather leave the gap. Eight is what it was
  // when it was a constant, so nothing already set moves. `0` cuts wherever the
  // measure landed and never looks back.
  let best = lo
  let floor = calc.max(1, lo - תפר)
  let i = lo
  while i > floor {
    if _ct_rank(atoms.at(i - 1).at(1)) > _ct_rank(atoms.at(best - 1).at(1)) { best = i }
    i -= 1
  }
  (atoms.slice(0, best), atoms.slice(best))
}

/// A body's slices as content, one per page. See `_ct_pages`.
#let _ct_pages_atoms(atoms, width, height, תפר: 8, עטיפה: none) = {
  let out = ()
  let rest = atoms
  let guard = 0
  while rest.len() > 0 and guard < 64 {
    guard += 1
    let i = out.len()
    let (head, tail) = _ct_fit_atoms(
      rest,
      width,
      height,
      תפר: תפר,
      עטיפה: if עטיפה == none { none } else { t => עטיפה(t, i) },
    )
    if head.len() == 0 {
      out.push(rest)
      break
    }
    out.push(head)
    rest = tail
  }
  out.map(list => if list.len() == 0 { [] } else { list.map(a => a.at(0)).join() })
}

/// The largest prefix of `s` that fits `width` × `height`, and the rest.
///
/// Returns `(ראש, שאר)` — the piece to set here and the piece still to place.
/// `שאר` is the empty string when it all fitted, which is the caller's signal
/// that nothing carries.
///
/// **Binary search, so the cost is logarithmic in the words and not linear.**
/// Typst memoises `measure`, so the same prefix measured on a later layout pass
/// is free; what this costs is about `log2(n)` measures the first time. Seven
/// calls for a hundred and forty words, measured.
/// `עטיפה` is how the caller sets this text, and it is not optional decoration:
/// a prefix measured at the document's size and printed at an apparatus's is
/// measured at the wrong size, and the cut lands in the wrong place by however
/// much the two differ. `none` measures at whatever is ambient, which is right
/// for a caller — `ברך` — that is setting the text in the ambient style.
#let _ct_fit(s, width, height, תפר: 8, עטיפה: none) = {
  let ws = _ct_pieces(s)
  if ws.len() == 0 { return ("", "") }
  // The whole thing, which is the common case and worth not searching for.
  // Answered here rather than inside the search so the string that comes back is
  // the string that went in, character for character.
  let set_as(t) = if עטיפה == none { t } else { עטיפה(t) }
  if measure(block(width: width, set_as(s))).height <= height { return (s, "") }
  // Everything else is `_ct_fit_atoms` with a word for its own content — the
  // binary search, the one-word floor and the seam rule are written once, there,
  // because two copies of a seam rule is two seam rules the day one is changed.
  let (head, tail) = _ct_fit_atoms(
    ws.map(w => (w, w)),
    width,
    height,
    תפר: תפר,
    עטיפה: עטיפה,
  )
  (head.map(a => a.at(1)).join(""), tail.map(a => a.at(1)).join(""))
}

/// The words of a body, when it is made of nothing but words.
///
/// `none` for anything else — a table, a figure, a nested structure — and that
/// `none` is the whole reason there are two mechanisms and not one. Content with
/// no text has no seam to cut at, and for those the window is the answer: exact
/// on any content, at the cost of a text layer repeated on every page the note
/// runs through.
///
/// Typst offers no general content-to-string, but a plain `[…]` is a `text`
/// element and a run of words is a `sequence` of `text` and `space`. Those two
/// shapes are what a note body usually is, and they are the ones worth cutting.
/// Anything else answers `none` and keeps the window — a *partly* cut body would
/// drop whatever could not be sliced, which is the failure this is built against.
#let _ct_text(body) = {
  if body == none { return none }
  let f = repr(body.func())
  if f == "text" { return body.at("text", default: none) }
  if f == "sequence" {
    let out = ""
    for c in body.children {
      let cf = repr(c.func())
      if cf == "text" {
        out += c.at("text", default: "")
      } else if cf == "space" {
        out += " "
      } else if cf == "linebreak" {
        out += "\n"
      } else {
        return none
      }
    }
    return out
  }
  none
}

/// A body's slices, one per page, at a given width and height.
///
/// `עטיפה` takes the text **and which slice it is**, because the first slice is
/// not set like the others: it carries the note's number, and often an address
/// and a lemma before that. Measuring every slice as if it were bare makes the
/// first one a few words too generous, and a few words too generous means one
/// line past a region that clips — which is the silent truncation this whole
/// mechanism exists to end.
///
/// Pure and deterministic, so the walk that decided how many pages a note spans
/// and the renderer that draws one of them can each call it and get the same
/// answer without passing anything between them — the property everything in
/// this apparatus is built on, because the footer may not write state.
#let _ct_pages(s, width, height, תפר: 8, עטיפה: none) = {
  let out = ()
  let rest = s
  // A note that needs more than sixty-four pages of its own region is a document
  // with a different problem; the bound is here so a width that fits nothing
  // cannot spin.
  let guard = 0
  while rest != "" and guard < 64 {
    guard += 1
    let i = out.len()
    let (head, tail) = _ct_fit(
      rest,
      width,
      height,
      תפר: תפר,
      עטיפה: if עטיפה == none { none } else { t => עטיפה(t, i) },
    )
    if head == "" {
      out.push(rest)
      break
    }
    out.push(head)
    rest = tail
  }
  out
}


// ---- ברך · the knee ----
//
// The step where a block indents around its neighbour and the text carries on
// underneath it — the shape of a Vilna daf, where the peirush runs beside the
// gemara and then continues full width below it. The trade calls the step a
// **berech**, a knee; `NOTES-PLAN` says "L-shape" and "Vilna wrap", both
// borrowed from English tooling, and the real word was available all along.
//
// # It is computed, not flowed
//
// Typst cannot flow text out of a narrow region into a wider one: regions in a
// sequence must share a width, which its own creator has said and which the
// sefer-engine survey scores it ❌ for. That ❌ is right about the mechanism and
// wrong as a limit on the page, because the knee does not need flow — it needs
// to know *where* the column runs out, and `measure` answers that exactly.
//
// So: the largest prefix that fits beside the neighbour goes beside it, and the
// rest goes underneath. One `_ct_fit`, and the seam is continuous because the
// two halves are two slices of one string.
//
// Several knees stack: each row is a knee of its own, which is what `vilna.ksav`
// draws by hand and what this replaces.
#let ברך(
  טקסט,
  שכן,
  רוחב: 40%,
  גובה: auto,
  מרווח: 8pt,
) = context {
  let full = page.width - _pg_margin("left") - _pg_margin("right")
  let w = if type(רוחב) == ratio { full * רוחב } else { רוחב }
  let body = _as_string(טקסט)
  // The neighbour's own height is the height of the knee, unless the writer
  // overruled it — the whole point is that the column runs exactly as deep as
  // the thing it is running beside.
  let h = if גובה == auto { measure(block(width: full - w - מרווח, שכן)).height } else { גובה }
  let (ראש, שאר) = _ct_fit(body, w, h)
  grid(
    columns: (w, 1fr),
    column-gutter: מרווח,
    block(width: w, ראש),
    שכן,
  )
  if שאר != "" { block(width: 100%, שאר) }
}
#let knee = _en(ברך)

// ---- רשת_בסיס · the baseline grid ----
//
// Body at 12pt and commentary at 9pt drift against each other even in perfect
// per-page register, and that drift is what makes amateur parallel typesetting
// look wrong: the two columns start level, and by the foot of the page the
// commentary's fourth line sits between the body's third and fourth. A baseline
// grid is the fix — every line in the sefer, at every size, advances by the same
// unit or by a whole multiple of it, so the two columns meet again every line.
//
// **Off by default**, because it is a real constraint on the page and a document
// that never sets two sizes beside each other pays it for nothing.
//
// # It is exact, and that is what `top-edge` buys
//
// Typst's line advance is `leading` plus the distance from the line's top edge
// to its bottom edge, and those edges are font metrics — so the advance of a
// 9pt line in one family is not the advance of a 9pt line in another, and no
// arithmetic on `leading` alone can land both on a grid. Setting the edges to
// `0.75em` and `-0.25em` makes the line box exactly `1em` tall whatever the
// font, and then the advance is exactly `leading + size`. Everything below is
// that one identity solved for `leading`.
//
// The edges are set once, at the document, and only when the grid is on: they
// are a change to how every line is spaced, and a document that did not ask for
// a grid should get its font's own metrics.
#let _bl_edges = (top: 0.75em, bottom: -0.25em)

// The smallest fraction of the type size that still reads as leading. Below
// this the lines touch, so a size too big for one grid step takes two — a 20pt
// heading on a 14pt grid advances 28pt, and lands back on the grid.
// The smallest fraction of the type size that still reads as leading, and the
// multiple of the body size a bare `רשת_בסיס: true` means. Both are settings for
// the same reason everything here is: they are decisions about a page, and the
// numbers that were right for the first sefer are not a law.
#let _bl_min_default = 0.2
#let _bl_ratio_default = 1.4
#let _bl_min_st = state("ksav-grid-min", _bl_min_default)
#let _bl_ratio_st = state("ksav-grid-ratio", _bl_ratio_default)
#let _bl_min = _bl_min_default

/// The leading that puts text of size `s` on a grid of `g`.
#let _bl_lead(g, s, מזערי: _bl_min_default) = {
  let k = 1
  // Passed in rather than read from state: this is called from `#מסמך`'s own
  // `set par`, which is not a context, and a state read there is an error rather
  // than a wrong number — the good kind of failure, but a failure.
  while g * k - s < s * מזערי { k += 1 }
  g * k - s
}

/// The grid leading for an apparatus group set at `sc`, or `none` with no grid.
///
/// **Resolved by the caller and passed in as a plain length**, and that is not a
/// style choice. The first version of this was a `context` block wrapped around
/// the apparatus body — and `measure()` of content with a `context` block inside
/// it returns almost nothing, so every entry measured about half a line, every
/// region looked like it fitted, and not one overflow move ever fired. The walk
/// and the renderer both call this, both from inside a context, and both get a
/// number.
#let _ap_lead(cfg, g, sc) = {
  let grid = _bl_grid.final()
  if grid == none { none } else {
    _bl_lead(grid, _ap_pick(cfg, "גודל", g, 0.85em).to-absolute() * sc, מזערי: _bl_min_st.get())
  }
}

/// The grid unit a document asked for, checked. `true` means *one line of the
/// body*, which is what a writer who wants a grid and does not want to choose a
/// number means; a length is that length; `false`/`none` is off.

#let _bl_read(v, base, ratio: _bl_ratio_default) = {
  if v == none or v == false { return none }
  if v == true or v == auto { return base * ratio }
  if type(v) == length or type(v) == relative { return v }
  panic(
    "מסמך: רשת_בסיס · the baseline grid is a length (רשת_בסיס: 14pt), true for "
      + "one body line, or false to leave it off — got: " + _as_string(v),
  )
}

#let _ap_own_keys = ("גודל", "סגנון", "צבע", "משקל", "צף", "ציטוט")
#let _ap_mark(cfg, g, num) = _hb_num(
  _ap_pick(cfg, "מספור", g, "1"),
  // The apparatus's own answer when it has one, and the sefer's otherwise. A
  // state read rather than a `context` block, so nothing new is introduced into
  // content that gets measured.
  _ap_pick(cfg, "גרשיים", g, _hb_mode.get()),
  num,
)
/// One apparatus's marker, in whatever look the apparatus gave its numbers.
///
/// `סימן` is a dictionary of the ordinary text knobs, so it renders through
/// the same `_mk_render` a mark class does — one renderer for every look in
/// this prelude, which is the whole reason that function is not private to the
/// register.
#let _ap_piece(cfg, body) = _mk_render(cfg.at("סימן", default: (:)), body)
/// The apparatus's own text settings, and the two thing-four moves that are
/// expressed as text settings.
///
/// `יחס` is `"הקטנה"` and `כיווץ` is `"כיווץ_אותיות"`. They are arguments here
/// rather than keys in `cfg` because they are decided **per page** — the same
/// band is set at 100% on one page and 90% on the next — and `cfg` is the
/// document's answer, which does not vary by page. `_ap_assign` decides them and
/// the renderer is handed them, so the two can never drift apart.
#let _ap_wrap(cfg, g, body, יחס: 1.0, כיווץ: 0pt, ריווח_שורה: none) = text(
  size: _ap_pick(cfg, "גודל", g, 0.85em) * יחס,
  fill: _ap_pick(cfg, "צבע", g, luma(0)),
  // Weight, per tier or per stream like the other three. It was the one thing a
  // band could not be given and the one a peirush most often wants: a nusachos
  // apparatus set lighter than the commentary above it says which is which
  // faster than a size does, and a size is what the writer had.
  weight: _ap_pick(cfg, "משקל", g, "regular"),
  tracking: כיווץ,
  // `_ap_styles` ships tier 2 and every tier under it as `"italic"` — so the
  // whole shipped ramp of this apparatus, every band below the first, has been
  // asking for a slant that came back upright.
  {
    set par(..(if ריווח_שורה != none { (leading: ריווח_שורה) } else { (:) }))
    // Line numbers are the **body's**. An apparatus is margin furniture, and it
    // was being numbered along with the prose — a band of commentary came out
    // with stray digits down its edge, and worse, they continued the body's
    // count, so the numbers in the margin stopped meaning what they say.
    set par.line(numbering: none)
    _ks_style(_ap_pick(cfg, "סגנון", g, "normal"), body)
  },
)

// גובה: שורות(3) — a height in the unit the work is actually done in.
//
// A typesetter adds and removes **lines**. Ksav offered points and a percentage
// of the sheet, and neither is a unit anybody doing this thinks in: nobody looks
// at a page and decides the commentary should be 41.6pt. The arithmetic — how
// tall a line of *this* apparatus is, at its size, with its leading, on the grid
// if there is one — is arithmetic the engine already does for other reasons, and
// asking the writer to do it by hand was the whole of the difficulty.
#let שורות(מספר) = (שורות: מספר)
#let lines_of(n) = שורות(n)

/// How tall one line of a given apparatus is.
///
/// One line of an entry, and nothing else.
///
/// `_ap_line_of` is this plus the gap that follows an entry, which is the right
/// unit for *"three lines tall"* — a writer counting lines is counting what they
/// can see, and what they can see includes the space between entries. The window
/// wants the other one: how far down the page the next line of the **same** entry
/// begins, with no gap in it, because there is no next entry involved.
#let _ap_one_line(cfg, g) = measure(
  _ap_wrap(cfg, g, [א], ריווח_שורה: _ap_lead(cfg, g, 1.0)),
).height

/// How far down the page the **next line of the same entry** begins.
///
/// Two lines less one, and not the height of one: a line box is its ascender and
/// descender, and the advance is what the next line starts at. Measured on a
/// 10.2pt band they are 16.83pt and 14.38pt, and using the first as the second
/// is how a window that means to slide two whole lines slides 2.34 of them and
/// cuts the third in half — which is the bug this exists for, one step further
/// in.
#let _ap_advance(cfg, g) = {
  let lead = _ap_lead(cfg, g, 1.0)
  let two = measure(_ap_wrap(cfg, g, [א#linebreak()א], ריווח_שורה: lead)).height
  let one = measure(_ap_wrap(cfg, g, [א], ריווח_שורה: lead)).height
  two - one
}

/// The grid when a document has one — that is the whole point of a grid, that a
/// line is one unit whatever is set on it — and the apparatus's own leading and
/// size otherwise.
#let _ap_line_of(cfg, g) = {
  // **Measured, not derived.** leading + size is the arithmetic and it is not
  // the answer: an apparatus entry is a block with its own spacing, and one line
  // of a 10.2pt band measures 9.37pt where leading + size predicts 18. A writer
  // who says three lines means three of the lines they can see, so the line is
  // the one the page actually has — one entry, with the gap that follows it.
  //
  // One character needs no width to measure, which is why this can live above
  // `_ap_page_width` and be asked before any of the width machinery exists.
  // Bound rather than written as one expression across two lines: a leading `+`
  // on a continuation line is parsed as a second statement, and the block then
  // tries to join two lengths instead of adding them.
  let gap = _ap_pick(cfg, "ריווח_פריט", g, 0.3em).to-absolute()
  _ap_one_line(cfg, g) + gap
}

/// A declared height, or `none` for *as tall as it needs*.
///
/// Four places read a region's `גובה` and each decided for itself what counted as
/// "declared". Three of them tested `!= none`, which let `auto` through — and `auto`
/// is the word a writer reaches for to mean exactly what `none` means here. It
/// came out as **"cannot compare auto and length"** from inside Typst, about a
/// perfectly ordinary thing to write.
///
/// Fixing two of the three left the third, which then failed differently —
/// `none` multiplied by an integer, from a slot that had no height — and that is
/// the shape this repository keeps recording: a class named, one instance fixed,
/// the siblings never swept. So the reading is written once, here, and the four
/// callers ask it.
#let _rg_height_of(rec, key: "גובה") = {
  let h = rec.at(key, default: none)
  if h == auto { none } else { h }
}

#let _ap_fixed_height(h, קו: none) = {
  if type(h) == dictionary and "שורות" in h {
    // The caller's line when it knows one — a region knows its own apparatus's
    // size — and the surrounding text's when it does not.
    h.שורות * (if קו != none { קו } else { par.leading.to-absolute() + text.size.to-absolute() })
  } else if type(h) != ratio {
    h
  } else if type(page.height) == length {
    h * page.height
  } else {
    auto
  }
}

// One banded note. Registers itself in the MAIN FLOW, where writes are legal;
// the footer that later renders it only ever queries, which is what makes a
// per-page apparatus converge at all.
//
//   cfg    — this apparatus's configuration, already read from its state
//   lbl    — the label every note of this apparatus carries
//   scope  — loc ⇒ the selector this note's number is counted within
//   g      — the group: a tier integer, or a stream name
//   own    — this note's own style overrides, travelling with it
//
// `own` rides in the metadata rather than being applied here, because a banded
// note is *styled where it is printed* — down in `_ap_group`, off the collected
// list — and not where it is written. The marker is the one part styled at the
// call site, so `cfg` there is already merged; the entry's own size, slant and
// colour have to reach the band, and this dictionary is the only thing that gets
// there.
/// The entry an apparatus is re-displaying right now, and where it really lives.
///
/// `none` in the body of the sefer, which is where almost every marker is
/// rendered. Set by `_ap_group` around each entry it prints, because a note
/// written **inside another note's body** has its marker rendered there — down
/// in the band, long after the place in the sefer it belongs to.
///
/// `real` is that place: the location of the entry's own registration. `at` is
/// where the re-display of it starts, which is what lets a note inside the entry
/// tell how many of its siblings came before it *within* that entry.
#let _ap_origin = state("ksav-ap-origin", none)

/// Start a deferred section on a fresh page, if it was asked for.
///
/// **The recorded trap:** a page break works in the flow and does nothing
/// inside a container — a `box`, a `block`, a `grid` cell. Every one of the
/// sections below is built inside a `context`, which is *not* a container, so
/// the break has to be emitted there, before the block the section draws, and
/// never from inside the block itself. One helper so there is one answer,
/// called at the same lexical level in all six.
///
/// **Not weak, and that is the whole of why two of these sections did not
/// break.** A weak page break is dropped when what follows it is produced by a
/// `context` — measured: `#מעבר_עמוד`, which is `pagebreak(weak: true)`,
/// written by hand between a paragraph and `#מראה_מקומות()` also produced one
/// page. So the break was correct, emitted in the right place, and thrown away
/// for being weak; two guesses at the lexical level were wrong because the
/// level was never the problem.
///
/// The reason a weak break was reached for — not putting a blank page in front
/// of nothing — is already answered by the caller: every one of these sections
/// asks for the break only when it has something to print.
#let _ap_fresh_page(want) = if want == true { pagebreak() }

#let _ap_note(cfg, lbl, scope, g, body, own: (:), שם: none, אזור: none) = {
  // The registration and its label on **one line**: this is markup, so a
  // newline inside the brackets is a space on the page, and a multi-line
  // version of this block printed a gap in front of every marker in every
  // apparatus.
  //
  // אזור records the region this note was *filed* into, when one collector
  // knows it. Drawing must ask what filing recorded, not re-derive it from
  // the declarations: a note written `#הערה(ערוץ: "c", אזור: "r")` lands in
  // r's window under channel c, which may never have declared any region —
  // and re-deriving answers "c", which loses the entry in silence.
  [#metadata((group: g, body: body, own: own, אזור: אזור))#lbl]
  // Force nested groups to register in this same pass, in a zero-size inline box
  // so it can never break the line the marker sits on — including when a band
  // re-displays this body and the machinery runs again inside it.
  box(place(hide(body)))
  // The marker's number is this note's rank among the *real* notes of its own
  // group in `scope` — read out of a query, never a counter, so it converges and
  // so an apparatus re-display cannot count itself.
  context {
    let loc = here()
    let mine = e => e.value.group == g
    // **Where this marker is being drawn is not where the note is.**
    //
    // The hidden pre-registration above — the one `apparatus_golden.rs` counts
    // and requires exactly one of — is what makes a *nested* note register in
    // the same pass, so a note written inside another note's body has its
    // real registration up in the sefer, at the outer note's own place, and has
    // its marker drawn down in the band when that body is re-displayed. Ranking
    // that marker `.before(here())` counts every sibling registration in the
    // sefer, so **every nested marker printed the last number**: two notes, both
    // reading ב, which is the report.
    //
    // The entries below were right the whole time, because they are numbered by
    // walking the collected list rather than by asking where they are.
    //
    // So a marker inside a re-display is numbered from the entry it is inside:
    // how many of its own group came before that entry in the sefer, plus how
    // many of its siblings this same entry has already printed. In the body of
    // the sefer, where `_ap_origin` is `none`, nothing changes.
    let og = _ap_origin.get()
    let n = if og == none or og.real == none {
      _ksav_rank(_nr_scope(scope(loc), loc), loc, mine)
    } else {
      let before = _ksav_count(_nr_scope(scope(og.real), og.real), og.real, mine)
      let here_in = query(selector(lbl).after(og.at).before(loc)).filter(mine).len()
      calc.max(before + here_in, 1)
    }
    // Through the apparatus's own `סימן`, which is a look for the *number*
    // rather than for the note. They are two decisions: the note sits at the
    // foot of the page in its band, and the number sits in the middle of a
    // sentence the reader is reading — a peirush set 0.8em and grey wants its
    // markers legible, and until this the number had no look at all.
    // …unless this apparatus prints no numbers at all. Leaving `"מספר"` out of
    // `ראש` is how a writer asks for a **markerless** apparatus — the one a sefer
    // sets constantly, where the body carries nothing and the entry is found by
    // its opening words. It was honoured at the entry and not here, so the body
    // still carried a marker pointing at an entry that had no number to match:
    // the worst of both, and the arrangement is the plan's own `[U]` case.
    if _eh_numbered(cfg) { _ap_piece(cfg, super(_ap_mark(cfg, g, n))) }
    // The **printed** number, recorded under the name the writer gave this note
    // — `#הפניה_להערה` reads it. Printed and not the rank, because a band
    // lettered א ב ג is referred to as *"עיין הערה ב"*, and a reference saying 2
    // would name a note the reader cannot find.
    if שם != none { _xn_mark(שם, _ap_mark(cfg, g, n)) }
  }
}

// Every note of an apparatus that is a real note rather than an apparatus
// re-display (see `_ksav_real_of`).
#let _ap_all(lbl) = _ksav_real_of(lbl)

// Number one group's entries. An entry's number is its position among the notes
// of its own group *within the numbering scope*: `shown` is what this band
// prints (this page, or this section), `scope` is what it counts against (the
// whole document for the footer apparatuses, the section for the in-flow one).
// Returns (number, body, own) triples in document order — `own` being that one
// note's style overrides, which the band applies as it prints it.
// Θ(n) and not Θ(n²), by the same argument `_ksav_real_of` makes at :173-190:
// **both lists are already in document order**, and `shown` is a subsequence of
// `mine` — so a number can be *counted* rather than searched for.
//
// This was `mine.position(x => x.location() == e.location())` per shown entry: a
// linear scan of every note in the numbering scope, for every note on the page,
// on every layout pass. The page-band apparatus re-derives its set inside the
// page *footer*, which page breaking runs several times per page, so a 300-page
// sefer paid that square repeatedly. It is the same defect the comment two
// hundred lines up says it fixed, in the function immediately after it.
#let _ap_entries(shown, scope, g) = {
  let mine = scope.filter(e => e.value.group == g)
  let want = shown.filter(e => e.value.group == g)
  // What each entry is numbered, restarts included, or `none` when the document
  // restarts nothing and the cursor below is the whole answer. The markers in
  // the sefer restart through `_nr_scope`; this is the other half, and the two
  // disagreeing is the exact defect `#31` was — one side of an apparatus
  // numbering by position and the other by order.
  let nums = _nr_numbers(mine.map(e => e.location()))
  let out = ()
  let i = 0
  for e in want {
    // Walk forward to this entry. Never backwards: both are in document order,
    // so the cursor only ever advances and the whole loop is one pass of `mine`.
    while i < mine.len() and mine.at(i).location() != e.location() { i += 1 }
    // `at` with a default and not `.own`: a document compiled before this
    // argument existed is not a document to crash on, and the apparatus
    // re-displays its own registrations.
    let own = e.value.at("own", default: (:))
    if i < mine.len() {
      // The entry's own place in the sefer travels with it. A note *inside* this
      // body is numbered from here — see `_ap_origin` — because by the time that
      // note's marker is drawn, "here" is the foot of a page.
      out.push((
        if nums == none { i + 1 } else { nums.at(i) },
        e.value.body,
        own,
        mine.at(i).location(),
      ))
      i += 1
    } else {
      // Not found — which cannot happen for a `shown` drawn from `scope`, and if
      // it ever did, a note printed with no number is better than one printed
      // with somebody else's. Restart the cursor so the rest still number.
      out.push((out.len() + 1, e.value.body, own, none))
      i = 0
    }
  }
  out
}

// A fixed region: the slot a band or a channel occupies whether or not it has
// anything in it this page. Its own function because a *region* can hold more
// than one channel — the slot then belongs to the region and not to any one
// group inside it — and because the answer to "a percentage of what" may be
// written once (see `_ap_fixed_height`).
/// What a box that could not hold its contents says at its edge.
///
/// # Silent is the one thing it may not be
///
/// A region asked to stay fixed — `גלישה: ()`, the empty list of moves — clips
/// what does not fit. That is a real thing to want and was the only behaviour
/// there was before the overflow moves existed, so it stays. What may not stay
/// is that it happened **without saying so**: a note short by four lines looks
/// exactly like a note that was four lines shorter, and nothing on the page
/// tells the reader otherwise. `NOTES-PLAN` thing four says *and always warn*,
/// and this is the page’s half of it.
///
/// It cannot be a compiler warning: Typst 0.15 gives a prelude `panic` and
/// nothing quieter, and refusing to compile is the wrong answer to a writer who
/// asked for a fixed box.
///
/// And it cannot be measured here, which is the part that took two tries. The
/// slot is handed the **region’s furniture** and not only its prose, so
/// `measure` answers 64.26pt for a four-word note in a 34.02pt box and a mark
/// hung on that fires on every fixed box there is. A false alarm on all of them
/// is worse than none. So the fact comes from the walk that decided it —
/// `_ap_fill` knows there was no `"עמוד_הבא"` to move the overflow to — and
/// arrives here through `_ap_setting` beside every other per-page fact.
#let _ap_clip_mark = "…"

#let _ap_slot(h, body, סימן: none, קו: none) = if h == none { body } else {
  context block(width: 100%, height: _ap_fixed_height(h, קו: קו), clip: true, {
    body
    // Inside the clip and against its bottom edge, so it lands on the last
    // line the reader can see — which is where the text they cannot see
    // begins. `place` keeps it out of the flow, so a box that says it clipped
    // clips no more than one that says nothing.
    if סימן != none {
      place(bottom + start, text(fill: luma(120), _as_string(סימן)))
    }
  })
}

/// The width one entry of a page-foot apparatus is set at.
///
/// The text area, divided by the group's own column count — measuring at the
/// wrong width is how a band comes out a line short and the last note is thought
/// to fit when it does not.
#let _ap_page_width(cfg, g) = {
  let w = page.width - _pg_margin("left") - _pg_margin("right")
  let cols = _ap_pick(cfg, "טורים", g, 1)
  if type(cols) == int and cols > 1 { w / cols } else { w }
}

// One group's block: the numbered entries, laid into columns and, if this
// apparatus reserves fixed regions, into a slot of a fixed height that it
// occupies whether or not it has anything in it this page.
//
// `lead` prints INSIDE the columns — a band's own small label belongs at the top
// of its first column. `above` prints outside them — a stream's title spans them.
//
// `גובה: auto` reads the height off this group's own key, which is what a band
// and a lone stream want. `none` says the caller is doing the slot itself —
// a region holding several channels is one slot, not one per channel.
//
// `יחס`, `כיווץ` and `רצף` are thing four's moves as this page decided them, and
// the caller gets them from `_ap_setting` rather than working them out: the walk
// that chose which entries land here measured them at exactly these values, and
// the two disagreeing is how a note ends up in a place the arithmetic did not
// leave room for.
#let _ap_group(
  cfg,
  g,
  entries,
  above: none,
  lead: none,
  גובה: auto,
  יחס: 1.0,
  כיווץ: 0pt,
  רצף: false,
  ריווח_שורה: none,
  הסט: 0pt,
  חלון: 0pt,
  מנה: 0,
  // Whether this page had to mask part of this group. Only a box that cannot
  // spill ever does, and it may not do it in silence — see `_ap_slot`.
  חתוך: false,
  סימן_חיתוך: auto,
) = {
  // Line numbers belong to the **body**, and an apparatus is furniture. `_ap_wrap`
  // has said so since a band of commentary came out with stray digits down its
  // edge continuing the body's count — but `_ap_wrap` is the banded renderer, and
  // a *collected* region does not go through it. So a region at the back of the
  // sefer went on numbering its own lines, invisibly on most pages and visibly on
  // the page where the region sat beside the margin.
  //
  // That was a cosmetic fault until the line **address** was built on the same
  // record, at which point it became a wrong answer: the apparatus's own lines
  // were in the record, and an entry near the foot of the text was addressed to
  // one of them. Measured, off by one and pointing at nothing.
  set par.line(numbering: none)
  above
  // One entry, marker and body, at whatever this page's settings are. Shared by
  // both arrangements below so that run-in and stacked cannot drift in what an
  // entry *is* — only in how they are joined.
  let one(num, body, own, org) = {
    // One entry's own overrides apply to the entry and to nothing else — the
    // gap between entries and the column count belong to the band, not to a
    // note inside it, so they stay read off `cfg`.
    let ecfg = _cfg_with(cfg, own)
    // One slice of an entry, with whatever stands in front of it.
    //
    // Slice zero carries the note's furniture — where it belongs, what it is on,
    // and its number — and the continuations carry none of it, which is how a
    // continued note has always been set and also what the window does on its
    // own, since the marker is at the top of the note and has slid out of the
    // slot. A sefer that wants the number repeated on every page of a long note
    // says so with `סימן_בהמשך`, and then the two mechanisms still agree.
    //
    // For slice zero of an unspilled note this is the markup it always was, to
    // the byte. Two tests in `apparatus.rs` read the adjacency of the number run
    // and the body run, and they are reading these two runs.
    let marked(b, i) = {
      let again = i > 0 and not _ap_pick(cfg, "סימן_בהמשך", g, false)
      // Where this entry belongs and what it is on, before the entry itself.
      // Both are empty content in an ordinary numbered apparatus, which is why
      // the bracketed markup below is unchanged in that case.
      let head = if again { [] } else {
        _eh_addr(ecfg, org)
        _eh_head(ecfg, none, ecfg.at("ציטוט", default: none))
      }
      if _eh_numbered(ecfg) and not again {
        [#head#_ap_piece(ecfg, super(_ap_mark(ecfg, g, num))) #b]
      } else {
        [#head#b]
      }
    }
    // **Cut the words where there are words, and slide the whole thing where
    // there are not.**
    //
    // A note taller than its region spills across several pages, and two
    // mechanisms can show one page's share of it. They fail in opposite
    // directions, so the engine keeps both:
    //
    //   *The window* emits the note whole into every page it runs through and
    //   paints all but this page's share outside the slot. Exact on any content —
    //   a table, an image, a nested apparatus — and the note lands in the text
    //   layer of every one of those pages, so extraction, copy, DOCX export and
    //   this application's own search of the printed page each find it once per
    //   page it passes through.
    //
    //   *The cut* gives each page only its own words. A clean text layer, and it
    //   is possible exactly when the body is words, which `_ct_text` answers.
    //
    // Decided here, per entry, and not once for the group: a continuation page's
    // region can hold the spilling note *and* a note that begins on that page,
    // and the second one is not spilling — it must be neither cut nor slid.
    let piece = 0
    let shift = 0pt
    // How tall the window is, in whole lines. `0pt` for everything that is not
    // being windowed, which is everything except an entry with no words in it.
    let pane = 0pt
    let body = body
    if חלון > 0pt {
      let wrap(t, i) = _ap_wrap(
        ecfg,
        g,
        marked(t, i),
        יחס: יחס,
        כיווץ: כיווץ,
        ריווח_שורה: ריווח_שורה,
      )
      let w = _ap_page_width(cfg, g)
      // Only what is genuinely taller than the slot. The offset belongs to the
      // region, and an entry that fits was never spilling, whatever it is
      // sharing the region with.
      if measure(box(width: w, wrap(body, 0))).height > חלון {
        piece = מנה
        // Bare words first, because that is what most notes are and a string
        // cut and rejoined is the same string. Then words **with a look on
        // them** — bold, italic, an underline — which used to be enough on its
        // own to send a note to the window. Only content with no words in it at
        // all falls through, and for that there is nothing to cut at.
        let seam = _ap_pick(cfg, "תפר", g, 8)
        let words = _ct_text(body)
        let parts = if words != none {
          _ct_pages(words, w, חלון, תפר: seam, עטיפה: wrap)
        } else {
          let atoms = _ct_split(body)
          if atoms == none { none } else {
            _ct_pages_atoms(atoms, w, חלון, תפר: seam, עטיפה: wrap)
          }
        }
        if parts == none {
          // `move` shifts **paint and not layout**, which is what the window
          // needs: the block stays where it is on every page and the content
          // slides up inside it, so page two resumes exactly where page one
          // stopped and nothing is lost.
          shift = הסט
          // …and it is clipped to a whole number of lines rather than to the
          // slot, for the same reason the walk slides it by a whole number of
          // lines: 34.02pt of region against a 14.38pt advance is 2.34 lines,
          // and the slot's own clip cut the third one in half — top of the
          // glyphs on one page, bottom on the next. Two whole lines and 5.26pt
          // of white space under them, which is what white space is for.
          //
          // The same arithmetic as `_ap_fill`'s, from the same two numbers, so
          // the two agree without being told: any other way of saying it is a
          // second opinion about where the page breaks.
          let adv = _ap_advance(ecfg, g)
          pane = if adv > 0pt and adv <= חלון {
            calc.floor(חלון / adv) * adv
          } else {
            חלון
          }
        } else {
          // Past the last slice is an empty page of region, which happens when
          // the walk reserved one more page than the cut needed. Empty and not
          // a repeat: a repeat is the defect.
          body = if piece < parts.len() { parts.at(piece) } else { [] }
        }
      }
    }
    let drawn = _ap_wrap(
      ecfg,
      g,
      {
        // Say which entry is being re-displayed, and from where, for the
        // length of its body only. A note inside it reads this instead of
        // asking where it is standing; a note anywhere else finds `none` and
        // is numbered exactly as before. See `_ap_origin`.
        //
        // **Outside the entry's own content, and that is not cosmetic.** The
        // first draft put these inside the `[…]`, between the marker and the
        // body — and a `context` lands a zero-width run there, so the run
        // immediately before an entry's body stopped being its number. Two
        // tests in `apparatus.rs` read exactly that adjacency to check that a
        // band restarts its numbering per section and that parallel streams
        // count independently, and both failed on correct numbering.
        //
        // It is also why `marked` is measured and this block is not: `measure`
        // of content holding a `context` comes back at almost nothing, and a
        // cut computed from that would put one word on each page.
        context { _ap_origin.update((real: org, at: here())) }
        marked(body, piece)
        _ap_origin.update(none)
      },
      יחס: יחס,
      כיווץ: כיווץ,
      ריווח_שורה: ריווח_שורה,
    )
    if pane == 0pt {
      drawn
    } else {
      block(height: pane, clip: true, move(dy: -shift, drawn))
    }
  }
  let inner = {
    lead
    if רצף {
      // `"רצף"` — thing four's move four. The whole band is one paragraph, so
      // twelve one-line notes are three lines instead of twelve. The entries are
      // separated by a space and nothing else: a rule or a bullet between them
      // would put back most of the height the move exists to save.
      for (n, (num, body, own, org)) in entries.enumerate() {
        if n > 0 { h(0.6em) }
        one(num, body, own, org)
      }
    } else {
      for (num, body, own, org) in entries {
        block(
          // Through `_ap_pick`, like every other knob here: the gap is per-group
          // once a region can ask to be compressed, and read with a bare `.at`
          // it arrives as the whole dictionary and stops the compile.
          spacing: _ap_pick(cfg, "ריווח_פריט", g, 0.3em),
          one(num, body, own, org),
        )
      }
    }
  }
  let cols = _ap_pick(cfg, "טורים", g, 1)
  let filled = if cols > 1 { columns(cols, inner) } else { inner }
  // The slice a spilling note shows is decided in `one` above, per entry. It used
  // to be decided here, for the whole group at once, and that was wrong twice
  // over: a note that begins on a continuation page was slid off with the note it
  // was sharing a region with, and a group could never cut when it could have.
  _ap_slot(
    if גובה == auto { _ap_pick(cfg, "גבהים", g, none) } else { גובה },
    filled,
    סימן: if not חתוך { none } else if סימן_חיתוך == auto { _ap_clip_mark } else { סימן_חיתוך },
    // The line the walk budgeted with — a `שורות` height resolved here against
    // the ambient text instead answers a different number than the one that
    // decided what fits.
    קו: _ap_line_of(cfg, g),
  )
}

// The apparatus block itself: the rule above it, the groups, and a short divider
// between adjacent ones. Bracketed by the open/close markers that tell
// `_ksav_real_of` a registration in here is a re-display and not a new note —
// without which the raw query grows on every layout pass and nothing converges.
#let _ap_bands(
  cfg,
  groups,
  block_of,
  head: none,
  rule_gap: 0.25em,
  divider: 35%,
  side: false,
) = {
  _ksav_ap_open
  head
  if cfg.at("קו", default: true) {
    line(length: 100%, stroke: 0.5pt + luma(140))
    v(rule_gap)
  }
  if side {
    // side by side: one equal column per group
    grid(columns: groups.map(_ => 1fr), column-gutter: 1.2em, ..groups.map(block_of))
  } else {
    // stacked: one above the other, divided by a short rule
    for (i, g) in groups.enumerate() {
      block_of(g)
      if i < groups.len() - 1 {
        let gap = cfg.at("ריווח_בין", default: 0.4em)
        v(gap)
        if cfg.at("קו_בין", default: true) {
          line(length: divider, stroke: 0.4pt + luma(185))
          v(gap)
        }
      }
    }
  }
  _ksav_ap_close
}

// ---- גלישה בשולי העמוד · spill, for the apparatus that lives in the footer ----
//
// # The nine-note cap, and why it is not a robustness concern
//
// A page-foot apparatus renders into the page **footer**, which lives in the
// bottom margin and cannot reserve space for itself — so `#מסמך(אזור_הערות:)`
// takes the room off the margin and the bands are drawn in a clipped block of
// exactly that height. Anything past it was clipped: `boxover.ksav`, twenty
// notes, **nine distinct positions**, the other eleven printed on top of each
// other and the last of them past the page number at y=802.57.
//
// A study of a real published sefer measured **five times more note text than
// body text**. A mechanism that holds nine of them is not failing at the
// margins; it is failing at the normal case.
//
// # Why this converges, which is the whole difficulty elsewhere
//
// Three independent systems fail at this point — Typst's own footnote spill had
// an infinite-loop bug, SILE's parallel package hangs, talmudifier pays five
// minutes a page — and every one of them fails because the region *grows*: a
// taller band means less text, which means a different break, which means
// different notes, which means a different height.
//
// **This region does not grow.** Its height is *declared*, so moving a note from
// one page to the next changes nothing about the text area, moves no page break,
// and therefore cannot change which notes are anchored where. The walk below is
// read-only and gives the same answer on every pass.

/// The height `#מסמך` reserved at the foot of every page, put where the
/// read-only footer can see it.
#let _ap_reserve = state("ksav-ap-reserve", 0pt)

/// The room a page-foot apparatus has when no reserve was declared.
///
/// `#מסמך` sets the page margins before any `#אזור` line in the body has run, so
/// a region cannot enlarge the reserve it needs — which left every document that
/// declared `#אזור(גובה:)` and no `אזור_הערות` with **no bound at all**: the
/// footer's clipping block is written inside `if reserve != 0pt`, so the one case
/// that most needs a bound was the one branch that could not reach it. That is
/// the single configuration behind the truncated notes, the reading that looked
/// like printing off the paper, and the region heights that did nothing.
///
/// So the bottom margin is the bound instead, less the page number and its
/// clearance. Seven tenths is not measured, it is chosen: the number needs a
/// line and a little air, and a fraction resolves against any margin without
/// needing a context to work it out.
#let _ap_free = state("ksav-ap-free", 0pt)
/// The room a band **above** the text has.
///
/// The top margin, less the running head and its clearance — the same share the
/// foot leaves for the page number, and for the same reason: the furniture that
/// was already there does not move to make space for an apparatus.
#let _ap_free_top = state("ksav-ap-free-top", 0pt)

/// A margin reserved for notes beside the text, for the whole document.
///
/// The mirror of `אזור_הערות`, and for the same reason. A side column needs the
/// body narrowed to make room, and the only thing that could narrow it was
/// `#עם_הערות_צד` wrapped around the prose — so `#ערוץ("x", מיקום: "חוץ")` on its
/// own declared a placement with nowhere to land, and every note in it fell back
/// to a footnote at the foot of the page. A declaration that quietly becomes a
/// different arrangement is the thing this whole model exists to stop.
///
/// With a reserve the column *is* the reserved strip: the page gives the margin,
/// and the column does not carve a second one out of what is left.
#let _sn_reserve = state("ksav-sn-reserve", 0pt)

/// The strip a side note may use when the document reserved nothing and the
/// prose was never wrapped.
///
/// The same answer the page foot gives: the margin that is already there. A note
/// in a channel the writer *placed* at the side used to fall back to a
/// **footnote** — it printed, at the bottom of the page, in an arrangement they
/// had not asked for and were not told about. A gloss in the ordinary margin is
/// what `מיקום: "חוץ"` says, and the ordinary margin is wide enough to hold one.
///
/// Narrower than a reserved column on purpose: this is space the page already
/// had rather than space taken from the prose, so the body does not move and
/// adding a side channel to a finished sefer does not re-paginate it.
#let _sn_free_share_default = 0.8
#let _sn_free_share_st = state("ksav-sn-free-share", _sn_free_share_default)
#let _sn_free_share = _sn_free_share_default
#let _sn_free() = calc.max(_pg_margin("left"), _pg_margin("right")) * _sn_free_share_st.get()


/// Whether this sefer is bound — laid out as facing pages with mirrored margins.
///
/// Recorded rather than read back off `page.margin`, which comes back **resolved**
/// in a context: a two-sided document sets `inside`/`outside` and reads back
/// `left`/`right`, so asking the page whether it is two-sided always answered no.
/// A margin apparatus that is meant to swap edges on facing pages therefore never
/// swapped, silently, on every bound document.
#let _pg_two_sided = state("ksav-two-sided", false)
// What share of the margin an apparatus may use when nothing was reserved.
// The rest is the page number and its clearance at the foot, the running head at
// the top. Settable because how much air a sefer keeps under its text is a house
// decision, and 0.7 is only what it was when it was a constant.
#let _ap_free_share_default = 0.7
#let _ap_free_share_st = state("ksav-free-share", _ap_free_share_default)
#let _ap_free_share = _ap_free_share_default

/// How much room a page-foot region actually has.
///
/// The declared reserve when there is one, and otherwise the bottom margin,
/// which is where the footer draws. A region may **declare** any height it likes
/// — `#אזור("צר", גובה: 2cm)` — and that declaration is a request, not a fact
/// about the paper: five notes into a 2cm region on a sheet with 42.87pt under
/// the text block printed the fifth at y=853.90 on an 841.89pt page, which is
/// off the paper and is the one thing decision 6 forbids. So the declared height
/// is clamped here, once, and both the walk that decides what fits and the slot
/// that draws it read the clamped value — the two disagreeing being the defect
/// this whole section exists to prevent.
#let _ap_room(איפה: "רגל") = {
  // The band above the text: its own room, and never the page-foot reserve.
  // `אזור_הערות` reserves at the bottom, and a top band that read it would be
  // sized by a number about the other end of the sheet.
  if איפה == "למעלה" {
    let ft = _ap_free_top.get()
    return if ft > 0pt { ft } else { _pg_margin("top") * _ap_free_share_st.get() }
  }
  let r = _ap_reserve.get()
  if r > 0pt { return r }
  // What the footer will actually clip to, so the walk that decides what fits
  // and the block that draws it are working from one number.
  let f = _ap_free.get()
  if f > 0pt { return f }
  // No reserve was declared, so the room is whatever is under the footer where
  // it actually starts — which is **not** the bottom margin. The page number
  // and its clearance live in that margin too, and on a default sheet the
  // footer opens 17.4pt below the text block: 42.87pt of margin, 25.47pt of
  // room. Taking the margin for the room is how five notes declared into a 2cm
  // region printed the fifth at y=853.90 on an 841.89pt page.
  //
  // Read off `here()` because that is the only place the answer is true, and
  // bounded by the margin so that a call from anywhere else — the page count in
  // `#מסמך` asks the same question from the body — gets the conservative answer
  // rather than most of a page. Conservative is the safe direction: it counts
  // more pages than the footer will use, and a page too many is blank where a
  // page too few loses a note.
  let m = _pg_margin("bottom")
  let under = page.height - here().position().y
  if under < m { calc.max(0pt, under) } else { m }
}
// חריגה — what happens when a region declares more room than the page has.
//
// `#אזור("צר", גובה: 2cm)` on a sheet with 25.47pt under the footer is asking
// for something the page cannot give, and there are two honest answers and one
// dishonest one. The dishonest one is to hand back a 2cm region that is not 2cm
// and say nothing, which is what happened before the room was measured at all.
//
//   · `"צמצום"` — clamp it to what there is. Today's behaviour and the default,
//     so nothing already written changes, and nothing prints off the paper.
//   · `"סירוב"` — refuse, and say what would have fitted. The honest one for a
//     sefer being set to a fixed design, where a region silently 30pt shorter
//     than it was drawn in the specification is a fault to find now rather than
//     at the printer.
//
// It is a setting rather than a decision because the two are genuinely different
// jobs: a draft wants to keep going, a final wants to be told.
#let _rg_over = ("צמצום", "סירוב")
#let _rg_over_default = "צמצום"

#let _ap_fit_room(h, איפה: "רגל", קו: none, חריגה: _rg_over_default, מי: none) = {
  // `auto` is a height, and it is the one a writer reaches for to say *as tall as
  // it needs*. It used to reach here and be compared against a length, which is
  // not an error Typst has a Ksav sentence for: `#אזור("צר", גובה: auto)` came
  // out as **"cannot compare auto and length"**, from inside the engine, about a
  // perfectly ordinary thing to write.
  //
  // It means what `none` means — take the height from the content — so it is
  // answered here rather than at each of the three places that read a height,
  // and the second one is not hypothetical either: `_ap_fixed_height` hands back
  // `auto` of its own accord for a percentage height on a page that is itself
  // `auto` tall, which is every continuous-mode document.
  if h == none or h == auto { return none }
  let want = _ap_fixed_height(h, קו: קו)
  if want == auto { return none }
  let room = _ap_room(איפה: איפה)
  if want > room and _val(חריגה) == "סירוב" {
    // Advice that fits where the region sits: a band above the text takes no
    // page-foot reserve, and being told to grow one would send the writer to a
    // knob that changes nothing.
    let how = if איפה == "למעלה" {
      "Raise #מסמך(חלק_שוליים_רגל: …)"
    } else {
      "Reserve more with #מסמך(אזור_הערות: …)"
    }
    panic(
      "אזור" + (if מי != none { " " + מי } else { "" })
        + ": גובה גדול מן המקום · this region asks for "
        + _as_string(calc.round(want.pt(), digits: 1))
        + "pt and the page has "
        + _as_string(calc.round(room.pt(), digits: 1))
        + "pt under the text. " + how + ", ask for "
        + "less, or set חריגה: \"צמצום\" to take what there is.",
    )
  }
  calc.min(want, room)
}

// ---- גלישה · what a full region does, as the writer's own list ----
//
// `NOTES-PLAN` thing four names ten moves and decision 15 says **the writer can
// pick** — so `גלישה` takes an **array**, in the order they should be tried, and
// not one value. That is not a detail: the moves are not alternatives. A writer
// wants *compress, then spill*, and the order is the policy. One value per region
// would have been the menu of arrangements decision 10 rules out.
//
// # Three of the ten are the invariant and are refused by name
//
// Clamp, shift-both-ways and cascade are not choices. Decision 6 says a note is
// never printed off the paper and never on top of another note, and those three
// are how that is kept — so they run unconditionally on every region, and a
// writer who lists one is told so rather than being handed a word that reads
// like a switch and is not one. `_ap_spill_always` is that message.
//
// # The order is read against `עמוד_הבא`
//
// Spill is the strongest move and the pivot of the list. Everything written
// **before** it is a way of making this page's demand smaller, tried in turn
// until the page fits — so `("הקטנה", "עמוד_הבא")` shrinks rather than spills,
// and `("עמוד_הבא", "הקטנה")` spills rather than shrinks. Everything written
// **after** spill is for what spill cannot help: a single entry taller than the
// whole region, which has nowhere to go and would otherwise be clipped.
//
// # The seven that are built
//
//   · `"דחיסה"`        compress to the minimum gap — none at all
//   · `"רצף"`          run the region in: one paragraph, not a block each
//   · `"הקטנה"`        drop a type size, down the ladder, to a floor
//   · `"כיווץ_אותיות"` tighten the letterforms
//   · `"חלוקה"`        redistribute inside a fixed total
//   · `"צף"`           the notes marked `צף: true` are the ones that move
//   · `"עמוד_הבא"`     spill to the next page — the default
//
// and `()`, the empty list: a fixed box that stays fixed and clips, which is a
// real thing to want and was the only behaviour available before any of this.
#let _ap_spill_moves = (
  "דחיסה", "רצף", "הקטנה", "כיווץ_אותיות", "חלוקה", "צף", "עמוד_הבא",
)
#let _ap_spill_always = ("הזזה", "מפל", "הצמדה")
#let _ap_spill_default = ("עמוד_הבא",)

// How far `"הקטנה"` will go, and in what steps. Read from the region as
// `הקטנה_מזערית` so a writer who will not go below 90% can say so; the default
// floor is 80%, which is one clear type size down and no more. The walk stops at
// the first rung that fits, so a page that needs 3% smaller is set 5% smaller
// and not 20%.
#let _ap_shrink_floor = 0.8
#let _ap_shrink_step = 0.05
#let _ap_shrink_ladder(floor, step) = {
  let out = (1.0,)
  let s = 1.0
  // A step of nothing would loop for ever, and a writer who says so means "do
  // not shrink" — which is what leaving "הקטנה" off the list already says.
  if step <= 0.0 { return out }
  while s - step >= floor - 0.0001 {
    s -= step
    out.push(calc.round(s, digits: 4))
  }
  out
}
// How much `"כיווץ_אותיות"` takes out between the letters. Small on purpose:
// character-level tightening is the move that is invisible when it works and
// unreadable when it is overdone, and Hebrew has no ligature slack to spend.
#let _ap_tracking = -0.015em

/// A `גלישה` value, checked. `auto` is the default policy.
#let _ap_spill_read(who, v) = {
  if v == auto or v == none { return _ap_spill_default }
  // Said in whichever language the writer said it in, and compared in one.
  // Without this the English spellings above are accepted by the parameter table
  // and then rejected by the move table, which is a worse failure than having no
  // English name at all: the name exists, and using it is an error.
  let list = (if type(v) == array { v } else { (v,) }).map(_val)
  for m in list {
    if _ap_spill_always.contains(m) {
      panic(
        who + ": " + _as_string(m) + " תמיד פועלת · this move always applies and "
          + "cannot be listed: clamping, shifting in both directions and "
          + "cascading are how a note is kept on the paper and off its "
          + "neighbours, which is an invariant and not a setting.",
      )
    }
    if not _ap_spill_moves.contains(m) {
      panic(
        who + ": גלישה לא מוכרת · unknown overflow move: " + _as_string(m)
          + " (" + _ap_spill_moves.join(" · ") + " · () כדי לא לגלוש כלל)",
      )
    }
  }
  list
}

/// The moves that shrink this page's demand, in the order they were written.
#let _ap_before_spill(moves) = {
  let i = moves.position(m => m == "עמוד_הבא")
  if i == none { moves } else { moves.slice(0, i) }
}
/// The moves kept back for what spill cannot help — an entry taller than the
/// region it is in, which has no next page to go to that would be any roomier.
#let _ap_after_spill(moves) = {
  let i = moves.position(m => m == "עמוד_הבא")
  if i == none { () } else { moves.slice(i + 1) }
}

/// Whether this note said it may float — `#הערה(צף: true)`, thing four's move
/// eight. It does not make the note move; it makes it the one that moves.
#let _ap_floats(e) = {
  let v = e.value.at("own", default: (:)).at("צף", default: false)
  _val(v) == true
}

/// One entry, as tall as it is at this scale and this tracking.
///
/// Measured with a stand-in marker rather than the real number. The height of an
/// entry at a given width does not depend on whether its marker reads 1 or 17;
/// the *width* would, and nothing here asks about width.
#let _ap_entry_height(all, j, cfg, g, sc, tr) = measure(box(
  width: _ap_page_width(cfg, g),
  _ap_wrap(
    cfg, g, [#super[1] #all.at(j).value.body],
    יחס: sc, כיווץ: tr, ריווח_שורה: _ap_lead(cfg, g, sc),
  ),
)).height

/// What a run of entries asks for, at this scale, tracking and gap.
///
/// `runin` is `"רצף"`: the entries are one paragraph, so the run is measured
/// whole rather than summed — which is the entire saving, since a band of twelve
/// one-line notes run in is three lines and not twelve.
#let _ap_demand(all, idxs, cfg, g, sc, tr, gap, runin) = {
  if idxs.len() == 0 { return 0pt }
  if runin {
    measure(box(
      width: _ap_page_width(cfg, g),
      _ap_wrap(
        cfg,
        g,
        {
          for (n, j) in idxs.enumerate() {
            if n > 0 { h(0.6em) }
            [#super[1] #all.at(j).value.body]
          }
        },
        יחס: sc,
        כיווץ: tr,
        ריווח_שורה: _ap_lead(cfg, g, sc),
      ),
    )).height
  } else {
    let t = 0pt
    for j in idxs { t += _ap_entry_height(all, j, cfg, g, sc, tr) + gap }
    t
  }
}

/// `"חלוקה"` — redistribute inside a fixed total.
///
/// Thing four's move nine, and the one with the property nothing else here has:
/// **the total never changes, so nothing above it moves.** Two bands sharing 6cm
/// get 4 and 2 rather than 3 and 3, and the page is the same page. Only
/// meaningful when every group on the page has a declared slot — with no
/// declared total there is nothing to hold constant, and the shared reserve is
/// already elastic.
///
/// A group that wants less than its proportional share keeps what it wants, and
/// the surplus goes to the ones that wanted more. One pass settles it, because
/// after the modest groups are paid the rest are all hungry by construction.
#let _ap_redistribute(caps, wants, order) = {
  let total = 0pt
  let need = 0pt
  for k in order {
    total += caps.at(k)
    need += wants.at(k)
  }
  if need <= 0pt or total <= 0pt { return caps }
  let out = (:)
  let left = total
  let hungry = ()
  for k in order {
    let share = total * (wants.at(k) / need)
    if wants.at(k) <= share {
      out.insert(k, wants.at(k))
      left -= wants.at(k)
    } else {
      hungry.push(k)
    }
  }
  let hneed = 0pt
  for k in hungry { hneed += wants.at(k) }
  for k in hungry {
    out.insert(k, if hneed > 0pt { left * (wants.at(k) / hneed) } else { 0pt })
  }
  out
}

/// One page's worth: which of `cands` print here, how they are set, and what
/// carries to the next page.
///
/// The scale and the tracking are decided **per group per page and not per
/// note**, and that is deliberate: two entries in one band set at two sizes for
/// a reason the reader cannot see is worse than a band that is uniformly a
/// little smaller. It is the same argument the `דחיסה` gap is settled by.
#let _ap_fill(all, cands, cfg, cap_of, policy_of) = {
  let order = ()
  let by = (:)
  let gof = (:)
  for j in cands {
    let g = all.at(j).value.group
    let k = str(g)
    if not order.contains(k) {
      order.push(k)
      by.insert(k, ())
      gof.insert(k, g)
    }
    by.insert(k, by.at(k) + (j,))
  }
  let gaps = (:)
  let runins = (:)
  let caps = (:)
  let wants = (:)
  for k in order {
    let g = gof.at(k)
    let moves = policy_of(g)
    gaps.insert(
      k,
      if moves.contains("דחיסה") {
        0pt
      } else {
        _ap_pick(cfg, "ריווח_פריט", g, 0.3em).to-absolute()
      },
    )
    runins.insert(k, moves.contains("רצף"))
    caps.insert(k, cap_of(g))
    wants.insert(
      k,
      _ap_demand(all, by.at(k), cfg, g, 1.0, 0pt, gaps.at(k), runins.at(k)),
    )
  }
  // Redistribution is a property of the page, not of one band: it only means
  // anything when several groups share a declared total, so it is asked of the
  // page and answered once.
  let redis = order.len() > 1 and order.any(k => policy_of(gof.at(k)).contains("חלוקה"))
  let fixed = order.all(k => {
    let c = caps.at(k)
    c != none and c > 0pt
  })
  if redis and fixed { caps = _ap_redistribute(caps, wants, order) }

  let placed = ()
  let over = ()
  // Which groups had to clip. See the placement loop and `_ap_slot`.
  let cut = (:)
  let scales = (:)
  let tracks = (:)
  let spans = (:)
  // How far a windowed note slides between pages. Not the slot: see `steps`
  // below, and `_ap_on_page`.
  let steps = (:)
  for k in order {
    let g = gof.at(k)
    let moves = policy_of(g)
    let pre = _ap_before_spill(moves)
    let post = _ap_after_spill(moves)
    let can_spill = moves.contains("עמוד_הבא")
    let cap = caps.at(k)
    let gap = gaps.at(k)
    let runin = runins.at(k)
    let idxs = by.at(k)
    // `"צף"` — the notes that may float are placed after the ones that may not,
    // so when something has to go to the next page it is one of them. Their
    // numbers are unchanged: an apparatus is numbered by rank in the document,
    // never by order on the page, which is exactly what lets a float float.
    if moves.contains("צף") {
      idxs = (
        idxs.filter(j => not _ap_floats(all.at(j)))
          + idxs.filter(j => _ap_floats(all.at(j)))
      )
    }
    let floor = _ap_pick(cfg, "הקטנה_מזערית", g, _ap_shrink_floor)
    // How coarse the ladder is. A band that may lose a fifth of its size in one
    // step reads as a different band; one that steps by a fortieth spends four
    // times the measures to get there. 5% is what it was as a constant.
    let step = _ap_pick(cfg, "הקטנה_צעד", g, _ap_shrink_step)
    let ladder = _ap_shrink_ladder(
      if type(floor) == ratio { floor / 100% } else { floor },
      if type(step) == ratio { step / 100% } else { step },
    )
    let sc = 1.0
    let tr = 0pt
    let bounded = cap != none and cap > 0pt
    if bounded {
      let fits(s, t) = _ap_demand(all, idxs, cfg, g, s, t, gap, runin) <= cap
      let apply(list, s0, t0) = {
        let s = s0
        let t = t0
        for m in list {
          if fits(s, t) { break }
          if m == "הקטנה" {
            for rung in ladder {
              s = rung
              if fits(s, t) { break }
            }
          } else if m == "כיווץ_אותיות" {
            // How much comes out between the letters. Small on purpose and a
            // setting anyway: it is invisible when it works and unreadable when
            // it is overdone, and where that line falls is a property of the
            // face a sefer is set in.
            t = _ap_pick(cfg, "כיווץ_מידה", g, _ap_tracking)
          }
        }
        (s, t)
      }
      let (s1, t1) = apply(pre, sc, tr)
      sc = s1
      tr = t1
      // What spill cannot help: the first entry alone is taller than the region,
      // so moving it to the next page moves it to a region exactly as small.
      // Only then are the moves written after `עמוד_הבא` worth spending.
      let lone = (
        idxs.len() > 0
          and _ap_demand(all, (idxs.first(),), cfg, g, sc, tr, gap, runin) > cap
      )
      if lone and post.len() > 0 {
        let (s2, t2) = apply(post, sc, tr)
        sc = s2
        tr = t2
      }
    }
    scales.insert(k, sc)
    tracks.insert(k, tr)
    // Now place. The first entry of a group always goes on the page, however
    // tall it is, because carrying it for ever is a note that was written and
    // never printed — but *how much of it* this page shows is the next question,
    // and `span` is the answer.
    //
    // **This is not a good answer, and the comment here used to claim it was.**
    // It said a clipped note is something a reader can see. It is not: `_ap_slot`
    // draws with `clip: true`, so an entry taller than its region is masked and
    // reads as a short note. `probe` cannot see a clip — it reads frame items —
    // so the overhang measures as if it were printed past the paper edge, and
    // that is how it was written down. `svgdump` shows the clip rectangle.
    //
    // Neither `"עמוד_הבא"` nor `"דחיסה"` moves such a note by a single point,
    // and not because the policy is wrong: the footer is composed afresh on every
    // page and has no continuation, so there is nowhere for the second half of a
    // note to land. See NOTES-SPILL-FINDINGS.md, which costs four ways out.
    let u = 0pt
    let mine = ()
    let rest = ()
    let span = 1
    for j in idxs {
      if rest.len() > 0 {
        rest.push(j)
        continue
      }
      let hh = if runin {
        _ap_demand(all, mine + (j,), cfg, g, sc, tr, gap, true)
      } else {
        u + _ap_entry_height(all, j, cfg, g, sc, tr) + gap
      }
      if bounded and mine.len() > 0 and hh > cap and can_spill {
        rest.push(j)
      } else {
        // **This is where a box that cannot spill loses text, and the only
        // place that knows it.** With no `"עמוד_הבא"` in the policy there is
        // nowhere for the overflow to go, so the entry stays on the page and
        // `_ap_slot` masks whatever runs past the region. That is a request —
        // `גלישה: ()` is a writer asking for a box that stays fixed — but it
        // may not be a **silent** one, and the page has no other way to find
        // out: measuring the region in the renderer answers 64.26pt for a
        // four-word note in a 34.02pt box, because what the slot is handed is
        // the region's furniture and not only its prose. The walk knows
        // because the walk is the thing that decided.
        if bounded and hh > cap and not can_spill { cut.insert(k, true) }
        mine.push(j)
        u = hh
        // **One entry taller than the whole region.** Truncation is never the
        // answer, and it was the answer: `_ap_slot` clips, so the second half of
        // such a note was masked away and the page read as a short apparatus.
        // Spilling it as a whole does not help either — the next page's region is
        // exactly as small — so it spills *into itself*, over as many pages as it
        // takes, and each of them shows one region's worth of it.
        //
        // The page footer cannot continue a block: it is composed afresh on every
        // page and has no notion of what the page before ended on. So the note is
        // emitted whole into every one of its pages and each draws a different
        // part of it, which is what `slot` and the renderer's `move` are for.
        //
        // How many pages, and the two mechanisms count differently because they
        // divide differently. The window slides a fixed distance, so its count is
        // the height over the slot. The cut fills each page as full as it will
        // go, so its count is however many slices there turn out to be — usually
        // fewer, since `ceil` on the height rounds a note that ends a third of
        // the way down the page up to a whole one. Counting it here the same way
        // the renderer will cut it is what keeps the document from reserving a
        // page that comes out empty.
        if bounded and mine.len() == 1 and hh > cap and can_spill {
          // **The window slides by whole lines, not by the height of the slot.**
          //
          // It used to slide by exactly the slot, and a slot is not a whole
          // number of lines: 34.02pt of region against a 14.38pt line is 2.36
          // lines, so the third line of a note began 28.76pt down, the slot ended
          // at 34.02, and that line was **cut in half across two pages** — its
          // top on one and its bottom on the next. Measured on a note with a box
          // in it, which is now the only kind that reaches the window at all.
          //
          // Two whole lines per page instead, and the 5.26pt left over is white
          // space at the foot of the region, which is what white space is for.
          let one = _ap_advance(cfg, g)
          let step = if one > 0pt and one <= cap {
            calc.floor(cap / one) * one
          } else {
            cap
          }
          steps.insert(k, step)
          let seam = _ap_pick(cfg, "תפר", g, 8)
          let wrap = (t, i) => _ap_wrap(
            cfg,
            g,
            if i == 0 { [#super[1] #t] } else { t },
            יחס: sc,
            כיווץ: tr,
            ריווח_שורה: _ap_lead(cfg, g, sc),
          )
          let width = _ap_page_width(cfg, g)
          let words = _ct_text(all.at(j).value.body)
          let parts = if words != none {
            _ct_pages(words, width, cap, תפר: seam, עטיפה: wrap)
          } else {
            let atoms = _ct_split(all.at(j).value.body)
            if atoms == none { none } else {
              _ct_pages_atoms(atoms, width, cap, תפר: seam, עטיפה: wrap)
            }
          }
          span = if parts == none {
            // The window's own count, in its own unit.
            calc.max(1, calc.ceil(hh / step))
          } else {
            calc.max(1, parts.len())
          }
        }
      }
    }
    placed += mine
    over += rest
    if span > 1 { spans.insert(k, span) }
  }
  (
    placed: placed,
    over: over,
    scales: scales,
    tracks: tracks,
    spans: spans,
    caps: caps,
    steps: steps,
    cut: cut,
  )
}

/// Where each note of a page-foot apparatus prints, and how it is set.
///
/// One dictionary per note of `all`, in document order: `(page, scale, tracking,
/// runin)`. The renderer reads the same values back, because the walk and the
/// drawing disagreeing is the one real limit `NOTES-PLAN` names — two notes
/// computing their positions from different answers to the same question.
///
/// `cap_of` answers *how much room this group has*: its own slot when the
/// apparatus declares fixed band heights, and otherwise the whole reserve, which
/// the groups then share in the order they are written.
///
/// # Page-major, and that is what the moves needed
///
/// The first version of this walked the notes and carried a page cursor, which
/// is enough for spill and enough for nothing else: shrinking a band is a
/// decision about *a page*, and it cannot be taken one note at a time by a loop
/// that does not yet know which notes the page will hold. So the walk is over
/// pages — each takes the notes anchored on it plus whatever the page before
/// carried, decides how it is set, keeps what fits and hands on the rest.
///
/// A note never moves **backwards**: its marker is on its own page and the
/// reader has to be able to find it from there, so the carry only ever goes
/// forward and a note anchored further on never pulls one back.
#let _ap_assign(all, cfg, cap_of, policy_of: g => _ap_spill_default) = {
  let n = all.len()
  if n == 0 { return () }
  let out = ()
  for _ in range(n) {
    out.push((
      page: 0,
      scale: 1.0,
      tracking: 0pt,
      runin: false,
      span: 1,
      slot: 0pt,
      step: 0pt,
    ))
  }
  let i = 0
  let carry = ()
  let pg = 0
  // How long each group's region is still showing the rest of an over-tall
  // entry. Nothing else of that group may be placed while it runs, because the
  // region is full of the note that is spilling through it.
  let busy = (:)
  while i < n or carry.len() > 0 {
    // With nothing carried, the next page with any work on it is the next page
    // anything is anchored to — a sefer with notes on pages 3 and 40 does not
    // walk the thirty-six pages in between.
    if carry.len() == 0 { pg = calc.max(pg, all.at(i).location().page()) }
    let cands = carry
    while i < n and all.at(i).location().page() <= pg {
      cands.push(i)
      i += 1
    }
    // A group whose region is still spilling an earlier note shows nothing else
    // this page. Its candidates wait rather than being dropped.
    let held = cands.filter(j => busy.at(str(all.at(j).value.group), default: 0) > pg)
    let cands = cands.filter(j => busy.at(str(all.at(j).value.group), default: 0) <= pg)
    let f = _ap_fill(all, cands, cfg, cap_of, policy_of)
    for j in f.placed {
      let k = str(all.at(j).value.group)
      let sp = f.spans.at(k, default: 1)
      out.at(j) = (
        page: pg,
        scale: f.scales.at(k),
        tracking: f.tracks.at(k),
        runin: policy_of(all.at(j).value.group).contains("רצף"),
        span: sp,
        // A length, whatever came back. A region with no declared height has no
        // cap, and the offset below multiplies this by a page number.
        slot: {
          let c = f.caps.at(k, default: 0pt)
          if type(c) == length { c } else { 0pt }
        },
        // How far the window slides, which is a whole number of lines and
        // therefore not the slot. Falls back to the slot for a group that never
        // reached the window branch, where it is never used.
        step: {
          let st = f.steps.at(k, default: none)
          if type(st) == length { st } else {
            let c = f.caps.at(k, default: 0pt)
            if type(c) == length { c } else { 0pt }
          }
        },
        // Whether this page had to mask part of this group, which only a box
        // that cannot spill ever does. See `_ap_fill` and `_ap_slot`.
        cut: f.cut.at(k, default: false),
      )
      if sp > 1 { busy.insert(k, pg + sp) }
    }
    carry = held + f.over
    pg += 1
  }
  out
}

/// This page's notes: the ones **assigned** here, not the ones registered here.
///
/// That one word is the whole of thing four for the footer. The footer used to
/// render the notes whose markers are on this page, so a page with more notes
/// than room lost the difference.
///
/// Returns the entries **and how this page sets them** — the scale, the tracking
/// and whether the region runs in — because those are decided by the same walk
/// that decided which page they are on, and handing back only the entries is how
/// a renderer ends up drawing at a size the arithmetic never left room for.
#let _ap_on_page(all, cfg, cap_of, pg, policy_of: g => _ap_spill_default) = {
  // Only entries anchored at or before this page can print on it. The walk
  // places a note on its anchor's page or later — never earlier — so the
  // suffix anchored after `pg` cannot change this page's answer, and walking
  // it (measuring every entry afresh) bought nothing on any page but the
  // last. Measured before building, 24 August: forty pages of four notes
  // spent 2.1s of a 2.2s compile in walks whose answers for early pages were
  // identical to what their truncated prefix returns.
  let eligible = all.filter(e => e.location().page() <= pg)
  let where = _ap_assign(eligible, cfg, cap_of, policy_of: policy_of)
  let mine = ()
  let scales = (:)
  let tracks = (:)
  let runins = (:)
  let offsets = (:)
  let slots = (:)
  let pieces = (:)
  // Which groups lost text to a box that could not spill. See `_ap_fill`.
  let cuts = (:)
  for i in range(eligible.len()) {
    let d = where.at(i)
    // On every page of its span, not only the first. The entry is emitted whole
    // each time and the offset says which part of it this page shows.
    if pg >= d.page and pg < d.page + d.span {
      mine.push(eligible.at(i))
      let k = str(eligible.at(i).value.group)
      scales.insert(k, d.scale)
      tracks.insert(k, d.tracking)
      runins.insert(k, d.runin)
      offsets.insert(k, d.step * (pg - d.page))
      // The slot, and **which slice this is**.
      //
      // The slice used to be worked out in the renderer, as
      // `floor(offset / slot)` — which is the same number in arithmetic and not
      // in floating point. `slot * k / slot` lands a hair under `k` once `k` is
      // large enough, `floor` takes it down to `k - 1`, and that page draws the
      // slice before it: measured on a three-hundred-word note in a one-line
      // region, **words 97–112 printed twice and 113–129 were never printed at
      // all**, and again every seventh page after that. A sefer quietly missing
      // sixteen words a page, with nothing on the page to show it.
      //
      // So the walk says which slice it is. It is an integer here — the page
      // minus the page the note started on — and it stays an integer.
      slots.insert(k, if d.span > 1 { d.slot } else { 0pt })
      pieces.insert(k, pg - d.page)
      cuts.insert(k, d.cut)
    }
  }
  (
    entries: mine,
    cuts: cuts,
    scales: scales,
    tracks: tracks,
    runins: runins,
    offsets: offsets,
    slots: slots,
    pieces: pieces,
  )
}

/// The last page any of an apparatus's notes was assigned to.
#let _ap_last_page(all, cfg, cap_of, policy_of: g => _ap_spill_default) = {
  let last = 0
  for d in _ap_assign(all, cfg, cap_of, policy_of: policy_of) {
    last = calc.max(last, d.page + d.span - 1)
  }
  last
}

/// How one group is set on one page, out of what `_ap_on_page` handed back.
/// `1.0`, no tracking and no run-in for a group that has nothing here, which is
/// what a caller drawing an empty fixed slot needs.
#let _ap_setting(on, cfg, g) = {
  let k = str(g)
  let sc = on.scales.at(k, default: 1.0)
  (
    יחס: sc,
    כיווץ: on.tracks.at(k, default: 0pt),
    רצף: on.runins.at(k, default: false),
    ריווח_שורה: _ap_lead(cfg, g, sc),
    הסט: on.offsets.at(k, default: 0pt),
    חלון: on.slots.at(k, default: 0pt),
    מנה: on.pieces.at(k, default: 0),
    חתוך: on.cuts.at(k, default: false),
  )
}

// ============================================================
//  ערוצים · channels — the table
// ------------------------------------------------------------
//  Eighteen commands wrote a note before this. They were never eighteen ideas:
//  three arrangements by three tiers plus the any-tier escape hatches, exposed
//  as *cells* rather than as *axes*. `#מדף_ב` is not something a writer would
//  want to say — it is *tier two, printed at the foot of the page*, which is two
//  settings wearing a command's clothes.
//
//  So: one concept, and it is the one thing every arrangement has in common.
//
//  **A channel is a note stream. It owns its numbering, and only notes in the
//  same channel number together** — that is what makes it a channel rather than
//  a style. Two things describe one:
//
//    · **a source** — the body text, or *another channel*. A channel whose
//      source is a channel is a note on a note, and it is placed independently
//      of its parent, which is the difference between `#הערה_ב` and `#מדף_ב`
//      that used to be encoded in which command was typed.
//    · **a placement** — "רגל" (the foot of the page), "סוף_מדור" (the end of
//      the section) or "סוף" (the end of the document), optionally into a named
//      **region**.
//
//  The doc this comes from names five placements. Three of them are the ones a
//  writer chooses; the other two are consequences and not choices. *Indented
//  inside its parent's block* is what a channel gets when its source is a
//  channel and both are at the page foot — it cannot be indented inside a block
//  that is three hundred pages away — and *a named region* is `אזור:`, which
//  every placement takes.
//
//  **A region is a fixed area, made by its own command with its own size.** Once
//  it exists any channel can be pointed into it, and more than one channel in
//  one region is what raises the stacked-versus-side-by-side question the
//  `_ap_*` renderer above already answers. A channel given a `גובה` and no
//  `אזור` gets a region of its own — the common case, said in one command.
//
//  # Where a channel's notes are actually collected
//
//  Three collectors, and which one a channel uses is a *consequence* of its
//  placement rather than a fourth thing to choose:
//
//    · **the native footnote apparatus** — Typst's own, balanced across page
//      breaks, one series per page. The default channel `הערה` and any channel
//      whose source chain reaches it without asking for a region. This is the
//      one collector nothing else can imitate: only Typst can balance a note
//      against the page it is on.
//    · **the page-foot regions** — the read-only footer apparatus (`#הערה_זרם`
//      and `_sf_page_streams`). Every other channel placed at "רגל".
//    · **the collected regions** — a channel placed at "סוף_מדור" or "סוף",
//      rendered where `#הצג_אזור` is called.
//
//  The table is read with `.final()` and not `.get()`, deliberately: where a
//  channel prints is a fact about the document, not about a position in it, and
//  a `#ערוץ` line written at the bottom of the file has to reach page one. The
//  configuration commands underneath it are still positional, which is the flaw
//  this layer exists above.
// ============================================================
#let _ch_default = "הערה"
// A fourth place: **a companion volume.**
//
// `"סוף"` is the back of this sefer — the notes follow the body, in the same page
// numbering, as a section of it. `"קובץ"` is a volume of its own: it starts on a
// fresh sheet and restarts its page count, the way a kuntres of biurim bound
// behind a sefer is numbered separately from the sefer.
//
// Whether it is bound behind the body or written out as a second file is the
// writer's, and it is `#מסמך(כרך_נפרד:)` — the same content either way, so the
// choice can be made after everything is written, which is the whole promise of
// the channel model.
// The placements that put a note **beside** the text, and which edge each names.
//
// `"חוץ"` and `"פנים"` are binding-relative: on a two-sided sefer the outer edge
// is the left of a recto and the right of a verso, so a note that says *outside*
// changes edge with the page and stays outside. `"ימין"` and `"שמאל"` name an
// edge outright and never move. `"צד"` is the old spelling of `"חוץ"`, kept
// because every document written before this said it.
#let _ch_side_places = ("צד", "חוץ", "פנים", "ימין", "שמאל")
#let _ch_side_of(place) = if place == "צד" { "חוץ" } else { place }
/// One label per side channel. Dynamic, like `_cn_dump`'s — `label()` takes a
/// string, so a stream does not have to be one of a fixed few.
#let _sn_chan_lbl(name) = "ksav-snc-" + name

// **One axis.** Where a note goes is one question with one set of answers, and
// the side of the page is one of them — not a separate mechanism reached through
// a different command. `#הערת_גיליון`, `#הערת_ימין` and `#הערת_שמאל` are three
// built-in side channels in exactly the sense the seven tier commands are seven
// built-in foot channels: useful spellings of values on this list, and not a
// second model beside it.
// `"למעלה"` is a band **above** the text, and it is the page-foot apparatus
// drawn at the other end of the sheet — the same collection, the same per-page
// assignment, the same overflow moves, the same entry heads. Only the furniture
// it is painted into differs, which is why it is a value here and not a
// mechanism of its own.
// One line on purpose: `enginefacts.test.mjs` reads this list off the prelude by
// taking the quoted strings on the declaration, and a tuple broken over several
// lines reads as an empty one — a fence that silently stops comparing.
#let _ch_places = ("רגל", "למעלה", "צד", "חוץ", "פנים", "ימין", "שמאל", "סוף_מדור", "סוף", "קובץ")
// A knob of a channel, and where the shared renderer reads it: `_ap_pick` wants
// knob-major dictionaries keyed by the group, and a channel's record is
// channel-major. `כותרת` is singular on a channel and plural in the renderer for
// the same reason — one channel has one title, and the apparatus has a table.
#let _ch_knobs = (
  ("מספור", "מספור"), ("גודל", "גודל"), ("סגנון", "סגנון"),
  ("צבע", "צבע"), ("טורים", "טורים"), ("כותרת", "כותרות"),
)
// The seven tiers of the native apparatus, as the seven channels they are. A
// document that declares nothing already has these, which is why `#הערה_ב`
// inside `#הערה` needs no `#ערוץ` line to work.
#let _ch_builtin = {
  let d = (:)
  for (i, n) in _ch_tiers.enumerate() {
    d.insert(n, (מיקום: "רגל", מקור: if i == 0 { auto } else { _ch_tiers.at(i - 1) }))
  }
  d
}
#let _ch_st = state("ksav-ch", (ערוצים: _ch_builtin, סדר: _ch_tiers, אזורים: (:), סדר_אזורים: ()))

#let _ch_rec(t, name) = t.ערוצים.at(name, default: (:))
#let _rg_rec(t, name) = t.אזורים.at(name, default: (:))
// Where a channel's notes print. A channel pointed into a region takes the
// region's placement, because a region *is* a place — pointing a channel at one
// and then asking the channel where it goes is asking the same question twice
// and letting the two answers disagree. Said the other way: `#אזור("x", מיקום:
// "סוף")` is how a whole group of channels moves at once.
#let _ch_place(t, name) = {
  let r = _ch_rec(t, name)
  if "מיקום" in r { return _val(r.מיקום) }
  let a = r.at("אזור", default: none)
  if a != none {
    let rg = _rg_rec(t, _as_string(a).trim())
    if "מיקום" in rg { return _val(rg.מיקום) }
  }
  "רגל"
}
// The channel this one hangs off, or none for a channel on the body text.
#let _ch_source(t, name) = {
  let s = _ch_rec(t, name).at("מקור", default: auto)
  if s == auto or s == none { none } else { _as_string(s).trim() }
}
// The region a channel is pointed into. A channel that named none is its own
// region — which is what every document written before channels existed has, and
// why `#הערה_זרם("מקורות")` still gets its own slot without declaring one.
#let _ch_region(t, name) = {
  let a = _ch_rec(t, name).at("אזור", default: none)
  if a == none { name } else { _as_string(a).trim() }
}
// The guard is not decoration: `#ערוץ("א", מקור: "ב")` and `#ערוץ("ב", מקור: "א")`
// is a cycle a writer can type, and a chain walk without a bound hangs the
// compile rather than printing a document with one odd-looking note in it.
#let _ch_walk_max = 16
// How deep in the source chain — 1 for a channel on the body text. This is the
// tier the native apparatus indents by.
#let _ch_depth(t, name) = {
  let d = 1
  let at = name
  let guard = 0
  while guard < _ch_walk_max {
    let s = _ch_source(t, at)
    if s == none or s == at { break }
    d += 1
    at = s
    guard += 1
  }
  d
}
// Is this channel part of Typst's own balanced page-bottom series?
//
// Exactly when its source chain reaches the default channel with every link
// placed at the page foot and none of them asking for a region. Typst has one
// balanced series, so a *second* root channel at the page foot cannot join it —
// it becomes a region at the foot instead, which is fixed geometry rather than
// balanced, and needs the reserve the Rust side takes off the bottom margin.
#let _ch_is_native(t, name) = {
  let at = name
  let guard = 0
  while guard < _ch_walk_max {
    if _ch_place(t, at) != "רגל" { return false }
    let r = _ch_rec(t, at)
    if r.at("אזור", default: none) != none or _rg_height_of(r) != none {
      return false
    }
    let s = _ch_source(t, at)
    if s == none or s == at { return at == _ch_default }
    at = s
    guard += 1
  }
  false
}
// Where a channel's notes are collected: "מקורי" (Typst's own), "רגל" (a region
// at the page foot) or "אסוף" (a region rendered at a #הצג_אזור call).
#let _ch_kind(t, name) = {
  if _ch_is_native(t, name) { "מקורי" }
  // A band above the text is filed exactly as a band below it — same stream,
  // same numbering, same overflow. `_sf_where` is what separates them, and it is
  // asked at the moment of *drawing* rather than at the moment of filing.
  else if _ch_place(t, name) == "רגל" or _ch_place(t, name) == "למעלה" { "רגל" }
  else if _ch_side_places.contains(_ch_place(t, name)) { "צד" }
  else { "אסוף" }
}
// A channel's numbering scheme, when it declared one. `none` leaves the
// apparatus underneath to answer — which for a native channel is the per-tier
// array of `#הגדרות_הערות`.
#let _ch_scheme(t, name) = _ch_rec(t, name).at("מספור", default: none)
// The height of a region: its own if it declared one, else the height of the
// lone channel that made it, else whatever the apparatus's own table says.
#let _ch_region_height(cfg, t, rg, chans) = {
  let own = _rg_height_of(_rg_rec(t, rg))
  // A region's own line is its first channel's, since that is what will be set
  // in it. A region holding two channels of different sizes is a region whose
  // "three lines" is ambiguous, and the first one declared is the answer.
  let קו = _ap_line_of(cfg, if chans.len() > 0 { chans.first() } else { rg })
  let חריגה = _val(_rg_rec(t, rg).at("חריגה", default: _rg_over_default))
  if own != none { return _ap_fit_room(own, קו: קו, חריגה: חריגה, מי: rg) }
  // A height declared on the **channel** that made the region is the slot too,
  // and goes through the same clamp and refusal as a region's own — raw, it
  // reached the slot renderer unclamped while the walk packed against
  // `_ap_room`, so the two halves of one apparatus disagreed about the room.
  for c in chans {
    let h = _rg_height_of(_ch_rec(t, c))
    if h != none {
      return _ap_fit_room(h, קו: _ap_line_of(cfg, c), חריגה: חריגה, מי: rg)
    }
  }
  _ap_pick(cfg, "גבהים", rg, none)
}
// What stands at the head of an entry is the **region's** to say as much as the
// channel's — two channels sharing a region share its arrangement, which is what
// a region is. Read after the channels so a channel may still differ.
//
// This was the gap that made the four positional addresses unreachable:
// `ראש` was accepted on `#אזור` and the renderer built its configuration out of
// the *channels* alone, so a region that asked for an address got the default
// entry head and printed a number instead.
#let _rg_head_keys = ("ראש", "מספור_כתובת", "דף_ראשון", "כתובות")
/// The keys that shape how a region overflows.
///
/// Read through `_ap_pick` deep inside the walk, which has the *channel's*
/// configuration and not the region's — so a region that set one was accepted
/// and never consulted. They are merged into the channel's configuration, keyed
/// by channel, at the point the region is known: a channel belongs to exactly one
/// region, so there is one right answer for each.
// What a region may say about the moves, over whatever its channels were
// configured with. All of these are judgement calls about *this* sefer rather
// than about the apparatus in general, which is why they are per-region: a
// dense peirush and a wide-set text want different answers and share a document.
#let _rg_over_keys = (
  "הקטנה_מזערית",
  "הקטנה_צעד",
  "כיווץ_מידה",
  // How far back a cut may look for a better seam, in words. See `_ct_fit`.
  "תפר",
  // Whether a note continued onto the next page carries its number again.
  "סימן_בהמשך",
)
#let _rg_over_cfg(cfg, t, streams) = {
  let out = cfg
  for k in _rg_over_keys {
    let per = (:)
    for s in streams {
      let rec = _rg_rec(t, _ch_region(t, s))
      if k in rec { per.insert(s, rec.at(k)) }
    }
    if per.len() > 0 { out.insert(k, per) }
  }
  out
}
#let _rg_head_cfg(cfg, t, rg, chans: ()) = {
  let out = cfg
  // A channel may say what stands at the head of its entries too — the keys sit
  // in `_ch_own`, and until now their only readers were the region-record paths,
  // so declaring one on a channel compiled and changed nothing. The region is
  // still the authority: it merges last and wins.
  for c in chans {
    let rec = _ch_rec(t, c)
    for k in _rg_head_keys {
      if k in rec { out.insert(k, rec.at(k)) }
    }
  }
  let rec = _rg_rec(t, rg)
  for k in _rg_head_keys {
    if k in rec { out.insert(k, rec.at(k)) }
  }
  out
}

/// Which regions the writer placed by hand.
///
/// A state rather than a query for the dump marker, and that is not a style
/// choice: `_rg_show` emits one of those itself, so a guard that counted them
/// would switch itself off on the next layout pass, switch back on the pass
/// after, and never settle.
#let _cn_shown = state("ksav-cn-shown", ())

// ---- the grid region · a parallel-column page ----
//
// `NOTES-PLAN` thing three asks for a region that is a page split into parallel
// columns synchronised on a chunk — the Vilna page, and equally an original
// facing a translation, which is why it belongs to regions and not to notes.
//
// # `פריסה: "צד"` already was this, and needed two things
//
// The naming record's open question was what to call grid-versus-box, since
// `פריסה` was taken. It turns out not to need a word: a region whose channels
// sit side by side **is** the parallel-column arrangement, and `פריסה: "צד"` has
// meant that since channels existed. What it could not do was set the column
// widths, and what it could not do at all was keep the columns in register.
//
//   · `טורים` — the widths, as a list, one per channel in the region
//   · `יחידה` — what the columns are synchronised on
//
// # Synchronisation is a row per unit, and that is the whole mechanism
//
// Without `יחידה` a region draws each channel as one long cell, and the columns
// drift apart exactly as far as their contents differ in length — which is what
// makes amateur parallel typesetting look wrong, and which no amount of care
// inside a column fixes. With it, the region is a grid of *rows*: one per unit,
// each holding what each channel has to say about that unit, and every row
// starts level because a grid row starts level. It is the same answer
// `perdaf.ksav` demonstrates by hand — register per daf — with the writer no
// longer writing the table.
#let _rg_grid_units = ("כותרת", "סימן", "מדור")

/// The column widths a grid region declared, one per channel.
#let _ch_region_cols(t, rg, chans) = {
  let w = _rg_rec(t, rg).at("טורים", default: none)
  if w == none or type(w) != array { return chans.map(_ => 1fr) }
  if w.len() != chans.len() {
    panic(
      "אזור " + rg + ": טורים · " + str(w.len()) + " column widths were given for "
        + str(chans.len()) + " channels. A grid region's widths are one per "
        + "channel, in the order the channels were pointed into it.",
    )
  }
  w
}

// ---- the row plan · a grid region whose shape changes down the page ----
//
// A Vilna daf is three columns at the head, two where the Rashi runs out, and
// the full measure below that. `טורים` said one set of widths for the whole
// region, so every row had the same number of columns and that page could be
// drawn by hand — `vilna.ksav` does, with a literal `#table` — and not asked
// for. This is the asking.
//
// # One knob, three depths, and the shallow one is unchanged
//
// `טורים` now reads as a **list of row plans** when it is given one, and as one
// plan for every row when it is given widths — which is what every document
// written before this gives, so nothing moves.
//
//   `טורים: (1fr, 2fr, 1fr)`               one shape, every row
//   `טורים: ((1fr, 2fr, 1fr), (2fr, 1fr))` a shape per row, in order
//   `טורים: ((רוחב: …, ערוצים: …), …)`      and everything about a row
//
// A plan given as a bare array is its widths; given as a dictionary it may say
// any of `_rg_plan_keys`, and everything it does not say it takes from the
// region. Rows past the end of the list repeat the last plan, or cycle the whole
// list when `מחזור` is on — which is what a page alternating two shapes wants
// and is one word rather than a list as long as the sefer.
//
// # What makes it a *wrap* rather than a table
//
// `ריק`. A cell for a channel with nothing to say in that unit is either kept
// blank — which holds the register, and is the default because that is what
// parallel text is for — or **dropped**, and then the row's remaining columns
// take the width. Dropped is the knee: the Rashi column disappears from the row
// where the Rashi ends and the gemara widens into it, without the writer
// counting rows or measuring anything.
//
// Note that this is the same shape as `#ברך`, one level up. `#ברך` knees one
// block around one neighbour, in the flow, for content that is not an
// apparatus; this knees a whole region, per unit, for content that is.
#let _rg_col_gap = 1.2em
#let _rg_row_gap = 0.6em

/// What a row plan may say about itself.
#let _rg_plan_keys = ("רוחב", "ערוצים", "מרווח", "ריווח", "ריק", "יישור", "עודף")

/// What an empty cell does.
#let _rg_empty_kinds = ("ריק", "דלג")

/// What a channel with something to say and no column in its row does.
///
/// **This key exists because the first draft of the row plan had no answer, and
/// its answer was silence.** A plan naming two of three channels dropped the
/// third's notes off the page — filed, numbered, queryable and printed nowhere,
/// which is the exact fault the placements had and the one thing a note may
/// never do. Nothing about a plan being the writer's own makes losing their text
/// their fault: they said how the columns sit, not that a peirush should vanish
/// on the simanim they forgot about.
///
/// So there are three answers and all three are visible. A row of its own below
/// the planned one, at the full measure — which is what a Vilna daf does when
/// the band above runs out, and is the default. A column appended to the row,
/// for a writer who would rather the shape stretched than the page grew. Or a
/// refusal, naming the channel and the unit, for a sefer whose shape is exact
/// and where a surprise is a mistake worth stopping for.
#let _rg_over_plan = ("שורה_נוספת", "טור_נוסף", "סירוב")

/// Is `v` a column width, rather than a row plan?
///
/// The one piece of guessing in the whole knob, and it is safe because the two
/// cannot be confused: a width is a length, a ratio or a fraction, and a plan is
/// an array or a dictionary. Read off the **first** element, because a list
/// mixing the two is a mistake worth refusing rather than a form worth
/// supporting.
#let _rg_is_width(v) = (
  v == auto or (length, ratio, relative, fraction).contains(type(v))
)

/// The row plans a grid region declared, in the order they are used.
#let _rg_plans(t, rg, chans) = {
  let rec = _rg_rec(t, rg)
  let empty = _val(rec.at("ריק", default: "ריק"))
  if not _rg_empty_kinds.contains(empty) {
    panic(
      "אזור " + rg + ": ריק לא מוכר · unknown empty-cell rule: " + _as_string(empty)
        + " (" + _rg_empty_kinds.join(" · ") + ")",
    )
  }
  let over = _val(rec.at("עודף", default: "שורה_נוספת"))
  if not _rg_over_plan.contains(over) {
    panic(
      "אזור " + rg + ": עודף לא מוכר · unknown rule for a channel with no column: "
        + _as_string(over) + " (" + _rg_over_plan.join(" · ") + ")",
    )
  }
  let base = (
    רוחב: chans.map(_ => 1fr),
    ערוצים: chans,
    מרווח: rec.at("מרווח_טורים", default: _rg_col_gap),
    ריווח: rec.at("ריווח_טורים", default: _rg_row_gap),
    ריק: empty,
    יישור: auto,
    עודף: over,
  )
  let v = rec.at("טורים", default: none)
  // No plan, or the flat form: one shape for every row. `_ch_region_cols` keeps
  // the flat form's own count check, which has a sentence written for it.
  if v == none or type(v) != array or v.len() == 0 or _rg_is_width(v.first()) {
    return ((..base, רוחב: _ch_region_cols(t, rg, chans)),)
  }
  let read(p) = {
    let p = if type(p) == array { (רוחב: p) } else { p }
    if type(p) != dictionary {
      panic(
        "אזור " + rg + ": טורים · a row plan is widths or a dictionary, not "
          + _as_string(type(p)) + ".",
      )
    }
    // Said in whichever language the writer said it in. A plan is a *value* and
    // not a parameter list, so `_en` never sees it — which is how `#אזור` came
    // to take English arguments carrying a dictionary nobody could spell in
    // English. Same table, applied one level down.
    let p = {
      let d = (:)
      for (k, val) in p { d.insert(_en_params.at(k, default: k), val) }
      d
    }
    for k in p.keys() {
      if not _rg_plan_keys.contains(k) {
        panic(
          "אזור " + rg + ": טורים · מפתח לא מוכר בשורה · unknown key in a row plan: "
            + k + " (" + _rg_plan_keys.join(" · ") + ")",
        )
      }
    }
    if "רוחב" not in p {
      panic("אזור " + rg + ": טורים · a row plan must say its widths (רוחב).")
    }
    let ws = p.רוחב
    if type(ws) != array or ws.len() == 0 {
      panic("אזור " + rg + ": טורים · רוחב is a list of column widths.")
    }
    // The channels this row holds. Said, or the first few of the region's own —
    // so `((1fr, 2fr, 1fr), (2fr, 1fr))` on three channels means the third
    // column drops out of the second row, which is the wrap written the short
    // way and is what a writer means by it.
    let names = p.at("ערוצים", default: none)
    let names = if names == none {
      if ws.len() > chans.len() {
        panic(
          "אזור " + rg + ": טורים · a row asks for " + str(ws.len())
            + " columns and the region holds " + str(chans.len())
            + " channels. Name them (ערוצים:) or ask for fewer.",
        )
      }
      chans.slice(0, ws.len())
    } else { names }
    if names.len() != ws.len() {
      panic(
        "אזור " + rg + ": טורים · " + str(ws.len()) + " widths for "
          + str(names.len()) + " channels in one row. They are one per column.",
      )
    }
    for n in names {
      if not chans.contains(n) {
        panic(
          "אזור " + rg + ": טורים · ערוץ " + n + " אינו באזור · that channel is not "
            + "in this region (" + chans.join(" · ") + ").",
        )
      }
    }
    let out = base + p
    let out = (..out, ערוצים: names)
    if not _rg_empty_kinds.contains(_val(out.ריק)) {
      panic(
        "אזור " + rg + ": ריק לא מוכר · unknown empty-cell rule: "
          + _as_string(out.ריק) + " (" + _rg_empty_kinds.join(" · ") + ")",
      )
    }
    if not _rg_over_plan.contains(_val(out.עודף)) {
      panic(
        "אזור " + rg + ": עודף לא מוכר · unknown rule for a channel with no column: "
          + _as_string(out.עודף) + " (" + _rg_over_plan.join(" · ") + ")",
      )
    }
    (..out, ריק: _val(out.ריק), עודף: _val(out.עודף))
  }
  v.map(read)
}

/// The plan for row `i`, once the list has run out.
///
/// Repeat the last, or cycle the whole list. Repeating is the default because a
/// wrap narrows and stays narrow: the shape at the foot of the daf is the shape
/// for the rest of it, however many simanim follow.
#let _rg_plan_at(plans, cycle, i) = if cycle {
  plans.at(calc.rem(i, plans.len()))
} else {
  plans.at(calc.min(i, plans.len() - 1))
}

/// One row of a grid region, as content: the cells that survive `ריק`, at the
/// widths that belong to them, and whatever `עודף` says to do with a channel
/// that has something to say and no column of its own.
///
/// `none` when the row has nothing in it at all — an empty row is a band of
/// white across the page for a siman nobody commented on, and the register is
/// kept by the rows that exist.
///
/// `over` is the channels in that position, already filtered to the ones with
/// content, in the region's declared order. `where` is a sentence naming the row
/// for the refusal to quote.
#let _rg_row(plan, cell_of, over: (), where: "") = {
  let names = plan.ערוצים
  let widths = plan.רוחב
  if over.len() > 0 and plan.עודף == "סירוב" {
    panic(
      where + ": " + over.join(" · ") + " · this row's plan has no column for that "
        + "channel and it has something to say here. Name it in the plan "
        // The words as they are spelt, not as they are remembered — an advice
        // that names values the parser refuses is an error whose remediation
        // errors.
        + "(ערוצים:), or let it have a row of its own (עודף: \"שורה_נוספת\") or a "
        + "column (עודף: \"טור_נוסף\").",
    )
  }
  // A column each, at the width one more column leaves over. Written before the
  // cells are built so that the widths and the names stay one list.
  if over.len() > 0 and plan.עודף == "טור_נוסף" {
    names = names + over
    widths = widths + over.map(_ => 1fr)
  }
  let cells = ()
  let ws = ()
  for (j, s) in names.enumerate() {
    let (c, any) = cell_of(s)
    if not any and plan.ריק == "דלג" { continue }
    // Through `_doc_align`, which is the one place a written alignment becomes
    // an alignment — raw, `"מרכז"` reached Typst's own `align()` as a string and
    // stopped the compile.
    let al = if plan.יישור == auto { none } else { _doc_align(plan.יישור) }
    cells.push(if al == none { c } else { align(al, c) })
    ws.push(widths.at(j))
  }
  let out = if cells.len() == 0 { none } else {
    grid(columns: ws, column-gutter: plan.מרווח, ..cells)
  }
  // …or a row of its own underneath, at the full measure. The Vilna answer: the
  // band above runs out and the text carries on across the page.
  if over.len() > 0 and plan.עודף == "שורה_נוספת" {
    let extra = grid(
      columns: over.map(_ => 1fr),
      column-gutter: plan.מרווח,
      ..over.map(s => cell_of(s).at(0)),
    )
    return if out == none { extra } else { out + v(plan.ריווח) + extra }
  }
  out
}

/// What this region's columns are kept in register by, or `none`.
#let _ch_region_unit(t, rg) = {
  let u = _rg_rec(t, rg).at("יחידה", default: none)
  if u == none { return none }
  let u = _val(u)
  if not _rg_grid_units.contains(u) {
    panic(
      "אזור " + rg + ": יחידה לא מוכרת · unknown synchronisation unit: "
        + _as_string(u) + " (" + _rg_grid_units.join(" · ") + ")",
    )
  }
  u
}

// Document order as a value that can be compared. Typst gives no ordering on
// locations themselves, and both the unit markers and the entries come back from
// their queries in document order — so page and vertical position is enough to
// say which of two things came first, and it is the only pair that is true
// across a page break.
#let _rg_key(l) = (l.page(), l.position().y)
#let _rg_before(a, b) = a.at(0) < b.at(0) or (a.at(0) == b.at(0) and a.at(1) < b.at(1))

/// The unit boundaries in the sefer, as comparable keys.
#let _rg_bounds(unit) = {
  let sel = if unit == "מדור" { heading.where(level: 1) } else { heading }
  query(sel).map(h => _rg_key(h.location()))
}

/// Which unit an entry belongs to: how many boundaries lie before it. Zero is
/// everything written above the first one, which is a real place in a sefer —
/// a hakdama sits there — and gets a row of its own rather than being dropped.
#let _rg_unit_of(bounds, e) = {
  let k = _rg_key(e.location())
  let n = 0
  for b in bounds {
    if _rg_before(b, k) { n += 1 } else { break }
  }
  n
}

#let _ch_region_side(t, rg) = _val(_rg_rec(t, rg).at("פריסה", default: "מוערם")) == "צד"

// Fold the channel table into an apparatus's configuration.
//
// The apparatus knobs are read by `_ap_pick`, which takes a dictionary keyed by
// group, an array (per tier) or one scalar. A channel that declared a knob has
// to beat the apparatus's own setting for that channel and for no other — so a
// scalar being overridden is first spread across every group present, and only
// then overwritten. Without that, `#הגדרות_זרמים(גודל: 0.9em)` plus one channel
// with its own size would leave every *other* stream falling back to the
// renderer's hard-coded default: one writer's override silently restyling the
// notes they did not touch.
#let _ch_merge(cfg, t, groups) = {
  let c = cfg
  for (mine, theirs) in _ch_knobs {
    let base = cfg.at(theirs, default: none)
    let d = (:)
    for g in groups {
      let own = _ch_rec(t, g).at(mine, default: none)
      if own != none { d.insert(g, own) }
      else if type(base) == dictionary { if g in base { d.insert(g, base.at(g)) } }
      // An array is a *per-tier* setting and a channel is not a tier. Left
      // alone, so `_ap_pick` falls through to the renderer's own answer rather
      // than handing a band the whole tuple as its numbering scheme.
      else if base != none and type(base) != array { d.insert(g, base) }
    }
    if d.len() > 0 { c.insert(theirs, d) }
  }
  c
}

// ============================================================
//  הערות מדורגות · fully regrouped stacked bands (end / section)
// ------------------------------------------------------------
//  The Gemara / critical-apparatus look: ALL tier-1 notes in one band, then
//  ALL tier-2 notes (notes on tier-1) in the band below, then tier-3, … each
//  band with its own numbering scheme and column count. Collected with
//  #מדור_א…#מדור_ז (or #מדור_בדרגה(n, …)) and rendered where you call
//  #הערות_מדורגות(). Renders in the main flow, so it converges to any depth.
//
//  Mechanism (see the Ksav apparatus notes): depth is a lexical tier literal;
//  place(hide()) force-registers every tier in one pass; a monotone collect→
//  render phase lets stored bodies re-display (showing child markers) without
//  re-registering. Feed it at end of a section or the document.
// ============================================================
#let _md_defaults = (
  מספור: _ap_numbering,   // per-tier numbering scheme
  טורים: _ap_columns,     // per-tier column count
  גודל: (1em, 0.9em, 0.82em, 0.78em, 0.75em, 0.75em, 0.75em, 0.75em, 0.75em),
  סגנון: _ap_styles,
  צבע: _ap_fills,
  קו: true,             // rule above the whole apparatus
  קו_בין: true,         // rule between adjacent bands
  ריווח_בין: 0.5em,     // gap between bands
  ריווח_פריט: 0.35em,   // gap between entries within a band
  משקל: "regular",      // per-tier weight (or one value for every tier)
  סימן: (:),            // how the note's number is set, wherever it prints
  תוויות: false,        // show a small "· tier ·" label above each band
)
#let _md_cfg = state("ksav-md-cfg", _md_defaults)
#let הגדרות_מדורגות(..opts) = {
  for k in opts.named().keys() {
    if k not in _md_defaults and k not in _cfg_global_keys {
      panic("הגדרות_מדורגות: ארגומנט לא מוכר · unrecognised argument: " + k)
    }
  }
  _md_cfg.update(c => {
    let d = c
    for (k, v) in opts.named() { d.insert(k, v) }
    _nt_explicit(d, opts.named())
  })
}
// The channels pointed into a region, in declaration order.
#let _ch_in_region(t, rg) = t.סדר.filter(c => _ch_region(t, c) == rg)

// A collected channel's numbering: its own if it declared one, else the band
// convention by its position in its region — א,ב,ג over 1,2,3, the שער־הציון
// order, which is `_ap_numbering` read through `_md_cfg` and not a second copy
// of it.
#let _ch_position(t, name) = {
  let i = _ch_in_region(t, _ch_region(t, name)).position(c => c == name)
  if i == none { 1 } else { i + 1 }
}

// Two sets of knobs a channel can answer by its position in its region, and the
// fallback each takes outside the arrays' range.
//
// The split is the point. **`מספור` belongs to the channel** — it is the one
// thing "only notes in the same channel number together" is about — so it
// follows the channel wherever the channel is placed. **Size, slant and colour
// belong to where it is printed**: the page-foot apparatus deliberately runs a
// shade smaller than the in-flow one because it lives in the bottom margin, and
// carrying the in-flow ramp down there would undo that on purpose.
#let _ch_ramp_number = (("מספור", "1"),)
#let _ch_ramps = _ch_ramp_number + (("גודל", 0.85em), ("סגנון", "normal"), ("צבע", luma(0)))

// Answer a set of knobs *by each channel's position in its region*.
//
// The apparatus defaults are per-tier arrays and a channel is not a tier, so
// without this two channels sharing a region would print identically and the
// writer would have to restate a convention the apparatus already holds — א,ב,ג
// over 1,2,3, the שער־הציון order, read out of `_md_defaults` rather than
// written a second time.
//
// `declared` is what keeps a document written before channels existed from
// renumbering itself: `#הערה_זרם("מקורות")` is a channel nobody declared, and
// its apparatus already has an answer. A channel a `#ערוץ` line named takes the
// convention wherever it is placed, which is what makes moving one from the foot
// of the page to the back of the sefer leave its numbering alone.
#let _ch_ramped(cfg, t, chans, keys, declared) = {
  let base = _nt_under(_md_cfg.get())
  let c = cfg
  for (k, fb) in keys {
    let arr = base.at(k, default: none)
    let d = if type(c.at(k, default: none)) == dictionary { c.at(k) } else { (:) }
    for g in chans {
      if declared and not t.סדר.contains(g) { continue }
      let own = _ch_rec(t, g).at(k, default: none)
      if own != none { d.insert(g, own) }
      else { d.insert(g, _fn_pick(arr, _ch_position(t, g), fb)) }
    }
    if d.len() > 0 { c.insert(k, d) }
  }
  c
}


#let _md_label = label("ksav-md")
// Every #הערות_מדורגות call drops this marker, which delimits one "section":
// a note belongs to the section that ends at the first dump after it.
#let _md_dump_label = label("ksav-md-dump")
// This apparatus is the one that numbers per SECTION rather than per document —
// so its notes are counted between the surrounding pair of dump markers. That is
// what makes multiple sections work: there is no global phase flag to burn out
// after the first section, and no counter to reset.
#let _md_scope(loc) = _ksav_between(selector(_md_label), _md_dump_label, loc)
// The מדור notes of the section surrounding `loc`, in document order, minus the
// phantom re-registrations inside this section's own rendered apparatus.
#let _md_section_notes(loc) = _ksav_real_of(_md_scope(loc))

// מדור_בדרגה(דרגה, body) — collect a section-band note in tier `דרגה`.
// Named arguments style this one note; see `_cfg_with`.
#let מדור_בדרגה(דרגה, body, ..opts) = context {
  let (own, rest) = _cfg_split(opts.named(), _ap_own_keys)
  _cfg_strict("מדור", rest)
  _ap_note(_cfg_with(_nt_under(_md_cfg.get()), own), _md_label, _md_scope, דרגה, body, own: own)
}
// #הערות_מדורגות() — render this section's collected tiers as stacked bands, here.
// Call it once per section (and/or at the end of the document); each call renders
// only the notes written since the previous call.
#let הערות_מדורגות(כותרת: none, עמוד_חדש: false) = {
  context {
    let notes = _md_section_notes(here())
    if notes.len() > 0 {
      _ap_fresh_page(עמוד_חדש)
      let cfg = _nt_under(_md_cfg.get())
      let tiers = notes.map(e => e.value.group).dedup().sorted()
      _ap_bands(
        cfg,
        tiers,
        // Printed in the flow and numbered within the section, so what the band
        // shows and what it counts against are the same list.
        t => _ap_group(
          cfg,
          t,
          _ap_entries(notes, notes, t),
          lead: if cfg.at("תוויות", default: false) {
            block(spacing: 0.2em, text(size: 0.62em, fill: luma(160))[· #_ap_mark(cfg, t, 1) ·])
          },
        ),
        head: if כותרת != none { heading(level: 3, outlined: false, numbering: none, כותרת) },
        rule_gap: 0.3em,
        divider: 40%,
      )
    }
  }
  // The section boundary itself. Must come *after* the context above, so that
  // context's `here()` sits before it and the section it renders is the one that
  // ends here — not the next one.
  [#metadata(none)#_md_dump_label]
}
#let מדור_א(body, ..opts) = מדור_בדרגה(1, body, ..opts)
#let מדור_ב(body, ..opts) = מדור_בדרגה(2, body, ..opts)
#let מדור_ג(body, ..opts) = מדור_בדרגה(3, body, ..opts)
#let מדור_ד(body, ..opts) = מדור_בדרגה(4, body, ..opts)
#let מדור_ה(body, ..opts) = מדור_בדרגה(5, body, ..opts)
#let מדור_ו(body, ..opts) = מדור_בדרגה(6, body, ..opts)
#let מדור_ז(body, ..opts) = מדור_בדרגה(7, body, ..opts)
// `_en`-wrapped for the reason given at the tier aliases, and with `טורים` as the
// reading of `columns` — a band's column count, not a table's — matching the
// `extra` its own config alias already carries.
#let band = _en(מדור_בדרגה, extra: (columns: "טורים"))
#let band1 = _en(מדור_א, extra: (columns: "טורים"))
#let band2 = _en(מדור_ב, extra: (columns: "טורים"))
#let band3 = _en(מדור_ג, extra: (columns: "טורים"))
#let band4 = _en(מדור_ד, extra: (columns: "טורים"))
#let band5 = _en(מדור_ה, extra: (columns: "טורים"))
#let band6 = _en(מדור_ו, extra: (columns: "טורים"))
#let band7 = _en(מדור_ז, extra: (columns: "טורים"))
#let banded_notes = _en(הערות_מדורגות)
#let banded_config = _en(הגדרות_מדורגות, extra: (columns: "טורים"))

// ============================================================
//  מדפים · fully regrouped bands, PER PAGE (experimental)
// ------------------------------------------------------------
//  The combination the end/section bands can't give you: the Gemara look
//  (all tier-1 together, then all tier-2, …) rendered at the FOOT OF EACH
//  PAGE. Collect with #מדף_א…#מדף_ז (or #מדף_בדרגה(n, …)); the wrapper drops
//  the per-page bands into the page footer automatically — no dump call.
//
//  Why this is hard (and the trick): a page footer is re-laid-out many times
//  during page-breaking, so ANY counter/state WRITE there fails to converge
//  (this is why fully-regrouped per-page bands were long thought impossible).
//  So the footer here is strictly READ-ONLY: it only queries. Every note drops
//  an inline #metadata((tier, key, body)) in the MAIN FLOW (where writes are
//  fine) and place(hide()) force-registers nested tiers in the same pass. The
//  footer then queries those, dedups by a content key (repr(body)) so that a
//  body re-displayed in the footer — which re-emits its children's metadata —
//  can't grow the displayed set, and renders the bands. Numbering is derived
//  from the dedup order (read-only), never a counter. Bounded output + no
//  footer writes ⇒ it converges. Caveat: the footer lives in the bottom margin
//  (unlike native footnotes it does not expand the text region), so leave
//  margin room for heavy apparatus; and two notes with byte-identical body
//  text in the same tier share a number (they collapse to one key).
// ============================================================
// Same convention as the section bands, and now literally the same array: א,ב,ג
// above 1,2,3. Only the sizes differ, and deliberately — these bands sit in the
// bottom margin, so they run a shade smaller than the in-flow ones.
#let _pp_defaults = (
  מספור: _ap_numbering,   // per-tier numbering scheme
  טורים: _ap_columns,     // per-tier column count
  גודל: (0.92em, 0.84em, 0.78em, 0.74em, 0.72em, 0.72em, 0.72em, 0.72em, 0.72em),
  סגנון: _ap_styles,
  צבע: _ap_fills,
  קו: true,             // rule above the whole apparatus
  קו_בין: true,         // rule between adjacent bands
  ריווח_בין: 0.35em,    // gap between bands
  ריווח_פריט: 0.25em,   // gap between entries within a band
  משקל: "regular",      // per-tier weight (or one value for every tier)
  סימן: (:),            // how the note's number is set, wherever it prints
  גבהים: none,          // fixed per-tier band heights, e.g. (2cm, 1cm) — the
                        //   "fixed regions" layout: a band always occupies its
                        //   height, empty space stays empty, overflow is clipped.
                        //   none = each band takes exactly the height it needs.
                        //   A percentage is a percentage of the SHEET: (15%, 10%)
                        //   keeps its proportions when the paper changes, which a
                        //   centimetre does not. Any number of bands, up to the
                        //   seven tiers מדף_א…ז name.
)
#let _pp_cfg = state("ksav-pp-cfg", _pp_defaults)
#let הגדרות_מדפים(..opts) = {
  for k in opts.named().keys() {
    if k not in _pp_defaults and k not in _cfg_global_keys {
      panic("הגדרות_מדפים: ארגומנט לא מוכר · unrecognised argument: " + k)
    }
  }
  _pp_cfg.update(c => {
    let d = c
    for (k, v) in opts.named() { d.insert(k, v) }
    _nt_explicit(d, opts.named())
  })
}
#let _pp_label = label("ksav-pp")
// Every מדף note registered outside an apparatus block — i.e. the real ones.
#let _pp_all() = _ap_all(_pp_label)
// Numbered document-wide: a per-page band shows this page's notes but numbers
// them in one running sequence across the sefer, which is what a reader
// following a marker from the text expects.
#let _pp_scope(loc) = _pp_label
// מדף_בדרגה(דרגה, body) — collect a per-page-band note in tier `דרגה`.
// Named arguments style this one note; see `_cfg_with`.
#let מדף_בדרגה(דרגה, body, ..opts) = context {
  let (own, rest) = _cfg_split(opts.named(), _ap_own_keys)
  _cfg_strict("מדף", rest)
  _ap_note(_cfg_with(_nt_under(_pp_cfg.get()), own), _pp_label, _pp_scope, דרגה, body, own: own)
}
// Read-only footer: render the bands for the CURRENT page. Called from the
// wrapper's page footer. Renders nothing (and touches nothing) when the page
// has no per-page-band notes, so it's free for documents that don't use them.
/// How much room each band of the page-foot apparatus has.
///
/// Its own declared slot when `גבהים` gives it one — which is the fixed-regions
/// layout, where a band always occupies its height whether or not it has
/// anything in it this page — and otherwise the whole reserve, which the bands
/// then share in the order they are written.
#let _pp_cap(cfg) = g => {
  let own = _ap_pick(cfg, "גבהים", g, none)
  if own != none { _ap_fit_room(own, קו: _ap_line_of(cfg, g)) } else { _ap_room() }
}

#let _pp_page_bands() = context {
  let all = _pp_all()
  if all.len() > 0 {
    let cfg = _nt_under(_pp_cfg.get())
    let pg = here().page()
    // The notes **assigned** to this page, not the ones registered on it. That
    // one word is thing four for the page-foot apparatus: a page with more notes
    // than the reserve holds used to lose the difference into the clip, nine
    // deep. See `_ap_assign`.
    let on = _ap_on_page(all, cfg, _pp_cap(cfg), pg)
    let mine = on.entries
    if mine.len() > 0 {
      // With fixed band heights, EVERY configured band shows on every page that
      // has any apparatus at all — an empty band keeps its slot empty rather than
      // letting the ones below it drift up the page. That fixed geometry is the
      // whole point of the "regions" layout.
      let heights = cfg.at("גבהים", default: none)
      let tiers = if type(heights) == array {
        range(1, heights.len() + 1)
      } else {
        mine.map(e => e.value.group).dedup().sorted()
      }
      // A band that holds its place keeps its slot on every apparatus page; one
      // that does not is simply absent from pages it has nothing on, and the
      // bands under it move up. See the same key on a region below.
      let tiers = tiers.filter(t => (
        _ap_pick(cfg, "שומר_מקום", t, true) == true or mine.any(e => e.value.group == t)
      ))
      set align(if text.dir == rtl { right } else { left })
      block(width: 100%, _ap_bands(
        cfg,
        tiers,
        // Shows this page's notes; numbers them against the whole document.
        t => _ap_group(cfg, t, _ap_entries(mine, all, t), .._ap_setting(on, cfg, t)),
      ))
    }
  }
}
#let מדף_א(body, ..opts) = מדף_בדרגה(1, body, ..opts)
#let מדף_ב(body, ..opts) = מדף_בדרגה(2, body, ..opts)
#let מדף_ג(body, ..opts) = מדף_בדרגה(3, body, ..opts)
#let מדף_ד(body, ..opts) = מדף_בדרגה(4, body, ..opts)
#let מדף_ה(body, ..opts) = מדף_בדרגה(5, body, ..opts)
#let מדף_ו(body, ..opts) = מדף_בדרגה(6, body, ..opts)
#let מדף_ז(body, ..opts) = מדף_בדרגה(7, body, ..opts)
#let pageband = _en(מדף_בדרגה, extra: (columns: "טורים"))
#let pageband1 = _en(מדף_א, extra: (columns: "טורים"))
#let pageband2 = _en(מדף_ב, extra: (columns: "טורים"))
#let pageband3 = _en(מדף_ג, extra: (columns: "טורים"))
#let pageband4 = _en(מדף_ד, extra: (columns: "טורים"))
#let pageband5 = _en(מדף_ה, extra: (columns: "טורים"))
#let pageband6 = _en(מדף_ו, extra: (columns: "טורים"))
#let pageband7 = _en(מדף_ז, extra: (columns: "טורים"))
#let pagebands_config = _en(הגדרות_מדפים, extra: (columns: "טורים"))

// ============================================================
//  זרמי הערות · multiple independent footnote streams (per page)
// ------------------------------------------------------------
//  Several *parallel* footnote apparatuses at the foot of the SAME page — each
//  a named stream with its own independent numbering, in its own block. Stack
//  them (one above the other) or set them side by side (one column per stream,
//  e.g. content-notes on one side and source-notes on the other). Any number of
//  streams. Same read-only-footer mechanism as #מדף (so it converges): notes
//  drop inline metadata in the main flow, the footer only queries.
//
//    #הערה_זרם("מקורות")[…]      // or the aliases #הערת_מקור / #הערת_תוכן
//    #הגדרות_זרמים(פריסה: "צד", זרמים: ("תוכן", "מקורות"),
//                   מספור: ("מקורות": "א"), כותרות: ("מקורות": [מקורות]))
// ============================================================
#let _sf_defaults = (
  זרמים: none,          // explicit stream order (array of names); else discovery order
  פריסה: "מוערם",       // "מוערם" = stacked · "צד" = side-by-side (a column per stream)
  מספור: (:),           // per-stream numbering scheme, e.g. ("מקורות": "א"); default "1"
  כותרות: (:),          // per-stream heading label, e.g. ("מקורות": [מקורות])
  טורים: (:),           // per-stream column count, e.g. ("מקורות": 2); default 1
                        //   (independent of the main-text and other streams' columns)
  גבהים: (:),           // fixed per-stream region height, e.g. ("מקורות": 1.5cm) —
                        //   the stream always occupies that slot, empty or not.
                        //   A percentage is a percentage of the SHEET, e.g.
                        //   ("ביאור": 10%). Any number of streams; the engine
                        //   reserves the page foot from exactly this dictionary,
                        //   the same way it does from the bands' array.
  גודל: 0.85em,
  סגנון: "normal",
  צבע: luma(20),
  קו: true,             // rule above the apparatus
  קו_בין: true,         // divider between stacked streams
  ריווח_בין: 0.45em,    // gap between streams
  ריווח_פריט: 0.22em,   // gap between entries in a stream
  משקל: "regular",      // per-stream weight (or one value for every stream)
  סימן: (:),            // how the note s number is set, wherever it prints
)
#let _sf_cfg = state("ksav-sf-cfg", _sf_defaults)
// What an undeclared fixed region does when its notes outgrow it, and how
// many continuation leaves may pass before each one says so. Document-level,
// set by #מסמך; a region's own גלישה always wins over the default.
#let _rg_default_spill = state("ksav-rg-default-spill", none)
#let _rg_warn_leaves = state("ksav-rg-warn-leaves", none)
#let הגדרות_זרמים(..opts) = {
  // `גלישה` is refused here rather than wired: overflow belongs to the region
  // (and to the channel that made it) by decision 12 — two streams sharing a
  // region share its answer, and a per-stream knob would let them disagree.
  // Accepting it here read as supported and reached no reader at all, which is
  // the exact class this refusal exists for.
  for k in opts.named().keys() {
    if k not in _sf_defaults and k not in _cfg_global_keys {
      panic("הגדרות_זרמים: ארגומנט לא מוכר · unrecognised argument: " + k)
    }
  }
  _sf_cfg.update(c => {
    let d = c
    for (k, v) in opts.named() { d.insert(k, v) }
    _nt_explicit(d, opts.named())
  })
}
// One page-foot channel's configuration: the stream settings, anything the
// channel declared, and its numbering by position in its region. Read at the
// marker *and* in the footer, because a marker that says `1` over an entry that
// says `א` is a reader sent to the wrong band.
#let _ch_foot_cfg(t, chans) = _ch_ramped(
  _ch_merge(_nt_under(_sf_cfg.get()), t, chans), t, chans, _ch_ramp_number, true,
)
#let _sf_label = label("ksav-sf")
#let _sf_all() = _ap_all(_sf_label)
// Numbered document-wide, like the per-page bands: a stream is one running
// sequence across the sefer, independent of every other stream.
#let _sf_scope(loc) = _sf_label
// הערה_זרם(זרם, body) — a footnote in the named stream `זרם`. The group here is
// a name rather than a tier integer, which is the whole of the difference
// between this apparatus and the two banded ones.
// Named arguments style this one note; see `_cfg_with`. A stream's own knobs are
// already per-stream — its settings are dictionaries keyed by stream name — so
// this is the layer below that: one note inside one stream, set apart from its
// peers.
// The page-foot half, which is what this command was when the foot was the only
// place a stream could be. It is internal now: `#הערה_זרם` is defined further
// down as the door, and routes here or to the margin depending on where the
// channel was placed. Renaming rather than adding a check, because the check
// cannot live here — `_sn_note` is defined after this line and Typst resolves a
// name where the closure is written.
#let _sf_stream_note(זרם, body, שם: none, ..opts) = context {
  let (own, rest) = _cfg_split(opts.named(), _ap_own_keys)
  _cfg_strict("הערה_זרם", rest)
  let name = _as_string(זרם)
  let cfg = _ch_foot_cfg(_ch_st.final(), (name,))
  _ap_note(_cfg_with(cfg, own), _sf_label, _sf_scope, name, body, own: own, שם: שם)
}
// Ordered list of stream names actually present, honouring an explicit order.
#let _sf_order(cfg, present) = {
  let explicit = cfg.at("זרמים", default: none)
  if type(explicit) == array {
    explicit.filter(s => present.contains(s)) + present.filter(s => not explicit.contains(s))
  } else { present }
}
// One channel's block inside a page-foot region. The slot belongs to the region,
// so this never takes one of its own — `גובה: none`.
//
// A stream title spans the stream's columns, so it goes `above` them rather than
// leading the first one.
#let _sf_stream_block(cfg, s, mine, all, on) = _ap_group(
  cfg,
  s,
  _ap_entries(mine, all, s),
  גובה: none,
  // The glyph the region chose for its clipped edge. `חתוך` — *whether* it
  // clipped — comes out of the walk in the spread above; this is only what to
  // draw when it did.
  סימן_חיתוך: _ap_pick(cfg, "סימן_חיתוך", s, auto),
  .._ap_setting(on, cfg, s),
  above: {
    let head = cfg.at("כותרות", default: (:)).at(s, default: none)
    if head != none {
      block(spacing: 0.2em, text(size: 0.72em, weight: "bold", fill: luma(90), head))
    }
  },
)

// Read-only footer: render every page-foot region's notes for the current page.
//
// The groups here are **regions**, not channels: a region is the fixed slot, and
// the channels pointed into it share that slot, stacked or side by side. A
// channel nobody declared is its own region, so a document written before
// channels existed lays out to the same page — one region per stream, each with
// the height `#הגדרות_זרמים(גבהים: …)` gave it.
/// How much room each stream has — its declared slot, or the shared reserve.
/// The streams' heights are a dictionary keyed by stream name where the bands'
/// are an array per tier, which is what `_ap_pick` is for.
#let _sf_cap(cfg, t, איפה) = g => {
  // The region this stream sits in may have declared a height of its own, and
  // that height is the room the stream has — which is what `גלישה` has to be
  // measured against. Before this it was read only for *drawing* the slot, so a
  // region with a declared height overflowed it in silence: the slot clipped
  // what it was handed, and the walk deciding what to hand it was still working
  // from the whole page reserve. Five notes into a 2cm region printed the fifth
  // at y=853.90 on an 841.89pt sheet — off the paper, which is the one thing
  // decision 6 says may never happen.
  let rg = _ch_region(t, g)
  let own = _rg_height_of(_rg_rec(t, rg))
  let חריגה = _val(_rg_rec(t, rg).at("חריגה", default: _rg_over_default))
  let fit(h) = _ap_fit_room(
    h,
    איפה: איפה,
    קו: _ap_line_of(cfg, g),
    חריגה: חריגה,
    מי: rg,
  )
  if own != none { return fit(own) }
  // …and a height declared on the **channel** is the same room, read here in
  // the same order the drawn slot resolves it (`_ch_region_height`), so the
  // walk packs against one number and the slot clips at that number too.
  for c in _ch_in_region(t, rg) {
    let h = _rg_height_of(_ch_rec(t, c))
    if h != none { return fit(h) }
  }
  let pick = _ap_pick(cfg, "גבהים", g, none)
  if pick != none { fit(pick) } else {
    _ap_room(איפה: איפה)
  }
}

/// Which end of the sheet a stream is painted at.
///
/// Read off the region the stream is pointed into, which is the stream's own
/// name when it was never pointed anywhere — the same rule every other question
/// about a stream's placement follows.
/// Where a stream is painted — the placement itself, and not a guess.
///
/// # The catch-all that cost a sefer its afternoon
///
/// This used to answer `"למעלה"` for the band above the text and **`"רגל"` for
/// everything else** — which is true of the two placements the page furniture
/// draws and false of the eight it does not. A note collected at the back of the
/// sefer, at the end of a section, in a companion volume or in a margin was
/// therefore classified as a page-foot note.
///
/// That is not a harmless default. The page-foot walk measures every entry it is
/// handed, on every page, to decide which notes each page can hold — and it was
/// being handed notes that are never drawn at the foot at all. `_ap_on_page`
/// then filtered them out *after* the measuring, so nothing appeared on the page
/// and everything had been paid for.
///
/// Measured with Typst's own span recorder on a sefer of thirty collected notes:
/// **`_ap_entry_height` ran 30,348 times** and `_ap_fill` 1,620, for an
/// apparatus that the page foot never draws. It is quadratic because the walk is
/// over pages and is re-run per page, and every one of those runs measured every
/// collected note in the document.
///
/// So: the placement, as it is. The two callers ask for the end they are
/// painting and compare, and the eight placements drawn elsewhere match neither.
#let _sf_where(t, g) = {
  let rg = _ch_region(t, g)
  let own = _rg_rec(t, rg).at("מיקום", default: auto)
  _val(if own == auto { _ch_rec(t, g).at("מיקום", default: "רגל") } else { own })
}

/// What a stream's region does when it is full.
///
/// Read off the **region** the stream is pointed into, which is the stream's own
/// name when it was never pointed anywhere — the case every document written
/// before channels existed is in. A channel may say it too, and then it is
/// saying it about the region it made.
#let _sf_spill(t) = {
  // The answer for one region cannot change between two entries on one page,
  // but this used to re-read and re-validate the moves list for every entry
  // the walk asked about. One validated answer per region, per evaluation.
  //
  // Computed **before** the closure is built: a Typst closure reads the
  // variables it captures but cannot modify them, so the cache has to be
  // finished rather than filled lazily. A group outside the table's order is
  // answered fresh rather than not at all.
  let answers = (:)
  let dflt = _rg_default_spill.get()
  for g in t.סדר {
    let rg = _ch_region(t, g)
    if rg in answers { continue }
    let own = _rg_rec(t, rg).at("גלישה", default: auto)
    let mine = if own == auto { _ch_rec(t, g).at("גלישה", default: auto) } else { own }
    answers.insert(rg, if mine == auto and dflt != none { dflt } else { _ap_spill_read("אזור", mine) })
  }
  g => {
    let rg = _ch_region(t, g)
    if rg in answers {
      answers.at(rg)
    } else {
      let own = _rg_rec(t, rg).at("גלישה", default: auto)
      let mine = if own == auto {
        if dflt != none { dflt } else { _ap_spill_read("אזור", auto) }
      } else { own }
      _ap_spill_read("אזור", mine)
    }
  }
}

/// Whether a region keeps its slot on a page where it has nothing in it.
///
/// The region's own answer when it gave one; otherwise a member channel may
/// carry it, since the key sits in `_ch_own` and a channel nobody declared as a
/// region is its own place — which is the only reading it ever had there. The
/// default is to hold, because that is what fixed geometry means.
#let _sf_holds(t, rg) = {
  let own = _rg_rec(t, rg).at("שומר_מקום", default: auto)
  if own == auto {
    let from_chans = t.סדר
      .filter(c => _ch_region(t, c) == rg)
      .map(c => _ch_rec(t, c).at("שומר_מקום", default: auto))
      .find(a => a != auto)
    from_chans == none or _val(from_chans) == true
  } else {
    _val(own) == true
  }
}

#let _sf_page_streams(איפה: "רגל") = context {
  let t = _ch_st.final()
  // Only the streams painted at this end. Filtered **before** the assignment,
  // so the band above the text and the band below it each work out their own
  // overflow against their own room rather than sharing one answer.
  let all = _sf_all().filter(e => _sf_where(t, e.value.group) == איפה)
  if all.len() > 0 {
    let pg = here().page()
    // Assigned to this page, not registered on it — see `_ap_assign`. The
    // configuration here is read twice: once against the streams *present* to
    // work out the assignment, and once against the streams that are drawn. The
    // first reading is deliberately the cheap one, since it only needs the
    // per-stream sizes and column counts that decide how tall an entry is.
    // The region's own overflow shaping, in the reading the *walk* uses as well
    // as in the one that draws — the two disagreeing is the one real limit.
    let base = _rg_over_cfg(
      _nt_under(_sf_cfg.get()),
      t,
      all.map(e => e.value.group).dedup(),
    )
    let on = _ap_on_page(all, base, _sf_cap(base, t, איפה), pg, policy_of: _sf_spill(t))
    let mine = on.entries
    // Fixed heights ⇒ fixed geometry: every stream that has a reserved slot is
    // laid out on every apparatus page, even with nothing in it this page, so
    // a stream never drifts into another's place.
    let fixed = _sf_cfg.get().at("גבהים", default: (:)).keys()
    // A region that declared a height is laid out on every apparatus page,
    // whether or not it has anything on this one. That is what a declared
    // height *means* — fixed geometry, so the region under it never moves —
    // and without this line an empty region was simply absent, the regions
    // below it drifted up, and `שומר_מקום` had nothing to switch between
    // because neither of its answers was happening.
    //
    // The members are the channels pointed into it; a region nobody declared a
    // channel for is its own channel, which is how `#הערה(אזור: "x")` names one.
    let declared = ()
    for rg in t.סדר_אזורים {
      if _rg_height_of(_rg_rec(t, rg)) == none { continue }
      let mem = t.סדר.filter(c => _ch_region(t, c) == rg)
      let mem = if mem.len() == 0 { (rg,) } else { mem }
      for c in mem { if not declared.contains(c) { declared.push(c) } }
    }
    // **A page with no entries here still draws the regions that hold their
    // place.** The whole block used to be gated on `mine.len() > 0`, so the
    // pages between two apparatus pages — and every page of a sefer whose notes
    // land elsewhere — lost the fixed geometry entirely.
    let holds_place = fixed + declared.filter(s => not fixed.contains(s))
    let any_holds = holds_place.any(s => _sf_holds(t, _ch_region(t, s)))
    if mine.len() > 0 or any_holds {
      let present = mine.map(e => e.value.group).dedup()
      let fixed = fixed + declared.filter(c => not fixed.contains(c))
      let streams = _sf_order(_sf_cfg.get(), present + fixed.filter(s => not present.contains(s)))
      // …and the ramps, for the channels a `#ערוץ` line declared. A channel's
      // numbering belongs to the channel, so moving one from the foot of the
      // page to the back of the sefer must not renumber it — which it did until
      // this line, because the two apparatuses answer that question differently
      // when nobody asks. A stream nobody declared is untouched.
      let cfg = _rg_over_cfg(_ch_foot_cfg(t, streams), t, streams)
      // A region that compresses draws compressed. The walk above already
      // measured it that way, and the two disagreeing would put a note in a
      // place the arithmetic did not leave room for — the one real limit
      // `NOTES-PLAN` names: two notes computing their positions from different
      // answers to the same question. `_ap_pick` reads a dictionary as
      // per-group, so this says it about the streams that asked and no others.
      {
        let gaps = (:)
        let spill = _sf_spill(t)
        for s in streams {
          gaps.insert(
            s,
            if spill(s).contains("דחיסה") {
              0pt
            } else {
              // Through `_ap_pick`, like every other knob here: the gap is
              // per-group once anything can set it per-group, and read with a
              // bare `.at` a dictionary arrives whole as the gap.
              _ap_pick(cfg, "ריווח_פריט", s, 0.3em)
            },
          )
        }
        cfg.insert("ריווח_פריט", gaps)
      }
      let regions = ()
      let members = (:)
      for s in streams {
        let rg = _ch_region(t, s)
        if not regions.contains(rg) { regions.push(rg) }
        let m = members.at(rg, default: ())
        m.push(s)
        members.insert(rg, m)
      }
      // `שומר_מקום` — whether a region keeps its slot on a page where it has
      // nothing in it. `true`, the default, is fixed geometry: the region below it
      // never moves, which is the entire reason a writer declares heights.
      // `false` lets whatever is under it rise into the space.
      //
      // It is decided **here** and not inside `_ap_slot`, and that is the whole
      // difference between this and the version that was written and reverted:
      // collapsing the block *inside* the slot frees room nothing else can reach,
      // because the room a page-foot region occupies is taken off the bottom
      // margin before any of this runs. Dropping the region out of the list is
      // what moves the page.
      // Regions print in the order they were **declared**, not in the order a
      // note happened to be written. Without this a page whose first note is in
      // the lower region draws that region first, so the two regions swap places
      // from page to page — which is the exact opposite of the fixed geometry a
      // declared height is asked for.
      let regions = (
        t.סדר_אזורים.filter(rg => regions.contains(rg))
          + regions.filter(rg => not t.סדר_אזורים.contains(rg))
      )
      let regions = regions.filter(rg => _sf_holds(t, rg) or members.at(rg).any(s => mine.any(e => e.value.group == s)))
      // The tripwire: a fixed region spilling past the writer's threshold
      // says so at the top of every continuation leaf — visible, small, and
      // naming the region — rather than spending near-blank leaves in
      // silence. `pieces` is which slice of its note this page shows, so a
      // member at or past the threshold IS a continuation leaf.
      let warn = _rg_warn_leaves.get()
      let notices = if warn != none {
        regions.filter(rg => members.at(rg).any(s => on.pieces.at(s, default: 0) >= warn))
      } else { () }
      set align(if text.dir == rtl { right } else { left })
      block(width: 100%, {
        for rg in notices {
          text(size: 0.62em, fill: luma(120))[
            #rg: הגלישה נמשכת — הגדילו את האזור או הגבילו את ההערות ·
            spill continues, leaf #calc.round(on.pieces.at(members.at(rg).first(), default: 0))
          ]
        }
        _ap_bands(
        cfg,
        regions,
        rg => {
          let chans = members.at(rg)
          let one(s) = _sf_stream_block(cfg, s, mine, all, on)
          // A grid region: the channels are columns, and `יחידה` keeps them in
          // register. Without it the columns are one long cell each and drift
          // apart by however much their contents differ, which is the thing
          // that makes parallel typesetting look amateur and which no care
          // inside a column can fix. With it there is one grid row per unit,
          // and a grid row starts level by construction.
          let unit = _ch_region_unit(t, rg)
          let plans = _rg_plans(t, rg, chans)
          let cycle = _val(_rg_rec(t, rg).at("מחזור", default: false)) == true
          _ap_slot(
            _ch_region_height(cfg, t, rg, chans),
            // The region owns the height, so the region owns the mark. The
            // group inside it is handed `גובה: none` and its own slot is a
            // no-op; this is the block that actually clips.
            סימן: if chans.any(c => on.cuts.at(str(c), default: false)) {
              let own = _rg_rec(t, rg).at("סימן_חיתוך", default: auto)
              if own == auto { _ap_clip_mark } else { own }
            } else { none },
            // Same line the walk budgeted with (`_sf_cap`), so a `שורות`
            // height that reaches here unresolved still answers one number.
            קו: _ap_line_of(cfg, if chans.len() > 0 { chans.first() } else { rg }),
            if chans.len() == 1 and unit == none {
            one(chans.first())
          } else if _ch_region_side(t, rg) {
            if unit == none {
              // One row, and it is the first plan: a region with no
              // synchronisation unit has nothing to make a second row out of.
              let plan = plans.first()
              let row = _rg_row(
                plan,
                s => (one(s), mine.any(e => e.value.group == s)),
                over: chans.filter(s => (
                  not plan.ערוצים.contains(s) and mine.any(e => e.value.group == s)
                )),
                where: "אזור " + rg,
              )
              if row == none { [] } else { row }
            } else {
              let bounds = _rg_bounds(unit)
              // Only the units that have something in them this page. An empty
              // row is a band of white across the page for a siman that had no
              // commentary, and the register is kept by the rows that exist.
              let want = ()
              for e in mine {
                if chans.contains(e.value.group) {
                  let u = _rg_unit_of(bounds, e)
                  if not want.contains(u) { want.push(u) }
                }
              }
              // A row per unit, each at its own plan — which is where the shape
              // is allowed to change down the page. The gap between two rows
              // belongs to the row above it, so a plan that widens can also say
              // it wants more air before the next one.
              let rows = ()
              for (i, u) in want.sorted().enumerate() {
                let plan = _rg_plan_at(plans, cycle, i)
                let here(s) = mine.filter(e => (
                  e.value.group == s and _rg_unit_of(bounds, e) == u
                ))
                let row = _rg_row(
                  plan,
                  s => {
                    let his = here(s)
                    (_sf_stream_block(cfg, s, his, all, on), his.len() > 0)
                  },
                  // Anything with something to say in this unit and no column in
                  // this row. `עודף` decides where it goes; what it may not do is
                  // go nowhere.
                  over: chans.filter(s => (
                    not plan.ערוצים.contains(s) and here(s).len() > 0
                  )),
                  where: "אזור " + rg + " · " + _as_string(unit) + " " + str(u + 1),
                )
                if row != none { rows.push((row, plan.ריווח)) }
              }
              for (i, r) in rows.enumerate() {
                if i > 0 { v(rows.at(i - 1).at(1)) }
                r.at(0)
              }
            }
          } else {
            for s in chans { one(s) }
          })
        },
        divider: 30%,
        side: _val(cfg.at("פריסה", default: "מוערם")) == "צד",
        )
      })
    }
  }
}
#let streams_config = _en(הגדרות_זרמים, extra: (columns: "טורים"))

// ============================================================
//  ערוצים · channels — the commands
// ------------------------------------------------------------
//  Three acts, and the arrangement stops being encoded in the command's
//  identity:
//
//    #הערה[…]                       a note
//    #הערה(ערוץ: "ביאור")[…]         a note in a channel you named
//    #ערוץ("שער", מקור: "ביאור")     …and that channel is a note on a note
//
//  Everything else is a declaration at the top of the file, and it can be
//  changed after the notes are written — which is the payoff, and which the
//  eighteen commands could not give. Moving a commentary from the foot of the
//  page to the back of the sefer was a find-and-replace over every note; it is
//  now one word in one line.
//
//  See the table above for what a channel and a region are.
// ============================================================
#let _ch_own = (
  "מקור", "מיקום", "אזור", "גובה", "גלישה",
  "מספור", "גודל", "סגנון", "צבע", "טורים", "כותרת", "הקטנה_מזערית",
  // What stands at the head of an entry — the number, the dibbur hamaschil and
  // the four addresses — plus how an address is set and what words it prints.
  // See `_eh_addr` and `_xa_part`.
  "ראש", "ציטוט", "מספור_כתובת", "דף_ראשון", "שומר_מקום", "כתובות",
)
// `גלישה` — what this region does when it is full. On the region and not only on
// the channel, because it is a property of *the space*: two channels sharing one
// region share its overflow, and letting each answer separately would be two
// notes computing their positions from different answers to the same question,
// which `NOTES-PLAN` names as the one real limit. A channel with a region of its
// own — the common case — sets it either way and means the same thing.
#let _rg_own = (
  "מיקום", "גובה", "פריסה", "כותרת", "גלישה", "הקטנה_מזערית", "שומר_מקום",
  // The rest of the shrink ladder and the tightening, which `_rg_over_keys`
  // has been merging from a region since it existed while `#אזור` refused to
  // accept them — so the override read a key the declaration rejected, and the
  // only way to reach either was to set it on every channel instead.
  "הקטנה_צעד", "כיווץ_מידה",
  // What to do when the declared height is more than the page has. See
  // `_ap_fit_room`.
  "חריגה",
  "ראש", "מספור_כתובת", "דף_ראשון", "כתובות",
  // Whether the region opens on a sheet of its own. `#הערות_בסוף` has had this
  // since it existed and a region had no way to say it, so a collected apparatus
  // at the end of the sefer either always broke the page or never could.
  // `auto` keeps each placement's own habit: a companion volume starts a sheet
  // because that is what makes it a volume, and the back of the sefer follows on.
  "עמוד_חדש",
  // A parallel-column region: the widths of its columns, and what keeps them in
  // register. See the grid-region block above `_ch_region_side`.
  "טורים", "יחידה",
  // …and the four the row plan reads: whether the list of plans repeats its last
  // or cycles, the two gaps that used to be numbers written into the renderer,
  // and what a cell with nothing in it does — which is the difference between a
  // parallel-text table and a Vilna wrap.
  "מחזור", "מרווח_טורים", "ריווח_טורים", "ריק", "עודף",
  // What a box that could not hold its contents says at its edge, for a sefer
  // that wants the clean edge and knows what it is choosing. See `_ap_slot`.
  "סימן_חיתוך",
  // How a note too tall for the region is continued onto the next page: how far
  // back the cut may look for a sentence or paragraph break, and whether the
  // continuation repeats the note's number. See `_ct_fit` and `_ap_group`.
  "תפר", "סימן_בהמשך",
)

// The apparatus configuration for a set of collected channels: whatever the
// channel declared and whatever the bands were configured with, then the ramps.
#let _ch_cfg(t, chans) = _ch_ramped(
  _ch_merge(_nt_under(_md_cfg.get()), t, chans), t, chans, _ch_ramps, false,
)

// ---- the collected placement · one region, rendered where it is asked for ----
// Its own label, and not the section bands': `#הערות_מדורגות` renders *every*
// group in its section, so a channel sharing that label would print in a band it
// was never pointed at. Its own dump marker per region, and not one shared one:
// a document that dumps a section region at every siman and a document-end
// region once would otherwise cut the second one's scope at every siman.
#let _cn_label = label("ksav-cn")
#let _cn_dump(rg) = label("ksav-cnd-" + rg)
#let _cn_scope(rg) = loc => _ksav_between(selector(_cn_label), _cn_dump(rg), loc)
#let _cn_note(cfg, rg, name, body, own, שם: none) = _ap_note(
  cfg, _cn_label, _cn_scope(rg), name, body, own: own, שם: שם, אזור: rg,
)

// ערוץ(שם, מקור: auto, מיקום: "רגל", אזור: none, גובה: none, …) — declare a
// channel, or change one that already exists.
//
// Read with `.final()` by everything that places a note, so the line may sit
// anywhere in the file and still reach page one — unlike the `#הגדרות_*`
// commands underneath it, which are read at the position they are written.
#let ערוץ(שם, ..opts) = {
  let name = _as_string(שם).trim()
  let (own, rest) = _cfg_split(opts.named(), _ch_own)
  _cfg_strict("ערוץ", rest)
  if "גלישה" in own { let _ = _ap_spill_read("ערוץ", own.at("גלישה")) }
  // Said here rather than at the note, where a misspelled placement would
  // silently become a page-foot region and the writer would be looking at the
  // wrong end of the sefer for their notes.
  if "מיקום" in own and not _ch_places.contains(_val(own.מיקום)) {
    panic(
      "ערוץ: מיקום לא מוכר · unknown placement: " + _as_string(own.מיקום)
        // The whole set, read off the table: three of the ten hid the side
        // family and `קובץ` from the writer who most wanted them.
        + " (" + _ch_places.join(" · ") + ")",
    )
  }
  _ch_st.update(t => {
    let ch = t.ערוצים
    let rec = ch.at(name, default: (:))
    for (k, v) in own { rec.insert(k, v) }
    ch.insert(name, rec)
    let order = t.סדר
    if not order.contains(name) { order.push(name) }
    (..t, ערוצים: ch, סדר: order)
  })
}

// אזור(שם, מיקום: "רגל", גובה: none, פריסה: "מוערם", כותרת: none) — declare a
// region: a fixed area with a size of its own that any channel can be pointed
// into. Two channels in one region is what `פריסה` answers.
#let אזור(שם, ..opts) = {
  let name = _as_string(שם).trim()
  let (own, rest) = _cfg_split(opts.named(), _rg_own)
  _cfg_strict("אזור", rest)
  // Read here purely to be checked. `_sf_spill` reads it again where it is
  // used, and that reading is the one that counts — but it only happens for a
  // region something was actually filed into, so a misspelled move in a region
  // nobody wrote a note in compiled clean and did nothing at all. A writer is
  // told about a word they got wrong at the line they wrote it on.
  if "גלישה" in own { let _ = _ap_spill_read("אזור", own.at("גלישה")) }
  if "חריגה" in own and not _rg_over.contains(_val(own.at("חריגה"))) {
    panic(
      "אזור: חריגה לא מוכרת · unknown overflow answer: "
        + _as_string(own.at("חריגה")) + " (" + _rg_over.join(" · ") + ")",
    )
  }
  if "מיקום" in own and not _ch_places.contains(_val(own.מיקום)) {
    panic(
      "אזור: מיקום לא מוכר · unknown placement: " + _as_string(own.מיקום)
        + " (" + _ch_places.join(" · ") + ")",
    )
  }
  _ch_st.update(t => {
    let rg = t.אזורים
    let rec = rg.at(name, default: (:))
    for (k, v) in own { rec.insert(k, v) }
    rg.insert(name, rec)
    let order = t.סדר_אזורים
    if not order.contains(name) { order.push(name) }
    (..t, אזורים: rg, סדר_אזורים: order)
  })
}


// One note, in one channel. Which collector it lands in is read off the table,
// so nothing at the call site says where the note prints — that is the whole
// point of the model, and it is what lets the placement change afterwards.
#let _ch_note(שם, body, named) = context {
  let t = _ch_st.final()
  let name = _as_string(שם).trim()
  let kind = _ch_kind(t, name)
  // The note's *own* name, lifted out before the style split. It is not a style
  // knob and not the channel's — it is which note this is, so that
  // `#הפניה_להערה` can print the number it turned out to be, and every one of
  // the three collectors below takes it.
  let mine = if "שם" in named { named.at("שם") } else { none }
  let quote = if "ציטוט" in named { named.at("ציטוט") } else { none }
  let named = {
    let d = named
    if mine != none { let _ = d.remove("שם") }
    if quote != none { let _ = d.remove("ציטוט") }
    d
  }
  if kind == "מקורי" {
    // Typst's own balanced series. `rest` travels on so a misspelled argument
    // still gets `footnote`'s own error naming it.
    let (own, rest) = _cfg_split(named, _fn_own_keys)
    הערה_בדרגה(
      _ch_depth(t, name), body,
      שם: mine, ציטוט: quote,
      _ערוץ: name, _מספור: _ch_scheme(t, name),
      ..own, ..rest,
    )
  } else if kind == "רגל" {
    // A region at the foot of the page. Not balanced — Typst has exactly one
    // balanced series and the default channel is it — so this is fixed
    // geometry, and the engine reserves the page foot for it.
    _sf_stream_note(name, body, שם: mine, ..named)
  } else {
    let (own, rest) = _cfg_split(named, _ap_own_keys)
    _cfg_strict("הערה", rest)
    let rg = _ch_region(t, name)
    _cn_note(_cfg_with(_ch_cfg(t, (name,)), own), rg, name, body, own, שם: mine)
  }
}

// הצג_אזור(שם) — print a collected region's channels here, and close its scope.
// Called at the end of the section, or once at the end of the document; each
// call renders only the notes written since the previous one.
/// Where a region's placement says it should start.
///
/// A companion volume gets a sheet of its own and a page count of its own, and
/// the back of the sefer follows on — **whether the writer placed the region by
/// hand or left the document to place it.** Being a volume is a property of the
/// region, not of which line happened to draw it, and putting this only in the
/// automatic dump meant a writer who wrote `#הצג_אזור` got a companion running
/// on from the last line of the body with the sefer's own page numbers.
///
/// An undeclared region is its own channel, so the placement is read from
/// whichever of the two said something.
#let _rg_open(t, rg) = {
  let own = _rg_rec(t, rg).at("מיקום", default: auto)
  let place = _val(if own == auto {
    _ch_rec(t, rg).at("מיקום", default: "רגל")
  } else {
    own
  })
  let ask = _rg_rec(t, rg).at("עמוד_חדש", default: auto)
  let fresh = if ask == auto { place == "קובץ" } else { _val(ask) == true }
  if fresh {
    pagebreak(weak: false)
    // Its own count, which is what separates a volume from a section: without it
    // a companion is the back of the sefer with a rule above it, and a reader
    // citing it would be citing this sefer's pages.
    if place == "קובץ" { counter(page).update(1) }
  }
}

#let _rg_show(rg, כותרת) = {
  context {
    // The whole region, and not only the entries inside it. `_ap_group` says the
    // same thing one level down; a region also has furniture of its own — its
    // title, the rule above it, the block that opens it — and each of those is a
    // line the layout would number and put into the record `_ln_at` reads.
    set par.line(numbering: none)
    let t = _ch_st.final()
    let notes = _ksav_real_of(_cn_scope(rg)(here()))
    // Membership is what filing recorded, carried on the entry itself. The
    // window between this region's dump markers can hold entries filed to
    // another region (two section dumps sit back to back), so a filter is still
    // needed — but re-deriving the region from the channel's *declarations*
    // answered "its own name" for every note filed here through
    // `#הערה(ערוץ: …, אזור: …)` whose channel never declared one, and the entry
    // was numbered, queryable, and drawn by nothing.
    let mine = notes.filter(e => e.value.at("אזור", default: none) == rg)
    if mine.len() > 0 {
      // Inside the guard: a page break in front of a region with nothing in it
      // is a blank sheet the writer did not ask for.
      _rg_open(t, rg)
      // Declared channels in declaration order, then anything that landed here
      // without being declared — which keeps a note visible rather than tidy.
      let chans = _ch_in_region(t, rg).filter(c => mine.any(e => e.value.group == c))
      for e in mine { if not chans.contains(e.value.group) { chans.push(e.value.group) } }
      let cfg = _rg_head_cfg(_ch_cfg(t, chans), t, rg, chans: chans)
      let title = if כותרת != auto { כותרת } else {
        _rg_rec(t, rg).at("כותרת", default: none)
      }
      _ap_bands(
        cfg,
        chans,
        c => _ap_group(
          cfg, c, _ap_entries(mine, mine, c),
          above: {
            let head = _ch_rec(t, c).at("כותרת", default: none)
            if head != none {
              block(spacing: 0.2em, text(size: 0.72em, weight: "bold", fill: luma(90), head))
            }
          },
        ),
        head: if title != none { heading(level: 3, outlined: false, numbering: none, title) },
        rule_gap: 0.3em,
        divider: 40%,
        side: _ch_region_side(t, rg),
      )
    }
  }
  // The section boundary itself, after the context above so that context renders
  // the section ending here rather than the next one.
  //
  // **A paragraph of nothing is still a paragraph, and the layout numbers it.**
  // This anchor carries no ink and lands between the prose and the region, so a
  // sefer with `מספור_שורות` on printed a stray number in the margin under its
  // last line — and, once the line address was built on the same record, an entry
  // written on the last line of the text was addressed to the blank line under
  // it. The scope keeps it out of the numbering and out of the record.
  {
    set par.line(numbering: none)
    [#metadata(none)#_cn_dump(rg)]
  }
}

/// Every region placed at the end of a *section*, drawn here.
///
/// A channel at `מיקום: "סוף_מדור"` files its notes into a collected region like
/// any other, and the only thing that drew one was an explicit `#הצג_אזור` — so a
/// writer who declared the placement and called nothing got markers in the body
/// and no entries anywhere. The notes were filed, numbered and queryable, and
/// never drawn.
///
/// It is emitted by `#סימן`, and by `#מסמך` for the last section, and by nothing
/// else. **Not by a `show heading` rule**, which was the first shape and is
/// wrong: `_ap_bands` draws a band's own title with a raw `heading(level: 3)`,
/// so a rule on headings would fire from inside the thing it is rendering.
///
/// Renders nothing at all for a document with no such channel, which is every
/// document written before this line.
#let _cn_section_dump() = context {
  let t = _ch_st.final()
  let shown = _cn_shown.final()
  let want = t.סדר_אזורים.filter(rg => (
    _val(_rg_rec(t, rg).at("מיקום", default: "רגל")) == "סוף_מדור"
  ))
  // …and the channels that named no region, which are their own. See the
  // document-end dump in `#מסמך` for why this half is separate.
  for c in t.סדר {
    let rg = _ch_region(t, c)
    if rg in t.אזורים { continue }
    if _val(_ch_rec(t, c).at("מיקום", default: "רגל")) != "סוף_מדור" { continue }
    if not want.contains(rg) { want.push(rg) }
  }
  for rg in want {
    if shown.contains(rg) { continue }
    _rg_show(rg, auto)
  }
}

// הצג_אזור("ביאורים") — print a region here.
//
// Marks the region as placed, so the automatic dump at the end of `#מסמך` leaves
// it alone. A writer who says where a region goes has said it, and a document
// that places some of its regions by hand gets the rest at the end.
#let הצג_אזור(שם, כותרת: auto) = {
  let rg = _as_string(שם).trim()
  _cn_shown.update(l => if l.contains(rg) { l } else { l + (rg,) })
  _rg_show(rg, כותרת)
}

#let channel = _en(ערוץ, extra: (columns: "טורים"))
#let region = _en(אזור, extra: (columns: "טורים"))
#let show_region = _en(הצג_אזור)

// tier aliases — Hebrew letters mirror the "block A / block B / block C" model.
// Each forwards `..opts`, because an alias that swallowed the per-note override
// would be a control that works on `#הערה_בדרגה(2, …)` and silently does nothing
// on `#הערה_ב[…]`, which is the spelling everybody actually writes.
//
// Each is the channel of that name — `#הערה_ב` is the channel whose source is
// `#הערה` — so declaring `#ערוץ("הערה_ב", מיקום: "סוף")` moves every tier-two
// note to the back of the sefer without one of them being retyped. That is the
// difference between a tier and a channel, and it is why these route through
// `_ch_note` while `#הערה_בדרגה` stays what it is: the native apparatus's own
// tier command, one floor below the model.
#let הערה_א(body, ..opts) = _ch_note(_ch_tier_name(1), body, opts.named())
#let הערה_ב(body, ..opts) = _ch_note(_ch_tier_name(2), body, opts.named())
#let הערה_ג(body, ..opts) = _ch_note(_ch_tier_name(3), body, opts.named())
#let הערה_ד(body, ..opts) = _ch_note(_ch_tier_name(4), body, opts.named())
#let הערה_ה(body, ..opts) = _ch_note(_ch_tier_name(5), body, opts.named())
#let הערה_ו(body, ..opts) = _ch_note(_ch_tier_name(6), body, opts.named())
#let הערה_ז(body, ..opts) = _ch_note(_ch_tier_name(7), body, opts.named())
#let tier1 = _en(הערה_א)
#let tier2 = _en(הערה_ב)
#let tier3 = _en(הערה_ג)
#let tier4 = _en(הערה_ד)
#let tier5 = _en(הערה_ה)
#let tier6 = _en(הערה_ו)
#let tier7 = _en(הערה_ז)

// ---- הערות צד · side-column notes, aligned to their marker's line ----
// A substantial notes column beside the text (not a thin margin). Wrap a section
// in #עם_הערות_צד[...]; inside it, #הערת_גיליון[...] drops a numbered marker and
// its note appears in the side column *beside that line*.
//
// Real sidenotes, not a "notes column": each note is drawn at the vertical
// offset of its own marker, so the reader's eye goes straight across. The
// mechanism is read-only, so it converges: a note drops inline metadata, and the
// page draws the whole column from that query — measuring each note at the
// column width and stacking them greedily, a note at its marker's line or just
// below the previous one when that would overlap.
//
// **This half of the apparatus is here, above the document wrapper, and the
// commands a writer types are three hundred lines further down.** That is not
// tidiness: the column is drawn from the page's own foreground, `#מסמך` installs
// it, and a Typst closure resolves its names where it is written — so a renderer
// defined after the wrapper is simply not there when the wrapper runs. The
// page-band apparatus (`_pp_page_bands`) sits above the wrapper for exactly the
// same reason, and this is that convention rather than a new one.
#let _sn_defaults = (
  יחס: 2,          // main-column : note-column width ratio
  מרווח: 1.2em,    // gutter between the two columns
  גודל: 0.78em,
  סגנון: "normal", // "normal" | "italic"
  משקל: "regular", // "regular" | "bold"
  צבע: luma(65),
  ריווח: 0.6em,    // minimum vertical gap between two stacked notes
  סימן: (:),       // how the note's number is set in the running text
)
#let _sn_cfg = state("ksav-sn-cfg", _sn_defaults)
// What one sidenote may overrule: its own text. The ratio, the gutter and the
// minimum gap between notes are the column's geometry, and every note on the page
// computes the same stack from them — a note answering them for itself would be
// placed against one arithmetic and measured by its neighbours against another.
// See `_cfg_split` and `_sn_note`.
// `הזזה` is not a look — it is this note's answer to *"may you be moved?"*. It
// travels with the looks because the same per-note dictionary already reaches the
// walk that decides, and a second channel for one value would be a second thing
// to keep in step.
#let _sn_own_keys = ("גודל", "סגנון", "משקל", "צבע", "הזזה")
#let הגדרות_הערות_צד(..opts) = _sn_cfg.update(c => { let d = c; for (k, v) in opts.named() { d.insert(k, v) }; _nt_explicit(d, opts.named()) })
#let _sn_wrap(cfg, mark, body) = text(
  size: cfg.at("גודל", default: 0.78em),
  // Slant and weight, which a side column had no way to ask for. A peirush
  // running down the margin set in italic is an ordinary arrangement in a
  // printed sefer, and this apparatus offered size and colour — so the writer
  // who wanted it wrote a slant command inside every note by hand.
  //
  // And then asking for it still did nothing, because the slant went to
  // `text(style:)`. The knob was added and the thing it turns was not connected;
  // through `_ks_style` it is.
  weight: cfg.at("משקל", default: "regular"),
  fill: cfg.at("צבע", default: luma(65)),
  // `mark: none` prints no marker of its own — which is what the footnote
  // fallback below asks for, since Typst numbers that entry with its own series.
  _ks_style(cfg.at("סגנון", default: "normal"), if mark == none {
    body
  } else {
    [#super[#mark] #body]
  }),
)

// A sidenote's marker, in the document's own numerals.
//
// *"The tag's language should follow the document"* — and it can, exactly:
// `text.lang` is what the page setup set from `שפה`, so a Hebrew document
// numbers its sidenotes א, ב, ג the way a sefer does, and an English one counts
// 1, 2, 3. Read rather than configured, because a second switch for the same
// fact is a second thing to set and to forget.
//
// `סימון` on the config overrules it for a writer who wants the other one:
// "עבריות", "ערביות", or auto to follow the document.
#let _sn_mark(n, prime: false) = context {
  let want = _sn_cfg.get().at("סימון", default: auto)
  let hebrew = if want == auto { text.lang == "he" } else { want == "עבריות" }
  let m = if hebrew { _hb_num("א", _hb_mode.get(), n) } else { [#n] }
  if prime [#m′] else [#m]
}


// ---- ערימת הערות הצד · one stack, computed the same way by every note ----
//
// **The arithmetic lives in `_sn_assign`, and only there.** An earlier walk —
// clamp, shift-both-ways, cascade, and a `spill` list for what will not fit —
// sat here finished, documented, and called by nothing: the same greedy stack,
// a second implementation waiting to disagree with the first by one gap. It is
// gone; this comment is what keeps the lesson next to the place it would have
// rotted in. The three moves it carried are the three `_sn_assign` runs
// unconditionally, because they are decision 6's invariant and not choices.

// How many note columns the wrapper in force reserved, and on which sides. Read
// per *note*, at the note's own location, because the answer can differ down a
// sefer — one section beside a peirush, the next with a peirush down both sides.
#let _sn_shape = state("ksav-sn-shape", (טורים: 0, צדדים: "שניהם"))

/// Is there anywhere for this side note to go?
///
/// A reserved margin, a wrapper around the prose, or — for a note whose channel
/// was *placed* at the side — the margin the page already has. Asked in one
/// place because the registrar and the renderer disagreeing about it is a note
/// drawn twice, or not at all.
#let _sn_has_column(loc, מוצב) = (
  מוצב or _sn_reserve.final() > 0pt or _sn_shape.at(loc).at("טורים", default: 0) > 0
)

/// The note column's own geometry on this page: where its left edge is and how
/// wide it is, both in page coordinates.
///
/// **Derived from the page rather than from the container**, and that is the
/// whole reason this apparatus was rebuilt. It used to ask `layout()` for the
/// width of whatever box it happened to be standing in and then `place` at an
/// offset from that box's start corner — which works exactly as long as the note
/// is placed by the paragraph it was written in, and a note carried onto the
/// *next* page never can be. Page coordinates have no such problem: every marker
/// already reports its position in them.
// _rc_outside_is_left(p, כריכה_ימין) — which physical edge is the OUTSIDE one on
// page `p`.
//
// Typst binds `inside`/`outside` to page parity: with `binding: right`, an odd
// page carries its binding on the right, so its outside edge is the left one.
// Both the mirrored margins and the running heads that align to the outside edge
// have to agree about this, and they are computed in different places — so it is
// one function, and neither gets to decide for itself.
#let _rc_outside_is_left(p, כריכה_ימין) = {
  if כריכה_ימין { calc.odd(p) } else { not calc.odd(p) }
}

#let _sn_column(cfg, shape, side, pg) = {
  let ml = _pg_margin("left")
  let mr = _pg_margin("right")
  let textw = page.width - ml - mr
  let g = cfg.at("מרווח", default: 1.2em).to-absolute()
  let r = cfg.at("יחס", default: 2)
  // One reserved column against two: the grid is (main, note) in the first case
  // and (note, main, note) in the second, so the second spends a gutter twice
  // and divides what is left by one more part.
  let two = shape.at("טורים", default: 0) == 2 and shape.at("צדדים", default: "שניהם") == "שניהם"
  // A document-level reserve **is** the column. Carving a share out of the text
  // as well would take the margin twice — once from the page and once from the
  // prose — and leave the body narrower than the writer asked for.
  let res = _sn_reserve.final()
  let wrapped = shape.at("טורים", default: 0) > 0
  let colw = if res > 0pt {
    res - g
  } else if not wrapped {
    // No reserve and no wrapper: the margin the page already has.
    _sn_free() - g
  } else if two {
    (textw - 2 * g) / (r + 2)
  } else {
    (textw - g) / (r + 1)
  }
  // Which edge, and for two of the four it depends on the page.
  //
  // "חוץ" is the far side of the main column and "פנים" the near one — the side
  // toward the binding — so on a **two-sided** sefer they change edge with the
  // parity of the page and stay where they are relative to the spine. That is
  // what makes a margin apparatus look right in a bound sefer and what an
  // absolute edge cannot do. "ימין" and "שמאל" name an edge outright and never
  // move, which is a real thing to want and is why both kinds exist.
  //
  // A one-sided document has no spine to be inside of, so "חוץ" keeps the
  // meaning it has always had — the far side of the text direction — and every
  // document written before this lays out identically.
  let rtl_ = text.dir == rtl
  // `.final()`, not `.get()`: two-sidedness is a property of the document, and a
  // page foreground is laid out at a location where the body has not yet set it.
  let outside_left = if _pg_two_sided.final() { _rc_outside_is_left(pg, rtl_) } else { rtl_ }
  let at_left = if side == "חוץ" {
    outside_left
  } else if side == "פנים" {
    not outside_left
  } else {
    side == "שמאל"
  }
  // With a reserve the strip is *outside* the text block, so the column starts
  // at the page edge plus the ordinary margin rather than at the text's own.
  let outer = if res > 0pt { res } else if not wrapped { _sn_free() } else { 0pt }
  (
    x: if at_left { ml - outer } else { page.width - mr + outer - colw },
    w: colw,
  )
}

// ---- the column, drawn once per page, out of the page's own foreground ----
//
// The same read-only discipline as `_pp_page_bands`, and for the same reason:
// page furniture is laid out many times while Typst breaks pages, so it may
// query and must never write.
//
// **Why the notes are drawn here rather than by the paragraphs that carry
// them.** Two things a note cannot do from inside its own sentence:
//
//   · **Not break it.** `layout()` and `place()` are both block-level, and a
//     block-level call from the middle of a paragraph ends the line it sits on.
//     Measured: 36.72pt between two body lines around a note against 16.92pt
//     everywhere else — about 20pt of stray leading per note, in the *body*, in
//     a document class where the notes outnumber the text five to one. Boxing
//     the call fixes the paragraph and breaks the placement, because `place`
//     inside a box anchors to the box: measured at x=-73.6 on a 595pt page,
//     which is off the paper on the other side.
//   · **Reach the next page.** `place(dy:)` moves within the page it is on, so a
//     note that does not fit had nowhere to go and the column simply grew off
//     the sheet — `dense.ksav`, y=827.27 on an 841.89pt page, over the page
//     number and into the border no printer will mark.
//
// From the foreground both are free. The note contributes nothing to the
// paragraph but its marker, and the page it is drawn on is an output of the
// walk below rather than an assumption.
/// Every stream that lands in a side column, and how each one draws its marker.
///
/// **Four, not three.** An editor's comment rides this apparatus too — that is
/// what makes a comment sit beside the line that raised it rather than at the
/// foot of the page — and it draws a pencil rather than a numeral. It used to
/// hand `_sn_note` a closure for that; the drawing moved to the page, and a
/// closure cannot travel in a note's metadata, so what travels is the *kind* and
/// the marker is chosen from it here.
#let _sn_streams = (
  (lbl: "ksav-sn", kind: "צד"),
  (lbl: "ksav-sn-r", kind: "צד"),
  (lbl: "ksav-sn-l", kind: "שמאל"),
  (lbl: "ksav-rv", kind: "עורך"),
)

/// Every side stream a page has to draw: the built-in ones, and one for each
/// channel the document placed beside the text.
///
/// Dynamic because the axis is open — a writer names a channel and puts it on an
/// edge, and nothing about that is known when this file is read. The built-ins
/// are first so a document that declares nothing pays one state read.
#let _sn_all_streams() = {
  let t = _ch_st.final()
  let out = _sn_streams
  for c in t.סדר {
    if _ch_side_places.contains(_ch_place(t, c)) {
      out.push((lbl: _sn_chan_lbl(c), kind: "צד"))
    }
  }
  // …and one for each **region** put beside the text, because a note written
  // `#הערה(אזור: "x")` files into a channel named for the region and nobody
  // declares that channel: it exists because a note was written into it.
  //
  // Without this the note is filed, numbered and marked in the sentence, and the
  // walk that draws the margin never looks for it — so the prose appears on no
  // page at all. `#הערה(אזור:)` is one of the five destinations the chooser
  // writes and `מיקום` is one of the region panel's own controls, so the two
  // clicks that lose a peirush are next to each other.
  for rg in t.סדר_אזורים {
    if not _ch_side_places.contains(_val(_rg_rec(t, rg).at("מיקום", default: "רגל"))) { continue }
    if t.סדר.contains(rg) { continue }
    out.push((lbl: _sn_chan_lbl(rg), kind: "צד"))
  }
  out
}

/// One stream's marker, by kind.
///
/// `own` is the note's own overrides, which for a comment carry its colour: the
/// marker takes the colour and not the rest, since a comment set at 1.4em would
/// otherwise put a 1.4em pencil in the middle of a line of text. The glyph is
/// settable — `#הגדרות_הערת_עורך(סימן: (טקסט: "*"))` — so a reviewer who wants a
/// different mark, or none at all, says so.
#let _sn_mark_of(kind, n, own) = {
  if kind == "עורך" {
    let piece = _mk_part("הערת_עורך", "סימן")
    let base = (צבע: _mk_conf("הערת_עורך", own).at("צבע", default: rgb("#b45309")))
    _mk_render(_cfg_with(base, piece), [#piece.at("טקסט", default: "✎")#n])
  } else {
    _sn_mark(n, prime: kind == "שמאל")
  }
}

/// `שם` names *this* note so that `#הפניה_להערה` can print the number it turned
/// out to be.
///
/// It reached every other collector and not this one, so a note **beside the
/// text** was the one kind that could not be referred to: the reference came out
/// as a red `?` naming a note that is on the page, correctly numbered, two
/// inches away. Cross-references are for exactly the apparatus a gloss belongs
/// to — «עיין בהגהה שבצד» is the sentence they exist for.
#let _sn_note(lbl, side, kind, body, own: (:), מוצב: false, שם: none) = {
  // `מוצב` — this note is here because a channel was **placed** at the side,
  // rather than because a command spelled "sidenote" was used inside a column.
  // The difference decides what happens when there is no column: a note that
  // says where it goes gets the margin, and one that does not gets a footnote.
  [#metadata((body: body, own: own, side: side, kind: kind, מוצב: מוצב))#label(lbl)]
  context {
    let base = _nt_under(_sn_cfg.get())
    let cfg = _cfg_with(base, own)
    let loc0 = here()
    // The number the reader sees, which is the note's rank since the last
    // restart rather than its rank in the sefer.
    let num = _ksav_rank(_nr_scope(label(lbl), loc0), loc0, e => true)
    // The marker in the running text, through the column's own `סימן`. Not
    // through `cfg`: the note's size and colour are the column's, and the
    // number is standing in the sentence being annotated.
    _mk_render(base.at("סימן", default: (:)), super[#_sn_mark_of(kind, num, own)])
    // The **printed** marker under the name the writer gave, for the same reason
    // the page-foot apparatus records the printed one: a column lettered א ב ג is
    // referred to as «עיין הגהה ב», and a reference saying 2 would name a note
    // the reader cannot find.
    if שם != none { _xn_mark(שם, _sn_mark_of(kind, num, own)) }
    if not _sn_has_column(loc0, מוצב) {
      // No side column is open, so there is nowhere to put the note. Fall back
      // to a real footnote rather than placing it off the edge of the paper —
      // **with no mark of ours in the entry**: Typst numbers that entry with
      // its own series, and two marks from two unrelated counts on one entry
      // told the reader nothing about either.
      footnote(_sn_wrap(cfg, none, body))
    }
  }
}

/// Assign every note of one stream to a page and a y, in document order.
///
/// This is thing four for the side column, and the whole of it is one forward
/// walk. A note wants to sit beside its own marker; it takes the first free
/// position at or below that; and when the position it would take runs past the
/// bottom of the text area it goes to **the next page's column instead**, which
/// already exists and is already empty — that is what makes spilling here a
/// placement decision rather than a new mechanism.
///
/// The walk is over *entries*, not over pages, so its cost is the number of
/// notes and not the length of the sefer. Typst memoises `measure`, so the
/// heights are computed once for the document however many pages ask for them.
// הזזה — whether **this** note may be moved to avoid its neighbours.
//
// The walk clamps, shifts and cascades unconditionally, which keeps decision 6's
// invariant — a note is never printed on top of another and never off the paper —
// and gives the writer no say in *which* note moves. `marginalia` has a policy
// per note and the standing preference here is that a judgement call becomes a
// setting with the old behaviour as its default, so:
//
//   · `auto` / `true` — move if it must. Today's behaviour, and the default.
//   · `false`          — **stay**, beside the line it annotates. The notes after
//                        it move around it, which is what a gloss keyed to one
//                        word needs: a note that has drifted four lines down is
//                        pointing at the wrong word.
//   · `"הימנע"`        — move only after everything else has. It is offered to
//                        the collision last, so it keeps its place unless there
//                        is no other way.
//   · `"התעלם"`        — take no part. It is drawn where its marker is and
//                        nothing moves for it, which is the escape hatch for a
//                        note a writer has placed by eye.
//
// A note that stays may still be clamped to the page — off the paper is never a
// choice — so `false` is *"do not shift for a neighbour"*, not *"draw anywhere"*.
#let _sn_shifts = ("הימנע", "התעלם")
#let _sn_may_shift(it) = {
  let v = it.at("shift", default: auto)
  v == auto or v == true or v == "הימנע"
}

#let _sn_assign(items, gap, floor, ceiling) = {
  // **Pinned notes are placed first, and the rest move around them.**
  //
  // `הזזה: false` means *"do not move me"*, and the naive reading — leave it at
  // its anchor while the walk carries on — puts it on top of whatever was
  // already there. Decision 6 does not bend for a setting: a note is never
  // printed over another note. So a pinned note takes its place before the walk
  // starts, and the walk steps over the space it holds.
  //
  // Which is also what the writer meant. A gloss keyed to one word wants to stay
  // beside that word; it does not want to be drawn through its neighbour.
  let held = ()
  for it in items {
    let v = it.at("shift", default: auto)
    if v == false {
      held.push((page: it.page, a: it.want, b: it.want + it.h + gap))
    }
  }
  /// The first y at or below `y` on `pg` that no pinned note is holding.
  let clear(pg, y, h) = {
    let out = y
    // Two passes over a handful of intervals: pushing past one can push into
    // the next, and the list is per stream and short.
    let again = true
    let guard = 0
    while again and guard < 8 {
      again = false
      guard += 1
      for k in held {
        if k.page == pg and out < k.b and out + h > k.a {
          out = k.b
          again = true
        }
      }
    }
    out
  }
  let out = ()
  let page_ = 0
  let cursor = floor
  for it in items {
    // A note never moves *backwards*: its marker is on this page and the reader
    // has to be able to find it from there.
    if it.page > page_ {
      page_ = it.page
      cursor = floor
    }
    // **A note whose line the walk has already left is carried**, whatever
    // its shift asks. Its own page is behind the cursor's page, so "beside my
    // line" names a place that no longer exists — and using its source-line
    // height on the *new* page copied a y from a page it is not on, which is
    // how one carried note pushed every later note a full leaf down while the
    // margin stood empty.
    let carried = it.page < page_
    // `"התעלם"` takes no part: drawn where its marker is, and the cursor is left
    // exactly as it was so nothing moves for it either — unless the marker's
    // page is gone, in which case it is carried like everything else.
    if it.at("shift", default: auto) == "התעלם" and not carried {
      out.push((page: it.page, y: it.want))
      continue
    }
    let carried_y = clear(page_, calc.max(cursor, floor), it.h)
    // A note that may not shift stays beside its own line, and the cursor picks
    // up after it - so the notes below move around it rather than it around them.
    let y = if carried {
      carried_y
    } else if _sn_may_shift(it) {
      clear(page_, calc.max(it.want, cursor), it.h)
    } else {
      it.want
    }
    if ceiling != none and y + it.h > ceiling {
      // It does not fit under what is already on this page, so it goes to the
      // next page's column, at the top.
      //
      // Once, and never in a loop. A note taller than a whole column does not
      // fit on any page, and carrying it forward until it does is a hang rather
      // than a layout — so it is placed at the top of the next page and allowed
      // to run long, which a reader can see, rather than dropped, which they
      // cannot. `page(height: auto)` has no ceiling at all and never reaches
      // here: that is the digital output mode, where the page grows instead.
      page_ += 1
      cursor = floor
      // The pinned-note check is not only for the normal path: a note carried
      // in from the previous page lands on a column that may already hold a
      // `הזזה: false` gloss anchored near its top, and arriving at the floor
      // unconditionally printed straight through it.
      y = clear(page_, cursor, it.h)
    }
    out.push((page: page_, y: y))
    cursor = y + it.h + gap
  }
  out
}

/// One stream's notes, drawn and measured, with the page and y each one lands on.
///
/// `upto` bounds the walk to the notes that can affect a given page — a note
/// anchored further on never carries *backwards* — or is `none` for the whole
/// sefer, which is what the tail below needs.
///
/// Both callers go through here rather than each running its own walk. Two
/// copies of one greedy stack that disagree by a single gap is a note printed on
/// top of its neighbour, and this repository is named for that defect family.
#let _sn_stream_items(st, upto) = {
  let lbl = label(st.lbl)
  let all = query(lbl)
  let within = if upto == none { all } else { all.filter(e => e.location().page() <= upto) }
  // A note written outside any `#עם_הערות_צד` has no column to land in and
  // became a real footnote at its own call site. It must not also be drawn
  // here, or it prints twice.
  let live = within.filter(e => (
    _sn_has_column(e.location(), e.value.at("מוצב", default: false))
  ))
  let items = ()
  for e in live {
    let loc = e.location()
    // Each note's own configuration, read where the note stands: a sefer may
    // change the column's width or the note size half way through.
    let base = _nt_under(_sn_cfg.at(loc))
    let side = e.value.at("side", default: "חוץ")
    let shape = _sn_shape.at(loc)
    let col = _sn_column(base, shape, side, loc.page())
    let ecfg = _cfg_with(base, e.value.at("own", default: (:)))
    // Measured with the number that will be **printed** beside it, which is
    // not its document-wide rank once a count has restarted: a two-digit
    // number and a one-digit one are different widths, and measuring the wrong
    // one is how a column comes out a hair short and overlaps at the foot.
    let shown = _ksav_rank(_nr_scope(lbl, loc), loc, x => true)
    let own = e.value.at("own", default: (:))
    let piece = box(width: col.w, _sn_wrap(ecfg, _sn_mark_of(st.kind, shown, own), e.value.body))
    items.push((
      page: loc.page(),
      want: loc.position().y,
      shift: _val(e.value.at("own", default: (:)).at("הזזה", default: auto)),
      h: measure(piece).height,
      // Kept so the edge can be worked out again for the page this note is
      // *placed* on, which for a carried note is not the page it was written on.
      base: base,
      shape: shape,
      side: side,
      x: col.x,
      gap: base.at("ריווח", default: 0.6em).to-absolute(),
      piece: piece,
    ))
  }
  items
}

/// Every stream's notes assigned against **one** occupancy.
///
/// The walk is over all streams together, in document order. Per-stream walks
/// each saw only their own list, so two independently placed apparatuses in one
/// margin — two side regions, or a region and a wrapper stream — interleaved:
/// one grid at its own pitch, the second slotted between its lines, adjacent
/// lines of different notes a few points apart. Collision machinery that cannot
/// see the other streams is not collision machinery; there is one margin and it
/// gets one walk.
#let _sn_placed(upto) = {
  let items = ()
  for st in _sn_all_streams() {
    for it in _sn_stream_items(st, upto) { items.push(it) }
  }
  if items.len() == 0 { return (items: (), placed: ()) }
  // Document order across streams: (page, anchor y) is the reading order of the
  // margin to within a tie, and a tie is two markers on one line whose order
  // the stack cannot observe. `sorted` and not `sort` — Typst arrays have no
  // in-place sort — and bound back to the name, because a bare statement's
  // value would otherwise join with the next line's.
  items = items.sorted(key: it => (it.page, it.want))
  // The gap between two stacked notes belongs to the column, not to either of
  // them, so the first note's answer is the one the whole stack is walked with.
  // A note that overruled it for itself would be placed against one arithmetic
  // and measured by its neighbours against another.
  (
    items: items,
    placed: _sn_assign(items, items.first().gap, _pg_text_top(), _pg_text_bottom()),
  )
}

/// Draw this page's side notes. Renders nothing — and runs one empty walk —
/// for a document that has none.
#let _sn_page_column() = context {
  let pg = here().page()
  let out = _sn_placed(pg)
  for i in range(out.items.len()) {
    if out.placed.at(i).page == pg {
      let it = out.items.at(i)
      let x = _sn_column(it.base, it.shape, it.side, pg).x
      place(top + left, dx: x, dy: out.placed.at(i).y, it.piece)
    }
  }
}

/// Pages for whatever spilled off the end of the sefer.
///
/// # A note with nowhere to go is a note the reader never sees
///
/// Spilling into the next page's column works because that column already exists
/// and is already empty — right up to the last page, where there is no next one.
/// Twenty dense notes on a one-page document lost three of them: no error, no
/// warning, no gap on the page, just three notes that were written and not
/// printed. That is the worst failure this apparatus can have, and it is the one
/// the mechanism produces by construction unless the document is made longer.
///
/// So `#מסמך` calls this after the body, and it appends exactly as many pages as
/// the carry needs.
///
/// **It converges, and the reason is that it only ever adds pages at the end.**
/// Nothing before them moves, so no marker changes page, so the assignment is
/// the same on the next pass and asks for the same number of pages. Emitting the
/// continuation pages *inside* the document — at the end of the wrapper, which is
/// where they look like they belong — would push every later marker down, change
/// which notes carry, and change the answer: the loop that hangs SILE.
#let _sn_tail_label = <ksav-sn-tail>
#let _sn_carry_label = <ksav-sn-carry>
#let _sn_tail_pages() = context {
  let last = here().page()
  let want = last
  // Whether this sefer has a side column at all. **Nothing at all is emitted
  // when it does not**, and that is not an optimisation: the hidden numeral
  // below is content, and content after a weak page break is what stops the
  // break being dropped. Emitted unconditionally it gave every document in the
  // suite that ends on a weak break a blank page it never had — one measured
  // instance, `a_weak_break_before_a_deferred_section_is_dropped`, and it would
  // have been every sefer with a deferred section and no side notes.
  let any = false
  // The lowest point any side note reaches, for the continuous mode below.
  let deepest = 0pt
  let out = _sn_placed(none)
  if out.items.len() > 0 { any = true }
  for i in range(out.items.len()) {
    want = calc.max(want, out.placed.at(i).page)
    deepest = calc.max(deepest, out.placed.at(i).y + out.items.at(i).h)
  }
  // # A continuous page grows for its notes, or they fall off the bottom of it
  //
  // `page(height: auto)` makes the sheet exactly as tall as its **flow**, and a
  // side note is not in the flow: it is painted from the page's foreground and
  // takes no space at all. So a short body with twenty long notes beside it gave
  // a page 183.49pt tall with the notes drawn hundreds of points below its own
  // bottom edge — the paged failure this whole apparatus was rebuilt for,
  // reappearing in the one mode that is supposed to make it impossible.
  //
  // The answer is the same shape as the extra pages: ask the walk how far down
  // the notes actually reach, and give the flow that much room at the end. It is
  // hidden and it is last, so it moves nothing in front of it and the answer is
  // the same on the next pass.
  if _pg_text_bottom() == none {
    let here_ = here().position().y
    if any and deepest > here_ {
      [#metadata(("tall", deepest))#_sn_tail_label]
      place(hide[#calc.round(deepest.pt())])
      v(deepest - here_ + _pg_margin("bottom"))
    }
    return
  }
  // The page-foot apparatus carries too, and off the end of the sefer for the
  // same reason: a note assigned to the page after the last one has nowhere to
  // be drawn. Both walks are asked here rather than each growing its own tail,
  // because the answer is *how long the document is* and there is one of those.
  let bands = _pp_all()
  if bands.len() > 0 {
    let cfg = _nt_under(_pp_cfg.get())
    want = calc.max(want, _ap_last_page(bands, cfg, _pp_cap(cfg)))
    any = true
  }
  // The streams the **page furniture** draws, each asked about its own end of
  // the sheet. Carry pages are what a note does when the furniture runs out of
  // room; a note collected at the back of the sefer prints in the flow, and the
  // flow makes its own pages. Handing the whole set to this walk made it measure
  // every collected note in the document — see `_sf_where`, which is where the
  // same mistake was made the other way round.
  //
  // **Both ends, and not only the foot.** Filtering to `"רגל"` alone was the same
  // two-bucket error one bucket smaller: a band above the text is page furniture
  // with the same overflow policy and the same need to carry, and it was never
  // asked how many pages it wanted. A note too long for the band was simply cut
  // off at the band's edge — 36 words of 60 on the corpus that found it — with
  // the rest on no page at all. The cap differs per end, which is why this is a
  // loop over the two and not one call with a wider filter.
  let t_now = _ch_st.final()
  for end in ("רגל", "למעלה") {
    let streams = _sf_all().filter(e => _sf_where(t_now, e.value.group) == end)
    if streams.len() > 0 {
      let cfg = _nt_under(_sf_cfg.get())
      want = calc.max(
        want,
        _ap_last_page(streams, cfg, _sf_cap(cfg, t_now, end), policy_of: _sf_spill(t_now)),
      )
      any = true
    }
  }
  if not any { return }
  // **The record of the decision, and the thing that makes the decision take
  // effect.** Both, and the second half is not obvious.
  //
  // On the first layout pass no note has a position yet, so `want` is `last` and
  // this emits no pages. The positions arrive on the next pass and `want` grows
  // — but a bare `pagebreak()` is not an introspectable element, so Typst has
  // nothing to notice changing and settles on the first answer. Measured: the
  // pages were computed correctly (`last=1 want=2`) and never appeared, and the
  // three notes stayed missing.
  //
  // A `metadata` element **is** introspectable, and its value changes exactly
  // when the answer does, so the pass that knows where the notes are is the pass
  // that gets to add the pages for them. It settles as soon as `want` stops
  // moving, which it does immediately, because pages added at the end move
  // nothing in front of them.
  //
  // It is also the honest thing to leave behind: a test can ask what this walk
  // decided instead of inferring it from a page count.
  [#metadata((last: last, want: want))#_sn_tail_label]
  // **This hidden numeral is what makes the pages appear**, and it took four
  // tries to find out why.
  //
  // On the first layout pass no note has a position yet, so `want` is `last` and
  // the loop below emits nothing. The positions arrive on the next pass and
  // `want` grows — but Typst only runs another pass when something it *watches*
  // changed, and neither a `pagebreak()` nor a `metadata` value nor a new label
  // is enough: measured, the walk computed `last=1 want=2` and the page never
  // appeared, so three notes stayed missing on every pass.
  //
  // What is watched is the laid-out frame. So the answer is written into one, as
  // a number whose glyphs differ exactly when the answer does. `place` keeps it
  // out of the flow — a bare `hide[…]` reserves a line, which at the end of a
  // full page is an extra sheet of its own — and `hide` keeps it off the paper.
  //
  // **And only when there is something to watch**, which is the second half and
  // was missing. Emitted unconditionally it put a numeral at the end of a flow
  // that had nothing else to carry, and `place` still needs a frame to hang off:
  // Typst opened a sheet for it. So **every sefer with a page-foot apparatus
  // ended on a blank sheet** — measured on a document that is one line of body
  // and one short note, at every commit this walk has existed. A note that
  // spills got two blanks, because the walk reserves the pages and this added
  // one more past them.
  //
  // Nothing caught it because nothing asked. The suite reads *where words landed*
  // and a blank sheet has no words on it, so every assertion about the notes was
  // true on a document that was one page longer than the writer wrote. It is the
  // same shape as the bug this whole file exists for, one sign flipped: that one
  // was pages that were needed and never appeared.
  //
  // `want > last` is exactly the condition the loop below already runs on, so
  // there is no case where the pass that grows `want` cannot be noticed — the
  // numeral appears on that pass, which is itself the frame change that earns
  // the next one.
  if want > last { place(hide[#want]) }
  for _ in range(want - last) {
    pagebreak()
    // A page with nothing in its flow is a page Typst does not make, and the
    // notes are painted from the foreground rather than the flow. One hidden
    // character is what makes the sheet exist for them to be painted on, and
    // the label marks it as a carry page rather than a blank the writer left.
    [#metadata(none)#_sn_carry_label]
    hide[.]
  }
}


// ============================================================
//  עיצוב גלובלי · configurable headings / lists / tables
// ------------------------------------------------------------
//  Everything is a state read at the element's own location, so a single
//  #הגדרות_* call anywhere (usually at the top) restyles all following
//  headings / lists / tables. Each knob accepts either ONE value (applies
//  everywhere) or, where it makes sense, a per-level array.
// ============================================================
// generic picker: array ⇒ per-level (clamped); scalar ⇒ applies to all levels
#let _cfg_pick(c, key, lvl, fb) = {
  let a = c.at(key, default: fb)
  if type(a) == array { if a.len() > 0 { a.at(calc.min(lvl - 1, a.len() - 1)) } else { fb } } else { a }
}

// ---- כותרות · headings ----
#let _hd_defaults = (
  גופן: none,                                            // family name (none = the document's)
  גודל: (1.6em, 1.35em, 1.18em, 1.06em, 1em, 0.95em),   // per-level size
  משקל: "bold",                                          // weight (or per-level array)
  צבע: luma(0),                                          // fill
  סגנון: "normal",                                       // "normal" | "italic"
  יישור: none,          // none = inherit; else right/left/center (or per-level array)
  ריווח_לפני: (1.2em, 1.1em, 1em, 0.9em, 0.8em, 0.8em),  // space above
  ריווח_אחרי: (0.6em, 0.55em, 0.5em, 0.45em, 0.4em, 0.4em), // space below
  קו_תחתון: false,      // underline the heading text
  קו: false,            // draw a rule line under the heading
  מספור: none,          // heading numbering scheme, e.g. "1.1.1" or "א." (none = off)
  רברבתי: false,        // small caps
  מרווח_אותיות: 0pt,    // letter tracking
  הזחה: 1em,            // indent per level past 6 — 0pt disables the deep indent
  הזחה_מרבית: 12em,      // cap so deep headings keep one line — #17
)
#let _hd_cfg = state("ksav-hd-cfg", _hd_defaults)
// One heading's own overrides, in flight between the call and the show rule.
// Set by `_hd_styled`, cleared by it, read here. See the note there.
#let _hd_own = state("ksav-hd-own", (:))
#let הגדרות_כותרות(..opts) = _hd_cfg.update(c => { let d = c; for (k, v) in opts.named() { d.insert(k, v) }; d })

/// How many levels the ramps carry, which is how many doors there are below.
///
/// Nine, matching `MAX_LEVEL` in the editor and what `#כותרת(רמה: 9)` already
/// wrote. Six was the count of *named* commands (`#כותרת1`…`#כותרת6`) and it had
/// leaked into the styling: levels 7, 8 and 9 were real everywhere — the
/// outline, the numbering, `#תוכן`, the indent ramp below — and had no door of
/// their own, so `_cfg_pick` handed them level 6's values and the panel offered
/// six rows. The shipped ramps are still six entries long and `_hd_set` grows
/// them by repeating the last, so nothing on any existing page moves.
#let _hd_levels = 9

/// Set one level's own look — the door each heading level gets.
///
/// The rule that anything which is a separate command has a style of its own
/// applies to the six heading commands as much as to anything else, and until
/// this they had *values* per level with no way to say so per level: a writer
/// wanting level 2 larger wrote the whole ramp as a tuple and hoped the other
/// five entries were what they already were.
///
/// A knob whose value is a scalar means *every level*, so setting one level has
/// to spread it into a ramp first — otherwise saying something about level 2
/// would quietly say it about all six. The ramp is grown from what is in force,
/// which is the current value if there is one and the shipped default if not.
#let _hd_set(level, named) = _hd_cfg.update(c => {
  let d = c
  for (k, v) in named {
    if not _hd_defaults.keys().contains(k) {
      panic(
        "הגדרות_כותרת" + str(level) + ": ארגומנט לא מוכר · unrecognised argument: " + k,
      )
    }
    let cur = d.at(k, default: _hd_defaults.at(k, default: none))
    let arr = if type(cur) == array { cur } else { (cur,) * _hd_levels }
    while arr.len() < _hd_levels { arr.push(arr.last()) }
    arr.at(level - 1) = v
    d.insert(k, arr)
  }
  d
})

#let הגדרות_כותרת1(..opts) = _hd_set(1, opts.named())
#let h1_config = _en(הגדרות_כותרת1)
#let הגדרות_כותרת2(..opts) = _hd_set(2, opts.named())
#let h2_config = _en(הגדרות_כותרת2)
#let הגדרות_כותרת3(..opts) = _hd_set(3, opts.named())
#let h3_config = _en(הגדרות_כותרת3)
#let הגדרות_כותרת4(..opts) = _hd_set(4, opts.named())
#let h4_config = _en(הגדרות_כותרת4)
#let הגדרות_כותרת5(..opts) = _hd_set(5, opts.named())
#let h5_config = _en(הגדרות_כותרת5)
#let הגדרות_כותרת6(..opts) = _hd_set(6, opts.named())
#let h6_config = _en(הגדרות_כותרת6)
#let הגדרות_כותרת7(..opts) = _hd_set(7, opts.named())
#let h7_config = _en(הגדרות_כותרת7)
#let הגדרות_כותרת8(..opts) = _hd_set(8, opts.named())
#let h8_config = _en(הגדרות_כותרת8)
#let הגדרות_כותרת9(..opts) = _hd_set(9, opts.named())
#let h9_config = _en(הגדרות_כותרת9)
#let _hd_show(it) = context {
  // In HTML export, leave the heading alone: Typst turns a real heading into an
  // <h1>…<h6>, and replacing it with a styled block would emit a semantically
  // meaningless <div> — losing the document outline that makes the HTML worth
  // exporting in the first place. The page styling below is print styling.
  let c = _cfg_with(_hd_cfg.get(), _hd_own.get())
  let lvl = it.level
  if target() == "html" {
    // Emit a real <h1>…<h6> carrying only the heading's own text: the wrapper
    // keeps Typst's heading counter stepping (so in-body numbering can display),
    // which would otherwise leak a "1." into every HTML heading.
    return html.elem("h" + str(calc.min(lvl, 6)), it.body)
  }
  let scheme = c.at("מספור", default: none)
  let num = if scheme != none { [#counter(heading).display(scheme)#h(0.5em)] } else { [] }
  // Typst's own heading ramp stops differentiating after level 6: measured,
  // levels 6, 7, 8 and 9 all come out at 11.4pt in the same weight, so a
  // document that nests that deep prints four levels that look like one. The
  // structure was real the whole time — the outline, the numbering and #תוכן all
  // knew the difference — and only the page could not show it.
  //
  // Levels 1-6 are deliberately untouched: changing them would restyle every
  // document ever written in Ksav. Below the ramp, depth is shown by slant and
  // then by indent, which is how a sefer shows a sub-sub-point anyway.
  //
  // Below the ramp, indent is the visual cue. The ramp adds 1em per level
  // past 6, so level 39's box was pushed against the column edge (x≈70.9)
  // and its title wrapped mid-phrase. A heading must stay on one line
  // whatever its level — #17.
  //
  // Toggleable, as every fix here: `הזחה` is the step (0pt disables the
  // indent entirely), `הזחה_מרבית` is the cap (none disables the cap).
  // Both are heading knobs so `#הגדרות_כותרות(הזחה: 0pt)` and
  // `#הגדרות_כותרות(הזחה_מרבית: 6em)` do what they read as, in either
  // language (`indent` / `max_indent`).
  let deep = calc.max(lvl - 6, 0)
  let _hd_step = _cfg_pick(c, "הזחה", lvl, 1em)
  let _hd_cap = _cfg_pick(c, "הזחה_מרבית", lvl, 12em)
  let _hd_raw = deep * _hd_step
  let _hd_indent = if _hd_cap == none { _hd_raw } else { calc.min(_hd_raw, _hd_cap) }
  // The slant is resolved here and applied to the body below rather than named
  // in the `set text` — `text(style: "italic")` is the request the bundled
  // Hebrew families answer with the upright face, so the *whole* of what marks
  // a level past six apart from level six was invisible. See `_ks_style`.
  let st = _cfg_pick(c, "סגנון", lvl, if deep > 0 { "italic" } else { "normal" })
  let styled = {
    set text(
      // Spread, because `font` has no "leave it alone" value: `none` is not one
      // and `auto` is the *first available* family rather than the inherited
      // one, so a heading with no family of its own must not name the argument
      // at all.
      ..(if _cfg_pick(c, "גופן", lvl, none) != none { (font: _cfg_pick(c, "גופן", lvl, none)) } else { (:) }),
      size: _cfg_pick(c, "גודל", lvl, 1em),
      weight: _cfg_pick(c, "משקל", lvl, "bold"),
      fill: _cfg_pick(c, "צבע", lvl, luma(0)),
      tracking: c.at("מרווח_אותיות", default: 0pt),
    )
    let body = { num; it.body }
    if _cfg_pick(c, "רברבתי", lvl, false) { body = _ks_smallcaps(body) }
    if _cfg_pick(c, "קו_תחתון", lvl, false) { body = underline(body) }
    _ks_style(st, body)
  }
  // Through `_doc_align`, which is the one place a written alignment becomes an
  // alignment. `#מסמך(יישור: "מרכז")` has always worked and
  // `#הגדרות_כותרות(יישור: "מרכז")` was a compile error — the same word, in the
  // same language, meaning the same thing, accepted by one command and refused
  // by another. `_mk_frame` already did it this way; the heading rule and the
  // table were the two that did not.
  //
  // A real Typst alignment passes straight through, so nothing that compiled
  // before changes.
  let al = {
    let v = _cfg_pick(c, "יישור", lvl, none)
    if type(v) == str { _doc_align(v) } else { v }
  }
  let head = if al != none { align(al, styled) } else { styled }
  // Past level 6, one step of indent per level. `pad` and not `h`, because a
  // heading is a block: an inline space would be swallowed at the start of it.
  let body = {
    // Where an automatic numbering restart *would* be, if `אפס_לפי` says this
    // level restarts one. Emitted for every heading and judged in `_nr_origin`,
    // so the setting can change without the markers being re-emitted — see the
    // block above `_nr_label`.
    _nr_mark(("auto", lvl))
    head
    if _cfg_pick(c, "קו", lvl, false) { v(0.25em); line(length: 100%, stroke: 0.5pt + luma(160)) }
  }
  block(
    // **`width: 100%` is what makes `יישור` mean anything.** A bare `block`
    // shrink-wraps its content, so the `align` inside it was centring the
    // heading within the width of the heading — a no-op that looks exactly like
    // a working feature, and measured: `#הגדרות_כותרות(יישור: "מרכז")` and
    // `(יישור: "ימין")` put "שער" at x=480.8 on both.
    //
    // This is the **third** time this exact shape has been paid for here. The
    // page number in the footer was centred inside the width of one digit
    // (x=519.62 of a 595.28pt page), and the note beside `_mk_frame` is the
    // same story again. Look hard at any `align` whose parent is a `block` with
    // no width.
    width: 100%,
    above: _cfg_pick(c, "ריווח_לפני", lvl, 1em),
    below: _cfg_pick(c, "ריווח_אחרי", lvl, 0.6em),
    // Padded on the *start* side, which is the right in Hebrew. `pad` takes
    // physical sides only, so the direction has to be asked for: `pad(left:)` on
    // an RTL page indents from the far edge, which moves nothing visible and
    // looks exactly like the feature not working. It did, for one round.
    if _hd_indent == 0pt { body } else if text.dir == rtl {
      pad(right: _hd_indent, body)
    } else {
      pad(left: _hd_indent, body)
    },
  )
}

// ---- רשימות · lists ----
#let _ls_defaults = (
  סמן: none,            // bullet marker(s): a symbol, an array per depth, or none (Typst default)
  הזחה: 1em,            // indent
  הזחת_גוף: auto,       // body-indent (gap after the marker)
  ריווח: auto,          // spacing between items (auto = paragraph spacing)
  הידוק: false,         // tight (single-line spacing between items)
  מספור: auto,          // enum numbering scheme (auto = document default "1."/"א.")
  ריווח_מספור: auto,    // number-to-body gap for enums
  התחלה: auto,          // the first item's number (auto = 1; 0 is the other one people want)
)
#let _ls_cfg = state("ksav-ls-cfg", _ls_defaults)
#let הגדרות_רשימות(..opts) = _ls_cfg.update(c => { let d = c; for (k, v) in opts.named() { d.insert(k, v) }; d })

// ---- טבלאות · tables ----
#let _tb_defaults = (
  קו: 0.5pt + luma(160),   // stroke (a length+color, a stroke, or none)
  מרווח: 8pt,              // cell inset
  יישור: auto,             // cell alignment
  פסים: false,             // zebra striping
  צבע_פס: luma(245),       // stripe colour
  צבע_כותרת: luma(235),    // header-cell fill
  גופן: none,              // font override inside tables (none = inherit)
  גודל: none,              // text size inside tables (none = inherit)
)
#let _tb_cfg = state("ksav-tb-cfg", _tb_defaults)
// One table's own overrides, live for the span of that table, so its cells can
// read them. See #טבלה.
#let _tb_own = state("ksav-tb-own", (:))
#let הגדרות_טבלאות(..opts) = _tb_cfg.update(c => { let d = c; for (k, v) in opts.named() { d.insert(k, v) }; d })

#let headings_config = _en(הגדרות_כותרות)
#let lists_config = _en(הגדרות_רשימות)
#let tables_config = _en(הגדרות_טבלאות)

// ============================================================
//  מעטפת המסמך · document wrapper
//  The engine injects `#show: מסמך.with(...)` so editor settings
//  (font / size / margin / direction / numbering) become real
//  Typst set-rules around the whole document.
// ============================================================

// _rc_head(p, זוגי, אי_זוגי, אחיד) — the running head for page `p`.
//
// A verso/recto pair wins over the single-sided line, and either half may be
// left unset: a sefer that wants the masechta on one side and nothing on the
// other says so by giving one and not the other, which is why an unset side
// falls through to `אחיד` and only then to nothing.
#let _rc_head(p, זוגי, אי_זוגי, אחיד) = {
  let side = if calc.odd(p) { אי_זוגי } else { זוגי }
  if side != none { side } else { אחיד }
}

// ------------------------------------------------------------
//  Running heads as document content
// ------------------------------------------------------------
//
// > *"Header and footer content lives in the settings drawer, which makes
// > anything beyond plain text — bold, mixed runs — hard to express. They are
// > document content in a settings control."*
//
// Exactly so, and the second sentence is the diagnosis. The six settings fields
// are strings, and a string is what reaches Typst — so `*שם הספר*` in that box
// printed the asterisks. There was no way to put a bold word, a mixed run, or a
// page counter into a running head at all, short of calling `#מסמך` by hand.
//
// These two commands are the same setting written where it belongs. They take
// **content**, so everything the writer can type in the body works in a running
// head; and because they are a state, a document may set them more than once —
// which is the thing a settings field could never do and a bound sefer always
// wants: the masechta across the top of one chapter and a different one across
// the next.
//
// The settings fields still work and still win where nothing has been said. A
// document that has never called these lays out byte-identically to before.
// Marked in the flow and read back with `query`, **not** held in a `state`.
//
// A state is the obvious way to write this and it does not work: a page header
// is realised outside the document flow, so `state.get()` inside one answers
// with the initial value on every page — the head simply never appears, in a
// prelude that reads as though it should. `query(selector(<…>).before(here()))`
// is Typst's own recipe for "what was the last chapter heading before this
// page", and it is the same question.
#let _rc_set(kind, body, זוגי, אי_זוגי) = [
  #metadata((kind: kind, body: body, even: זוגי, odd: אי_זוגי))<ksav-rc>
]

// The running header from here on. `זוגי`/`אי_זוגי` name the verso and recto
// lines separately, exactly as the settings fields do, and either may be left
// out — a sefer that wants the masechta on one side and nothing on the other
// says so by giving one and not the other.
#let כותרת_עליונה(body, זוגי: none, אי_זוגי: none) = _rc_set("head", body, זוגי, אי_זוגי)
#let כותרת_תחתונה(body, זוגי: none, אי_זוגי: none) = _rc_set("foot", body, זוגי, אי_זוגי)
// `even`/`odd` rather than `header_even`/`header_odd`: on מסמך those names carry
// the word "header" because six fields sit in one argument list, and here the
// command already says which of the two it is.
#let running_head = _en(כותרת_עליונה, extra: (even: "זוגי", odd: "אי_זוגי"))
#let running_foot = _en(כותרת_תחתונה, extra: (even: "זוגי", odd: "אי_זוגי"))

// What to print at the top or bottom of page `p`: what the document has said
// most recently, and otherwise what the settings fields said.
//
// Read at the page's own location, so a `#כותרת_עליונה` on page 40 governs page
// 40 onwards and not the whole sefer retroactively — which is the entire point
// of it being a state rather than a parameter.
// By page number, and **not** by `.before(here())`.
//
// A page header's own location is the top of the page, so `.before(here())`
// excludes everything on that page — including the `#כותרת_עליונה` that was
// written to introduce it. The head would then start one page late, which is
// worse than not working: it looks right on every page but the one you were
// looking at. The footer, whose location is the bottom of the page, would have
// agreed with neither.
//
// So both ask the same question by page: *the most recent mark on this page or
// an earlier one*, which is what "from here on" means to whoever typed it.
#let _rc_line(kind, p, זוגי, אי_זוגי, אחיד) = {
  let marks = query(<ksav-rc>)
    .filter(m => m.value.kind == kind and m.location().page() <= p)
  let last = if marks.len() > 0 { marks.last().value } else { none }
  let from_doc = if last == none { none } else {
    _rc_head(p, last.even, last.odd, last.body)
  }
  if from_doc != none { from_doc } else { _rc_head(p, זוגי, אי_זוגי, אחיד) }
}


#let מסמך(
  גופן: "Frank Ruhl Hofshi",
  גודל: 12pt,
  שוליים: 2.5cm,
  // Per-edge margins. `none` = take the uniform שוליים, so a document that never
  // touches these is laid out byte-identically to before. פנימי/חיצוני are the
  // binding-relative pair: on a two-sided document they swap sides every page,
  // which is the whole point of them and the reason they are not left/right.
  שוליים_עליון: none,
  שוליים_תחתון: none,
  שוליים_פנימי: none,
  שוליים_חיצוני: none,
  // Extra width added to the inner margin alone, for the part of the page the
  // binding swallows. Separate from שוליים_פנימי because it is a property of how
  // the sefer will be bound, not of how it is designed.
  שולי_כריכה: 0cm,
  // Two-sided: inner/outer alternate by page parity and the running heads may
  // differ verso from recto. A sefer printed on both sides of the paper wants
  // this; a document that will be read on a screen does not.
  דו_צדדי: false,
  כיוון: rtl,
  שפה: "he",
  // יישור — how the text is set, in one parameter because it is one question.
  //
  //   true            justified (the default, and what every document written
  //                   before this said)
  //   false           ragged, sitting at the reading edge
  //   "ימין" / right   ranged right
  //   "מרכז" / center  centred
  //   "שמאל" / left    ranged left
  //
  // It used to be a boolean and nothing else, so a document could say *justified
  // or not* and had no way at all to say *at which edge* — a writer who wanted a
  // centred sheet had to wrap every paragraph in #מרכז. The report put it as
  // *"justify belongs in one control with right, centre and left"*, and this is
  // that control: one word, four answers, rather than a tick box beside a
  // dropdown that can contradict it.
  //
  // A real Typst alignment value is taken too, so `#document(align: center)` —
  // which the English table has always mapped here, and which used to reach
  // `par(justify: center)` and fail — now means what it reads as.
  יישור: true,
  מספור: true,
  מספור_עברי: false,
  נייר: "a4",
  // A page size in centimetres, when a named paper is not what is wanted.
  //
  // **Both or neither.** Typst's `width`/`height` override `paper:` entirely,
  // so a width with no height would keep A4's height and produce a shape nobody
  // asked for — this reads them as a pair or ignores them. `none` is *use נייר*,
  // which is what every document written before these existed says.
  //
  // A sefer is routinely printed at a size no standard names — 17×24, 20×27 —
  // and the only answer used to be the nearest A-size and living with it.
  רוחב_עמוד: none,
  גובה_עמוד: none,
  // רציף — one page, as tall as the sefer is.
  //
  // `NOTES-PLAN`'s document-level section: *"a sefer read on a screen — it
  // deletes this entire problem class, free."* And it does, exactly: **overflow
  // is impossible by definition** when the page grows. A note that will not fit
  // is a sentence about a page bottom, and this has none — the side column has
  // no ceiling to clamp against and nothing to carry to the next page, and the
  // page-foot apparatus has a reserve that never runs out. `_pg_text_bottom`
  // already answers `none` for it and the spill walks already read that as *no
  // bottom*, so the whole of thing four turns itself off rather than being
  // switched off.
  //
  // It is a **document** decision and not a preview one: the same document
  // printed is the one exported, and a mode that showed a writer a page shape
  // their PDF does not have would be the preview lying, which is the defect this
  // repository is named for.
  // A baseline grid: every line in the sefer advances by this unit or by a
  // whole multiple of it, so a commentary set smaller than the body still meets
  // it line for line. Off unless asked for — see `_bl_grid`.
  // Line numbers down the margin, every n-th line. Off by default; a שורה
  // address in an apparatus is worth nothing without them, and they are the one
  // addressing scheme that puts anything on the body page.
  // A margin kept for notes beside the text, for the whole document — the
  // mirror of `אזור_הערות` at the foot. Without one a side channel has nowhere
  // to land unless the prose is wrapped in `#עם_הערות_צד`, and a note sent to a
  // margin that does not exist fell back to a footnote: a declaration quietly
  // becoming a different arrangement, which is the thing this model exists to
  // stop. `none` keeps the wrapper's behaviour, so nothing already written moves.
  אזור_צד: none,
  // The marks a Hebrew number carries: "ללא" (the default, and what every
  // document written before this got), "גרש" for a trailing ׳, or "גרשיים" for
  // what a printed sefer has — ׳ after a single letter and ״ before the last of
  // several. See `_hb_num`.
  גרשיים: "ללא",
  // How much of a margin an apparatus with no reserve may use — the rest is the
  // page number and its clearance at the foot, the running head at the top, and
  // how much air a sefer keeps is a house decision rather than a law.
  חלק_שוליים_רגל: 0.7,
  חלק_שוליים_צד: 0.8,
  // The baseline grid's two judgement calls: the smallest fraction of the type
  // size that still reads as leading, and what a bare `רשת_בסיס: true` means as
  // a multiple of the body size.
  רשת_מרווח_מזערי: 0.2,
  רשת_יחס: 1.4,
  מספור_שורות: false,
  // A companion volume — a channel at `מיקום: "קובץ"` — bound behind the body
  // or written out as a file of its own. **The same content either way**, which
  // is the point: the choice is made after the sefer is written, and changing it
  // does not touch a note.
  //
  // `false` binds it at the back, on its own sheet with its own page count.
  // `true` holds it out of this document entirely, for the engine to render as
  // a second file — see `compile_companion`.
  כרך_נפרד: false,
  רשת_בסיס: false,
  רציף: false,
  כותרת_עליונה: none,
  כותרת_תחתונה: none,
  כותרת_זוגי: none,
  כותרת_אי_זוגי: none,
  תחתונה_זוגי: none,
  תחתונה_אי_זוגי: none,
  // "מרכז" · "חוץ" · "פנים" — where the running head sits. Centred is the safe
  // default; a page number on the outside edge is what makes a bound sefer
  // thumb-able, and it only means anything once דו_צדדי is on.
  יישור_כותרת: "מרכז",
  // PDF metadata. Not decoration: without a title the file opens nameless in
  // every reader, and PDF/A refuses to validate without one.
  כותרת_מסמך: none,
  מחבר: none,
  מילות_מפתח: (),
  // Keep a one-letter word from being stranded at the end of a line. Off by
  // default and deliberately so: it changes where lines break, and turning it on
  // for every document ever written would silently repaginate all of them.
  מניעת_יתומים: false,
  ריווח_שורות: 0.75em,
  ריווח_פסקאות: 1.2em,
  הזחה_ראשונה: 0em,
  ריווח_הערות: 0.85em,
  טורים: 1,
  // אזור_הערות — height reserved at the foot of every page for the per-page
  // apparatus (מדף bands / זרם streams). Those render in the page FOOTER, which
  // lives in the bottom margin and does not push the text up: without a reserve
  // they grow straight off the bottom of the paper and take the page number with
  // them. Reserving reduces the text area by exactly this much, so the apparatus
  // always has somewhere to go. `none` = reserve nothing (correct for documents
  // that only use native footnotes / endnotes, which need no reserve at all).
  אזור_הערות: none,
  // What an undeclared fixed region does when its notes outgrow it, and how
  // many continuation leaves may pass before each one carries a small notice
  // saying the spill continues. `בררת_גלישה` takes a גלישה-style list; a
  // region's own גלישה always wins over it.
  בררת_גלישה: none,
  אזהרת_גלישה: none,
  body,
) = {
  let np = if מספור_עברי { "א" } else { "1" }
  let reserve = if אזור_הערות == none { 0pt } else { אזור_הערות }
  // The side reserve goes on the **outside** edge, which is where a margin
  // apparatus belongs in a bound sefer: the inner edge is the gutter, and a note
  // printed into it disappears into the binding.
  let side_res = if אזור_צד == none { 0pt } else { אזור_צד }
  // Every edge falls back to the one uniform margin, so a document that sets
  // none of them lays out exactly as it did before any of this existed.
  let m_top = if שוליים_עליון != none { שוליים_עליון } else { שוליים }
  let m_bot = if שוליים_תחתון != none { שוליים_תחתון } else { שוליים }
  let m_in = (if שוליים_פנימי != none { שוליים_פנימי } else { שוליים }) + שולי_כריכה
  let m_out = if שוליים_חיצוני != none { שוליים_חיצוני } else { שוליים }
  // Bound on the right for Hebrew, on the left for English. Stated rather than
  // left to `binding: auto`, which reads the *text* direction — so a document
  // whose body flips direction mid-way would otherwise re-bind itself.
  let bind_right = כיוון == rtl
  // `has_head` / `has_foot` are gone with the `if` they guarded. They asked
  // *"did a parameter give one?"*, which is a question only half the answer now
  // lives in: `#כותרת_עליונה` may set a running head on page 40, and a header
  // installed only when a parameter was present would have made the command work
  // in exactly the documents that had no need of it. Both are functions now, and
  // both render nothing when nothing has been said — which is what `auto` did.
  // Where a running head sits. Only "חוץ"/"פנים" need the page number, and only
  // on a two-sided document does either mean anything — on a one-sided one every
  // page has the same geometry, so "outside" is a fixed edge.
  // Either language names the placement: the engine sends the English word, a
  // writer calling מקטע_עמוד by hand writes the Hebrew one, and anything else
  // centres rather than silently picking an edge.
  let want_outside = יישור_כותרת in ("חוץ", "חיצוני", "outside", "outer")
  let want_inside = יישור_כותרת in ("פנים", "פנימי", "inside", "inner")
  let head_align(p) = {
    if not (want_outside or want_inside) { center } else {
      let outside_left = if דו_צדדי { _rc_outside_is_left(p, bind_right) } else { not bind_right }
      let want_left = if want_outside { outside_left } else { not outside_left }
      if want_left { left } else { right }
    }
  }
  if כותרת_מסמך != none or מחבר != none or מילות_מפתח.len() > 0 {
    set document(
      title: if כותרת_מסמך != none { כותרת_מסמך } else { auto },
      author: if מחבר != none { (מחבר,) } else { () },
      keywords: מילות_מפתח,
    )
  }
  // The grid, decided once and read by every size in the sefer. `set` inside an
  // `if` does nothing in Typst — a trap this file documents twice — so both of
  // these go through the spread idiom.
  let _grid = _bl_read(רשת_בסיס, גודל, ratio: רשת_יחס)
  let _gmin = רשת_מרווח_מזערי
  _bl_grid.update(_grid)
  set text(font: גופן, size: גודל, lang: שפה, dir: כיוון)
  set text(..(if _grid != none { (top-edge: _bl_edges.top, bottom-edge: _bl_edges.bottom) } else { (:) }))
  // Every n-th line numbered, in the margin. `true` means every fifth, which is
  // what a critical edition sets; a number means every n-th.
  let _ln = if מספור_שורות == true { 5 } else if type(מספור_שורות) == int { מספור_שורות } else { none }
  // The function is called **once per line, in that line's place**, so it is
  // also where the line's position is recorded: `_ln_at` reads the record back
  // to address an entry by the line its marker sits on. Every line leaves a
  // mark and only every n-th prints a number — the record is what the address
  // needs and the digits are what the reader needs, and they are one call, so
  // the margin and the entry cannot disagree.
  set par.line(..(if _ln != none {
    (numbering: n => {
      [#metadata(n)#_ln_label]
      if calc.rem(n, _ln) == 0 { text(size: 0.7em, fill: luma(100), str(n)) }
    })
  } else { (:) }))
  // The size, one way or the other. `paper` and `width`/`height` are alternative
  // spellings of one setting in Typst, and passing both is how a document ends
  // up laid out to whichever the compiler happened to prefer.
  let _size = if רציף {
    // The width still comes from somewhere — a continuous sefer is a column of
    // a stated width, not an infinite plane — so the named paper or the given
    // width sets it and only the height goes to `auto`.
    (
      width: if רוחב_עמוד != none { רוחב_עמוד } else { _pg_paper_width(נייר) },
      height: auto,
    )
  } else if רוחב_עמוד != none and גובה_עמוד != none {
    (width: רוחב_עמוד, height: גובה_עמוד)
  } else {
    (paper: נייר)
  }
  set page(
    .._size,
    binding: if bind_right { right } else { left },
    margin: if דו_צדדי {
      (top: m_top, inside: m_in, outside: m_out + side_res, bottom: m_bot + reserve)
    } else if bind_right {
      (top: m_top, right: m_in, left: m_out + side_res, bottom: m_bot + reserve)
    } else {
      (top: m_top, left: m_in, right: m_out + side_res, bottom: m_bot + reserve)
    },
    numbering: if מספור { np } else { none },
    // The page number must not move when the document grows an apparatus, and
    // until now it did — straight down to the edge of the paper.
    //
    // Typst's default `footer-descent` is **30% of the bottom margin**, and the
    // reserve is added to that margin. So reserving 3 cm for the bands also
    // lowered the whole footer by 0.9 cm, and the page number — which is printed
    // *after* the bands — ended up 3pt from the bottom of an A4 sheet: measured
    // y=838.93 of 841.89, inside every printer's unprintable border, for any
    // document that used one `#מדף_` note. Pinning the descent to 30% of the
    // *unreserved* margin is Typst's own default for a document with no
    // apparatus, so a document without one lays out exactly as it did, and one
    // with an apparatus now puts its bands in the reserve and its number in the
    // same place as everybody else's.
    footer-descent: 0.3 * m_bot,
    // The side column, drawn once per page. Unconditional and read-only, exactly
    // like the header and the page bands: it renders nothing for a document with
    // no side notes, and installing it only when a *parameter* asked for one
    // would make it work in precisely the documents that do not use it — the
    // mistake the header note below records having made.
    //
    // The **foreground** rather than the background, so a note is never painted
    // under the page it belongs to. It cannot overlap the text in a well-formed
    // document anyway: the column it draws into is empty page that
    // `#עם_הערות_צד` reserved out of the text area.
    foreground: _sn_page_column(),
    // Always a function, never `auto`. The settings fields are known here and a
    // `#כותרת_עליונה` in the document is not — it may arrive on page 40 — so a
    // header installed only when a *parameter* was given would have made the
    // command work in exactly the documents that did not need it. It renders
    // nothing when nothing has been said, which is what `auto` did.
    header: {
      // The band above the text, then the running head under it — the mirror of
      // the foot, where the apparatus sits above the page number. The head keeps
      // its place whatever the band carries, which is the same promise the page
      // number is given at the other end.
      _sf_page_streams(איפה: "למעלה")
      context {
        let p = here().page()
        let line = _rc_line("head", p, כותרת_זוגי, כותרת_אי_זוגי, כותרת_עליונה)
        if line != none {
          align(head_align(p), text(size: 0.85em, fill: luma(100), line))
        }
      }
    },
    // Footer = per-page regrouped bands (read-only, renders nothing when unused)
    // stacked above the page number / custom footer line. We render the number
    // ourselves here because a custom footer replaces Typst's automatic one.
    footer: {
      // The apparatus occupies the reserved region; the page number sits under it
      // at a fixed offset, so it stays put no matter how much apparatus a page
      // carries. Overflow past the reserve is clipped rather than run off the
      // sheet — a clipped note is visible as a problem, a note printed past the
      // paper edge is not.
      if reserve != 0pt {
        block(width: 100%, height: reserve, clip: true, {
          // The apparatus is margin furniture, not prose, and it was inheriting
          // the document's paragraph spacing: `ריווח_פסקאות` (1.2em ⇒ 14.4pt at
          // 12pt) landed between one band and the next. So a band asked to be
          // 1.5cm tall occupied 1.5cm **plus 14.4pt**, the error compounded down
          // the stack, and "fixed regions" — a layout whose entire promise is
          // that the geometry is fixed — was neither the height you asked for nor
          // predictable from it.
          //
          // The gaps a band *should* have are the explicit `v(ריווח_בין)` calls
          // in `_ap_bands`, and the entries set their own `spacing:` argument,
          // which beats this. What goes away is only the spacing nobody asked
          // for.
          set block(spacing: 0pt)
          _pp_page_bands()
          _sf_page_streams()
        })
      } else {
        // No block here, and that is deliberate. A fixed-height block draws its
        // height whether or not it has anything in it, so bounding the footer
        // this way pushed the page number down 49.6pt on **every** document,
        // apparatus or not. The bound belongs to the region rather than to the
        // footer: `_ap_fit_room` clamps a declared height to `_ap_room`, and
        // `_ap_slot` clips at the clamped height, so a region is bounded and a
        // page with no apparatus pays nothing.
        _pp_page_bands()
        _sf_page_streams()
      }
      // `spacing: 0pt` on the number's own block, not a `set` on the footer: the
      // apparatus above it is built out of blocks whose gaps are exactly what
      // `ריווח_בין` configures, and a blanket set would flatten those too. Without
      // it the paragraph spacing (`ריווח_פסקאות`, 1.2em) lands between the bands
      // and the number, so a document with an apparatus printed its page number
      // 14.4pt lower than a document without one — the last of the drift this
      // footer is supposed to have no part in.
      // `width: 100%` is load-bearing, not tidiness. A bare `block` shrink-wraps
      // its content, so the `align(head_align(p), …)` inside it centred the number
      // within the width of the digit — a no-op — and the block itself sat at the
      // start of the line, which in Hebrew is the right edge. Measured x=519.62 of
      // a 595.28pt page instead of 295.24. Caught by the golden layout, in a run of
      // probe output I had already read and taken only the `y` from.
      // The page number is **page furniture, not prose, and not on the grid.**
      // A baseline grid normalises the line box to 1em so the body advance is
      // exact — and applied to the number that shifts it 0.91pt down the page,
      // which is drift in the one thing this footer exists to keep still. The
      // apparatus above it keeps the grid, because holding register with the
      // body is the entire reason a writer turns one on.
      block(width: 100%, spacing: 0pt, {
        set text(..(if _grid != none {
          (top-edge: "cap-height", bottom-edge: "baseline")
        } else { (:) }))
        context {
        let p = here().page()
        let custom = _rc_line("foot", p, תחתונה_זוגי, תחתונה_אי_זוגי, כותרת_תחתונה)
        // **Both, when both were asked for.** This was `if custom … else if
        // מספור`, so writing anything into the footer switched the page numbers
        // off — reported exactly that way: *"The page footer removes page
        // numbering. Setting one appears to overwrite the other."*
        //
        // They are not alternatives and never were. A footer line is what the
        // document says at the bottom of every page (a sefer's name, a siman);
        // the page number is where the reader is. Asking for one has nothing to
        // say about the other, and a control that silently turns off a control
        // three rows above it in the same panel is the sort of thing a writer
        // has to discover by counting pages.
        //
        // Stacked, number underneath, because that is the order they are read
        // in and because a footer line can be long enough to fill the measure.
        let lines = ()
        if custom != none { lines.push(text(size: 0.85em, fill: luma(100), custom)) }
        if מספור {
          lines.push(text(size: 0.85em, fill: luma(100), numbering(np, ..counter(page).get())))
        }
        for ln in lines { align(head_align(p), ln) }
        }
      })
    },
  )
  // The two readings of יישור, split at the one place that has to know the
  // difference. `_doc_align` returns `none` for the boolean forms, so a document
  // that says `true` or `false` lays out byte-identically to before.
  let _al = _doc_align(יישור)
  set par(justify: יישור == true, leading: if _grid != none { _bl_lead(_grid, גודל, מזערי: _gmin) } else { ריווח_שורות }, spacing: if _grid != none { _grid } else { ריווח_פסקאות }, first-line-indent: הזחה_ראשונה)
  // Unconditional, and `start` — Typst's own default — when no edge was named.
  // Written as `if _al != none { set align(_al) }` it does nothing at all: a
  // `set` is scoped to the block it appears in, so the rule governed the two
  // lines of that `if` and looked exactly like a working feature. The prelude
  // has this note already, about a `show` rule, twenty lines further down.
  set align(if _al == none { start } else { _al })
  // Space footnote entries apart so each note — including a note-on-a-note that
  // Typst hoists into its own entry — reads as a separate block, not one run-on
  // list. This is the *document's* answer; `#הגדרות_הערות(ריווח:)` overrules it
  // per note, and `_fn_gap_base` is how that command finds out what it is
  // overruling. See `_fn_wrap`.
  _fn_gap_base.update(ריווח_הערות)
  // The reserve, put where the read-only footer can see it. It is what tells the
  // page-foot apparatus how many of its notes fit here and how many go to the
  // next page — and it is *declared*, which is the whole reason that walk
  // converges. See `_ap_assign`.
  _ap_reserve.update(reserve)
  // The spill defaults and the tripwire, put where the footer walk reads
  // them. The list is validated by the same reader the regions use, so a
  // misspelled move is refused here with the vocabulary named.
  _rg_default_spill.update(if בררת_גלישה == none { none } else { _ap_spill_read("מסמך", בררת_גלישה) })
  _rg_warn_leaves.update(if אזהרת_גלישה == none { none } else { אזהרת_גלישה })
  _ap_free.update(m_bot * חלק_שוליים_רגל)
  _ap_free_top.update(m_top * חלק_שוליים_רגל)
  _sn_reserve.update(side_res)
  // Said either way: the English spellings canonicalise before the check, so
  // `gershayim: "none"` is refused as *ללא* rather than falling past the set
  // into marks-on.
  let גרשיים = _val(גרשיים)
  if not _hb_modes.contains(גרשיים) {
    panic("מסמך: גרשיים לא מוכר · unknown setting: " + _as_string(גרשיים) + " (" + _hb_modes.join(" · ") + ")")
  }
  _hb_mode.update(גרשיים)
  _ap_free_share_st.update(חלק_שוליים_רגל)
  _sn_free_share_st.update(חלק_שוליים_צד)
  _bl_min_st.update(רשת_מרווח_מזערי)
  _bl_ratio_st.update(רשת_יחס)
  _pg_two_sided.update(דו_צדדי)
  set footnote.entry(gap: ריווח_הערות)
  // Keep the heading counter stepping (so #הגדרות_כותרות(מספור: …) can display a
  // number) while suppressing Typst's own number — _hd_show renders headings
  // itself and only prints a number when the config asks for one.
  set heading(numbering: "1.")
  set enum(numbering: np + ".")
  // Configurable headings (size / weight / colour / alignment / numbering /
  // rule / small-caps per level) — driven by #הגדרות_כותרות, read per heading.
  show heading: _hd_show
  set list(indent: 1em)
  // Lists and tables are configured at their creation site inside the #רשימה /
  // #ממוספרת / #טבלה commands (a `set` in a `show list`/`show table` rule styles
  // only *nested* elements, never the matched one, so it can't be used here).
  let laid = if טורים > 1 { columns(טורים, body) } else { body }
  // A one-letter word in Hebrew is a preposition — ו, ב, ל, ה, כ, מ, ש — and
  // typography does not leave one hanging at the end of a line: it belongs to
  // the word after it, and separated it reads as a typing error. Making the
  // space that follows it non-breaking is the whole of the fix; Typst then
  // refuses to break there and carries the letter down with its word.
  //
  // The `\b` before the class is what keeps this to *whole* one-letter words.
  // Without it the final letter of every word ending in one of those seven —
  // which is most of them — would be glued to the next word instead.
  //
  // Applied around `laid` rather than at the top of this function, because a
  // `show` rule is scoped to the block it appears in: written as a bare
  // `if מניעת_יתומים { show … }` it would have governed the two lines of that
  // `if` and nothing else, and would have looked exactly like a working feature.
  if מניעת_יתומים {
    show regex("\b[ובלהכמש] "): it => {
      let s = it.text
      s.slice(0, s.len() - 1) + "\u{00A0}"
    }
    laid
  } else {
    laid
  }
  // Every region declared at the end of the sefer, printed there.
  //
  // `#אזור("ביאורים", מיקום: "סוף")` says where the region goes, and that is the
  // whole promise of the model — the writer says it once, at the top, and every
  // note filed into it moves. It was only half true: the placement was honoured
  // for *filing* and a writer still had to call `#הצג_אזור` by hand to make it
  // appear, so a region declared at the end of the sefer and never shown printed
  // **nothing at all**, silently, with its notes filed correctly into it.
  //
  // Skipped for a region the writer did show, which is what the dump marker is:
  // one exists for every `#הצג_אזור` call, so a document that places its own
  // regions is untouched and one that places some of them gets the rest.
  context {
    let t = _ch_st.final()
    let shown = _cn_shown.final()
    // The back of the sefer first, then the companion volumes, whatever order
    // they were declared in: a volume of its own comes after everything that is
    // part of this one, which is what makes it a separate volume.
    // The last section has no siman after it to close it, so the document does.
    _cn_section_dump()
    for place in ("סוף", "קובץ") {
      // A companion held for a file of its own prints nothing here. It is not
      // dropped — every note in it is still filed, still numbered, still
      // queryable — it is simply not part of *this* document.
      if place == "קובץ" and כרך_נפרד { continue }
      // The regions declared with `#אזור`…
      let want = t.סדר_אזורים.filter(rg => (
        _val(_rg_rec(t, rg).at("מיקום", default: "רגל")) == place
      ))
      // …and the channels that named no region at all. **Such a channel is its
      // own region** — that is what `_ch_region` answers and what `_ch_note`
      // files it under — so walking only the declared ones lost them. A note
      // sent to the end of the sefer by `#ערוץ("ביאורים", מיקום: "סוף")` alone
      // was filed correctly, numbered correctly, queryable, and **never drawn**:
      // a marker in the body pointing at nothing, with no complaint.
      //
      // It is the same fault the declared regions had, one layer out, and it
      // survived the first fix because that one was written against `#אזור`
      // rather than against *what a placement means*.
      for c in t.סדר {
        let rg = _ch_region(t, c)
        // A channel pointed into a declared region takes that region's
        // placement, and the loop above has already decided about it.
        if rg in t.אזורים { continue }
        if _val(_ch_rec(t, c).at("מיקום", default: "רגל")) != place { continue }
        if not want.contains(rg) { want.push(rg) }
      }
      for rg in want {
        if shown.contains(rg) { continue }
        // The sheet is `_rg_show`'s to open — see `_rg_open`, which the writer's
        // own `#הצג_אזור` goes through as well.
        _rg_show(rg, auto)
      }
    }
  }
  // After the body, and only ever after it: pages for whatever the side column
  // carried past the last one. See `_sn_tail_pages` for why they cannot be
  // emitted where they look like they belong.
  _sn_tail_pages()
}
// Every parameter מסמך takes, in English.
//
// Fifteen of these had no English spelling at all, and they were not a random
// fifteen: the per-edge margins, the binding gutter, two-sided printing, the
// verso/recto running heads and their alignment — **the entire set of knobs an
// English writer reaches for when actually binding a book**, in a program whose
// README opens by saying it works equally for left-to-right English documents.
// The PDF metadata was in the same state, which is worse than cosmetic: PDF/A
// refuses to validate a file with no title.
//
// The spellings are `DocConfig`'s own field names minus their units, because
// that struct is already the English name of every one of these and inventing a
// second set here is how two vocabularies for one document start.
//
// `title` and `justify` are overrides rather than additions. `title` means
// כותרת in the shared table — a heading's text — and מסמך's PDF title is
// כותרת_מסמך, so `#document(title: "…")` used to be an error naming a
// parameter that does not exist. A later key wins in a Typst dictionary sum, so
// `extra` is exactly the right shape for both.
#let document = _en(מסמך, extra: (
  columns: "טורים",
  table_columns: "עמודות",
  justify: "יישור",
  title: "כותרת_מסמך",
  // per-edge margins and the binding
  margin_top: "שוליים_עליון",
  margin_bottom: "שוליים_תחתון",
  margin_inner: "שוליים_פנימי",
  margin_outer: "שוליים_חיצוני",
  gutter: "שולי_כריכה",
  two_sided: "דו_צדדי",
  // running heads, verso and recto
  header_even: "כותרת_זוגי",
  header_odd: "כותרת_אי_זוגי",
  footer_even: "תחתונה_זוגי",
  footer_odd: "תחתונה_אי_זוגי",
  head_align: "יישור_כותרת",
  // PDF metadata
  author: "מחבר",
  keywords: "מילות_מפתח",
  // typesetting
  prevent_orphans: "מניעת_יתומים",
  // One page, as tall as the sefer is — the digital output mode, where overflow
  // is impossible by definition because there is no page bottom for a note to
  // fall past.
  continuous: "רציף",
  // Whether a companion volume is bound at the back or written as its own file.
  separate_volume: "כרך_נפרד",
  // Every line advances by one grid unit or by a whole multiple of it, so a
  // commentary set smaller than the body still meets it line for line.
  baseline_grid: "רשת_בסיס",
  // Line numbers down the margin — and what a שורה address in an apparatus is
  // read off. See `_eh_addr`.
  gershayim: "גרשיים",
  foot_margin_share: "חלק_שוליים_רגל",
  side_margin_share: "חלק_שוליים_צד",
  grid_min_leading: "רשת_מרווח_מזערי",
  grid_ratio: "רשת_יחס",
  side_region: "אזור_צד",
  line_numbers: "מספור_שורות",
  note_spacing: "ריווח_הערות",
))

// כתב_רשי — commentary set in Rashi script.
//
// The fallback chain is the honest part. Ksav bundles no Rashi font: every one
// worth using is either commercial or of unclear licence, and shipping a font
// this project cannot license is not a trade worth making. So the command names
// the families a writer is likely to have attached (Settings → add a font, which
// rides the same assets channel as an image) and falls back to the document's
// own face when none of them is present. A commentary that comes out in Frank
// Ruhl is a commentary; one that fails to compile is not.
#let כתב_רשי(body, גופן: none) = text(
  font: if גופן != none { גופן } else {
    ("Rashi", "Keter YG Rashi", "Shofar Rashi", "Vilna", "Frank Ruhl Hofshi")
  },
  body,
)
#let rashi = _en(כתב_רשי)

// ============================================================
//  עיצוב פנימי · inline text styles
// ============================================================
#let הדגשה(body) = strong(body)
// `emph` is a *request* for an italic face, and every Hebrew family this engine
// bundles — and very nearly every one that exists — ships none, so on paper
// Typst hands back the upright face and the emphasis is invisible. Shearing the
// laid-out frame gives a visible slant with any font (a synthetic oblique, the
// same fallback a word processor makes); `reflow: true` keeps the following text
// off it, and `emph` stays inside so a family that *does* carry an italic still
// uses its real one. This is why `#נטוי`/`#italic` no longer raise the "no
// italic face" warning — see `slanting_commands` in `lib.rs`.
//
// Only on paper. HTML export is reflowable web content where `<em>` is the
// right, semantic answer and the browser renders (or synthesises) the italic
// itself, so the skew — which would replace the `<em>` with a transformed span —
// is confined to the paged target.
// # The skew must go around each **word**, not around the passage
//
// `skew` is a layout function: it lays its content out and shears the frame, and
// a sheared frame is a block. So `skew(emph(body))` in the middle of a sentence
// broke the sentence into three paragraphs — the words before, the emphasised
// words, and the words after — each on its own baseline. Measured, because this
// compiles perfectly and looks like a spacing quirk in a screenshot:
//
//     bold        אאא y=78.79   בבב y=78.79    גגג y=78.79
//     italic      אאא y=78.79   בבב y=101.11   גגג y=123.43
//
// The writer's words were *"the italic seems to make for itself a new paragraph
// — before and after"*, which is exactly what those numbers say.
//
// A `box` makes block content inline, and that alone fixes the three-baseline
// case. It is not enough on its own: one box around the whole passage cannot be
// broken across lines, so a long italic quotation becomes an unbreakable slab
// that jumps to a line of its own rather than flowing. Same defect, further
// down the page, and it would have been found by the next person to italicise a
// sentence instead of a phrase.
//
// So the rule boxes each run of non-space characters. Every space between the
// words stays an ordinary space in the enclosing paragraph, which is what a line
// break needs to be able to happen at — and what justification needs in order to
// stretch. Verified at both lengths and in both scripts: every run on one
// baseline, and a forty-word italic passage breaking at its spaces like prose.
// The mechanism itself is `_ks_skew`, near the top of this file, because the
// four *configuration* sites that ask for a slant — the mark register, the
// banded apparatus, the footnote tiers, the side column and the heading ramp —
// are all defined above this line and all of them need it. This command is one
// caller of it, and no longer the only thing in the prelude that slants.
#let נטוי(body) = _ks_skew(body)
#let קו_תחתון(body) = underline(body)
#let קו_חוצה(body) = strike(body)
// סימון — highlight, in whatever colour is asked for.
//
// `צבע` was the whole difference between this and `רקע` one line down: two
// commands, one Typst function, and the toolbar button was wired to the half
// that could not take a colour. So the argument comes here and `רקע` becomes
// what it always was — the same thing with the colour written first.
#let סימון(צבע: auto, body) = if צבע == auto {
  highlight(body)
} else {
  highlight(fill: צבע, body)
}
#let עילי(body) = super(body)
#let תחתי(body) = sub(body)
#let רברבתי(body) = smallcaps(body)
#let גדול(body) = text(size: 1.4em, body)
#let קטן(body) = text(size: 0.85em, body)
#let גודל_גופן(מידה, body) = text(size: מידה, body)
#let צבע(גוון, body) = text(fill: גוון, body)
#let רקע(גוון, body) = סימון(צבע: גוון, body)
#let מרווח_אותיות(מידה, body) = text(tracking: מידה, body)
#let גופן_שונה(שם, body) = text(font: _as_string(שם), body)
#let קוד(body) = box(
  fill: luma(240), inset: (x: 3pt), outset: (y: 3pt), radius: 2pt,
  text(font: ("Cascadia Mono", "Consolas", "monospace"), body),
)

// עיצוב — a look, as one command.
//
// A paragraph style is a name and a look, and Ksav had the second half only.
// Writing one meant writing Typst by hand:
//
//     #let שאלה(תוכן) = text(size: 1.1em, weight: "bold", תוכן)
//
// which works, and which no control can read afterwards — the styles panel can
// rewrite a `#הגדרות_*` call because it knows its shape, and knows nothing about
// arbitrary code. So the knobs get a command of their own, and a custom style
// becomes a `#let` in the document that the panel *can* read and rewrite:
//
//     #let שאלה(תוכן) = עיצוב(תוכן, גודל: 1.1em, משקל: "bold")
//
// The knobs are deliberately the same set the panel already offers a heading —
// there is no third vocabulary for "what a piece of text looks like".
//
// Inline unless something makes it a block. `יישור` and the two spacings are
// block-level questions in Typst, so asking either of them puts the content in a
// block; asking neither leaves `#שאלה[…]` usable in the middle of a sentence,
// which a style that always blocked would not be.
#let עיצוב(
  body,
  גופן: auto,
  גודל: auto,
  משקל: auto,
  צבע: auto,
  סגנון: auto,
  מרווח_אותיות: auto,
  קו_תחתון: false,
  רברבתי: false,
  יישור: auto,
  ריווח_לפני: auto,
  ריווח_אחרי: auto,
) = {
  let inner = body
  if רברבתי { inner = smallcaps(inner) }
  if קו_תחתון { inner = underline(inner) }
  let t = (:)
  if גופן != auto { t.insert("font", גופן) }
  if גודל != auto { t.insert("size", גודל) }
  if משקל != auto { t.insert("weight", משקל) }
  if צבע != auto { t.insert("fill", צבע) }
  if סגנון != auto { t.insert("style", סגנון) }
  if מרווח_אותיות != auto { t.insert("tracking", מרווח_אותיות) }
  let out = text(..t, inner)
  let blocky = יישור != auto or ריווח_לפני != auto or ריווח_אחרי != auto
  if not blocky { return out }
  // The value is a Typst alignment written bare — `right`, `center`, `left` —
  // which is what the panel's alignment control produces and what `#תמונה` has
  // always taken.
  if יישור != auto { out = align(יישור, out) }
  block(
    above: if ריווח_לפני == auto { auto } else { ריווח_לפני },
    below: if ריווח_אחרי == auto { auto } else { ריווח_אחרי },
    out,
  )
}

// English aliases (collision-free with Typst builtins)
#let styled = _en(עיצוב)
#let bold = הדגשה
#let italic = נטוי
#let uline = קו_תחתון
#let sthrough = קו_חוצה
// `_en`, not a bare alias, now that it takes a named argument: `#mark(color:
// red)` has to reach `צבע`, or the English spelling of a command is English in
// its name only.
#let mark = _en(סימון)
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
// One heading, styled by the global for its level unless it says otherwise:
// `#כותרת1(צבע: rgb("#7f1d1d"), קו: true)[פרק א]` is this chapter opening and no
// other. The global `#הגדרות_כותרות` already took a per-level array for every
// knob, which is the second layer the writer asked for; this is the third.
//
// The override has to travel from here to `_hd_show`, which is where every
// heading is actually styled — and a show rule receives the heading and nothing
// else, so there is no argument to hand it. It goes through a state that this
// call sets immediately before the heading and clears immediately after: the show
// rule reads it at the heading's own location, which lies between the two. That
// is also why a plain `= פרק` gets the global and nothing else — nothing set it.
// Strays go to `heading` itself, so `#כותרת1(outlined: false)[…]` reaches the
// element and a misspelled knob gets Typst's own error naming it.
#let _hd_styled(lvl, body, named) = {
  // בתוכן — does this heading enter #תוכן? Typst's own name for it is `outlined`,
  // which has always worked here because strays go to `heading` itself; what it
  // did not have was a Hebrew name, so the one thing a writer needs to keep a
  // title page or a running head out of the contents was reachable only by
  // knowing Typst. Translated here rather than in `_en_params`, which runs the
  // other way — English name to Hebrew — and would not have helped a Hebrew
  // document at all.
  let named = if "בתוכן" in named {
    let d = named
    d.insert("outlined", d.remove("בתוכן"))
    d
  } else { named }
  let (own, rest) = _cfg_split(named, _hd_defaults.keys())
  if own.len() == 0 { heading(level: lvl, ..rest, body) } else {
    _hd_own.update(own)
    heading(level: lvl, ..rest, body)
    _hd_own.update((:))
  }
}
#let כותרת(body, רמה: 1, ..opts) = _hd_styled(רמה, body, opts.named())
#let כותרת1(body, ..opts) = _hd_styled(1, body, opts.named())
#let כותרת2(body, ..opts) = _hd_styled(2, body, opts.named())
#let כותרת3(body, ..opts) = _hd_styled(3, body, opts.named())
#let כותרת4(body, ..opts) = _hd_styled(4, body, opts.named())
#let כותרת5(body, ..opts) = _hd_styled(5, body, opts.named())
#let כותרת6(body, ..opts) = _hd_styled(6, body, opts.named())

// כותרת_בהערה(body, רמה: 1) — a heading INSIDE a note, a box, or a table cell:
// it looks like a heading and it deliberately is not one. A real #כותרת there is
// still a real heading — it steps the document's counter, so a three-line
// footnote renumbers every section after it, and it enters #תוכן, so the table of
// contents lists a line that lives in the margin. Structure inside a note is a
// matter of appearance, not of outline; this gives the appearance only.
//
// Weight and colour follow #הגדרות_כותרות, so these match the document's real
// headings. The sizes do not: the heading ramp starts at 1.6em, and 1.6em of a
// 0.85em note is still half again the size of the text being annotated. This
// ramp is compressed to stay inside the note it belongs to.
#let _nh_sizes = (1.12em, 1.06em, 1.02em, 1em, 1em, 1em)
#let כותרת_בהערה(body, רמה: 1, ..opts) = context {
  let (own, rest) = _cfg_split(opts.named(), _mk_own_keys)
  _cfg_strict("כותרת_בהערה", rest)
  let c = _hd_cfg.get()
  let lvl = calc.max(רמה, 1)
  // Three layers under the register's own three, and in this order: the
  // document's headings at this level, then the class, then this heading.
  //
  // The document's headings are the *base* rather than a rival, which is the
  // whole reason this reads them at all. A note heading has looked like the
  // sefer's headings since it was written, and a sefer that colours its chapter
  // titles means its lemmas too until it says otherwise — `#הגדרות_כותרת_בהערה`
  // is how it says otherwise, and `#כותרת_בהערה(צבע: …)` is how one of them
  // does. What was missing was not a different default, it was any way to
  // disagree with this one.
  let shipped = (
    גודל: _nh_sizes.at(calc.min(lvl - 1, _nh_sizes.len() - 1)),
    משקל: _cfg_pick(c, "משקל", lvl, "bold"),
    צבע: _cfg_pick(c, "צבע", lvl, luma(0)),
  )
  let styled = _mk_render(_cfg_with(shipped, _mk_conf("כותרת_בהערה", own)), body)
  // Inline text and a line break AFTER — never a `block`, and nothing at all
  // before. A footnote entry lays out as «number» «body», and anything that
  // breaks the line at the start of the body drops the body to the next line and
  // strands the number alone on its own; this is the trap the tier indents avoid
  // with an inline #h. All four candidates spring it — `block`, `v(weak: true)`,
  // `linebreak`, and `parbreak`, which does *not* collapse at the head of an
  // entry the way it does at the head of a page. Measured, not assumed.
  //
  // So the break above is the writer's own blank line, exactly as for a heading
  // in prose. Written with one, a heading mid-note gets its paragraph air:
  //
  //     #הערה[#כותרת_בהערה[פתיחה] הגוף הראשון
  //
  //     #כותרת_בהערה[המשך] הגוף השני]
  //
  // Written without one — at the very start of a note, which is the common case —
  // the number and the heading share a line, which is what a lemma wants anyway.
  styled
  linebreak()
}

// `#let hlevel(body, level: 1) = heading(level: level, body)` — a *second*
// definition of #כותרת rather than an alias of it, and the only English name in
// the prelude that was. Nothing was wrong with it: two identical one-liners
// agree until one of them is edited, which is the whole of the objection.
// `girsa-ksav`'s reader is the third party that has to know these are the same
// command, and its pairing check (`tests/from_girsa.rs`) is what found this —
// it asked the prelude for `#let hlevel = … כותרת` and the prelude did not have
// one.
#let hlevel = _en(כותרת)
#let h1 = _en(כותרת1)
#let h2 = _en(כותרת2)
#let h3 = _en(כותרת3)
#let h4 = _en(כותרת4)
#let h5 = _en(כותרת5)
#let h6 = _en(כותרת6)
#let note_heading = _en(כותרת_בהערה)
#let הגדרות_כותרת_בהערה(..opts) = _mk_set("כותרת_בהערה", opts.named())
#let note_heading_config = _en(הגדרות_כותרת_בהערה)

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
//  ילדים מבניים · structural children
// ============================================================
//
// Five commands in this language mean nothing on their own. `#פריט` is one entry
// of a `#רשימה`, `#תא` and `#כותרת_תא` and `#מיזוג` are cells of a `#טבלה`, and
// `#הגדרה` is a row of a `#רשימת_הגדרות`. They are arguments, not commands: the
// structure lives entirely in the parent, which takes its children as
// **positional arguments** and hands them to Typst's `list` / `table` / `terms`.
// One positional argument in, one bullet or one cell out.
//
// # What that cost
//
// `#פריט` and `#תא` were written `#let פריט(body) = body` — the identity
// function — so the commas and parentheses were the entire mechanism and the
// command name was decoration around them. Which meant:
//
//   #רשימה(פריט[א], פריט[ב])      two bullets, the shape every toolbar writes
//   #רשימה[#פריט[א] #פריט[ב]]      ONE bullet, both words inside it
//   #פריט[א]                       body text, no bullet, no complaint
//
// The second is what a writer types coming from Typst, where `#list[…]` is
// idiomatic. It compiled, it rendered, and it silently collapsed the list. The
// third printed the word and said nothing at all. Neither has ever been caught
// by anything, because nothing in the product *writes* the wrong form — the
// toolbar, the docx importer and the list ribbon all emit the paren form, so
// every automated path was correct and every hand-typed one was on its own.
//
// # The mark
//
// A child now returns three things in a row: a `metadata` carrying its kind and
// its real body, a red badge naming itself, and the body. Two consequences, and
// they are the whole design:
//
//   - **A parent that consumes it takes `.גוף` out of the metadata** and drops
//     the rest, so the badge exists only in a document where nobody consumed it.
//     Correct usage renders byte-identical to what it always did.
//   - **A parent can find the marks inside a content block**, so the bracket
//     form is no longer a silent collapse — it lays out the list the writer
//     obviously meant. Being liberal here is not guessing: `#רשימה[#פריט[א]
//     #פריט[ב]]` has exactly one possible reading.
//
// Deliberately **not** a `#show metadata:` rule at document level, which was the
// first design and is the one to avoid. This prelude runs its entire apparatus
// on `metadata` + `query` + convergence — a note re-emits its metadata on every
// layout pass and the footer counts on the introspection settling. A show rule
// over every metadata element in the document puts a hand on exactly that, to
// catch a case the mark can announce by itself.
//
// A stray also keeps printing its body. A badge beside the words is a writer
// noticing; a badge *instead of* the words is a writer losing a paragraph.
#let _kd_key = "ksav_child"
#let _kd_seq = [].func()
/// Which parents each structural child is legal inside — **the one list**.
///
/// Read by `_kd_items` below, so it is not a comment that can drift from the
/// code: a child in the wrong parent wears the badge, and a child in the right
/// one does not, both decided here. `app/tools/emit-engine.mjs` generates the
/// editor's copy from this dictionary, which is what lets `mode.ts` grey a
/// `#תא` button outside a table without a second list saying the same thing in
/// TypeScript. Of these five, exactly one — `#מיזוג` — was guarded before, and
/// for an unrelated reason (a merged cell spliced between two others overflows
/// the row). The language had one opinion out of five.
#let _kd_parents = (
  "פריט": ("רשימה", "ממוספרת", "ממוספרת_עברית"),
  "הגדרה": ("רשימת_הגדרות",),
  "תא": ("טבלה",),
  "כותרת_תא": ("טבלה",),
  "מיזוג": ("טבלה",),
)
/// What each of them is called in an English document.
///
/// The badge names the command that is out of place, and a badge in an English
/// sefer saying `פריט` names a command that reader did not type. Both spellings
/// compile — `#let item = פריט` — and by the time `_kd` runs, the alias is gone
/// and only the Hebrew name is left, so the name has to be chosen here rather
/// than recovered.
///
/// Every row is held against the alias it claims: `children.rs` fails if this
/// says `item` and the prelude does not define `#let item = פריט`. So this is a
/// second spelling of a name that is already in this file and *not* a second
/// authority for it.
#let _kd_english = (
  "פריט": "item",
  "הגדרה": "defitem",
  "תא": "cell",
  "כותרת_תא": "headcell",
  "מיזוג": "colspan_",
)
/// The badge an unconsumed child wears, in the document's own language.
///
/// `text.lang` is what the page setup set from `שפה`, which is the same thing
/// the table of contents reads to choose between תוכן העניינים and Contents.
#let _kd_stray(kind) = context {
  let hebrew = text.lang == "he"
  let name = if hebrew { kind } else { _kd_english.at(kind, default: kind) }
  let said = if hebrew { [מחוץ למקומו] } else { [outside its container] }
  box(
    inset: (x: 3pt, y: 1pt),
    radius: 2pt,
    fill: rgb("#fef2f2"),
    stroke: 0.6pt + rgb("#dc2626"),
    text(size: 0.75em, fill: rgb("#b91c1c"))[#name #said],
  )
}
/// A structural child: the mark, the badge, and the body.
#let _kd(kind, body) = [#metadata((ksav_child: kind, גוף: body))#_kd_stray(kind)#body]
/// Which kind of child `c` is, or `none` if it is ordinary content.
#let _kd_kind(c) = {
  if c.func() != _kd_seq {
    none
  } else {
    let h = c.children.first()
    if h.func() == metadata and type(h.value) == dictionary {
      h.value.at(_kd_key, default: none)
    } else {
      none
    }
  }
}
/// The body a child was given — read off the mark, never sliced off the front,
/// so the badge cannot leak into a consumed child by an index being wrong.
#let _kd_body(c) = c.children.first().value.גוף
/// One positional argument, as the children it holds.
///
/// Three shapes, in the order they are tested: the argument *is* a child; the
/// argument is a block *containing* children (the bracket form); or it is
/// ordinary content and therefore one child, which is what every list written
/// before these marks existed looks like and must keep doing.
/// A child's body, with the badge kept if this is not a parent it belongs in.
///
/// Consumed either way — a `#תא` inside a `#רשימה` still becomes one item, so
/// the rest of the list keeps its shape — but it says so on the page.
#let _kd_take(c, parent) = {
  let k = _kd_kind(c)
  if _kd_parents.at(k, default: ()).contains(parent) {
    _kd_body(c)
  } else {
    _kd_stray(k) + _kd_body(c)
  }
}
#let _kd_items(c, parent) = {
  if _kd_kind(c) != none {
    (_kd_take(c, parent),)
  } else if c.func() == _kd_seq and c.children.any(x => _kd_kind(x) != none) {
    // Content between the marks joins the child before it — the usual case is
    // the whitespace and line breaks of a block written over several lines, and
    // a stray word is better carried than dropped on the floor.
    let out = ()
    let cur = none
    for ch in c.children {
      if _kd_kind(ch) != none {
        if cur != none { out.push(cur) }
        cur = _kd_take(ch, parent)
      } else if cur != none {
        cur = cur + ch
      } else if not (ch == [ ] or ch == parbreak() or ch == linebreak()) {
        cur = ch
      }
    }
    if cur != none { out.push(cur) }
    out
  } else {
    (c,)
  }
}
/// Every positional argument of a parent, as its children.
#let _kd_all(args, parent) = args.map(c => _kd_items(c, parent)).flatten()

/// What kind each of a parent's children was written as, in the same order
/// `_kd_all` returns them.
///
/// The kinds are consumed by `_kd_take`, so the content that comes out of
/// `_kd_all` no longer says what it was asked for. A parent that has to treat
/// one kind differently — `#טבלה` painting the cells written as `#כותרת_תא` —
/// needs the answer alongside, and taking it from the same walk is what keeps
/// the two lists the same length and in the same order.
#let _kd_kinds(args, parent) = {
  let out = ()
  for c in args {
    let k = _kd_kind(c)
    if k != none {
      out.push(k)
    } else if c.func() == _kd_seq and c.children.any(x => _kd_kind(x) != none) {
      // The bracket form, where several children share one positional argument.
      let started = false
      for ch in c.children {
        let ik = _kd_kind(ch)
        if ik != none {
          out.push(ik)
          started = true
        } else if not started and not (ch == [ ] or ch == parbreak() or ch == linebreak()) {
          out.push(none)
          started = true
        }
      }
    } else {
      out.push(none)
    }
  }
  out
}

// ============================================================
//  רשימות · lists (nest freely)
// ============================================================
// #רשימה / #ממוספרת read #הגדרות_רשימות at their location (marker, indent,
// spacing, tight, enum numbering). Only keys actually configured are passed, so
// unset ones inherit the document defaults.
//
// Per-list overrides — `#רשימה(סמן: [–], הידוק: true)[…][…]` — are the writer's
// second layer: `#הגדרות_רשימות` says what lists look like in this sefer, and one
// list says how it differs. Named arguments the config does not know are handed on
// to Typst's own `list`/`enum`, so `#רשימה(tight: true)` still works and a
// misspelled knob still stops the compile naming itself.
// ---- one scheme, every depth ----
//
// A marker and a numbering pattern are the two knobs that describe *the whole
// nest*, not one list: Typst reads `("–", "·")` and `"1.א.i."` by depth, so the
// second entry is what a sub-list looks like. Passed as a **field** on the enum
// — which is what these did — the pattern reaches that list's own items and
// stops there, because the `#רשימה` nested inside an item is a separate call
// with a separate field, and it defaults back to `•` and `1.`. So the writer
// who set `מספור: "1.א."` on their list got `1.` at the top and `1.` again
// underneath, with nothing to say why.
//
// Emitted as a **set rule** instead, it reaches every list realised inside this
// one, which is what "level two" means. The rule is scoped to the block, so the
// next list in the document is untouched — the two halves of that promise are
// `tests/lists.rs`.
#let _ls_deep(a, kind) = {
  let keys = if kind == "enum" { ("numbering",) } else { ("marker",) }
  let deep = (:)
  let shallow = (:)
  for (k, v) in a { if k in keys { deep.insert(k, v) } else { shallow.insert(k, v) } }
  (deep, shallow)
}
#let רשימה(..פריטים) = context {
  let (own, rest) = _cfg_split(פריטים.named(), _ls_defaults.keys())
  let c = _cfg_with(_ls_cfg.get(), own)
  let a = (indent: c.at("הזחה", default: 1em), tight: c.at("הידוק", default: false))
  let m = c.at("סמן", default: none)
  if m != none { a.insert("marker", m) }
  if c.at("ריווח", default: auto) != auto { a.insert("spacing", c.ריווח) }
  if c.at("הזחת_גוף", default: auto) != auto { a.insert("body-indent", c.הזחת_גוף) }
  // Merged rather than spread alongside, so a Typst-named argument the writer
  // gave wins outright instead of arriving twice under the same name.
  for (k, v) in rest { a.insert(k, v) }
  let (deep, shallow) = _ls_deep(a, "list")
  set list(..deep)
  list(..shallow, .._kd_all(פריטים.pos(), "רשימה"))
}
#let ממוספרת(..פריטים) = context {
  let (own, rest) = _cfg_split(פריטים.named(), _ls_defaults.keys())
  let c = _cfg_with(_ls_cfg.get(), own)
  let a = (indent: c.at("הזחה", default: 1em), tight: c.at("הידוק", default: false))
  if c.at("מספור", default: auto) != auto { a.insert("numbering", c.מספור) }
  if c.at("ריווח", default: auto) != auto { a.insert("spacing", c.ריווח) }
  // The gap between a number and the words after it. Declared in the defaults
  // since the day the config existed and read by nothing, so the one list knob
  // that only enums have was the one knob that did nothing.
  if c.at("ריווח_מספור", default: auto) != auto { a.insert("body-indent", c.ריווח_מספור) }
  // Where the numbers start. Typst has always taken `start:`, so a writer who
  // knew Typst could already say it; there was no Hebrew name for it, no
  // English one, and no control — which is the same as not having it.
  if c.at("התחלה", default: auto) != auto { a.insert("start", c.התחלה) }
  for (k, v) in rest { a.insert(k, v) }
  let (deep, shallow) = _ls_deep(a, "enum")
  set enum(..deep)
  enum(..shallow, .._kd_all(פריטים.pos(), "ממוספרת"))
}
// Hebrew-lettered, which is what this command *is*: `מספור` here is the
// definition and not an override, so it is set rather than passed — passed, a
// writer's own `מספור` would arrive twice under one name. Everything else routes
// through #ממוספרת, so a Hebrew-lettered list finally follows the document's list
// settings; it used to go straight to `enum` and ignore all of them.
#let ממוספרת_עברית(..פריטים) = {
  let named = פריטים.named()
  named.insert("מספור", "א.")
  ממוספרת(..named, ..פריטים.pos())
}
#let פריט(body) = _kd("פריט", body)
#let רשימת_הגדרות(..זוגות) = terms(..זוגות.named(), .._kd_all(זוגות.pos(), "רשימת_הגדרות"))
#let הגדרה(מונח, פירוש) = _kd("הגדרה", terms.item(מונח, פירוש))

#let bullets = _en(רשימה)
#let numbered = _en(ממוספרת)
#let henum = _en(ממוספרת_עברית)
#let item = פריט
#let deflist = רשימת_הגדרות
#let defitem = הגדרה

// תוכן · table of contents (from the document's headings)
//   מספור: auto  → follow the heading config (show numbers only when
//                  #הגדרות_כותרות(מספור: …) asked for them; default = none = off)
//           true  → force numbers in the TOC
//           false → suppress numbers even if headings are numbered
// The wrapper always keeps the heading counter stepping (so in-body numbering
// can display), which would otherwise leak numbers into the outline; here we
// drop the entry prefix whenever numbers aren't wanted.
// כותרת: auto → the title in the document's own language. A Hebrew heading on
// an English document was the most visible way Ksav's Hebrew-first defaults
// leaked into a left-to-right document; the heading follows `lang` now, and an
// explicit title still overrides it.
// עומק: none → every level, which is what this always did. A number keeps the
// contents to that many levels — the other half of *"choose exactly what enters
// the table of contents"*, and the half that applies to the document as a whole.
// A sefer with a heading per se'if has a contents hundreds of lines long
// otherwise, and there was no way to say so at all.
//
// The per-heading half is `בתוכן: false` on the heading itself — see `_hd_styled`
// — because "not this one" is a fact about a heading and "three levels deep" is
// a fact about the contents, and a single control could not have said both.
#let תוכן(כותרת: auto, מספור: auto, עומק: none) = context {
  let title = if כותרת != auto { כותרת } else if text.lang == "he" { [תוכן העניינים] } else { [Contents] }
  let show-nums = if מספור == auto { _hd_cfg.get().at("מספור", default: none) != none } else { מספור }
  // The contents' own title is furniture, not a chapter: Typst renders it as a
  // heading, and left to the document's numbering rule it printed "0." — the
  // counter read before anything had stepped. Unnumbered, always.
  set heading(numbering: none)
  if show-nums {
    outline(title: title, depth: עומק)
  } else {
    show outline.entry: it => it.indented(none, it.inner())
    outline(title: title, depth: עומק)
  }
}
#let toc = _en(תוכן)

/// One note in a channel that is pointed at a named region.
///
/// The region is honoured whether or not it was ever declared: an undeclared one
/// is a page-foot region of its own, which is exactly what `#הערה_זרם` has always
/// been, and declaring it later with `#אזור(…, מיקום: "סוף")` moves every note in
/// it without touching one of them. That is the whole promise of the model, and
/// it is why a region can be used before it is described.
#let _ch_note_in(chan, region, body, named) = context {
  let t = _ch_st.final()
  // The declared placement wins; an undeclared region is at the page foot.
  let place = if region in t.אזורים { _val(_rg_rec(t, region).at("מיקום", default: "רגל")) } else { "רגל" }
  let mine = if "שם" in named { named.at("שם") } else { none }
  let named = if mine == none { named } else {
    let d = named
    let _ = d.remove("שם")
    d
  }
  // Ten placements, and **three** collectors — not two.
  //
  // This asked `place == "רגל"` and sent everything else to the collected dump,
  // which is right for the back of the sefer, the end of a section and a
  // companion volume, and wrong for the four the page furniture draws. A note
  // written `#הערה(אזור: "x")` into a region placed at the side or above the
  // text was filed into a collector nothing ever draws: **the words did not
  // appear anywhere on any page**, with the marker still in the sentence and no
  // complaint from anything.
  //
  // Not a rare corner. `#הערה(אזור:)` is one of the five destinations the
  // chooser writes, and `מיקום` on a region is one of the panel's own controls,
  // so it is two clicks apart in the interface.
  //
  // The same shape as `_sf_where` before it, and as `_rg_height_of` before that:
  // a function answering a two-valued question about a ten-valued input, with a
  // catch-all for the cases nobody enumerated. `_ch_kind` has had the four-way
  // answer for a channel since side channels existed; this is that answer, asked
  // about the region.
  if place == "רגל" or place == "למעלה" {
    _sf_stream_note(chan, body, שם: mine, ..named)
  } else if _ch_side_places.contains(place) {
    let (own, rest) = _cfg_split(named, _sn_own_keys)
    _cfg_strict("הערה", rest)
    // The stream is named for the **region**, not for the channel: the walk
    // that draws the margin enumerates side regions, and a note filed under a
    // channel name nobody declared (the default when only `אזור:` was given) is
    // a stream nothing looks for — numbered, marked, never drawn.
    _sn_note(_sn_chan_lbl(region), _ch_side_of(place), "צד", body, own: own, מוצב: true, שם: mine)
  } else {
    let (own, rest) = _cfg_split(named, _ap_own_keys)
    _cfg_strict("הערה", rest)
    _cn_note(
      _cfg_with(_rg_head_cfg(_ch_cfg(t, (chan,)), t, region, chans: (chan,)), own),
      region,
      chan,
      body,
      own,
      שם: mine,
    )
  }
}

// ============================================================
//  הערות שוליים · footnotes
// ============================================================
// הערה — an ordinary footnote, and **tier 1 of the layered apparatus**.
//
// They used to be two unrelated things, and the gap between them was a real
// obstruction: a writer with a page full of #הערה who wanted to hang a note off
// one of them had to go back and convert it to #הערה_א first, because #הערה_ב
// only stacked under #הערה_א. Nothing in the mechanism required that. So the
// tier-1 collector adopts the note the writer already wrote: #הערה[… #הערה_ב[…]]
// works, the sub-note indents and slants against its parent, and with a
// per-tier numbering scheme the parent is numbered as the tier-1 note it is.
//
// With the shipped defaults tier 1 is 1em / normal / black / no indent and the
// numbering is one native running sequence, so this is exactly `footnote(body)`
// — see `_fn_wrap`, which returns the body untouched in that case.
//
// `ערוץ:` is the whole of the channel model at the point of writing a note.
// Everything else — where the channel prints, what it is a note *on*, how it is
// numbered and how it looks — is declared once with `#ערוץ` and can be changed
// after the notes exist. Naming a channel nobody declared is not an error: it is
// a page-foot region of its own, which is what `#הערה_זרם` has always been.
// `אזור:` is the fifth destination, and it is the one that is not singular.
//
// Four of the five places a note can print — the live page foot, the end of the
// section, the back of the sefer, the side column — are one each, so naming the
// place names the stream. A **region** is a named list, and that is what recovers
// the case the other four foreclose: mekoros in one block at the back and haaros
// in another are both *"the end"*, and as one choice you get one of them.
//
// `#הערה(אזור: "שער_הציון")[…]` therefore means *this note goes in that region*,
// and the region says where it sits. Written this way the note needs no `#ערוץ`
// declaration of its own: an undeclared region is a page-foot region, which is
// what `#הערה_זרם` has always been, and `#אזור("שער_הציון", מיקום: "סוף")` moves
// every note in it at once.
/// One note, to wherever its channel says. **The only door.**
///
/// `#הערה(ערוץ: "x")` and `#הערה_זרם("x")` are two spellings a writer may use for
/// one act, and they gave two different answers: a channel placed beside the
/// text printed in the margin through the first and at the foot of the page
/// through the second. The placement is a property of the channel, so it cannot
/// depend on which command was typed.
///
/// It is here, low in the file, for the reason that produced the bug in the
/// first place: Typst resolves a name where the closure is written, `_sn_note`
/// is defined below both doors, and a dispatch written at either of them could
/// only reach half the model.
#let _note_to(name, body, named) = context {
  let t = _ch_st.final()
  let place = _ch_place(t, name)
  if _ch_side_places.contains(place) {
    // The note's own name, lifted out before the style split — it is not a
    // style knob, it is which note this is.
    let mine = named.at("שם", default: none)
    let named = if mine == none { named } else {
      let d = named
      let _ = d.remove("שם")
      d
    }
    let (own, rest) = _cfg_split(named, _sn_own_keys)
    _cfg_strict("הערה", rest)
    _sn_note(_sn_chan_lbl(name), _ch_side_of(place), "צד", body, own: own, מוצב: true, שם: mine)
  } else {
    _ch_note(name, body, named)
  }
}

// הערה_זרם(זרם, body) — a note in the named channel, wherever that channel goes.
#let הערה_זרם(זרם, body, שם: none, ..opts) = {
  let named = {
    let d = opts.named()
    if שם != none { d.insert("שם", שם) }
    d
  }
  _note_to(_as_string(זרם).trim(), body, named)
}
#let הערת_תוכן(body, ..opts) = הערה_זרם("תוכן", body, ..opts)
#let הערת_מקור(body, ..opts) = הערה_זרם("מקורות", body, ..opts)

#let stream_note = _en(הערה_זרם, extra: (columns: "טורים"))
#let contentnote = _en(הערת_תוכן, extra: (columns: "טורים"))
#let sourcenote_stream = _en(הערת_מקור, extra: (columns: "טורים"))

#let הערה(body, ערוץ: none, אזור: none, שם: none, ציטוט: none, ..opts) = {
  // `שם` names *this note* so that `#הפניה_להערה` can print the number it turned
  // out to be. It is not the channel's name and not the region's: those say
  // where a note goes, and this says which note it is.
  let named = {
    let d = opts.named()
    if שם != none { d.insert("שם", שם) }
    // The words this note is **on**, printed at the head of its entry when
    // `ראש` asks for them — a dibbur hamaschil. See `_eh_head`.
    if ציטוט != none { d.insert("ציטוט", ציטוט) }
    d
  }
  if אזור != none {
    let name = _as_string(אזור).trim()
    // The channel is the region's own name unless the writer also named one, so
    // two notes in one region number together — which is what a region *is*.
    _ch_note_in(if ערוץ == none { name } else { _as_string(ערוץ).trim() }, name, body, named)
  } else {
    _note_to(if ערוץ == none { _ch_default } else { _as_string(ערוץ).trim() }, body, named)
  }
}
#let fnote = _en(הערה)

// הערה_על_הערה · a note ON a note (a sub-note) in the *native* apparatus.
// Typst hoists a footnote nested in a footnote into its own entry, so nesting
// these gives a separate entry per level in the single (Option-A) apparatus.
// Tier 2 of the tiered apparatus, spelled without the tier: routed through
// #הערה_בדרגה so it takes the same per-note overrides as every other note, and so
// its size and slant come from the tier-2 entries of `#הגדרות_הערות` rather than
// from the two numbers that used to be written here. A knob the writer sets and
// one construct that ignores it is the same defect as a knob nothing reads.
#let הערה_על_הערה(body, ..opts) = הערה_בדרגה(2, body, ..opts)
#let subnote = _en(הערה_על_הערה)

// ---- הערות סיום · endnotes (collected in named streams) ----
// #הערתסיום[...] places a marker and stores the note; #הערות_בסוף renders the
// collected notes for a stream. Multiple streams give separate note sections
// (e.g. one for content notes, one for mekoros). Notes may themselves contain
// footnotes or other endnotes — they render when the stream is dumped.
//
// Scoped per SECTION, exactly like the מדור bands: each #הערות_בסוף drops a
// per-stream boundary marker after itself, and a note belongs to the section that
// ends at the first boundary after it. So endnotes can be dumped at the end of
// every chapter (each numbered from 1) as well as at the end of the document —
// dumping twice no longer reprints the first dump's notes.
// Endnotes carry their own numbering scheme, and that is not decoration.
// A document with footnotes at the page foot *and* endnotes at the back marked
// every note in both apparatuses `¹` — so the reader met two different ¹ on one
// page with nothing to say which was which, and nothing in the product could
// tell them apart either. `#הגדרות_הערות_סיום(מספור: "א")` gives the back-matter
// its own shape; the chooser writes it for exactly the layouts that mix the two.
//
// The one kind with no per-instance layer, and deliberately: its single knob is a
// numbering *scheme*, which is a property of the sequence and not of a member of
// it. "This endnote is lettered and its neighbours are numbered" is not a style,
// it is two apparatuses — `#הערתסיום(זרם: …)` is how a document says that. So
// there is nothing here for `כפה` to overrule either.
// The knobs, and the fact that there were none but the scheme is the report.
// An endnote section was set in the document's body face at the document's body
// size, with no way to say otherwise — so *"footnotes and endnotes should share
// a default style, and either should be easy to change on its own"* was half
// impossible: there was no *own* to change. The four ink knobs are the shared
// set (`_nt_keys`), so an endnote section that says nothing takes whatever
// `#הגדרות_טקסט_הערות` says and a sefer's two apparatuses match by default.
//
// `auto` and not a value, for every one of them: a shipped value would be
// indistinguishable from a chosen one, and the whole of the shared layer is
// that distinction. See `_nt_under`.
#let _es_defaults = (
  מספור: "1",
  // Start the section on a page of its own. A document property, because
  // *"endnotes begin a new page"* is a fact about this sefer's layout and not
  // about the machine it is typeset on.
  עמוד_חדש: false,
  // The word above the section, and `none` is a real answer.
  //
  // The report is *"the word printed above the endnote section is fixed — it
  // should be the writer's choice: their own word, or nothing at all, with no
  // leftover gap where it was"*. `auto` here means *whatever the call says*,
  // which for `#הערות_בסוף` with no title of its own is nothing — the heading,
  // the space above it and the space below it are all inside the same `if`, so
  // choosing nothing leaves no gap rather than an empty line.
  //
  // A document property and not an application setting, which is what makes it
  // travel with the sefer: a reader opening the file gets the writer's word,
  // and a sefer written in English says its own word in English because the
  // *document* has a language, not the render.
  כותרת: auto,
  גופן: auto,
  גודל: auto,
  סגנון: auto,
  צבע: auto,
  ריווח: auto,
)
#let _es_cfg = state("ksav-es-cfg", _es_defaults)
#let הגדרות_הערות_סיום(..opts) = _es_cfg.update(c => {
  let d = c
  for (k, v) in opts.named() { d.insert(k, v) }
  _nt_explicit(d, opts.named())
})
#let endnotes_config = _en(הגדרות_הערות_סיום)
#let _es_scheme() = _es_cfg.get().at("מספור", default: "1")

/// The endnote section's ink, with the shared note style under it.
///
/// Returns the arguments for a `set text`, so a knob nobody answered for is
/// simply absent rather than set to a sentinel the page would then show.
#let _es_text() = {
  let c = _nt_under(_es_cfg.get())
  let t = (:)
  // **`סגנון` is not in this list, and that is the fix rather than an omission.**
  // It used to map to `style`, which is a request for an italic face that no
  // bundled Hebrew family ships, so the endnote block's slant came back upright
  // and `#הגדרות_הערות_סיום(סגנון: "italic")` printed exactly nothing different.
  // It is applied through `_ks_style` at the two places this block is rendered.
  //
  // Six sites asked the dead way in all. This one is the sixth, and it is the
  // one no reading of the code found — it turned up when the settings fence
  // rendered every key of every dictionary twice and diffed the pages.
  for (k, arg) in (("גופן", "font"), ("גודל", "size"), ("צבע", "fill")) {
    let v = c.at(k, default: auto)
    if v != auto and v != none { t.insert(arg, v) }
  }
  t
}

/// The endnote block's slant, applied to whatever it wraps.
#let _es_slanted(body) = _ks_style(
  _nt_under(_es_cfg.get()).at("סגנון", default: "normal"),
  body,
)

/// The gap between endnote entries, or `auto` for the document's own spacing.
#let _es_gap() = _nt_under(_es_cfg.get()).at("ריווח", default: auto)
#let _en_label(זרם) = label("ksav-en-" + זרם)
#let _en_dump_label(זרם) = label("ksav-end-" + זרם)
#let _en_section(זרם, loc) = _ksav_real_of(
  _ksav_between(selector(_en_label(זרם)), _en_dump_label(זרם), loc)
)
#let הערתסיום(body, זרם: "הערות", ..opts) = {
  let (own, rest) = _cfg_split(opts.named(), _mk_own_keys)
  _cfg_strict("הערתסיום", rest)
  [#metadata((body: body))#_en_label(זרם)]
  context {
    let loc = here()
    // The class covers the *mark* — the superscript number this command leaves
    // in the text, which is all this command prints. The note's body is set
    // where it is printed, by `#הערות_בסוף`, and that is a command of its own
    // with a door of its own; one command styling another's output is the
    // second authority this register exists to prevent.
    _mk_render(_mk_conf("הערתסיום", own), super[#numbering(
      _es_scheme(),
      _ksav_rank(_nr_scope(_ksav_between(selector(_en_label(זרם)), _en_dump_label(זרם), loc), loc), loc, e => true),
    )])
  }
}
#let הגדרות_הערתסיום(..opts) = _mk_set("הערתסיום", opts.named())
#let endnote_config = _en(הגדרות_הערתסיום)
// One stream's notes, split into the runs the numbering restarts between.
//
// The section is printed as Typst `enum`s, which is right — the numbering
// scheme, the gap and the hanging indent are all `enum`'s — and an `enum`
// counts from one. So a restart is a *second* `enum`, and the whole of
// restarting an endnote section is deciding where to cut.
//
// One run when nothing restarts, which is the shipped answer and costs a single
// state read to establish.
#let _en_runs(entries) = {
  if not _nr_any() { return (entries.map(e => e.value.body),) }
  let runs = ()
  let cur = ()
  let last = none
  let started = false
  for e in entries {
    let og = _nr_origin(e.location())
    if started and og != last {
      runs.push(cur)
      cur = ()
    }
    last = og
    started = true
    cur.push(e.value.body)
  }
  if cur.len() > 0 { runs.push(cur) }
  runs
}
// The rendered block for one stream's notes in the section around `loc`.
#let _en_print(entries) = {
  for run in _en_runs(entries) {
    enum(numbering: _es_scheme() + ".", spacing: _es_gap(), ..run)
  }
}
#let _en_block(זרם, loc) = {
  let entries = _en_section(זרם, loc)
  if entries.len() > 0 {
    set text(.._es_text())
    _es_slanted(_en_print(entries))
  }
}
#let הערות_בסוף(זרם: "הערות", כותרת: auto, עמוד_חדש: auto) = {
  context {
    let entries = _en_section(זרם, here())
    let items = entries.map(e => e.value.body)
    // Emitted here, in the flow of the context and before the block below —
    // see `_ap_fresh_page` for why that placement is the whole of it. Only when
    // there is something to print: a page break in front of nothing is a blank
    // page at the back of the sefer.
    let fresh = if עמוד_חדש != auto { עמוד_חדש } else {
      _es_cfg.get().at("עמוד_חדש", default: false)
    }
    if items.len() > 0 { _ap_fresh_page(fresh) }
    // `auto` asks the document; an explicit title on this call wins, and `none`
    // on this call means *no heading here* even when the document names one.
    let כותרת = if כותרת != auto { כותרת } else {
      let want = _es_cfg.get().at("כותרת", default: auto)
      if want == auto { none } else { want }
    }
    if items.len() > 0 {
      _ksav_ap_open
      v(1em)
      line(length: 100%, stroke: 0.5pt + luma(150))
      if כותרת != none { heading(outlined: false, numbering: none, level: 3, כותרת) }
      set text(.._es_text())
      _es_slanted(_en_print(entries))
      _ksav_ap_close
    }
  }
  // The section boundary — after the context above, so that context renders the
  // section ending here rather than the next one.
  [#metadata(none)#_en_dump_label(זרם)]
}
// הערות_בסוף_צד — render several endnote streams SIDE BY SIDE (one column each),
// e.g. content notes and sources as two parallel end-columns. Any number of
// streams; pass their order and optional per-stream titles.
#let הערות_בסוף_צד(זרמים: (), כותרות: (:), יחס: none, עמוד_חדש: false) = {
  context {
    let loc = here()
    let present = זרמים.filter(s => _en_section(s, loc).len() > 0)
    if present.len() > 0 {
      _ap_fresh_page(עמוד_חדש)
      _ksav_ap_open
      v(1em)
      line(length: 100%, stroke: 0.5pt + luma(150))
      v(0.4em)
      let col(s) = {
        let title = כותרות.at(s, default: none)
        if title != none { block(spacing: 0.4em, heading(outlined: false, numbering: none, level: 3, title)) }
        _en_block(s, loc)
      }
      let widths = if type(יחס) == array { יחס.map(x => x * 1fr) } else { present.map(_ => 1fr) }
      grid(columns: widths, column-gutter: 1.5em, ..present.map(col))
      _ksav_ap_close
    }
  }
  for s in זרמים { [#metadata(none)#_en_dump_label(s)] }
}
#let endnote = _en(הערתסיום)
#let endnotes = _en(הערות_בסוף)
#let endnotes_side = _en(הערות_בסוף_צד)

// The shared sidenote engine. `lbl` names the stream (one per gutter) and `side`
// is "חוץ" (the far side of the main column), "ימין" or "שמאל" (an absolute page
// side, for the two-sided layout).
//
// What is left here is the two things that genuinely belong in the sentence: the
// marker the reader sees, and the metadata the column is drawn from. Everything
// about *where* the note goes is `_sn_page_column`'s.
//
// `own` — this note's own style overrides. They ride in the metadata because the
// column measures every note in it to stack them, so a note styled only at its
// own call site would be measured at the wrong height by its neighbours.
// `kind` is what the page needs to draw this note's marker — see `_sn_streams`.
// It travels in the metadata because the drawing happens on the page and a
// closure cannot travel in one.


// Named arguments style this one sidenote — `גודל` and `צבע`, the two knobs that
// belong to a note rather than to the column, and `שם`, which names it for
// `#הפניה_להערה`. The underlying collector always accepted a name; these three
// wrappers were the only doors that refused to carry one, so a gloss beside the
// text was the one note that could not be referred to through the spelling the
// chooser leads with. See `_sn_note`.
#let הערת_גיליון(body, ..opts) = {
  let named = opts.named()
  let mine = named.at("שם", default: none)
  let named = if mine == none { named } else {
    let d = named
    let _ = d.remove("שם")
    d
  }
  let (own, rest) = _cfg_split(named, _sn_own_keys)
  _cfg_strict("הערת_גיליון", rest)
  _sn_note("ksav-sn", "חוץ", "צד", body, own: own, שם: mine)
}

// עם_הערות_צד — reserve the note column beside `עיקר`. The notes themselves are
// placed by #הערת_גיליון at their own lines; this only narrows the text column so
// there is empty page for them to land on.
#let עם_הערות_צד(עיקר, יחס: auto) = {
  // `auto`, not `2`. The ratio is in `_sn_defaults` and settable for a whole
  // document with `#הגדרות_הערות_צד(יחס: 3)` — and this parameter used to
  // default to a number and write it over the top, so the configured width was
  // silently discarded by the wrapper that is supposed to use it. Two ways to
  // say one thing, and the one nobody passed won.
  if יחס != auto { _sn_cfg.update(c => { let d = c; d.insert("יחס", יחס); d }) }
  // What the page foreground has to know to draw the column: how many were
  // reserved and on which sides. It replaces the plain open/closed counter,
  // which could say *a column exists* and not *which one*, so the renderer had
  // to be inside the grid to find out — which is exactly what made a note
  // unable to reach the next page. See `_sn_page_column`.
  _sn_shape.update(s => (טורים: 1, צדדים: "שניהם"))
  context {
    let cfg = _nt_under(_sn_cfg.get())
    // The ratio off the configuration, not off the parameter — which is `auto`
    // when the call did not give one, and `auto * 1fr` is a compile error rather
    // than a default. Caught by two tests the moment the parameter changed.
    grid(
      columns: (cfg.at("יחס", default: 2) * 1fr, 1fr),
      column-gutter: cfg.at("מרווח", default: 1.2em),
      עיקר,
      [],
    )
  }
  _sn_shape.update(s => (טורים: 0, צדדים: "שניהם"))
}
#let sidenote = _en(הערת_גיליון, extra: (gutter: "מרווח"))
#let sidenotes = _en(עם_הערות_צד)
#let sidenotes_config = _en(הגדרות_הערות_צד, extra: (gutter: "מרווח"))

// ---- הערות דו-צדדיות · two note streams, one down each side ----
// Wrap a section (or the whole document) in #עם_הערות_דו_צד[...]. Inside,
// #הערת_ימין[...] feeds the right column (numbered 1,2,3) and #הערת_שמאל[...]
// the left column (numbered 1′,2′,3′) — two independent apparatuses running down
// both sides of the centred main text, each note beside its own line.
#let הערת_ימין(body, ..opts) = {
  let named = opts.named()
  let mine = named.at("שם", default: none)
  let named = if mine == none { named } else {
    let d = named
    let _ = d.remove("שם")
    d
  }
  let (own, rest) = _cfg_split(named, _sn_own_keys)
  _cfg_strict("הערת_ימין", rest)
  _sn_note("ksav-sn-r", "ימין", "צד", body, own: own, שם: mine)
}
#let הערת_שמאל(body, ..opts) = {
  let named = opts.named()
  let mine = named.at("שם", default: none)
  let named = if mine == none { named } else {
    let d = named
    let _ = d.remove("שם")
    d
  }
  let (own, rest) = _cfg_split(named, _sn_own_keys)
  _cfg_strict("הערת_שמאל", rest)
  _sn_note("ksav-sn-l", "שמאל", "שמאל", body, own: own, שם: mine)
}
// `צדדים` — which margins to reserve. **This is the layout ask**, and it is a
// capability rather than a default: the grid below was always three columns, so
// the body could only ever sit *between* two note columns and never beside one.
// A sefer with a peirush down one side and nothing down the other had to have
// the empty side reserved anyway, which narrows the text for nothing.
//
//   "שניהם"  both, and the body in the middle — what this always did
//   "ימין"   one column, on the right; the body takes the rest
//   "שמאל"   one column, on the left
//
// The stream a note goes to is unchanged: `#הערת_ימין` still feeds the right and
// `#הערת_שמאל` the left. Reserving one side and writing to the other is the
// writer's mistake to make, and `#הערת_שמאל` in a right-only layout lands where
// it always did — outside the reserved column, which is what `_sn_has_column`
// guards against.
#let עם_הערות_דו_צד(עיקר, יחס: auto, צדדים: "שניהם") = {
  if יחס != auto { _sn_cfg.update(c => { let d = c; d.insert("יחס", יחס); d }) }
  _sn_shape.update(s => (טורים: 2, צדדים: צדדים))
  context {
    let cfg = _nt_under(_sn_cfg.get())
    let r = cfg.at("יחס", default: 2.4)
    let g = cfg.at("מרווח", default: 1.2em)
    // Which column comes first is a question about the *text direction*, not
    // about the side: a grid fills from the start edge, so in RTL the first
    // column is the rightmost one. Reserving "ימין" therefore means the empty
    // column first in a Hebrew document and second in an English one — and
    // getting that backwards does not fail, it places the note off the page,
    // where `_sn_note` measures from the column's start corner and finds no
    // room. Measured at x=682 on a 595pt page before this line was right.
    let empty_first = (צדדים == "ימין") == (text.dir == rtl)
    if צדדים in ("ימין", "שמאל") {
      if empty_first {
        grid(columns: (1fr, r * 1fr), column-gutter: g, [], עיקר)
      } else {
        grid(columns: (r * 1fr, 1fr), column-gutter: g, עיקר, [])
      }
    } else {
      grid(columns: (1fr, r * 1fr, 1fr), column-gutter: g, [], עיקר, [])
    }
  }
  _sn_shape.update(s => (טורים: 0, צדדים: "שניהם"))
}
#let noteright = _en(הערת_ימין, extra: (gutter: "מרווח"))
#let noteleft = _en(הערת_שמאל, extra: (gutter: "מרווח"))
#let twosided = _en(עם_הערות_דו_צד)

// ============================================================
//  גופי הערות · deferred note bodies — write the prose at the end
// ------------------------------------------------------------
//  Every note command above takes its body *inline*: #הערה[three hundred words
//  of pilpul] sitting in the middle of a sentence. For a sefer where the notes
//  outweigh the text, that makes the SOURCE unreadable — the body text you are
//  trying to write is confetti scattered between note blocks. This is the
//  org-mode arrangement: a short marker inline, the prose gathered at the end.
//
//    בראשית ברא#הערה_בשם("א") אלקים…
//    …
//    #גוף_הערה("א")[עיין רש״י שם, ובמה שכתב הרמב״ן.]
//
//  Where the note PRINTS is unchanged and unrestricted — that is `סוג`, and it
//  takes any note command in this file:
//
//    #הערה_בשם("א")                          → a footnote (the default)
//    #הערה_בשם("א", סוג: הערתסיום)            → an endnote
//    #הערה_בשם("א", סוג: מדור_בדרגה, 2)       → a section band, tier 2
//    #הערה_בשם("א", סוג: הערה_זרם, "מקורות")  → the "mekoros" stream
//
//  One command covers all eleven layouts because every note command in this
//  file takes its body as the LAST positional argument, so the extra positional
//  arguments a layout needs (a tier, a stream) pass straight through ahead of
//  it, and named arguments pass through untouched.
//
//  Mechanism: a definition is inert. It stores its body in #metadata, which is
//  never laid out — so a nested note inside a deferred body does NOT fire at
//  the definition site, only where the reference puts it, exactly as if it had
//  been typed inline. The reference then queries for its definition. Typst's
//  introspection sees the whole finished document, so a definition may sit
//  anywhere: after the reference (the usual arrangement), before it, or in a
//  different chapter. There is no feedback loop — the query result does not
//  depend on layout — so it converges on the first pass.
// ============================================================
#let _nb_label = label("ksav-notebody")
// גוף_הערה(שם, body) — define the body of the note called `שם`. Renders nothing.
#let גוף_הערה(שם, body) = [#metadata((שם: _as_string(שם), body: body))#_nb_label]
// The body defined for `k`, or none. First definition wins; a duplicate name is
// a writer error the editor lints, not something to guess about here.
#let _nb_find(k) = {
  let hits = query(_nb_label).filter(e => e.value.שם == k)
  if hits.len() == 0 { none } else { hits.first().value.body }
}
// הערה_בשם(שם, סוג: הערה, ..) — place a note here whose body is defined elsewhere.
#let הערה_בשם(שם, סוג: הערה, ..ארגומנטים) = context {
  let k = _as_string(שם)
  let body = _nb_find(k)
  if body == none {
    // A dangling reference is loud rather than silent: an invisible one would be
    // a note the writer believes they wrote and the reader never sees.
    text(fill: red, super[?#k])
  } else {
    סוג(..ארגומנטים.pos(), body, ..ארגומנטים.named())
  }
}
// גופי_הערות[...] — an optional wrapper for the block of definitions at the end
// of the document. It renders its contents in a zero-height context so that a
// long run of definitions can never push a stray blank page, and it gives the
// editor one canonical place to file a new body.
#let גופי_הערות(body) = block(height: 0pt, spacing: 0pt, body)
#let note_body = _en(גוף_הערה)
#let note_named = _en(הערה_בשם)
#let note_bodies = גופי_הערות

// ---- הפניות · cross-references (auto-numbered, auto-updating) ----
// #סמן("שם") marks a target; #הפניה("שם") prints its number. Numbers follow
// document order and update automatically when targets are added/reordered.
// The number is the target's position in document order, so it means nothing to
// a reader unless the target shows it too: "see 3" needs a 3 to point at. The
// mark therefore prints its own number, in the same form the reference prints.
#let _ksav_xref = state("ksav-xref", ())
#let _xref_number(שם) = context {
  let l = _ksav_xref.final()
  let idx = l.position(x => x == שם)
  if idx == none [?] else [#(idx + 1)]
}
#let סמן(שם) = {
  let שם = _as_string(שם)
  _ksav_xref.update(l => l + (שם,))
  _xref_number(שם)
}
#let הפניה(שם) = _xref_number(_as_string(שם))
#let anchor = סמן
#let xref = הפניה

// הפניה_להערה("פלוני") — the number a named note turned out to be.
//
// **One command for the two things `NOTES-PLAN` thing five asks for**, because
// they are one thing wearing two dresses:
//
//   `עיין #הפניה_להערה("פלוני")`               → *see note 12*
//   `…ועיין שם#הפניה_להערה("פלוני", סימון: true)` → a second **marker**, ¹²
//
// The second is the plan's *"one note, two markers — 'see above, note 12' as a
// second marker pointing at an existing note, common in seforim."* It prints the
// first note's number and creates **no second entry**, which is exactly what
// `#הערה_בשם`/`#גוף_הערה` does not do: that pair renders the body twice.
//
// A name nobody wrote is loud and red, and it says the name. The plan calls this
// one out by itself — *"a marker pointing at a label not in the list currently
// fails unreadably, and that will happen on every rename"* — and a rename is the
// case: the writer sees `?פלוני` on the page, in the sentence they are reading,
// and knows both that it is broken and which word to fix.
#let הפניה_להערה(שם, סימון: false) = context {
  let name = _as_string(שם).trim()
  let hits = query(_xn_label).filter(e => e.value.שם == name)
  if hits.len() == 0 {
    text(fill: red, if סימון { super[?#name] } else { [?#name] })
  } else if hits.len() > 1 {
    // Two notes of one name: the reference cannot know which was meant, and
    // answering silently with the first taught nobody anything — while a
    // *dangling* name has always spoken up, in this same colour. The first
    // number still answers, so nothing is lost by saying so.
    text(fill: red, if סימון { super[#name כפול] } else { [#name כפול] })
  } else {
    let num = hits.first().value.מספר
    if סימון { super[#num] } else { [#num] }
  }
}
#let noteref = _en(הפניה_להערה, extra: (marker: "סימון"))

// ============================================================
//  טבלאות · tables
// ============================================================
// #טבלה reads #הגדרות_טבלאות at its location: stroke / inset / align / striping /
// stripe colour / header fill / font / size.
//
// **Every one of those** is also a per-table override — `#טבלה(קו: none, מרווח:
// 4pt)` for the one table that has to be tighter and unruled. Two of the eight
// were reachable that way and six were not: `יישור` and `פסים` were declared
// parameters with sentinel defaults, and the other six fell into `..תאים` and
// reached Typst's `table`, which has no `קו` and stopped the compile. So the
// per-table layer existed for a quarter of the knobs, and looked broken for the
// rest — the writer sees one control obey and the next one refuse.
// Written out in one function and not split into a private renderer, which is
// where the first version of this went. A diagnostic names the innermost command
// its span sits inside, so a table whose `עמודות` was given a string reported
// *"#_tb_render expects a length"* — a helper the writer has never heard of, from
// the prelude, with no line number in their own file, for an error in their table.
#let טבלה(עמודות: 2, ..תאים) = {
  let (own, rest) = _cfg_split(תאים.named(), _tb_defaults.keys())
  // The override has to be visible to #כותרת_תא, which reads the header fill for
  // itself: a cell is content built before the table it lands in, so it cannot be
  // handed anything. Bracketing the table in the state is what lets a per-table
  // `צבע_כותרת` reach the cells of that table and of no other.
  if own.len() > 0 { _tb_own.update(own) }
  context {
    let c = _cfg_with(_tb_cfg.get(), own)
    let stripe = c.at("פסים", default: false)
    let a = (
      columns: עמודות,
      // Through `_doc_align` for the same reason the heading rule does — see the
      // note there. A written `"מרכז"` was a compile error on a table and has
      // always worked on the document.
      align: {
        let v = c.at("יישור", default: auto)
        if type(v) == str { let d = _doc_align(v); if d == none { auto } else { d } } else { v }
      },
      stroke: c.at("קו", default: 0.5pt + luma(160)),
      inset: c.at("מרווח", default: 8pt),
    )
    // Merged and not spread alongside, so a Typst-named argument the writer gave —
    // `#טבלה(align: center)` — wins outright instead of arriving twice under `align`.
    for (k, v) in rest { a.insert(k, v) }
    // # The header fill is painted here, and it never was
    //
    // `#כותרת_תא` used to build its own `table.cell(fill: …)` inside a `context`,
    // because the colour lives in a state and reading one needs a context. That
    // does not work, and it fails silently: **a `table.cell` wrapped in a
    // `context` stops being a cell.** Measured against raw Typst —
    // `#table(columns: 2, table.cell(fill: red)[א], [ב])` paints the cell and
    // `#table(columns: 2, context { table.cell(fill: red)[א] }, [ב])` paints
    // nothing — so the shipped grey header and `צבע_כותרת` have both been
    // invisible for as long as the command has existed. The cell's *bold* came
    // through, which is what made it look like a working feature.
    //
    // So the cells stay plain and the table paints them. It is the only place
    // that can: `fill` on a table is consulted per (column, row), and this is
    // the only scope that knows both the colour and which positions were asked
    // for as headers — `_kd_kind` says so, off the same mark that already tells
    // a `#תא` from ordinary content.
    let kids = _kd_all(תאים.pos(), "טבלה")
    // How many columns there *are*, which is not always the number the writer
    // gave: `עמודות` takes a count or a track list — `(1fr, 1fr)` — and the
    // toolbar inserts the track list. Doing arithmetic on the argument itself
    // stopped every offered table insertion from compiling.
    let ncols = if type(עמודות) == array { עמודות.len() } else { עמודות }
    let heads = ()
    for (i, k) in _kd_kinds(תאים.pos(), "טבלה").enumerate() {
      if k == "כותרת_תא" { heads.push((calc.rem(i, ncols), calc.quo(i, ncols))) }
    }
        let head_fill = c.at("צבע_כותרת", default: luma(235))
    a.insert("fill", (col, row) => {
      if heads.contains((col, row)) { head_fill }
      else if stripe and calc.odd(row) { c.at("צבע_פס", default: luma(245)) }
      else { none }
    })
    let t = table(..a, ..kids)
    let f = c.at("גופן", default: none)
    let s = c.at("גודל", default: none)
    if f != none { t = text(font: f, t) }
    if s != none { t = text(size: s, t) }
    t
  }
  if own.len() > 0 { _tb_own.update((:)) }
}
#let תא(body) = _kd("תא", body)
// A header cell is bold, and its background is painted by the table — see the
// note in `#טבלה`. It used to build its own `table.cell(fill: …)` inside a
// `context`, and a `table.cell` in a `context` is not a cell at all, so the
// fill went nowhere and only the bold arrived.
#let כותרת_תא(body) = _kd("כותרת_תא", strong(body))
#let מיזוג(מספר, body) = _kd("מיזוג", table.cell(colspan: מספר, body))

#let mktable = _en(טבלה)
#let cell = תא
#let headcell = כותרת_תא
#let colspan_ = מיזוג

// ============================================================
//  בלוקים · blocks, quotes, callouts, boxes
// ============================================================

// ============================================================
//  פריסה · layout helpers
// ============================================================
// A rule with a look of its own — and it stays a **value**, not a function.
//
// Typst prints a bare function name as text: `#קו_מפריד` where the binding is
// a function puts the letters on the page. Documents, templates, the Org and
// docx importers and the prose view all write the bare form, so making this
// take arguments would silently print the word in every one of them.
//
// Which is why it has no per-instance layer, unlike every other class here:
// a command with no argument list has nowhere to put one. That is a property
// of this command, not of the register.
#let קו_מפריד = context {
  let c = _mk_conf("קו_מפריד", (:))
  let drawn = line(
    length: c.at("רוחב", default: 100%),
    stroke: c.at("עובי", default: 0.5pt) + c.at("צבע", default: luma(180)),
  )
  let al = if "יישור" in c { _doc_align(c.יישור) } else { none }
  if al != none { align(al, drawn) } else { drawn }
}
#let הגדרות_קו_מפריד(..opts) = _mk_set("קו_מפריד", opts.named())
#let hrule_config = _en(הגדרות_קו_מפריד)
#let מרווח(מידה: 1em) = v(מידה)
#let רווח_אופקי(מידה: 1em) = h(מידה)
// חסר_הכללה — what prints where an inclusion could not be made.
//
// The engine expands `#כלול` textually before Typst sees anything (see
// `engine/src/include.rs`), and when a name answers to no document it leaves one
// of these rather than a gap. Deliberately loud: a missing chapter that printed
// as nothing at all would be discovered when the sefer came back from the
// printer.
#let חסר_הכללה(body) = block(
  width: 100%, inset: 8pt, radius: 3pt,
  fill: rgb("#fee2e2"), stroke: 0.5pt + rgb("#b91c1c"),
  text(fill: rgb("#b91c1c"), weight: "bold", [⚠ #body]),
)
#let missing_include = חסר_הכללה

// כלול — and the reason there is a Typst function here at all.
//
// The real inclusion is textual and happens in the engine before Typst sees the
// document, so a `#כלול(…)` that *reaches* this function is one the engine
// did not recognise — which means exactly one thing: it was not alone on its
// line. That is the single failure mode of the whole-line rule, and without this
// definition it would surface as "unknown variable כלול", which names the
// wrong problem entirely.
//
// It also keeps the registry's promise that every listed command is defined.
#let כלול(שם) = חסר_הכללה[
  הפקודה #raw("#כלול") צריכה לעמוד לבדה בשורה — ולא באמצע משפט (#שם)
]
#let include_part = כלול

#let מעבר_עמוד = pagebreak(weak: true)
#let מעבר_שורה = linebreak()
// מעבר_פסקה — a paragraph break that is not a blank line.
//
// A blank line is Typst's own way of ending a paragraph and it works in prose.
// It does not work everywhere a writer wants a paragraph: inside a list item, a
// note body or a table cell, a blank line is either swallowed by the block or —
// in a list — read as the end of the item. `parbreak()` is the same break said
// as a command, so it goes anywhere content goes.
#let מעבר_פסקה = parbreak()
#let מעבר_טור = colbreak()
#let הזחה(body) = pad(right: 1.5em, body)
#let טורים_בלוק(מספר, body) = columns(מספר, body)
// תמונה — insert a picture. `נתיב` is the asset's name as sent with the compile
// request (the editor attaches the bytes; there is no file system to read from).
// רוחב sizes it, יישור places it (right / מרכז / left), and כיתוב adds a caption,
// in which case it becomes a numbered figure.
// תמונה — an image. An empty path is a *placeholder*, not an error: the Insert
// menu and the palette can offer "image" without also having asked which image,
// and the writer who picks it gets a box saying so instead of a blanked page
// reporting "file not found" about a path they were never asked for. (That was
// six of the 384 failures in the insertion sweep, and the only family where the
// error message named something the writer had not written.)
#let תמונה(נתיב, רוחב: auto, יישור: none, כיתוב: none, ..opts) = context {
  let (own, rest) = _cfg_split(opts.named(), _mk_own_keys)
  _cfg_strict("תמונה", rest)
  // The two parameters this command has always taken are instance overrides
  // now, so they beat the class the way `#מחיקה(צבע: …)` beats `#הגדרות_מחיקה`
  // — and a document that sets neither takes whatever the sefer said.
  let mine = own
  if רוחב != auto { mine.insert("רוחב", רוחב) }
  if יישור != none { mine.insert("יישור", יישור) }
  let c = _mk_conf("תמונה", mine)
  let wide = c.at("רוחב", default: auto)
  // The width goes to the picture, not to a block around it: a block at 60%
  // holding a full-size image is a full-size image sticking out of a narrow
  // box. So the frame is drawn from everything else.
  let framing = (:)
  for (k, v) in c { if k != "רוחב" { framing.insert(k, v) } }
  if _as_string(נתיב).trim() == "" {
    box(
      width: if wide == auto { 60% } else { wide },
      height: 4em,
      stroke: (paint: luma(160), dash: "dashed", thickness: 0.8pt),
      fill: luma(247),
      align(center + horizon, text(size: 0.85em, fill: luma(110))[🖼 (תמונה — בחרו קובץ)]),
    )
  } else {
    let pic = image(נתיב, width: wide)
    // The caption through the class's text look, which is the only text a
    // figure prints — so `#הגדרות_תמונה(גודל: 0.85em)` is a sentence about
    // captions and needs no second name for one.
    let out = if כיתוב != none {
      let fig = figure(pic, caption: _mk_render(c, כיתוב))
      // A figure is a block that fills the column and centres itself, so an
      // alignment *around* it moves nothing — which is why `יישור` has been
      // accepted and silently ignored on every captioned picture since this
      // command was written, with a test beside it asserting only that the
      // document compiled and the caption printed. No test could see otherwise:
      // a picture is neither a glyph nor a shape, so `probe` could not find one
      // at all until `pictures` was added for this.
      //
      // Sized to the picture it becomes something an alignment can move. Only
      // when there is an alignment to apply, because a figure with none is
      // centred by Typst and that is what every sefer with a picture in it
      // currently prints.
      if "יישור" in framing { block(width: wide, fig) } else { fig }
    } else { pic }
    _mk_frame(framing, out)
  }
}
#let הגדרות_תמונה(..opts) = _mk_set("תמונה", opts.named())
#let image_config = _en(הגדרות_תמונה)

// חסר — a fill-in blank line (form field), e.g. for a kesubah or letter
#let חסר(רוחב: 3em) = box(width: רוחב, stroke: (bottom: 0.6pt + luma(60)))
#let blank = _en(חסר)

#let hrule = קו_מפריד
#let vspace = _en(מרווח)
#let hspace = _en(רווח_אופקי)
#let pbreak = מעבר_עמוד
#let lbreak = מעבר_שורה
// `parabreak`, not `parbreak`: `#let parbreak = …` would shadow Typst's own
// function for everything defined after it here, including the line above that
// calls it, and a writer typing Typst's `#parbreak()` directly — which the sink
// has always allowed — would get Ksav's binding instead.
#let parabreak = מעבר_פסקה
#let cbreak = מעבר_טור
#let indent_ = הזחה
#let cols = טורים_בלוק
#let img = _en(תמונה)


// The blocks, each with a look of its own.
//
// Every value these used to draw with was written into the call — a callout's
// blue, a box's grey border, the padding they share — so a writer could see it
// and change none of it. They ship exactly those values from `_mk_defaults` now
// and take the same three layers as everything else: the class, this one, and
// `כפה` over the top.
//
// `#הערת_צד(גוון: …, קו: …)` still means what it always did, because `גוון` and
// `קו` are knobs: what was a parameter of one call is an override on one
// instance, which is the same sentence in the same words.
#let ציטוט(body, ..opts) = {
  let (own, rest) = _cfg_split(opts.named(), _mk_own_keys)
  _cfg_strict("ציטוט", rest)
  quote(block: true, context _mk_draw("ציטוט", own, body))
}
#let הערת_צד(body, ..opts) = {
  let (own, rest) = _cfg_split(opts.named(), _mk_own_keys)
  _cfg_strict("הערת_צד", rest)
  context _mk_draw("הערת_צד", own, body)
}
#let תיבה(body, ..opts) = {
  let (own, rest) = _cfg_split(opts.named(), _mk_own_keys)
  _cfg_strict("תיבה", rest)
  context _mk_draw("תיבה", own, body)
}
#let אזהרה(body, ..opts) = {
  let (own, rest) = _cfg_split(opts.named(), _mk_own_keys)
  _cfg_strict("אזהרה", rest)
  context _mk_draw("אזהרה", own, body)
}
#let הצלחה(body, ..opts) = {
  let (own, rest) = _cfg_split(opts.named(), _mk_own_keys)
  _cfg_strict("הצלחה", rest)
  context _mk_draw("הצלחה", own, body)
}
#let מקור(body, ..opts) = {
  let (own, rest) = _cfg_split(opts.named(), _mk_own_keys)
  _cfg_strict("מקור", rest)
  context _mk_draw("מקור", own, body)
}

// The title page, whose two lines were `text(size: 2em, weight: "bold")` and
// `text(size: 1.2em, fill: luma(110))` inside an `align(center, …)`. Down here
// rather than up with the headings because a look that resolves through the
// register has to be defined after it.
#let שער(body, ..opts) = {
  let (own, rest) = _cfg_split(opts.named(), _mk_own_keys)
  _cfg_strict("שער", rest)
  context _mk_draw("שער", own, body)
}
#let title = שער
#let תת_שער(body, ..opts) = {
  let (own, rest) = _cfg_split(opts.named(), _mk_own_keys)
  _cfg_strict("תת_שער", rest)
  context _mk_draw("תת_שער", own, body)
}
#let subtitle = תת_שער

#let blockquote = ציטוט
#let callout = _en(הערת_צד, extra: (accent: "קו"))
#let framebox = תיבה
#let warnbox = _en(אזהרה)
#let okbox = _en(הצלחה)
#let cite_ = מקור


/// Register one mark where it stands, and print it in its class's style.
///
/// `רשומה` is what the list shows — which is not always what prints: a
/// `#ציון_מקור` prints the sefer's canonical name and lists under it, a `#פסוק`
/// prints the quotation and lists under its source, and a `#ערך` may print
/// nothing at all and still belong in the list.
#let _mk_mark(cls, רשומה, body, named, extra: (:)) = {
  let (own, rest) = _cfg_split(named, _mk_own_keys)
  _cfg_strict(cls, rest)
  if own.at("ברשימה", default: true) != false {
    let v = (class: cls, entry: _as_string(רשומה).trim())
    for (k, val) in extra { v.insert(k, val) }
    [#metadata(v)#_mk_label]
  }
  context _mk_render(_mk_conf(cls, own), body)
}

/// Every mark of one class, in the order they were written.
#let _mk_of(cls) = query(_mk_label).filter(m => m.value.class == cls)

// ============================================================
//  תורני · Torah / yeshiva writing
//  First-class support for divrei Torah, chiddushim and sefarim:
//  siman/seif structure, verse & source references, and mekoros
//  footnotes — so a bochur has no reason to reach for anything else.
// ============================================================

// סימן — a numbered chapter heading, "סימן א׳ — כותרת"
//
// The mark rides **inside** the heading's own body rather than in front of it.
// A metadata element sitting on its own in block context opens a paragraph, and
// a paragraph before every siman is vertical space nobody asked for; inside, it
// is invisible and its location is still the heading's, which is what the page
// number in the list is read off.
// A siman is a heading, and it is not *an* ordinary heading — which is the
// whole of why it takes a look of its own. `#הגדרות_כותרות` sets every level-1
// heading in the sefer; a writer who wants the simanim larger than the other
// level-1 headings had nothing to say. It resolves through the same three
// layers as every other named class — the shipped default, the class, this one
// — over whatever the heading level says, so a sefer that has never mentioned
// simanim reprints exactly as it did.
//
// The metadata stays outside the styled body: it is what `#רשימת_סימונים`
// collects, and a look is not allowed to decide what is in an index.
#let סימן(מספר, כותרת, ..opts) = {
  let (own, rest) = _cfg_split(opts.named(), _mk_own_keys)
  _cfg_strict("סימן", rest)
  // A siman is a section boundary, so anything filed at the end of a section
  // ends here — before this heading, which is what "the end of the previous
  // one" means. Nothing is drawn for a document with no such channel.
  _cn_section_dump()
  let entry = "סימן " + _as_string(מספר) + if כותרת != none { " — " + _as_string(כותרת) } else { "" }
  heading(level: 1, {
    if own.at("ברשימה", default: true) != false {
      [#metadata((class: "סימן", entry: entry))#_mk_label]
    }
    // Four pieces, each settable on its own — `#הגדרות_סימן(מספר: (משקל:
    // "bold"))` bolds the numbers and says nothing about the titles. The
    // command's own look wraps all of it, so a size on the siman still scales
    // the whole heading.
    context _mk_render(_mk_conf("סימן", own), {
      // The word and the dash are the command's own words, so they come out of
      // their parts rather than out of this line — which is what lets a sefer
      // print `סי׳ א׳` or drop the word and keep the number.
      let pre = _mk_part("סימן", "קידומת")
      let word = pre.at("טקסט", default: "")
      if word != "" { _mk_render(pre, word); [ ] }
      _mk_piece("סימן", "מספר", מספר)
      if כותרת != none {
        let sep = _mk_part("סימן", "מפריד")
        let dash = sep.at("טקסט", default: "")
        if dash != "" { _mk_render(sep, dash) }
        _mk_piece("סימן", "כותרת", כותרת)
      }
    })
  })
}

// סעיף — a lettered/numbered halachic paragraph: "א. גוף ההלכה"
//
// The look belongs to **the letter**, not to the paragraph. `#סעיף` has always
// set it with `strong`, which is `משקל: "bold"` written as a shipped default
// here — so it prints as it always has and a writer can now say otherwise. The
// body is the writer's prose and is left alone: a class default that swallowed
// it would restyle the halacha along with its letter, which is not what anybody
// asking for this means.
#let סעיף(אות, body, ..opts) = {
  let (own, rest) = _cfg_split(opts.named(), _mk_own_keys)
  _cfg_strict("סעיף", rest)
  block(spacing: 0.85em, context {
    _mk_render(_mk_conf("סעיף", own), [#אות. ])
    body
  })
}

// אות — the letter that opens a clause, set bold with its full stop: #אות[ב]
// prints **ב.** and the text runs on from it.
//
// *What it is for*, asked in the margins and answered here rather than by
// deleting it. It is the smaller sibling of `#סעיף`: that one is a **block** — a
// lettered paragraph with its own spacing — and this one is **inline**, for the
// letter that opens a clause inside a paragraph that is already running. A sefer
// uses both on the same page, which is why one is not the other with an
// argument.
// The inline sibling takes the same look through the same three layers, and
// separately from `#סעיף` — a sefer that sets its blocks apart from its inline
// letters is the reason both commands exist.
#let אות(סימן, ..opts) = {
  let (own, rest) = _cfg_split(opts.named(), _mk_own_keys)
  _cfg_strict("אות", rest)
  context _mk_render(_mk_conf("אות", own), [#סימן. ])
}

// פסוק — an emphasized quotation followed by its reference in parentheses.
//
// The quotation carries the class's styling; the reference after it does not,
// because the reference is the apparatus around the mark rather than the mark.
// The list files the pesukim under their sources, which is the order a reader
// looks them up in.
#let פסוק(מקור, body, ..opts) = {
  _mk_mark("פסוק", מקור, body, opts.named())
  // The reference was `text(size: 0.82em, fill: luma(95))` written here, with
  // no way for a writer to reach it — the plainest case of a look that is not a
  // setting. It is a part now, shipping those exact two values.
  [ #context _mk_piece("פסוק", "מקור", [(#מקור)])]
}

// מראה_מקום — a source citation set as a footnote (the mekoros apparatus)
//
// `מקור:` is the canonical ref of what is being cited — `girsa:bavli/berakhot/2a:1`
// — and it is **stored in the document, not printed**. That is the whole of the
// pairing's promise (Girsa spec.md §10.2): a document that keeps the place can
// be re-printed in another citation style, or have its quotes regenerated
// against a corrected edition, without touching a word of the prose. A document
// that keeps only the printed string can do neither.
//
// It is also what `#מראה_מקומות()` collects into a source list at the back.
//
// `תווים:` is which characters of that place were actually quoted — `"4-19"`,
// half-open, counted in the text as the reader was shown it, and `"4-"` for
// *to the end*. It is absent on a citation of the whole place, which is what
// every document written before this argument existed says, and why they are
// all still right. Without it the ref alone says *this se'if*, and regenerating
// against a corrected edition hands back the whole se'if to a writer who
// quoted half of one.
//
// It registers in the mark register (`_mk_label`) like every other collectable
// mark, and carries its `ref` and `chars` alongside the entry — which is why
// the register's value is a dictionary a class may add to rather than a fixed
// pair.
//
// It takes its **look** from that register too, which it did not use to: the
// margin note that produced this said a source note *looks exactly like a
// footnote*, and the answer was that a footnote is what it is, so
// `#הגדרות_הערות` already styles it. True, and no use to the writer who wants
// this one apparatus set apart from the ordinary notes without dragging every
// note with it. `_mk_defaults` says why the register is where that belongs.
//
// So: `#הגדרות_סימונים(גודל: ("מראה_מקום": 0.8em))` for the class,
// `#מראה_מקום(סגנון: "italic")[…]` for this one, `פטור` to hold one out of the
// class's look, and `כפה` on the global to sweep the one-offs back — the same
// three layers every other class of marks has had.
//
// `ברשימה: false` keeps a citation out of `#מראה_מקומות()` while leaving it a
// footnote, which is why the registration below reads it. Without a `מקור:`
// there is nothing to file either way, and that has not changed.
#let מראה_מקום(body, מקור: none, תווים: none, ..opts) = {
  let (own, rest) = _cfg_split(opts.named(), _mk_own_keys)
  _cfg_strict("מראה_מקום", rest)
  if מקור != none and own.at("ברשימה", default: true) != false {
    [#metadata((
      class: "מראה_מקום",
      entry: _as_string(body).trim(),
      ref: מקור,
      chars: תווים,
      printed: body,
    ))#_mk_label]
  }
  footnote(context _mk_render(_mk_conf("מראה_מקום", own), body))
}

// מקור_חי — a citation in the flow of the prose that keeps its ref.
//
// What linkify produces (Girsa spec.md §10.5): the words are printed exactly
// as they were written, and the ref rides underneath. Two things follow — the
// citation counts in `#מראה_מקומות()`, and in a compiled PDF it is a **link**
// that opens the page it names.
#let מקור_חי(body, מקור: none) = {
  if מקור == none { body } else {
    [#metadata((
      class: "מראה_מקום",
      entry: _as_string(body).trim(),
      ref: מקור,
      chars: none,
      printed: body,
    ))#_mk_label]
    link(מקור, body)
  }
}
#let livecite = _en(מקור_חי)

// מראה_מקומות — the sources cited in the document, collected and printed.
//
// Cheap by construction: the refs are already in the document, so this is a
// sort and a print (Girsa spec.md §10.4). Every citation that carried a `מקור:`
// appears once, in the order it was first cited.
// **`עמוד_חדש` is deliberately not offered here.**
//
// `#הערות_בסוף`, `#הערות_בסוף_צד` and `#הערות_מדורגות` take it and are measured
// starting a fresh page. This section and `#רשימת_סימונים` do not, and not for
// want of trying — four rounds, each one measured rather than reasoned:
//
//   1. the body written as a block around a context rather than as a context —
//      no change;
//   2. the early `return` replaced by a positive `if` — no change;
//   3. `pagebreak(weak: true)` made strong — no change here, though it turned
//      up a real finding about `#מעבר_עמוד`, which is weak and is therefore
//      dropped in front of any deferred section;
//   4. the break emitted outside the `context` — the document grows a second
//      page and the index still prints on the first. That is where the
//      evidence stops.
//
// A `panic` planted in `_ap_fresh_page` fires, so the break is built and does
// reach Typst. What becomes of it after that is not established, and three
// wrong explanations are enough. An argument that silently does nothing is the
// exact defect this product is named for, so the finding is written up rather
// than shipped.
#let מראה_מקומות(כותרת: none) = {
  context {
  let notes = _mk_of("מראה_מקום")
  if notes.len() > 0 {
  if כותרת != none { heading(level: 2, outlined: false, numbering: none, כותרת) }
  // A dictionary, not an array. `x in array` is a linear scan, so deduplicating
  // this way was quadratic in the number of citations in the sefer — and the
  // source index twenty lines below already does the same job with `by.at(...)`
  // in linear time. On a 300-page sefer with a few thousand מראי מקומות that is
  // the difference between a print and a wait.
  let seen = (:)
  for note in notes {
    let m = note.value
    let key = str(m.ref)
    if key in seen { continue }
    seen.insert(key, true)
    block(above: 0.4em, below: 0.4em)[#m.printed]
  }
}
}
}
#let sources = _en(מראה_מקומות)

// ============================================================
//  מפתחות · the indexes (ענינים and מקורות)
//
//  Two indexes, one mechanism. A mark drops an invisible `metadata` into the
//  flow; the index at the back queries every mark, asks each one which page it
//  landed on, and prints the collected result. Nothing is counted, nothing is
//  stored between passes, and the page numbers are therefore right by
//  construction — they are read off the finished layout rather than predicted.
//
//  What separates a real index from a list of words is entirely in the sorting
//  and the collapsing:
//
//    · ך sorts as כ, so סוף files under ס and not between י and ל.
//    · Consecutive pages collapse: 12, 13, 14 prints as 12–14.
//    · A masechta sorts where it sits in **Shas**, not in the alphabet. That is
//      the one thing no general-purpose indexer can do, and it comes from the
//      catalogue the engine generates above this prelude (`_ix_sefarim`).
// ============================================================

//  Both indexes collect through the one mark register above (`_mk_label`) and
//  filter by class. What is special about them is not the collecting — that is
//  the same query every class gets — but the *printing*: Shas order, gematria,
//  sub-entries, group headings. So `#רשימת_סימונים("ערך")` and `#מפתח_ענינים`
//  read the same marks and are both right, one as a plain list of pages and one
//  as an index.

// The letters, as numbers. Final forms carry their base value, because ת"ק is
// five hundred whichever way the kuf was typed.
#let _ix_gem = (
  "א": 1, "ב": 2, "ג": 3, "ד": 4, "ה": 5, "ו": 6, "ז": 7, "ח": 8, "ט": 9,
  "י": 10, "כ": 20, "ך": 20, "ל": 30, "מ": 40, "ם": 40, "נ": 50, "ן": 50,
  "ס": 60, "ע": 70, "פ": 80, "ף": 80, "צ": 90, "ץ": 90,
  "ק": 100, "ר": 200, "ש": 300, "ת": 400,
)
// Codepoints, not clusters — see `_ix_fold` below for why the difference is not
// academic. A pointed `בּ` is one *cluster* and two codepoints, and the table is
// keyed by the bare letter, so iterating clusters scored every pointed letter
// zero and a pointed abbreviation sorted as if it were worth nothing.
#let _ix_gematria(s) = {
  let n = 0
  for c in str(s).codepoints() { n += _ix_gem.at(c, default: 0) }
  n
}

// Final letters, folded to their base form for sorting only. The printed entry
// keeps whatever the writer wrote.
#let _ix_finals = ("ך": "כ", "ם": "מ", "ן": "נ", "ף": "פ", "ץ": "צ")

// The same folding the engine applied when it generated `_ix_sefarim`: nikud
// away, every gershayim spelling to one, runs of space collapsed.
//
// **Codepoints, not clusters.** This iterated `clusters()` and was wrong in a
// way nothing could see from inside Typst: a pointed letter is *one* grapheme
// cluster carrying its base letter and its nikud together, and
// `c.match(regex("[\u{0591}-\u{05C7}]"))` matches anywhere in the string it is
// given — so the whole cluster matched and `continue` threw the letter away
// with the point. `רֹאשׁ הַשָּׁנָה` folded to `א ה` and `שַׁבָּת` folded to the
// empty string, which does not merely fail to find the masechta: it makes every
// fully-pointed name collide with every other. Rust iterates `chars()` and
// never had it, which is precisely why three implementations of one rule need
// an oracle and not three careful readings. `tests/one_want.rs` now runs all
// three against `tests/fixtures/fold-cases.json`.
// Four characters in the points range separate words rather than decorating
// one, and this had **one** of them. `ראש־השנה` was fixed the day it was found;
// paseq ׀, sof pasuq ׃ and nun hafukha ׆ sit in the same range, do the same
// thing, and went on being deleted — so `בן׃איש` folded to `בןאיש`. The class
// was named in the comment above and the sweep never ran, which is the habit
// this whole file is being read for.
#let _ix_breaks = ("־", "-", "\u{05C0}", "\u{05C3}", "\u{05C6}")
#let _ix_gershayim = ("\u{05F4}", "\u{201C}", "\u{201D}", "\"")
// `\u{2018}` was missing here and in Rust, and present in `girsa-hebrew`: a name
// pasted from a word processor with a left curly quote folded differently from
// the same name with a right one.
#let _ix_geresh = ("\u{05F3}", "\u{2018}", "\u{2019}", "'")

#let _ix_fold(s) = {
  let out = ""
  let last_space = true
  for c in str(s).codepoints() {
    // Tested *before* the points range, because all four sit inside it —
    // matched there, ראש־השנה folds to ראשהשנה, which is nothing at all.
    if c in _ix_breaks or c.match(regex("\s")) != none {
      if not last_space { out += " " }
      last_space = true
      continue
    }
    if c.match(regex("[\u{0591}-\u{05C7}]")) != none { continue }
    if c in _ix_gershayim { out += "\"" }
    else if c in _ix_geresh { out += "'" }
    else { out += c }
    last_space = false
  }
  out.replace("''", "\"").trim()
}

// A term as it sorts: finals folded, points and marks dropped. Codepoints for
// the same reason as `_ix_fold` — on clusters, every pointed term sorted under
// the empty string, which is to say all of them sorted together at the top.
#let _ix_sortkey(s) = {
  let out = ""
  for c in str(s).codepoints() {
    if c.match(regex("[\u{0591}-\u{05C7}\u{05F3}\u{05F4}\"']")) != none { continue }
    out += _ix_finals.at(c, default: c)
  }
  lower(out.trim())
}

// A number as a fixed-width string, so that composite sort keys can be compared
// as text. Typst does not order arrays, and a two-stage sort would depend on
// `sorted` being stable — which it is not documented to be.
#let _ix_pad(n, width: 6) = {
  let s = str(calc.max(n, 0))
  while s.len() < width { s = "0" + s }
  s
}

// ג. → (3, 0) · ג: → (3, 1) · 12b → (12, 1)
//
// The amud is a second sort key rather than part of the first, because ב: comes
// after ב. and before ג. — which is what a reader expects and what a plain
// string sort of "ב." and "ב:" happens not to give.
#let _ix_place_key(place) = {
  let s = str(place)
  let amud = if s.contains(":") or s.contains("ע\"ב") or s.contains("ע״ב") or s.ends-with("b") { 1 } else { 0 }
  let clean = s
  for junk in ("ע״א", "ע״ב", "ע\"א", "ע\"ב", "דף", ".", ":", "״", "\"", "׳", "'", " ", "a", "b") {
    clean = clean.replace(junk, "")
  }
  let digits = clean.matches(regex("[0-9]+"))
  let n = if digits.len() > 0 { int(digits.first().text) } else { _ix_gematria(clean) }
  _ix_pad(n) + str(amud)
}

// The pages a set of marks landed on: deduplicated, in order, consecutive runs
// written as ranges.
//
// The number is formatted with **the numbering in force at that location**, so a
// sefer numbered א,ב,ג gets a Hebrew index and one numbered 1,2,3 gets an Arabic
// one, with nothing to configure. `page-numbering()` is what makes that possible
// — and it can be `none`, on a document with page numbers switched off, where
// the bare number is still the honest answer.
#let _ix_pages(locs) = {
  let nums = ()
  let shown = (:)
  for l in locs {
    let p = counter(page).at(l).first()
    if p in nums { continue }
    nums.push(p)
    let pat = l.page-numbering()
    shown.insert(str(p), if pat == none { str(p) } else { numbering(pat, p) })
  }
  nums = nums.sorted()
  let disp(n) = shown.at(str(n))
  let out = ()
  let i = 0
  while i < nums.len() {
    let j = i
    while j + 1 < nums.len() and nums.at(j + 1) == nums.at(j) + 1 { j += 1 }
    if j > i {
      out.push(disp(nums.at(i)) + "–" + disp(nums.at(j)))
    } else {
      out.push(disp(nums.at(i)))
    }
    i = j + 1
  }
  out.join(", ")
}

// ------------------------------------------------------------ מפתח ענינים
//
// ערך — mark this spot as belonging to a topic.
//
// The body is optional and is the ordinary case: `#ערך("שבת")[מלאכת בורר]`
// marks the phrase *and prints it*, so the writer does not type the words twice.
// With no body the mark is invisible, which is what you want when the topic is
// discussed but never named in those words.
//
// Taken through `..שאר` rather than as a defaulted parameter, because Typst has
// no optional *positional* argument: a parameter with a default is named-only,
// and a trailing `[…]` block is always positional. Writing `טקסט: none` made
// `#ערך("שבת")[מלאכת בורר]` fail with "unexpected argument" — pointing at a
// bracket the writer had every right to type.
#let ערך(מונח, תת: none, ..שאר) = {
  let body = שאר.pos()
  _mk_mark(
    "ערך",
    מונח,
    if body.len() > 0 { body.first() } else { none },
    שאר.named(),
    extra: (sub: if תת == none { "" } else { _as_string(תת).trim() }),
  )
}
#let indexentry = _en(ערך)

#let _ix_entry_line(name, locs, indent: 0em) = block(
  above: 0.25em, below: 0.25em, inset: (right: indent),
  [#name #h(0.4em) #text(fill: luma(60), _ix_pages(locs))],
)

#let מפתח_ענינים(כותרת: [מפתח הענינים], טורים: 2, גודל: 0.9em) = context {
  let marks = _mk_of("ערך")
  if marks.len() == 0 { return }
  if כותרת != none { heading(level: 1, numbering: none, כותרת) }
  // Gather first, print second. A term's pages are spread through the document
  // and its sub-entries are interleaved with everything else's, so there is no
  // way to print in one pass without the entries coming out in citation order —
  // which is precisely not an index.
  let groups = (:)
  for m in marks {
    let v = m.value
    let g = groups.at(v.entry, default: (locs: (), subs: (:)))
    if v.sub == "" {
      g.locs.push(m.location())
    } else {
      let sl = g.subs.at(v.sub, default: ())
      sl.push(m.location())
      g.subs.insert(v.sub, sl)
    }
    groups.insert(v.entry, g)
  }
  let body = {
    set text(size: גודל)
    for term in groups.keys().sorted(key: _ix_sortkey) {
      let g = groups.at(term)
      // A term with only sub-entries prints as a bare heading over them rather
      // than as an entry with no pages after it.
      if g.locs.len() > 0 {
        _ix_entry_line(strong(term), g.locs)
      } else {
        block(above: 0.25em, below: 0.25em, strong(term))
      }
      for sub in g.subs.keys().sorted(key: _ix_sortkey) {
        _ix_entry_line(sub, g.subs.at(sub), indent: 1.2em)
      }
    }
  }
  if טורים > 1 { columns(טורים, body) } else { body }
}
#let topicindex = _en(מפתח_ענינים, extra: (columns: "טורים"))

// ------------------------------------------------------------ מפתח מקורות
//
// ציון_מקור — cite a sefer, printed here and filed in the source index.
//
// The sefer name is normalised through the generated catalogue, so ב״ב and
// בבא בתרא are one entry in the index however the writer typed them on any
// given page — which is the whole reason a hand-built מפתח מקורות is wrong: the
// same masechta appears three times under three spellings.
// The optional body overrides the printed form, and rides `..שאר` for the same
// reason as `ערך` above: a trailing `[…]` is positional and Typst has no
// optional positional parameter.
//
// `סוגריים` is no longer a parameter of its own: it is one of the mark
// register's knobs, so `#הגדרות_סימונים(סוגריים: ("ציון_מקור": true))` can put
// every citation in brackets and one citation can still say otherwise. Same
// spelling, same meaning, one implementation.
//
// The class's styling applies to whichever form prints, including an explicit
// body. It did not before — an overridden body escaped the italic that the
// generated form has always had — and the inconsistency was invisible precisely
// because it only showed on the citations a writer had already taken by hand.
#let ציון_מקור(ספר, מקום: none, ..שאר) = {
  let e = _ix_sefarim.at(_ix_fold(ספר), default: none)
  let canon = if e == none { str(ספר).trim() } else { e.שם }
  let place = if מקום == none { "" } else { str(מקום).trim() }
  let own = שאר.pos()
  let printed = if own.len() > 0 { own.first() } else {
    // The writer's own spelling is *not* what prints. Somebody who wrote ב״ב in
    // one place and בבא בתרא in another gets one spelling throughout, which is
    // the copy-editing pass nobody has time for.
    //
    // The **place** is drawn as a part of its own: `ברכות ב.` is a sefer and a
    // daf, and a sefer set in small caps with the daf plain is one setting away
    // rather than impossible. A writer who passed their own text gets exactly
    // that text, parts and all — it is theirs.
    if place == "" { canon } else {
      [#canon #context _mk_piece("ציון_מקור", "מקום", place)]
    }
  }
  _mk_mark(
    "ציון_מקור",
    canon + if place != "" { " " + place } else { "" },
    printed,
    שאר.named(),
    // The entry and the sefer are two different answers and both are wanted: a
    // plain list wants "ברכות ב." and the index wants every daf of ברכות filed
    // under one heading.
    extra: (
      sefer: canon,
      sub: place,
      order: if e == none { 9000 } else { e.סדר },
      kind: if e == none { "other" } else { e.סוג },
    ),
  )
}
#let sourceref = _en(ציון_מקור)

#let מפתח_מקורות(כותרת: [מפתח המקורות], קבוצות: true, טורים: 2, גודל: 0.9em) = context {
  let marks = _mk_of("ציון_מקור")
  if marks.len() == 0 { return }
  if כותרת != none { heading(level: 1, numbering: none, כותרת) }
  let by = (:)
  for m in marks {
    let v = m.value
    let g = by.at(v.sefer, default: (order: v.order, kind: v.kind, places: (:)))
    let pl = g.places.at(v.sub, default: ())
    pl.push(m.location())
    g.places.insert(v.sub, pl)
    by.insert(v.sefer, g)
  }
  // Shas order first, then the alphabet for anything sharing a rank — which is
  // every sefer the catalogue has never heard of, all of them at rank 9000.
  let names = by.keys().sorted(key: n => _ix_pad(by.at(n).order) + "|" + _ix_sortkey(n))
  let body = {
    set text(size: גודל)
    let last_kind = none
    for name in names {
      let g = by.at(name)
      if קבוצות and g.kind != last_kind {
        last_kind = g.kind
        let title = _ix_kind_titles.at(g.kind, default: "שאר המקורות")
        block(above: 0.9em, below: 0.35em, text(weight: "bold", fill: luma(80), smallcaps(title)))
      }
      // A citation with no place at all (the sefer as a whole) prints its pages
      // against the name; one with places lists them under it.
      let bare = g.places.at("", default: ())
      if bare.len() > 0 {
        _ix_entry_line(strong(name), bare)
      } else {
        block(above: 0.25em, below: 0.1em, strong(name))
      }
      let places = g.places.keys().filter(p => p != "").sorted(key: _ix_place_key)
      for p in places {
        _ix_entry_line(p, g.places.at(p), indent: 1.2em)
      }
    }
  }
  if טורים > 1 { columns(טורים, body) } else { body }
}
#let sourceindex = _en(מפתח_מקורות, extra: (columns: "טורים"))

// ציון — an inline reference in small gray text, e.g. (רמב״ם הל׳ תפילין)
#let ציון(body, ..opts) = _mk_mark("ציון", body, body, opts.named())

// דיבור_המתחיל — a bolded lemma opening a comment, "ד״ה ..."
//
// The one the argument for this whole mechanism was made about: *"if not, it is
// just bold."* It is still bold — `משקל: "bold"` is the class default — and it
// is now also gathered, restyled as a set, and exemptible one at a time.
#let דיבור_המתחיל(body, ..opts) = _mk_mark("דיבור_המתחיל", body, body, opts.named())

// גמרא — format a Talmudic reference, e.g. #גמרא("ברכות", "ב.")
// The masechta and the daf are set separately — a sefer that prints מסכתות in
// small caps and dapim plain is asking for two settings, and the reference as a
// whole still takes the class's.
#let גמרא(מסכת, דף, ..opts) = _mk_mark(
  "גמרא",
  _as_string(מסכת).trim() + " " + _as_string(דף).trim(),
  [#context _mk_piece("גמרא", "מסכת", מסכת) #context _mk_piece("גמרא", "דף", דף)],
  opts.named(),
)

// רשימת_סימונים — every mark of one class, with the pages it landed on.
//
// The generalisation of `#מפתח_ענינים` and `#מפתח_מקורות`: one printer over a
// class of marks rather than a bespoke command per mark. Those two stay, because
// what is special about them is the *sorting* — Shas order, gematria, group
// headings, sub-entries — and none of that generalises to a class of lemmas. The
// collecting does, and is now shared.
//
// Order of first appearance by default, which for a `#דיבור_המתחיל` or a `#סימן`
// is the order of the sefer and the only order that means anything. `מיון: true`
// sorts alphabetically instead, by the same Hebrew sort key the indexes use.
/// The title one class's list gets when the writer does not give it one.
///
/// A function and not an inline `if`, so the guard below stays the one-line
/// `if כותרת != none { heading(…) }` shape that every self-titling collector in
/// this prelude uses. `test/spans.test.mjs` derives which commands print headings
/// by reading this file, and it recognises a collector that titles itself by that
/// guard — a nested brace inside it made this command look like a heading
/// producer, which would have greyed `#רשימת_סימונים` inside every heading.
#let _mk_head(cls, כותרת) = if כותרת == auto {
  _mk_titles.at(cls, default: "רשימת הסימונים")
} else { כותרת }

// No `עמוד_חדש` here either — see the note on `מראה_מקומות`.
#let רשימת_סימונים(סוג, כותרת: auto, טורים: 1, גודל: 0.9em, מיון: false) = {
  context {
  let cls = _val(_as_string(סוג).trim())
  let marks = _mk_of(cls)
  if marks.len() > 0 {
  if כותרת != none { heading(level: 1, numbering: none, _mk_head(cls, כותרת)) }
  let by = (:)
  let order = ()
  for m in marks {
    let e = m.value.entry
    if e == "" { continue }
    let locs = by.at(e, default: none)
    if locs == none { order.push(e); locs = () }
    locs.push(m.location())
    by.insert(e, locs)
  }
  let names = if מיון { order.sorted(key: _ix_sortkey) } else { order }
  let body = {
    set text(size: גודל)
    for e in names { _ix_entry_line(e, by.at(e)) }
  }
  if טורים > 1 { columns(טורים, body) } else { body }
}
}
}
#let marklist = _en(רשימת_סימונים, extra: (columns: "טורים"))

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
#let commentary = _en(עם_פירוש)

// ============================================================
//  סקירה · review: tracked changes and editorial comments
// ------------------------------------------------------------
//  Anyone editing someone else's kisvei yad needs to show what they changed
//  rather than silently changing it. Three marks:
//
//    #הוספה[…]       text this reviewer added
//    #מחיקה[…]       text this reviewer wants removed (kept, struck through)
//    #הערת_עורך[…]   a comment on the text, not part of it
//
//  and one switch over how the document is displayed:
//
//    #הגדרות_סקירה(תצוגה: "סימון" | "סופי" | "מקורי")
//
//  "סימון" (the default) shows the marks; "סופי" shows the document as it would
//  read if every change were accepted; "מקורי" as it read before any of them.
//  Accepting and rejecting *individually* is an editing operation, not a
//  rendering one — the app's review panel does it by rewriting the source, which
//  is the only way the decision survives into the file.
//
//  A comment rides the sidenote engine (#הערת_גיליון), so it lands beside the
//  line it belongs to and stacks without colliding; outside a side-column
//  section that engine falls back to a real footnote, so a comment is never
//  placed off the paper.
// ============================================================
#let _rv_defaults = (
  תצוגה: "סימון",              // "סימון" · "סופי" · "מקורי"
  שמות: true,                   // print the reviewer's name on a comment
)
#let _rv_cfg = state("ksav-rv-cfg", _rv_defaults)

/// The three colour names this switch used to own, and the class each belongs to.
///
/// Kept because documents say them, routed because they should never have been a
/// second authority. `#הגדרות_סקירה(צבע_מחיקה: red)` and
/// `#הגדרות_מחיקה(צבע: red)` are one setting written two ways now, rather than
/// two settings that agreed until somebody used both.
#let _rv_colours = (צבע_הוספה: "הוספה", צבע_מחיקה: "מחיקה", צבע_הערה: "הערת_עורך")

#let הגדרות_סקירה(..opts) = {
  let named = opts.named()
  let mine = (:)
  for (k, v) in named {
    if k in _rv_colours { _mk_set(_rv_colours.at(k), (צבע: v)) } else { mine.insert(k, v) }
  }
  _rv_cfg.update(c => { let d = c; for (k, v) in mine { d.insert(k, v) }; d })
}
#let _rv_mode(c) = _val(c.at("תצוגה", default: "סימון"))
#let _rv_by(c, מאת) = if מאת != none and c.at("שמות", default: true) {
  text(size: 0.8em, fill: luma(110), [ ‏(#מאת)])
} else { none }

// הוספה — text the reviewer added.
//
// The three marks below take their look from the register, like every other
// command that draws something. What they keep of their own is the *view*: an
// insertion is absent from the original, a deletion is absent from the final,
// and neither of those is a style — they are what the mark means.
#let הוספה(body, מאת: none, ..opts) = {
  let (own, rest) = _cfg_split(opts.named(), _mk_own_keys)
  _cfg_strict("הוספה", rest)
  context {
    let c = _rv_cfg.get()
    let m = _rv_mode(c)
    if m == "מקורי" {
      // It was not there before this review, so the "original" view has none of it.
    } else if m == "סופי" {
      body
    } else {
      // **`מאת` was a parameter this command accepted and never used.** It is
      // declared here, it is documented, `#הגדרות_סקירה(שמות:)` exists to switch
      // it on and off, and `_rv_by` — which renders it — was called from
      // `#הערת_עורך` and from nowhere else. So the reviewer's name printed on a
      // comment and vanished on an insertion, and the switch for it did nothing
      // in two of the three places it claims to govern.
      //
      // Only in the marks view, like everything else about a tracked change: an
      // accepted insertion is the author's own text and carries nobody's name.
      _mk_render(_mk_conf("הוספה", own), body)
      _rv_by(c, מאת)
    }
  }
}

// מחיקה — text the reviewer wants removed. Struck through, not gone: the point
// of a tracked deletion is that the author can still read what would go.
#let מחיקה(body, מאת: none, ..opts) = {
  let (own, rest) = _cfg_split(opts.named(), _mk_own_keys)
  _cfg_strict("מחיקה", rest)
  context {
    let c = _rv_cfg.get()
    let m = _rv_mode(c)
    if m == "סופי" {
      // Accepted, the text is gone.
    } else if m == "מקורי" {
      body
    } else {
      // The reviewer's name, for the reason given on `#הוספה`.
      _mk_render(_mk_conf("מחיקה", own), body)
      _rv_by(c, מאת)
    }
  }
}

// הערת_עורך — a comment ABOUT the text. Never part of the document, so it shows
// only in the markup view.
#let הערת_עורך(body, מאת: none, ..opts) = {
  let (own, rest) = _cfg_split(opts.named(), _mk_own_keys)
  _cfg_strict("הערת_עורך", rest)
  context {
    let c = _rv_cfg.get()
    if _rv_mode(c) == "סימון" {
      let look = _mk_conf("הערת_עורך", own)
      // The pencil is drawn by `_sn_mark_of("עורך", …)`, which the page calls
      // when it draws the column and this call site calls for the marker in the
      // running text. It used to be a closure passed in here, and a closure
      // cannot travel in a note's metadata — so a comment collected but was
      // never drawn once the column moved to the page. `own` travels instead,
      // which is what carries the comment's colour to its pencil.
      _sn_note("ksav-rv", "חוץ", "עורך", _mk_render(look, { body; _rv_by(c, מאת) }), own: own)
    }
  }
}

#let הגדרות_הוספה(..opts) = _mk_set("הוספה", opts.named())
#let הגדרות_מחיקה(..opts) = _mk_set("מחיקה", opts.named())
#let הגדרות_הערת_עורך(..opts) = _mk_set("הערת_עורך", opts.named())

#let review_config = _en(הגדרות_סקירה)
#let inserted = _en(הוספה)
#let deleted = _en(מחיקה)
#let comment_ = _en(הערת_עורך)
#let inserted_config = _en(הגדרות_הוספה)
#let deleted_config = _en(הגדרות_מחיקה)
#let comment_config = _en(הגדרות_הערת_עורך)

// ============================================================
//  מקטע עמוד · section-level page setup
// ------------------------------------------------------------
//  Header, footer, columns, margins, orientation, paper, page numbering, a page
//  border and a watermark — for ONE section rather than the whole document.
//  Wrap the section: #מקטע_עמוד(טורים: 2, סימן_מים: "טיוטה")[ … ].
//
//  A section starts on a fresh page and the following text starts on another:
//  that is what per-section page setup means, and Typst's own `page` function —
//  which this is — works the same way.
// ============================================================
#let מקטע_עמוד(
  body,
  כותרת_עליונה: none,
  כותרת_תחתונה: none,
  טורים: none,
  שוליים: none,
  נייר: none,
  לרוחב: none,
  מספור: none,
  מסגרת: none,
  סימן_מים: none,
) = {
  let a = (:)
  if נייר != none { a.insert("paper", נייר) }
  if לרוחב != none { a.insert("flipped", לרוחב) }
  if שוליים != none { a.insert("margin", שוליים) }
  if טורים != none { a.insert("columns", טורים) }
  if מספור != none { a.insert("numbering", מספור) }
  if כותרת_עליונה != none {
    a.insert("header", align(center, text(size: 0.85em, fill: luma(100), כותרת_עליונה)))
  }
  // A footer is given when asked for one, and also when this section numbers its
  // pages differently: the document wrapper draws the page number itself, so a
  // bare `numbering:` would otherwise be overruled by the wrapper's own footer.
  if כותרת_תחתונה != none {
    a.insert("footer", align(center, text(size: 0.85em, fill: luma(100), כותרת_תחתונה)))
  } else if מספור != none {
    a.insert("footer", context align(center, text(
      size: 0.85em, fill: luma(100), numbering(מספור, ..counter(page).get()),
    )))
  }
  if מסגרת != none or סימן_מים != none {
    let stroke_ = if מסגרת == true { 0.8pt + luma(120) } else { מסגרת }
    a.insert("background", {
      if מסגרת != none { place(rect(width: 100%, height: 100%, stroke: stroke_)) }
      if סימן_מים != none {
        place(center + horizon, rotate(-30deg, text(
          size: 64pt, weight: "bold", fill: luma(200).transparentize(35%), סימן_מים,
        )))
      }
    })
  }
  page(..a, body)
}
#let page_section = _en(מקטע_עמוד, extra: (columns: "טורים"))

// ============================================================
//  נוסחאות · mathematics
// ------------------------------------------------------------
//  Typst's math is written in its own notation ("x^2 + sqrt(y) = sum_(i=1)^n"),
//  which is what these take as a STRING and evaluate. Passing it as a string —
//  rather than exposing Typst's `$…$` — keeps a formula from colliding with the
//  Hebrew text around it, and lets the editor treat it as one object.
//
//  Mathematics is written left-to-right in every language, Hebrew included, so
//  both wrap the equation in an LTR run.
// ============================================================
// A formula written either way — `#נוסחה[x^2]` or `#נוסחה("x^2")`.
//
// It used to take a string only, which made it **the one command in the whole
// registry that breaks the bracket convention**: every command in the README's core
// idea is `#הדגשה[טקסט]`, `#כותרת1[…]`, `#רשימה[…]`, `#הערה[…]`, and this one
// answered `#נוסחה[x^2 + y^2 = z^2]` with *"expected string, found content"*. The
// toolbar and the palette insert the correct form, so it only ever bit the writer
// who **types** — which is the writer this markup language exists for.
//
// `_as_string` is the shared flattener; see its note near the top.
// Both take a look of their own, and they take it separately. A displayed
// formula and one set inside a sentence are two commands and two decisions: a
// sefer that wants its displayed equations a shade smaller than the prose is
// not saying anything about the `x` in the middle of a line, and the sizes that
// would read well are not the same size.
//
// `dir: ltr` is not a knob and is not negotiable — mathematics is written left
// to right in a right-to-left document, which is what this wrapper is for.
#let נוסחה(תוכן, ממוספרת: false, ..opts) = context {
  let (own, rest) = _cfg_split(opts.named(), _mk_own_keys)
  _cfg_strict("נוסחה", rest)
  text(dir: ltr, _mk_render(_mk_conf("נוסחה", own), math.equation(
    block: true,
    numbering: if ממוספרת { "(1)" } else { none },
    eval(_as_string(תוכן), mode: "math"),
  )))
}
#let נוסחה_בשורה(תוכן, ..opts) = context {
  let (own, rest) = _cfg_split(opts.named(), _mk_own_keys)
  _cfg_strict("נוסחה_בשורה", rest)
  text(
    dir: ltr,
    _mk_render(
      _mk_conf("נוסחה_בשורה", own),
      math.equation(block: false, eval(_as_string(תוכן), mode: "math")),
    ),
  )
}
#let הגדרות_נוסחה(..opts) = _mk_set("נוסחה", opts.named())
#let formula_config = _en(הגדרות_נוסחה)
#let הגדרות_נוסחה_בשורה(..opts) = _mk_set("נוסחה_בשורה", opts.named())
#let iformula_config = _en(הגדרות_נוסחה_בשורה)
#let formula = _en(נוסחה)
#let iformula = נוסחה_בשורה

#let siman = סימן
#let seif = סעיף
// `os`, which is what the command is: the Hebrew is אות, "a letter". Its English
// name was `osource`, which reads as *other source* and has nothing to do with
// this — it marks a letter, not a citation. The family it belongs to is spelt by
// transliteration for exactly this reason: `siman`, `seif`, `dh`.
#let os = אות
// The old name, kept so that no document written against it stops compiling.
// Superseded rather than removed, which is what the two note tombstones already
// do — a sefer somebody wrote last month is not a mistake to be corrected.
#let osource = אות
// The four collectable marks take named arguments now — their own styling, and
// whether they take the class's — so their English spellings have to translate
// those names like every other `_en` alias. A plain binding here would leave
// `#gemara("ברכות", "ב.", colour: red)` stopping the compile on a parameter the
// Hebrew command accepts, which is the whole complaint `_en` exists to answer.
#let verse = _en(פסוק)
#let sourcenote = _en(מראה_מקום)
#let refmark = _en(ציון)
#let dh = _en(דיבור_המתחיל)
#let gemara = _en(גמרא)


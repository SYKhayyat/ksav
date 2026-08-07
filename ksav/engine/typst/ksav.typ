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
  weight: "משקל", paper: "נייר", margin: "שוליים", lang: "שפה", dir: "כיוון",
  landscape: "לרוחב", watermark: "סימן_מים", header: "כותרת_עליונה",
  footer: "כותרת_תחתונה", numbering: "מספור", hebrew_numbering: "מספור_עברי",
  justify: "יישור", leading: "ריווח_שורות", para_spacing: "ריווח_פסקאות",
  first_indent: "הזחה_ראשונה", columns: "עמודות", notes_region: "אזור_הערות",
  // structure
  level: "רמה", title: "כותרת", titles: "כותרות", names: "שמות", by: "מאת",
  caption: "כיתוב", width: "רוחב", ratio: "יחס", amount: "מידה",
  indent: "הזחה", body_indent: "הזחת_גוף", tight: "הידוק", marker: "סמן",
  style: "סגנון", labels: "תוויות", layout: "פריסה", display: "תצוגה",
  heights: "גבהים", frame: "מסגרת", note: "הערה", numbered: "ממוספרת",
  // notes and streams
  stream: "זרם", streams: "זרמים", tint: "גוון", rule: "קו",
  kind: "סוג", name: "שם",
  // spacing, in the several senses the prelude distinguishes
  spacing: "ריווח", inset: "מרווח", item_spacing: "ריווח_פריט",
  space_between: "ריווח_בין", space_before: "ריווח_לפני",
  space_after: "ריווח_אחרי", number_spacing: "ריווח_מספור",
  note_spacing: "ריווח_הערות", rule_between: "קו_בין",
  tracking: "מרווח_אותיות", underline: "קו_תחתון", smallcaps: "רברבתי",
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
  // מספור — none = ONE running native sequence across every tier (1,2,3,4,…), so
  //   the numbers never jump and never repeat. Or an array of per-tier schemes,
  //   ("1", "א", "i"), and then each tier counts its own and the marker's *shape*
  //   tells the reader which block to look in — the one thing size and slant
  //   cannot say at the point of reference, where the reader actually is.
  מספור: none,
)
#let _fn_cfg = state("ksav-fn-cfg", _fn_defaults)
// #הגדרות_הערות(סגנון: ("normal","italic","normal"), הזחה: (0em,1em,2em), ריווח: 1em, …)
#let הגדרות_הערות(..opts) = _fn_cfg.update(c => {
  let d = c
  for (k, v) in opts.named() { d.insert(k, v) }
  d
})
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
#let _as_string(x) = {
  if type(x) == str { x } else if type(x) == content {
    if x.has("text") {
      x.text
    } else if x.has("children") {
      x.children.map(_as_string).join("")
    } else if x == [ ] {
      " "
    } else {
      ""
    }
  } else {
    str(x)
  }
}

#let _fn_pick(arr, i, fb) = if type(arr) == array and i >= 1 and i - 1 < arr.len() { arr.at(i - 1) } else { fb }

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
#let _ksav_is_real(e) = {
  let l = e.location()
  query(selector(_ksav_ap0).before(l)).len() == query(selector(_ksav_ap1).before(l)).len()
}
#let _ksav_real(elems) = elems.filter(_ksav_is_real)
// How many elements matching `sel` (that are real, not apparatus re-displays)
// run from the start of the scope up to and including the caller. Document order,
// via `.before()` — coordinates cannot be used, because several notes can sit on
// one line and would then all count each other.
#let _ksav_rank(sel, loc, pred) = calc.max(
  _ksav_real(query(selector(sel).before(loc))).filter(pred).len(),
  1,
)
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
#let _fn_wrap(cfg, tier, body) = {
  let sz = _fn_pick(cfg.at("גודל", default: ()), tier, 0.85em)
  let st = _fn_pick(cfg.at("סגנון", default: ()), tier, "normal")
  let cl = _fn_pick(cfg.at("צבע", default: ()), tier, luma(0))
  // Tier 1 is an ordinary footnote, and since #הערה now *is* tier 1 it has to
  // stay byte-identical to one: a text() wrapper forcing "normal" and black
  // would quietly strip a slant or a colour the surrounding document had set.
  if sz == 1em and st == "normal" and cl == luma(0) { body } else {
    text(size: sz, style: st, fill: cl, body)
  }
}

// הערה_בדרגה(דרגה, body) — a note in tier `דרגה` (1 = a note on the text, 2 = a note
// ON a tier-1 note, …). Nest freely: #הערה_א[… #הערה_ב[… #הערה_ג[…]]].
#let הערה_בדרגה(דרגה, body) = context {
  let cfg = _fn_cfg.get()
  let ind = _fn_pick(cfg.at("הזחה", default: ()), דרגה, 0em)
  let lbls = cfg.at("תוויות", default: none)
  let lbl = if type(lbls) == array { _fn_pick(lbls, דרגה, none) } else { none }
  // The tier indent must be INLINE (#h), never a block-level `pad`: a footnote
  // entry lays out as "«number» «body»", so wrapping the body in a block pushes
  // it onto the line below and orphans the number on a line of its own. #h keeps
  // the number and the first words of the note together, which is the whole
  // point of the entry.
  let entry = _fn_wrap(cfg, דרגה, {
    if ind != 0em { h(ind) }
    if lbl != none and lbl != "" { [#strong(lbl) ] }
    body
  })
  let schemes = cfg.at("מספור", default: none)
  if type(schemes) != array {
    footnote(entry)
  } else {
    // Per-tier numbering. Typst has ONE footnote counter, and the `numbering`
    // callback is handed that counter's value — so it cannot be used to count a
    // tier. The number is instead this note's *rank among the real notes of its
    // own tier*, read out of a query, exactly as the collect-then-render
    // apparatus does it; the callback then ignores the argument it was given.
    // Read-only, so it converges, and `_ksav_real` keeps a body that an
    // apparatus re-displays from being counted twice.
    [#metadata(דרגה)#label("ksav-fnt")]
    context {
      let loc = here()
      let n = _ksav_rank(selector(label("ksav-fnt")), loc, e => e.value == דרגה)
      let scheme = _fn_pick(schemes, דרגה, "1")
      footnote(numbering: _ => numbering(scheme, n), entry)
    }
  }
}

// tier aliases — Hebrew letters mirror the "block A / block B / block C" model
#let הערה_א(body) = הערה_בדרגה(1, body)
#let הערה_ב(body) = הערה_בדרגה(2, body)
#let הערה_ג(body) = הערה_בדרגה(3, body)
#let הערה_ד(body) = הערה_בדרגה(4, body)
#let הערה_ה(body) = הערה_בדרגה(5, body)
#let הערה_ו(body) = הערה_בדרגה(6, body)
#let הערה_ז(body) = הערה_בדרגה(7, body)
#let tier = הערה_בדרגה
#let tier1 = הערה_א
#let tier2 = הערה_ב
#let tier3 = הערה_ג
#let tier4 = הערה_ד
#let tier5 = הערה_ה
#let tier6 = הערה_ו
#let tier7 = הערה_ז

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
#let _ap_mark(cfg, g, num) = numbering(_ap_pick(cfg, "מספור", g, "1"), num)
#let _ap_wrap(cfg, g, body) = text(
  size: _ap_pick(cfg, "גודל", g, 0.85em),
  style: _ap_pick(cfg, "סגנון", g, "normal"),
  fill: _ap_pick(cfg, "צבע", g, luma(0)),
  body,
)

// One banded note. Registers itself in the MAIN FLOW, where writes are legal;
// the footer that later renders it only ever queries, which is what makes a
// per-page apparatus converge at all.
//
//   cfg    — this apparatus's configuration, already read from its state
//   lbl    — the label every note of this apparatus carries
//   scope  — loc ⇒ the selector this note's number is counted within
//   g      — the group: a tier integer, or a stream name
#let _ap_note(cfg, lbl, scope, g, body) = {
  [#metadata((group: g, body: body))#lbl]
  // Force nested groups to register in this same pass, in a zero-size inline box
  // so it can never break the line the marker sits on — including when a band
  // re-displays this body and the machinery runs again inside it.
  box(place(hide(body)))
  // The marker's number is this note's rank among the *real* notes of its own
  // group in `scope` — read out of a query, never a counter, so it converges and
  // so an apparatus re-display cannot count itself.
  context {
    let loc = here()
    super(_ap_mark(cfg, g, _ksav_rank(scope(loc), loc, e => e.value.group == g)))
  }
}

// Every note of an apparatus that is a real note rather than an apparatus
// re-display (see `_ksav_real`).
#let _ap_all(lbl) = _ksav_real(query(lbl))

// Number one group's entries. An entry's number is its position among the notes
// of its own group *within the numbering scope*: `shown` is what this band
// prints (this page, or this section), `scope` is what it counts against (the
// whole document for the footer apparatuses, the section for the in-flow one).
// Returns (number, body) pairs in document order.
#let _ap_entries(shown, scope, g) = {
  let mine = scope.filter(e => e.value.group == g)
  shown
    .filter(e => e.value.group == g)
    .map(e => (mine.position(x => x.location() == e.location()) + 1, e.value.body))
}

// One group's block: the numbered entries, laid into columns and, if this
// apparatus reserves fixed regions, into a slot of a fixed height that it
// occupies whether or not it has anything in it this page.
//
// `lead` prints INSIDE the columns — a band's own small label belongs at the top
// of its first column. `above` prints outside them — a stream's title spans them.
#let _ap_group(cfg, g, entries, above: none, lead: none) = {
  above
  let inner = {
    lead
    for (num, body) in entries {
      block(
        spacing: cfg.at("ריווח_פריט", default: 0.3em),
        _ap_wrap(cfg, g, [#super(_ap_mark(cfg, g, num)) #body]),
      )
    }
  }
  let cols = _ap_pick(cfg, "טורים", g, 1)
  let filled = if cols > 1 { columns(cols, inner) } else { inner }
  let h = _ap_pick(cfg, "גבהים", g, none)
  if h != none { block(width: 100%, height: h, clip: true, filled) } else { filled }
}

// The apparatus block itself: the rule above it, the groups, and a short divider
// between adjacent ones. Bracketed by the open/close markers that tell
// `_ksav_real` a registration in here is a re-display and not a new note —
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
  תוויות: false,        // show a small "· tier ·" label above each band
)
#let _md_cfg = state("ksav-md-cfg", _md_defaults)
#let הגדרות_מדורגות(..opts) = _md_cfg.update(c => {
  let d = c
  for (k, v) in opts.named() { d.insert(k, v) }
  d
})
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
#let _md_section_notes(loc) = _ksav_real(query(_md_scope(loc)))

// מדור_בדרגה(דרגה, body) — collect a section-band note in tier `דרגה`.
#let מדור_בדרגה(דרגה, body) = context _ap_note(
  _md_cfg.get(), _md_label, _md_scope, דרגה, body,
)
// #הערות_מדורגות() — render this section's collected tiers as stacked bands, here.
// Call it once per section (and/or at the end of the document); each call renders
// only the notes written since the previous call.
#let הערות_מדורגות(כותרת: none) = {
  context {
    let notes = _md_section_notes(here())
    if notes.len() > 0 {
      let cfg = _md_cfg.get()
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
#let מדור_א(body) = מדור_בדרגה(1, body)
#let מדור_ב(body) = מדור_בדרגה(2, body)
#let מדור_ג(body) = מדור_בדרגה(3, body)
#let מדור_ד(body) = מדור_בדרגה(4, body)
#let מדור_ה(body) = מדור_בדרגה(5, body)
#let מדור_ו(body) = מדור_בדרגה(6, body)
#let מדור_ז(body) = מדור_בדרגה(7, body)
#let band = מדור_בדרגה
#let band1 = מדור_א
#let band2 = מדור_ב
#let band3 = מדור_ג
#let band4 = מדור_ד
#let band5 = מדור_ה
#let band6 = מדור_ו
#let band7 = מדור_ז
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
  גבהים: none,          // fixed per-tier band heights, e.g. (2cm, 1cm) — the
                        //   "fixed regions" layout: a band always occupies its
                        //   height, empty space stays empty, overflow is clipped.
                        //   none = each band takes exactly the height it needs.
)
#let _pp_cfg = state("ksav-pp-cfg", _pp_defaults)
#let הגדרות_מדפים(..opts) = _pp_cfg.update(c => {
  let d = c
  for (k, v) in opts.named() { d.insert(k, v) }
  d
})
#let _pp_label = label("ksav-pp")
// Every מדף note registered outside an apparatus block — i.e. the real ones.
#let _pp_all() = _ap_all(_pp_label)
// Numbered document-wide: a per-page band shows this page's notes but numbers
// them in one running sequence across the sefer, which is what a reader
// following a marker from the text expects.
#let _pp_scope(loc) = _pp_label
// מדף_בדרגה(דרגה, body) — collect a per-page-band note in tier `דרגה`.
#let מדף_בדרגה(דרגה, body) = context _ap_note(
  _pp_cfg.get(), _pp_label, _pp_scope, דרגה, body,
)
// Read-only footer: render the bands for the CURRENT page. Called from the
// wrapper's page footer. Renders nothing (and touches nothing) when the page
// has no per-page-band notes, so it's free for documents that don't use them.
#let _pp_page_bands() = context {
  let all = _pp_all()
  if all.len() > 0 {
    let cfg = _pp_cfg.get()
    let pg = here().page()
    let mine = all.filter(e => e.location().page() == pg)
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
      set align(if text.dir == rtl { right } else { left })
      block(width: 100%, _ap_bands(
        cfg,
        tiers,
        // Shows this page's notes; numbers them against the whole document.
        t => _ap_group(cfg, t, _ap_entries(mine, all, t)),
      ))
    }
  }
}
#let מדף_א(body) = מדף_בדרגה(1, body)
#let מדף_ב(body) = מדף_בדרגה(2, body)
#let מדף_ג(body) = מדף_בדרגה(3, body)
#let מדף_ד(body) = מדף_בדרגה(4, body)
#let מדף_ה(body) = מדף_בדרגה(5, body)
#let מדף_ו(body) = מדף_בדרגה(6, body)
#let מדף_ז(body) = מדף_בדרגה(7, body)
#let pageband = מדף_בדרגה
#let pageband1 = מדף_א
#let pageband2 = מדף_ב
#let pageband3 = מדף_ג
#let pageband4 = מדף_ד
#let pageband5 = מדף_ה
#let pageband6 = מדף_ו
#let pageband7 = מדף_ז
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
  גודל: 0.85em,
  סגנון: "normal",
  צבע: luma(20),
  קו: true,             // rule above the apparatus
  קו_בין: true,         // divider between stacked streams
  ריווח_בין: 0.45em,    // gap between streams
  ריווח_פריט: 0.22em,   // gap between entries in a stream
)
#let _sf_cfg = state("ksav-sf-cfg", _sf_defaults)
#let הגדרות_זרמים(..opts) = _sf_cfg.update(c => {
  let d = c
  for (k, v) in opts.named() { d.insert(k, v) }
  d
})
#let _sf_label = label("ksav-sf")
#let _sf_all() = _ap_all(_sf_label)
// Numbered document-wide, like the per-page bands: a stream is one running
// sequence across the sefer, independent of every other stream.
#let _sf_scope(loc) = _sf_label
// הערה_זרם(זרם, body) — a footnote in the named stream `זרם`. The group here is
// a name rather than a tier integer, which is the whole of the difference
// between this apparatus and the two banded ones.
#let הערה_זרם(זרם, body) = context _ap_note(
  _sf_cfg.get(), _sf_label, _sf_scope, _as_string(זרם), body,
)
// Ordered list of stream names actually present, honouring an explicit order.
#let _sf_order(cfg, present) = {
  let explicit = cfg.at("זרמים", default: none)
  if type(explicit) == array {
    explicit.filter(s => present.contains(s)) + present.filter(s => not explicit.contains(s))
  } else { present }
}
// Read-only footer: render every stream's notes for the current page.
#let _sf_page_streams() = context {
  let all = _sf_all()
  if all.len() > 0 {
    let cfg = _sf_cfg.get()
    let pg = here().page()
    let mine = all.filter(e => e.location().page() == pg)
    if mine.len() > 0 {
      let present = mine.map(e => e.value.group).dedup()
      // Fixed heights ⇒ fixed geometry: every stream that has a reserved slot is
      // laid out on every apparatus page, even with nothing in it this page, so
      // a stream never drifts into another's place.
      let fixed = cfg.at("גבהים", default: (:)).keys()
      let streams = _sf_order(cfg, present + fixed.filter(s => not present.contains(s)))
      set align(if text.dir == rtl { right } else { left })
      block(width: 100%, _ap_bands(
        cfg,
        streams,
        // A stream title spans the stream's columns, so it goes `above` them
        // rather than leading the first one.
        s => _ap_group(
          cfg,
          s,
          _ap_entries(mine, all, s),
          above: {
            let head = cfg.at("כותרות", default: (:)).at(s, default: none)
            if head != none {
              block(spacing: 0.2em, text(size: 0.72em, weight: "bold", fill: luma(90), head))
            }
          },
        ),
        divider: 30%,
        side: cfg.at("פריסה", default: "מוערם") == "צד",
      ))
    }
  }
}
#let הערת_תוכן(body) = הערה_זרם("תוכן", body)
#let הערת_מקור(body) = הערה_זרם("מקורות", body)
#let stream_note = הערה_זרם
#let contentnote = הערת_תוכן
#let sourcenote_stream = הערת_מקור
#let streams_config = _en(הגדרות_זרמים, extra: (columns: "טורים"))

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
)
#let _hd_cfg = state("ksav-hd-cfg", _hd_defaults)
#let הגדרות_כותרות(..opts) = _hd_cfg.update(c => { let d = c; for (k, v) in opts.named() { d.insert(k, v) }; d })
#let _hd_show(it) = context {
  // In HTML export, leave the heading alone: Typst turns a real heading into an
  // <h1>…<h6>, and replacing it with a styled block would emit a semantically
  // meaningless <div> — losing the document outline that makes the HTML worth
  // exporting in the first place. The page styling below is print styling.
  let c = _hd_cfg.get()
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
  let deep = calc.max(lvl - 6, 0)
  let styled = {
    set text(
      size: _cfg_pick(c, "גודל", lvl, 1em),
      weight: _cfg_pick(c, "משקל", lvl, "bold"),
      fill: _cfg_pick(c, "צבע", lvl, luma(0)),
      style: _cfg_pick(c, "סגנון", lvl, if deep > 0 { "italic" } else { "normal" }),
      tracking: c.at("מרווח_אותיות", default: 0pt),
    )
    let body = { num; it.body }
    if _cfg_pick(c, "רברבתי", lvl, false) { body = smallcaps(body) }
    if _cfg_pick(c, "קו_תחתון", lvl, false) { body = underline(body) }
    body
  }
  let al = _cfg_pick(c, "יישור", lvl, none)
  let head = if al != none { align(al, styled) } else { styled }
  // Past level 6, one step of indent per level. `pad` and not `h`, because a
  // heading is a block: an inline space would be swallowed at the start of it.
  let body = {
    head
    if _cfg_pick(c, "קו", lvl, false) { v(0.25em); line(length: 100%, stroke: 0.5pt + luma(160)) }
  }
  block(
    above: _cfg_pick(c, "ריווח_לפני", lvl, 1em),
    below: _cfg_pick(c, "ריווח_אחרי", lvl, 0.6em),
    // Padded on the *start* side, which is the right in Hebrew. `pad` takes
    // physical sides only, so the direction has to be asked for: `pad(left:)` on
    // an RTL page indents from the far edge, which moves nothing visible and
    // looks exactly like the feature not working. It did, for one round.
    if deep == 0 { body } else if text.dir == rtl {
      pad(right: deep * 1em, body)
    } else {
      pad(left: deep * 1em, body)
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
  יישור: true,
  מספור: true,
  מספור_עברי: false,
  נייר: "a4",
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
  body,
) = {
  let np = if מספור_עברי { "א" } else { "1" }
  let reserve = if אזור_הערות == none { 0pt } else { אזור_הערות }
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
  let has_head = כותרת_עליונה != none or כותרת_זוגי != none or כותרת_אי_זוגי != none
  let has_foot = כותרת_תחתונה != none or תחתונה_זוגי != none or תחתונה_אי_זוגי != none
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
  set text(font: גופן, size: גודל, lang: שפה, dir: כיוון)
  set page(
    paper: נייר,
    binding: if bind_right { right } else { left },
    margin: if דו_צדדי {
      (top: m_top, inside: m_in, outside: m_out, bottom: m_bot + reserve)
    } else if bind_right {
      (top: m_top, right: m_in, left: m_out, bottom: m_bot + reserve)
    } else {
      (top: m_top, left: m_in, right: m_out, bottom: m_bot + reserve)
    },
    numbering: if מספור { np } else { none },
    header: if has_head {
      context {
        let p = here().page()
        let line = _rc_head(p, כותרת_זוגי, כותרת_אי_זוגי, כותרת_עליונה)
        if line != none {
          align(head_align(p), text(size: 0.85em, fill: luma(100), line))
        }
      }
    } else { auto },
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
          _pp_page_bands()
          _sf_page_streams()
        })
      } else {
        _pp_page_bands()
        _sf_page_streams()
      }
      context {
        let p = here().page()
        let custom = if has_foot { _rc_head(p, תחתונה_זוגי, תחתונה_אי_זוגי, כותרת_תחתונה) } else { none }
        let ln = if custom != none {
          text(size: 0.85em, fill: luma(100), custom)
        } else if מספור {
          text(size: 0.85em, fill: luma(100), numbering(np, ..counter(page).get()))
        } else { none }
        if ln != none { align(head_align(p), ln) }
      }
    },
  )
  set par(justify: יישור, leading: ריווח_שורות, spacing: ריווח_פסקאות, first-line-indent: הזחה_ראשונה)
  // Space footnote entries apart so each note — including a note-on-a-note that
  // Typst hoists into its own entry — reads as a separate block, not one run-on list.
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
}
#let document = _en(מסמך, extra: (columns: "טורים", table_columns: "עמודות"))

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
#let rashi = כתב_רשי

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
#let גופן_שונה(שם, body) = text(font: _as_string(שם), body)
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
#let כותרת_בהערה(body, רמה: 1) = context {
  let c = _hd_cfg.get()
  let lvl = calc.max(רמה, 1)
  let styled = text(
    size: _nh_sizes.at(calc.min(lvl - 1, _nh_sizes.len() - 1)),
    weight: _cfg_pick(c, "משקל", lvl, "bold"),
    fill: _cfg_pick(c, "צבע", lvl, luma(0)),
    body,
  )
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

#let hlevel(body, level: 1) = heading(level: level, body)
#let h1 = כותרת1
#let h2 = כותרת2
#let h3 = כותרת3
#let h4 = כותרת4
#let h5 = כותרת5
#let h6 = כותרת6
#let title = שער
#let subtitle = תת_שער
#let note_heading = _en(כותרת_בהערה)

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
// #רשימה / #ממוספרת read #הגדרות_רשימות at their location (marker, indent,
// spacing, tight, enum numbering). Only keys actually configured are passed, so
// unset ones inherit the document defaults.
#let רשימה(..פריטים) = context {
  let c = _ls_cfg.get()
  let a = (indent: c.at("הזחה", default: 1em), tight: c.at("הידוק", default: false))
  let m = c.at("סמן", default: none)
  if m != none { a.insert("marker", m) }
  if c.at("ריווח", default: auto) != auto { a.insert("spacing", c.ריווח) }
  if c.at("הזחת_גוף", default: auto) != auto { a.insert("body-indent", c.הזחת_גוף) }
  list(..a, ..פריטים)
}
#let ממוספרת(..פריטים) = context {
  let c = _ls_cfg.get()
  let a = (indent: c.at("הזחה", default: 1em), tight: c.at("הידוק", default: false))
  if c.at("מספור", default: auto) != auto { a.insert("numbering", c.מספור) }
  if c.at("ריווח", default: auto) != auto { a.insert("spacing", c.ריווח) }
  enum(..a, ..פריטים)
}
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
#let תוכן(כותרת: auto, מספור: auto) = context {
  let title = if כותרת != auto { כותרת } else if text.lang == "he" { [תוכן העניינים] } else { [Contents] }
  let show-nums = if מספור == auto { _hd_cfg.get().at("מספור", default: none) != none } else { מספור }
  if show-nums {
    outline(title: title)
  } else {
    show outline.entry: it => it.indented(none, it.inner())
    outline(title: title)
  }
}
#let toc = _en(תוכן)

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
#let הערה(body) = הערה_בדרגה(1, body)
#let fnote = הערה

// הערה_על_הערה · a note ON a note (a sub-note) in the *native* apparatus.
// Typst hoists a footnote nested in a footnote into its own entry, so nesting
// these gives a separate entry per level in the single (Option-A) apparatus.
#let הערה_על_הערה(body) = footnote(text(size: 0.94em, style: "italic", body))
#let subnote = הערה_על_הערה

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
#let _es_defaults = (מספור: "1")
#let _es_cfg = state("ksav-es-cfg", _es_defaults)
#let הגדרות_הערות_סיום(..opts) = _es_cfg.update(c => {
  let d = c
  for (k, v) in opts.named() { d.insert(k, v) }
  d
})
#let endnotes_config = _en(הגדרות_הערות_סיום)
#let _es_scheme() = _es_cfg.get().at("מספור", default: "1")
#let _en_label(זרם) = label("ksav-en-" + זרם)
#let _en_dump_label(זרם) = label("ksav-end-" + זרם)
#let _en_section(זרם, loc) = _ksav_real(
  query(_ksav_between(selector(_en_label(זרם)), _en_dump_label(זרם), loc))
)
#let הערתסיום(body, זרם: "הערות") = {
  [#metadata((body: body))#_en_label(זרם)]
  context {
    let loc = here()
    super[#numbering(
      _es_scheme(),
      _ksav_rank(_ksav_between(selector(_en_label(זרם)), _en_dump_label(זרם), loc), loc, e => true),
    )]
  }
}
// The rendered block for one stream's notes in the section around `loc`.
#let _en_block(זרם, loc) = {
  let items = _en_section(זרם, loc).map(e => e.value.body)
  if items.len() > 0 { enum(numbering: _es_scheme() + ".", ..items) }
}
#let הערות_בסוף(זרם: "הערות", כותרת: none) = {
  context {
    let items = _en_section(זרם, here()).map(e => e.value.body)
    if items.len() > 0 {
      _ksav_ap_open
      v(1em)
      line(length: 100%, stroke: 0.5pt + luma(150))
      if כותרת != none { heading(outlined: false, numbering: none, level: 3, כותרת) }
      enum(numbering: _es_scheme() + ".", ..items)
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
#let הערות_בסוף_צד(זרמים: (), כותרות: (:), יחס: none) = {
  context {
    let loc = here()
    let present = זרמים.filter(s => _en_section(s, loc).len() > 0)
    if present.len() > 0 {
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

// ---- הערות צד · side-column notes, aligned to their marker's line ----
// A substantial notes column beside the text (not a thin margin). Wrap a section
// in #עם_הערות_צד[...]; inside it, #הערת_גיליון[...] drops a numbered marker and
// its note appears in the side column *beside that line*.
//
// Real sidenotes, not a "notes column": each note is `place`d at the vertical
// offset of its own marker, so the reader's eye goes straight across. The
// mechanism is read-only, so it converges: a note drops inline metadata, then
// every note on the page queries *all* of them, measures each at the column
// width, and stacks them greedily (a note sits at its marker's line, or just
// below the previous note if that would overlap). Every note computes the same
// stack from the same query, so they agree without any shared state.
#let _sn_defaults = (
  יחס: 2,          // main-column : note-column width ratio
  מרווח: 1.2em,    // gutter between the two columns
  גודל: 0.78em,
  צבע: luma(65),
  ריווח: 0.6em,    // minimum vertical gap between two stacked notes
)
#let _sn_cfg = state("ksav-sn-cfg", _sn_defaults)
#let הגדרות_הערות_צד(..opts) = _sn_cfg.update(c => { let d = c; for (k, v) in opts.named() { d.insert(k, v) }; d })
// Is a side-column wrapper currently open? A sidenote outside one has no column
// to land in, so it must not be `place`d off the page — see _sn_note.
#let _sn_active = state("ksav-sn-active", 0)
#let _sn_wrap(cfg, mark, body) = text(
  size: cfg.at("גודל", default: 0.78em),
  fill: cfg.at("צבע", default: luma(65)),
  [#super[#mark] #body],
)

// The shared sidenote engine. `lbl` names the stream (one per gutter), `mark`
// renders a number, and `side` is "חוץ" (the far side of the main column),
// "ימין" or "שמאל" (an absolute page side, for the two-sided layout).
//
// Real sidenotes, not a "notes column": each note is `place`d at the vertical
// offset of its OWN marker, so the reader's eye goes straight across. The
// mechanism is read-only, so it converges — a note drops inline metadata, then
// every note on the page queries all of them, measures each at the column width
// and stacks them greedily (a note sits at its marker's line, or just below the
// previous note when that would overlap). Every note computes the same stack
// from the same query, so they agree without sharing any state.
#let _sn_note(lbl, side, mark, body) = {
  [#metadata((body: body))#label(lbl)]
  context {
  let cfg = _sn_cfg.get()
  // here() is read AFTER the metadata above, so the rank counts this note itself.
  let loc0 = here()
  let all = query(label(lbl))
  let num = _ksav_rank(label(lbl), loc0, e => true)
  super[#mark(num)]
  if _sn_active.get() == 0 {
    // No side column is open, so there is nowhere to put the note. Fall back to
    // a real footnote rather than placing it off the edge of the paper.
    footnote(_sn_wrap(cfg, mark(num), body))
  } else {
    // layout() hands us the width of the enclosing column — the main text column,
    // since we are inside it — from which the note column's width follows.
    layout(sz => context {
      let loc = here()
      let gutter = cfg.at("מרווח", default: 1.2em).to-absolute()
      let colw = sz.width / cfg.at("יחס", default: 2)
      let gap = cfg.at("ריווח", default: 0.6em).to-absolute()
      let mine = all.filter(e => e.location().page() == loc.page())
      let cursor = -1e4pt
      let dy = 0pt
      for e in mine {
        let want = e.location().position().y
        let top = calc.max(want, cursor)
        // `mine` is only this page's notes, so identify myself by document-wide
        // rank rather than by index within the page.
        let n = _ksav_rank(label(lbl), e.location(), x => true)
        if n == num { dy = top - loc.position().y }
        cursor = top + measure(box(width: colw, _sn_wrap(cfg, mark(n), e.value.body))).height + gap
      }
      // `place` in a flow anchors horizontally to the container's START corner
      // (the RIGHT edge of the column in RTL, the left in LTR) and vertically to
      // the current position — which is what lets dy be measured from the
      // marker's own line. dx is absolute (positive = rightwards), so the two
      // text directions need opposite signs.
      let rtl_ = text.dir == rtl
      let away = sz.width + gutter          // to the far side of the main column
      let near = -1 * (colw + gutter)       // to the near side of it
      let dx = if side == "חוץ" {
        if rtl_ { -1 * away } else { away }
      } else if (side == "ימין") == rtl_ {
        // the gutter on the same side the column starts from
        if rtl_ { -1 * near } else { near }
      } else {
        if rtl_ { -1 * away } else { away }
      }
      place(dx: dx, dy: dy, box(width: colw, _sn_wrap(cfg, mark(num), body)))
    })
  }
  }
}

#let הערת_גיליון(body) = _sn_note("ksav-sn", "חוץ", n => [#n], body)

// עם_הערות_צד — reserve the note column beside `עיקר`. The notes themselves are
// placed by #הערת_גיליון at their own lines; this only narrows the text column so
// there is empty page for them to land on.
#let עם_הערות_צד(עיקר, יחס: 2) = {
  _sn_cfg.update(c => { let d = c; d.insert("יחס", יחס); d })
  _sn_active.update(n => n + 1)
  context {
    let cfg = _sn_cfg.get()
    grid(
      columns: (יחס * 1fr, 1fr),
      column-gutter: cfg.at("מרווח", default: 1.2em),
      עיקר,
      [],
    )
  }
  _sn_active.update(n => n - 1)
}
#let sidenote = הערת_גיליון
#let sidenotes = _en(עם_הערות_צד)
#let sidenotes_config = _en(הגדרות_הערות_צד, extra: (gutter: "מרווח"))

// ---- הערות דו-צדדיות · two note streams, one down each side ----
// Wrap a section (or the whole document) in #עם_הערות_דו_צד[...]. Inside,
// #הערת_ימין[...] feeds the right column (numbered 1,2,3) and #הערת_שמאל[...]
// the left column (numbered 1′,2′,3′) — two independent apparatuses running down
// both sides of the centred main text, each note beside its own line.
#let הערת_ימין(body) = _sn_note("ksav-sn-r", "ימין", n => [#n], body)
#let הערת_שמאל(body) = _sn_note("ksav-sn-l", "שמאל", n => [#n′], body)
#let עם_הערות_דו_צד(עיקר, יחס: 2.4) = {
  _sn_cfg.update(c => { let d = c; d.insert("יחס", יחס); d })
  _sn_active.update(n => n + 1)
  grid(
    columns: (1fr, יחס * 1fr, 1fr),
    column-gutter: 1em,
    [],
    עיקר,
    [],
  )
  _sn_active.update(n => n - 1)
}
#let noteright = הערת_ימין
#let noteleft = הערת_שמאל
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
#let note_body = גוף_הערה
#let note_named = _en(הערה_בשם)
#let note_bodies = גופי_הערות

// ---- הפניות · cross-references (auto-numbered, auto-updating) ----
// #סמן("שם") marks a target; #הפניה("שם") prints its number. Numbers follow
// document order and update automatically when targets are added/reordered.
#let _ksav_xref = state("ksav-xref", ())
#let סמן(שם) = _ksav_xref.update(l => l + (_as_string(שם),))
#let הפניה(שם) = context {
  let שם = _as_string(שם)
  let l = _ksav_xref.final()
  let idx = l.position(x => x == שם)
  if idx == none [?] else [#(idx + 1)]
}
#let anchor = סמן
#let xref = הפניה

// ============================================================
//  טבלאות · tables
// ============================================================
// Stroke / inset / align / striping / font come from #הגדרות_טבלאות (applied by
// the global `show table` rule). Per-table overrides: pass יישור, or פסים:
// true/false to force zebra striping on/off for just this table.
// #טבלה reads #הגדרות_טבלאות at its location: stroke / inset / align / striping /
// font / size. Per-table overrides: יישור, or פסים: true/false to force zebra
// striping on/off just for this table.
#let טבלה(עמודות: 2, יישור: auto, פסים: none, ..תאים) = context {
  let c = _tb_cfg.get()
  let stripe = if פסים == none { c.at("פסים", default: false) } else { פסים }
  let al = if יישור != auto { יישור } else { c.at("יישור", default: auto) }
  let t = table(
    columns: עמודות,
    align: al,
    stroke: c.at("קו", default: 0.5pt + luma(160)),
    inset: c.at("מרווח", default: 8pt),
    fill: if stripe { (_, row) => if calc.odd(row) { c.at("צבע_פס", default: luma(245)) } else { none } } else { none },
    ..תאים,
  )
  let f = c.at("גופן", default: none)
  let s = c.at("גודל", default: none)
  if f != none { t = text(font: f, t) }
  if s != none { t = text(size: s, t) }
  t
}
#let תא(body) = body
#let כותרת_תא(body) = context { table.cell(fill: _tb_cfg.get().at("צבע_כותרת", default: luma(235)), strong(body)) }
#let מיזוג(מספר, body) = table.cell(colspan: מספר, body)

#let mktable = _en(טבלה)
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
#let callout = _en(הערת_צד, extra: (accent: "קו"))
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
#let תמונה(נתיב, רוחב: auto, יישור: none, כיתוב: none) = {
  if _as_string(נתיב).trim() == "" {
    box(
      width: if רוחב == auto { 60% } else { רוחב },
      height: 4em,
      stroke: (paint: luma(160), dash: "dashed", thickness: 0.8pt),
      fill: luma(247),
      align(center + horizon, text(size: 0.85em, fill: luma(110))[🖼 (תמונה — בחרו קובץ)]),
    )
  } else {
  let pic = image(נתיב, width: רוחב)
  let out = if כיתוב != none { figure(pic, caption: כיתוב) } else { pic }
  if יישור != none { align(יישור, out) } else { out }
  }
}

// חסר — a fill-in blank line (form field), e.g. for a kesubah or letter
#let חסר(רוחב: 3em) = box(width: רוחב, stroke: (bottom: 0.6pt + luma(60)))
#let blank = _en(חסר)

#let hrule = קו_מפריד
#let vspace = _en(מרווח)
#let hspace = _en(רווח_אופקי)
#let pbreak = מעבר_עמוד
#let lbreak = מעבר_שורה
#let cbreak = מעבר_טור
#let indent_ = הזחה
#let cols = טורים_בלוק
#let img = _en(תמונה)

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
#let _ksav_mekor_label = label("ksav-mekor")
#let מראה_מקום(body, מקור: none, תווים: none) = {
  if מקור != none {
    [#metadata((ref: מקור, chars: תווים, printed: body))#_ksav_mekor_label]
  }
  footnote(text(size: 0.92em, body))
}

// מקור_חי — a citation in the flow of the prose that keeps its ref.
//
// What linkify produces (Girsa spec.md §10.5): the words are printed exactly
// as they were written, and the ref rides underneath. Two things follow — the
// citation counts in `#מראה_מקומות()`, and in a compiled PDF it is a **link**
// that opens the page it names.
#let מקור_חי(body, מקור: none) = {
  if מקור == none { body } else {
    [#metadata((ref: מקור, printed: body))#_ksav_mekor_label]
    link(מקור, body)
  }
}
#let livecite = מקור_חי

// מראה_מקומות — the sources cited in the document, collected and printed.
//
// Cheap by construction: the refs are already in the document, so this is a
// sort and a print (Girsa spec.md §10.4). Every citation that carried a `מקור:`
// appears once, in the order it was first cited.
#let מראה_מקומות(כותרת: none) = context {
  let notes = query(_ksav_mekor_label)
  if notes.len() == 0 { return }
  if כותרת != none { heading(level: 2, outlined: false, numbering: none, כותרת) }
  let seen = ()
  for note in notes {
    let m = note.value
    if m.ref in seen { continue }
    seen.push(m.ref)
    block(above: 0.4em, below: 0.4em)[#m.printed]
  }
}
#let sources = מראה_מקומות

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

#let _ix_topic_label = label("ksav-ix-topic")
#let _ix_src_label = label("ksav-ix-src")

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
#let _ix_fold(s) = {
  let out = ""
  let last_space = true
  for c in str(s).codepoints() {
    // The maqaf separates words and must be tested *before* the points range,
    // because U+05BE sits inside it — matched there, ראש־השנה folds to
    // ראשהשנה, which is nothing at all.
    if c == "־" or c == "-" or c.match(regex("\s")) != none {
      if not last_space { out += " " }
      last_space = true
      continue
    }
    if c.match(regex("[\u{0591}-\u{05C7}]")) != none { continue }
    if c in ("\u{05F4}", "\u{201C}", "\u{201D}", "\"") { out += "\"" }
    else if c in ("\u{05F3}", "\u{2019}", "'") { out += "'" }
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
  [#metadata((
    term: str(מונח).trim(),
    sub: if תת == none { "" } else { str(תת).trim() },
  ))#_ix_topic_label]
  let body = שאר.pos()
  if body.len() > 0 { body.first() }
}
#let indexentry = ערך

#let _ix_entry_line(name, locs, indent: 0em) = block(
  above: 0.25em, below: 0.25em, inset: (right: indent),
  [#name #h(0.4em) #text(fill: luma(60), _ix_pages(locs))],
)

#let מפתח_ענינים(כותרת: [מפתח הענינים], טורים: 2, גודל: 0.9em) = context {
  let marks = query(_ix_topic_label)
  if marks.len() == 0 { return }
  if כותרת != none { heading(level: 1, numbering: none, כותרת) }
  // Gather first, print second. A term's pages are spread through the document
  // and its sub-entries are interleaved with everything else's, so there is no
  // way to print in one pass without the entries coming out in citation order —
  // which is precisely not an index.
  let groups = (:)
  for m in marks {
    let v = m.value
    let g = groups.at(v.term, default: (locs: (), subs: (:)))
    if v.sub == "" {
      g.locs.push(m.location())
    } else {
      let sl = g.subs.at(v.sub, default: ())
      sl.push(m.location())
      g.subs.insert(v.sub, sl)
    }
    groups.insert(v.term, g)
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
#let topicindex = מפתח_ענינים

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
#let ציון_מקור(ספר, מקום: none, סוגריים: false, ..שאר) = {
  let e = _ix_sefarim.at(_ix_fold(ספר), default: none)
  let canon = if e == none { str(ספר).trim() } else { e.שם }
  let place = if מקום == none { "" } else { str(מקום).trim() }
  [#metadata((
    sefer: canon,
    order: if e == none { 9000 } else { e.סדר },
    kind: if e == none { "other" } else { e.סוג },
    place: place,
  ))#_ix_src_label]
  let own = שאר.pos()
  let printed = if own.len() > 0 { own.first() } else {
    // The writer's own spelling is *not* what prints. Somebody who wrote ב״ב in
    // one place and בבא בתרא in another gets one spelling throughout, which is
    // the copy-editing pass nobody has time for.
    text(style: "italic", canon + if place != "" { " " + place } else { "" })
  }
  if סוגריים { [(#printed)] } else { printed }
}
#let sourceref = ציון_מקור

#let מפתח_מקורות(כותרת: [מפתח המקורות], קבוצות: true, טורים: 2, גודל: 0.9em) = context {
  let marks = query(_ix_src_label)
  if marks.len() == 0 { return }
  if כותרת != none { heading(level: 1, numbering: none, כותרת) }
  let by = (:)
  for m in marks {
    let v = m.value
    let g = by.at(v.sefer, default: (order: v.order, kind: v.kind, places: (:)))
    let pl = g.places.at(v.place, default: ())
    pl.push(m.location())
    g.places.insert(v.place, pl)
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
#let sourceindex = מפתח_מקורות

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
  צבע_הוספה: rgb("#15803d"),   // insertions
  צבע_מחיקה: rgb("#b91c1c"),   // deletions
  צבע_הערה: rgb("#b45309"),    // comments
  שמות: true,                   // print the reviewer's name on a comment
)
#let _rv_cfg = state("ksav-rv-cfg", _rv_defaults)
#let הגדרות_סקירה(..opts) = _rv_cfg.update(c => { let d = c; for (k, v) in opts.named() { d.insert(k, v) }; d })
#let _rv_mode(c) = c.at("תצוגה", default: "סימון")
#let _rv_by(c, מאת) = if מאת != none and c.at("שמות", default: true) {
  text(size: 0.8em, fill: luma(110), [ ‏(#מאת)])
} else { none }

// הוספה — text the reviewer added.
#let הוספה(body, מאת: none) = context {
  let c = _rv_cfg.get()
  let m = _rv_mode(c)
  if m == "מקורי" {
    // It was not there before this review, so the "original" view has none of it.
  } else if m == "סופי" {
    body
  } else {
    underline(text(fill: c.at("צבע_הוספה", default: rgb("#15803d")), body))
  }
}

// מחיקה — text the reviewer wants removed. Struck through, not gone: the point
// of a tracked deletion is that the author can still read what would go.
#let מחיקה(body, מאת: none) = context {
  let c = _rv_cfg.get()
  let m = _rv_mode(c)
  if m == "סופי" {
    // Accepted, the text is gone.
  } else if m == "מקורי" {
    body
  } else {
    strike(text(fill: c.at("צבע_מחיקה", default: rgb("#b91c1c")), body))
  }
}

// הערת_עורך — a comment ABOUT the text. Never part of the document, so it shows
// only in the markup view.
#let הערת_עורך(body, מאת: none) = context {
  let c = _rv_cfg.get()
  if _rv_mode(c) == "סימון" {
    let tint = c.at("צבע_הערה", default: rgb("#b45309"))
    _sn_note(
      "ksav-rv",
      "חוץ",
      n => text(fill: tint)[✎#n],
      text(fill: tint, { body; _rv_by(c, מאת) }),
    )
  }
}

#let review_config = _en(הגדרות_סקירה)
#let inserted = _en(הוספה)
#let deleted = _en(מחיקה)
#let comment_ = _en(הערת_עורך)

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
#let page_section = מקטע_עמוד

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
#let נוסחה(תוכן, ממוספרת: false) = text(dir: ltr, math.equation(
  block: true,
  numbering: if ממוספרת { "(1)" } else { none },
  eval(_as_string(תוכן), mode: "math"),
))
#let נוסחה_בשורה(תוכן) = text(
  dir: ltr,
  math.equation(block: false, eval(_as_string(תוכן), mode: "math")),
)
#let formula = _en(נוסחה)
#let iformula = נוסחה_בשורה

#let siman = סימן
#let seif = סעיף
#let osource = אות
#let verse = פסוק
#let sourcenote = מראה_מקום
#let refmark = ציון
#let dh = דיבור_המתחיל
#let gemara = גמרא

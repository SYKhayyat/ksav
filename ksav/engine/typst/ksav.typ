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
//  הערות שכבתיות · layered (tiered) footnotes — per page
// ------------------------------------------------------------
//  A note ON a note becomes its own stacked block at the foot of the page,
//  to any depth: #הערה_א[… #הערה_ב[… #הערה_ג[…]]]. Built on Typst's *native*
//  footnote so placement, page-breaking and unlimited nesting are guaranteed
//  and always converge. Each tier is independently styled (size / slant /
//  colour / indent / an optional bold label) via #הגדרות_הערות, so the tiers
//  read as distinct bands. Numbering is one running sequence (native, so it
//  never jumps). For fully *regrouped* bands with per-tier numbering and
//  columns (all tier-1 together, then all tier-2, …), use the end/section
//  apparatus #הערות_מדורגות — that renders in the main flow, where such
//  regrouping converges (a page footer is re-laid-out too often to).
// ============================================================
#let _fn_defaults = (
  גודל: (0.9em, 0.88em, 0.86em, 0.85em, 0.85em, 0.85em, 0.85em, 0.85em, 0.85em),   // per-tier size
  סגנון: ("normal", "italic", "italic", "italic", "italic", "italic", "italic", "italic", "italic"),
  צבע: (luma(0), luma(20), luma(45), luma(65), luma(80), luma(80), luma(80), luma(80), luma(80)),
  הזחה: (0em, 1.1em, 2.2em, 3.3em, 4.4em, 5.5em, 6.6em, 7.7em, 8.8em),  // per-tier indent (nesting)
  תוויות: none,        // none, or an array of per-tier bold label prefixes ("", "על הערה: ", …)
  ריווח: 0.85em,       // gap between footnote entries
)
#let _fn_cfg = state("ksav-fn-cfg", _fn_defaults)
// #הגדרות_הערות(סגנון: ("normal","italic","normal"), הזחה: (0em,1em,2em), ריווח: 1em, …)
#let הגדרות_הערות(..opts) = _fn_cfg.update(c => {
  let d = c
  for (k, v) in opts.named() { d.insert(k, v) }
  d
})
#let footnote_config = הגדרות_הערות

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
#let _fn_wrap(cfg, tier, body) = text(
  size: _fn_pick(cfg.at("גודל", default: ()), tier, 0.85em),
  style: _fn_pick(cfg.at("סגנון", default: ()), tier, "normal"),
  fill: _fn_pick(cfg.at("צבע", default: ()), tier, luma(0)),
  body,
)

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
  footnote(_fn_wrap(cfg, דרגה, {
    if ind != 0em { h(ind) }
    if lbl != none and lbl != "" { [#strong(lbl) ] }
    body
  }))
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
  מספור: ("1", "א", "a", "i", "*", "1", "א", "a", "i"),  // per-tier numbering scheme
  טורים: (1, 1, 1, 1, 1, 1, 1, 1, 1),                     // per-tier column count
  גודל: (0.9em, 0.88em, 0.86em, 0.85em, 0.85em, 0.85em, 0.85em, 0.85em, 0.85em),
  סגנון: ("normal", "italic", "italic", "italic", "italic", "italic", "italic", "italic", "italic"),
  צבע: (luma(0), luma(15), luma(40), luma(60), luma(75), luma(75), luma(75), luma(75), luma(75)),
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
#let _md_mark(cfg, tier, num) = numbering(_fn_pick(cfg.at("מספור", default: ()), tier, "1"), num)
#let _md_wrap(cfg, tier, body) = text(
  size: _fn_pick(cfg.at("גודל", default: ()), tier, 0.85em),
  style: _fn_pick(cfg.at("סגנון", default: ()), tier, "normal"),
  fill: _fn_pick(cfg.at("צבע", default: ()), tier, luma(0)),
  body,
)
// Every #הערות_מדורגות call drops this marker, which delimits one "section":
// a note belongs to the section that ends at the first dump after it.
#let _md_dump_label = label("ksav-md-dump")
// The מדור notes of the section surrounding `loc`, deduped, in document order.
// This section's notes: everything labelled ksav-md between the surrounding pair
// of dumps, minus the phantom re-registrations inside this section's own rendered
// apparatus (identified by the apparatus marker it drops).
#let _md_section_notes(loc) = _ksav_real(
  query(_ksav_between(selector(label("ksav-md")), _md_dump_label, loc))
)

// מדור_בדרגה(דרגה, body) — collect a section-band note in tier `דרגה`.
//
// Read-only rendering, exactly like the per-page bands: the note drops inline
// metadata in the main flow, and its number is the *rank of its content key*
// among same-tier notes in the same section — derived from a query, never from a
// counter. That is what makes multiple sections work: there is no global phase
// flag to burn out after the first section, and no counter to reset.
#let מדור_בדרגה(דרגה, body) = context {
  let cfg = _md_cfg.get()
  [#metadata((tier: דרגה, body: body))#label("ksav-md")]
  // Force nested tiers to register in this same pass, in a zero-size inline box
  // so it can never break the line the marker sits on.
  box(place(hide(body)))
  context {
    let loc = here()
    super(_md_mark(cfg, דרגה, _ksav_rank(
      _ksav_between(selector(label("ksav-md")), _md_dump_label, loc),
      loc,
      e => e.value.tier == דרגה,
    )))
  }
}
// #הערות_מדורגות() — render this section's collected tiers as stacked bands, here.
// Call it once per section (and/or at the end of the document); each call renders
// only the notes written since the previous call.
#let הערות_מדורגות(כותרת: none) = {
  context {
    let notes = _md_section_notes(here()).map(m => m.value)
    if notes.len() > 0 {
      let cfg = _md_cfg.get()
      _ksav_ap_open
      if כותרת != none { heading(level: 3, outlined: false, numbering: none, כותרת) }
      if cfg.at("קו", default: true) { line(length: 100%, stroke: 0.5pt + luma(140)); v(0.3em) }
      let tiers = notes.map(v => v.tier).dedup().sorted()
      for (bi, t) in tiers.enumerate() {
        let ents = notes.filter(v => v.tier == t)
        let cols = _fn_pick(cfg.at("טורים", default: ()), t, 1)
        let band = {
          if cfg.at("תוויות", default: false) {
            block(spacing: 0.2em, text(size: 0.62em, fill: luma(160))[· #_md_mark(cfg, t, 1) ·])
          }
          for (i, v) in ents.enumerate() {
            block(spacing: cfg.at("ריווח_פריט", default: 0.35em),
              _md_wrap(cfg, t, [#super(_md_mark(cfg, t, i + 1)) #v.body]))
          }
        }
        if cols > 1 { columns(cols, band) } else { band }
        if bi < tiers.len() - 1 {
          v(cfg.at("ריווח_בין", default: 0.5em))
          if cfg.at("קו_בין", default: true) { line(length: 40%, stroke: 0.4pt + luma(185)); v(cfg.at("ריווח_בין", default: 0.5em)) }
        }
      }
      _ksav_ap_close
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
#let banded_notes = הערות_מדורגות
#let banded_config = הגדרות_מדורגות

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
#let _pp_defaults = (
  מספור: ("1", "א", "a", "i", "*", "1", "א", "a", "i"),  // per-tier numbering scheme
  טורים: (1, 1, 1, 1, 1, 1, 1, 1, 1),                     // per-tier column count
  גודל: (0.86em, 0.84em, 0.82em, 0.8em, 0.8em, 0.8em, 0.8em, 0.8em, 0.8em),
  סגנון: ("normal", "italic", "italic", "italic", "italic", "italic", "italic", "italic", "italic"),
  צבע: (luma(0), luma(20), luma(45), luma(65), luma(80), luma(80), luma(80), luma(80), luma(80)),
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
#let _pp_mark(cfg, tier, num) = numbering(_fn_pick(cfg.at("מספור", default: ()), tier, "1"), num)
#let _pp_wrap(cfg, tier, body) = text(
  size: _fn_pick(cfg.at("גודל", default: ()), tier, 0.85em),
  style: _fn_pick(cfg.at("סגנון", default: ()), tier, "normal"),
  fill: _fn_pick(cfg.at("צבע", default: ()), tier, luma(0)),
  body,
)
// מדף_בדרגה(דרגה, body) — collect a per-page-band note in tier `דרגה`.
// Every מדף note registered outside an apparatus block — i.e. the real ones.
#let _pp_all() = _ksav_real(query(label("ksav-pp")))
#let מדף_בדרגה(דרגה, body) = context {
  let cfg = _pp_cfg.get()
  [#metadata((tier: דרגה, body: body))#label("ksav-pp")]
  // Force nested tiers to register in this pass. Wrapped in a zero-size inline
  // box so that when this body is later re-displayed inside a footer band, the
  // hidden machinery can't break the line before the child's cross-ref marker.
  box(place(hide(body)))
  // marker number = how many same-tier notes run up to and including this one
  context {
    let loc = here()
    super(_pp_mark(cfg, דרגה, _ksav_rank(
      label("ksav-pp"), loc, e => e.value.tier == דרגה,
    )))
  }
}
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
        mine.map(e => e.value.tier).dedup().sorted()
      }
      set align(if text.dir == rtl { right } else { left })
      block(width: 100%, {
        _ksav_ap_open
        if cfg.at("קו", default: true) { line(length: 100%, stroke: 0.5pt + luma(140)); v(0.25em) }
        for (bi, t) in tiers.enumerate() {
          let ents = mine.filter(e => e.value.tier == t)
          let tier-all = all.filter(e => e.value.tier == t)   // for doc-wide numbering
          let band = {
            for e in ents {
              let num = tier-all.position(x => x.location() == e.location()) + 1
              block(spacing: cfg.at("ריווח_פריט", default: 0.25em),
                _pp_wrap(cfg, t, [#super(_pp_mark(cfg, t, num)) #e.value.body]))
            }
          }
          let cols = _fn_pick(cfg.at("טורים", default: ()), t, 1)
          let filled = if cols > 1 { columns(cols, band) } else { band }
          let h = _fn_pick(if type(heights) == array { heights } else { () }, t, none)
          if h != none {
            block(width: 100%, height: h, clip: true, filled)
          } else { filled }
          if bi < tiers.len() - 1 {
            v(cfg.at("ריווח_בין", default: 0.35em))
            if cfg.at("קו_בין", default: true) { line(length: 35%, stroke: 0.4pt + luma(185)); v(cfg.at("ריווח_בין", default: 0.35em)) }
          }
        }
        _ksav_ap_close
      })
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
#let pagebands_config = הגדרות_מדפים

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
#let _sf_scheme(cfg, stream) = cfg.at("מספור", default: (:)).at(stream, default: "1")
#let _sf_mark(cfg, stream, num) = numbering(_sf_scheme(cfg, stream), num)
#let _sf_wrap(cfg, body) = text(
  size: cfg.at("גודל", default: 0.85em),
  style: cfg.at("סגנון", default: "normal"),
  fill: cfg.at("צבע", default: luma(20)),
  body,
)
// הערה_זרם(זרם, body) — a footnote in the named stream `זרם`.
#let _sf_all() = _ksav_real(query(label("ksav-sf")))
#let הערה_זרם(זרם, body) = context {
  let cfg = _sf_cfg.get()
  [#metadata((stream: זרם, body: body))#label("ksav-sf")]
  box(place(hide(body)))
  context {
    let loc = here()
    super(_sf_mark(cfg, זרם, _ksav_rank(
      label("ksav-sf"), loc, e => e.value.stream == זרם,
    )))
  }
}
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
      let present = mine.map(e => e.value.stream).dedup()
      // Fixed heights ⇒ fixed geometry: every stream that has a reserved slot is
      // laid out on every apparatus page, even with nothing in it this page, so
      // a stream never drifts into another's place.
      let fixed = cfg.at("גבהים", default: (:)).keys()
      let streams = _sf_order(cfg, present + fixed.filter(s => not present.contains(s)))
      set align(if text.dir == rtl { right } else { left })
      // one rendered block per stream (heading + numbered entries)
      let render-stream(s) = {
        let ents = mine.filter(e => e.value.stream == s)
        let all-s = all.filter(e => e.value.stream == s)   // stream-wide numbering
        let head = cfg.at("כותרות", default: (:)).at(s, default: none)
        if head != none { block(spacing: 0.2em, text(size: 0.72em, weight: "bold", fill: luma(90), head)) }
        let entries = {
          for e in ents {
            let num = all-s.position(x => x.location() == e.location()) + 1
            block(spacing: cfg.at("ריווח_פריט", default: 0.22em),
              _sf_wrap(cfg, [#super(_sf_mark(cfg, s, num)) #e.value.body]))
          }
        }
        let ncols = cfg.at("טורים", default: (:)).at(s, default: 1)
        let filled = if ncols > 1 { columns(ncols, entries) } else { entries }
        let h = cfg.at("גבהים", default: (:)).at(s, default: none)
        if h != none { block(width: 100%, height: h, clip: true, filled) } else { filled }
      }
      block(width: 100%, {
        _ksav_ap_open
        if cfg.at("קו", default: true) { line(length: 100%, stroke: 0.5pt + luma(140)); v(0.25em) }
        if cfg.at("פריסה", default: "מוערם") == "צד" {
          // side by side: one equal column per stream
          grid(
            columns: streams.map(_ => 1fr),
            column-gutter: 1.2em,
            ..streams.map(s => render-stream(s)),
          )
        } else {
          // stacked: streams one above the other, divided by a short rule
          for (i, s) in streams.enumerate() {
            render-stream(s)
            if i < streams.len() - 1 {
              v(cfg.at("ריווח_בין", default: 0.45em))
              if cfg.at("קו_בין", default: true) { line(length: 30%, stroke: 0.4pt + luma(185)); v(cfg.at("ריווח_בין", default: 0.45em)) }
            }
          }
        }
        _ksav_ap_close
      })
    }
  }
}
#let הערת_תוכן(body) = הערה_זרם("תוכן", body)
#let הערת_מקור(body) = הערה_זרם("מקורות", body)
#let stream_note = הערה_זרם
#let contentnote = הערת_תוכן
#let sourcenote_stream = הערת_מקור
#let streams_config = הגדרות_זרמים

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
  let styled = {
    set text(
      size: _cfg_pick(c, "גודל", lvl, 1em),
      weight: _cfg_pick(c, "משקל", lvl, "bold"),
      fill: _cfg_pick(c, "צבע", lvl, luma(0)),
      style: _cfg_pick(c, "סגנון", lvl, "normal"),
      tracking: c.at("מרווח_אותיות", default: 0pt),
    )
    let body = { num; it.body }
    if _cfg_pick(c, "רברבתי", lvl, false) { body = smallcaps(body) }
    if _cfg_pick(c, "קו_תחתון", lvl, false) { body = underline(body) }
    body
  }
  let al = _cfg_pick(c, "יישור", lvl, none)
  let head = if al != none { align(al, styled) } else { styled }
  block(
    above: _cfg_pick(c, "ריווח_לפני", lvl, 1em),
    below: _cfg_pick(c, "ריווח_אחרי", lvl, 0.6em),
    {
      head
      if _cfg_pick(c, "קו", lvl, false) { v(0.25em); line(length: 100%, stroke: 0.5pt + luma(160)) }
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

#let headings_config = הגדרות_כותרות
#let lists_config = הגדרות_רשימות
#let tables_config = הגדרות_טבלאות

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
  set text(font: גופן, size: גודל, lang: שפה, dir: כיוון)
  set page(
    paper: נייר,
    margin: (top: שוליים, left: שוליים, right: שוליים, bottom: שוליים + reserve),
    numbering: if מספור { np } else { none },
    header: if כותרת_עליונה != none {
      align(center, text(size: 0.85em, fill: luma(100), כותרת_עליונה))
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
        let ln = if כותרת_תחתונה != none {
          text(size: 0.85em, fill: luma(100), כותרת_תחתונה)
        } else if מספור {
          text(size: 0.85em, fill: luma(100), numbering(np, ..counter(page).get()))
        } else { none }
        if ln != none { align(center, ln) }
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
#let toc = תוכן

// ============================================================
//  הערות שוליים · footnotes
// ============================================================
#let הערה(body) = footnote(body)
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
#let _en_label(זרם) = label("ksav-en-" + זרם)
#let _en_dump_label(זרם) = label("ksav-end-" + זרם)
#let _en_section(זרם, loc) = _ksav_real(
  query(_ksav_between(selector(_en_label(זרם)), _en_dump_label(זרם), loc))
)
#let הערתסיום(body, זרם: "הערות") = {
  [#metadata((body: body))#_en_label(זרם)]
  context {
    let loc = here()
    super[#_ksav_rank(
      _ksav_between(selector(_en_label(זרם)), _en_dump_label(זרם), loc),
      loc,
      e => true,
    )]
  }
}
// The rendered block for one stream's notes in the section around `loc`.
#let _en_block(זרם, loc) = {
  let items = _en_section(זרם, loc).map(e => e.value.body)
  if items.len() > 0 { enum(..items) }
}
#let הערות_בסוף(זרם: "הערות", כותרת: none) = {
  context {
    let items = _en_section(זרם, here()).map(e => e.value.body)
    if items.len() > 0 {
      _ksav_ap_open
      v(1em)
      line(length: 100%, stroke: 0.5pt + luma(150))
      if כותרת != none { heading(outlined: false, numbering: none, level: 3, כותרת) }
      enum(..items)
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
#let endnote = הערתסיום
#let endnotes = הערות_בסוף
#let endnotes_side = הערות_בסוף_צד

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
#let sidenotes = עם_הערות_צד
#let sidenotes_config = הגדרות_הערות_צד

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
#let twosided = עם_הערות_דו_צד

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
// תמונה — insert a picture. `נתיב` is the asset's name as sent with the compile
// request (the editor attaches the bytes; there is no file system to read from).
// רוחב sizes it, יישור places it (right / מרכז / left), and כיתוב adds a caption,
// in which case it becomes a numbered figure.
#let תמונה(נתיב, רוחב: auto, יישור: none, כיתוב: none) = {
  let pic = image(נתיב, width: רוחב)
  let out = if כיתוב != none { figure(pic, caption: כיתוב) } else { pic }
  if יישור != none { align(יישור, out) } else { out }
}

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

#let review_config = הגדרות_סקירה
#let inserted = הוספה
#let deleted = מחיקה
#let comment_ = הערת_עורך

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
#let נוסחה(תוכן, ממוספרת: false) = text(dir: ltr, math.equation(
  block: true,
  numbering: if ממוספרת { "(1)" } else { none },
  eval(תוכן, mode: "math"),
))
#let נוסחה_בשורה(תוכן) = text(dir: ltr, math.equation(block: false, eval(תוכן, mode: "math")))
#let formula = נוסחה
#let iformula = נוסחה_בשורה

#let siman = סימן
#let seif = סעיף
#let osource = אות
#let verse = פסוק
#let sourcenote = מראה_מקום
#let refmark = ציון
#let dh = דיבור_המתחיל
#let gemara = גמרא

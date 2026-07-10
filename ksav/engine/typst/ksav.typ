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
  let pad-args = if text.dir == rtl { (right: ind) } else { (left: ind) }
  let lbls = cfg.at("תוויות", default: none)
  let lbl = if type(lbls) == array { _fn_pick(lbls, דרגה, none) } else { none }
  footnote(pad(..pad-args, _fn_wrap(cfg, דרגה, {
    if lbl != none and lbl != "" { [#strong(lbl) ] }
    body
  })))
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
#let _md_phase = state("ksav-md-phase", "collect")
#let _md_ct(t) = counter("ksav-mdc-" + str(t))   // collect numbering, per tier
#let _md_rt(t) = counter("ksav-mdr-" + str(t))   // render cursor, per tier
#let _md_mark(cfg, tier, num) = numbering(_fn_pick(cfg.at("מספור", default: ()), tier, "1"), num)
#let _md_wrap(cfg, tier, body) = text(
  size: _fn_pick(cfg.at("גודל", default: ()), tier, 0.85em),
  style: _fn_pick(cfg.at("סגנון", default: ()), tier, "normal"),
  fill: _fn_pick(cfg.at("צבע", default: ()), tier, luma(0)),
  body,
)
#let מדור_בדרגה(דרגה, body) = context {
  let cfg = _md_cfg.get()
  if _md_phase.get() == "collect" {
    _md_ct(דרגה).step()
    context {
      let num = _md_ct(דרגה).get().first()
      [#metadata((tier: דרגה, num: num, body: body))#label("ksav-md")]
      place(hide(body))                    // force nested tiers to register this pass
      super(_md_mark(cfg, דרגה, num))
    }
  } else {
    _md_rt(דרגה).step()
    context { super(_md_mark(cfg, דרגה, _md_rt(דרגה).get().first())) }
  }
}
// #הערות_מדורגות() — render every collected tier as a stacked band, here.
#let הערות_מדורגות(כותרת: none) = context {
  let notes = query(label("ksav-md")).map(m => m.value)
  if notes.len() > 0 {
    let cfg = _md_cfg.get()
    _md_phase.update("render")
    if כותרת != none { heading(outlined: false, numbering: none, כותרת) }
    if cfg.at("קו", default: true) { line(length: 100%, stroke: 0.5pt + luma(140)); v(0.3em) }
    let tiers = notes.map(v => v.tier).dedup().sorted()
    for (bi, t) in tiers.enumerate() {
      let ents = notes.filter(v => v.tier == t)
      let cols = _fn_pick(cfg.at("טורים", default: ()), t, 1)
      let band = {
        if cfg.at("תוויות", default: false) {
          block(spacing: 0.2em, text(size: 0.62em, fill: luma(160))[· #_md_mark(cfg, t, 1) ·])
        }
        for v in ents {
          block(spacing: cfg.at("ריווח_פריט", default: 0.35em),
            _md_wrap(cfg, t, [#super(_md_mark(cfg, t, v.num)) #v.body]))
        }
      }
      if cols > 1 { columns(cols, band) } else { band }
      if bi < tiers.len() - 1 {
        v(cfg.at("ריווח_בין", default: 0.5em))
        if cfg.at("קו_בין", default: true) { line(length: 40%, stroke: 0.4pt + luma(185)); v(cfg.at("ריווח_בין", default: 0.5em)) }
      }
    }
    // NB: the collect→render switch is *monotone* — we never flip back. Flipping
    // back re-enables collection on re-display passes and the document oscillates
    // (never converges). So render must be the last apparatus: any מדור notes
    // written AFTER #הערות_מדורגות won't be collected. Call it at end of section.
  }
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
// ordered dedup of query elements by their content key (first occurrence wins)
#let _pp_dedup(elems) = {
  let keys = ()
  let out = ()
  for e in elems {
    let k = e.value.key
    if not keys.contains(k) { keys.push(k); out.push(e) }
  }
  out
}
// מדף_בדרגה(דרגה, body) — collect a per-page-band note in tier `דרגה`.
#let מדף_בדרגה(דרגה, body) = context {
  let cfg = _pp_cfg.get()
  let key = repr(body)
  [#metadata((tier: דרגה, key: key, body: body))#label("ksav-pp")]
  // Force nested tiers to register in this pass. Wrapped in a zero-size inline
  // box so that when this body is later re-displayed inside a footer band, the
  // hidden machinery can't break the line before the child's cross-ref marker.
  box(place(hide(body)))
  // marker number = rank of this key among same-tier notes, document-wide
  context {
    let same = _pp_dedup(query(label("ksav-pp")).filter(e => e.value.tier == דרגה))
    let idx = same.position(e => e.value.key == key)
    super(_pp_mark(cfg, דרגה, if idx == none { 1 } else { idx + 1 }))
  }
}
// Read-only footer: render the bands for the CURRENT page. Called from the
// wrapper's page footer. Renders nothing (and touches nothing) when the page
// has no per-page-band notes, so it's free for documents that don't use them.
#let _pp_page_bands() = context {
  let all = _pp_dedup(query(label("ksav-pp")))   // first occurrence of every note, doc order
  if all.len() > 0 {
    let cfg = _pp_cfg.get()
    let pg = here().page()
    let mine = all.filter(e => e.location().page() == pg)
    if mine.len() > 0 {
      let tiers = mine.map(e => e.value.tier).dedup().sorted()
      set align(if text.dir == rtl { right } else { left })
      block(width: 100%, {
        if cfg.at("קו", default: true) { line(length: 100%, stroke: 0.5pt + luma(140)); v(0.25em) }
        for (bi, t) in tiers.enumerate() {
          let ents = mine.filter(e => e.value.tier == t)
          let tier-all = all.filter(e => e.value.tier == t)   // for doc-wide numbering
          let band = {
            for e in ents {
              let num = tier-all.position(x => x.value.key == e.value.key) + 1
              block(spacing: cfg.at("ריווח_פריט", default: 0.25em),
                _pp_wrap(cfg, t, [#super(_pp_mark(cfg, t, num)) #e.value.body]))
            }
          }
          let cols = _fn_pick(cfg.at("טורים", default: ()), t, 1)
          if cols > 1 { columns(cols, band) } else { band }
          if bi < tiers.len() - 1 {
            v(cfg.at("ריווח_בין", default: 0.35em))
            if cfg.at("קו_בין", default: true) { line(length: 35%, stroke: 0.4pt + luma(185)); v(cfg.at("ריווח_בין", default: 0.35em)) }
          }
        }
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
#let הערה_זרם(זרם, body) = context {
  let cfg = _sf_cfg.get()
  let key = זרם + "\u{0}" + repr(body)
  [#metadata((stream: זרם, key: key, body: body))#label("ksav-sf")]
  box(place(hide(body)))
  context {
    let same = _pp_dedup(query(label("ksav-sf")).filter(e => e.value.stream == זרם))
    let idx = same.position(e => e.value.key == key)
    super(_sf_mark(cfg, זרם, if idx == none { 1 } else { idx + 1 }))
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
  let all = _pp_dedup(query(label("ksav-sf")))
  if all.len() > 0 {
    let cfg = _sf_cfg.get()
    let pg = here().page()
    let mine = all.filter(e => e.location().page() == pg)
    if mine.len() > 0 {
      let present = mine.map(e => e.value.stream).dedup()
      let streams = _sf_order(cfg, present)
      set align(if text.dir == rtl { right } else { left })
      // one rendered block per stream (heading + numbered entries)
      let render-stream(s) = {
        let ents = mine.filter(e => e.value.stream == s)
        let all-s = all.filter(e => e.value.stream == s)   // stream-wide numbering
        let head = cfg.at("כותרות", default: (:)).at(s, default: none)
        if head != none { block(spacing: 0.2em, text(size: 0.72em, weight: "bold", fill: luma(90), head)) }
        let entries = {
          for e in ents {
            let num = all-s.position(x => x.value.key == e.value.key) + 1
            block(spacing: cfg.at("ריווח_פריט", default: 0.22em),
              _sf_wrap(cfg, [#super(_sf_mark(cfg, s, num)) #e.value.body]))
          }
        }
        let ncols = cfg.at("טורים", default: (:)).at(s, default: 1)
        if ncols > 1 { columns(ncols, entries) } else { entries }
      }
      block(width: 100%, {
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
  let c = _hd_cfg.get()
  let lvl = it.level
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
    // Footer = per-page regrouped bands (read-only, renders nothing when unused)
    // stacked above the page number / custom footer line. We render the number
    // ourselves here because a custom footer replaces Typst's automatic one.
    footer: {
      _pp_page_bands()
      _sf_page_streams()
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
#let תוכן(כותרת: [תוכן העניינים]) = outline(title: כותרת)
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
// הערות_בסוף_צד — render several endnote streams SIDE BY SIDE (one column each),
// e.g. content notes and sources as two parallel end-columns. Any number of
// streams; pass their order and optional per-stream titles.
#let הערות_בסוף_צד(זרמים: (), כותרות: (:), יחס: none) = context {
  let d = _ksav_en.final()
  let present = זרמים.filter(s => d.at(s, default: ()).len() > 0)
  if present.len() > 0 {
    v(1em)
    line(length: 100%, stroke: 0.5pt + luma(150))
    v(0.4em)
    let col(s) = {
      let title = כותרות.at(s, default: none)
      if title != none { block(spacing: 0.4em, heading(outlined: false, numbering: none, level: 3, title)) }
      enum(..d.at(s, default: ()))
    }
    let widths = if type(יחס) == array { יחס.map(x => x * 1fr) } else { present.map(_ => 1fr) }
    grid(columns: widths, column-gutter: 1.5em, ..present.map(col))
  }
}
#let endnote = הערתסיום
#let endnotes = הערות_בסוף
#let endnotes_side = הערות_בסוף_צד

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

// ---- הערות דו-צדדיות · two note streams, one down each side ----
// Wrap a large section (or the whole document) in #עם_הערות_דו_צד[...]. Inside,
// #הערת_ימין[...] feeds the right column (numbered 1,2,3) and #הערת_שמאל[...]
// the left column (numbered 1′,2′,3′) — two independent apparatuses running
// down both sides of the centered main text. Use once per document/section
// (the streams are document-wide).
#let _ksav_rn = state("ksav-rn", ())
#let _ksav_rc = counter("ksav-rc")
#let _ksav_ln = state("ksav-ln", ())
#let _ksav_lc = counter("ksav-lc")
#let הערת_ימין(body) = {
  _ksav_rc.step()
  context super(_ksav_rc.display())
  _ksav_rn.update(l => l + (body,))
}
#let הערת_שמאל(body) = {
  _ksav_lc.step()
  context super[#_ksav_lc.display()′]
  _ksav_ln.update(l => l + (body,))
}
#let עם_הערות_דו_צד(עיקר, יחס: 2.4) = grid(
  columns: (1fr, יחס * 1fr, 1fr),
  column-gutter: 1em,
  {
    set text(size: 0.75em, fill: luma(65))
    context { for (i, n) in _ksav_rn.final().enumerate() { block(spacing: 0.5em)[#super[#(i + 1)] #n] } }
  },
  עיקר,
  {
    set text(size: 0.75em, fill: luma(65))
    context { for (i, n) in _ksav_ln.final().enumerate() { block(spacing: 0.5em)[#super[#(i + 1)′] #n] } }
  },
)
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

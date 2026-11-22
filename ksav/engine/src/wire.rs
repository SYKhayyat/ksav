//! The wire: the JSON a caller sends and the JSON it is answered with.
//!
//! # Why this is not in `lib.rs`
//!
//! This is the **boundary** — `compile_request`, `assemble_request`,
//! `compile_html` and the request shape they all read — and it was the third of
//! the three concerns one file held (`#222`): the prelude's language knowledge,
//! the compile pipeline, and the wire. They are not the same reader's business.
//! The client's half of this contract is `app/test/wire.test.mjs`, which is what
//! `#221` tightened; this is the side that answers it.
//!
//! # What a request may ask for, and what that costs
//!
//! Every flag here is a field that was once carried back unconditionally and
//! measured at a few hundred kilobytes a keystroke: `want_pdf`, `want_source`,
//! `want_lines`, `want_markers`, `want_text`. None of them changes what is
//! compiled — each says which parts of the answer are *carried back*. That
//! distinction is the reason the flags can be added without a second compile and
//! the reason a new one is cheap; it is written out here because the file that
//! reads them is the one place a new one is easy to add wrongly.
//!
//! `have_pages` is the same argument in the other direction: the client says
//! which pages it is still holding, by fingerprint, and the answer carries `null`
//! for those. The engine keeps no per-client state, so two windows, a reload or a
//! restarted server can never leave it believing something about a client that is
//! not true.

use crate::assets::Assets;
use typst::diag::Warned;

use crate::diagnostics::{Diagnostic, Located};
use crate::services::Reply;
use crate::{
    assemble_source, compile_parts, effective_lang, engine_for, include, main_source, notemarks,
    pagelines, pagetext, prelude_text, DocConfig, Wants, PRELUDE_PATH,
};

/// JSON-in / JSON-out compile, shared by the HTTP server and the wasm binding.
/// Input: `{body, font, size_pt, margin_cm, dir, numbering, justify, line_spacing_em,
/// columns, assets: [{name, data}], fonts: [{name, data}], want_pdf, want_source,
/// have_pages: [fingerprint]}` — `data` is base64, with or without a `data:` URL
/// prefix.
/// Output: `{ok, pages_svg, pages_hash, pdf_base64, diagnostics, typst_source}`,
/// where a `pages_svg` entry is `null` for any page whose fingerprint the caller
/// listed in `have_pages`.
/// The response for a request the engine could not make sense of.
///
/// Shared by the two ways that happens — JSON that does not parse, and JSON that
/// parses but carries no usable document — because they need the same answer: a
/// failed compile that says why. Anything that renders a page here would be
/// rendering a page nobody asked for.
pub(crate) fn malformed_request(reason_he: &str, reason_en: &str) -> Reply {
    // Through `Reply::fail` rather than hand-built (#215). This used to write its
    // own object with `ok: false` and no `error` key — the compile shape — so a
    // caller that asks `error` on a refused compile got `undefined` while the
    // same question on a refused `spell` got a sentence. One envelope, one place
    // it is written, and the compile-shaped fields in it so `compile.ts` still
    // reads a refusal the way it reads a failed layout.
    Reply::fail(format!("{reason_he} · {reason_en}"))
}

/// Why a request could not be read at all, in both languages.
///
/// Carried rather than formatted, because the two services that read a request
/// answer in different shapes — a compile answers with a failed compile, an
/// assembly answers with no source — and neither should be describing the
/// other's response.
pub(crate) struct Unreadable {
    he: String,
    en: String,
}

/// The document a request describes, and nothing about what to do with it.
///
/// Two services need exactly this: `compile`, which lays it out, and
/// `assemble`, which wants only the Typst that would have been laid out. They
/// read it here rather than parsing the same JSON twice, because "export .typ"
/// has to produce the bytes the compile would have produced — and two readers
/// of one request that agree only by inspection is this repository's own bug
/// family with a different noun.
pub(crate) struct DocumentRequest {
    /// The request itself, for the fields that are about the *call* rather than
    /// about the document: `want_pdf`, `have_pages`, `format`.
    v: serde_json::Value,
    /// The body with `#כלול` resolved, and the line map back to each chapter.
    expanded: include::Expanded,
    cfg: DocConfig,
}

/// Read the document out of a request, or say why it could not be read.
///
/// # The validation seam, stated where a client author will read it
///
/// Two philosophies meet at this boundary and **both are deliberate**. A request
/// field this function does not know (`fontX`, `paperX`) is *ignored*: the HTTP
/// contract belongs to clients that ship on their own schedule, and refusing an
/// unknown field would make every older client break against every newer engine
/// instead of simply missing a feature it never asked for. A configuration key
/// the *prelude* does not know (`#הגדרות_הערות(גדול: …)`) is *refused by name*:
/// that text is the writer's own document, a typo there is a dead knob in their
/// sefer, and silence is exactly what this product refuses to be. The first is
/// about versioning across a wire; the second is about honesty inside a page.
pub(crate) fn read_document(input_json: &str) -> Result<DocumentRequest, Unreadable> {
    // A request that does not parse is not an empty document.
    //
    // This used to fall back to `Value::Null`, which reads every field as absent:
    // an empty body, which compiles perfectly happily into one blank page and is
    // returned as `ok: true`. A truncated upload or a corrupted request therefore
    // blanked the writer's preview and said nothing about why. The real client
    // always sends valid JSON, so reaching this means something went wrong on the
    // wire, and the honest answer is to say so.
    let v: serde_json::Value = serde_json::from_str(input_json).map_err(|e| Unreadable {
        he: format!("הבקשה לא נקראה — ייתכן שההעברה נקטעה ({e})"),
        en: format!("the request could not be read — the transfer may have been truncated ({e})"),
    })?;
    // …and neither is a request whose `body` is missing or is not text.
    //
    // The check above caught JSON that fails to parse, but stopped there: JSON
    // that parsed and simply had no `body` — or a `body` that was a number, an
    // object, or `null` — still fell through to `unwrap_or("")` and compiled one
    // blank page reported as `ok: true`. That is the same silent-blank-preview
    // failure, reached by a different route, and it deserves the same answer.
    // An *empty* string stays perfectly legitimate: that is a new document.
    let body = match v.get("body") {
        Some(b) => match b.as_str() {
            Some(s) => s,
            None => {
                return Err(Unreadable {
                    he: "הבקשה לא נקראה — שדה הטקסט של המסמך אינו טקסט".into(),
                    en: "the request could not be read — the document's body field is not text"
                        .into(),
                })
            }
        },
        None => {
            return Err(Unreadable {
                he: "הבקשה לא נקראה — אין במסמך שדה טקסט".into(),
                en: "the request could not be read — it carries no document body".into(),
            })
        }
    };
    let cfg = DocConfig::from_json(&v);
    // A sefer is many files. `#כלול("פרק ג")` is expanded here, before anything is
    // compiled, and the expansion keeps a line map so a diagnostic can still name
    // the chapter it belongs to rather than a line number in a concatenation that
    // exists nowhere. A request with no `parts` expands to itself, at no cost.
    let parts = include::from_request(&v);
    // The writer's own budget, not the default one: the whole point of the setting
    // is that a sefer with a genuinely large apparatus can raise it.
    let limits = include::Limits {
        warn: cfg.max_lines_warn.max(1.0) as usize,
        refuse: cfg.max_lines_refuse.max(1.0) as usize,
    };
    let expanded = include::expand(body, &parts, limits);
    Ok(DocumentRequest { v, expanded, cfg })
}

/// The assembled Typst source for a document, with no compile behind it.
///
/// "Export .typ" used to be a full render — PDF encoded and all — thrown away
/// except for the one string the response happened to carry. `assemble_source`
/// is pure and takes microseconds; the layout it was hiding behind takes
/// seconds on a sefer. Same bytes, same includes, same page setup, because both
/// services read the request through [`read_document`] and hand the same body
/// and config to the same function.
///
/// Input: a compile request. Output: `{ok, typst_source, diagnostics}` — the
/// diagnostics being the ones `#כלול` can produce on its own, since a chapter
/// that does not exist is a hole in the exported file and the writer should be
/// told before they send it to a printer.
pub fn assemble_request(input_json: &str) -> Reply {
    let d = match read_document(input_json) {
        Ok(d) => d,
        // A request that cannot be read is a **refusal** — the document was
        // never looked at — and not a verdict on a document with problems. Two
        // different answers, and `assembling` reports both at `ok: false`; the
        // difference is this one carries `error` and no `typst_source` (#215).
        Err(why) => return Reply::fail(format!("{} · {}", why.he, why.en)),
    };
    let diagnostics: Vec<Diagnostic> = d
        .expanded
        .problems
        .iter()
        .map(|p| Diagnostic::ours("error", p.clone()))
        .collect();
    // Two arrangements of one document, and `compact` is the one a writer
    // asking for a *small* file gets (#130): the prelude is not inlined but
    // imported from a sibling `ksav.typ`, which this same response hands over —
    // so the pair is still whole. The prelude's bytes here are `prelude_text()`,
    // the same string `prelude_source()` compiles, so the file the writer saves
    // and the file a compile reads cannot be different documents.
    let compact =
        d.v.get("compact")
            .and_then(|x| x.as_bool())
            .unwrap_or(false);
    let (source, prelude) = if compact {
        (main_source(&d.expanded.text, &d.cfg), prelude_text())
    } else {
        (assemble_source(&d.expanded.text, &d.cfg), String::new())
    };
    Reply::ok(serde_json::json!({
        "ok": diagnostics.is_empty(),
        "typst_source": source,
        "prelude": prelude,
        "prelude_name": PRELUDE_PATH,
        "diagnostics": diagnostics,
    }))
}

pub fn compile_request(input_json: &str) -> Reply {
    use base64::Engine as _;
    let DocumentRequest { v, expanded, cfg } = match read_document(input_json) {
        Ok(d) => d,
        Err(why) => return malformed_request(&why.he, &why.en),
    };
    let body: &str = &expanded.text;
    // Assets resolve from a per-process cache keyed by content hash, so an
    // unchanged image is not re-sent and re-decoded on every keystroke. Any hash
    // the cache no longer holds comes back so the client re-sends the bytes.
    let (assets, missing_assets, refused) = Assets::from_request(&v);

    // `{"format": "html"}` asks for the web export instead of a paged render.
    if v.get("format").and_then(|x| x.as_str()) == Some("html") {
        return Reply::ok(match compile_html(body, &cfg, &assets) {
            Ok(html) => {
                serde_json::json!({ "ok": true, "html": html, "diagnostics": [], "missing_assets": missing_assets, "asset_cache": "sha256" })
            }
            Err(diags) => serde_json::json!({
                "ok": false,
                "html": serde_json::Value::Null,
                "diagnostics": diags,
                "missing_assets": missing_assets,
                "asset_cache": "sha256",
            }),
        });
    }

    // Previews don't want a PDF or the assembled source; export and print do,
    // and say so.
    let flag = |k: &str| v.get(k).and_then(|x| x.as_bool()).unwrap_or(false);
    let wants = Wants {
        pdf: flag("want_pdf"),
        source: flag("want_source"),
        // Asked for by a preview pane that is following a narrowed source pane,
        // and by nothing else.
        lines: flag("want_lines"),
        // Asked for by the notes drawer while it is open, and by nothing else.
        markers: flag("want_markers"),
        // Asked for by the find drawer while it is searching the preview, and
        // by nothing else.
        text: flag("want_text"),
    };
    // Pages the client already has, by fingerprint.
    //
    // A one-character edit in a 48-page document leaves 47 pages byte-identical
    // and changes 40 KB of 9.7 MB — and all 9.7 MB used to be serialised, sent,
    // parsed and written into the DOM on every pause in typing. The client says
    // which pages it is still holding; anything it already has comes back as
    // `null` beside its fingerprint, and it puts its own copy back.
    //
    // The engine keeps no per-client state for this. It answers only against the
    // list on the request, so two windows, a reload, or a restarted server can
    // never leave it believing something about a client that is not true.
    let have: std::collections::HashSet<String> = v
        .get("have_pages")
        .and_then(|x| x.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|h| h.as_str())
                .map(str::to_owned)
                .collect()
        })
        .unwrap_or_default();
    let mut result = compile_parts(body, &cfg, &assets, wants, &have);
    // Back into each chapter's own coordinates, and say out loud what the
    // expansion could not do — a name nothing answers to, a loop.
    include::relabel(&expanded, &mut result.diagnostics);
    // The same translation for the page runs, and it is a separate call rather
    // than a line inside the one above because the two carry different things:
    // a diagnostic has one line to move, and a run has to be *split* where a
    // page holds the end of one chapter and the head of the next.
    pagelines::relabel(&expanded, &mut result.pages_lines);
    // And the same for the printed lines, which is simpler than either: a
    // printed line is one line of one file, so there is nothing to split.
    pagetext::relabel(&expanded, &mut result.pages_text);
    // And the third translation, which is a deletion — see `notemarks::keep_main`
    // for why a marker from an included chapter cannot be moved into the open
    // document's coordinates the way a page run can.
    notemarks::keep_main(&expanded, body, &mut result.note_markers);
    for problem in &expanded.problems {
        result
            .diagnostics
            .push(Diagnostic::ours("error", problem.clone()));
    }
    // A refused asset name is a warning, not a problem with the sefer: the
    // document still typesets, the image simply is not there, and the writer is
    // owed the reason. Announced rather than dropped, because the alternative is
    // a file that silently does not appear.
    result.diagnostics.extend(refused.diagnostics());

    // Pages the client already has, by fingerprint.
    //
    // A one-character edit in a 48-page document leaves 47 pages byte-identical
    // and changes 40 KB of 9.7 MB — and all 9.7 MB used to be serialised, sent,
    // parsed and written into the DOM on every pause in typing. The client says
    // which pages it is still holding; anything it already has comes back as
    // `null` beside its fingerprint, and it puts its own copy back.
    //
    // The engine keeps no per-client state for this. It answers only against the
    // list on the request, so two windows, a reload, or a restarted server can
    // never leave it believing something about a client that is not true.
    // The set is read *before* the compile now and handed down, because the
    // saving is in not serialising rather than in not sending. See
    // `compile_parts`.
    let fingerprints = std::mem::take(&mut result.pages_hash);
    let pages: Vec<serde_json::Value> = result
        .pages_svg
        .iter()
        .zip(&fingerprints)
        .map(|(svg, fp)| {
            if have.contains(fp) {
                serde_json::Value::Null
            } else {
                serde_json::Value::String(svg.clone())
            }
        })
        .collect();

    let diags = &result.diagnostics;
    let pdf_b64 = result
        .pdf
        .as_ref()
        .map(|p| base64::engine::general_purpose::STANDARD.encode(p));
    Reply::ok(serde_json::json!({
        "ok": result.ok(),
        // Each entry is the page's SVG, or `null` when the client said it already
        // holds the page with that fingerprint.
        "pages_svg": pages,
        // One fingerprint per page, always — it is what the client stores its
        // copy under and what it sends back next time.
        "pages_hash": fingerprints,
        "pdf_base64": pdf_b64,
        "diagnostics": diags,
        "typst_source": result.typst_source,
        // Which of the writer's lines printed on each page — empty unless
        // `want_lines` asked. One entry per page, in page order, so the client
        // can index it by page number; see `pagelines`.
        "pages_lines": result.pages_lines,
        // What each page says — empty unless `want_text` asked. One entry per
        // page, in page order, each line in reading order; see `pagetext`.
        "pages_text": result.pages_text,
        // What each note's marker printed as — empty unless `want_markers`
        // asked. A flat list of (marker, offset) pairs and **not** a list of
        // notes; the client intersects it with the note bodies it already holds.
        // See `notemarks`.
        "note_markers": result.note_markers,
        // Hashes the client thought were cached but the engine no longer holds;
        // it re-sends their bytes on the next compile.
        "missing_assets": missing_assets,
        // New clients use this capability before omitting bytes. An older
        // engine omits it, so they can safely fall back to sending bytes rather
        // than entering a missing/retry round trip on every request.
        "asset_cache": "sha256",
    }))
}

/// Compile to Typst's native HTML — real reflowable web content.
///
/// "Export HTML" used to wrap the rendered SVG *page images* in a bit of HTML:
/// fixed-size pictures of pages, not something you can reflow, copy, search or
/// read on a phone. This produces genuine semantic markup instead — headings are
/// `<h1>`…`<h6>`, emphasis is `<strong>`/`<em>`, paragraphs are `<p>`.
///
/// Typst's HTML export is still under development, so this can fail on a
/// document the paged backend handles fine; callers should keep the paged export
/// available and report the diagnostics rather than presenting HTML as
/// equivalent.
pub fn compile_html(
    body: &str,
    cfg: &DocConfig,
    assets: &Assets,
) -> Result<String, Vec<Diagnostic>> {
    let source = main_source(body, cfg);
    let located = Located::of(&source, body);
    // `engine_for`, not a second copy of its body.
    //
    // This *was* a copy, and it had lost exactly one line: the
    // `comemo_evict_max_age(Some(10))` that keeps Typst's memoisation cache
    // alive between compiles. `typst-as-lib` defaults it to `Some(0)`, which
    // evicts **everything, globally** — comemo's cache is process-wide, not
    // per-engine, which is the property `layout_source` relies on to survive
    // being run on a fresh thread per compile.
    //
    // So one click on **Export Word** flushed the entire cache and the writer's
    // next keystroke was a cold compile: fonts reloaded, glyphs reshaped, every
    // unchanged region laid out again. That defeated a nine-line comment five
    // hundred lines above explaining why the cache must survive — from a
    // function whose only difference is which document type it asks for.
    let engine = engine_for(source, assets);
    let Warned { output, warnings } = engine.compile::<typst_html::HtmlDocument>();
    match output {
        Ok(doc) => match typst_html::html(&doc, &typst_html::HtmlOptions::default()) {
            Ok(s) => Ok(with_document_direction(&s, cfg)),
            Err(diags) => Err(located.all(&diags, "error")),
        },
        Err(err) => {
            let mut d = located.all(&warnings, "warning");
            use typst_as_lib::TypstAsLibError::*;
            match err {
                TypstSource(x) => d.extend(located.all(&x, "error")),
                other => d.push(Diagnostic::ours("error", other.to_string())),
            }
            Err(d)
        }
    }
}

/// Put the document's own direction — and its language, when Typst left it
/// unsaid — on the exported HTML's **root element** (#132).
///
/// Typst's HTML export writes `<html lang="he">` and no `dir` at all. An
/// unmarked `dir` is `ltr`, and that is not a neutral default: a browser reading
/// a Hebrew sefer laid out as LTR puts the full stop of a Hebrew sentence on the
/// wrong side of it, orders list markers wrongly, and starts each paragraph at
/// the left — on the one export whose entire purpose is that somebody else can
/// read the sefer on their own machine.
///
/// This was the third of three HTML producers with three different contracts:
/// the page-image fallback carried `dir` on `<html>` (`app/src/exports.ts`), the
/// Word envelope carried it on `<body>`, and this one carried nothing. Now the
/// engine states it, where the document's configuration is anyway, so every
/// caller of `format: "html"` gets it — the request route, the export route, and
/// whatever grows next.
///
/// `dir` is set on the *page* and not around every paragraph: the content also
/// holds inline English, math and citations, and those runs carry their own
/// direction from the text itself. A per-paragraph override would take that away
/// from them and is the thing Unicode bidi already does correctly.
pub fn with_document_direction(html: &str, cfg: &DocConfig) -> String {
    let dir = if cfg.dir == "ltr" { "ltr" } else { "rtl" };
    let Some(start) = html.find("<html") else {
        // Not a document this can speak about — a future Typst emitting a
        // fragment, say. Returning it unchanged is better than wrapping it in a
        // guess at an envelope this function has not been taught to build.
        return html.to_string();
    };
    let Some(rel_end) = html[start..].find('>') else {
        return html.to_string();
    };
    let end = start + rel_end;
    let tag = &html[start..end];
    let mut insert = String::new();
    if !tag.contains("dir=") {
        insert.push_str(&format!(" dir=\"{dir}\""));
    }
    if !tag.contains("lang=") {
        insert.push_str(&format!(" lang=\"{}\"", effective_lang(cfg)));
    }
    if insert.is_empty() {
        return html.to_string();
    }
    let mut out = String::with_capacity(html.len() + insert.len());
    out.push_str(&html[..end]);
    out.push_str(&insert);
    out.push_str(&html[end..]);
    out
}

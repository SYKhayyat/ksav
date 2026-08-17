//! What each note's marker actually printed as.
//!
//! # The question this answers, and who is asking
//!
//! The notes drawer lists every note in the document with a number beside it.
//! That number used to be the row's position in a flat list; it now counts
//! within each note's own series, which is right about the *count* and still
//! silent about the *scheme*. A stream configured `מספור: "א"` prints א, ב on
//! the page and the drawer says 1, 2 — so the panel whose whole job is *find the
//! note you are looking at* prints an ordinal that appears nowhere in the sefer.
//!
//! Closing that in the editor would mean a second implementation of numbering
//! the engine already owns, in a language that cannot see the page. This is the
//! other way round: the layout that has just happened already printed the
//! marker, so the marker is read off it and handed back. The drawer's number
//! becomes *the* number by construction, and a scheme nobody has thought of yet
//! needs no work here at all.
//!
//! # Why the obvious implementation does not work
//!
//! [`crate::pagelines`] asks every glyph which line of the writer's text it came
//! from, and the plan for this was the same walk asking the marker glyphs where
//! their note is. **Marker glyphs have no such answer.** A marker is generated —
//! `super(numbering(scheme, n))`, run inside the prelude — so its span points at
//! `ksav.typ`, which is not a file the writer has. Measured, not assumed: every
//! marker run in every arrangement resolves to nothing.
//!
//! What *does* resolve is the note's own prose, because that is the writer's
//! content passed through untouched. And every apparatus in this product lays an
//! entry out the same way — «marker» «body» — with the two as **siblings in one
//! frame**:
//!
//! ```text
//! group
//!   <super> TEXT "א"        ← generated: no span into the writer's text
//!   TEXT " ראשונה"          ← the writer's own: offset 85
//! ```
//!
//! So the marker is not resolved. It is *paired*: the run that resolves to
//! nothing, beside the run that resolves to somewhere. That holds for native
//! footnotes, for the collected apparatus at the page foot, for endnotes and for
//! a deferred body at the end of the file, because all four are one entry shape.
//!
//! # What the caller gets, and what it must still do
//!
//! A flat list of (marker, offset) pairs, where the offset is into the writer's
//! own text. It is deliberately **not** a list of notes: this module has no idea
//! what a note is — that is `app/src/notes.ts`, and a second opinion about it
//! here is the defect family this repository is named for. The client already
//! holds every note's body range and intersects.
//!
//! The list therefore carries pairs that belong to no note at all. The marker
//! printed *in the prose* is followed by the sentence it interrupts, which
//! resolves to ordinary text: that pair is real, correct and about nothing the
//! caller wants, and it costs the caller one range test to drop. Reporting it is
//! better than a rule here for suppressing it, because such a rule would have to
//! know which region of the page it was walking, and being wrong about that
//! would drop a *note's* marker silently.
//!
//! # A note that cannot be paired gets no marker, and that is the point
//!
//! `#הערה[]` prints a marker over an empty entry, so there is no prose beside it
//! and no pair. The note comes back with nothing and the drawer keeps counting
//! for it. That is the whole bargain: the answer is either the marker that
//! printed or no answer, never a plausible number. A clamp into the legal range
//! is what this repository calls `ONLY_AT_TOP`, and the caret bug that named it
//! produced a valid answer every single time.

use crate::include::Expanded;
use crate::pagelines::{line_at, line_starts};
use crate::PagedDocument;
use typst::layout::{Frame, FrameItem};
use typst::syntax::{Source, Span};

/// The marker being accumulated, and whether more text may still join it.
struct Pending {
    text: String,
    open: bool,
}

/// One printed marker, and where the prose it introduces begins.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct NoteMarker {
    /// The marker exactly as it printed — `1`, `א`, `1.`, `*`.
    pub marker: String,
    /// Byte offset into the writer's own text of the first character of the
    /// prose this marker was printed beside.
    pub at: usize,
}

/// Every marker the layout printed, paired with the prose beside it.
pub fn note_markers(doc: &PagedDocument, main: &Source, body: &str) -> Vec<NoteMarker> {
    let offset = crate::diagnostics::body_offset_of(main.text(), body);
    let mut out = Vec::new();
    for page in doc.pages() {
        collect(&page.frame, main, offset, &mut out);
    }
    out
}

/// The pairing, over one frame and its children.
///
/// **Pending state is this frame's own.** It is not inherited by a child frame
/// and never survives one, which is what keeps a marker from reaching across an
/// entry boundary to claim the next note's prose. Measured case: a note's marker
/// in the prose is still pending when the walk arrives at the apparatus at the
/// foot of the page, and without this it would pair with the first note's body
/// down there and be wrong about every row.
fn collect(frame: &Frame, main: &Source, offset: usize, out: &mut Vec<NoteMarker>) {
    let mut pending: Option<Pending> = None;

    for (_, item) in frame.items() {
        match item {
            FrameItem::Group(group) => collect(&group.frame, main, offset, out),
            FrameItem::Text(text) => {
                match first_byte(&text.glyphs, main, offset) {
                    // The writer's own words. If a marker is waiting, this is
                    // the prose it was printed beside.
                    Some(at) => {
                        if let Some(p) = pending.take() {
                            out.push(NoteMarker { marker: p.text, at });
                        }
                    }
                    // Generated text: a marker, a page number, a rule's label.
                    None => match &mut pending {
                        // Two runs of generated text with nothing between them
                        // are one marker. An endnote prints `1` and `.` as
                        // separate runs and the reader sees `1.`.
                        Some(p) if p.open => p.text.push_str(&text.text),
                        // A *second* marker before any prose — a note whose body
                        // opens with a nested note, whose marker prints first.
                        // The first one is this entry's; the second belongs to
                        // the entry it will get of its own.
                        Some(_) => {}
                        None => {
                            pending = Some(Pending {
                                text: text.text.to_string(),
                                open: true,
                            })
                        }
                    },
                }
            }
            // A tag ends the marker without ending the wait for prose. Every
            // marker is wrapped — in `super`, in a footnote entry, in both — so
            // the tag between two generated runs is exactly what tells one
            // marker from the next. `1` `.` have no tag between them; `1` and a
            // nested note's `2` have four.
            FrameItem::Tag(_) => {
                if let Some(p) = &mut pending {
                    p.open = false;
                }
            }
            FrameItem::Shape(..) | FrameItem::Image(..) | FrameItem::Link(..) => {}
        }
    }
}

/// The earliest place in the writer's text this run came from, if anywhere.
///
/// The minimum rather than the first glyph's, because a right-to-left run is
/// laid out in visual order and its first glyph is the end of the word. What the
/// caller wants is where the prose *starts*.
fn first_byte(glyphs: &[typst::text::Glyph], main: &Source, offset: usize) -> Option<usize> {
    let mut best: Option<usize> = None;
    let mut last: Option<Span> = None;
    for glyph in glyphs {
        // Every glyph of a word carries the same span; resolving once per letter
        // is the same answer for an order of magnitude more work. The same guard
        // `pagelines::collect` keeps, for the same reason.
        if last == Some(glyph.span.0) {
            continue;
        }
        last = Some(glyph.span.0);
        if let Some(b) = crate::diagnostics::body_byte_of(glyph.span.0, main, offset) {
            best = Some(best.map_or(b, |x: usize| x.min(b)));
        }
    }
    best
}

/// Drop every marker whose prose lives in an included file.
///
/// The counterpart of [`crate::pagelines::relabel`], and it deletes where that
/// one translates. A `LineRun` is *about* a page, so a run from a chapter still
/// belongs on the page it printed on. A marker is about a **note the client
/// holds**, and the client holds the document that is open — so an offset into
/// `פרק א.ksav` is an offset into a string this client has not got, and it would
/// land inside whatever note of the open document happens to cover that number.
/// A wrong marker on a real note is worse than no marker at all.
pub fn keep_main(expanded: &Expanded, body: &str, marks: &mut Vec<NoteMarker>) {
    if expanded.origins.is_empty() {
        return;
    }
    let starts = line_starts(body);
    marks.retain(|m| {
        expanded
            .origin_of(line_at(&starts, m.at))
            .is_none_or(|o| o.file.is_none())
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::DocConfig;

    /// Every (marker, prose) pair a document printed.
    fn marks_of(body: &str) -> Vec<NoteMarker> {
        let cfg = DocConfig::default();
        let doc = crate::compile_doc(body, &cfg).expect("the document lays out");
        let main = Source::detached(crate::main_source(body, &cfg));
        note_markers(&doc, &main, body)
    }

    /// The marker printed for the prose starting at `at`, the way a client asks:
    /// the earliest pair inside the range, because an entry prints its marker
    /// before the first word of its body and nothing else in that body is
    /// earlier.
    fn marker_in(marks: &[NoteMarker], from: usize, to: usize) -> Option<&str> {
        marks
            .iter()
            .filter(|m| from <= m.at && m.at < to)
            .min_by_key(|m| m.at)
            .map(|m| m.marker.as_str())
    }

    /// The offsets of a body, found by searching for its text — so a test reads
    /// as the document does rather than as a byte count nobody can check.
    fn range(body: &str, prose: &str) -> (usize, usize) {
        let at = body.find(prose).expect("the prose is in the document");
        (at, at + prose.len())
    }

    /// The plain case, and the one the whole feature is for: what the page
    /// prints is what comes back.
    #[test]
    fn a_footnote_reports_the_number_it_printed() {
        let body = "שלום#הערה[ראשונה] עולם#הערה[שניה] סוף";
        let marks = marks_of(body);
        let (f1, t1) = range(body, "ראשונה");
        let (f2, t2) = range(body, "שניה");
        assert_eq!(marker_in(&marks, f1, t1), Some("1"), "{marks:?}");
        assert_eq!(marker_in(&marks, f2, t2), Some("2"), "{marks:?}");
    }

    /// **The reason this module exists.** A stream numbered `א` prints א and ב,
    /// and the drawer counted 1 and 2 — the right count in the right series and
    /// a number that is on no page of the sefer.
    ///
    /// Nothing here knows what `מספור` is or how a Hebrew numeral is spelled.
    /// That is the property worth having: a scheme added to the prelude arrives
    /// in the drawer with no work on this side at all.
    #[test]
    fn a_stream_reports_its_own_scheme() {
        let body = "#ערוץ(\"ביאור\", מספור: \"א\")\n\nשלום#הערה(ערוץ: \"ביאור\")[ראשונה] עולם#הערה(ערוץ: \"ביאור\")[שניה]";
        let marks = marks_of(body);
        let (f1, t1) = range(body, "ראשונה");
        let (f2, t2) = range(body, "שניה");
        assert_eq!(marker_in(&marks, f1, t1), Some("א"), "{marks:?}");
        assert_eq!(marker_in(&marks, f2, t2), Some("ב"), "{marks:?}");
    }

    /// A note on a note. Both entries are found, and neither claims the other's
    /// prose — the case the per-frame pending state exists for.
    #[test]
    fn a_nested_note_and_its_parent_keep_their_own_markers() {
        let body = "שלום#הערה[אבג#הערה_בדרגה(2)[דהו]] סוף";
        let marks = marks_of(body);
        let (outer, _) = range(body, "אבג");
        let (inner, inner_to) = range(body, "דהו");
        // The outer note's body *contains* the inner one, so a client asks for
        // the innermost note holding an offset. Its own prose starts first.
        assert_eq!(marker_in(&marks, outer, outer + 6), Some("1"), "{marks:?}");
        assert_eq!(marker_in(&marks, inner, inner_to), Some("2"), "{marks:?}");
    }

    /// A note whose body **opens** with a nested note, which is where two
    /// markers are laid out back to back with nothing of the writer's between
    /// them.
    ///
    /// This is the case the tag rule is for, and it is the only one: everywhere
    /// else a marker is followed by prose, which pairs and clears. Here the
    /// parent's `1` and the child's `2` are adjacent, and the two rules that
    /// keep them apart are both exercised — the tag between them closes the
    /// first to further text, so it cannot become `12`, and the second is then
    /// dropped rather than replacing it, so the parent does not answer to its
    /// child's marker.
    #[test]
    fn a_body_that_opens_with_a_nested_note_keeps_its_own_marker() {
        let body = "שלום#הערה[#הערה_בדרגה(2)[דהו]אבג] סוף";
        let marks = marks_of(body);
        let (outer, _) = range(body, "אבג");
        let (inner, inner_to) = range(body, "דהו");
        assert_eq!(marker_in(&marks, outer, outer + 6), Some("1"), "{marks:?}");
        assert_eq!(marker_in(&marks, inner, inner_to), Some("2"), "{marks:?}");
    }

    /// An endnote's marker prints as `1.`, and it comes back as `1.` — two runs
    /// of generated text with no tag between them are one marker.
    #[test]
    fn an_endnote_carries_the_punctuation_it_prints() {
        let body = "שלום#הערתסיום[ראשונה] עולם#הערתסיום[שניה]\n\n#הערות_בסוף()";
        let marks = marks_of(body);
        let (f1, t1) = range(body, "ראשונה");
        assert_eq!(marker_in(&marks, f1, t1), Some("1."), "{marks:?}");
    }

    /// A note written the deferred way — the marker in the prose, the words at
    /// the end of the file — is one note, and the pair lands on the words.
    #[test]
    fn a_deferred_body_is_marked_where_its_words_are() {
        let body = "שלום#הערה_בשם(\"א\") עולם\n\n#גוף_הערה(\"א\")[הפרוזה בסוף]";
        let marks = marks_of(body);
        let (from, to) = range(body, "הפרוזה בסוף");
        assert_eq!(marker_in(&marks, from, to), Some("1"), "{marks:?}");
    }

    /// A note with nothing in it gets **no** marker rather than a plausible one.
    ///
    /// Its entry prints a number over an empty body, so there is no prose to
    /// pair with. The next note's marker must not slide up into the hole — which
    /// is exactly what a walk that carried pending state across frames would do.
    #[test]
    fn an_empty_note_reports_nothing_and_does_not_borrow() {
        let body = "שלום#הערה[] עולם#הערה[שניה] סוף";
        let marks = marks_of(body);
        let (f2, t2) = range(body, "שניה");
        assert_eq!(marker_in(&marks, f2, t2), Some("2"), "{marks:?}");
        assert!(
            !marks.iter().any(|m| m.marker == "1" && m.at >= f2),
            "the empty note's marker was handed to the note after it: {marks:?}"
        );
    }

    /// The page number is generated text too, and it is not a marker.
    ///
    /// It resolves to nothing exactly as a marker does, and the only thing that
    /// tells them apart is that nothing of the writer's is laid out beside it.
    /// A document with no notes at all must therefore come back empty — if this
    /// fails, every document in the product has a spurious pair in it.
    #[test]
    fn a_document_with_no_notes_has_no_markers() {
        let marks = marks_of("שלום עולם\n\nשורה שניה");
        assert!(marks.is_empty(), "{marks:?}");
    }

    /// Two pages, so the page number is printed twice and a running head could
    /// carry the writer's own words — the arrangement where a page-level artifact
    /// has body text after it rather than before.
    #[test]
    fn a_running_head_does_not_become_a_marker() {
        let body = "#כותרת_עליונה[ראש רץ]\n\nראשון#הערה[הערה שלי]\n\n#מעבר_עמוד\n\nאחרון.";
        let marks = marks_of(body);
        let (from, to) = range(body, "הערה שלי");
        assert_eq!(marker_in(&marks, from, to), Some("1"), "{marks:?}");
        let (head, head_to) = range(body, "ראש רץ");
        assert_eq!(
            marker_in(&marks, head, head_to),
            None,
            "the page number was paired with the running head: {marks:?}"
        );
    }

    /// A marker whose prose is in an included chapter is dropped, because the
    /// offset means nothing in the document the client has open.
    #[test]
    fn a_marker_from_an_included_file_is_dropped() {
        use crate::include::Origin;
        let body = "שורה\nשל\nהספר";
        let expanded = Expanded {
            text: String::new(),
            origins: vec![
                Origin {
                    file: None,
                    line: 1,
                },
                Origin {
                    file: Some("פרק א.ksav".into()),
                    line: 1,
                },
                Origin {
                    file: None,
                    line: 3,
                },
            ],
            problems: Vec::new(),
        };
        let mut marks = vec![
            NoteMarker {
                marker: "1".into(),
                at: 0,
            },
            NoteMarker {
                marker: "2".into(),
                at: body.find("של").unwrap(),
            },
            NoteMarker {
                marker: "3".into(),
                at: body.find("הספר").unwrap(),
            },
        ];
        keep_main(&expanded, body, &mut marks);
        assert_eq!(
            marks.iter().map(|m| m.marker.as_str()).collect::<Vec<_>>(),
            vec!["1", "3"],
            "{marks:?}"
        );
    }

    /// With nothing included, nothing is dropped — the ordinary single-file
    /// case, where an empty origin table would otherwise delete every marker.
    #[test]
    fn without_inclusions_nothing_is_dropped() {
        let mut marks = vec![NoteMarker {
            marker: "1".into(),
            at: 4,
        }];
        keep_main(&Expanded::default(), "שלום", &mut marks);
        assert_eq!(marks.len(), 1);
    }
}

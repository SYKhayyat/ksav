//! The engine's unit tests: things only the crate can see.
//!
//! # Why they are not at the bottom of `lib.rs`
//!
//! They were — 1,995 lines of them, four fifths of everything the file held after
//! `#222`'s cuts, and they are what made a size fence on `lib.rs` read as a lie:
//! the file was "small" only because its tests were not counted. A test module of
//! a module's own size belongs in a file of its own, and the alternative — a fence
//! that measures "the file minus its tests" — is a number nobody can check by
//! looking.
//!
//! They are *unit* tests and stay inside the crate (`use super::*` is the crate
//! root): they assert private decisions — a page spec parsed from a string, a
//! refusal's diagnostic, a config field clamped — which is exactly what the
//! integration tests in `tests/` cannot reach.

#![cfg(test)]

mod tests {
    use crate::*;

    // ------------------------------------------------------- config validation
    //
    // Every one of these used to return `ok: true` with silently garbage output,
    // which is the worst answer a compiler can give: a page that looks like it
    // worked and is not what anybody asked for.

    /// The byte offset just past the `(` that closes the one `s` opens with.
    ///
    /// **This used to be library code.** `inject_reserve_into_writer_masmer`
    /// hand-walked a call's argument list to find out whether the writer had
    /// already named `אזור_הערות`, and needed this to do it. That function now
    /// resolves off the Typst parse (#58) — the parser already knows where the
    /// `)` is, and knows it better than a character counter does — so the only
    /// caller left was the test below and it moved here with them.
    ///
    /// Kept rather than deleted, because the test below is still worth having:
    /// it is the counter's own answers on the shapes a string or a nested tuple
    /// would confuse, and if anything ever walks a call's text again — which is
    /// how #58 happened — these are the cases that counter gets wrong.
    ///
    /// **Now built on [`code_ranges`]**, so the string-skipping is the same walk
    /// `named_arg` uses. It carried its own copy of that state machine until
    /// #57, and the two disagreeing is precisely how a value like `"a)b"` ended
    /// one argument in on one side and not the other.
    fn closing_paren(s: &str) -> Option<usize> {
        let mut depth = 0usize;
        for r in code_ranges(s) {
            for (j, c) in s[r.clone()].char_indices() {
                match c {
                    '(' => depth += 1,
                    ')' => {
                        depth = depth.saturating_sub(1);
                        if depth == 0 {
                            return Some(r.start + j);
                        }
                    }
                    _ => {}
                }
            }
        }
        None
    }

    fn cfg_from(json: serde_json::Value) -> DocConfig {
        DocConfig::from_json(&json)
    }

    /// Two cm figures that agree to within a rounding error.
    ///
    /// Was a `let near = …` closure written out in each of the reserve tests, and
    /// a fourth copy was one edit away when the channels arrived. The reserve is
    /// arithmetic over declared lengths, so an exact `==` fails on a sum that
    /// went through a percentage.
    fn near(got: f64, want: f64) -> bool {
        (got - want).abs() < 0.001
    }

    /// #55: the bounded reserve cache must not change a single answer.
    ///
    /// A cache is only allowed to be invisible, and the failure mode that matters
    /// is not "returns the wrong number" — it is **"returns a number belonging to
    /// another document"**, which is silent and looks like a layout bug. So the
    /// fence is stated as what the writer sees: for a set of distinct bodies, the
    /// answer must be the same whether it arrives first, last, or after the cache
    /// has been filled with other documents.
    ///
    /// The shapes are chosen for the cache, not for the reserve:
    ///
    /// * a **2-cycle**, which is two open windows and the pattern that made the
    ///   one-slot cache a 100% miss;
    /// * **more bodies than the cache holds**, so eviction is exercised and the
    ///   answer for an evicted body must still be right when it comes back;
    /// * **two sheets on one body**, because the key is `(body, sheet)` and the
    ///   two must not be confused — the one a `%` height would expose.
    #[test]
    fn the_reserve_cache_does_not_change_an_answer() {
        // Ten distinct bodies, each declaring a different band height, so every one has
        // a different correct answer and a mixed-up entry is visible rather than
        // coincidental.
        //
        // Two shapes have to be right or this fence measures nothing:
        //
        // * the band has to be **called**, not merely configured — the shapes are
        //   `גובהים: …` **and** `#מדף_א[…]`. An earlier version wrote
        //   `#הערות_במדפים` and every body reserved the same height, so the guard
        //   below caught a fence that could not see a mix-up.
        // * the interpolated `{n}` stays **out of the content block**. A `#name[…{`
        //   is the shape `prohibitions.test.mjs` refuses anywhere in
        //   `engine/src/` (#50's injection class), and a test fixture is not
        //   exempt from a fence that reads the file rather than the intent. The
        //   number goes in the declared height instead, which is what the reserve
        //   is read from, and the band's own body is a literal.
        let bodies: Vec<String> = (1..=10)
            .map(|n| format!("#הגדרות_מדפים(גבהים: ({n}cm,))\n\n#מדף_א[גוף]"))
            .collect();

        // The uncached answer, from the scan itself — the oracle.
        let want: Vec<f64> = bodies
            .iter()
            .map(|b| auto_notes_region_cm_scan(b, Some(29.7)))
            .collect();
        // …and they must not all be the same number, or the fence proves nothing.
        assert!(
            want.windows(2).any(|w| (w[0] - w[1]).abs() > 0.001),
            "every body reserved the same height — the test cannot see a mix-up"
        );

        // Cold: first sight of each, in order.
        for (body, want) in bodies.iter().zip(&want) {
            assert!(
                near(auto_notes_region_cm_sheet(body, Some(29.7)), *want),
                "cold answer differs for {body:?}"
            );
        }
        // Warm: every one is in the cache now, and re-reading must be identical.
        for (body, want) in bodies.iter().zip(&want) {
            assert!(
                near(auto_notes_region_cm_sheet(body, Some(29.7)), *want),
                "warm answer differs for {body:?}"
            );
        }
        // **A 2-cycle**, twice round, which is the shape that made one slot a
        // 100% miss. Both answers must stay right.
        for _ in 0..3 {
            for i in [0usize, 3, 0, 3] {
                assert!(
                    near(auto_notes_region_cm_sheet(&bodies[i], Some(29.7)), want[i]),
                    "a 2-cycle changed the answer for body {i}"
                );
            }
        }
        // **Overflow**: walk all ten, which is past `RESERVE_CACHE_CAP`, so the
        // first two are evicted — and an evicted body that comes back must still
        // be right.
        for _ in 0..2 {
            for (i, body) in bodies.iter().enumerate() {
                assert!(
                    near(auto_notes_region_cm_sheet(body, Some(29.7)), want[i]),
                    "after eviction the answer differs for body {i}"
                );
            }
        }
        // **Two sheets on one body.** The key is `(body, sheet)`, so the same
        // text at two paper sizes is two entries, and each must get its own
        // answer. A `%` region height is what makes the two genuinely different.
        let pct = "#הגדרות_מדפים(גבהים: (10%,))\n#מדף_א[גוף]";
        let on_a4 = auto_notes_region_cm_scan(pct, Some(29.7));
        let on_legal = auto_notes_region_cm_scan(pct, Some(35.56));
        for _ in 0..3 {
            assert!(
                near(auto_notes_region_cm_sheet(pct, Some(29.7)), on_a4),
                "A4 answer moved"
            );
            assert!(
                near(auto_notes_region_cm_sheet(pct, Some(35.56)), on_legal),
                "legal answer moved"
            );
        }
    }

    /// #55: the cache is bounded, and stays bounded.
    ///
    /// A map that grows without limit is a leak in a process that compiles on
    /// every keystroke, and the entry is 24 bytes of key plus a float. Eight is
    /// the cap because it is enough for the shapes that exist; the property worth
    /// holding is that the number of entries never exceeds it, whatever the
    /// caller does.
    #[test]
    fn the_reserve_cache_is_bounded() {
        for n in 0..64 {
            let body = format!("#הגדרות_מדפים(גבהים: ({n}cm,))\n#מדף_א[גוף]");
            auto_notes_region_cm_sheet(&body, Some(29.7));
            let len = RESERVE_CACHE.lock().map(|g| g.len()).unwrap_or(0);
            assert!(
                len <= RESERVE_CACHE_CAP,
                "the cache grew to {len} entries after {n} distinct bodies"
            );
        }
        assert_eq!(
            RESERVE_CACHE_CAP, 8,
            "the cap moved — say so in the comment"
        );
    }

    /// The built-in channels are the prelude's, and it says so once.
    ///
    /// `TIER_CHANNELS` is why a document full of `#הערה(ערוץ: "הערה_ב")` does not
    /// lose 3 cm off every page for an apparatus it is not using: those seven
    /// names are Typst's own balanced series. A copy of a list is a copy that
    /// goes stale, and this one goes stale *quietly* — the reserve grows and the
    /// sefer repaginates.
    #[test]
    fn the_tier_channels_match_the_prelude() {
        let start = PRELUDE
            .find("#let _ch_tiers = (")
            .expect("`_ch_tiers` is not defined in ksav.typ");
        let open = start + PRELUDE[start..].find('(').unwrap();
        let end = open + closing_paren(&PRELUDE[open..]).expect("unterminated `_ch_tiers`");
        let names: Vec<String> = PRELUDE[open + 1..end]
            .split(',')
            .map(|s| s.trim().trim_matches('"').trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();
        assert_eq!(
            names, TIER_CHANNELS,
            "the prelude's built-in channels and the reserve's idea of them have \
             parted company"
        );
    }

    #[test]
    fn a_channel_reserves_the_page_foot_only_when_it_lands_there() {
        // The default channel and its tiers are Typst's own balanced series and
        // expand the text region themselves — a reserve would take page height
        // from every document with an ordinary footnote in it.
        assert_eq!(auto_notes_region_cm("טקסט#הערה[גוף]"), 0.0);
        assert_eq!(
            auto_notes_region_cm("טקסט#הערה(ערוץ: \"הערה_ב\")[גוף]"),
            0.0,
            "a built-in tier is the native apparatus"
        );
        assert_eq!(
            auto_notes_region_cm("#ערוץ(\"שער\", מקור: \"הערה\")\nטקסט#הערה(ערוץ: \"שער\")[גוף]"),
            0.0,
            "a channel on a channel, with no region of its own, is a tier too"
        );
        // A channel placed at the back needs no page foot either.
        assert_eq!(
            auto_notes_region_cm(
                "#ערוץ(\"ביאור\", מיקום: \"סוף\")\nטקסט#הערה(ערוץ: \"ביאור\")[גוף]"
            ),
            0.0
        );
        // A channel nobody declared is a page-foot region of its own, and it is
        // the read-only footer apparatus — which is the one that runs off the
        // bottom of the sheet with nothing reserved.
        assert_eq!(
            auto_notes_region_cm("טקסט#הערה(ערוץ: \"מקורות\")[גוף]"),
            DEFAULT_REGION_CM + BAND_RULE_CM
        );
        // Declaring one and never writing into it reserves nothing — the rule the
        // band and stream configuration commands already follow.
        assert_eq!(
            auto_notes_region_cm("#ערוץ(\"ביאור\", מיקום: \"רגל\", גובה: 4cm)\nטקסט"),
            0.0
        );
        // And a declared height is the height that is taken off the margin.
        assert!(near(
            auto_notes_region_cm(
                "#ערוץ(\"ביאור\", מיקום: \"רגל\", גובה: 4cm)\nטקסט#הערה(ערוץ: \"ביאור\")[גוף]"
            ),
            4.0 + BAND_RULE_CM
        ));
        // Both spellings, because a document may be written in either.
        assert!(near(
            auto_notes_region_cm(
                "#channel(\"peirush\", placement: \"foot\", height: 4cm)\n\
                 text#fnote(channel: \"peirush\")[body]"
            ),
            4.0 + BAND_RULE_CM
        ));
    }

    #[test]
    fn channels_sharing_a_region_reserve_it_once() {
        // Two channels, one region, one slot. Reserving per channel would take
        // twice the page foot the apparatus actually occupies.
        let body = "#אזור(\"פירושים\", מיקום: \"רגל\", גובה: 3cm)\n\
                    #ערוץ(\"ביאור\", אזור: \"פירושים\")\n\
                    #ערוץ(\"מקורות\", אזור: \"פירושים\")\n\
                    טקסט#הערה(ערוץ: \"ביאור\")[א]#הערה(ערוץ: \"מקורות\")[ב]";
        assert!(near(auto_notes_region_cm(body), 3.0 + BAND_RULE_CM));
        // …and a channel takes its region's placement, so pointing both at a
        // region declared at the back reserves nothing at all.
        assert_eq!(
            auto_notes_region_cm(&body.replace("\"רגל\", גובה: 3cm", "\"סוף\"")),
            0.0
        );
    }

    #[test]
    fn a_note_written_into_a_region_by_name_reserves_the_region() {
        // `אזור:` is one of the five destinations the chooser writes, and the
        // filing reads the *region's* placement — so it reserves exactly as
        // `ערוץ:` does. Missing this spelling was a reserve of zero for a
        // document whose declared-height region printed off the paper.
        let body = "#אזור(\"צר\", מיקום: \"רגל\", גובה: 2cm)\n\
                    טקסט#הערה(אזור: \"צר\")[גוף]";
        assert!(near(auto_notes_region_cm(body), 2.0 + BAND_RULE_CM));
        // A note carrying both arguments lands in the region, not in two places,
        // so the region is reserved once and the undeclared channel reserves
        // nothing besides it.
        let both = "#אזור(\"r\", מיקום: \"רגל\", גובה: 2cm)\n\
                    טקסט#הערה(ערוץ: \"c\", אזור: \"r\")[גוף]";
        assert!(near(auto_notes_region_cm(both), 2.0 + BAND_RULE_CM));
    }

    #[test]
    fn a_declaration_carrying_a_region_argument_reserves_nothing() {
        // `#ערוץ("c", אזור: "r")` writes no note into anything; the keyed-on-
        // notes rule holds for the region spelling of the argument too.
        assert_eq!(
            auto_notes_region_cm(
                "#ערוץ(\"c\", אזור: \"r\")\n#אזור(\"r\", מיקום: \"רגל\", גובה: 4cm)\nטקסט"
            ),
            0.0
        );
    }

    #[test]
    fn closing_paren_skips_a_quoted_paren() {
        // The channel scans run over text that keeps its string literals, so a
        // value like `"a)b"` used to close the argument list one argument in and
        // the call was read short.
        assert_eq!(closing_paren("(\"a)b\", x)"), Some(9));
        assert_eq!(closing_paren("(\"a\\\"b)\")"), Some(8));
        assert_eq!(closing_paren("(unclosed"), None);
    }

    /// #57: a string literal is neither a key nor a boundary.
    ///
    /// `named_arg` searched and measured **raw text**, while its neighbour
    /// `closing_paren` skipped quoted spans. So an argument list whose earlier
    /// string happened to contain `גובה:` answered with the *string's* number,
    /// returned before the real argument was reached, and the foot band came out
    /// the size of the string — notes printing off the page with no diagnostic.
    ///
    /// The first assertion is the one the issue is about: the phantom wins,
    /// because `named_arg` returns on the **first** match and the string comes
    /// first. That is what makes it under-count rather than merely wrong.
    #[test]
    fn a_named_argument_is_never_read_out_of_a_string() {
        // **The key inside a string.** A region named after its contents, a
        // channel whose name quotes a command's own argument — both ordinary
        // things for a writer to type.
        assert_eq!(
            named_arg("\"גובה: 0.5cm\", גובה: 3cm", HEIGHT_ARG),
            Some("3cm".into()),
            "the string's height won over the declared one"
        );
        assert_eq!(
            named_arg("\"מיקום: רגל\"", PLACEMENT_ARG),
            None,
            "a string was read as a placement"
        );
        assert_eq!(
            named_arg("\"אזור: רגל\"", REGION_ARG),
            None,
            "a string was read as a region"
        );
        // `has_source` is a boolean, so a phantom here is a note declared as
        // having a source it does not have.
        assert_eq!(
            named_arg("\"מקור: רמב\\\"ם\"", SOURCE_ARG),
            None,
            "a source name was read as the source argument"
        );
        // …and the real ones still answer, in both spellings.
        assert_eq!(named_arg("גובה: 3cm", HEIGHT_ARG), Some("3cm".into()));
        assert_eq!(named_arg("height: 3cm", HEIGHT_ARG), Some("3cm".into()));
        assert_eq!(
            named_arg("\"שם\", מיקום: \"למעלה\"", PLACEMENT_ARG),
            Some("למעלה".into())
        );
    }

    /// #57's other half: a string is not a **boundary** either.
    ///
    /// The value scan ended at the first comma at depth zero, with no notion of
    /// quotes — so a name containing a comma came back truncated, and the
    /// apparatus it named was not the one the writer wrote. A name like
    /// `"מקורות, ביאורים"` is two registers in one string and is not a typo.
    #[test]
    fn a_comma_inside_a_string_does_not_end_a_value() {
        assert_eq!(
            named_arg("אזור: \"מקורות, ביאורים\"", REGION_ARG),
            Some("מקורות, ביאורים".into()),
            "the value was cut at the comma inside the string"
        );
        // The same scan, and the same answer, once more after another argument —
        // the depth counting that already worked must keep working.
        assert_eq!(
            named_arg("אזור: \"מקורות, ביאורים\", גובה: 1cm", REGION_ARG),
            Some("מקורות, ביאורים".into())
        );
        // A genuine comma at depth zero still ends it.
        assert_eq!(
            named_arg("אזור: \"מקורות\", גובה: 1cm", REGION_ARG),
            Some("מקורות".into())
        );
        // And a nested tuple still does not, which is what `גבהים` is.
        assert_eq!(
            named_arg("גובה: (1cm, 2cm), אזור: \"x\"", HEIGHT_ARG),
            Some("(1cm, 2cm)".into())
        );
    }

    /// `code_ranges` is the one walk, and both scanners are built on it — so it
    /// is worth pinning what it says about a string on its own.
    #[test]
    fn a_string_is_skipped_wholesale_including_its_escapes() {
        // Plain: everything is code.
        assert_eq!(code_ranges("abc"), vec![0..3]);
        // `a"b"c` — the string is bytes 1..4 inclusive of both quotes, so the
        // code either side is `a` and `c`.
        assert_eq!(code_ranges("a\"b\"c"), vec![0..1, 4..5]);
        // A `\"` does not end the string, so `b\"c` is inside it and only `a` and
        // the trailing `d` are code.
        assert_eq!(code_ranges("a\"b\\\"c\"d"), vec![0..1, 7..8]);
        // An unterminated string runs to the end and there is no code after it.
        assert_eq!(code_ranges("a\"bc"), vec![0..1]);
        // Nothing but a string is no code at all.
        assert!(code_ranges("\"abc\"").is_empty());
        assert!(code_ranges("").is_empty());
    }

    #[test]
    fn a_commented_out_channel_reserves_nothing() {
        // Parking an apparatus behind `//` while you decide about it must not
        // silently cost 3 cm on every page.
        assert_eq!(
            auto_notes_region_cm("// טקסט#הערה(ערוץ: \"מקורות\")[גוף]\nטקסט"),
            0.0
        );
        // A header whose *text* mentions a channel is text, not an apparatus.
        // The parser only produces a call for real call syntax, so a quoted
        // command in a running head cannot reserve anything — the old hand
        // scanner's known 3 cm over-reserve, written down here so it does not
        // come back.
        assert_eq!(
            auto_notes_region_cm("#כותרת_עליונה(\"ראה #מדף_א[שם]\")"),
            0.0
        );
    }

    /// #58: an inline `אזור_הערות:` that is not an argument is not a setting.
    ///
    /// The reader used to `body.find("אזור_הערות")` and take the number after the
    /// colon, so all four of these read as the writer fixing the reserve — and
    /// `grow_inline_reserve` **rewrote** it, silently, on every compile:
    ///
    /// | body | what `find` saw |
    /// |---|---|
    /// | a `//` line mentioning it | the comment's own number |
    /// | a `#block` string containing it | the string's number |
    /// | prose naming it | the next number in the sentence |
    /// | a `#מסמך` *without* it | nothing — but `inject` wrote one into a commented-out call |
    ///
    /// This is the last hand-rolled scan of its kind: `auto_notes_region_cm` had
    /// been moved onto the parse long ago (its own test says *"with the parser now
    /// doing the lexing"*), and the inline reserve had not. The fence is the four
    /// shapes above plus the four that must still work, because a fix that simply
    /// stopped finding the name would pass the first half and silently drop every
    /// writer's real setting.
    #[test]
    fn an_inline_reserve_is_only_read_from_a_call() {
        // **Prose.** The number after the colon is the next one in the sentence.
        assert_eq!(
            inline_reserve_cm("אפשר לכתוב אזור_הערות: 12 ואז לסמן כאן."),
            None,
            "a prose mention set the reserve"
        );
        // **A line comment** — which is what the editor's own "comment out"
        // command writes, so this is the shape a writer actually produces.
        assert_eq!(
            inline_reserve_cm("שלום\n// אזור_הערות: 9cm\nעולם"),
            None,
            "a commented-out reserve was read"
        );
        // **A block comment**, mid-line.
        assert_eq!(
            inline_reserve_cm("שלום /* אזור_הערות: 9cm */ עולם"),
            None,
            "a block-commented reserve was read"
        );
        // **A string.** A header or a note that quotes the argument name.
        assert_eq!(
            inline_reserve_cm("#כותרת_עליונה(\"אזור_הערות: 9cm\")"),
            None,
            "a string was read as a setting"
        );
        assert_eq!(
            inline_reserve_cm("#let x = \"אזור_הערות: 9cm\""),
            None,
            "a let-binding string was read as a setting"
        );
        // **Raw text**, where `#` is not even a code marker.
        assert_eq!(
            inline_reserve_cm("טקסט ```אזור_הערות: 9cm``` יותר"),
            None,
            "raw text was read as a setting"
        );

        // ---- and the shapes that must still be read ----
        // The paren form, both spellings, both units, alone and beside others.
        assert_eq!(
            inline_reserve_cm("#מסמך(אזור_הערות: 3.5cm)[\nטקסט\n]"),
            Some(3.5)
        );
        assert_eq!(
            inline_reserve_cm("#מסמך(אזור_הערות: 2cm)[\nטקסט\n]"),
            Some(2.0)
        );
        assert_eq!(
            inline_reserve_cm("#masmer(notes_region: 4cm)[\ntext\n]"),
            Some(4.0)
        );
        // Not the first argument.
        assert_eq!(
            inline_reserve_cm("#מסמך(כותרת: \"שם\", אזור_הערות: 2.5cm)[\nטקסט\n]"),
            Some(2.5)
        );
        // And a document that names no reserve at all has none.
        assert_eq!(inline_reserve_cm("סתם טקסט"), None);
        assert_eq!(inline_reserve_cm("#מסמך(כותרת: \"שם\")[\nטקסט\n]"), None);
    }

    /// #58's second half: `grow_inline_reserve` must rewrite a real call and
    /// **nothing else**.
    ///
    /// This is the half that did damage rather than merely misreported. Reading
    /// the wrong number was wrong; *writing over the wrong number* is what
    /// silently shortened a writer's text block, because the page-foot reserve is
    /// subtracted from every page.
    #[test]
    fn growing_the_inline_reserve_rewrites_a_call_and_nothing_else() {
        // The real thing: raised, and only the number changed.
        let grown = grow_inline_reserve("#מסמך(אזור_הערות: 1cm)[\nטקסט\n]", 4.0);
        assert!(
            grown.contains("אזור_הערות: 4.00cm"),
            "the reserve was not raised: {grown}"
        );
        assert!(!grown.contains("1cm"), "the old number survived: {grown}");
        // Already big enough: untouched, byte for byte.
        let body = "#מסמך(אזור_הערות: 6cm)[\nטקסט\n]";
        assert_eq!(grow_inline_reserve(body, 4.0), body);
        // A mention in a comment is not rewritten — and this is the assertion
        // that would have failed before the fix, because the text scan found the
        // name in the comment and wrote the grown number over the comment's.
        for mention in [
            "שלום\n// אזור_הערות: 1cm\nעולם",
            "שלום /* אזור_הערות: 1cm */ עולם",
            "#כותרת_עליונה(\"אזור_הערות: 1cm\")",
            "#let x = \"אזור_הערות: 1cm\"",
            "אפשר לכתוב אזור_הערות: 1cm כאן.",
        ] {
            assert_eq!(
                grow_inline_reserve(mention, 4.0),
                mention,
                "a mention was rewritten: {mention}"
            );
        }
        // And a call with no reserve argument is *not* given one here — that is
        // `inject_reserve_into_writer_masmer`'s job, and doing it in both places
        // is how the scanned value got into a call that never asked for it.
        let none = "#מסמך(כותרת: \"שם\")[\nטקסט\n]";
        assert_eq!(grow_inline_reserve(none, 4.0), none);
    }

    /// #58's third reader: `inject_reserve_into_writer_masmer` must write into a
    /// real call, and into nothing else.
    ///
    /// The old version scanned for a `#` and read the identifier after it, so a
    /// commented-out `#מסמך(` had an `אזור_הערות:` argument injected into the
    /// middle of the comment — which is the comment the editor writes when a
    /// writer parks a wrapper to think about it.
    #[test]
    fn injecting_the_reserve_touches_a_call_and_not_a_comment() {
        // A bare `#מסמך[…]` is given an argument list.
        let injected = inject_reserve_into_writer_masmer("#מסמך[\nטקסט\n]", "3.00cm");
        assert!(
            injected.contains("#מסמך(אזור_הערות: 3.00cm)["),
            "the bare form was not given an argument list: {injected}"
        );
        // A paren call without the argument gets it, before whatever is there.
        let with_other =
            inject_reserve_into_writer_masmer("#מסמך(כותרת: \"שם\")[\nטקסט\n]", "3.00cm");
        assert!(
            with_other.contains("#מסמך(אזור_הערות: 3.00cm, כותרת:"),
            "the argument was not written: {with_other}"
        );
        // **A commented-out wrapper is not a wrapper.**
        for parked in [
            "// #מסמך[\nטקסט\n]",
            "/* #מסמך(כותרת: \"שם\")[\nטקסט\n] */",
            "#כותרת_עליונה(\"#מסמך(\")",
            "#let tpl = \"#מסמך(\"",
        ] {
            assert_eq!(
                inject_reserve_into_writer_masmer(parked, "3.00cm"),
                parked,
                "a commented-out or quoted wrapper was written into: {parked}"
            );
        }
        // A writer who named the reserve keeps their number, exactly.
        let own = "#מסמך(אזור_הערות: 1cm)[\nטקסט\n]";
        assert_eq!(inject_reserve_into_writer_masmer(own, "3.00cm"), own);
        let own_en = "#מסמך(notes_region: 1cm)[\nטקסט\n]";
        assert_eq!(inject_reserve_into_writer_masmer(own_en, "3.00cm"), own_en);
    }

    #[test]
    fn the_page_foot_reserve_follows_a_real_call_not_a_prose_mention() {
        // A document that only *talks* about the apparatus must not lose 3 cm at
        // the foot of every page for one it never uses.
        assert_eq!(
            auto_notes_region_cm("כאן נסביר מהו מדף_ וכיצד להשתמש בו בטקסט."),
            0.0,
            "a bare mention should reserve nothing"
        );
        // An actual call — both the bracket form and the paren form, top-level and
        // via the family prefix — reserves the region.
        assert_eq!(auto_notes_region_cm("שלום #מדף_א[הערה] עולם"), 3.0);
        assert_eq!(auto_notes_region_cm("#מדף_בדרגה(2)[הערה]"), 3.0);
        assert_eq!(auto_notes_region_cm("#הערה_זרם(זרם: \"א\")[טקסט]"), 3.0);
        // A document with no apparatus at all reserves nothing.
        assert_eq!(auto_notes_region_cm("סתם טקסט עם #הדגשה[מילה]"), 0.0);
    }

    /// The reserve follows the heights the document declared.
    ///
    /// It did not. A flat 3 cm went to every document with a page apparatus,
    /// whatever `#הגדרות_מדפים(גבהים: …)` said — so five centimetres of declared
    /// bands printed the second one **off the sheet** (measured: y=879 on an
    /// 842pt page), and a document asking for one centimetre paid for three.
    /// `page_geometry.rs` holds the same claim against the laid-out page; this
    /// holds the arithmetic, including the reading of the units.
    #[test]
    fn the_reserve_follows_the_declared_band_heights() {
        let with = |heights: &str| {
            auto_notes_region_cm(&format!(
                "#הגדרות_מדפים(גבהים: {heights})\n\n#מדף_א[א] #מדף_ב[ב]"
            ))
        };
        assert!(near(with("(1.5cm, 1cm)"), 2.5 + BAND_GAP_CM + BAND_RULE_CM));
        assert!(near(with("(3cm, 2cm)"), 5.0 + BAND_GAP_CM + BAND_RULE_CM));
        // Every unit Typst writes an absolute length in.
        assert!(near(with("(20mm, 10mm)"), 3.0 + BAND_GAP_CM + BAND_RULE_CM));
        assert!(near(with("(1in,)"), 2.54 + BAND_RULE_CM));
        let pt = with("(72pt, 72pt)");
        assert!(
            near(pt, 2.0 * 2.54 + BAND_GAP_CM + BAND_RULE_CM),
            "got {pt}"
        );
        // A single band has no gap to pay for.
        assert!(near(with("(2cm,)"), 2.0 + BAND_RULE_CM));

        // A length this cannot resolve falls back to the working default rather
        // than to a guess: `em` depends on the font size at the foot of the page,
        // and a wrong number here is wrong in *page geometry*, silently.
        assert_eq!(with("(4em, 3em)"), 3.0);
        // As does a document that declares nothing.
        assert_eq!(auto_notes_region_cm("#מדף_א[א] #מדף_ב[ב]"), 3.0);
        // And declaring heights without ever writing a band still reserves
        // nothing — the gate is the apparatus, not the configuration line.
        assert_eq!(
            auto_notes_region_cm("#הגדרות_מדפים(גבהים: (2cm, 2cm))"),
            0.0
        );
        // A commented-out configuration is not a configuration.
        assert_eq!(
            auto_notes_region_cm("// #הגדרות_מדפים(גבהים: (9cm, 9cm))\n#מדף_א[א]"),
            3.0
        );
        // And the search stays inside the call's own brackets: prose that happens
        // to use the word must not decide how much of every page is reserved.
        assert_eq!(
            auto_notes_region_cm(
                "#הגדרות_מדפים(קו: false)\n\n#מדף_א[א]\n\nעל גבהים: (9cm, 9cm) נדבר להלן."
            ),
            3.0
        );
        // A configuration that sets something else *and* the heights still reads.
        assert!(near(
            auto_notes_region_cm("#הגדרות_מדפים(קו: false, גבהים: (1cm, 1cm))\n#מדף_א[א]"),
            2.0 + BAND_GAP_CM + BAND_RULE_CM
        ));
        // The English spelling reaches the same arithmetic.
        assert!(near(
            auto_notes_region_cm("#pagebands_config(heights: (1cm, 1cm))\n#מדף_א[א]"),
            2.0 + BAND_GAP_CM + BAND_RULE_CM
        ));
        // Any number of bands, not the two or three the UI used to offer. Seven
        // is what מדף_א…ז name, and the arithmetic has to hold at the end of that
        // stack, where the accumulated gaps are what push the last one off.
        assert!(near(
            with("(1cm, 1cm, 1cm, 1cm, 1cm, 1cm, 1cm)"),
            7.0 + BAND_GAP_CM * 6.0 + BAND_RULE_CM
        ));
    }

    /// A region height in percent is a percentage of the **sheet**.
    ///
    /// The prelude resolves the same ratio against `page.height`, so this is one
    /// half of a claim whose other half is `_ap_fixed_height`. They have to agree
    /// on what the percentage is *of*, or the reserve and the band disagree by a
    /// factor of the reserve — and the visible one is the band.
    #[test]
    fn a_percent_region_is_a_percent_of_the_sheet() {
        let with = |heights: &str, sheet: f64| {
            auto_notes_region_cm_on(
                &format!("#הגדרות_מדפים(גבהים: {heights})\n\n#מדף_א[א] #מדף_ב[ב]"),
                sheet,
            )
        };
        // A4: 29.7 cm. 10% + 5% is 2.97 + 1.485.
        assert!(near(
            with("(10%, 5%)", 29.7),
            2.97 + 1.485 + BAND_GAP_CM + BAND_RULE_CM
        ));
        // The same document on A3 reserves proportionally more, which is the
        // entire reason to write a percentage instead of a centimetre.
        assert!(near(
            with("(10%, 5%)", 42.0),
            4.2 + 2.1 + BAND_GAP_CM + BAND_RULE_CM
        ));
        // Mixed units in one tuple: a fixed rule under a proportional band is a
        // real thing to want, and one unreadable entry must not be inferred from
        // the readable ones.
        assert!(near(
            with("(20%, 1cm)", 29.7),
            5.94 + 1.0 + BAND_GAP_CM + BAND_RULE_CM
        ));
        // `em` is still unresolvable — it depends on the font size at the foot of
        // the page, which this scanner does not know and must not guess.
        assert_eq!(with("(4em, 3em)", 29.7), DEFAULT_REGION_CM);
        // And a document that asks for more page than it has gets clipped regions
        // rather than a document that will not lay out at all.
        assert!(near(with("(60%, 50%)", 29.7), 29.7 * MAX_REGION_SHARE));
    }

    /// The streams reserve the page foot too, from their own dictionary.
    ///
    /// They always needed it — `#הערה_זרם` has been on the page-apparatus list
    /// since that list was written — but only the bands' *array* was ever read,
    /// so a three-stream document with declared heights got the flat 3 cm and
    /// printed its third stream at y=823.62 on an 841.89pt sheet, below the page
    /// number at 799.02. The bug had just been fixed one apparatus over.
    #[test]
    fn the_reserve_follows_the_declared_stream_heights() {
        let three = "#הגדרות_זרמים(גבהים: (\"ביאור\": 2cm, \"מקורות\": 1cm, \"נוסחאות\": 1cm))\n\
                     #הערה_זרם(\"ביאור\")[א] #הערה_זרם(\"מקורות\")[ב] #הערה_זרם(\"נוסחאות\")[ג]";
        assert!(near(
            auto_notes_region_cm(three),
            4.0 + BAND_GAP_CM * 2.0 + BAND_RULE_CM
        ));
        // The English spelling of both the command and the key.
        assert!(near(
            auto_notes_region_cm(
                "#streams_config(heights: (\"a\": 2cm, \"b\": 1cm))\n#stream_note(\"a\")[x]"
            ),
            3.0 + BAND_GAP_CM + BAND_RULE_CM
        ));
        // Percent works here too, and against the sheet.
        assert!(near(
            auto_notes_region_cm_on(
                "#הגדרות_זרמים(גבהים: (\"ביאור\": 10%, \"מקורות\": 5%))\n#הערת_תוכן[א]",
                29.7
            ),
            2.97 + 1.485 + BAND_GAP_CM + BAND_RULE_CM
        ));
        // An empty dictionary is the default and declares nothing.
        assert_eq!(
            auto_notes_region_cm("#הגדרות_זרמים(גבהים: (:))\n#הערת_מקור[א]"),
            DEFAULT_REGION_CM
        );
        // Configuring the streams without writing one still reserves nothing.
        assert_eq!(
            auto_notes_region_cm("#הגדרות_זרמים(גבהים: (\"ביאור\": 4cm))"),
            0.0
        );
        // Streams and tiers are separate apparatuses that render into the *same*
        // reserved block, one under the other. A document carrying both needs
        // room for both — the sum, not whichever the scanner happened to find
        // first.
        let both = "#הגדרות_מדפים(גבהים: (1.5cm, 1cm))\n\
                    #הגדרות_זרמים(גבהים: (\"מקורות\": 1cm))\n\
                    #מדף_א[א] #מדף_ב[ב] #הערה_זרם(\"מקורות\")[ג]";
        assert!(near(
            auto_notes_region_cm(both),
            (2.5 + BAND_GAP_CM + BAND_RULE_CM) + (1.0 + BAND_RULE_CM)
        ));
        // …including when only one of the two says how tall it is.
        assert!(near(
            auto_notes_region_cm("#הגדרות_מדפים(גבהים: (1cm,))\n#מדף_א[א] #הערת_מקור[ב]"),
            (1.0 + BAND_RULE_CM) + DEFAULT_REGION_CM
        ));
    }

    /// The reserve survives the shapes the hand scanners were written to
    /// survive, with the parser now doing the lexing.
    ///
    /// These are the cases the differential gate covered before the hand
    /// scanner retired — comments, strings and unbalanced brackets, which are
    /// what a body looks like while its writer is typing. Each assertion pins
    /// the parser's answer so the reserve cannot regress into one of the old
    /// failure modes: a commented-out apparatus reserving a full page foot, a
    /// string that mentions a command counting as a call, or a document that
    /// never finishes a bracket stealing space from every page.
    #[test]
    fn the_reserve_reads_comments_strings_and_unbalanced_brackets() {
        // A comment is a place to park an apparatus, not a document that has one.
        assert_eq!(auto_notes_region_cm("// #מדף_א[הערה]\nטקסט"), 0.0);
        assert_eq!(auto_notes_region_cm("שלום /* #מדף_א[הערה] */ עולם"), 0.0);
        assert_eq!(
            auto_notes_region_cm("// אולי #הערה_זרם(זרם: \"א\")[טקסט]\nעולם"),
            0.0
        );
        // A comment between the halves of a name must not let them meet.
        assert_eq!(auto_notes_region_cm("מד/* x */ף_א[הערה]"), 0.0);
        // A string is text, not a call.
        assert_eq!(auto_notes_region_cm("#let x = \"#מדף_א[א]\""), 0.0);
        assert_eq!(
            auto_notes_region_cm("#כותרת_עליונה(\"ראה #מדף_א[שם]\")"),
            0.0
        );
        // Unbalanced, as a body is while its writer is typing: the reserve must
        // not fall over, and must not invent an apparatus that is not there.
        assert_eq!(auto_notes_region_cm("#הערה("), 0.0);
        assert_eq!(auto_notes_region_cm("טקסט#הערה(ערוץ: \"מקורות\""), 0.0);
        assert_eq!(auto_notes_region_cm("#הגדרות_מדפים(גבהים: (1cm, "), 0.0);
        // …but a real call that merely has not got its bracket yet still counts.
        assert_eq!(auto_notes_region_cm("#מדף_א["), 3.0);
    }

    /// A commented-out apparatus is not an apparatus.
    ///
    /// The case the test above stopped one short of. Parking a band while you
    /// decide about it — `// #מדף_א[…]`, which is what the editor's own
    /// "comment out" command writes — reserved 3 cm at the foot of **every page
    /// in the document**, and the writer's only symptom is that their text block
    /// got shorter for no reason they can see.
    #[test]
    fn a_commented_out_apparatus_reserves_nothing() {
        assert_eq!(
            auto_notes_region_cm(
                "שלום
// #מדף_א[הערה]
עולם"
            ),
            0.0
        );
        assert_eq!(auto_notes_region_cm("שלום /* #מדף_א[הערה] */ עולם"), 0.0);
        assert_eq!(
            auto_notes_region_cm(
                "שלום
// אולי #הערה_זרם(זרם: \"א\")[טקסט]
עולם"
            ),
            0.0
        );
        // And a string is text, not a call: a running head that *mentions* an
        // apparatus is a header, not a document that has one.
        assert_eq!(
            auto_notes_region_cm("#כותרת_עליונה(\"ראה #מדף_א[שם]\")"),
            0.0
        );
        // The apparatus still counts when it is real and a comment is merely
        // nearby — the fix must not blank the wrong half of the line.
        assert_eq!(
            auto_notes_region_cm(
                "// הערה
#מדף_א[הערה]"
            ),
            3.0
        );
        assert_eq!(auto_notes_region_cm("#מדף_א[הערה] // הערה"), 3.0);
    }

    /// Every command in the prelude that puts notes in the page footer, derived
    /// from the prelude rather than remembered.
    ///
    /// Two of the apparatuses in `ksav.typ` render from the page footer, and
    /// both say so the same way: they hand `_ap_note` the label their notes
    /// carry. So the primitives are the `_ap_note` call sites carrying a footer
    /// label, and the family is those plus every one-line alias that delegates
    /// to a member of it, transitively — which is exactly how the aliases are
    /// written (`#let מדף_א(body) = מדף_בדרגה(1, body)`, `#let pageband =
    /// מדף_בדרגה`).
    fn footer_note_commands() -> Vec<String> {
        let mut fam: Vec<String> = Vec::new();

        // The primitives: a `#let` whose body calls `_ap_note` with a label the
        // page footer renders.
        for (i, _) in PRELUDE.match_indices("_ap_note(") {
            // The whole argument list, not up to the first `)` — the arguments
            // contain calls of their own (`_pp_cfg.get()`).
            let mut depth = 0i32;
            let mut end = PRELUDE.len();
            for (j, c) in PRELUDE[i..].char_indices() {
                match c {
                    '(' => depth += 1,
                    ')' => {
                        depth -= 1;
                        if depth == 0 {
                            end = i + j;
                            break;
                        }
                    }
                    _ => {}
                }
            }
            let call = &PRELUDE[i..end];
            if !(call.contains("_pp_label") || call.contains("_sf_label")) {
                continue;
            }
            // Walk back to the `#let` this call belongs to.
            let Some(l) = PRELUDE[..i].rfind("\n#let ") else {
                continue;
            };
            let head = &PRELUDE[l + 6..];
            let name: String = head
                .chars()
                .take_while(|c| c.is_alphanumeric() || *c == '_')
                .collect();
            if !name.is_empty() && !fam.contains(&name) {
                fam.push(name);
            }
        }
        assert!(
            fam.len() >= 2,
            "no footer-rendered note primitives found in the prelude — either the \
             apparatus stopped going through `_ap_note`, or this derivation is \
             reading the wrong thing. Found: {fam:?}"
        );

        // The aliases: `#let X(..) = Y(..)`, `#let X = Y`, or `#let X = _en(Y, …)`
        // — an alias wrapped so its parameters may be given in English — to a
        // fixpoint. The `_en` form is not a curiosity: every alias to a command
        // that takes named arguments has to be wrapped, or its parameters stay
        // Hebrew on the English spelling. So the moment a footer apparatus grew
        // per-note style overrides, `#let pageband = מדף_בדרגה` became
        // `#let pageband = _en(מדף_בדרגה, …)`, this derivation read the target as
        // `_en`, and the whole `pageband*` family stopped being seen as reserving
        // page foot at all. Which the fence below caught, in this direction.
        loop {
            let before = fam.len();
            for line in PRELUDE.lines() {
                let Some(rest) = line.strip_prefix("#let ") else {
                    continue;
                };
                let Some((lhs, rhs)) = rest.split_once('=') else {
                    continue;
                };
                let name: String = lhs
                    .chars()
                    .take_while(|c| c.is_alphanumeric() || *c == '_')
                    .collect();
                let body = rhs.trim_start();
                let body = body.strip_prefix("_en(").unwrap_or(body);
                let target: String = body
                    .chars()
                    .take_while(|c| c.is_alphanumeric() || *c == '_')
                    .collect();
                if fam.contains(&target) && !fam.contains(&name) && !name.is_empty() {
                    fam.push(name);
                }
            }

            if fam.len() == before {
                break;
            }
        }
        fam
    }

    /// Every prefix the reserve is decided from, both apparatuses together.
    ///
    /// The runtime keeps them apart because they reserve separately; this fence
    /// asks the other question — whether between them they still name everything
    /// the prelude renders into a page footer — and for that they are one list.
    fn page_apparatus_commands() -> Vec<&'static str> {
        BAND_COMMANDS
            .iter()
            .chain(STREAM_COMMANDS.iter())
            .copied()
            .collect()
    }

    #[test]
    fn the_page_foot_reserve_list_matches_the_prelude() {
        let family = footer_note_commands();
        let listed = page_apparatus_commands();

        // Direction 1: nothing the prelude renders into the footer is missing.
        // A missing one means a document using it keeps its full text height and
        // the apparatus runs off the bottom of the sheet.
        for cmd in &family {
            assert!(
                listed.iter().any(|p| cmd.starts_with(p)),
                "`{cmd}` renders into the page footer and no prefix in \
                 BAND_COMMANDS or STREAM_COMMANDS covers it, so a document using \
                 it reserves no room for its own apparatus.\n\
                 The footer-rendered family, read out of ksav.typ: {family:?}"
            );
        }

        // Direction 2: nothing in the lists names something that no longer
        // exists. A dead prefix is worse than useless — it reads as coverage.
        //
        // **Named in the prelude at all**, rather than named in the derived
        // family. A command may be a *door* — `#הערה_זרם` decides whether the
        // note goes to the margin or the page foot and calls the renderer — and
        // a door does not itself call `_ap_note`, so it is not in the family and
        // is still very much alive. Asking the stricter question failed on the
        // refactor that introduced one, which is the fence complaining about the
        // wrong thing: what makes a prefix dead is the command going away.
        for p in &listed {
            assert!(
                PRELUDE.contains(&format!("#let {p}")) || family.iter().any(|c| c.starts_with(p)),
                "{p:?} is listed as a page-foot apparatus and names nothing in \
                 ksav.typ at all.\n\
                 The footer-rendered family, read out of ksav.typ: {family:?}"
            );
        }

        // And a command may not be in both halves, or its reserve is counted
        // twice and the text block shrinks for no reason the writer can see.
        for c in BAND_COMMANDS {
            assert!(!STREAM_COMMANDS.contains(c), "{c:?} is in both halves");
        }

        // And the reserve really follows from membership, not from the prefix
        // table happening to contain a string. Both ways a footer command can
        // reach a page: called with a bracket, and handed to `#הערה_בשם` as the
        // *value* of `סוג`, where there is no bracket for a scanner to find.
        for cmd in &family {
            assert_eq!(
                auto_notes_region_cm(&format!("פתיחה#{cmd}[הערה] וסוף.")),
                3.0,
                "a document calling `#{cmd}` should reserve the page foot"
            );
            assert_eq!(
                auto_notes_region_cm(&format!(
                    "פתיחה#הערה_בשם(\"א\", סוג: {cmd})\n#גוף_הערה(\"א\")[הערה]\n"
                )),
                3.0,
                "a deferred note printed through `{cmd}` should reserve the page \
                 foot — the command is a value here, with no bracket after it"
            );
        }
    }

    #[test]
    fn impossible_numbers_are_brought_back_into_range() {
        let c = cfg_from(serde_json::json!({
            "size_pt": 0, "line_spacing_em": -3.0, "columns": 5000, "margin_cm": -1.0,
        }));
        assert!(
            c.size_pt >= 1.0,
            "zero-size text is invisible, not a choice"
        );
        assert!(
            c.line_spacing_em >= 0.0,
            "negative leading stacks lines on top of each other"
        );
        assert!(c.columns <= 12, "5000 columns is a page of hairlines");
        assert!(c.margin_cm >= 0.0);
    }

    #[test]
    fn a_document_with_impossible_settings_still_renders() {
        let cfg = cfg_from(serde_json::json!({
            "size_pt": -5, "columns": 5000, "line_spacing_em": -3.0, "first_line_indent_em": -9.0,
        }));
        let out = compile("שלום", &cfg);
        assert!(out.ok(), "diagnostics: {:?}", out.diagnostics);
    }

    #[test]
    fn nan_and_infinity_are_refused_rather_than_clamped() {
        // Serde will not parse a bare NaN, so this is the shape that actually
        // reaches us: a string where a number was expected. Either way the
        // default must survive — a NaN formatted into the prelude is not a
        // Typst length and fails inside code the writer never wrote.
        let c = cfg_from(serde_json::json!({ "size_pt": "NaN", "columns": "many" }));
        assert_eq!(c.size_pt, DocConfig::default().size_pt);
        assert_eq!(c.columns, DocConfig::default().columns);
    }

    // ------------------------------------------------------- string escaping

    #[test]
    fn a_backslash_in_a_setting_cannot_escape_its_string_literal() {
        // `paper: "a4\"` used to close the literal early and fail the whole
        // document with "unclosed delimiter" pointing at the prelude rather than
        // at the setting. Every one of these must simply render.
        for cfg in [
            DocConfig {
                paper: "a4\\".into(),
                ..Default::default()
            },
            DocConfig {
                paper: "a4\"".into(),
                ..Default::default()
            },
            DocConfig {
                font: "Frank\\".into(),
                ..Default::default()
            },
            DocConfig {
                font: "Frank\" ,גודל: 99pt, x: \"".into(),
                ..Default::default()
            },
            DocConfig {
                header: "כותרת\\".into(),
                ..Default::default()
            },
            DocConfig {
                footer: "\\\"".into(),
                ..Default::default()
            },
        ] {
            let out = compile("שלום", &cfg);
            assert!(
                out.ok(),
                "a hostile {:?}/{:?} broke the document: {:?}",
                cfg.font,
                cfg.paper,
                out.diagnostics
            );
        }
    }

    #[test]
    fn a_paper_name_is_reduced_to_something_typst_can_read() {
        assert_eq!(sanitize_paper("A4"), "a4");
        assert_eq!(sanitize_paper("us-letter"), "us-letter");
        // The injection guard: quotes, a backslash and a comma all go, and what
        // is left cannot close the Typst literal it is interpolated into.
        assert_eq!(sanitize_paper("a4\\\" ,x: \"y"), "a4-x-y");
        assert_eq!(sanitize_paper("\"\\"), "");
        // #106: the spellings that mean a sheet this product has.
        assert_eq!(sanitize_paper("b5"), "iso-b5");
        assert_eq!(sanitize_paper("B5"), "iso-b5");
        assert_eq!(sanitize_paper("letter"), "us-letter");
        // A separator is a separator, not noise — a hand-edited `US Letter`
        // must not become the unmatchable `usletter` and fall back to A4.
        assert_eq!(sanitize_paper("US Letter"), "us-letter");
        assert_eq!(sanitize_paper("us_letter"), "us-letter");
        // The canonical names are left exactly alone.
        assert_eq!(sanitize_paper("iso-b5"), "iso-b5");
    }

    #[test]
    fn typst_str_doubles_the_backslash_before_the_quote() {
        // Order matters: escaping the quote first would turn `"` into `\"`, and
        // the backslash pass would then produce `\\"` — closing the literal.
        assert_eq!(typst_str("a\\"), "\"a\\\\\"");
        assert_eq!(typst_str("a\"b"), "\"a\\\"b\"");
        assert_eq!(typst_str("\\\""), "\"\\\\\\\"\"");
    }

    // ------------------------------------------------------- preview vs export

    #[test]
    fn a_preview_carries_no_pdf_and_an_export_does() {
        let body = serde_json::json!({ "body": "שלום" }).to_string();
        let preview: serde_json::Value = serde_json::from_str(&compile_request(&body)).unwrap();
        assert_eq!(preview["ok"], true);
        assert!(!preview["pages_svg"].as_array().unwrap().is_empty());
        assert!(
            preview["pdf_base64"].is_null(),
            "the preview must not carry ~300 KB of base64 nothing on screen reads"
        );

        let export = serde_json::json!({ "body": "שלום", "want_pdf": true }).to_string();
        let exported: serde_json::Value = serde_json::from_str(&compile_request(&export)).unwrap();
        assert!(exported["pdf_base64"]
            .as_str()
            .is_some_and(|s| !s.is_empty()));
    }

    #[test]
    fn a_request_that_does_not_parse_is_an_error_not_a_blank_page() {
        // Falling back to an absent body compiled one blank page and called it
        // `ok: true`, so a truncated upload silently wiped the preview.
        for bad in ["", "garbage", "{\"body\": ", "{\"body\":\"a\nb\"}"] {
            let out: serde_json::Value = serde_json::from_str(&compile_request(bad)).unwrap();
            assert_eq!(out["ok"], false, "{bad:?} must not report success");
            assert!(
                out["pages_svg"].as_array().is_some_and(|p| p.is_empty()),
                "{bad:?} must not render a page"
            );
            let msg = out["diagnostics"][0]["message"].as_str().unwrap_or("");
            assert!(
                msg.contains("could not be read"),
                "{bad:?} must say why: {msg}"
            );
        }
        // A well-formed request is unaffected.
        let good = serde_json::json!({ "body": "שלום" }).to_string();
        let out: serde_json::Value = serde_json::from_str(&compile_request(&good)).unwrap();
        assert_eq!(out["ok"], true);
    }

    #[test]
    fn a_request_with_no_usable_body_is_an_error_not_a_blank_page() {
        // The same failure as above by a different route: JSON that parses fine
        // but whose `body` is missing or is not text used to reach `unwrap_or("")`
        // and compile one blank page reported as `ok: true` — a wiped preview
        // that looks like a successful render.
        let cases = [
            serde_json::json!({}),
            serde_json::json!({ "font": "David Libre" }),
            serde_json::json!({ "body": 12345 }),
            serde_json::json!({ "body": serde_json::Value::Null }),
            serde_json::json!({ "body": ["שלום"] }),
            serde_json::json!({ "body": { "text": "שלום" } }),
        ];
        for bad in cases {
            let out: serde_json::Value =
                serde_json::from_str(&compile_request(&bad.to_string())).unwrap();
            assert_eq!(out["ok"], false, "{bad} must not report success");
            assert!(
                out["pages_svg"].as_array().is_some_and(|p| p.is_empty()),
                "{bad} must not render a page"
            );
            let msg = out["diagnostics"][0]["message"].as_str().unwrap_or("");
            assert!(
                msg.contains("could not be read"),
                "{bad} must say why: {msg}"
            );
        }

        // An *empty* body is not malformed — it is a new document, and it must
        // still render its one blank page rather than being called an error.
        let empty = serde_json::json!({ "body": "" }).to_string();
        let out: serde_json::Value = serde_json::from_str(&compile_request(&empty)).unwrap();
        assert_eq!(out["ok"], true, "an empty document is legitimate");
        assert_eq!(out["pages_svg"].as_array().unwrap().len(), 1);
    }

    #[test]
    fn success_is_reported_even_when_no_pdf_was_asked_for() {
        // `ok` used to mean `pdf.is_some()`, which would report every successful
        // preview as a failure the moment previews stopped rendering a PDF.
        let out = compile_parts(
            "שלום",
            &DocConfig::default(),
            &Assets::default(),
            Wants::default(),
            &Default::default(),
        );
        assert!(out.ok());
        assert!(out.pdf.is_none());
        assert!(!out.pages_svg.is_empty());
    }

    #[test]
    fn a_preview_carries_no_assembled_source_and_an_export_does() {
        // 75 KB of prelude in an 84 KB response, for a one-page document, read by
        // nothing on screen. The one caller that wants it asks.
        let preview = serde_json::json!({ "body": "שלום" }).to_string();
        let p: serde_json::Value = serde_json::from_str(&compile_request(&preview)).unwrap();
        assert_eq!(p["ok"], true);
        assert_eq!(
            p["typst_source"].as_str(),
            Some(""),
            "the preview must not carry the prelude nobody reads"
        );

        let export = serde_json::json!({ "body": "שלום", "want_source": true }).to_string();
        let e: serde_json::Value = serde_json::from_str(&compile_request(&export)).unwrap();
        assert!(
            e["typst_source"]
                .as_str()
                .is_some_and(|s| s.contains("#show: מסמך.with(")),
            "an export must carry the real assembled source"
        );
    }

    #[test]
    fn a_page_the_client_already_holds_comes_back_as_null() {
        // The first compile hands over every page and names them.
        let ask = serde_json::json!({ "body": "שלום עולם" }).to_string();
        let first: serde_json::Value = serde_json::from_str(&compile_request(&ask)).unwrap();
        let hashes: Vec<String> = first["pages_hash"]
            .as_array()
            .unwrap()
            .iter()
            .map(|h| h.as_str().unwrap().to_string())
            .collect();
        assert_eq!(hashes.len(), 1);
        assert!(first["pages_svg"][0].is_string());

        // Asked again by a client that says it still has that page, the engine
        // names it and sends nothing.
        let again =
            serde_json::json!({ "body": "שלום עולם", "have_pages": hashes.clone() }).to_string();
        let second: serde_json::Value = serde_json::from_str(&compile_request(&again)).unwrap();
        assert!(
            second["pages_svg"][0].is_null(),
            "an unchanged page must not be sent twice"
        );
        assert_eq!(second["pages_hash"], first["pages_hash"]);

        // A page it does *not* hold arrives in full, even though it claimed
        // something. Nothing may depend on the two lists lining up by position.
        let other =
            serde_json::json!({ "body": "טקסט אחר לגמרי", "have_pages": hashes }).to_string();
        let third: serde_json::Value = serde_json::from_str(&compile_request(&other)).unwrap();
        assert!(
            third["pages_svg"][0].is_string(),
            "a page the client has never seen must be sent"
        );
    }

    /// Same page, two requests: same name. Different page: different name. This
    /// is the whole contract the client's cache rests on — and it is now checked
    /// through a *compile*, because the fingerprint is of the laid-out page
    /// rather than of its SVG. That is the point of the change: the fingerprint
    /// has to be knowable before the serialisation, or the cache saves bandwidth
    /// by doing all of the work first (310 ms of 343 on a 28-page document).
    #[test]
    fn a_fingerprint_follows_the_page_and_not_the_request() {
        let hashes = |body: &str| {
            compile_parts(
                body,
                &DocConfig::default(),
                &Assets::default(),
                Wants::default(),
                &Default::default(),
            )
            .pages_hash
        };
        let a = hashes("שלום");
        let b = hashes("שלום");
        let c = hashes("טקסט אחר לגמרי");
        assert_eq!(a, b, "the same document fingerprinted differently twice");
        assert_ne!(a, c, "two different pages share a fingerprint");
        assert_eq!(a.len(), 1);
        assert_eq!(a[0].len(), 32, "thirty-two hex digits of a 128-bit hash");
    }

    /// A page the caller already holds is never serialised.
    ///
    /// The assertion the whole change exists for, and it is about *work* rather
    /// than about the answer: the response is identical either way, so nothing
    /// downstream can tell. What tells is that `pages_svg` is empty for a page
    /// whose fingerprint was on the request.
    #[test]
    fn a_page_the_caller_holds_is_not_serialised() {
        let cfg = DocConfig::default();
        let first = compile_parts(
            "שלום",
            &cfg,
            &Assets::default(),
            Wants::default(),
            &Default::default(),
        );
        assert!(
            !first.pages_svg[0].is_empty(),
            "the first ask must send the page"
        );

        let have: std::collections::HashSet<String> = first.pages_hash.iter().cloned().collect();
        let again = compile_parts("שלום", &cfg, &Assets::default(), Wants::default(), &have);
        assert_eq!(again.pages_hash, first.pages_hash, "the fingerprint moved");
        assert!(
            again.pages_svg[0].is_empty(),
            "a page the caller already holds was serialised anyway"
        );
    }

    /// The third `Wants` flag, held to the same bargain as the other two: off by
    /// default, and *actually* off.
    ///
    /// A flag that is read but never gates anything costs exactly what it was
    /// introduced to save, silently, on every keystroke-driven compile in the
    /// application — which is the shape of the mistake `want_pdf` and
    /// `want_source` were each introduced to undo, and there is no way to notice
    /// it from the outside because the answer is correct either way.
    #[test]
    fn the_page_runs_are_only_computed_when_they_are_asked_for() {
        let cfg = DocConfig::default();
        let body = "שורה ראשונה\n\n#מעבר_עמוד\n\nשורה אחרונה";
        let quiet = compile_parts(
            body,
            &cfg,
            &Assets::default(),
            Wants::default(),
            &Default::default(),
        );
        assert!(
            quiet.pages_lines.is_empty(),
            "a compile nobody asked walked every frame anyway: {:?}",
            quiet.pages_lines
        );

        let asked = compile_parts(
            body,
            &cfg,
            &Assets::default(),
            Wants {
                lines: true,
                ..Default::default()
            },
            &Default::default(),
        );
        assert_eq!(
            asked.pages_lines.len(),
            asked.pages_svg.len(),
            "one answer per page: {:?}",
            asked.pages_lines
        );
        assert!(
            asked.pages_lines.iter().any(|p| !p.is_empty()),
            "asked for and answered with nothing: {:?}",
            asked.pages_lines
        );
    }

    /// And the same across the wire, which is the only route the editor takes.
    #[test]
    fn the_wire_carries_the_page_runs_when_asked() {
        let ask = |extra: serde_json::Value| {
            let mut v = serde_json::json!({ "body": "א\n\n#מעבר_עמוד\n\nב" });
            for (k, val) in extra.as_object().unwrap() {
                v[k] = val.clone();
            }
            let out: serde_json::Value =
                serde_json::from_str(&compile_request(&v.to_string())).unwrap();
            out["pages_lines"].as_array().cloned().unwrap_or_default()
        };
        assert!(
            ask(serde_json::json!({})).is_empty(),
            "the runs rode on a request that did not ask for them"
        );
        let asked = ask(serde_json::json!({ "want_lines": true }));
        assert_eq!(asked.len(), 2, "one entry per page: {asked:?}");
        assert!(
            asked[0].as_array().is_some_and(|r| !r.is_empty()),
            "the first page reported no lines at all: {asked:?}"
        );
    }

    /// The fourth flag, held to the same bargain as the other three.
    ///
    /// It shares `lines`'s re-parse of the main source, which is the one part of
    /// the cost that is worth sharing and the one part a test can be fooled by:
    /// a `parsed` computed unconditionally would leave both flags looking gated
    /// while the expensive half ran on every keystroke. So the assertion is
    /// about the **answer** being absent, which is the only thing observable
    /// from out here.
    #[test]
    fn the_note_markers_are_only_computed_when_they_are_asked_for() {
        let cfg = DocConfig::default();
        let body = "שלום#הערה[ראשונה] עולם";
        let quiet = compile_parts(
            body,
            &cfg,
            &Assets::default(),
            Wants::default(),
            &Default::default(),
        );
        assert!(
            quiet.note_markers.is_empty(),
            "a compile nobody asked walked every frame anyway: {:?}",
            quiet.note_markers
        );

        let asked = compile_parts(
            body,
            &cfg,
            &Assets::default(),
            Wants {
                markers: true,
                ..Default::default()
            },
            &Default::default(),
        );
        assert!(
            asked.note_markers.iter().any(|m| m.marker == "1"),
            "asked for and answered with nothing: {:?}",
            asked.note_markers
        );
        assert!(
            asked.pages_lines.is_empty(),
            "asking for the markers turned the page runs on too: {:?}",
            asked.pages_lines
        );
    }

    /// And the same across the wire, which is the only route the editor takes.
    #[test]
    fn the_wire_carries_the_note_markers_when_asked() {
        let ask = |extra: serde_json::Value| {
            let mut v = serde_json::json!({ "body": "שלום#הערה[ראשונה] עולם" });
            for (k, val) in extra.as_object().unwrap() {
                v[k] = val.clone();
            }
            let out: serde_json::Value =
                serde_json::from_str(&compile_request(&v.to_string())).unwrap();
            out["note_markers"].as_array().cloned().unwrap_or_default()
        };
        assert!(
            ask(serde_json::json!({})).is_empty(),
            "the markers rode on a request that did not ask for them"
        );
        let asked = ask(serde_json::json!({ "want_markers": true }));
        assert!(
            asked.iter().any(|m| m["marker"] == "1"),
            "the note's own marker is not in the response: {asked:?}"
        );
    }

    #[test]
    fn every_registered_command_is_defined() {
        // Each command's Hebrew name and English alias must have a matching `#let`
        // in the prelude — otherwise the palette would insert an undefined call.
        let defined = |name: &str| {
            PRELUDE.contains(&format!("#let {name}("))
                || PRELUDE.contains(&format!("#let {name} ="))
                || PRELUDE.contains(&format!("#let {name}\n"))
        };
        for c in commands::COMMANDS {
            assert!(
                defined(c.he),
                "Hebrew command not defined in prelude: {}",
                c.he
            );
            assert!(
                defined(c.en),
                "English alias not defined in prelude: {}",
                c.en
            );
        }
    }

    #[test]
    fn config_english_aliases_compile() {
        let body = "#headings_config(מספור: \"1.1\")\n#lists_config(סמן: ([◆],))\n\
                    #tables_config(פסים: true)\n#pagebands_config(מספור: (\"1\", \"א\"))\n\
                    #streams_config(פריסה: \"צד\")\n#h1[פרק]\n#bullets(item[א])\n\
                    #mktable(עמודות: 2, cell[1], cell[2])\n\
                    א#pageband1[ב] ג#contentnote[ד] ה#stream_note(\"x\")[ו]\n\
                    #endnotes_side(זרמים: (\"x\",))";
        let out = compile(body, &DocConfig::default());
        assert!(out.ok(), "diagnostics: {:?}", out.diagnostics);
    }

    #[test]
    fn compiles_basic_hebrew() {
        let out = compile("#הדגשה[שלום עולם]", &DocConfig::default());
        assert!(out.ok(), "diagnostics: {:?}", out.diagnostics);
        assert!(!out.pages_svg.is_empty());
    }

    #[test]
    fn deep_cross_nesting_compiles() {
        // table inside footnote inside heading inside list item
        let body = "#רשימה(פריט[\
            #כותרת2[פריט עם כותרת #הערה[\
                #טבלה(עמודות: 2, תא[א], תא[ב], תא[1], תא[2])\
            ]]\
        ])";
        let out = compile(body, &DocConfig::default());
        assert!(out.ok(), "diagnostics: {:?}", out.diagnostics);
    }

    /// Full torture test: every structure nested inside every other, footnotes
    /// three deep, lists five deep, headings up to level 10. Renders because
    /// Typst parses the document — nesting is unbounded.
    #[test]
    fn everything_inside_everything() {
        let body = include_str!("../examples/nesting.ksav");
        let out = compile(body, &DocConfig::default());
        assert!(out.ok(), "diagnostics: {:?}", out.diagnostics);
        assert!(!out.pages_svg.is_empty());
    }

    #[test]
    fn footnote_within_footnote() {
        let out = compile("א#הערה[ב#הערה[ג#הערה[ד]]]", &DocConfig::default());
        assert!(out.ok(), "diagnostics: {:?}", out.diagnostics);
    }

    #[test]
    fn deep_note_on_note_separate_blocks() {
        // A note-on-a-note nested 5 deep — each level is hoisted to its own
        // footnote block (sequential numbering, spaced apart via footnote.entry gap).
        let body = "א#הערה[ב#הערה_על_הערה[ג#הערה_על_הערה[ד#הערה_על_הערה[ה\
                    #הערה_על_הערה[ו]]]]] ז#הערה[ח]";
        let out = compile(body, &DocConfig::default());
        assert!(out.ok(), "diagnostics: {:?}", out.diagnostics);
        assert!(!out.pages_svg.is_empty());
    }

    #[test]
    fn layered_tiered_footnotes() {
        // A note on a note becomes its own stacked block at the foot of the page,
        // 5 tiers deep — native-footnote based, so it must converge (no warnings).
        let body = "טקסט#הערה_א[ראשונה #הערה_ב[שנייה #הערה_ג[שלישית \
                    #הערה_ד[רביעית #הערה_ה[חמישית]]]]] המשך#הערה_א[עוד אחת].";
        let out = compile(body, &DocConfig::default());
        assert!(out.ok(), "diagnostics: {:?}", out.diagnostics);
        assert!(!out.pages_svg.is_empty());
        let converged = !out
            .diagnostics
            .iter()
            .any(|d| d.message.contains("converge"));
        assert!(converged, "did not converge: {:?}", out.diagnostics);
    }

    #[test]
    fn layered_tiered_footnote_config() {
        // Per-tier styling: custom slant, indent, gap, and bold tier labels.
        let body = "#הגדרות_הערות(סגנון: (\"normal\", \"italic\", \"normal\"), \
                    הזחה: (0em, 1em, 2em), תוויות: (\"\", \"על הערה: \", \"על תת-הערה: \"))\n\
                    א#הערה_א[פ #הערה_ב[ק #הערה_ג[ר]]] ב#הערה_א[ש].";
        let out = compile(body, &DocConfig::default());
        assert!(out.ok(), "diagnostics: {:?}", out.diagnostics);
    }

    #[test]
    fn regrouped_stacked_bands() {
        // Fully regrouped Gemara-style bands (all tier-1, then all tier-2, …),
        // rendered in the main flow — 5 tiers, must compile AND converge.
        let body =
            "#הגדרות_מדורגות(טורים: (2, 1, 1), מספור: (\"1\", \"א\", \"a\", \"i\", \"1\"))\n\
                    א#מדור_א[ראש #מדור_ב[שני #מדור_ג[שלישי #מדור_ד[רביעי #מדור_ה[חמישי]]]]] \
                    ב#מדור_א[עוד].\n#הערות_מדורגות(כותרת: [הערות])";
        let out = compile(body, &DocConfig::default());
        assert!(out.ok(), "diagnostics: {:?}", out.diagnostics);
        let converged = !out
            .diagnostics
            .iter()
            .any(|d| d.message.contains("converge"));
        assert!(converged, "did not converge: {:?}", out.diagnostics);
    }

    #[test]
    fn per_page_regrouped_bands() {
        // The hard one: fully-regrouped bands (all tier-1, then tier-2, …) at the
        // foot of EACH page, 5 tiers deep, across multiple pages. Read-only footer,
        // so it must converge (no warnings).
        let filler = "מילה ".repeat(400); // push onto a second page
        let body = format!(
            "#הגדרות_מדפים(מספור: (\"1\", \"א\", \"a\", \"i\", \"1\"))\n\
             ראש#מדף_א[פתיחה #מדף_ב[שנייה #מדף_ג[שלישית #מדף_ד[רביעית #מדף_ה[חמישית]]]]] \
             {filler} \
             אמצע#מדף_א[עוד הערה #מדף_ב[ועוד תת-הערה]] {filler} סוף#מדף_א[אחרונה].",
            filler = filler
        );
        let out = compile(&body, &DocConfig::default());
        assert!(out.ok(), "diagnostics: {:?}", out.diagnostics);
        assert!(out.pages_svg.len() >= 2, "expected multiple pages");
        let converged = !out
            .diagnostics
            .iter()
            .any(|d| d.message.contains("converge"));
        assert!(converged, "did not converge: {:?}", out.diagnostics);
    }

    #[test]
    fn footnote_streams() {
        // Multiple independent per-page footnote streams, side by side, each with
        // its own numbering. Read-only footer ⇒ must converge.
        let body = "#הגדרות_זרמים(פריסה: \"צד\", זרמים: (\"תוכן\", \"מקורות\"), \
                    מספור: (\"מקורות\": \"א\"), כותרות: (\"תוכן\": [ביאורים], \"מקורות\": [מקורות]))\n\
                    טקסט#הערת_תוכן[ביאור ראשון] ועוד#הערת_מקור[רמב\"ם] וגם\
                    #הערת_תוכן[ביאור שני]#הערת_מקור[שו\"ע].";
        let out = compile(body, &DocConfig::default());
        assert!(out.ok(), "diagnostics: {:?}", out.diagnostics);
        let converged = !out
            .diagnostics
            .iter()
            .any(|d| d.message.contains("converge"));
        assert!(converged, "did not converge: {:?}", out.diagnostics);
    }

    #[test]
    fn endnotes_streams_and_cross_nesting() {
        // regular footnote, endnote-with-footnote-inside, footnote-with-endnote-
        // inside, and a second named stream — all rendered.
        let body = "א#הערה[ב] ג#הערתסיום[ד#הערה[ה]] ו#הערה[ז#הערתסיום[ח]] \
                    ט#הערתסיום(זרם: \"מקורות\")[י]\n\
                    #הערות_בסוף(כותרת: [הערות])\n#הערות_בסוף(זרם: \"מקורות\", כותרת: [מקורות])";
        let out = compile(body, &DocConfig::default());
        assert!(out.ok(), "diagnostics: {:?}", out.diagnostics);
    }

    #[test]
    fn endnote_streams_side_by_side() {
        // Three endnote streams rendered side by side, each its own column+title.
        let body = "א#הערתסיום(זרם: \"א\")[ראשון] ב#הערתסיום(זרם: \"ב\")[שני] \
                    ג#הערתסיום(זרם: \"ג\")[שלישי]\n\
                    #הערות_בסוף_צד(זרמים: (\"א\", \"ב\", \"ג\"), \
                    כותרות: (\"א\": [ביאורים], \"ב\": [מקורות], \"ג\": [הוספות]))";
        let out = compile(body, &DocConfig::default());
        assert!(out.ok(), "diagnostics: {:?}", out.diagnostics);
    }

    #[test]
    fn side_column_notes() {
        let body = "#עם_הערות_צד[טקסט#הערת_גיליון[הערה א] ועוד#הערת_גיליון[הערה ב] סוף.]";
        let out = compile(body, &DocConfig::default());
        assert!(out.ok(), "diagnostics: {:?}", out.diagnostics);
    }

    #[test]
    fn configurable_headings_lists_tables() {
        let body = "#הגדרות_כותרות(גודל: (2em, 1.4em), צבע: (rgb(\"#b91c1c\"), luma(40)), \
                    יישור: (center, right), מספור: \"1.1\", קו: (true, false))\n\
                    #הגדרות_רשימות(סמן: ([◆], [–]), הזחה: 1.5em, הידוק: true)\n\
                    #הגדרות_טבלאות(פסים: true, צבע_פס: luma(240), מרווח: 10pt, קו: 1pt + luma(80))\n\
                    #כותרת1[פרק] #כותרת2[סעיף]\n#רשימה(פריט[א], פריט[ב])\n\
                    #טבלה(עמודות: 2, תא[1], תא[2], תא[3], תא[4])";
        let out = compile(body, &DocConfig::default());
        assert!(out.ok(), "diagnostics: {:?}", out.diagnostics);
    }

    #[test]
    fn per_stream_columns() {
        // A stream with 2 columns next to a 1-column stream — independent counts.
        let body = "#הגדרות_זרמים(טורים: (\"מקורות\": 2))\n\
                    א#הערת_מקור[ראשון] ב#הערת_מקור[שני] ג#הערת_מקור[שלישי] \
                    ד#הערת_תוכן[ביאור].";
        let out = compile(body, &DocConfig::default());
        assert!(out.ok(), "diagnostics: {:?}", out.diagnostics);
    }

    #[test]
    fn toc_number_suppression() {
        // Headers keep a stepping counter, but the TOC must be able to hide the
        // numbers: auto (default, follows heading config = none), explicit false,
        // and explicit true all compile.
        let body = "#כותרת1[פרק]\n#כותרת2[סעיף]\n\
                    #תוכן()\n#תוכן(מספור: false)\n#תוכן(מספור: true)";
        let out = compile(body, &DocConfig::default());
        assert!(out.ok(), "diagnostics: {:?}", out.diagnostics);
    }

    #[test]
    fn review_marks_in_every_view() {
        // Tracked changes and an editorial comment, in all three review views.
        for view in ["סימון", "סופי", "מקורי"] {
            let body = format!(
                "#הגדרות_סקירה(תצוגה: \"{view}\")\n\
                 כתב #הוספה[מוסיף] ו#מחיקה[מוחק]#הערת_עורך(מאת: \"עורך\")[לבדוק] סוף."
            );
            let out = compile(&body, &DocConfig::default());
            assert!(out.ok(), "{view}: {:?}", out.diagnostics);
        }
    }

    #[test]
    fn review_comment_inside_side_column() {
        // A comment inside a side-column section lands in the column rather than
        // falling back to a footnote.
        let body = "#עם_הערות_צד[טקסט#הערת_עורך[לשקול שוב] ועוד#הערת_עורך[ומכאן].]";
        let out = compile(body, &DocConfig::default());
        assert!(out.ok(), "diagnostics: {:?}", out.diagnostics);
    }

    #[test]
    fn section_page_setup() {
        // Two sections with their own page setup, around ordinary text.
        let body = "רגיל\n#מקטע_עמוד(טורים: 2, כותרת_עליונה: \"נספח\", מספור: \"i\")[\
                    טקסט בשני טורים.]\n\
                    #מקטע_עמוד(לרוחב: true, מסגרת: true, סימן_מים: \"טיוטה\", שוליים: 1.5cm)[\
                    דף לרוחב עם מסגרת.]\nהמשך רגיל.";
        let out = compile(body, &DocConfig::default());
        assert!(out.ok(), "diagnostics: {:?}", out.diagnostics);
        assert!(
            out.pages_svg.len() >= 3,
            "each section should own its pages"
        );
    }

    #[test]
    fn math_formulas() {
        let body = "בשורה #נוסחה_בשורה(\"a^2 + b^2 = c^2\") וגם מוצגת:\n\
                    #נוסחה(\"sum_(i=1)^n i = (n(n+1))/2\", ממוספרת: true)";
        let out = compile(body, &DocConfig::default());
        assert!(out.ok(), "diagnostics: {:?}", out.diagnostics);
    }

    #[test]
    fn hebrew_numbering_and_header_footer() {
        let cfg = DocConfig {
            hebrew_numbering: true,
            header: "קונטרס".to_string(),
            footer: "בס\"ד".to_string(),
            paper: "us-letter".to_string(),
            ..DocConfig::default()
        };
        let out = compile("#כותרת1[פרק]\n#ממוספרת(פריט[א], פריט[ב])\n#תוכן()", &cfg);
        assert!(out.ok(), "diagnostics: {:?}", out.diagnostics);
    }

    /// A page range as the numbers it names, for readable assertions.
    fn ranges(spec: &str) -> Vec<(Option<usize>, Option<usize>)> {
        parse_page_spec(spec)
            .ranges
            .into_iter()
            .map(|r| (r.start().map(|n| n.get()), r.end().map(|n| n.get())))
            .collect()
    }

    /// The tokens a spec refused, for readable assertions.
    fn offcuts(spec: &str) -> Vec<String> {
        parse_page_spec(spec).bad
    }

    #[test]
    fn page_ranges_parse_the_shapes_people_type() {
        assert_eq!(ranges("3"), vec![(Some(3), Some(3))]);
        assert_eq!(ranges("1,3"), vec![(Some(1), Some(1)), (Some(3), Some(3))]);
        assert_eq!(ranges("5-9"), vec![(Some(5), Some(9))]);
        // An open end on either side is legitimate, which is the whole reason the
        // bounds are optional rather than defaulted to 1 and the page count.
        assert_eq!(ranges("5-"), vec![(Some(5), None)]);
        assert_eq!(ranges("-9"), vec![(None, Some(9))]);
        // Spaces are a keystroke, not an intention.
        assert_eq!(
            ranges(" 2 , 4 - 6 "),
            vec![(Some(2), Some(2)), (Some(4), Some(6))]
        );
    }

    #[test]
    fn a_malformed_page_range_costs_only_itself() {
        // Dropping the bad part and exporting the rest beats refusing to produce
        // any PDF at all over a typo in one field.
        assert_eq!(
            ranges("2,oops,4"),
            vec![(Some(2), Some(2)), (Some(4), Some(4))]
        );
        // A bare dash names nothing. Read as "every page" it would silently
        // swallow whatever else the writer asked for.
        assert_eq!(ranges("-"), vec![]);
        assert_eq!(ranges(""), vec![]);
        // Page zero does not exist; NonZeroUsize is what says so.
        assert_eq!(ranges("0"), vec![]);
    }

    /// #59: the tokens the parser could not read, named.
    ///
    /// This is the half of the fix the other tests cannot see. `ranges("0")` is
    /// `[]` **both** before the fix and after it — what changed is that `[]` now
    /// means "every token was refused, and here they are" instead of "no
    /// restriction, export everything". The end-to-end proof of that is in
    /// `tests/binding.rs`, which measures exported bytes; this is the grammar
    /// that decides it, and it is the same grammar `app/src/pagerange.ts`
    /// implements.
    #[test]
    fn a_page_range_that_names_no_page_is_refused_by_name() {
        // The four that used to fail silently.
        assert_eq!(offcuts("0"), vec!["0"], "page zero was not named");
        assert_eq!(offcuts("0-5"), vec!["0-5"], "`0-5` was not named");
        assert_eq!(
            offcuts("9-2"),
            vec!["9-2"],
            "a backwards range was not named"
        );
        assert_eq!(offcuts("-"), vec!["-"], "a bare dash was not named");
        assert_eq!(offcuts("x"), vec!["x"], "garbage was not named");
        // A clean spec names nothing.
        assert_eq!(offcuts("1-4"), Vec::<String>::new());
        // And the good tokens in a partly-bad spec still come through — this is
        // the "costs only itself" rule, with the offcuts now visible.
        assert_eq!(offcuts("1,x,5"), vec!["x"]);
        assert_eq!(
            ranges("1,x,5"),
            vec![(Some(1), Some(1)), (Some(5), Some(5))]
        );
        // A spec naming page zero alongside a real one keeps the real one.
        assert_eq!(ranges("0,3"), vec![(Some(3), Some(3))]);
        assert_eq!(offcuts("0,3"), vec!["0"]);
    }

    /// #59: an all-refused spec is **not** an export of everything.
    ///
    /// This is the assertion that does not exist anywhere else and the one that
    /// was the bug. `pdf_options` used to read "no ranges" as "no restriction",
    /// so `0` exported the whole sefer. The distinction now lives here:
    ///
    /// | spec | `restricted` | `ranges` | export |
    /// |---|---|---|---|
    /// | `""` | false | — | every page — **correct**, the writer asked for that |
    /// | `"0"` | true | — | **refused** |
    /// | `"1,x"` | true | one | page 1, and `x` named |
    #[test]
    fn an_all_refused_page_range_is_refused_rather_than_every_page() {
        let named = |s: &str| -> usize {
            if s.trim().is_empty() {
                0
            } else {
                parse_page_spec(s).ranges.len()
            }
        };
        assert_eq!(named(""), 0, "an empty box is not a restriction at all");
        assert_eq!(named("0"), 0, "`0` produced no ranges");
        assert_eq!(named("x"), 0, "`x` produced no ranges");
        assert_eq!(named("9-2"), 0, "`9-2` produced no ranges");
        assert_eq!(named("1"), 1);
        // And the export decision itself, which is the thing that was wrong.
        assert!(
            page_ranges_for_export(&parse_page_spec(""))
                .unwrap()
                .is_none(),
            "an empty spec is every page"
        );
        assert!(
            page_ranges_for_export(&parse_page_spec("0")).is_err(),
            "an all-refused spec must not export everything"
        );
        // The error names the offending token, because that is what the writer
        // has to fix.
        let err = page_ranges_for_export(&parse_page_spec("0")).unwrap_err();
        assert!(err.contains("\"0\""), "the token was not named: {err}");
        // …and a partly-good spec still exports what it named.
        let ok = page_ranges_for_export(&parse_page_spec("1,x")).unwrap();
        assert_eq!(ok.map(|r| r.len()), Some(1));
    }

    #[test]
    fn head_alignment_is_read_in_either_language() {
        assert_eq!(sanitize_head_align("חוץ"), "outside");
        assert_eq!(sanitize_head_align("outside"), "outside");
        assert_eq!(sanitize_head_align("פנים"), "inside");
        assert_eq!(sanitize_head_align("inner"), "inside");
        // Anything unrecognised centres rather than reaching the prelude, where it
        // would pick a branch nobody asked for.
        assert_eq!(sanitize_head_align("sideways"), "center");
        assert_eq!(sanitize_head_align(""), "center");
    }

    #[test]
    fn a_keyword_list_of_one_is_still_an_array() {
        // `("a")` is a parenthesised string in Typst, not an array, and
        // `keywords:` rejects it — so the trailing comma is load-bearing.
        assert_eq!(typst_str_array(&["דקדוק".to_string()]), "(\"דקדוק\",)");
        assert_eq!(typst_str_array(&[]), "()");
    }

    #[test]
    fn a_two_sided_document_still_carries_every_setting_it_was_given() {
        // Cheap end-to-end guard on the wrapper's argument list: eighteen new
        // named arguments went into one `format!`, and a typo in any of them is
        // an "unknown argument" that fails the whole document.
        let cfg = DocConfig {
            two_sided: true,
            margin_inner_cm: Some(3.5),
            margin_outer_cm: Some(1.5),
            margin_top_cm: Some(2.0),
            gutter_cm: 0.5,
            header_odd: "פרק א".to_string(),
            footer_even: "ה'תשפ\"ו".to_string(),
            head_align: "outside".to_string(),
            title: "ספר".to_string(),
            author: "המחבר".to_string(),
            keywords: vec!["הלכה".to_string()],
            ..DocConfig::default()
        };
        let out = compile("שלום עולם", &cfg);
        assert!(out.ok(), "diagnostics: {:?}", out.diagnostics);
    }
}

mod line_height_tests {
    use crate::*;

    /// The fence on the percent-of-sheet claim: the Rust scanner and the
    /// Typst slot must resolve a `שורות` height to the same centimetres.
    /// `_ap_fixed_height` falls back to `par.leading + text.size` — 21pt at
    /// the shipped defaults — so three lines are 63pt, not some other number.
    #[test]
    fn a_lines_height_resolves_like_the_drawn_slot() {
        let got = length_cm("שורות(3)", Some(29.7)).expect("שורות resolves");
        let want = 3.0 * 21.0 * 2.54 / 72.0;
        assert!((got - want).abs() < 1e-9, "{got} against {want}");
        let english = length_cm("lines(2)", None).expect("lines resolves without a sheet");
        assert!(
            (english - 2.0 * DEFAULT_LINE_CM).abs() < 1e-9,
            "a count of lines needs no sheet: {english}"
        );
        // …and the scan of a document declaring one reserves it, rather than
        // falling back to the flat default that under-reserved the sitting's
        // sefer into 116 near-blank leaves.
        let body = "#הגדרות_מדפים(גבהים: (שורות(2),))\n#מדף_א[גוף] טקסט.";
        let reserve = auto_notes_region_cm(body);
        assert!(
            reserve >= 2.0 * DEFAULT_LINE_CM,
            "a שורות-declared band reserved {reserve}cm - under its own height"
        );
    }
}

//! `engine/facts.gen.json` is what this crate says it is.
//!
//! # What this replaces
//!
//! The app's generators used to read four Rust tables by parsing this crate's
//! *source text*, and one of the four — `impl Default for DocConfig` — was
//! parsed by byte range with no fence of any kind on it. `services.rs` had
//! noticed the same danger about itself and answered it with `#[rustfmt::skip]`
//! plus a paragraph warning that its formatting was a build input, which stops
//! rustfmt and stops nothing else. The `DocConfig` block had neither, so
//! reflowing it changed what the editor shipped as its document defaults,
//! silently, in the direction that is hardest to see: the Rust value always wins
//! on the wire, so the app's sliders would have read one number while the page
//! was laid out to another.
//!
//! `src/facts.rs` now serialises all four tables. This file is the fence that
//! keeps the committed artefact honest, and it is the only door:
//!
//! ```text
//! cargo test --test facts                 # is it current?
//! KSAV_BLESS=1 cargo test --test facts    # make it current
//! ```
//!
//! # Why a committed artefact and not a build step
//!
//! `app/tools/*.mjs` and `npm test` run on a clone that has never had a Rust
//! toolchain pointed at it, in about three seconds. Making them shell out to
//! cargo would trade a silent-drift bug for a ten-minute inner loop, which is
//! the trade that produced the hand-written copies in the first place. So the
//! artefact is committed, this test is what keeps it true, and
//! `app/tools/facts.mjs` carries a declaration-count check so that an unblessed
//! Rust edit is caught by `npm test` as well as by CI.

use std::path::{Path, PathBuf};

/// `engine/facts.gen.json`.
fn artefact() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("facts.gen.json")
}

#[test]
fn the_committed_facts_are_this_crates_facts() {
    let wanted = ksav_engine::facts::facts_json();
    let path = artefact();

    // Blessing rewrites the artefact. It does not excuse the comparison.
    //
    // This used to `return` here, which made `KSAV_BLESS=1` a switch that turns
    // the fence into a test that writes a file and reports success — a check
    // passing because it did not run. One `export` in a shell profile is all
    // that takes, and it is silent and permanent on that machine.
    //
    // So: refused where nobody could have meant it, and where it is meant, the
    // comparison below still happens. It compares against what was just
    // written, which is evidence rather than an assumption — if the write
    // landed somewhere else, or landed wrong, this still goes red.
    if std::env::var_os("KSAV_BLESS").is_some() {
        assert!(
            std::env::var_os("CI").is_none(),
            "KSAV_BLESS is set in CI. Blessing rewrites the artefact this test \
             exists to check, so on a remote it would report success for a \
             comparison nobody made. Regenerate on a desk and commit the result.",
        );
        std::fs::write(&path, &wanted).expect("write facts.gen.json");
        eprintln!("wrote {}", path.display());
    }

    let have = std::fs::read_to_string(&path).unwrap_or_default();
    if have == wanted {
        return;
    }

    // Name the first table that moved rather than printing 40 KB of JSON at
    // somebody. A stale artefact is a failure a reader meets before they know
    // how this repository is put together, and "they differ" without "which
    // one, and what to run" is a dead end.
    let moved = first_difference(&have, &wanted);
    panic!(
        "engine/facts.gen.json is stale{moved}.\n\
         Regenerate it with:\n  \
         KSAV_BLESS=1 cargo test --test facts\n\
         then regenerate the app's copies with:\n  \
         cd ../app && npm run fixtures",
    );
}

/// A short description of where two JSON documents first disagree.
fn first_difference(have: &str, wanted: &str) -> String {
    let (Ok(a), Ok(b)) = (
        serde_json::from_str::<serde_json::Value>(have),
        serde_json::from_str::<serde_json::Value>(wanted),
    ) else {
        return String::new();
    };
    for key in [
        "doc_defaults",
        "commands",
        "notices",
        "services",
        "hebrew",
        "template_fields",
        "markup_escapes",
        "param_en",
        "command_en",
    ] {
        if a.get(key) != b.get(key) {
            return format!(" — `{key}` changed");
        }
    }
    String::new()
}

/// The artefact carries every field of `DocConfig`, including the absent ones.
///
/// The four per-edge margins and the note region serialise as `null`, and the
/// app reads `null` as *absent* rather than as zero, because absent means
/// "follow the uniform margin" — an instruction no number stands in for. A
/// serialiser that skipped `None` would emit a file that parses, typechecks and
/// quietly gives the editor five fewer settings than the engine has.
#[test]
fn an_absent_default_is_present_as_null() {
    let v: serde_json::Value =
        serde_json::from_str(&ksav_engine::facts::facts_json()).expect("valid JSON");
    let defaults = v["doc_defaults"].as_object().expect("an object");
    for key in [
        "margin_top_cm",
        "margin_bottom_cm",
        "margin_inner_cm",
        "margin_outer_cm",
        "notes_region_cm",
    ] {
        assert!(defaults.contains_key(key), "{key} is missing entirely");
        assert!(defaults[key].is_null(), "{key} should be null");
    }
}

/// Every table the app generates from is in there, and none of them is empty.
///
/// An empty table generates a file that typechecks, breaks everything at
/// runtime, and looks like a successful regeneration. The generators each carry
/// their own floor for the same reason; this is the one at the source.
#[test]
fn no_table_is_empty() {
    let v: serde_json::Value =
        serde_json::from_str(&ksav_engine::facts::facts_json()).expect("valid JSON");
    for (key, least) in [
        ("commands", 100),
        ("notices", 4),
        ("services", 10),
        ("doc_defaults", 25),
    ] {
        let n = match &v[key] {
            serde_json::Value::Array(a) => a.len(),
            serde_json::Value::Object(o) => o.len(),
            other => panic!("{key} is {other:?}"),
        };
        assert!(n >= least, "{key}: {n}, expected at least {least}");
    }
}

/// The English parameter vocabulary crossed as a value, not as source text.
///
/// An empty or truncated `param_en` generates a `PARAM_EN` that typechecks,
/// breaks every English document at runtime, and looks like a successful
/// regeneration — the same failure an empty `commands` table would. The floors
/// are the ones the generator already enforced on its regex read; they move
/// here so a stale artefact is caught before a client sees it.
#[test]
fn the_parameter_vocabulary_is_present() {
    let v: serde_json::Value =
        serde_json::from_str(&ksav_engine::facts::facts_json()).expect("valid JSON");
    let pe = &v["param_en"];
    let global = pe["global"].as_array().expect("param_en.global is an array");
    let by_command = pe["by_command"]
        .as_array()
        .expect("param_en.by_command is an array");
    assert!(global.len() >= 40, "global: {}", global.len());
    assert!(by_command.len() >= 10, "by_command: {}", by_command.len());

    // The two ambiguities the prelude's own comments are about, asserted so a
    // walk that starts collecting the wrong dictionary fails here rather than
    // in an editor whose English panel offers Hebrew.
    let colour = global
        .iter()
        .any(|p| p[0] == "colour" && p[1] == "צבע");
    assert!(colour, "colour → צבע is not in param_en.global");
    let document = by_command
        .iter()
        .find(|row| row[0] == "מסמך")
        .expect("document carries an extra table");
    let pairs = document[1].as_array().expect("its pairs");
    let columns = pairs
        .iter()
        .any(|p| p[0] == "columns" && p[1] == "טורים");
    assert!(columns, "מסמך.extra.columns → טורים is missing");
}

/// The structured walk and `en_param_pairs` (what diagnostics still flatten)
/// describe the same prelude — one is not a second table that can drift.
#[test]
fn the_flattened_pairs_are_the_structured_tables() {
    use ksav_engine::diagnostics::{en_param_pairs, param_tables};
    let prelude = include_str!("../typst/ksav.typ");
    let tables = param_tables(prelude);
    let flat = en_param_pairs(prelude);
    let mut want = tables.global.clone();
    for (_, pairs) in &tables.by_command {
        want.extend(pairs.iter().cloned());
    }
    assert_eq!(flat, want);
}

/// The walk's edge cases, on synthetic preludes the real file can only grow into.
///
/// These pin what "only a `FuncCall` to `_en` opens a row" actually rejects.
/// Without them a future edit that starts accepting *any* `extra:` — or that
/// walks into `_en`'s own definition — would pass every floor and every
/// byte-identity check against today's artefact, then ship a bogus wrapper the
/// first time somebody adds one.
#[test]
fn the_walk_only_opens_rows_for_real_en_wrappers() {
    use ksav_engine::diagnostics::param_tables;

    // `_en`'s own definition: a Closure whose parameter is named `extra`.
    let en_def = "#let _en(f, extra: (:)) = (..a) => f";
    let t = param_tables(en_def);
    assert!(t.global.is_empty(), "no _en_params in that snippet");
    assert!(
        t.by_command.is_empty(),
        "`_en` itself must not open a by_command row: {:?}",
        t.by_command
    );

    // The three unrelated `extra:` sites in the real prelude, reduced to their shape.
    let traps = [
        "#let _mk_mark(cls, body, named, extra: (:)) = body",
        "#let ערך(מונח, תת: none, ..שאר) = מונח",
        "let extra = (sub: \"x\")",
    ];
    for src in traps {
        let t = param_tables(src);
        assert!(
            t.by_command.is_empty(),
            "trap {src:?} must not open a row: {:?}",
            t.by_command
        );
    }

    // A wrapper with no `extra:` (or an empty one) contributes nothing — the
    // client's `if (over.size)` enforced the empty case after the fact; the
    // walk must enforce both before serialisation.
    let bare = "#let document = _en(מסמך)\n#let empty_extra = _en(מסמך, extra: (:))";
    assert!(
        param_tables(bare).by_command.is_empty(),
        "wrapper without overrides must not appear in by_command"
    );

    // Comments between `_en_params` entries are how the prelude documents why
    // a pairing is *absent*; they must not invent a pair or end the walk early.
    let commented = r#"
        #let _en_params = (
          colour: "צבע",
          // color: "צבע" — deliberately not here; British first.
          size: "גודל",
        )
        #let document = _en(מסמך, extra: (
          columns: "טורים", // PDF text columns, not table columns
        ))
    "#;
    let t = param_tables(commented);
    assert_eq!(
        t.global,
        vec![
            ("colour".into(), "צבע".into()),
            ("size".into(), "גודל".into()),
        ],
        "comments must not contribute pairs or truncate the dict"
    );
    assert_eq!(
        t.by_command,
        vec![(
            "מסמך".into(),
            vec![("columns".into(), "טורים".into())],
        )],
        "a trailing // note inside extra: must not hide the pair"
    );
}

/// The command pairing crossed as a value, not as source text.
///
/// An empty or truncated `command_en` generates a `COMMAND_EN` that typechecks,
/// breaks every English spelling at runtime, and looks like a successful
/// regeneration. These are the floors the generator enforced on its line regex,
/// moved here so a stale artefact is caught before a client sees it — plus the
/// one ambiguity a floor cannot catch.
#[test]
fn the_command_pairing_is_present() {
    let v: serde_json::Value =
        serde_json::from_str(&ksav_engine::facts::facts_json()).expect("valid JSON");
    let pairs = v["command_en"]
        .as_array()
        .expect("command_en is an array of [english, hebrew] pairs");
    assert!(pairs.len() >= 120, "command_en: {}", pairs.len());
    for row in pairs {
        assert!(
            row[0].is_string() && row[1].is_string(),
            "not a [english, hebrew] pair: {row}"
        );
    }

    // The two forms, because they are two shapes of one statement and a walk
    // that reads only one of them passes every floor and ships half a palette.
    let has = |en: &str, he: &str| pairs.iter().any(|r| r[0] == en && r[1] == he);
    assert!(has("bold", "הדגשה"), "the bare-alias form is missing");
    assert!(has("band", "מדור_בדרגה"), "the _en wrapper form is missing");

    // First English spelling wins, so the second one has to be *in* the table
    // for the reader's rule to have anything to apply. `אות` is the only
    // command with two (`os` and `osource`). If the walk deduplicated here
    // instead, the client would still be right today — so the assertion is
    // that both are present, not which one wins.
    assert!(has("os", "אות"), "אות → os is missing");
    assert!(has("osource", "אות"), "אות → osource is missing");
}

/// The first English spelling of a Hebrew command is the one the client keeps.
///
/// `command_aliases` returns declaration order and leaves the choice to the
/// reader, exactly as `param_en` does; this states the reader's rule where a
/// future consumer of the raw list can see what it is for.
#[test]
fn the_first_english_spelling_of_a_command_wins() {
    let mut first: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    for (en, he) in ksav_engine::diagnostics::command_aliases(include_str!("../typst/ksav.typ")) {
        first.entry(he).or_insert(en);
    }
    assert_eq!(first.get("אות").map(String::as_str), Some("os"), "declaration order decides");
    assert_eq!(first.get("הדגשה").map(String::as_str), Some("bold"));
    assert_eq!(first.get("מדור_בדרגה").map(String::as_str), Some("band"));
}

/// The alias walk's edge cases, on synthetic preludes the real file can only grow into.
///
/// Each trap is a shape the walk has to reject *for a stated reason*: a
/// function-local `let` binds a variable, a Hebrew-bound name is a Hebrew name
/// rather than an English spelling of one, an `_`-prefixed name is the
/// prelude's own plumbing, and a call to anything but `_en` is an ordinary
/// binding. A walk that accepted all four would pass every floor and every
/// byte-identity check against today's artefact, then ship a bogus English name
/// the first time somebody wrote one.
#[test]
fn the_alias_walk_only_opens_for_document_commands() {
    use ksav_engine::diagnostics::command_aliases;

    let none = Vec::<(String, String)>::new();

    // A function-local `let` whose value is a bare Hebrew identifier. The
    // prelude really has this shape (`let _gmin = רשת_מרווח_מזערי`), and only
    // the `Code` parent separates it from a real alias.
    assert_eq!(command_aliases("#let f(a) = {\n  let inner = a\n  inner\n}\n"), none);

    // A Hebrew name bound to a Hebrew name is a Hebrew definition.
    assert_eq!(command_aliases("#let סימן = סימן_אחר\n"), none);

    // Plumbing: `_en`, `_en_params`, `_kd_parents` are the prelude's own.
    assert_eq!(
        command_aliases("#let _en(f, extra: (:)) = f\n#let _pair = כותרת1\n"),
        none,
        "an underscore-prefixed name is not a command"
    );

    // An English-named binding that is not an alias: a call to another
    // function, a string, a number, a list, a closure.
    for src in [
        "#let pick = titles.at(0)\n",
        "#let text = \"הדגשה\"\n",
        "#let n = 3\n",
        "#let names = (הדגשה, נטוי)\n",
        "#let make() = הדגשה\n",
        // `_en` wrapping an ASCII name is the other direction, and the
        // registry has no row for it.
        "#let wrap = _en(h1)\n",
    ] {
        assert_eq!(command_aliases(src), none, "trap {src:?} is not an alias");
    }

    // The two forms, and the two directions in which a line scan is wrong.
    //
    // Each of these was measured against the line regex this walk replaced
    // (`/^#let ([A-Za-z][A-Za-z0-9_]*) = …/` per line), which is why the shapes
    // are the ones they are. Over-reads: the regex invents a command where there
    // is none. Under-reads: it misses one that is there.
    for src in [
        // Over-read: a block comment with the alias on a line of its own. A
        // one-line `// #let …` is safe — the anchor needs `#` first — but a
        // commented-out *block* of aliases is how one switches several off at
        // once, and the regex cannot tell it from the code under it.
        "/*\n#let bold = הדגשה\n*/\n",
        // Over-read: a multi-line string, which the prelude uses to carry
        // documentation that quotes commands.
        "#let s = \"\n#let bold = הדגשה\n\"\n",
        // Over-read: a raw block. Its contents are code shown to a reader, not
        // the document's namespace.
        "```typ\n#let bold = הדגשה\n```\n",
    ] {
        assert_eq!(
            command_aliases(src),
            none,
            "trap {src:?} is a comment, a string or a raw block, not a command"
        );
    }

    // Under-read: a `#let` in a markup content block **is** a command a document
    // may legitimately declare, and the line scan cannot see it because it is
    // not at the start of a line.
    assert_eq!(
        command_aliases("#box[#let cell = תא]"),
        vec![("cell".into(), "תא".into())],
        "a binding is not a line"
    );

    // Under-read: the `_en` argument read as text rather than as an argument.
    // `_en\(([^\s,)]+)` stops at the first paren, so a parenthesised command —
    // a real binding, which compiles and names the same thing — read as nothing
    // at all. Both readers missed it before this walk; that is why the case is
    // here rather than in the paragraph above.
    assert_eq!(
        command_aliases("#let band = _en((מדור_בדרגה))\n"),
        vec![("band".into(), "מדור_בדרגה".into())],
        "a parenthesised command is the same command"
    );

    // The first *positional* argument is the command, and a `Named` one is not.
    // Reading past it would report `extra` as the command.
    for src in [
        "#let band = _en(extra: (columns: \"טורים\"), מדור_בדרגה)\n",
        "#let band = _en((a, b))\n",
    ] {
        assert_eq!(command_aliases(src), none, "trap {src:?} has no command");
    }

    // Both forms, in one file, in the order a client will keep them.
    let both = "#let bold = הדגשה\n#let band = _en(מדור_בדרגה, extra: (columns: \"טורים\"))\n#let ital = נטוי\n";
    assert_eq!(
        command_aliases(both),
        vec![
            ("bold".into(), "הדגשה".into()),
            ("band".into(), "מדור_בדרגה".into()),
            ("ital".into(), "נטוי".into()),
        ],
        "declaration order is what the reader's first-wins rule runs on"
    );
}

/// The registry and the prelude say the same thing, checked from Rust.
///
/// `emit-engine.mjs` already cross-checks the two and exits 1, but that runs on
/// a machine that has Node and reads a JSON artefact. This asks the same
/// question of the values, so a disagreement is a red `cargo test` as well —
/// and, unlike the generator, it can say which of the two is wrong when the
/// registry and the prelude name *different* English names for one command.
#[test]
fn every_registry_command_agrees_with_the_preludes_spelling() {
    let mut aliases: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    for (en, he) in ksav_engine::diagnostics::command_aliases(include_str!("../typst/ksav.typ")) {
        // First declaration wins, as the client does.
        aliases.entry(he).or_insert(en);
    }
    let mut twins = 0;
    for c in ksav_engine::commands::COMMANDS {
        match aliases.get(c.he) {
            Some(en) => assert_eq!(
                en.as_str(), c.en,
                "registry and prelude disagree about {}: the registry says \"{}\", \
                 the prelude aliases it to \"{en}\"",
                c.he, c.en
            ),
            None => {
                // The registry's independently-defined twins — `#let hlevel(body,
                // level: 1)`, which is `#כותרת` under an English parameter name
                // rather than an alias of it. The prelude cannot record that the
                // two are one command, so the generator adds them from the
                // registry; there must be few of them or the aliasing has
                // stopped being the mechanism.
                twins += 1;
                assert!(
                    !c.en.is_empty(),
                    "{} is in the registry with no English name at all",
                    c.he
                );
            }
        }
    }
    assert!(
        twins <= 5,
        "{twins} registry commands are not prelude aliases — the aliasing is \
         supposed to be the mechanism, and a growing list here means the \
         generator's registry-only fallback is doing the work"
    );
}


//! A generated corpus, for the shapes nobody thinks to write down.
//!
//! `tests/hostile.rs` is a hand-written list of the hostile inputs somebody
//! thought of. This is the other half: a deterministic generator over the
//! vocabulary a document actually reaches for — commands, brackets, strings,
//! markup, Hebrew, ASCII, control characters — assembled into documents nobody
//! would type, and every one of them required to come back as a **verdict**.
//!
//! Determinism is the point rather than an inconvenience. A fuzz test that
//! cannot be re-run on the input that failed is a test that reports a crash and
//! then loses it, so this one is a seeded LCG with the seed printed in every
//! failure message, and the failing document's own text quoted beside it. Copy
//! the seed, get the document back.
//!
//! It is **not** a coverage-guided fuzzer, and it does not pretend to be one:
//! `cargo fuzz` would be a dependency and a corpus directory, and this is a
//! zero-dependency generator that runs in the gate.
//!
//! # Two families, because one number hides the other
//!
//! A single random mix washes both halves out: a corpus that is mostly
//! unbalanced fragments never reaches layout (the parser refuses first), and one
//! that is mostly well-formed prose never reaches the parser's error recovery.
//! So the generator takes a `Family`, and the test asserts something different
//! about each:
//!
//! * `Family::Document` — pairs that close what they open, and text a writer
//!   would type. **Most of these must compile**, which is the anti-vacuity
//!   assertion: if they stopped compiling, the corpus would be exercising only
//!   the error path and would still pass 800 times.
//! * `Family::Fragment` — unclosed structures, closers with nothing to close, a
//!   name cut off mid-word, control characters, a runaway paste. None has to
//!   compile; all must be a verdict, and none may take longer than `BUDGET`.
//!
//! Each document is bounded in time (`BUDGET`): a compile that never finishes is
//! a stalled window rather than a crash, and a test suite that hangs is one
//! nobody runs. The budget is generous, because #213 is the issue about cost and
//! this file is about verdicts.

use std::time::{Duration, Instant};

use ksav_engine::{probe, services, DocConfig};

/// The product's own vocabulary, as pairs that open and close.
///
/// Taken from `commands::COMMANDS`' `insert` strings — the same text the editor
/// actually inserts — rather than written out here. A hand-written copy would be
/// a second registry, and this file is about documents, not about being the list
/// that disagrees with the product when a command is renamed.
///
/// `insert` marks the cursor with `|`, so a pair is the text either side of it:
/// `#הדגשה[|]` is `("#הדגשה[", "]")`, and `#כותרת(רמה: 4)[|]` is
/// `("#כותרת(רמה: 4)[", "]")`. Anything with no `|` is skipped rather than
/// guessed at.
fn openers() -> Vec<(String, String)> {
    ksav_engine::commands::COMMANDS
        .iter()
        .filter_map(|c| {
            let (open, close) = c.insert.split_once('|')?;
            // A command whose insert is a whole document is not a fragment to
            // nest inside another one.
            if open.is_empty() || close.is_empty() {
                return None;
            }
            Some((open.to_string(), close.to_string()))
        })
        .collect()
}

/// Fragments that open a structure, closed by an arbitrary later fragment.
///
/// The hand-written ones are deliberate: they are the characters a writer types
/// that are *not* commands, which the registry cannot enumerate, and the
/// mismatched closers (a `]` for a `(`) that are the whole point of
/// `Family::Fragment`.
const RAW_OPENERS: &[&str] = &[
    "[", "{", "(", "\"", "`", "#[", "//", "/*", "$", "@", "<", "`",
];

/// Fragments that close one, or close the wrong one.
const CLOSERS: &[&str] = &["]", "}", ")", "\"", "`", "]", "*", "/", "$", "]", " #", ">"];

/// Text a real document is made of, in both scripts, none of which is malformed
/// on its own — so a document built only from these has no excuse to fail.
const WORDS: &[&str] = &[
    "שלום",
    "עולם",
    "word",
    "words",
    "א",
    "a",
    "  ",
    "\n",
    "\n\n",
    "  - ",
    "1. ",
    "ב\"ה",
    "מהרש\"א",
    "(ע\"א)",
    "\\",
    "\u{200e}",
    "\t",
    "טקסט עם רווח",
];

/// The same, plus the fragments that *should* fail: a stray control character, a
/// command with no name, a table with no columns, a number too large to be one.
const HOSTILE_WORDS: &[&str] = &[
    "\u{202e}",
    "\u{fffd}",
    "\u{0}",
    "#",
    "/",
    "1e999",
    "0x",
    "999999999999999999999999",
    "#כותרת_1\n",
    "#עבור i = 0; i < 3; i += 1 []",
    "#עבור x in () []",
    "#טבלה(עמודות: 0)",
    "#ספירה(\"א\")",
    "#הערה[",
    "@key",
    "<label>",
];

/// Which kind of document to generate.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Family {
    /// Structures that close, and text a writer would type. Most of these must
    /// compile — that is what the anti-vacuity assertion checks.
    Document,
    /// Unbalanced and malformed. None of these has to compile; all of them must
    /// be a verdict.
    Fragment,
}

/// A tiny LCG: three lines, reproducible, and good enough to shuffle fragments.
struct Rng(u64);

impl Rng {
    fn next(&mut self) -> u64 {
        // Numerical Recipes' constants. Wrapping, because that is the point.
        self.0 = self
            .0
            .wrapping_mul(6_364_136_223_846_793_005)
            .wrapping_add(1);
        self.0 >> 33
    }

    fn pick<'a, T>(&mut self, from: &'a [T]) -> &'a T {
        &from[(self.next() as usize) % from.len()]
    }

    fn upto(&mut self, n: usize) -> usize {
        (self.next() as usize) % n.max(1)
    }
}

/// One generated document, and the seed that produced it.
fn document(seed: u64, family: Family) -> String {
    let mut rng = Rng(seed);
    let pairs = openers();
    let pieces = 1 + rng.upto(40);
    let mut out = String::new();
    for _ in 0..pieces {
        match (family, rng.upto(10)) {
            (Family::Document, 0..=4) => out.push_str(rng.pick(WORDS)),
            (Family::Document, 5..=6) => {
                // A structure that closes the one it opened, with text inside —
                // and sometimes nested, which is what a real document does.
                let (open, close) = &pairs[rng.upto(pairs.len())];
                out.push_str(open);
                for _ in 0..rng.upto(3) {
                    out.push_str(rng.pick(WORDS));
                    if rng.upto(2) == 0 {
                        let (o, c) = &pairs[rng.upto(pairs.len())];
                        out.push_str(o);
                        out.push_str(rng.pick(WORDS));
                        out.push_str(c);
                    }
                }
                out.push_str(close);
            }
            (Family::Document, _) => {
                // A paragraph, which is what a real document is mostly made of.
                //
                // This branch emitted a heading line until it was measured:
                // `#כותרת_1` is not a command — `#כותרת1` is — so the corpus came
                // out 95% documents that died in the parser, and the
                // anti-vacuity assertion below is what said so.
                out.push_str(rng.pick(WORDS));
                out.push_str("\n\n");
                out.push_str(rng.pick(WORDS));
            }
            (Family::Fragment, 0..=2) => out.push_str(rng.pick(HOSTILE_WORDS)),
            (Family::Fragment, 3..=5) => {
                out.push_str(&random_opener(&mut rng, &pairs));
                out.push_str(rng.pick(HOSTILE_WORDS));
                out.push_str(rng.pick(CLOSERS));
            }
            (Family::Fragment, 6..=7) => {
                // A structure opened and never closed, which is the shape a
                // half-typed document is in on every keystroke.
                out.push_str(&random_opener(&mut rng, &pairs));
                out.push_str(rng.pick(HOSTILE_WORDS));
            }
            (Family::Fragment, 8) => {
                // A closer with nothing to close.
                out.push_str(rng.pick(CLOSERS));
            }
            (Family::Fragment, _) => {
                // A name, as a writer would type it mid-word, and a runaway
                // paste of one fragment.
                out.push('#');
                out.push_str(rng.pick(HOSTILE_WORDS));
                out.push('(');
                let f = rng.pick(HOSTILE_WORDS);
                for _ in 0..rng.upto(200) {
                    out.push_str(f);
                }
            }
        }
    }
    out
}

/// An opener from either source: the product's own, or a bare character.
fn random_opener(rng: &mut Rng, pairs: &[(String, String)]) -> String {
    if rng.upto(3) == 0 {
        rng.pick(RAW_OPENERS).to_string()
    } else if pairs.is_empty() {
        "(".to_string()
    } else {
        pairs[rng.upto(pairs.len())].0.clone()
    }
}

/// How long one generated document may take. Generous: `tests/nesting.rs`
/// measures a 20,000-bracket document at about a second in a debug build, and
/// the generated ones are shorter than that.
const BUDGET: Duration = Duration::from_secs(20);

/// How many documents of each family.
const SEEDS: u64 = 400;

#[test]
fn a_generated_corpus_of_documents_all_come_back_with_a_verdict() {
    let cfg = DocConfig::default();
    let mut slowest = Duration::ZERO;
    let mut slowest_seed = 0;
    let mut ok_count = 0usize;
    let mut compiled_documents = 0usize;
    for (seed, family) in (1..=SEEDS)
        .map(|s| (s, Family::Document))
        .chain((1..=SEEDS).map(|s| (s, Family::Fragment)))
    {
        let body = document(seed, family);
        let started = Instant::now();
        let outcome =
            std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| probe::layout(&body, &cfg)));
        let elapsed = started.elapsed();
        match outcome {
            Ok(Ok(_)) => {
                ok_count += 1;
                if family == Family::Document {
                    compiled_documents += 1;
                }
            }
            Ok(Err(diags)) => {
                assert!(
                    !diags.is_empty(),
                    "seed {seed} {family:?}: a failed compile must say why. Document:\n{body:?}"
                );
                // A diagnostic's line has to be a line of **this** document.
                //
                // Nothing crashes if it is not — the writer sees an error
                // pointing past the end of their own text and has nowhere to fix
                // it, which is the kind of wrong that a "the compile cannot be
                // wrong" test never catches. The offset conversion prepends the
                // prelude and subtracts it again, so off-by-one and
                // off-by-a-prelude are both live possibilities here.
                let lines = body.lines().count().max(1);
                // The last line may be one past `lines()`, and that is correct for
                // the same reason the column may be one past the width: a document
                // ending in a newline has an empty last line that `lines()` does not
                // count, and an error at the end of the text is pointed at it. Seed
                // 437 (5,000-document sweep) is what said so.
                for d in &diags {
                    if let Some(line) = d.line {
                        assert!(
                            (1..=lines + 1).contains(&line),
                            "seed {seed} {family:?}: a diagnostic points at line {line} of a \
                             {lines}-line document. Message: {}. Document:\n{body:?}",
                            d.message
                        );
                    }
                    // The column may be one past the last character, and that is
                    // correct rather than an off-by-one: a missing comma is pointed
                    // at the place it belongs, which is the end of the line. The
                    // first version of this assertion said `<= width` and seed 23
                    // reddened on a document whose error was exactly that.
                    if let (Some(column), Some(line)) = (d.column, d.line) {
                        let width = body
                            .lines()
                            .nth(line.saturating_sub(1))
                            .map(|l| l.chars().count())
                            .unwrap_or(0);
                        assert!(
                            column >= 1 && column <= width + 1,
                            "seed {seed} {family:?}: a diagnostic points at column {column} of a \
                             {width}-character line ({line}). Message: {}. Document:\n{body:?}",
                            d.message
                        );
                    }
                }
            }
            Err(_) => panic!(
                "seed {seed} {family:?}: this document panicked the engine. Document:\n{body:?}\n\
                 Run `document({seed}, Family::{family:?})` in tests/fuzz.rs to get it back."
            ),
        }
        assert!(
            elapsed < BUDGET,
            "seed {seed} {family:?} took {elapsed:?}, past the {BUDGET:?} budget — a compile \
             that never finishes is a stalled window rather than a crash, and it still stops \
             a writer. Document:\n{body:?}"
        );
        if elapsed > slowest {
            slowest = elapsed;
            slowest_seed = seed;
        }
    }
    println!(
        "{SEEDS} documents + {SEEDS} fragments, slowest seed {slowest_seed} at {slowest:?}, \
         {ok_count} compiled, {compiled_documents} of them from the document family"
    );
    // The anti-vacuity assertion: if the well-formed family stopped compiling,
    // this test would still pass 800 times while exercising only the parser's
    // error path — a fence around a corpus that had stopped being a corpus.
    assert!(
        compiled_documents > SEEDS as usize / 2,
        "only {compiled_documents} of {SEEDS} well-formed documents compiled — the generator \
         is producing fragments, so this test is not reaching layout"
    );
}

// ------------------------------------------------------------ the wire

/// A request any service might be handed, that no writer ever handed it.
///
/// The documents in the two families above arrive as a JSON request, so the
/// boundary a stranger reaches is `services::call`, not the parser: a wrong
/// JSON type, a key that means something in one service and nothing in another,
/// an object where a string belongs. Each of these must come back as JSON that
/// says `ok`, and a `false` must be said out loud with an error or a diagnostic
/// — never a panic and never a shape the client cannot parse.
#[test]
fn every_service_answers_garbage_with_json_rather_than_a_panic() {
    // The service list is the registry's own, so a service added later is fuzzed
    // by this test without an edit here. (Fuzzed lightly — see `BUDGET`.)
    let names: Vec<String> =
        serde_json::from_str::<Vec<serde_json::Value>>(&services::services_json())
            .expect("the registry describes itself as JSON")
            .into_iter()
            .map(|s| s["name"].as_str().unwrap_or("").to_string())
            .filter(|n| !n.is_empty())
            .collect();
    assert!(names.len() >= 8, "the registry has shrunk: {names:?}");

    // Hand-written shapes: the ones a mutation of a real request is most likely
    // to produce, plus the boundary cases JSON itself has.
    let manual: &[&str] = &[
        "",
        " ",
        "null",
        "true",
        "0",
        "1e999",
        "\"str\"",
        "[]",
        "{}",
        "{\"text\": null}",
        "{\"text\": 7}",
        "{\"text\": []}",
        "{\"text\": {}}",
        "{\"body\": \"שלום\"}",
        "{\"text\": \"שלום\"}",
        "{\"have_pages\": \"not an array\"}",
        "{\"cfg\": {\"dir\": 7}}",
    ];

    let mut compiled_ok = 0;
    for name in &names {
        let mut calls = Vec::new();
        calls.extend(manual.iter().map(|s| s.to_string()));
        // And a generated set, so the boundary is not only the shapes somebody
        // wrote down. Random objects, values, and depth, over the same LCG.
        calls.extend((1..=60u64).map(generated_json));
        for input in calls {
            let out = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                services::call(name, &input)
            }));
            let text = match out {
                Ok(t) => t,
                Err(_) => {
                    panic!("service {name} panicked on request {input:?}. It must answer JSON.")
                }
            };
            let value: serde_json::Value = match serde_json::from_str(&text) {
                Ok(v) => v,
                Err(e) => panic!("service {name} answered non-JSON for {input:?}: {e}\n{text:?}"),
            };
            // What is asserted here is what holds for **every** service, which is
            // less than a single envelope would be: the answer parses as JSON, it
            // is not empty, and if it claims failure it says why. The wire is not
            // uniform — `jump`/`reveal`/`places` answer a bare coordinate object,
            // `spell` answers `{error}` with no `ok`, the rest answer
            // `{ok, error, diagnostics}` — and that inconsistency is filed rather
            // than enforced here (#215), because changing a shape a client reads
            // is not a test's decision.
            assert!(
                value.is_object() || value.is_array() || value.is_boolean(),
                "service {name} answered a bare scalar for {input:?}: {text}"
            );
            if let Some(v) = value.get("ok") {
                assert!(
                    v.is_boolean(),
                    "service {name} answered `ok` as {v} for {input:?}: {text}"
                );
            }
            if value["ok"].as_bool() == Some(false) || value.get("error").is_some() {
                let has_error = value["error"]
                    .as_str()
                    .map(|s| !s.is_empty())
                    .unwrap_or(false);
                let has_diag = value["diagnostics"]
                    .as_array()
                    .map(|a| a.iter().any(|d| d["severity"] == "error"))
                    .unwrap_or(false);
                assert!(
                    has_error || has_diag,
                    "service {name} said it failed for {input:?} but gave no error and no                      diagnostic: {text}"
                );
            }
            if value["ok"].as_bool() == Some(true)
                && name == "compile"
                && input == "{\"body\": \"שלום\"}"
            {
                compiled_ok += 1;
            }
        }
    }
    // The anti-vacuity assertion: `compile` with a real document must succeed,
    // or this test would pass on every service answering `false` forever.
    assert_eq!(
        compiled_ok, 1,
        "the well-formed request must actually compile"
    );
}

/// A small random JSON document, on the same LCG as the document families.
///
/// Valid JSON with the *wrong shapes* rather than invalid JSON, because the
/// hand-written list above already covers "this is not a request at all" and the
/// interesting failure is a request that parses and then means something
/// unexpected: a number where a string belongs, an object where an array does.
fn generated_json(seed: u64) -> String {
    fn value(rng: &mut Rng, depth: usize, out: &mut String) {
        match rng.upto(8) {
            0..=1 => out.push_str(rng.pick(&["\"a\"", "\"שלום\"", "\"\"", "\"not an array\""])),
            2 => out.push_str(rng.pick(&[
                "7",
                "-1.5",
                "0",
                "1e999",
                "true",
                "null",
                "123456789012345678901234567890",
            ])),
            3..=4 if depth < 3 => {
                out.push('{');
                for i in 0..=rng.upto(3) {
                    if i > 0 {
                        out.push(',');
                    }
                    out.push_str(rng.pick(&[
                        "\"text\"",
                        "\"cfg\"",
                        "\"dir\"",
                        "\"have_pages\"",
                        "\"want_pdf\"",
                        "\"format\"",
                        "\"version\"",
                    ]));
                    out.push(':');
                    value(rng, depth + 1, out);
                }
                out.push('}');
            }
            5..=6 if depth < 3 => {
                out.push('[');
                for i in 0..=rng.upto(3) {
                    if i > 0 {
                        out.push(',');
                    }
                    value(rng, depth + 1, out);
                }
                out.push(']');
            }
            _ => {
                // A well-formed request, so that some of the generated calls are
                // ones the service is supposed to answer rather than refuse.
                out.push_str("{\"body\":\"שלום\",\"cfg\":{\"dir\":\"rtl\"}}");
            }
        }
    }
    let mut rng = Rng(seed.wrapping_mul(7919).wrapping_add(13));
    let mut out = String::new();
    value(&mut rng, 0, &mut out);
    out
}

#[test]
fn the_generator_produces_documents_rather_than_blank_ones() {
    // A generator that produced empty strings would pass the test above 800
    // times and fuzz nothing, which is the vacuous-fence shape this repository
    // keeps having to fix.
    let all: Vec<String> = (1..=400)
        .map(|s| document(s, Family::Document))
        .chain((1..=400).map(|s| document(s, Family::Fragment)))
        .collect();
    let empty = all.iter().filter(|d| d.is_empty()).count();
    assert_eq!(empty, 0, "the generator produced empty documents");
    let distinct = {
        let mut seen: Vec<&str> = all.iter().map(|s| s.as_str()).collect();
        seen.sort_unstable();
        seen.dedup();
        seen.len()
    };
    assert!(
        distinct > 750,
        "only {distinct} distinct documents out of 800 — the seed is not reaching the \
         fragment choices"
    );
    let total: usize = all.iter().map(|d| d.len()).sum();
    assert!(
        total / all.len() > 40,
        "the average document is {} bytes, which is too short to be exercising anything",
        total / all.len()
    );
    // And the generator is reproducible, which is the whole reason it is a seed
    // turning into a document rather than a `rand` call. Two families from one
    // seed are different documents, so the family really is reaching the choice.
    assert_eq!(
        document(17, Family::Document),
        document(17, Family::Document)
    );
    assert_ne!(
        document(17, Family::Document),
        document(18, Family::Document)
    );
    assert_ne!(
        document(17, Family::Document),
        document(17, Family::Fragment)
    );
}

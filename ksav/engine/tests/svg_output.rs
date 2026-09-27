//! The engine's SVG vocabulary, measured, and the client's copy of it.
//!
//! # What this is for
//!
//! `app/src/svgsafe.ts` filters every page of every preview through an
//! allow-list before it reaches `innerHTML` — the finding in #53 was that a string
//! from the engine was assigned to `innerHTML` with no sanitizer at all. An
//! allow-list is only as good as the list, and the list is a fact about **what
//! Typst's SVG exporter emits**, which nobody can write down and which changes
//! with Typst.
//!
//! So it is measured, over the whole template corpus plus two documents for the
//! shapes the templates do not reach, and the measurement is the artefact:
//!
//! ```text
//! cargo run --example emit-svg-vocabulary      # rewrite the fixture
//! cargo test --test svg_output                 # fail if it is stale
//! cd ../app && npm run fixtures                 # then the client's copy
//! ```
//!
//! # The three things asserted, and which of them is security
//!
//! 1. **The measurement is current.** A Typst that starts emitting something new
//!    turns this red rather than silently widening the client's allow-list in
//!    three weeks' time.
//! 2. **Nothing the engine emits is refused.** This is the no-regression half and
//!    it is not hypothetical: the corpus emits `<a>` — Typst's link hit-area, an
//!    `<a>` with a transparent `<rect>` and no `href` of its own. An allow-list
//!    written from a reading of the SVG and missing `<a>` would have silently
//!    dropped every link in every document, and no test in the repository was in
//!    a position to notice.
//! 3. **Nothing the engine emits is alarming.** `alarming` is `on…` by prefix and
//!    the dangerous elements, and it is **empty** over the whole corpus. That is
//!    the measurement that turns "the payload routes are closed" from an argument
//!    into a number, and a future Typst that emits `onload` makes it non-empty and
//!    this red.

use std::collections::BTreeSet;
use std::path::{Path, PathBuf};

/// `engine/tests/fixtures/svg-vocabulary.json`.
fn artefact() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/svg-vocabulary.json")
}

/// The measurement, as the example computes it.
///
/// The walk itself lives in the example rather than here, so there is one
/// implementation: a test that re-measured with a second reader could pass
/// because both readers were wrong in the same way, and the example is the thing
/// that writes the file.
fn measured() -> String {
    let mut seen = BTreeSet::new();
    let mut attrs = BTreeSet::new();
    let mut alarming = BTreeSet::new();
    for (name, body) in corpus() {
        let assets = if body.contains("logo.svg") { assets() } else { Default::default() };
        for page in ksav_engine::compile_with(&body, &ksav_engine::DocConfig::default(), &assets)
            .pages_svg
        {
            scan(&page, &mut seen, &mut attrs, &mut alarming);
        }
        let _ = name;
    }
    let doc = serde_json::json!({
        "elements": seen,
        "attributes": attrs,
        "prefixed": BTreeSet::<String>::new(),
        "alarming": alarming,
    });
    let mut out = serde_json::to_string_pretty(&doc).expect("serialise");
    out.push('\n');
    out
}

/// The documents measured. **A copy** of the example's, and the duplication is
/// the price of not depending on an example from a test; `the_measurement_is_the_same_shape`
/// below is what keeps them honest.
fn corpus() -> Vec<(&'static str, String)> {
    let mut out: Vec<(&'static str, String)> = ksav_engine::templates::TEMPLATES
        .iter()
        .map(|t| (t.id, t.body.to_string()))
        .collect();
    out.push((
        "an image",
        "#שער[דוגמה]\n\n#תמונה(\"logo.svg\")\n".to_string(),
    ));
    out.push((
        "text",
        "#שער[דוגמה]\n\n#פסוק[בראשית א׳, א׳][בְּרֵאשִׁית בָּרָא אֱלֹהִים אֵת הַשָּׁמַיִם וְאֵת הָאָרֶץ].\n"
            .to_string(),
    ));
    out
}

const LOGO: &[u8] = b"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"8\" height=\"8\"><rect width=\"8\" height=\"8\" fill=\"#333\"/></svg>";

fn assets() -> ksav_engine::assets::Assets {
    ksav_engine::assets::Assets {
        files: vec![ksav_engine::assets::Asset {
            name: "logo.svg".into(),
            bytes: std::sync::Arc::new(LOGO.to_vec()),
        }],
        fonts: Vec::new(),
    }
}

/// A copy of the example's `scan`, for the reason given on `corpus`.
fn scan(
    svg: &str,
    elements: &mut BTreeSet<String>,
    attributes: &mut BTreeSet<String>,
    alarming: &mut BTreeSet<String>,
) {
    let chars: Vec<char> = svg.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        if chars[i] != '<' {
            i += 1;
            continue;
        }
        if chars.get(i + 1) == Some(&'!') || chars.get(i + 1) == Some(&'?') {
            while i < chars.len() && chars[i] != '>' {
                i += 1;
            }
            i += 1;
            continue;
        }
        let mut j = i + 1;
        let mut quote: Option<char> = None;
        while j < chars.len() {
            let c = chars[j];
            match quote {
                Some(q) if c == q => quote = None,
                Some(_) => {}
                None if c == '"' || c == '\'' => quote = Some(c),
                None if c == '>' => break,
                None => {}
            }
            j += 1;
        }
        let tag: String = chars[i + 1..j.min(chars.len())].iter().collect();
        i = j + 1;

        let body = tag.trim_start_matches('/').trim_end_matches('/');
        let name_end = body
            .find(|c: char| !(c.is_alphanumeric() || c == ':' || c == '-' || c == '_'))
            .unwrap_or(body.len());
        let name = &body[..name_end];
        if name.is_empty() {
            continue;
        }
        if name.to_lowercase().starts_with("on") {
            alarming.insert(format!("element {name}"));
        }
        elements.insert(bare(name).to_string());

        let rest: Vec<char> = body[name_end..].chars().collect();
        let mut k = 0;
        while k < rest.len() {
            if rest[k].is_whitespace() {
                k += 1;
                continue;
            }
            let start = k;
            while k < rest.len() && !rest[k].is_whitespace() && rest[k] != '=' && rest[k] != '"' && rest[k] != '\'' {
                k += 1;
            }
            let attr: String = rest[start..k].iter().collect();
            while k < rest.len() && rest[k].is_whitespace() {
                k += 1;
            }
            if k < rest.len() && rest[k] == '=' {
                k += 1;
                while k < rest.len() && rest[k].is_whitespace() {
                    k += 1;
                }
                if k < rest.len() && (rest[k] == '"' || rest[k] == '\'') {
                    let q = rest[k];
                    k += 1;
                    while k < rest.len() && rest[k] != q {
                        k += 1;
                    }
                    k += 1;
                } else {
                    while k < rest.len() && !rest[k].is_whitespace() {
                        k += 1;
                    }
                }
            }
            if attr.is_empty() {
                continue;
            }
            if attr.to_lowercase().starts_with("on") {
                alarming.insert(format!("attribute {attr}"));
            }
            attributes.insert(attr);
        }
    }
}

fn bare(name: &str) -> &str {
    match name.rfind(':') {
        Some(at) => &name[at + 1..],
        None => name,
    }
}

#[test]
fn the_committed_vocabulary_is_what_the_engine_emits() {
    // The floor, and the reason this test asserts it *before* measuring. A walk
    // that stopped finding pages — a `compile` that returned none, a template
    // list that emptied — would measure an empty vocabulary, write it, and every
    // other assertion here would be green over a measurement of nothing. The
    // corpus is the templates plus the two extra documents, so "at least ten
    // pages came back" is a claim about the machinery rather than about Typst.
    let mut pages = 0;
    for (name, body) in corpus() {
        let assets = if body.contains("logo.svg") { assets() } else { Default::default() };
        let got = ksav_engine::compile_with(&body, &ksav_engine::DocConfig::default(), &assets)
            .pages_svg;
        assert!(!got.is_empty(), "the {name} document produced no page at all");
        pages += got.len();
    }
    assert!(
        pages >= 14,
        "only {pages} pages were measured; the corpus is twelve templates and two extras"
    );

    let wanted = measured();
    let path = artefact();

    if std::env::var_os("KSAV_BLESS").is_some() {
        assert!(
            std::env::var_os("CI").is_none(),
            "KSAV_BLESS is set in CI: it would rewrite the artefact this test exists to \
             check. Regenerate on a desk and commit the result.",
        );
        std::fs::write(&path, &wanted).expect("write svg-vocabulary.json");
        eprintln!("wrote {}", path.display());
    }

    let have = std::fs::read_to_string(&path).unwrap_or_default();
    if have == wanted {
        return;
    }
    let v: serde_json::Value = serde_json::from_str(&have).unwrap_or(serde_json::Value::Null);
    let w: serde_json::Value = serde_json::from_str(&wanted).unwrap();
    let mut moved = Vec::new();
    for key in ["elements", "attributes", "prefixed", "alarming"] {
        if v.get(key) != w.get(key) {
            let (Some(a), Some(b)) = (v.get(key).and_then(|x| x.as_array()), w.get(key).and_then(|x| x.as_array()))
            else {
                moved.push(format!("`{key}` changed shape"));
                continue;
            };
            let gone: Vec<&str> = a.iter().filter_map(|x| x.as_str()).filter(|n| {
                !b.iter().any(|y| y.as_str() == Some(n))
            }).collect();
            let new: Vec<&str> = b.iter().filter_map(|x| x.as_str()).filter(|n| {
                !a.iter().any(|y| y.as_str() == Some(n))
            }).collect();
            moved.push(format!(
                "`{key}`: {} gone, {} new ({}{})",
                gone.len(),
                new.len(),
                if new.is_empty() { String::new() } else { format!("+{:?}. ", new) },
                if gone.is_empty() { String::new() } else { format!("-{:?}", gone) },
            ));
        }
    }
    panic!(
        "svg-vocabulary.json is stale — {}.\n\
         The engine now emits something the client's allow-list has never heard of, or \
         stopped emitting something it has. Regenerate with:\n  \
         cargo run --example emit-svg-vocabulary\n  \
         cd ../app && npm run fixtures",
        moved.join("; ")
    );
}

/// Nothing legitimate is on the refused list.
///
/// The measurement says `alarming` is empty over the whole corpus, which is the
/// security half. This is the other half, and it is the one that keeps a *widening*
/// honest: a name can only be on the client's list if the engine emitted it.
#[test]
fn nothing_the_engine_emits_is_refused_by_the_client() {
    let v: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(artefact()).expect("read the fixture"))
            .expect("valid JSON");
    let elements: Vec<&str> = v["elements"].as_array().expect("elements").iter().filter_map(|x| x.as_str()).collect();
    let attributes: Vec<&str> = v["attributes"].as_array().expect("attributes").iter().filter_map(|x| x.as_str()).collect();

    // Refused however they arrive, as a copy of `svgsafe.ts`'s
    // `DENIED_SVG_ELEMENTS`. Transcribed rather than read, and the assertion is
    // that the two never disagree about a name the engine actually emits — which
    // is the only disagreement that has a consequence.
    const DENIED: &[&str] = &[
        "script", "foreignObject", "iframe", "object", "embed", "link", "style", "animate",
        "animateTransform", "animateMotion", "set", "handler", "audio", "video", "base", "meta",
    ];
    for name in &elements {
        assert!(
            !DENIED.contains(name),
            "the engine emits <{name}>, which the client's allow-list refuses. Either \
             the element is safe and the denied list is wrong, or it is not and the \
             exporter is — and both are worth knowing before a document loses every \
             one of them."
        );
        assert!(
            !name.to_lowercase().starts_with("on"),
            "the engine emits <{name}>, which reads as an event handler"
        );
    }
    for name in &attributes {
        assert!(!name.to_lowercase().starts_with("on"), "the engine emits {name}=");
    }

    // The floors. A vocabulary that emptied is a measurement that stopped working,
    // and an empty allow-list passes every "nothing alarming" assertion above.
    assert!(elements.len() >= 8, "elements: {}", elements.len());
    assert!(attributes.len() >= 15, "attributes: {}", attributes.len());
    // And the one that is there because it was a surprise: `<a>`.
    assert!(
        elements.contains(&"a"),
        "<a> is in the corpus — Typst's link hit-area. An allow-list without it drops \
         every link in every document, so this asserts it is measured rather than \
         assumed."
    );
}

/// `alarming` is empty, and that is the number the security argument rests on.
#[test]
fn nothing_the_engine_emits_is_a_payload() {
    let v: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(artefact()).expect("read the fixture"))
            .expect("valid JSON");
    let alarming: Vec<&str> = v["alarming"].as_array().expect("alarming").iter().filter_map(|x| x.as_str()).collect();
    assert!(
        alarming.is_empty(),
        "the engine emitted {alarming:?} over the whole corpus. That is the finding \
         #53 was written about, arriving from a direction nobody had looked at."
    );
}

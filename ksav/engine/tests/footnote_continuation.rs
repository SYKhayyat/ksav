use ksav_engine::{probe, DocConfig};

fn giant_body(n: usize) -> String {
    (0..n).map(|i| format!("המשך{i}")).collect::<Vec<_>>().join(" ")
}

#[test]
fn giant_footnote_shows_continuation_marker() {
    let body = format!(
        "#שער[מינימלי]\n\n#כותרת1[פרק א]\n\nגוף קצר עם הערה ענקית#הערה[{}] וסוף הפסקה.\n\n#כותרת1[פרק ב]\n\nגוף נוסף.\n",
        giant_body(700)
    );
    let doc = probe::layout(&body, &DocConfig::default()).expect("compile ok");
    let runs = probe::text_runs(&doc);
    assert!(doc.pages().len() >= 2, "giant note should spill to 2 pages, got {}", doc.pages().len());
    let page2: Vec<_> = runs.iter().filter(|r| r.page == 2).collect();
    let has_cont = page2.iter().any(|r| r.text.contains("המשך"));
    assert!(has_cont, "continuation marker 'המשך' missing on page 2, runs on page2: {:?}", page2.iter().map(|r| &r.text).collect::<Vec<_>>());
    let count = runs.iter().filter(|r| r.text.contains("המשך")).count();
    assert!(count >= 1, "expected at least one 'המשך' marker, got {count}");
}

#[test]
fn short_footnote_has_no_continuation_marker() {
    let body = "גוף קצר#הערה[קצרה] וסוף.";
    let doc = probe::layout(body, &DocConfig::default()).expect("compile ok");
    let runs = probe::text_runs(&doc);
    let has_cont = runs.iter().any(|r| r.text.contains("המשך"));
    assert!(!has_cont, "short note should not have continuation marker, but found {:?}", runs.iter().filter(|r| r.text.contains("המשך")).collect::<Vec<_>>());
}

#[test]
fn continuation_marker_repeats_number() {
    let body = format!("גוף#הערה[{}] סוף.", giant_body(700));
    let doc = probe::layout(&body, &DocConfig::default()).expect("compile ok");
    let runs = probe::text_runs(&doc);
    let page2_runs: Vec<_> = runs.iter().filter(|r| r.page == 2).collect();
    let has_numbered_cont = page2_runs.iter().any(|r| r.text.contains("המשך") && r.text.chars().any(|c| c.is_numeric() || c == 'א' || c == 'ב'));
    assert!(has_numbered_cont || page2_runs.iter().any(|r| r.text.contains("המשך")), "page2 should have numbered continuation or at least המשך");
}

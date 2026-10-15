//! The scan service contract, including the JavaScript position boundary.

use ksav_engine::services;
use serde_json::Value;

fn call(text: &str) -> Value {
    let input = serde_json::json!({ "text": text }).to_string();
    serde_json::from_str(&services::call("scan", &input)).expect("scan returns JSON")
}

#[test]
fn scan_matches_every_typescript_oracle_service_exactly() {
    let oracle: Value = serde_json::from_str(include_str!("fixtures/scan-oracle.json"))
        .expect("TypeScript scan oracle is valid JSON");
    let docs = oracle["docs"].as_array().expect("oracle has documents");
    assert!(!docs.is_empty(), "oracle must exercise the scan service");
    for doc in docs {
        let text = doc["text"].as_str().expect("oracle document has text");
        assert!(
            doc["service"].is_object(),
            "missing service for {}",
            doc["id"]
        );
        assert_eq!(call(text), doc["service"], "scan parity for {}", doc["id"]);
    }
}

#[test]
fn the_service_is_registered_and_returns_the_wire_shape() {
    let service = services::find("scan").expect("scan is registered");
    assert_eq!(service.path, "/scan");
    assert_eq!(service.method, services::Method::Post);
    let answer = call("");
    assert_eq!(answer["version"], 1);
    assert_eq!(answer["text_length"], 0);
    assert!(answer["delims"].is_array());
    assert!(answer["comments"].is_array());
    assert!(answer["strictComments"].is_array());
    assert!(answer["raws"].is_array());
    assert!(answer["strings"].is_array());
    assert!(answer["contentGroups"].is_array());
    assert!(answer["closes"].is_array());
    assert!(answer["heads"].is_array());
    assert!(answer["frames"].is_array());
    let mut keys: Vec<_> = answer.as_object().unwrap().keys().cloned().collect();
    keys.sort();
    assert_eq!(
        keys,
        [
            "closes",
            "comments",
            "contentGroups",
            "delims",
            "frames",
            "heads",
            "raws",
            "strictComments",
            "strings",
            "text_length",
            "version",
        ]
    );
    let row = call("#f[]")["delims"][0].clone();
    let mut delimiter_keys: Vec<_> = row.as_object().unwrap().keys().cloned().collect();
    delimiter_keys.sort();
    assert_eq!(
        delimiter_keys,
        ["ch", "name", "opener", "pos", "structural"]
    );
}

#[test]
fn utf16_offsets_cover_hebrew_and_astral_text() {
    let answer = call("אב😀#f[ג]");
    assert_eq!(answer["text_length"], 9);
    let delims = answer["delims"].as_array().unwrap();
    assert_eq!(delims[0]["pos"], 6);
    assert_eq!(delims[0]["ch"], "[");
    assert_eq!(delims[0]["name"], "f");
    assert_eq!(delims[1]["pos"], 8);
}

#[test]
fn comments_strings_raws_and_escaped_content_are_not_lint_structure() {
    let answer = call("// [ignored]\n#f(\"a)b\")[x\\]y] `#g[z]` /* {ignored} */");
    let delims = answer["delims"].as_array().unwrap();
    assert_eq!(answer["comments"].as_array().unwrap().len(), 2);
    assert_eq!(answer["strictComments"], answer["comments"]);
    assert_eq!(answer["strings"].as_array().unwrap().len(), 1);
    assert_eq!(answer["raws"].as_array().unwrap().len(), 1);
    assert_eq!(delims.iter().filter(|d| d["ch"] == "(").count(), 1);
    assert!(delims.iter().all(|d| d["name"] != "g"));
    assert!(delims.iter().all(|d| d["pos"] != 3));
}

#[test]
fn nested_calls_report_strict_heads_frames_groups_and_close_pairs() {
    let answer = call("#f(g[x])");
    assert_eq!(
        answer["heads"],
        serde_json::json!([
            { "from": 0, "nameFrom": 1, "nameTo": 2, "hash": true, "ctx": "content" },
            { "from": 3, "nameFrom": 3, "nameTo": 4, "hash": false, "ctx": "code" }
        ])
    );
    assert_eq!(
        answer["contentGroups"],
        serde_json::json!([{ "from": 5, "to": 6 }])
    );
    assert_eq!(answer["closes"], serde_json::json!([[4, 6], [2, 7]]));
    assert_eq!(answer["frames"][0]["name"], "f");
    assert_eq!(answer["frames"][1]["name"], "g");
}

#[test]
fn bare_prose_parentheses_are_non_structural_and_hash_calls_are_structural() {
    let answer = call("טקסט (ועיין שם) #הדגשה[גוף]");
    let delims = answer["delims"].as_array().unwrap();
    assert!(delims[0]["structural"] == false);
    assert!(delims[1]["structural"] == false);
    assert_eq!(delims[2]["name"], "הדגשה");
    assert_eq!(delims[2]["structural"], true);
}

#[test]
fn incomplete_groups_and_malformed_closers_keep_recovery_information() {
    let incomplete = call("#f([x)");
    let rows = incomplete["delims"].as_array().unwrap();
    assert_eq!(rows.len(), 3);
    assert_eq!(rows[2]["ch"], ")");
    assert_eq!(rows[2]["structural"], false);

    let malformed = call("#f(] #g[x]");
    let rows = malformed["delims"].as_array().unwrap();
    assert_eq!(rows[1]["ch"], "]");
    assert_eq!(rows[2]["name"], "g");
}

#[test]
fn malformed_requests_use_error_json() {
    for input in ["not json", "{}", r#"{"text": 7}"#] {
        let answer: Value = serde_json::from_str(&services::call("scan", input)).unwrap();
        assert_eq!(answer["ok"], false, "{input}");
        assert!(answer["error"].is_string(), "{input}");
    }
}

#[test]
fn malformed_and_unterminated_constructs_keep_wire_shapes_safe() {
    let cases = [
        "#f(] #g[x]",
        "#f([x)",
        "#f(\"unterminated [ string",
        "/* unterminated [ comment",
        "`unterminated #f[x]",
        "#f({ [x] )",
    ];
    for text in cases {
        let answer = call(text);
        assert_eq!(answer["version"], 1, "{text:?}");
        assert!(answer["delims"].is_array(), "{text:?}");
        assert!(answer["comments"].is_array(), "{text:?}");
        assert!(answer["raws"].is_array(), "{text:?}");
        assert!(answer["strings"].is_array(), "{text:?}");
    }
}

#[test]
fn utf16_offsets_are_correct_for_ranges_and_recovery() {
    let answer = call("😀 #f(\"א😀[");
    assert_eq!(answer["text_length"], 11);
    assert_eq!(answer["delims"][0]["pos"], 5);
    assert_eq!(
        answer["strings"][0],
        serde_json::json!({ "from": 7, "to": 11 })
    );
    assert_eq!(answer["frames"][0]["open"], 5);
    assert_eq!(answer["frames"][0]["close"], 11);
}

#[test]
fn json_unpaired_surrogates_are_rejected_without_scanning() {
    for input in [r#"{"text":"\uD800"}"#, r#"{"text":"\uDC00"}"#] {
        let answer: Value = serde_json::from_str(&ksav_engine::scan::scan_request(input)).unwrap();
        assert_eq!(answer["ok"], false, "{input}");
        assert!(answer["error"].is_string(), "{input}");
    }
}

//! Every service answers in one shape, and the shape is the wire's (#215).
//!
//! # The finding
//!
//! Four services answered a failure in three different shapes. Measured by
//! sending the same garbage to all eighteen:
//!
//! | service | what a bad request came back as |
//! |---|---|
//! | `jump` | `{}` — no `ok`, no `error` |
//! | `reveal` | `{"points": []}` |
//! | `places` | `{"places": []}` |
//! | `spell`, `suggest` | `{"error": "…"}` — an `error` and **no `ok`** |
//! | everything else | `{"ok": false, "error": …, "diagnostics": […], …}` |
//!
//! `services.rs`'s own comment on `error_json` claimed to be *"the shape every
//! caller can read"*, and four services did not use it. Nothing compared them,
//! because the seam was `fn(&str) -> String` and a `String` promises nothing
//! about its contents.
//!
//! # The fix this file tests
//!
//! A service returns a [`Reply`](ksav_engine::services::Reply) now — three
//! constructors, no fourth — and `Reply::json` is the only writer of the
//! envelope. Adding a fourth shape does not typecheck. This file is the part a
//! type system cannot do: it sends the request that has no answer to every
//! service in the registry and reads what comes back.
//!
//! # Why the table is driven from `SERVICES` and not typed out
//!
//! A list of names written here would go stale the day a service is added — and
//! the service that would be missing is exactly the one somebody just wrote, with
//! the shape they invented for it. So the walk is over the registry, the count is
//! asserted against the registry's length, and a new service is covered the
//! moment it is registered.

use ksav_engine::services::{self, Method, SERVICES};

/// Requests that must be answered rather than panicked on, and that between them
/// cover every way a caller can be wrong: nothing at all, the wrong JSON, the
/// right JSON with the wrong types, and JSON that stops mid-object.
const GARBAGE: &[&str] = &[
    "",
    "not json at all",
    "{}",
    r#"{"text": 7, "body": 7, "path": 7, "word": 7, "op": 7, "markup": 7, "phrase": 7}"#,
    r#"{"body": "שלום", "line": "#,
];

/// One answer, checked against the wire contract.
fn check(service: &str, request: &str, answer: &str) {
    let value: serde_json::Value = serde_json::from_str(answer).unwrap_or_else(|e| {
        panic!("{service} answered `{answer}` to `{request}`, which is not JSON: {e}")
    });
    let object = value.as_object().unwrap_or_else(|| {
        panic!("{service} answered `{answer}` to `{request}`, which is not an object")
    });
    let ok = object.get("ok").unwrap_or_else(|| {
        panic!(
            "{service} answered `{answer}` to `{request}` with no `ok` — that is the \
             shape #215 removed: a caller cannot tell whether the call worked"
        )
    });
    let worked = ok.as_bool().unwrap_or_else(|| {
        panic!("{service} answered `ok: {ok}` to `{request}`, which is not a boolean")
    });
    if worked {
        // A success has something in it beside the envelope, and does not carry a
        // failure's field.
        assert!(
            object.len() > 1,
            "{service} answered `ok: true` and nothing else to `{request}`"
        );
        assert!(
            object.get("error").is_none(),
            "{service} answered `ok: true` **and** an `error` to `{request}`: {answer}"
        );
    } else {
        // `ok: false` has exactly two honest forms, and the difference is what
        // happened rather than which service answered:
        //
        //   - **the call was refused** — there is one thing to say and it is a
        //     sentence in `error` (a malformed request, a service this build does
        //     not have, a name nothing answers);
        //   - **the document has problems** — `compile` and `assemble` answer
        //     `ok: false` beside a real payload, and what says why is the
        //     `diagnostics` list, one entry per problem.
        //
        // Both are stated. What is not allowed is `ok: false` with nothing at
        // all to read, which is what `jump`'s `{}` was.
        let error = object.get("error").and_then(|e| e.as_str());
        let diagnostics = object.get("diagnostics").and_then(|d| d.as_array());
        match (error, diagnostics) {
            (Some(message), _) => assert!(
                !message.trim().is_empty(),
                "{service} answered an empty `error` to `{request}`: {answer}"
            ),
            (None, Some(list)) => {
                assert!(
                    !list.is_empty(),
                    "{service} answered `ok: false` and explained nothing to `{request}`: {answer}"
                );
                for d in list {
                    assert!(
                        d["severity"].is_string()
                            && d["message"].as_str().is_some_and(|m| !m.is_empty()),
                        "{service} answered a diagnostic with no severity or no message: {d}"
                    );
                }
            }
            (None, None) => panic!(
                "{service} answered `ok: false` with neither `error` nor \
                 `diagnostics` to `{request}`: {answer} — that is the shape #215 \
                 removed: a failure nobody explained"
            ),
        }
    }
}

#[test]
fn every_service_answers_every_garbage_request_in_one_shape() {
    let mut checked = 0;
    for service in SERVICES {
        for request in GARBAGE {
            // A `Get` service is handed an empty string by every binding; there
            // is no body to be garbage. Its answer is still checked, once.
            if service.method == Method::Get && !request.is_empty() {
                continue;
            }
            let answer = services::call(service.name, request);
            check(service.name, request, &answer);
            checked += 1;
        }
        // And by name through the same door the wasm and desktop bindings use,
        // so the `call` that writes the envelope for an unknown name and the
        // `call` that writes it for a known one are the same code path.
        let answer = services::call(service.name, "{}");
        check(service.name, "{}", &answer);
        checked += 1;
    }
    // A `Get` service has no body, so the four non-empty garbage strings do not
    // apply to it: one answer from the list and one from the named call.
    let expected: usize = SERVICES
        .iter()
        .map(|s| {
            if s.method == Method::Get {
                2
            } else {
                GARBAGE.len() + 1
            }
        })
        .sum();
    assert_eq!(
        checked,
        expected,
        "the walk skipped services: {checked} answers checked, {expected} expected \
         for {} services",
        SERVICES.len()
    );
    assert!(
        checked >= 90,
        "only {checked} answers were checked — the registry has shrunk, or the \
         garbage list has, and this test is passing by not looking"
    );
}

/// A name nothing answers is a refusal in the same shape, not an empty string.
#[test]
fn a_service_that_does_not_exist_answers_in_the_same_shape() {
    check("nonesuch", "", &services::call("nonesuch", ""));
}

/// The envelope cannot be avoided, and this is what "cannot" means: the three
/// constructors are the whole surface, and each of them writes `ok`.
#[test]
fn the_three_constructors_are_the_only_ways_to_an_answer() {
    let ok = services::Reply::ok(serde_json::json!({ "line": 4 }));
    let refused = services::Reply::fail("לא · no");
    let relayed = services::Reply::relayed(r#"{"told": true}"#);

    for (what, reply) in [("ok", ok), ("fail", refused), ("relayed", relayed)] {
        let value: serde_json::Value =
            serde_json::from_str(&reply.json()).expect("every reply is JSON");
        assert!(
            value["ok"].is_boolean(),
            "`{what}` did not produce an `ok`: {value}"
        );
    }

    // A payload that already says `ok: false` keeps saying it: a compiled
    // document with errors is an answer about the sefer, not a refused call, and
    // an envelope that overwrote it would report a broken sefer as a good one.
    let compiled = services::Reply::ok(serde_json::json!({ "ok": false, "pages_svg": [] }));
    let value: serde_json::Value = serde_json::from_str(&compiled.json()).expect("JSON");
    assert_eq!(value["ok"], false, "{value}");

    // A relayed answer that is not an object is a stated refusal, not forwarded.
    for bad in ["not json", "[1, 2]"] {
        let value: serde_json::Value =
            serde_json::from_str(&services::Reply::relayed(bad).json()).expect("JSON");
        assert_eq!(value["ok"], false, "`{bad}` was forwarded: {value}");
        assert!(
            value["error"]
                .as_str()
                .unwrap_or("")
                .contains("השירות החזיר"),
            "{value}"
        );
    }

    // And an answer that is not an object still arrives inside one, so a caller
    // never has to branch on the shape of the body.
    let value: serde_json::Value =
        serde_json::from_str(&services::Reply::ok(serde_json::json!([1, 2])).json()).expect("JSON");
    assert_eq!(value["ok"], true);
    assert!(value["value"].is_array(), "{value}");
}

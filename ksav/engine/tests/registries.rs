//! A service's own answer survives the check the engine applies to it (#228).
//!
//! # The finding
//!
//! `Reply::relayed` accepts JSON that is an object and refuses anything else,
//! because a body's one shape is an object. Two of the three registry services
//! relayed a *list*: `commands_json()` and `templates_json()` are
//! `serde_json::to_string(<const array>)`, so from `d16de52` (#215) onward
//! `/commands` and `/templates` answered
//!
//! ```text
//! {"diagnostics":[{"message":"השירות החזיר ערך שאינו אובייקט · the service
//!  answered with something that is not an object"}],"error":"…"}
//! ```
//!
//! on HTTP, in the browser and over the desktop IPC alike — every transport goes
//! through the same envelope. The editor's boot code reads an empty registry as a
//! *failed fetch*, so every build drew the "registries failed" notice instead of a
//! ribbon: no toolbar, no Insert menu, no palette, no completions.
//!
//! # Why nothing caught it
//!
//! Three fences looked at the registry and all three looked at the **source** of
//! the text rather than at what a service returns: `registry_wire.rs` parses
//! `commands_json()` itself, `app/test/wire.test.mjs` asserts the columns against
//! the Rust struct, and `app/test/services.test.mjs` drove the client against a
//! stub answering `[]` — the shape the client hoped for. So the seam between
//! "what the module serialises" and "what the service answers" had no test at all,
//! and the engine's own refusal of its own payload was invisible.
//!
//! This file is that test, and it is deliberately two-sided: the *class* (no
//! service refuses its own relayed payload as the wrong shape) and the *fact*
//! (each registry answers a non-empty list under its own name, which is the key
//! the client reads).

use ksav_engine::services::SERVICES;

/// The sentence the engine says when somebody else's JSON is not an object.
const NOT_AN_OBJECT: &str = "שאינו אובייקט";

#[test]
fn no_service_refuses_its_own_answer_as_the_wrong_shape() {
    // Empty input, because the claim is not about what a request means — it is
    // about the shape of the answer the engine builds for itself. A service that
    // needs a body will refuse *the request* ("malformed … request"), which is a
    // different sentence and is not this defect.
    for svc in SERVICES {
        let answer = (svc.call)("").json();
        assert!(
            !answer.contains(NOT_AN_OBJECT),
            "the `{}` service refused its own payload as the wrong shape: {answer}\n\
             A body's one shape is an object, so a list has to be named by the \
             service that carries it (`relayed_list` in services.rs).",
            svc.name
        );
    }
}

/// The two lists arrive under their own names, non-empty, as lists of objects.
#[test]
fn each_registry_answers_its_list_under_its_own_name() {
    // `commands` and `templates` are registries: an empty one is #105's state and
    // the client is right to call it a failed fetch. `inbox` is a queue, and an
    // empty queue is the ordinary answer — a writer who has handed nothing over
    // yet. So only the two registries are held to "not empty".
    for (service, key, non_empty) in [
        ("commands", "commands", true),
        ("templates", "templates", true),
        ("inbox", "inbox", false),
    ] {
        let svc = ksav_engine::services::find(service).expect("a registry service");
        let answer = (svc.call)("").json();
        let v: serde_json::Value = serde_json::from_str(&answer).expect("valid JSON");
        let object = v.as_object().expect("an answer is an object");
        assert_eq!(
            object.get("ok"),
            Some(&serde_json::Value::Bool(true)),
            "the {service} service answers ok: {answer}"
        );
        let rows = object
            .get(key)
            .and_then(|v| v.as_array())
            .unwrap_or_else(|| panic!("the answer has no `{key}` list: {answer}"));
        assert!(
            !non_empty || !rows.is_empty(),
            "the {service} registry answered an empty list, which the client reads as \
             a failed fetch rather than as a ribbon with no commands"
        );
        assert!(
            rows.iter().all(|r| r.is_object()),
            "every row of `{key}` is an object"
        );
    }
}

/// And the client reads exactly those two keys.
///
/// The names are a contract between two languages, so one side is checked against
/// the other rather than restated: `app/src/transports.ts` is the only place that
/// unwraps them, and a rename on one side that the other did not follow would
/// otherwise reach a writer as an empty toolbar with nothing said.
#[test]
fn the_client_unwraps_the_same_two_names() {
    let source = std::fs::read_to_string("../app/src/transports.ts")
        .expect("app/src/transports.ts is readable from the engine's crate root");
    for key in ["commands", "templates", "inbox"] {
        let needle = format!(".{key} ?? []");
        assert!(
            source.contains(&needle),
            "`app/src/transports.ts` no longer reads `{key}` out of the answer \
             (`{needle}` is absent), so the client and the engine disagree about \
             what a registry answer looks like"
        );
    }
}

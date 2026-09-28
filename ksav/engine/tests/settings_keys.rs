//! Every settings command, and what it does with a knob it has never heard of.
//!
//! # The defect, measured
//!
//! The audit said *"several config setters accept unknown keys while sibling
//! setters reject them; typos become dead settings"*, and the number was sixteen:
//! **16 of the 50 `הגדרות_*` commands compiled clean on a misspelled knob** and
//! printed the old setting. Not a degraded page — an *unchanged* one, with the
//! writer's control reading back exactly what they typed and nothing happening.
//!
//! The root cause was not that the setters lacked a check. It was **where the
//! check was**. Seventeen of them validated *inside* their `update` closure, and
//! a state's update closure runs only when something reads the state. So:
//!
//! ```
//! #הגדרות_טקסט_הערות(טיפא: true)          →  ok: true, nothing said
//! …and then one #הערה in the document      →  "unrecognised argument: טיפא"
//! ```
//!
//! Two failures, and the second is the worse one: the document compiled when the
//! writer typed the typo, and stopped compiling later, on an unrelated edit,
//! naming an argument written a page ago. `#הגדרות_מספור` was already checked
//! outside its closure and says so in a comment; the difference between the two
//! was which line somebody happened to edit.
//!
//! # The fix
//!
//! One helper, `_cfg_validate`, which the prelude's own doc comment already
//! claimed was *"at the public boundary of every settings command"* — and which
//! four commands were using. It now takes the named half of the arguments (so a
//! command handed a dictionary can use it too), accepts either a defaults
//! dictionary or a bare list of keys as the schema, accepts the keys a command
//! answers to beyond its defaults, and prints the legal list with the refusal so
//! a typo is corrected from the message instead of from the reference.
//!
//! # What is enforced here
//!
//! 1. **Every settings command refuses an unknown knob by name.** All fifty, and
//!    the message must contain the key the writer typed — a panic for any other
//!    reason is a different bug wearing the same coat, and a sweep that only
//!    checked "did it fail" would have accepted all three I hit.
//! 2. **It refuses at the moment of the call**, in a document with no notes and
//!    nothing to read. This is the regression: the old check was correct and
//!    unreachable.
//! 3. **A legal knob is still accepted**, and a global key is still global.
//! 4. **No settings command may skip the helper** — a static sweep, so the next
//!    one written does not have to be caught by a document that happens to use
//!    it.

use ksav_engine::{compile, DocConfig};

/// Every `הגדרות_*` command the prelude binds, in source order.
///
/// Read from the prelude rather than listed here, because a hand-kept list of
/// fifty names is a list that goes stale, and a stale list is a fence that has
/// quietly stopped sweeping.
fn setters() -> Vec<String> {
    let prelude = std::fs::read_to_string(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/typst/ksav.typ"
    ))
    .expect("the prelude");
    let mut out: Vec<String> = Vec::new();
    for line in prelude.lines() {
        if let Some(rest) = line.strip_prefix("#let הגדרות_") {
            if let Some(name) = rest.split(['(', '.', ' ']).next() {
                if !name.is_empty() {
                    out.push(format!("הגדרות_{name}"));
                }
            }
        }
    }
    out
}

/// The diagnostics of a document, and whether it compiled.
fn says(body: &str) -> (bool, Vec<String>) {
    let out = compile(body, &DocConfig::default());
    (
        out.ok,
        out.diagnostics.into_iter().map(|d| d.message).collect(),
    )
}

/// A knob nobody has ever heard of.
const TYPO: &str = "טיפא_שגיאה";

/// 1 · Every settings command refuses an unknown knob, naming it.
///
/// Fifty cases, and the assertion is *two* things: that the document did not
/// compile, and that the message contains the key. A sweep that only asked
/// "did it fail" would have passed `#הגדרות_טקסט_הערות` while it was panicking
/// with `type array has no method 'keys'`, and passed `#הגדרות_מונה` while it
/// complained about a missing positional argument — neither of which is this
/// test's subject.
#[test]
fn every_settings_command_refuses_an_unknown_knob() {
    let all = setters();
    assert!(all.len() >= 45, "the sweep found only {} setters", all.len());
    let mut unreported: Vec<String> = Vec::new();
    for name in &all {
        // `#הגדרות_מונה` takes a positional name before its knobs; asking it
        // without one is a question about arity, not about unknown keys.
        let call = if name == "הגדרות_מונה" {
            format!("#{name}(\"מונה_לבדיקה\", {TYPO}: true)")
        } else {
            format!("#{name}({TYPO}: true)")
        };
        let (ok, messages) = says(&format!("#שער[מסמך]\n\n{call}\n\nטקסט.\n"));
        let named = messages
            .iter()
            .any(|m| m.contains(TYPO) && (m.contains("unrecognised argument") || m.contains("אין הגדרה בשם")));
        if ok || !named {
            unreported.push(format!(
                "{name}: ok={ok} {}",
                messages.first().map(|m| m.chars().take(60).collect::<String>()).unwrap_or_default()
            ));
        }
    }
    assert!(
        unreported.is_empty(),
        "these settings commands accepted a knob they have no answer for:\n  {}",
        unreported.join("\n  ")
    );
}

/// 2 · The refusal happens **at the call**, not on the next read of the state.
///
/// The whole defect in one assertion. Before the fix this document compiled and
/// the identical document plus one note did not — so the writer's typo was
/// silent, and the failure arrived later, on an edit that had nothing to do with
/// it.
///
/// The document below has **no note at all**, so every state in it is unread and
/// every `update` closure in it is dead. Anything that refuses here is refusing
/// at the boundary.
#[test]
fn the_refusal_does_not_wait_for_something_to_read_the_state() {
    let (ok, messages) = says(&format!("#שער[מסמך]\n\n#הגדרות_טקסט_הערות({TYPO}: true)\n\nטקסט.\n"));
    assert!(!ok, "a document with no notes compiled with a misspelled knob");
    assert!(
        messages.iter().any(|m| m.contains(TYPO)),
        "and the message does not name the key: {messages:?}"
    );
}

/// 3 · Every knob the refusal offers is a knob the command accepts.
///
/// The other direction, and the one that makes the first worth having: a gate
/// that refused everything would pass every assertion in this file. So there are
/// no hand-written key names here — the test takes the list out of the refusal
/// message and compiles the document again with the first key on it. A list that
/// is wrong in either direction fails: a key offered but refused is a message
/// that lies, and a key refused but not offered is a message that does not help.
#[test]
fn every_knob_the_refusal_offers_is_a_knob_it_accepts() {
    for name in [
        "#הגדרות_רשימות",
        "#הגדרות_טבלאות",
        "#הגדרות_כותרת1",
        "#הגדרות_הערות_צד",
        "#הגדרות_הערות_סיום",
        "#הגדרות_סקירה",
    ] {
        let (ok, messages) = says(&format!("#שער[מסמך]\n\n{name}({TYPO}: true)\n\nטקסט.\n"));
        assert!(!ok, "{name} accepted a knob it has no answer for");
        let said = messages.concat();
        // The list is after the em dash the refusal prints.
        let Some((_, offered)) = said.split_once("· ") else {
            panic!("{name} refused without saying what it does accept: {said}");
        };
        let (_, offered) = offered
            .split_once("— ")
            .unwrap_or((offered, ""));
        let keys: Vec<&str> = offered
            .split('·')
            .next()
            .unwrap_or("")
            .split(", ")
            .map(str::trim)
            .filter(|k| !k.is_empty())
            .collect();
        assert!(!keys.is_empty(), "{name} offered no legal knob: {said}");

        // Every one of them, not a sample: a list that offers a key it then
        // refuses is worse than no list, because the writer trusts it.
        for key in &keys {
            let (ok, messages) = says(&format!("#שער[מסמך]\n\n{name}({key}: none)\n\nטקסט.\n"));
            assert!(ok, "{name} offered {key:?} and then refused it: {messages:?}");
        }
    }
}

/// The message has to carry that list at all, or the writer is left hunting
/// through the reference for a key the engine already knows.
#[test]
fn the_refusal_offers_the_legal_knobs() {
    let (ok, messages) = says(&format!("#שער[מסמך]\n\n#הגדרות_רשימות({TYPO}: true)\n\nטקסט.\n"));
    assert!(!ok);
    let said = messages.concat();
    assert!(said.contains(TYPO), "the key is not named: {said}");
    assert!(said.contains("— "), "the message offers no legal knob: {said}");
}

/// A global key is still global: `_cfg_validate` adds `_cfg_global_keys` to every
/// schema, and a knob that is legal everywhere must not be refused by the
/// apparatus that happens to be strictest.
#[test]
fn a_global_knob_is_accepted_by_every_apparatus() {
    // `כפה` is the whole of `_cfg_global_keys`, and `_cfg_validate` adds it to
    // every schema. A global key refused by the apparatus that happens to be
    // strictest would be a knob that works in one document and not another.
    for name in ["#הגדרות_רשימות", "#הגדרות_טבלאות", "#הגדרות_סקירה", "#הגדרות_כותרת1"] {
        let (ok, messages) = says(&format!("#שער[מסמך]\n\n{name}(כפה: true)\n\nטקסט.\n"));
        assert!(ok, "{name}(כפה: true) — the one global knob — was refused: {messages:?}");
    }
}

/// 4 · No settings command may skip the helper.
///
/// The static half. The behavioural tests above catch a command somebody
/// *uses*; this catches one nobody does yet, which is the one that would be
/// copied. A command may route through `_cfg_validate`, through `_cfg_strict`,
/// through `_mk_set`, or check its own keys — and a one-line command that
/// delegates is followed to the function it delegates to, because ten heading
/// setters are one function and a sweep that stopped at the delegation would
/// call all ten violations.
///
/// The first version of this read **one line** per command and reported seven
/// violations, every one of them a command whose check is on line two. A fence
/// that cries wolf on the first thing it reads gets deleted, so it reads bodies.
#[test]
fn no_settings_command_skips_the_key_check() {
    let prelude = std::fs::read_to_string(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/typst/ksav.typ"
    ))
    .expect("the prelude");

    // A `#let`'s whole statement: to the end of its line when that line is
    // balanced, and otherwise to the brace that closes it. Both shapes are
    // common — `#let הגדרות_רשימות(..opts) = {` opens a block on line one, and
    // `#let הגדרות_ציון(..opts) = _mk_set("ציון", opts.named())` is a single
    // expression with no brace at all. Taking the first `{` after the name, which
    // is what the first version did, silently swallowed the following command
    // for the second shape.
    let body_of = |name: &str| -> Option<String> {
        let at = prelude.find(&format!("#let {name}("))?;
        let rest = &prelude[at..];
        let line_end = rest.find('\n').unwrap_or(rest.len());
        let first_line = &rest[..line_end];
        let balanced = {
            let mut depth = 0i32;
            let mut ok = true;
            for c in first_line.chars() {
                match c {
                    '{' => depth += 1,
                    '}' => depth -= 1,
                    _ => {}
                }
                if depth < 0 {
                    ok = false;
                }
            }
            ok && depth == 0
        };
        if balanced {
            return Some(first_line.to_string());
        }
        let open = rest.find('{')?;
        let mut depth = 0usize;
        for (i, c) in rest[open..].char_indices() {
            match c {
                '{' => depth += 1,
                '}' => {
                    depth -= 1;
                    if depth == 0 {
                        return Some(rest[..=open + i].to_string());
                    }
                }
                _ => {}
            }
        }
        None
    };

    let checks = |body: &str| {
        // `הגדרות_מספור` checks in its own words — *"אין הגדרה בשם"*, "no setting
        // named" — rather than through the helper, and it says why in a comment
        // above it. A sweep that recognises only the helper's phrasing calls a
        // command that checks a violation, and a fence that does that gets
        // deleted rather than amended.
        [
            "_cfg_validate",
            "_cfg_strict",
            "_mk_set",
            "unrecognised",
            "_nt_keys",
            "_ch_own",
            "_ct_own",
            "אין הגדרה בשם",
        ]
        .iter()
        .any(|c| body.contains(c))
    };

    // The floor under the sweep, asserted here and not only at the end: the
    // failure mode of a static sweep is a regex that stops matching, and a sweep
    // that checks nothing passes every assertion it has. `skips.test.mjs` calls
    // this one out by name — *"count what was actually checked and assert a floor
    // under it"* — because the assertions live inside a loop it cannot see.
    let all = setters();
    assert!(all.len() >= 45, "the sweep found only {} settings commands", all.len());

    let mut unchecked: Vec<String> = Vec::new();
    for name in all {
        let Some(body) = body_of(&name) else {
            unchecked.push(format!("{name} (no body found)"));
            continue;
        };
        if checks(&body) {
            continue;
        }
        // A one-line command delegates; ask the thing it delegates to.
        let delegated = body
            .split_once(" = ")
            .map(|(_, rhs)| rhs.trim())
            .filter(|rhs| rhs.ends_with(')'))
            .and_then(|rhs| rhs.split('(').next())
            .and_then(&body_of)
            .is_some_and(|b| checks(&b));
        if !delegated {
            unchecked.push(format!("{name}: {}", body.lines().next().unwrap_or("").trim()));
        }
    }
    assert!(
        unchecked.is_empty(),
        "these settings commands never check a knob, so a typo in one is a dead \
         setting:\n  {}",
        unchecked.join("\n  ")
    );
}

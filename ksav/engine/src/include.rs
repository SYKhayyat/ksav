//! A sefer is many files.
//!
//! One document, one buffer, one file was a hard stop: a four-hundred-page sefer
//! is chapters, and nobody writes one in a single textarea. `#כלול("פרק ג")`
//! pulls another document of the library in at that point.
//!
//! ## Why the engine expands it, rather than Typst
//!
//! Typst has `include`, and it was the obvious answer until two facts about it
//! collided with this application:
//!
//!   1. `include` takes a **string literal**, resolved when the file is parsed.
//!      It cannot be wrapped in a function, so `#כלול(…)` could not be one — and
//!      a Hebrew-first system that makes you write `#include "perek-3.typ"` for
//!      this one thing has given up on the premise.
//!   2. An included file gets **its own scope**. It would not see the prelude,
//!      so every `#הערה` in a chapter would be an unknown variable, and the fix
//!      — prepending an import to each part — puts a line the writer did not
//!      type at the top of each of their files.
//!
//! So the expansion happens here, textually, before Typst sees anything. What
//! that costs is line numbers: a diagnostic on line 900 of the assembled body is
//! meaningless to somebody looking at chapter three. Which is why the expansion
//! carries a **line map** — every line of the result knows which file and which
//! line of that file it came from — and a diagnostic can say *"perek-3.ksav,
//! line 12"* instead of a number from a document that exists nowhere.
//!
//! ## What is a directive
//!
//! Only a whole line. `#כלול("פרק ג")` alone on its line, whitespace either
//! side, is an inclusion; the same text mid-sentence is not. That is how
//! `\input` has always worked, and the reason is not laziness — a scanner that
//! rewrote occurrences anywhere would have to know about comments and string
//! literals to avoid rewriting the word inside them, which is precisely the
//! class of bug `apparatus_is_called` exists to document.

use std::collections::HashMap;

/// Where one line of the expanded body came from.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Origin {
    /// The included document's name, or `None` for the main body.
    pub file: Option<String>,
    /// 1-based line within that file.
    pub line: usize,
}

/// The expanded body, and where each of its lines came from.
#[derive(Debug, Clone, Default)]
pub struct Expanded {
    pub text: String,
    /// One entry per line of `text`, in order.
    pub origins: Vec<Origin>,
    /// Things worth telling the writer: a name nothing answers to, a loop.
    pub problems: Vec<String>,
}

impl Expanded {
    /// Where a 1-based line of the expanded body came from.
    pub fn origin_of(&self, line: usize) -> Option<&Origin> {
        self.origins.get(line.checked_sub(1)?)
    }

    /// The inverse: which line of the expanded body a place in a file became.
    ///
    /// The *first* match, because a part included twice appears twice and the
    /// cursor can only be in one of them. First is the answer that agrees with
    /// reading order, and there is no better one available — the caller knows a
    /// file and a line, which is genuinely ambiguous when the same chapter is
    /// pulled in at two places.
    pub fn line_of(&self, file: Option<&str>, line: usize) -> Option<usize> {
        self.origins
            .iter()
            .position(|o| o.line == line && o.file.as_deref() == file)
            .map(|i| i + 1)
    }
}

/// How deep an inclusion chain may go.
///
/// A sefer is chapters, and a chapter may pull in a section. Past this the input
/// is a mistake rather than a structure, and the cap keeps a pathological one
/// from being expensive — a cycle is caught separately and exactly, so this is a
/// backstop, not the mechanism.
const MAX_DEPTH: usize = 8;

/// Is this line an inclusion directive, and of what?
///
/// Both spellings, because every command in Ksav has an English alias and a
/// writer who used it is not owed a worse experience.
pub fn directive(line: &str) -> Option<&str> {
    let t = line.trim();
    for name in ["#כלול(", "#include_part("] {
        if let Some(rest) = t.strip_prefix(name) {
            let rest = rest.strip_suffix(')')?;
            let inner = rest.trim();
            // Either quote, because a writer typing a Hebrew name is as likely
            // to reach for one as the other.
            let name = inner
                .strip_prefix('"')
                .and_then(|s| s.strip_suffix('"'))
                .or_else(|| inner.strip_prefix('\'').and_then(|s| s.strip_suffix('\'')))?;
            return Some(name.trim());
        }
    }
    None
}

/// Every part a body asks for, directly. Not recursive — the caller resolves the
/// transitive set by asking again for each part it finds.
pub fn referenced(body: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for line in body.lines() {
        if let Some(name) = directive(line) {
            let name = name.to_string();
            if !out.contains(&name) {
                out.push(name);
            }
        }
    }
    out
}

/// Expand every inclusion, recording where each resulting line came from.
pub fn expand(main: &str, parts: &HashMap<String, String>) -> Expanded {
    let mut out = Expanded::default();
    let mut stack: Vec<String> = Vec::new();
    expand_into(main, None, parts, &mut stack, 0, &mut out);
    // `lines()` drops a trailing newline, so the two can disagree by one line if
    // the body ends with one. The map is what everything downstream indexes by,
    // so it is the one that has to be right.
    debug_assert_eq!(out.text.lines().count(), out.origins.len());
    out
}

fn expand_into(
    body: &str,
    file: Option<&str>,
    parts: &HashMap<String, String>,
    stack: &mut Vec<String>,
    depth: usize,
    out: &mut Expanded,
) {
    for (i, line) in body.lines().enumerate() {
        let here = Origin {
            file: file.map(str::to_string),
            line: i + 1,
        };
        let Some(name) = directive(line) else {
            push_line(out, line, here);
            continue;
        };
        // A part that is already open above us on the stack. Following it would
        // not terminate, and the writer needs to be told which name closed the
        // loop rather than watching the compile hang.
        if stack.iter().any(|n| n == name) {
            out.problems.push(format!(
                "הכללה מעגלית: \"{name}\" כולל את עצמו · Circular include: \"{name}\" includes itself"
            ));
            push_line(out, &marker(&format!("מעגל: {name}")), here);
            continue;
        }
        if depth >= MAX_DEPTH {
            out.problems.push(format!(
                "הכללות מקוננות עמוק מדי (מעל {MAX_DEPTH}) — \"{name}\" לא נכלל · \
                 Includes nested deeper than {MAX_DEPTH} — \"{name}\" was not included"
            ));
            push_line(out, &marker(&format!("עמוק מדי: {name}")), here);
            continue;
        }
        let Some(part) = parts.get(name) else {
            // Not an error that should stop the compile: the rest of the sefer is
            // still worth seeing, and a red marker on the page is a far better
            // report than a blank preview.
            out.problems.push(format!(
                "אין מסמך בשם \"{name}\" · No document named \"{name}\""
            ));
            push_line(out, &marker(&format!("חסר: {name}")), here);
            continue;
        };
        stack.push(name.to_string());
        expand_into(part, Some(name), parts, stack, depth + 1, out);
        stack.pop();
    }
}

/// What prints in place of an inclusion that could not be made.
///
/// Deliberately visible. A missing chapter that left a silent gap would be
/// discovered when the sefer came back from the printer.
fn marker(what: &str) -> String {
    format!("#חסר_הכללה[{what}]")
}

/// Rewrite diagnostics from the assembled body's coordinates into each line's
/// own file and line.
///
/// The compile knows nothing about the expansion — it was handed one body and
/// answers in that body's line numbers — so this is where a number that means
/// nothing to the writer becomes one that does.
///
/// A diagnostic with no line is left alone rather than guessed at: it points
/// into the prelude, and inventing a chapter for it would be worse than saying
/// nothing.
pub fn relabel(expanded: &Expanded, diagnostics: &mut [crate::Diagnostic]) {
    for d in diagnostics {
        let Some(line) = d.line else { continue };
        let Some(origin) = expanded.origin_of(line) else {
            continue;
        };
        d.line = Some(origin.line);
        d.file.clone_from(&origin.file);
    }
}

/// The parts on a compile request, as `{name: body}`.
pub fn from_request(v: &serde_json::Value) -> HashMap<String, String> {
    let mut out = HashMap::new();
    let Some(list) = v.get("parts").and_then(|x| x.as_array()) else {
        return out;
    };
    for part in list {
        let (Some(name), Some(body)) = (
            part.get("name").and_then(|x| x.as_str()),
            part.get("body").and_then(|x| x.as_str()),
        ) else {
            continue;
        };
        if !name.trim().is_empty() {
            out.insert(name.trim().to_string(), body.to_string());
        }
    }
    out
}

fn push_line(out: &mut Expanded, line: &str, origin: Origin) {
    if !out.text.is_empty() {
        out.text.push('\n');
    }
    out.text.push_str(line);
    out.origins.push(origin);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parts(pairs: &[(&str, &str)]) -> HashMap<String, String> {
        pairs
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect()
    }

    #[test]
    fn a_whole_line_is_a_directive_and_nothing_else_is() {
        assert_eq!(directive("#כלול(\"פרק ג\")"), Some("פרק ג"));
        assert_eq!(directive("   #כלול(\"פרק ג\")  "), Some("פרק ג"));
        assert_eq!(directive("#include_part(\"chapter\")"), Some("chapter"));
        assert_eq!(directive("#כלול('פרק ג')"), Some("פרק ג"));
        // Mid-sentence is prose about the command, not the command.
        assert_eq!(directive("הפקודה #כלול(\"פרק ג\") עושה כך"), None);
        assert_eq!(directive("#כלול()"), None);
        assert_eq!(directive("#הערה[שלום]"), None);
        assert_eq!(directive(""), None);
    }

    #[test]
    fn a_part_is_spliced_where_it_was_asked_for() {
        let out = expand(
            "פתיחה\n#כלול(\"ב\")\nסיום",
            &parts(&[("ב", "שורה ראשונה\nשורה שניה")]),
        );
        assert_eq!(out.text, "פתיחה\nשורה ראשונה\nשורה שניה\nסיום");
        assert!(out.problems.is_empty());
    }

    #[test]
    fn every_line_knows_which_file_it_came_from() {
        // The whole reason the expansion is here and not in Typst. A diagnostic
        // on line 3 of the assembled body means nothing to somebody looking at a
        // chapter; "perek-3, line 2" means everything.
        let out = expand("א\n#כלול(\"ב\")\nג", &parts(&[("ב", "x\ny")]));
        assert_eq!(
            out.origin_of(1),
            Some(&Origin {
                file: None,
                line: 1
            })
        );
        assert_eq!(
            out.origin_of(2),
            Some(&Origin {
                file: Some("ב".into()),
                line: 1
            })
        );
        assert_eq!(
            out.origin_of(3),
            Some(&Origin {
                file: Some("ב".into()),
                line: 2
            })
        );
        // …and the line after the inclusion is back in the main body, at its own
        // line number — not at the number it ended up with.
        assert_eq!(
            out.origin_of(4),
            Some(&Origin {
                file: None,
                line: 3
            })
        );
    }

    #[test]
    fn a_part_may_include_a_part() {
        let out = expand(
            "#כלול(\"א\")",
            &parts(&[("א", "ראש\n#כלול(\"ב\")"), ("ב", "עלה")]),
        );
        assert_eq!(out.text, "ראש\nעלה");
        assert_eq!(
            out.origin_of(2),
            Some(&Origin {
                file: Some("ב".into()),
                line: 1
            })
        );
    }

    #[test]
    fn a_loop_is_named_rather_than_followed() {
        let out = expand(
            "#כלול(\"א\")",
            &parts(&[("א", "ראש\n#כלול(\"ב\")"), ("ב", "#כלול(\"א\")")]),
        );
        assert!(
            out.text.contains("ראש"),
            "the part before the loop still prints"
        );
        assert!(
            out.text.contains("מעגל"),
            "and the loop is marked on the page"
        );
        assert_eq!(out.problems.len(), 1);
        assert!(out.problems[0].contains('א'));
    }

    #[test]
    fn a_part_included_twice_is_not_a_loop() {
        // Only a part open *above* this one is a cycle. Including the same
        // boilerplate at the top of two chapters is completely ordinary, and an
        // over-eager check would refuse it.
        let out = expand("#כלול(\"ב\")\n#כלול(\"ב\")", &parts(&[("ב", "שלום")]));
        assert_eq!(out.text, "שלום\nשלום");
        assert!(out.problems.is_empty());
    }

    #[test]
    fn a_missing_part_marks_the_page_and_keeps_going() {
        // The rest of the sefer is still worth seeing, and a red marker is a far
        // better report than a blank preview. A silent gap would be discovered
        // when the sefer came back from the printer.
        let out = expand("לפני\n#כלול(\"אין\")\nאחרי", &HashMap::new());
        assert!(out.text.contains("לפני") && out.text.contains("אחרי"));
        assert!(out.text.contains("חסר"));
        assert_eq!(out.problems.len(), 1);
        assert!(out.problems[0].contains("אין"));
    }

    #[test]
    fn depth_is_bounded() {
        // A chain long enough to be a mistake rather than a structure. Every link
        // is a distinct name, so the cycle check cannot be what stops it — this
        // is the backstop doing its own job.
        let mut map = HashMap::new();
        for i in 0..30 {
            map.insert(format!("p{i}"), format!("שורה {i}\n#כלול(\"p{}\")", i + 1));
        }
        let out = expand("#כלול(\"p0\")", &map);
        assert!(!out.problems.is_empty(), "the cap should be reported");
        assert!(out.text.contains("עמוק מדי"));
        assert!(out.text.lines().count() < 30);
    }

    #[test]
    fn a_body_with_no_includes_is_unchanged() {
        let body = "שלום\n\nעולם";
        let out = expand(body, &HashMap::new());
        assert_eq!(out.text, body);
        assert!(out.problems.is_empty());
        assert_eq!(out.origins.len(), 3);
    }

    #[test]
    fn the_names_a_body_asks_for_are_listed_once_each() {
        let body = "#כלול(\"א\")\nטקסט\n#כלול(\"ב\")\n#כלול(\"א\")";
        assert_eq!(referenced(body), vec!["א".to_string(), "ב".to_string()]);
    }
}

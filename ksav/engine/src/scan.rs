//! The Rust/WASM lexical scan service.
//!
//! The rules here deliberately mirror the lexical core in `app/src/spans.ts`.
//! Byte offsets are used while scanning UTF-8, then converted once to the
//! JavaScript UTF-16 offsets used by the service wire format.

use std::collections::HashMap;

use serde_json::{json, Value};

#[derive(Clone, Copy, PartialEq, Eq)]
enum Context {
    Content,
    Code,
}

struct Range {
    from: usize,
    to: usize,
    unterminated: bool,
}

struct Delimiter {
    pos: usize,
    ch: u8,
    opener: bool,
    name: String,
    structural: bool,
}

struct Head {
    from: usize,
    name_from: usize,
    name_to: usize,
    hash: bool,
    ctx: Context,
}

struct Frame {
    open: usize,
    close: usize,
    ctx: Context,
    name: String,
}

#[derive(Clone, Copy)]
struct Open {
    pos: usize,
    ch: u8,
    restore: Context,
    structural: bool,
    frame: usize,
}

struct Facts {
    comments: Vec<Range>,
    raws: Vec<Range>,
    strings: Vec<Range>,
    content_groups: Vec<Range>,
    closes: Vec<(usize, usize)>,
    heads: Vec<Head>,
    frames: Vec<Frame>,
    delims: Vec<Delimiter>,
    needs_recovery: bool,
}

const KEYWORDS: &[&str] = &[
    "let", "set", "show", "import", "include", "context", "return", "if", "else", "for", "while",
];

fn is_name_start(c: char) -> bool {
    c.is_ascii_alphabetic() || ('\u{0590}'..='\u{05ff}').contains(&c) || c == '_'
}

fn is_name_char(c: char) -> bool {
    is_name_start(c) || c.is_ascii_digit()
}

fn char_before(text: &str, at: usize) -> Option<(usize, char)> {
    text[..at].char_indices().next_back()
}

fn char_at(text: &str, at: usize) -> Option<char> {
    text[at..].chars().next()
}

/// The name/hash immediately before an opener, skipping complete groups that
/// have already closed. This is the byte-indexed equivalent of spans.ts's
/// `headBefore`; in particular, a numeric-start token is not a name.
fn head_before(text: &str, at: usize, opener_of: &HashMap<usize, usize>) -> (String, bool) {
    let mut j = at;
    loop {
        let Some((prev, c)) = char_before(text, j) else {
            return (String::new(), false);
        };
        if matches!(c, ')' | ']') {
            if let Some(open) = opener_of.get(&prev) {
                j = *open;
                continue;
            }
        }
        if !is_name_char(c) {
            return if c == '#' {
                (String::new(), true)
            } else {
                (String::new(), false)
            };
        }

        let end = j;
        let mut start = prev;
        while let Some((before, c)) = char_before(text, start) {
            if !is_name_char(c) {
                break;
            }
            start = before;
        }
        let Some(first) = char_at(text, start) else {
            return (String::new(), false);
        };
        if !is_name_start(first) {
            return (String::new(), false);
        }
        let name = text[start..end].to_string();
        let hash = char_before(text, start).is_some_and(|(_, c)| c == '#');
        return (name, hash);
    }
}

fn opener_for(c: u8) -> u8 {
    match c {
        b']' => b'[',
        b')' => b'(',
        b'}' => b'{',
        _ => 0,
    }
}

fn closer(c: u8) -> bool {
    matches!(c, b']' | b')' | b'}')
}

fn opener(c: u8) -> bool {
    matches!(c, b'[' | b'(' | b'{')
}

fn delimiter_char(c: u8) -> &'static str {
    match c {
        b'[' => "[",
        b'(' => "(",
        b'{' => "{",
        b']' => "]",
        b')' => ")",
        b'}' => "}",
        _ => unreachable!("not a delimiter"),
    }
}

/// Convert only offsets that will be emitted. Sorting references lets one
/// forward UTF-8 walk handle nested frames and close pairs, whose end positions
/// are not in document order. Memory is proportional to the output facts, not
/// the length of a prose/raw/comment body; ASCII needs no conversion allocation.
fn utf16_offsets(text: &str, strict: &mut Facts, recovery: Option<&mut Facts>) -> usize {
    if text.is_ascii() {
        return text.len();
    }

    let mut offsets = Vec::new();
    for range in strict
        .comments
        .iter_mut()
        .chain(&mut strict.raws)
        .chain(&mut strict.strings)
        .chain(&mut strict.content_groups)
    {
        offsets.push(&mut range.from);
        offsets.push(&mut range.to);
    }
    for (open, close) in &mut strict.closes {
        offsets.push(open);
        offsets.push(close);
    }
    for head in &mut strict.heads {
        offsets.push(&mut head.from);
        offsets.push(&mut head.name_from);
        offsets.push(&mut head.name_to);
    }
    for frame in &mut strict.frames {
        offsets.push(&mut frame.open);
        offsets.push(&mut frame.close);
    }
    let delims = if let Some(recovery) = recovery {
        for range in &mut recovery.comments {
            offsets.push(&mut range.from);
            offsets.push(&mut range.to);
        }
        &mut recovery.delims
    } else {
        &mut strict.delims
    };
    for delimiter in delims {
        offsets.push(&mut delimiter.pos);
    }
    convert_utf16_offsets(text, offsets)
}

fn convert_utf16_offsets(text: &str, mut offsets: Vec<&mut usize>) -> usize {
    offsets.sort_unstable_by_key(|offset| **offset);
    let mut chars = text.chars();
    let mut byte = 0;
    let mut utf16 = 0;
    for offset in offsets {
        while byte < *offset {
            let c = chars.next().expect("scan offset is within the text");
            byte += c.len_utf8();
            utf16 += c.len_utf16();
        }
        debug_assert_eq!(byte, *offset, "scan offset is a scalar boundary");
        *offset = utf16;
    }
    utf16 + chars.map(char::len_utf16).sum::<usize>()
}

fn raw_end(text: &str, start: usize, run: usize) -> Option<usize> {
    let bytes = text.as_bytes();
    let mut at = start + run;
    while at + run <= bytes.len() {
        if bytes[at..at + run] == bytes[start..start + run]
            && (at + run == bytes.len() || bytes[at + run] != b'`')
        {
            return Some(at + run);
        }
        at += 1;
    }
    None
}

fn push_range(out: &mut Vec<Range>, from: usize, to: usize, unterminated: bool) {
    out.push(Range {
        from,
        to,
        unterminated,
    });
}

/// One lexical pass. `recover` is the only difference between strict assembly
/// facts and the delimiter-lint pass: a mismatched closer pops one frame only
/// in recovery mode.
fn scan_pass(text: &str, recover: bool) -> Facts {
    let bytes = text.as_bytes();
    let n = bytes.len();
    let mut facts = Facts {
        comments: Vec::new(),
        raws: Vec::new(),
        strings: Vec::new(),
        content_groups: Vec::new(),
        closes: Vec::new(),
        heads: Vec::new(),
        frames: Vec::new(),
        delims: Vec::new(),
        needs_recovery: false,
    };
    let mut stack: Vec<Open> = Vec::new();
    let mut opener_of: HashMap<usize, usize> = HashMap::new();
    let mut context = Context::Content;
    // depth, context to restore, frame index
    let mut code_line: Option<(usize, Context, usize)> = None;
    let mut i = 0;

    while i < n {
        let c = bytes[i];

        if c == b'\n' {
            if let Some((depth, restore, frame)) = code_line {
                if stack.len() == depth {
                    context = restore;
                    facts.frames[frame].close = i;
                    code_line = None;
                }
            }
            i += 1;
            continue;
        }

        // Comments are recognized in both contexts and before strings/raws.
        if c == b'/' && i + 1 < n {
            if bytes[i + 1] == b'/' && (i == 0 || bytes[i - 1] != b':') {
                let to = text[i..].find('\n').map_or(n, |at| i + at);
                push_range(&mut facts.comments, i, to, false);
                i = to;
                continue;
            }
            if bytes[i + 1] == b'*' {
                if let Some(end) = text[i + 2..].find("*/") {
                    let to = i + 2 + end + 2;
                    push_range(&mut facts.comments, i, to, false);
                    i = to;
                } else {
                    push_range(&mut facts.comments, i, n, true);
                    break;
                }
                continue;
            }
        }

        if context == Context::Content {
            if c == b'`' {
                let mut run = 1;
                while i + run < n && bytes[i + run] == b'`' {
                    run += 1;
                }
                if let Some(end) = raw_end(text, i, run) {
                    push_range(&mut facts.raws, i, end, false);
                    i = end;
                } else {
                    push_range(&mut facts.raws, i, n, true);
                    break;
                }
                continue;
            }
            if c == b'\\' {
                i += 1;
                if i < n {
                    i += text[i..].chars().next().map_or(1, char::len_utf8);
                }
                continue;
            }
        } else if c == b'"' {
            let mut j = i + 1;
            while j < n {
                match bytes[j] {
                    b'\\' => {
                        j += 1;
                        if j < n {
                            j += text[j..].chars().next().map_or(1, char::len_utf8);
                        }
                    }
                    b'"' => break,
                    _ => j += text[j..].chars().next().map_or(1, char::len_utf8),
                }
            }
            push_range(&mut facts.strings, i + 1, j.min(n), false);
            i = if j < n { j + 1 } else { n };
            continue;
        }

        if opener(c) {
            let (name, hash) = head_before(text, i, &opener_of);
            let inner = if c == b'[' {
                Context::Content
            } else if context == Context::Code || hash {
                Context::Code
            } else {
                context
            };
            let structural = c == b'[' || inner == Context::Code;
            let frame = facts.frames.len();
            facts.frames.push(Frame {
                open: i,
                close: n,
                ctx: inner,
                name: name.clone(),
            });
            facts.delims.push(Delimiter {
                pos: i,
                ch: c,
                opener: true,
                name,
                structural,
            });
            stack.push(Open {
                pos: i,
                ch: c,
                restore: context,
                structural,
                frame,
            });
            context = inner;
            i += 1;
            continue;
        }

        if closer(c) {
            let want = opener_for(c);
            let top = stack.last().copied();
            let structural = c == b']'
                || top.is_some_and(|open| open.ch == want && open.structural)
                || (top.is_none() && context == Context::Code)
                || (top.is_some_and(|open| open.ch != want) && context == Context::Code);
            facts.delims.push(Delimiter {
                pos: i,
                ch: c,
                opener: false,
                name: String::new(),
                structural,
            });

            if top.is_some_and(|open| open.ch == want) {
                let open = stack.pop().expect("top exists");
                opener_of.insert(i, open.pos);
                facts.closes.push((open.pos, i));
                facts.frames[open.frame].close = i;
                if want == b'[' {
                    facts.content_groups.push(Range {
                        from: open.pos + 1,
                        to: i,
                        unterminated: false,
                    });
                }
                context = open.restore;
            } else {
                if top.is_some() || context != Context::Content {
                    facts.needs_recovery = true;
                }
                if recover {
                    if let Some(open) = stack.pop() {
                        facts.frames[open.frame].close = i;
                        context = open.restore;
                    } else {
                        context = Context::Content;
                    }
                }
            }
            if let Some((depth, restore, frame)) = code_line {
                if stack.len() < depth {
                    facts.frames[frame].close = i;
                    // `restore` is already reflected by the closer's branch;
                    // keep it named here to document the tuple's role.
                    let _ = restore;
                    code_line = None;
                }
            }
            i += 1;
            continue;
        }

        if c == b'#' {
            let start = i + 1;
            if start < n {
                if let Some(first) = char_at(text, start) {
                    if is_name_start(first) {
                        let mut end = start + first.len_utf8();
                        while end < n {
                            let Some(ch) = char_at(text, end) else { break };
                            if !is_name_char(ch) {
                                break;
                            }
                            end += ch.len_utf8();
                        }
                        facts.heads.push(Head {
                            from: i,
                            name_from: start,
                            name_to: end,
                            hash: true,
                            ctx: context,
                        });
                        if code_line.is_none()
                            && context == Context::Content
                            && end - start <= 7
                            && text[start..end].bytes().all(|b| b.is_ascii_lowercase())
                            && KEYWORDS.contains(&&text[start..end])
                        {
                            let frame = facts.frames.len();
                            facts.frames.push(Frame {
                                open: i,
                                close: n,
                                ctx: Context::Code,
                                name: String::new(),
                            });
                            code_line = Some((stack.len(), context, frame));
                            context = Context::Code;
                        }
                        i = end;
                        continue;
                    }
                }
            }
        }

        if context == Context::Code {
            if let Some(current) = char_at(text, i) {
                if is_name_start(current)
                    && !char_before(text, i).is_some_and(|(_, previous)| is_name_char(previous))
                {
                    let mut end = i + current.len_utf8();
                    while end < n {
                        let Some(ch) = char_at(text, end) else { break };
                        if !is_name_char(ch) {
                            break;
                        }
                        end += ch.len_utf8();
                    }
                    let mut next = end;
                    while next < n && matches!(bytes[next], b' ' | b'\t') {
                        next += 1;
                    }
                    if matches!(bytes.get(next), Some(b'(' | b'[')) {
                        facts.heads.push(Head {
                            from: i,
                            name_from: i,
                            name_to: end,
                            hash: false,
                            ctx: context,
                        });
                    }
                    i = end;
                    continue;
                }
            }
        }

        i += text[i..].chars().next().map_or(1, char::len_utf8);
    }

    facts.content_groups.sort_by_key(|group| group.from);
    facts
}

fn context_name(ctx: Context) -> &'static str {
    match ctx {
        Context::Content => "content",
        Context::Code => "code",
    }
}

fn ranges_json(ranges: &[Range]) -> Vec<Value> {
    ranges
        .iter()
        .map(|range| {
            let mut value = json!({
                "from": range.from,
                "to": range.to,
            });
            if range.unterminated {
                value["unterminated"] = json!(true);
            }
            value
        })
        .collect()
}

fn scan_text(text: &str) -> Value {
    let mut strict = scan_pass(text, false);
    // Balanced input uses the strict pass for the recovery-facing fields too.
    // Only a mismatched closer asks for the exceptional second pass.
    let mut recovery = strict.needs_recovery.then(|| scan_pass(text, true));
    let text_length = utf16_offsets(text, &mut strict, recovery.as_mut());
    let recovery = recovery.as_ref().unwrap_or(&strict);

    let delims: Vec<Value> = recovery
        .delims
        .iter()
        .map(|delimiter| {
            json!({
                "pos": delimiter.pos,
                "ch": delimiter_char(delimiter.ch),
                "opener": delimiter.opener,
                "name": delimiter.name,
                "structural": delimiter.structural,
            })
        })
        .collect();
    let heads: Vec<Value> = strict
        .heads
        .iter()
        .map(|head| {
            json!({
                "from": head.from,
                "nameFrom": head.name_from,
                "nameTo": head.name_to,
                "hash": head.hash,
                "ctx": context_name(head.ctx),
            })
        })
        .collect();
    let frames: Vec<Value> = strict
        .frames
        .iter()
        .map(|frame| {
            json!({
                "open": frame.open,
                "close": frame.close,
                "ctx": context_name(frame.ctx),
                "name": frame.name,
            })
        })
        .collect();
    let closes: Vec<Value> = strict
        .closes
        .iter()
        .map(|&(open, close)| json!([open, close]))
        .collect();

    json!({
        "version": 1,
        "text_length": text_length,
        "delims": delims,
        "comments": ranges_json(&recovery.comments),
        "strictComments": ranges_json(&strict.comments),
        "raws": ranges_json(&strict.raws),
        "strings": ranges_json(&strict.strings),
        "contentGroups": ranges_json(&strict.content_groups),
        "closes": closes,
        "heads": heads,
        "frames": frames,
    })
}

/// JSON-in / JSON-out scan for the bracket-lint seam.
///
/// Input: `{ "text": string }`. Invalid JSON and a missing/non-string `text`
/// are refusals in the same error shape as every other engine service.
pub fn scan_request(input_json: &str) -> String {
    let value: Value = match serde_json::from_str(input_json) {
        Ok(value) => value,
        Err(error) => {
            return crate::services::error_json(&format!("malformed scan request: {error}"));
        }
    };
    let Some(text) = value.get("text").and_then(Value::as_str) else {
        return crate::services::error_json("malformed scan request: text must be a string");
    };
    scan_text(text).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn response(text: &str) -> Value {
        serde_json::from_str(&scan_request(&json!({ "text": text }).to_string())).unwrap()
    }

    #[test]
    fn version_one_wire_fields_are_present() {
        let value = response("");
        let mut keys: Vec<_> = value.as_object().unwrap().keys().cloned().collect();
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
    }

    #[test]
    fn utf16_offsets_cover_hebrew_astral_text_and_lengths() {
        let value = response("אב😀#f[ג]");
        assert_eq!(value["text_length"], 9);
        assert_eq!(value["delims"][0]["pos"], 6);
        assert_eq!(value["delims"][1]["pos"], 8);
        assert_eq!(value["heads"][0]["from"], 4);
        assert_eq!(value["frames"][0]["open"], 6);
    }

    #[test]
    fn comments_strings_raws_and_escaped_content_suppress_structure() {
        let value = response("// [ignored]\n#f(\"a)b\")[x\\]y] `#g[z]` /* {ignored} */");
        let delims = value["delims"].as_array().unwrap();
        assert_eq!(value["comments"].as_array().unwrap().len(), 2);
        assert_eq!(value["strictComments"], value["comments"]);
        assert_eq!(value["strings"][0], json!({ "from": 17, "to": 20 }));
        assert_eq!(value["raws"][0], json!({ "from": 29, "to": 36 }));
        assert_eq!(delims.iter().filter(|d| d["ch"] == "(").count(), 1);
        assert!(delims.iter().all(|d| d["name"] != "g"));
    }

    #[test]
    fn nested_calls_have_heads_frames_groups_and_close_pairs() {
        let value = response("#f(g[x])");
        assert_eq!(
            value["heads"],
            json!([
                { "from": 0, "nameFrom": 1, "nameTo": 2, "hash": true, "ctx": "content" },
                { "from": 3, "nameFrom": 3, "nameTo": 4, "hash": false, "ctx": "code" }
            ])
        );
        assert_eq!(value["contentGroups"], json!([{ "from": 5, "to": 6 }]));
        assert_eq!(value["closes"], json!([[4, 6], [2, 7]]));
        assert_eq!(
            value["frames"],
            json!([
                { "open": 2, "close": 7, "ctx": "code", "name": "f" },
                { "open": 4, "close": 6, "ctx": "content", "name": "g" }
            ])
        );
    }

    #[test]
    fn keyword_frames_close_at_newline_and_numeric_names_are_rejected() {
        let value = response("#let ר = [רבי]\n#1[x] #g[x]");
        assert_eq!(
            value["frames"][0],
            json!({ "open": 0, "close": 14, "ctx": "code", "name": "" })
        );
        assert_eq!(value["heads"].as_array().unwrap().len(), 2);
        assert_eq!(value["heads"][1]["from"], 21);
    }

    #[test]
    fn malformed_closer_uses_recovery_delims_but_strict_facts() {
        let value = response("#f(] #g[x]");
        let rows = value["delims"].as_array().unwrap();
        assert_eq!(rows[1]["ch"], "]");
        assert_eq!(rows[2]["name"], "g");
        assert_eq!(value["strictComments"], value["comments"]);
        assert_eq!(value["frames"][0]["close"], 10);
        assert_eq!(value["closes"], json!([[7, 9]]));
    }

    #[test]
    fn malformed_and_unterminated_requests_are_clear() {
        for input in ["not json", "{}", r#"{"text": 7}"#] {
            let error: Value = serde_json::from_str(&scan_request(input)).unwrap();
            assert_eq!(error["ok"], false);
            assert!(error["error"].is_string());
        }
        let value = response("/* open `unterminated");
        assert_eq!(value["comments"][0]["unterminated"], true);
    }
}

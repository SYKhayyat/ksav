//! Version control for a sefer, on the git that is already on the machine.
//!
//! # Why this drives the `git` binary rather than linking a library
//!
//! The obvious alternative is `git2`, the libgit2 bindings. It was not chosen,
//! and the reasons are specific rather than a preference:
//!
//! - **The writer has a git already, and it is the one that must agree.** A
//!   sefer under version control is under version control *for other tools too*
//!   — a terminal, a host's web view, whatever the writer's chavrusa uses. When
//!   Ksav's history panel and `git log` disagree about what is in a commit, the
//!   panel is the one that is wrong, and libgit2's diff and merge are not
//!   git's. Driving the same binary makes that class of disagreement
//!   inexpressible rather than unlikely.
//! - **Credentials.** Push is the operation this whole module exists for, and
//!   authenticating a push is the part libgit2 does not do for you: SSH agents,
//!   Windows' credential manager, `credential.helper`, host-specific tokens.
//!   Every one of those is configuration the writer already has, read by the
//!   binary and by nothing else.
//! - **No new supply chain.** libgit2 is a C library with a build of its own.
//!   This crate's manifest argues at length about a dependency it *did* take;
//!   the same standard applied here says take none, when the thing is already
//!   installed and this repository cannot even be cloned without it.
//!
//! What that costs is real and is stated rather than hidden: **git may not be
//! installed**. That is the first thing [`status`] answers and the first thing
//! the panel says, in words, with the reason — not a version-control drawer
//! that quietly does nothing.
//!
//! # The four rules every call here follows
//!
//! 1. **Nothing reaches a shell.** Every argument goes through
//!    [`std::process::Command::arg`], which on both platforms hands the child an
//!    argument vector. There is no interpolation anywhere in this file.
//! 2. **No caller-supplied word can become an option.** A branch called
//!    `--upload-pack=calc` is a legal branch name and an attack on `git fetch`.
//!    [`plain`] refuses any word that begins with `-`, and paths are always
//!    passed after `--`. `tests::a_word_that_could_be_an_option_is_refused`
//!    holds it.
//! 3. **git never asks a question.** `GIT_TERMINAL_PROMPT=0`,
//!    `credential.interactive=false` and an `ssh` in batch mode. Without those,
//!    a push to a host the writer has no credentials for does not fail — it
//!    *waits*, forever, on a prompt that is being written to a pipe nobody
//!    reads. A visible refusal with the host's own message is the goal; a hung
//!    drawer is what the goal is instead of.
//! 4. **Names come back as they were written.** `core.quotepath=false` plus
//!    `-z` porcelain, because a sefer is called `ברכות.ksav` and the default
//!    would hand this module `\341\250\233…` and octal escapes to undo.

use crate::services::error_json;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

/// How long any one git invocation may take before it is killed and reported.
///
/// Generous, because `push` over a slow link to a large repository is a real
/// thing a writer waits for, and mean enough that a wedged process cannot own
/// the drawer. The network operations are the only ones that come close; a
/// `status` on a sefer is single-digit milliseconds.
const DEADLINE: Duration = Duration::from_secs(120);

/// What a run of `git` produced.
struct Run {
    ok: bool,
    code: Option<i32>,
    out: String,
    err: String,
}

impl Run {
    /// The child's own words, whichever stream it used.
    ///
    /// git writes its failures to stderr and its answers to stdout, but not
    /// always — `git push` reports success on stderr, and a failing `commit`
    /// puts *"nothing to commit"* on stdout. A reader wants the sentence, and
    /// asking which pipe it arrived on is this module's problem rather than
    /// theirs.
    fn message(&self) -> String {
        let said = format!("{}\n{}", self.err.trim(), self.out.trim());
        let said = said.trim().to_string();
        if said.is_empty() {
            match self.code {
                Some(c) => format!("git exited with status {c}"),
                None => "git was stopped before it finished".to_string(),
            }
        } else {
            said
        }
    }
}

/// A refusal, with the reason in both languages.
///
/// Every failure a reader can act on is written twice, for the reason the rest
/// of the application gives: a sentence with a bilingual name spliced into it
/// reads as neither language.
fn refuse(he: &str, en: &str) -> String {
    error_json(&format!("{he} · {en}"))
}

// ---------------------------------------------------------------- running git

/// Run git in `dir` with these arguments, or say why it could not be run.
///
/// `Err` is reserved for *git did not run at all* — it is not installed, or the
/// directory is gone. A git that ran and refused comes back as `Ok` with
/// `ok: false` and the message it printed, because those two are different
/// things to tell a reader and only one of them is Ksav's fault.
fn git_run(dir: &Path, args: &[&str]) -> Result<Run, String> {
    let mut cmd = Command::new("git");
    cmd.current_dir(dir);
    // The four `-c`s, on every single invocation.
    //
    // Per-call rather than through the environment because `git config` is
    // read from the repository as well, and a repository that sets
    // `color.ui = always` — a real thing writers do — would otherwise put ANSI
    // escapes through the porcelain parser below.
    cmd.args([
        "-c",
        "core.quotepath=false",
        "-c",
        "color.ui=false",
        "-c",
        "credential.interactive=false",
        "-c",
        "advice.detachedHead=false",
    ]);
    cmd.args(args);
    cmd.env("GIT_TERMINAL_PROMPT", "0");
    // The three ways a git can still stop and wait for a human, closed.
    // `GIT_ASKPASS` set to an empty string is *not* the same as unset — an
    // empty helper is tried and fails immediately, which is the wanted
    // behaviour, and unsetting alone would let a `core.askPass` in the
    // writer's config open a window.
    cmd.env("GIT_ASKPASS", "");
    cmd.env("SSH_ASKPASS", "");
    cmd.env(
        "GIT_SSH_COMMAND",
        "ssh -oBatchMode=yes -oStrictHostKeyChecking=accept-new",
    );
    cmd.env("GCM_INTERACTIVE", "Never");
    // A commit must not depend on the writer's editor opening.
    cmd.env("GIT_EDITOR", "true");
    cmd.env("LC_ALL", "C");
    cmd.stdin(Stdio::null());
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return Err("no-git".to_string());
        }
        Err(e) => return Err(e.to_string()),
    };

    // Both pipes drained on their own threads, and the parent waits on the
    // process rather than on a read.
    //
    // `wait_with_output` would be one line and cannot be used: it consumes the
    // `Child`, so there is nothing left to kill when the deadline passes. A
    // parent that waits on a *read* instead deadlocks the moment the child
    // fills the other pipe's buffer, which for `git log` on a real repository
    // is immediate.
    let mut so = child.stdout.take();
    let mut se = child.stderr.take();
    let ot = std::thread::spawn(move || {
        let mut buf = Vec::new();
        if let Some(s) = so.as_mut() {
            let _ = s.read_to_end(&mut buf);
        }
        buf
    });
    let et = std::thread::spawn(move || {
        let mut buf = Vec::new();
        if let Some(s) = se.as_mut() {
            let _ = s.read_to_end(&mut buf);
        }
        buf
    });

    let until = Instant::now() + DEADLINE;
    let status = loop {
        match child.try_wait() {
            Ok(Some(s)) => break Some(s),
            Ok(None) => {
                if Instant::now() >= until {
                    let _ = child.kill();
                    let _ = child.wait();
                    break None;
                }
                std::thread::sleep(Duration::from_millis(10));
            }
            Err(e) => return Err(e.to_string()),
        }
    };

    let out = String::from_utf8_lossy(&ot.join().unwrap_or_default()).into_owned();
    let err = String::from_utf8_lossy(&et.join().unwrap_or_default()).into_owned();
    Ok(Run {
        ok: status.map(|s| s.success()).unwrap_or(false),
        code: status.and_then(|s| s.code()),
        out,
        err,
    })
}

/// The installed git's version, or `None` when there is no git to ask.
///
/// Asked of the current directory rather than of a repository: whether git
/// exists is a fact about the machine, and the panel has to be able to say
/// *there is no git here* before it knows anything about the document.
pub fn version() -> Option<String> {
    let here = std::env::current_dir().ok()?;
    let run = git_run(&here, &["--version"]).ok()?;
    if !run.ok {
        return None;
    }
    // "git version 2.54.0.windows.1"
    Some(run.out.trim().rsplit(' ').next()?.to_string())
}

// ---------------------------------------------------------------- arguments

/// A caller-supplied word that is about to become a git argument.
///
/// Refuses the three shapes that turn data into instruction or into a broken
/// record: a leading `-` (every git option), an embedded NUL or newline (the
/// separators the porcelain parsers below key on), and nothing at all.
///
/// It is deliberately not a character whitelist. Branches, remotes and above
/// all *paths* here are Hebrew, and a whitelist written by somebody thinking in
/// ASCII is how a sefer called `ברכות.ksav` becomes unversionable.
fn plain(word: &str, what: &str) -> Result<(), String> {
    if word.is_empty() {
        return Err(refuse(
            &format!("לא נמסר {what}"),
            &format!("no {what} was given"),
        ));
    }
    if word.starts_with('-') {
        return Err(refuse(
            &format!("{what} אינו יכול להתחיל במקף"),
            &format!("a {what} cannot begin with a dash — git would read it as an option"),
        ));
    }
    if word.contains('\0') || word.contains('\n') || word.contains('\r') {
        return Err(refuse(
            &format!("{what} מכיל תו שאינו חוקי"),
            &format!("a {what} cannot contain a line break"),
        ));
    }
    Ok(())
}

// ---------------------------------------------------------------- the request

/// What every operation is told: which document this is about.
#[derive(serde::Deserialize)]
struct Asked {
    /// The document's own path on disk. Everything is derived from it — the
    /// directory git runs in, the path inside the repository, the file a
    /// history is about.
    path: String,
    #[serde(default)]
    op: String,
    #[serde(default)]
    message: Option<String>,
    /// A commit, a branch, a tag — anything git will resolve.
    #[serde(default)]
    rev: Option<String>,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    url: Option<String>,
    #[serde(default)]
    remote: Option<String>,
    #[serde(default)]
    branch: Option<String>,
    #[serde(default)]
    side: Option<String>,
    #[serde(default)]
    email: Option<String>,
    /// Commit everything that changed, not only this document.
    #[serde(default)]
    all: bool,
    #[serde(default)]
    create: bool,
    #[serde(default)]
    set_upstream: bool,
    /// `"file"` (the default) or `"repo"`.
    #[serde(default)]
    scope: Option<String>,
    #[serde(default)]
    limit: Option<usize>,
}

/// Where a document sits, as git sees it.
struct Place {
    /// The directory git is run in — the document's own folder.
    dir: PathBuf,
    /// The repository root, when the document is inside one.
    root: Option<PathBuf>,
    /// The document's path relative to the root, with forward slashes, as every
    /// git command wants it.
    rel: Option<String>,
}

fn locate(path: &str) -> Result<Place, String> {
    let file = PathBuf::from(path);
    let dir = match file.parent() {
        Some(d) if !d.as_os_str().is_empty() => d.to_path_buf(),
        // A bare name with no directory at all is not a place on disk. Every
        // caller has a path from a file dialog, so this is a malformed request
        // rather than a state a writer can be in.
        _ => {
            return Err(refuse(
                "אין למסמך מקום בכונן",
                "the document has no folder on disk",
            ))
        }
    };
    if !dir.is_dir() {
        return Err(refuse(
            "תיקיית המסמך אינה קיימת",
            "the document's folder is not there",
        ));
    }
    let root = match git_run(&dir, &["rev-parse", "--show-toplevel"]) {
        Ok(r) if r.ok => Some(PathBuf::from(r.out.trim())),
        Ok(_) => None,
        Err(e) => return Err(e),
    };
    let rel = root.as_ref().and_then(|_| relative(&dir, &file));
    Ok(Place { dir, root, rel })
}

/// The document's path inside the repository, with forward slashes.
///
/// # Asked of git rather than worked out here
///
/// The obvious implementation is `strip_prefix` on the document's path against
/// `--show-toplevel`. It was written that way and it was wrong, and the way it
/// was wrong is the point: on Windows this module was handed
/// `C:\Users\ADMINI~1\AppData\Local\Temp\…` — an 8.3 short name, which is what
/// `std::env::temp_dir` returns — while git answered
/// `C:/Users/Administrator/AppData/Local/Temp/…`. The same directory. No common
/// prefix. Every operation then refused with *the document is not inside the
/// repository*, about a document that was.
///
/// Slashes and letter case were the two differences that draft anticipated.
/// Short names are a third, symlinks a fourth, a junction a fifth, and a
/// substituted drive a sixth — and there is no end to that list, because
/// "are these two strings the same directory" is a question about a filesystem
/// and not about strings.
///
/// So git is asked. `rev-parse --show-prefix` reports where the *current
/// directory* sits inside the repository, and git is already being run in the
/// document's own folder; the name on the end is the one part no resolution can
/// change. Empty at the root, `sub/dir/` below it, always with a trailing
/// slash, always forward slashes.
fn relative(dir: &Path, file: &Path) -> Option<String> {
    let prefix = git_run(dir, &["rev-parse", "--show-prefix"])
        .ok()
        .filter(|r| r.ok)?
        .out
        .trim()
        .to_string();
    let name = file.file_name()?.to_string_lossy().into_owned();
    Some(format!("{prefix}{name}"))
}

// ---------------------------------------------------------------- status

/// One path git has something to say about.
#[derive(serde::Serialize)]
struct Entry {
    path: String,
    /// The index against HEAD: `M`, `A`, `D`, `R`, or `.` for unchanged.
    staged: String,
    /// The working tree against the index, same alphabet.
    worktree: String,
    /// `ordinary`, `renamed`, `unmerged` or `untracked`.
    kind: String,
    /// Where a rename came from.
    #[serde(skip_serializing_if = "Option::is_none")]
    from: Option<String>,
}

/// `git status --porcelain=v2 -z --branch`, read.
///
/// # Why v2 and why `-z`
///
/// The v1 porcelain quotes any path with a non-ASCII byte in it, and every path
/// here is Hebrew. `core.quotepath=false` unquotes it — and then a filename
/// containing a space, a quote or a newline is ambiguous against the two-column
/// format. `-z` removes the question entirely: records are NUL-separated and
/// nothing inside one is escaped.
///
/// The cost is that a rename record carries **two** paths separated by their own
/// NUL, so the reader cannot simply split on NUL and map. That is the whole
/// reason this is a hand-written loop rather than a `split('\0')`.
fn read_status(text: &str) -> (Vec<Entry>, Branch) {
    let mut entries = Vec::new();
    let mut branch = Branch::default();
    let mut it = text.split('\0').filter(|r| !r.is_empty()).peekable();
    while let Some(record) = it.next() {
        let mut chars = record.chars();
        match chars.next() {
            Some('#') => {
                let rest = record[1..].trim();
                let (key, value) = match rest.split_once(' ') {
                    Some(p) => p,
                    None => continue,
                };
                match key {
                    "branch.oid" => branch.head = Some(value.to_string()),
                    "branch.head" => {
                        if value == "(detached)" {
                            branch.detached = true;
                        } else {
                            branch.name = Some(value.to_string());
                        }
                    }
                    "branch.upstream" => branch.upstream = Some(value.to_string()),
                    "branch.ab" => {
                        // "+3 -1"
                        for part in value.split_whitespace() {
                            let n: i64 = part[1..].parse().unwrap_or(0);
                            match part.chars().next() {
                                Some('+') => branch.ahead = n,
                                Some('-') => branch.behind = n,
                                _ => {}
                            }
                        }
                    }
                    _ => {}
                }
            }
            Some('1') => {
                if let Some(e) = ordinary(record, "ordinary") {
                    entries.push(e);
                }
            }
            Some('2') => {
                // The record's own path, then the path it came from, in the
                // *next* NUL-separated field. Taking that field here is what
                // keeps the loop in step; a reader that misses it reads the old
                // name as the next record and reports a file that does not
                // exist.
                let from = it.next().map(|s| s.to_string());
                if let Some(mut e) = ordinary(record, "renamed") {
                    e.from = from;
                    entries.push(e);
                }
            }
            Some('u') => {
                // `u <XY> <sub> <m1> <m2> <m3> <mW> <h1> <h2> <h3> <path>`
                let fields: Vec<&str> = record.splitn(11, ' ').collect();
                if fields.len() == 11 {
                    let xy: Vec<char> = fields[1].chars().collect();
                    entries.push(Entry {
                        path: fields[10].to_string(),
                        staged: xy.first().copied().unwrap_or('.').to_string(),
                        worktree: xy.get(1).copied().unwrap_or('.').to_string(),
                        kind: "unmerged".to_string(),
                        from: None,
                    });
                }
            }
            Some('?') => entries.push(Entry {
                path: record[2..].to_string(),
                staged: ".".to_string(),
                worktree: "?".to_string(),
                kind: "untracked".to_string(),
                from: None,
            }),
            _ => {}
        }
    }
    (entries, branch)
}

/// `1`/`2` records share their first eight fields; only `2` has a ninth before
/// the path.
fn ordinary(record: &str, kind: &str) -> Option<Entry> {
    let want = if kind == "renamed" { 10 } else { 9 };
    let fields: Vec<&str> = record.splitn(want, ' ').collect();
    if fields.len() != want {
        return None;
    }
    let xy: Vec<char> = fields[1].chars().collect();
    Some(Entry {
        path: fields[want - 1].to_string(),
        staged: xy.first().copied().unwrap_or('.').to_string(),
        worktree: xy.get(1).copied().unwrap_or('.').to_string(),
        kind: kind.to_string(),
        from: None,
    })
}

#[derive(Default, serde::Serialize)]
struct Branch {
    name: Option<String>,
    head: Option<String>,
    upstream: Option<String>,
    ahead: i64,
    behind: i64,
    detached: bool,
}

fn status(place: &Place, asked: &Asked) -> String {
    let Some(root) = place.root.as_ref() else {
        return serde_json::json!({
            "ok": true,
            "git": version(),
            "root": serde_json::Value::Null,
        })
        .to_string();
    };
    let run = match git_run(
        &place.dir,
        &[
            "--no-optional-locks",
            "status",
            "--porcelain=v2",
            "-z",
            "--branch",
            "--untracked-files=normal",
        ],
    ) {
        Ok(r) => r,
        Err(e) => return started_wrong(e),
    };
    if !run.ok {
        return error_json(&run.message());
    }
    let (entries, branch) = read_status(&run.out);
    // Is the repository in the middle of a merge? The file is how git itself
    // knows, and `rev-parse --verify MERGE_HEAD` is how it is asked without
    // reaching into `.git` from here.
    let merging = git_run(
        &place.dir,
        &["rev-parse", "--verify", "--quiet", "MERGE_HEAD"],
    )
    .map(|r| r.ok)
    .unwrap_or(false);
    // Whether the document itself has ever been committed. `.` in both columns
    // means *unchanged and tracked*; absent from the list entirely means either
    // unchanged-and-tracked or not in the repository at all, and those two are
    // the opposite answer for the panel.
    let tracked = place
        .rel
        .as_ref()
        .map(|rel| {
            git_run(&place.dir, &["ls-files", "--error-unmatch", "--", rel])
                .map(|r| r.ok)
                .unwrap_or(false)
        })
        .unwrap_or(false);
    let this = place
        .rel
        .as_ref()
        .map(|rel| {
            let found = entries.iter().find(|e| &e.path == rel);
            serde_json::json!({
                "path": rel,
                "tracked": tracked,
                "staged": found.map(|e| e.staged.clone()).unwrap_or_else(|| ".".into()),
                "worktree": found.map(|e| e.worktree.clone()).unwrap_or_else(|| ".".into()),
                "kind": found.map(|e| e.kind.clone()).unwrap_or_else(|| "ordinary".into()),
            })
        })
        .unwrap_or(serde_json::Value::Null);
    let who = identity(&place.dir);
    serde_json::json!({
        "ok": true,
        "git": version(),
        "root": root.to_string_lossy().replace('\\', "/"),
        "branch": branch.name,
        "head": branch.head,
        "upstream": branch.upstream,
        "ahead": branch.ahead,
        "behind": branch.behind,
        "detached": branch.detached,
        "merging": merging,
        "files": entries,
        "this": this,
        "who": who,
        "scope": asked.scope.clone().unwrap_or_else(|| "file".into()),
    })
    .to_string()
}

/// Who git will record as the author, or `null` when it has not been told.
///
/// Asked because the alternative is the writer's first commit failing with
/// git's own nine-line lecture about `user.email`, in English, in a drawer.
/// The panel offers the two fields instead, and this is what tells it to.
fn identity(dir: &Path) -> serde_json::Value {
    let get = |key: &str| {
        git_run(dir, &["config", "--get", key])
            .ok()
            .filter(|r| r.ok)
            .map(|r| r.out.trim().to_string())
            .filter(|s| !s.is_empty())
    };
    match (get("user.name"), get("user.email")) {
        (Some(name), Some(email)) => serde_json::json!({ "name": name, "email": email }),
        _ => serde_json::Value::Null,
    }
}

/// git could not be started at all — which is one of exactly two things.
fn started_wrong(e: String) -> String {
    if e == "no-git" {
        return refuse(
            "גיט אינו מותקן במחשב הזה",
            "git is not installed on this machine — Ksav drives the git you already have, \
             so that its history and yours are the same history",
        );
    }
    error_json(&e)
}

// ---------------------------------------------------------------- history

fn log(place: &Place, asked: &Asked) -> String {
    let limit = asked.limit.unwrap_or(50).clamp(1, 500).to_string();
    let mut args: Vec<&str> = vec![
        "log",
        "--max-count",
        &limit,
        "--format=%H%x1f%h%x1f%an%x1f%ae%x1f%at%x1f%D%x1f%s%x1e",
    ];
    // A history *of this sefer* by default. `--follow` so that renaming a
    // document does not end its history at the rename, which is the single most
    // common way a writer loses sight of their own work.
    let rel = place.rel.clone().unwrap_or_default();
    if asked.scope.as_deref() != Some("repo") && !rel.is_empty() {
        args.push("--follow");
        args.push("--");
        args.push(&rel);
    }
    let run = match git_run(&place.dir, &args) {
        Ok(r) => r,
        Err(e) => return started_wrong(e),
    };
    if !run.ok {
        // An empty repository has no HEAD, and `git log` calls that a fatal
        // error. It is not one to a reader: there are no commits yet.
        if run.message().contains("does not have any commits") {
            return serde_json::json!({ "ok": true, "commits": [] }).to_string();
        }
        return error_json(&run.message());
    }
    serde_json::json!({ "ok": true, "commits": read_log(&run.out) }).to_string()
}

/// The `%x1f`/`%x1e` record format, read.
///
/// Two separators nobody can type rather than newlines: a commit subject is
/// free text written by a writer, and every character a reader can put in one —
/// including a tab, a `|`, and the whole of Hebrew — has to survive the trip.
fn read_log(text: &str) -> Vec<serde_json::Value> {
    text.split('\u{1e}')
        .map(str::trim)
        .filter(|r| !r.is_empty())
        .filter_map(|record| {
            let f: Vec<&str> = record.split('\u{1f}').collect();
            if f.len() < 7 {
                return None;
            }
            Some(serde_json::json!({
                "hash": f[0],
                "short": f[1],
                "author": f[2],
                "email": f[3],
                "when": f[4].parse::<i64>().unwrap_or(0),
                "refs": f[5],
                "subject": f[6],
            }))
        })
        .collect()
}

/// This document, as it was at that commit.
///
/// The bytes and nothing else: comparing them with what is on screen is
/// `diff.ts`'s job, and it already does it for the snapshot history. A second
/// diff — `git diff`'s unified text, parsed back into hunks — would be a second
/// opinion about what changed in a document, shown in the same application, in
/// two panels, to one reader.
fn show(place: &Place, asked: &Asked) -> String {
    let (Some(rel), Some(rev)) = (place.rel.as_ref(), asked.rev.as_deref()) else {
        return refuse(
            "לא נמסרה גרסה להצגה",
            "no revision was given to show, or the document is not inside the repository",
        );
    };
    if let Err(e) = plain(rev, "revision") {
        return e;
    }
    let spec = format!("{rev}:{rel}");
    match git_run(&place.dir, &["show", &spec]) {
        Ok(r) if r.ok => serde_json::json!({ "ok": true, "text": r.out }).to_string(),
        Ok(r) => error_json(&r.message()),
        Err(e) => started_wrong(e),
    }
}

// ---------------------------------------------------------------- writing

fn init(place: &Place) -> String {
    if place.root.is_some() {
        return refuse(
            "התיקייה כבר נמצאת במאגר",
            "this folder is already inside a repository",
        );
    }
    match git_run(&place.dir, &["init"]) {
        Ok(r) if r.ok => serde_json::json!({ "ok": true, "said": r.message() }).to_string(),
        Ok(r) => error_json(&r.message()),
        Err(e) => started_wrong(e),
    }
}

fn commit(place: &Place, asked: &Asked) -> String {
    let Some(message) = asked
        .message
        .as_deref()
        .map(str::trim)
        .filter(|m| !m.is_empty())
    else {
        return refuse(
            "אין הודעה לרשומה",
            "a commit needs a message — it is the only part of it a person reads",
        );
    };
    if message.contains('\0') {
        return refuse("ההודעה מכילה תו שאינו חוקי", "the message contains a NUL");
    }
    let staged = if asked.all {
        git_run(&place.dir, &["add", "--all"])
    } else {
        let Some(rel) = place.rel.as_deref() else {
            return refuse(
                "המסמך אינו בתוך המאגר",
                "the document is not inside the repository",
            );
        };
        git_run(&place.dir, &["add", "--", rel])
    };
    match staged {
        Ok(r) if !r.ok => return error_json(&r.message()),
        Err(e) => return started_wrong(e),
        _ => {}
    }
    match git_run(&place.dir, &["commit", "-m", message]) {
        Ok(r) if r.ok => {
            let hash = git_run(&place.dir, &["rev-parse", "HEAD"])
                .ok()
                .filter(|r| r.ok)
                .map(|r| r.out.trim().to_string());
            serde_json::json!({ "ok": true, "hash": hash, "said": r.message() }).to_string()
        }
        Ok(r) => error_json(&r.message()),
        Err(e) => started_wrong(e),
    }
}

/// Tell this repository who is writing.
fn who(place: &Place, asked: &Asked) -> String {
    let (Some(name), Some(email)) = (asked.name.as_deref(), asked.email.as_deref()) else {
        return refuse(
            "חסר שם או דוא\"ל",
            "both a name and an email address are needed",
        );
    };
    for (key, value) in [("user.name", name), ("user.email", email)] {
        if value.trim().is_empty() || value.contains('\n') {
            return refuse(
                "שם או דוא\"ל שאינם תקינים",
                "that name or address cannot be used",
            );
        }
        // `--local`, deliberately. Ksav sets the identity for *this sefer's*
        // repository and never touches the writer's global git configuration,
        // which belongs to them and to every other repository on the machine.
        match git_run(&place.dir, &["config", "--local", key, value]) {
            Ok(r) if !r.ok => return error_json(&r.message()),
            Err(e) => return started_wrong(e),
            _ => {}
        }
    }
    serde_json::json!({ "ok": true }).to_string()
}

/// Put this document back the way it was at a commit — in the working tree only.
///
/// Not a commit and not `git revert`: the file on disk changes and nothing else
/// does, so the writer can look at it, keep writing, and decide. `revert` below
/// is the other operation and is named for what git calls it.
fn restore(place: &Place, asked: &Asked) -> String {
    let (Some(rel), Some(rev)) = (place.rel.as_ref(), asked.rev.as_deref()) else {
        return refuse(
            "לא נמסרה גרסה לשחזור",
            "no revision was given to restore from",
        );
    };
    if let Err(e) = plain(rev, "revision") {
        return e;
    }
    match git_run(&place.dir, &["restore", "--source", rev, "--", rel]) {
        Ok(r) if r.ok => serde_json::json!({ "ok": true }).to_string(),
        Ok(r) => error_json(&r.message()),
        Err(e) => started_wrong(e),
    }
}

/// A new commit that undoes an old one — git's own `revert`, and the whole
/// repository rather than this document.
fn revert(place: &Place, asked: &Asked) -> String {
    let Some(rev) = asked.rev.as_deref() else {
        return refuse("לא נמסרה רשומה לביטול", "no commit was given to revert");
    };
    if let Err(e) = plain(rev, "revision") {
        return e;
    }
    match git_run(&place.dir, &["revert", "--no-edit", rev]) {
        Ok(r) if r.ok => serde_json::json!({ "ok": true, "said": r.message() }).to_string(),
        Ok(r) => error_json(&r.message()),
        Err(e) => started_wrong(e),
    }
}

// ---------------------------------------------------------------- branches

fn branches(place: &Place) -> String {
    let run = match git_run(
        &place.dir,
        &[
            "for-each-ref",
            "--format=%(refname:short)%1f%(upstream:short)%1f%(HEAD)%1f%(objectname:short)%1f%(contents:subject)",
            "refs/heads",
        ],
    ) {
        Ok(r) => r,
        Err(e) => return started_wrong(e),
    };
    if !run.ok {
        return error_json(&run.message());
    }
    let list: Vec<serde_json::Value> = run
        .out
        .lines()
        .filter(|l| !l.trim().is_empty())
        .map(|line| {
            let f: Vec<&str> = line.split('\u{1f}').collect();
            serde_json::json!({
                "name": f.first().copied().unwrap_or(""),
                "upstream": f.get(1).copied().filter(|s| !s.is_empty()),
                "current": f.get(2).copied() == Some("*"),
                "short": f.get(3).copied().unwrap_or(""),
                "subject": f.get(4).copied().unwrap_or(""),
            })
        })
        .collect();
    serde_json::json!({ "ok": true, "branches": list }).to_string()
}

fn switch(place: &Place, asked: &Asked) -> String {
    let Some(name) = asked.name.as_deref() else {
        return refuse("לא נמסר שם ענף", "no branch name was given");
    };
    if let Err(e) = plain(name, "branch name") {
        return e;
    }
    let args: Vec<&str> = if asked.create {
        vec!["switch", "--create", name]
    } else {
        vec!["switch", name]
    };
    match git_run(&place.dir, &args) {
        Ok(r) if r.ok => serde_json::json!({ "ok": true, "said": r.message() }).to_string(),
        Ok(r) => error_json(&r.message()),
        Err(e) => started_wrong(e),
    }
}

/// Bring another branch into this one.
///
/// The answer distinguishes the three endings a reader has to tell apart, and
/// the third one is why: a merge that stops with conflicts is **not a failure**
/// — git did exactly what it was asked, the repository is now mid-merge, and
/// the writer has work to do. Reporting it as an error is how a drawer tells
/// somebody their merge did not happen while their file is full of markers.
fn merge(place: &Place, asked: &Asked) -> String {
    let Some(name) = asked.name.as_deref() else {
        return refuse("לא נמסר ענף למיזוג", "no branch was given to merge");
    };
    if let Err(e) = plain(name, "branch name") {
        return e;
    }
    let run = match git_run(&place.dir, &["merge", "--no-edit", name]) {
        Ok(r) => r,
        Err(e) => return started_wrong(e),
    };
    if run.ok {
        return serde_json::json!({ "ok": true, "merged": true, "conflicts": [], "said": run.message() })
            .to_string();
    }
    let conflicts = conflicted(place);
    if conflicts.is_empty() {
        return error_json(&run.message());
    }
    serde_json::json!({
        "ok": true,
        "merged": false,
        "conflicts": conflicts,
        "said": run.message(),
    })
    .to_string()
}

fn conflicted(place: &Place) -> Vec<String> {
    git_run(
        &place.dir,
        &["diff", "--name-only", "--diff-filter=U", "-z"],
    )
    .ok()
    .filter(|r| r.ok)
    .map(|r| {
        r.out
            .split('\0')
            .filter(|s| !s.is_empty())
            .map(str::to_string)
            .collect()
    })
    .unwrap_or_default()
}

fn merge_abort(place: &Place) -> String {
    match git_run(&place.dir, &["merge", "--abort"]) {
        Ok(r) if r.ok => serde_json::json!({ "ok": true }).to_string(),
        Ok(r) => error_json(&r.message()),
        Err(e) => started_wrong(e),
    }
}

/// Settle one conflicted document by taking one side of it whole.
fn resolve(place: &Place, asked: &Asked) -> String {
    let Some(rel) = place.rel.as_deref() else {
        return refuse(
            "המסמך אינו בתוך המאגר",
            "the document is not inside the repository",
        );
    };
    let flag = match asked.side.as_deref() {
        Some("ours") => "--ours",
        Some("theirs") => "--theirs",
        _ => {
            return refuse(
                "לא נמסר צד ליישוב הסתירה",
                "a conflict is settled by taking one side: ours or theirs",
            )
        }
    };
    match git_run(&place.dir, &["checkout", flag, "--", rel]) {
        Ok(r) if !r.ok => return error_json(&r.message()),
        Err(e) => return started_wrong(e),
        _ => {}
    }
    match git_run(&place.dir, &["add", "--", rel]) {
        Ok(r) if r.ok => serde_json::json!({ "ok": true }).to_string(),
        Ok(r) => error_json(&r.message()),
        Err(e) => started_wrong(e),
    }
}

// ---------------------------------------------------------------- remotes

fn remotes(place: &Place) -> String {
    let run = match git_run(&place.dir, &["remote", "--verbose"]) {
        Ok(r) => r,
        Err(e) => return started_wrong(e),
    };
    if !run.ok {
        return error_json(&run.message());
    }
    // "origin\thttps://…(fetch)" twice per remote; one row each is what a
    // reader wants, and the fetch URL is the one that names the place.
    let mut list: Vec<serde_json::Value> = Vec::new();
    for line in run.out.lines() {
        let Some((name, rest)) = line.split_once('\t') else {
            continue;
        };
        if !rest.ends_with("(fetch)") {
            continue;
        }
        let url = rest.trim_end_matches("(fetch)").trim();
        list.push(serde_json::json!({ "name": name, "url": url }));
    }
    serde_json::json!({ "ok": true, "remotes": list }).to_string()
}

fn remote_add(place: &Place, asked: &Asked) -> String {
    let (Some(name), Some(url)) = (asked.name.as_deref(), asked.url.as_deref()) else {
        return refuse("חסר שם או כתובת", "a remote needs a name and an address");
    };
    if let Err(e) = plain(name, "remote name") {
        return e;
    }
    if let Err(e) = plain(url, "remote address") {
        return e;
    }
    match git_run(&place.dir, &["remote", "add", name, url]) {
        Ok(r) if r.ok => serde_json::json!({ "ok": true }).to_string(),
        Ok(r) => error_json(&r.message()),
        Err(e) => started_wrong(e),
    }
}

/// `fetch`, `pull` and `push` — the three that leave the machine.
///
/// One function, because they differ in a verb and in one flag and are
/// identical in everything that matters here: they can take a minute, they can
/// fail for reasons that belong to a host rather than to Ksav, and the host's
/// own sentence is the only useful thing to show. Rephrasing *"Permission
/// denied (publickey)"* into something friendlier is how a reader loses the one
/// string they could have searched for.
fn network(place: &Place, asked: &Asked, verb: &str) -> String {
    let remote = asked.remote.as_deref().unwrap_or("origin");
    if let Err(e) = plain(remote, "remote name") {
        return e;
    }
    let mut args: Vec<&str> = vec![verb];
    if verb == "push" && asked.set_upstream {
        args.push("--set-upstream");
    }
    args.push(remote);
    if let Some(branch) = asked.branch.as_deref() {
        if let Err(e) = plain(branch, "branch name") {
            return e;
        }
        args.push(branch);
    }
    match git_run(&place.dir, &args) {
        Ok(r) if r.ok => serde_json::json!({ "ok": true, "said": r.message() }).to_string(),
        Ok(r) => error_json(&r.message()),
        Err(e) => started_wrong(e),
    }
}

// ---------------------------------------------------------------- the service

/// Every operation, behind one name.
///
/// One service rather than seventeen, and the registry's own taste says so:
/// `mekoros` carries a `search` flag under the comment *"one service rather
/// than two, because it is one question with two endings"*. This is one
/// question — *what does git say about this document* — with seventeen, and
/// every one of them shares the same precondition, the same locate step and the
/// same three ways of being unavailable. Seventeen rows would be seventeen HTTP
/// routes and seventeen entries in a generated union for one capability that a
/// build either has or does not.
pub fn git_request(body: &str) -> String {
    let Ok(asked) = serde_json::from_str::<Asked>(body) else {
        return refuse(
            "הבקשה אינה מכילה נתיב מסמך",
            "the request carries no document path",
        );
    };
    // `version` before `locate`, because *there is no git* has to be answerable
    // for a document in a folder that is not a repository, which is the state
    // every reader starts in.
    if version().is_none() {
        return started_wrong("no-git".to_string());
    }
    let place = match locate(&asked.path) {
        Ok(p) => p,
        Err(e) => return e,
    };
    // Everything below `init` needs a repository, and saying which is missing
    // is the difference between an offer and a dead drawer.
    if place.root.is_none() && !matches!(asked.op.as_str(), "status" | "init") {
        return refuse(
            "המסמך אינו נמצא במאגר גיט",
            "this document is not inside a git repository yet",
        );
    }
    match asked.op.as_str() {
        "status" => status(&place, &asked),
        "init" => init(&place),
        "log" => log(&place, &asked),
        "show" => show(&place, &asked),
        "commit" => commit(&place, &asked),
        "who" => who(&place, &asked),
        "restore" => restore(&place, &asked),
        "revert" => revert(&place, &asked),
        "branches" => branches(&place),
        "switch" => switch(&place, &asked),
        "merge" => merge(&place, &asked),
        "merge-abort" => merge_abort(&place),
        "resolve" => resolve(&place, &asked),
        "remotes" => remotes(&place),
        "remote-add" => remote_add(&place, &asked),
        "fetch" => network(&place, &asked, "fetch"),
        "pull" => network(&place, &asked, "pull"),
        "push" => network(&place, &asked, "push"),
        other => refuse(
            &format!("אין פעולת גיט בשם {other}"),
            &format!("no git operation named {other}"),
        ),
    }
}

/// The list of operations, for the client's generated union and for the tests
/// that hold the two in step.
///
/// The same argument `services::SERVICES` makes one level up: a client that
/// keeps its own copy of what the engine can be asked for is a client that
/// drifts, and every drift in this repository's history has been silent.
pub const OPERATIONS: &[&str] = &[
    "status",
    "init",
    "log",
    "show",
    "commit",
    "who",
    "restore",
    "revert",
    "branches",
    "switch",
    "merge",
    "merge-abort",
    "resolve",
    "remotes",
    "remote-add",
    "fetch",
    "pull",
    "push",
];

#[cfg(test)]
mod tests {
    use super::*;

    /// Every test below drives a real git.
    ///
    /// Not guarded with a skip, and that is deliberate: this crate's manifest
    /// resolves four dependencies **from git**, so `cargo test` cannot have
    /// reached this file on a machine without one. A skip here would be a test
    /// that quietly proves nothing on exactly the machines where it can run.
    fn git_is_here() -> String {
        version().expect("cargo could not have fetched this crate's dependencies without a git")
    }

    struct Repo(PathBuf);

    impl Repo {
        /// A repository in a fresh temporary directory, with an identity and a
        /// branch name that do not depend on the machine's git configuration.
        fn new(tag: &str) -> Repo {
            git_is_here();
            let dir = std::env::temp_dir().join(format!(
                "ksav-git-{tag}-{}-{:?}",
                std::process::id(),
                std::thread::current().id()
            ));
            let _ = std::fs::remove_dir_all(&dir);
            std::fs::create_dir_all(&dir).unwrap();
            let r = git_run(&dir, &["init", "--initial-branch=main"]).unwrap();
            assert!(r.ok, "{}", r.message());
            for (k, v) in [
                ("user.name", "Ksav Test"),
                ("user.email", "test@ksav.invalid"),
            ] {
                assert!(git_run(&dir, &["config", "--local", k, v]).unwrap().ok);
            }
            Repo(dir)
        }

        /// The document this repository is about — Hebrew-named on purpose.
        fn doc(&self) -> PathBuf {
            self.0.join("ברכות.ksav")
        }

        fn write(&self, text: &str) {
            std::fs::write(self.doc(), text).unwrap();
        }

        /// The document on disk, with its line endings normalised.
        ///
        /// Every test that reads a *checked-out* document uses this, because
        /// `core.autocrlf` decides what the endings are and it is the writer's
        /// setting rather than this module's — see
        /// `a_checkout_leaves_line_endings_to_the_repository_config`, which is
        /// the one test that looks at them on purpose.
        fn body(&self) -> String {
            std::fs::read_to_string(self.doc())
                .unwrap()
                .replace("\r\n", "\n")
        }

        fn ask(&self, body: serde_json::Value) -> serde_json::Value {
            let mut body = body;
            body["path"] = serde_json::json!(self.doc().to_string_lossy());
            serde_json::from_str(&git_request(&body.to_string())).unwrap()
        }
    }

    impl Drop for Repo {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn a_folder_that_is_not_a_repository_says_so_and_can_become_one() {
        let repo = Repo::new("init");
        // Take the repository away again: this test is about the state every
        // reader starts in.
        std::fs::remove_dir_all(repo.0.join(".git")).unwrap();
        repo.write("שלום");

        let before = repo.ask(serde_json::json!({ "op": "status" }));
        assert_eq!(before["ok"], true);
        assert!(before["root"].is_null(), "{before}");
        assert!(before["git"].is_string(), "the version has to be reported");

        // And every other operation refuses *with the reason*, rather than
        // failing with git's own "not a git repository" three levels down.
        let log = repo.ask(serde_json::json!({ "op": "log" }));
        assert_eq!(log["ok"], false);
        assert!(
            log["error"]
                .as_str()
                .unwrap()
                .contains("not inside a git repository"),
            "{log}"
        );

        assert_eq!(repo.ask(serde_json::json!({ "op": "init" }))["ok"], true);
        let after = repo.ask(serde_json::json!({ "op": "status" }));
        assert!(after["root"].is_string(), "{after}");
    }

    /// The first minute of a repository: made, and holding nothing.
    ///
    /// `git log` calls an empty repository a **fatal error** — "does not have
    /// any commits yet" — and it is not one to a reader who has just pressed
    /// *Make one here*. Untested until this was written, and the branch that
    /// answers it is one string match away from being wrong forever.
    #[test]
    fn a_repository_with_no_commits_has_an_empty_history_and_not_an_error() {
        let repo = Repo::new("empty");
        repo.write("התחלה");

        let log = repo.ask(serde_json::json!({ "op": "log" }));
        assert_eq!(log["ok"], true, "an empty history is not a failure: {log}");
        assert_eq!(log["commits"].as_array().unwrap().len(), 0, "{log}");

        // …and the same repository can still say where it is. `status` on a
        // branch with no commits has no `branch.oid` and no `branch.ab`, which
        // is a shape the porcelain reader has to survive.
        let st = repo.ask(serde_json::json!({ "op": "status" }));
        assert_eq!(st["ok"], true, "{st}");
        assert_eq!(st["branch"], "main", "{st}");
        assert_eq!(st["this"]["tracked"], false, "{st}");
        assert_eq!(st["files"].as_array().unwrap().len(), 1, "{st}");

        // And there are no branches to list yet, which is also not an error:
        // the first branch is made by the first commit.
        let branches = repo.ask(serde_json::json!({ "op": "branches" }));
        assert_eq!(branches["ok"], true, "{branches}");
        assert_eq!(
            branches["branches"].as_array().unwrap().len(),
            0,
            "{branches}"
        );
    }

    /// The other first-minute state: git has not been told who is writing.
    ///
    /// Without this the writer's first commit fails with git's own nine-line
    /// lecture about `user.email`, in English, in a drawer. The panel offers two
    /// fields instead, and `status` is what tells it to.
    #[test]
    fn git_can_be_told_who_is_writing_and_only_for_this_repository() {
        let repo = Repo::new("who");
        // Take the identity the fixture set, so this starts where a reader does.
        assert!(
            git_run(&repo.0, &["config", "--local", "--unset", "user.name"])
                .unwrap()
                .ok
        );
        assert!(
            git_run(&repo.0, &["config", "--local", "--unset", "user.email"])
                .unwrap()
                .ok
        );
        repo.write("א");

        // `who` is null only when git cannot answer at all — on a machine with a
        // global identity configured it will still find one, and that is the
        // correct answer rather than a hole. Both readings are asserted against
        // what git itself says, so this test means the same thing on a fresh
        // runner and on a developer's machine.
        let global = git_run(&repo.0, &["config", "--get", "user.email"])
            .unwrap()
            .out
            .trim()
            .to_string();
        let st = repo.ask(serde_json::json!({ "op": "status" }));
        if global.is_empty() {
            assert!(st["who"].is_null(), "nobody is configured: {st}");
        } else {
            assert_eq!(st["who"]["email"], global, "{st}");
        }

        let told = repo.ask(serde_json::json!({
            "op": "who", "name": "רב פלוני", "email": "ploni@ksav.invalid"
        }));
        assert_eq!(told["ok"], true, "{told}");

        let st = repo.ask(serde_json::json!({ "op": "status" }));
        assert_eq!(st["who"]["name"], "רב פלוני", "{st}");
        assert_eq!(st["who"]["email"], "ploni@ksav.invalid", "{st}");

        // `--local`: the writer's own git configuration belongs to them and to
        // every other repository on the machine, and Ksav does not touch it.
        let local = git_run(&repo.0, &["config", "--local", "--get", "user.email"]).unwrap();
        assert_eq!(local.out.trim(), "ploni@ksav.invalid");

        // And the commit it exists to make possible actually goes through, under
        // that name.
        assert_eq!(
            repo.ask(serde_json::json!({ "op": "commit", "message": "ראשון" }))["ok"],
            true
        );
        let log = repo.ask(serde_json::json!({ "op": "log" }));
        assert_eq!(log["commits"][0]["author"], "רב פלוני", "{log}");

        // Half an identity is refused before git is asked, because git's own
        // refusal for this is the lecture.
        let half = repo.ask(serde_json::json!({ "op": "who", "name": "רק שם" }));
        assert_eq!(half["ok"], false, "{half}");
        assert!(
            half["error"]
                .as_str()
                .unwrap()
                .contains("name and an email"),
            "{half}"
        );
    }

    /// The whole reason the porcelain is read with `-z` and `quotepath` off.
    #[test]
    fn a_hebrew_named_sefer_comes_back_spelled_the_way_it_was_written() {
        let repo = Repo::new("hebrew");
        repo.write("א");
        let st = repo.ask(serde_json::json!({ "op": "status" }));
        let files = st["files"].as_array().unwrap();
        assert_eq!(files.len(), 1, "{st}");
        assert_eq!(files[0]["path"], "ברכות.ksav");
        assert_eq!(files[0]["kind"], "untracked");
        assert_eq!(st["this"]["path"], "ברכות.ksav");
        assert_eq!(st["this"]["tracked"], false);
    }

    #[test]
    fn a_commit_is_recorded_and_shows_up_in_the_history_with_its_hebrew_message() {
        let repo = Repo::new("commit");
        repo.write("סימן א");
        let made = repo.ask(serde_json::json!({ "op": "commit", "message": "פרק ראשון" }));
        assert_eq!(made["ok"], true, "{made}");
        assert!(made["hash"].as_str().unwrap().len() >= 40, "{made}");

        let log = repo.ask(serde_json::json!({ "op": "log" }));
        let commits = log["commits"].as_array().unwrap();
        assert_eq!(commits.len(), 1, "{log}");
        assert_eq!(commits[0]["subject"], "פרק ראשון");
        assert_eq!(commits[0]["author"], "Ksav Test");
        assert!(commits[0]["when"].as_i64().unwrap() > 0);

        // And now the file is tracked and clean.
        let st = repo.ask(serde_json::json!({ "op": "status" }));
        assert_eq!(st["this"]["tracked"], true, "{st}");
        assert_eq!(st["this"]["staged"], ".");
        assert_eq!(st["this"]["worktree"], ".");
        assert_eq!(st["branch"], "main");
        assert!(st["who"]["email"] == "test@ksav.invalid", "{st}");
    }

    /// A commit with no message is refused before git is asked, because git's
    /// own refusal is a paragraph about editors.
    #[test]
    fn a_commit_with_nothing_written_on_it_is_refused_in_words() {
        let repo = Repo::new("nomsg");
        repo.write("א");
        let out = repo.ask(serde_json::json!({ "op": "commit", "message": "   " }));
        assert_eq!(out["ok"], false);
        assert!(
            out["error"].as_str().unwrap().contains("needs a message"),
            "{out}"
        );
    }

    /// `show` hands back bytes, and `restore` puts them on disk. Neither is a
    /// diff: the comparison is `diff.ts`, once, for both histories.
    #[test]
    fn an_old_version_can_be_read_and_put_back() {
        let repo = Repo::new("restore");
        repo.write("הנוסח הראשון");
        repo.ask(serde_json::json!({ "op": "commit", "message": "one" }));
        repo.write("הנוסח השני");
        repo.ask(serde_json::json!({ "op": "commit", "message": "two" }));

        let log = repo.ask(serde_json::json!({ "op": "log" }));
        let first = log["commits"].as_array().unwrap()[1]["hash"]
            .as_str()
            .unwrap()
            .to_string();

        let shown = repo.ask(serde_json::json!({ "op": "show", "rev": first }));
        assert_eq!(shown["ok"], true, "{shown}");
        assert_eq!(shown["text"], "הנוסח הראשון");

        let back = repo.ask(serde_json::json!({ "op": "restore", "rev": first }));
        assert_eq!(back["ok"], true, "{back}");
        assert_eq!(repo.body(), "הנוסח הראשון");
        // The working tree changed and nothing was committed — which is the
        // whole difference between this and `revert`.
        let st = repo.ask(serde_json::json!({ "op": "status" }));
        assert_eq!(st["this"]["worktree"], "M", "{st}");
    }

    #[test]
    fn a_rename_keeps_the_history_and_reports_where_it_came_from() {
        let repo = Repo::new("rename");
        repo.write("גוף");
        repo.ask(serde_json::json!({ "op": "commit", "message": "one" }));
        let moved = repo.0.join("שבת.ksav");
        std::fs::rename(repo.doc(), &moved).unwrap();
        assert!(git_run(&repo.0, &["add", "--all"]).unwrap().ok);

        let body = serde_json::json!({ "op": "status", "path": moved.to_string_lossy() });
        let st: serde_json::Value = serde_json::from_str(&git_request(&body.to_string())).unwrap();
        let files = st["files"].as_array().unwrap();
        assert_eq!(files.len(), 1, "{st}");
        assert_eq!(files[0]["kind"], "renamed", "{st}");
        assert_eq!(files[0]["path"], "שבת.ksav");
        // The extra NUL field the v2 rename record carries. A reader that
        // misses it reports the old name as a second, non-existent file.
        assert_eq!(files[0]["from"], "ברכות.ksav", "{st}");

        // `--follow`, so renaming a sefer does not end its history. Committed
        // first, because a rename git has not recorded yet is not one it can
        // follow — under the new name the document has no past at all.
        let body = serde_json::json!({
            "op": "commit", "message": "renamed", "path": moved.to_string_lossy()
        });
        let made: serde_json::Value =
            serde_json::from_str(&git_request(&body.to_string())).unwrap();
        assert_eq!(made["ok"], true, "{made}");

        let body = serde_json::json!({ "op": "log", "path": moved.to_string_lossy() });
        let log: serde_json::Value = serde_json::from_str(&git_request(&body.to_string())).unwrap();
        let subjects: Vec<&str> = log["commits"]
            .as_array()
            .unwrap()
            .iter()
            .map(|c| c["subject"].as_str().unwrap())
            .collect();
        assert_eq!(
            subjects,
            ["renamed", "one"],
            "the history did not survive the rename: {log}"
        );
    }

    /// What git does to a document's line endings is the writer's git's
    /// business, and Ksav does not overrule it.
    ///
    /// On Windows, Git for Windows installs `core.autocrlf=true`, so a document
    /// written with `\n` comes back out of a checkout with `\r\n`. It is
    /// tempting to pass `-c core.autocrlf=false` on every invocation here and
    /// keep the bytes — and that would be exactly the disagreement this module
    /// exists to prevent: `git restore` in a terminal, in the same repository,
    /// two minutes later, would produce a different file than Ksav's Restore
    /// button. One repository, one behaviour, whichever behaviour the writer
    /// configured.
    ///
    /// Recorded as a test rather than left to be discovered, because it *is* a
    /// change to a sefer and somebody will one day ask where it came from.
    #[test]
    fn a_checkout_leaves_line_endings_to_the_repository_config() {
        let repo = Repo::new("eol");
        repo.write("א\nב\n");
        repo.ask(serde_json::json!({ "op": "commit", "message": "one" }));
        repo.write("changed");
        repo.ask(serde_json::json!({ "op": "restore", "rev": "HEAD" }));
        let back = std::fs::read_to_string(repo.doc()).unwrap();
        let converts = git_run(&repo.0, &["config", "--get", "core.autocrlf"])
            .unwrap()
            .out
            .trim()
            .eq_ignore_ascii_case("true");
        assert_eq!(
            back,
            if converts { "א\r\nב\r\n" } else { "א\nב\n" },
            "the restored document must match what this repository's git is set to do"
        );
    }

    #[test]
    fn branches_can_be_made_switched_and_listed() {
        let repo = Repo::new("branch");
        repo.write("א");
        repo.ask(serde_json::json!({ "op": "commit", "message": "one" }));

        assert_eq!(
            repo.ask(serde_json::json!({ "op": "switch", "name": "hagahos", "create": true }))
                ["ok"],
            true
        );
        let list = repo.ask(serde_json::json!({ "op": "branches" }));
        let names: Vec<&str> = list["branches"]
            .as_array()
            .unwrap()
            .iter()
            .map(|b| b["name"].as_str().unwrap())
            .collect();
        assert!(
            names.contains(&"main") && names.contains(&"hagahos"),
            "{list}"
        );
        let current: Vec<&str> = list["branches"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|b| b["current"] == true)
            .map(|b| b["name"].as_str().unwrap())
            .collect();
        assert_eq!(current, ["hagahos"], "{list}");
    }

    /// A merge that stops with conflicts is `ok: true, merged: false`.
    ///
    /// It is the third ending, and reporting it as a failure is how a reader is
    /// told nothing happened while their sefer is full of `<<<<<<<`.
    #[test]
    fn a_conflicting_merge_is_reported_as_a_conflict_and_can_be_settled() {
        let repo = Repo::new("merge");
        repo.write("שורה\n");
        repo.ask(serde_json::json!({ "op": "commit", "message": "base" }));

        repo.ask(serde_json::json!({ "op": "switch", "name": "other", "create": true }));
        repo.write("שורה של חברי\n");
        repo.ask(serde_json::json!({ "op": "commit", "message": "theirs" }));

        repo.ask(serde_json::json!({ "op": "switch", "name": "main" }));
        repo.write("שורה שלי\n");
        repo.ask(serde_json::json!({ "op": "commit", "message": "ours" }));

        let out = repo.ask(serde_json::json!({ "op": "merge", "name": "other" }));
        assert_eq!(out["ok"], true, "a stopped merge is not a failure: {out}");
        assert_eq!(out["merged"], false, "{out}");
        assert_eq!(out["conflicts"].as_array().unwrap().len(), 1, "{out}");

        let st = repo.ask(serde_json::json!({ "op": "status" }));
        assert_eq!(st["merging"], true, "{st}");
        assert_eq!(st["this"]["kind"], "unmerged", "{st}");
        // The markers really are in the writer's document. That is what makes
        // announcing this state the whole job.
        assert!(repo.body().contains("<<<<<<<"));

        assert_eq!(
            repo.ask(serde_json::json!({ "op": "resolve", "side": "ours" }))["ok"],
            true
        );
        assert_eq!(repo.body(), "שורה שלי\n");
    }

    #[test]
    fn a_merge_can_be_walked_away_from() {
        let repo = Repo::new("abort");
        repo.write("א\n");
        repo.ask(serde_json::json!({ "op": "commit", "message": "base" }));
        repo.ask(serde_json::json!({ "op": "switch", "name": "other", "create": true }));
        repo.write("ב\n");
        repo.ask(serde_json::json!({ "op": "commit", "message": "theirs" }));
        repo.ask(serde_json::json!({ "op": "switch", "name": "main" }));
        repo.write("ג\n");
        repo.ask(serde_json::json!({ "op": "commit", "message": "ours" }));
        repo.ask(serde_json::json!({ "op": "merge", "name": "other" }));

        assert_eq!(
            repo.ask(serde_json::json!({ "op": "merge-abort" }))["ok"],
            true
        );
        let st = repo.ask(serde_json::json!({ "op": "status" }));
        assert_eq!(st["merging"], false, "{st}");
        assert_eq!(repo.body(), "ג\n");
    }

    /// A second repository standing in for a host, so push and its counters are
    /// exercised without a network.
    #[test]
    fn a_remote_can_be_added_pushed_to_and_counted_against() {
        let repo = Repo::new("remote");
        let bare = repo.0.with_extension("bare");
        let _ = std::fs::remove_dir_all(&bare);
        std::fs::create_dir_all(&bare).unwrap();
        assert!(
            git_run(&bare, &["init", "--bare", "--initial-branch=main"])
                .unwrap()
                .ok
        );

        repo.write("א");
        repo.ask(serde_json::json!({ "op": "commit", "message": "one" }));

        let url = bare.to_string_lossy().replace('\\', "/");
        assert_eq!(
            repo.ask(serde_json::json!({ "op": "remote-add", "name": "origin", "url": url }))["ok"],
            true
        );
        let list = repo.ask(serde_json::json!({ "op": "remotes" }));
        assert_eq!(list["remotes"].as_array().unwrap().len(), 1, "{list}");
        assert_eq!(list["remotes"][0]["name"], "origin");

        let pushed = repo.ask(serde_json::json!({
            "op": "push", "remote": "origin", "branch": "main", "set_upstream": true
        }));
        assert_eq!(pushed["ok"], true, "{pushed}");

        let st = repo.ask(serde_json::json!({ "op": "status" }));
        assert_eq!(st["upstream"], "origin/main", "{st}");
        assert_eq!(st["ahead"], 0, "{st}");
        assert_eq!(st["behind"], 0, "{st}");

        repo.write("ב");
        repo.ask(serde_json::json!({ "op": "commit", "message": "two" }));
        let st = repo.ask(serde_json::json!({ "op": "status" }));
        assert_eq!(st["ahead"], 1, "{st}");

        assert_eq!(repo.ask(serde_json::json!({ "op": "fetch" }))["ok"], true);
        let _ = std::fs::remove_dir_all(&bare);
    }

    /// Rule 2 of the four at the top of this file.
    ///
    /// `--upload-pack=…` is a legal branch name and an arbitrary command on the
    /// other end of a fetch. Refused before git is started, by the shape of the
    /// word rather than by a list of the options that happen to be dangerous
    /// this year.
    #[test]
    fn a_word_that_could_be_an_option_is_refused() {
        let repo = Repo::new("option");
        repo.write("א");
        repo.ask(serde_json::json!({ "op": "commit", "message": "one" }));

        for body in [
            serde_json::json!({ "op": "switch", "name": "--upload-pack=calc" }),
            serde_json::json!({ "op": "merge", "name": "-x" }),
            serde_json::json!({ "op": "show", "rev": "--output=/tmp/x" }),
            serde_json::json!({ "op": "restore", "rev": "-f" }),
            serde_json::json!({ "op": "revert", "rev": "--edit" }),
            serde_json::json!({ "op": "push", "remote": "--exec=calc" }),
            serde_json::json!({ "op": "remote-add", "name": "-n", "url": "https://x" }),
            serde_json::json!({ "op": "remote-add", "name": "ok", "url": "--upload-pack=calc" }),
        ] {
            let out = repo.ask(body.clone());
            assert_eq!(out["ok"], false, "{body} was not refused");
            assert!(
                out["error"]
                    .as_str()
                    .unwrap()
                    .contains("cannot begin with a dash"),
                "{body} → {out}"
            );
        }
    }

    #[test]
    fn an_operation_nobody_named_is_a_stated_refusal() {
        let repo = Repo::new("nosuch");
        repo.write("א");
        let out = repo.ask(serde_json::json!({ "op": "nonesuch" }));
        assert_eq!(out["ok"], false);
        assert!(
            out["error"]
                .as_str()
                .unwrap()
                .contains("no git operation named nonesuch"),
            "{out}"
        );
    }

    /// The list the client generates from, against the list the service
    /// actually answers. A name in one and not the other is a dead button.
    #[test]
    fn every_named_operation_is_answered() {
        let repo = Repo::new("ops");
        repo.write("א");
        repo.ask(serde_json::json!({ "op": "commit", "message": "one" }));
        for op in OPERATIONS {
            let out = repo.ask(serde_json::json!({ "op": op }));
            let said = out["error"].as_str().unwrap_or_default().to_string();
            assert!(
                !said.contains("no git operation named"),
                "{op} is in OPERATIONS and the service does not answer it"
            );
        }
    }

    /// A document one directory down is addressed by its path inside the
    /// repository, and a document reached through a *differently spelled* path
    /// to the same directory is the same document.
    ///
    /// The second half is the one that caught the first draft. Every repository
    /// in these tests lives under `std::env::temp_dir()`, which on Windows is
    /// the 8.3 short name `C:\Users\ADMINI~1\…`, and git answers with the long
    /// one — so a `strip_prefix` against `--show-toplevel` found no common
    /// prefix and reported that the document was outside its own repository.
    /// Nine tests failed at once and every one of them blamed something else.
    #[test]
    fn a_document_is_addressed_by_where_it_sits_however_the_path_was_spelled() {
        let repo = Repo::new("place");
        let sub = repo.0.join("חלק א");
        std::fs::create_dir_all(&sub).unwrap();
        let deep = sub.join("ברכות.ksav");
        std::fs::write(&deep, "א").unwrap();

        let place = locate(&deep.to_string_lossy()).unwrap();
        assert_eq!(
            place.rel.as_deref(),
            Some("חלק א/ברכות.ksav"),
            "a path inside the repository, from its root"
        );
        assert!(place.root.is_some());

        // The same file, addressed through the path the operating system's own
        // temporary directory hands out, whatever spelling that is.
        let long = std::fs::canonicalize(&deep).unwrap();
        let long = long
            .to_string_lossy()
            .trim_start_matches(r"\\?\")
            .to_string();
        let other = locate(&long).unwrap();
        assert_eq!(other.rel, place.rel, "{long} and {deep:?} are one document");
    }

    /// The porcelain reader, on the records `git status` actually emits — held
    /// separately from a repository so the shapes are readable.
    #[test]
    fn the_porcelain_reader_keeps_its_place_across_a_rename() {
        let text = "# branch.oid abc123\0# branch.head main\0# branch.upstream origin/main\0\
                    # branch.ab +2 -1\0\
                    1 .M N... 100644 100644 100644 aaa bbb ברכות.ksav\0\
                    2 R. N... 100644 100644 100644 ccc ddd R100 שבת.ksav\0מועד.ksav\0\
                    ? חדש.ksav\0";
        let (entries, branch) = read_status(text);
        assert_eq!(branch.name.as_deref(), Some("main"));
        assert_eq!(branch.upstream.as_deref(), Some("origin/main"));
        assert_eq!((branch.ahead, branch.behind), (2, 1));
        assert!(!branch.detached);
        assert_eq!(
            entries.len(),
            3,
            "the rename's old name is not a fourth file"
        );
        assert_eq!(entries[0].path, "ברכות.ksav");
        assert_eq!(
            (entries[0].staged.as_str(), entries[0].worktree.as_str()),
            (".", "M")
        );
        assert_eq!(entries[1].path, "שבת.ksav");
        assert_eq!(entries[1].from.as_deref(), Some("מועד.ksav"));
        assert_eq!(entries[2].path, "חדש.ksav");
        assert_eq!(entries[2].kind, "untracked");
    }

    #[test]
    fn a_detached_head_is_read_as_one() {
        let (_, branch) = read_status("# branch.oid abc\0# branch.head (detached)\0");
        assert!(branch.detached);
        assert!(branch.name.is_none());
    }

    /// Every character a writer can put in a commit message survives, which is
    /// why the record separators are two nobody can type.
    #[test]
    fn a_commit_subject_may_contain_anything_a_writer_types() {
        let text = "aaa\u{1f}aa\u{1f}Name\u{1f}e@x\u{1f}1700000000\u{1f}HEAD -> main\u{1f}\
                    א | ב\tג \"ד\" -e\u{1e}";
        let got = read_log(text);
        assert_eq!(got.len(), 1);
        assert_eq!(got[0]["subject"], "א | ב\tג \"ד\" -e");
        assert_eq!(got[0]["refs"], "HEAD -> main");
        assert_eq!(got[0]["when"], 1700000000);
    }

    /// Rule 3: no invocation may reach a state where git waits for a human.
    ///
    /// Asserted on the source of this file rather than on a run, because the
    /// failure it guards against is a *missing* line, and a run that does not
    /// hang proves only that the host it ran against did not ask.
    #[test]
    fn no_git_invocation_can_stop_and_ask_for_a_password() {
        let src = include_str!("git.rs");
        // One place in the whole file that starts git, so there is one place
        // these can be missing from.
        //
        // The needle is built rather than written, because a test that looks
        // for a literal in its own file finds itself: spelled out, this counted
        // two and failed against the module it was passing judgement on.
        let starts_git = format!("Command::new({:?})", "git");
        assert_eq!(
            src.matches(&starts_git).count(),
            1,
            "a second place that starts git is a second place to forget the environment below"
        );
        for needed in [
            "GIT_TERMINAL_PROMPT",
            "GIT_ASKPASS",
            "SSH_ASKPASS",
            "BatchMode=yes",
            "GCM_INTERACTIVE",
            "credential.interactive=false",
            "core.quotepath=false",
        ] {
            assert!(
                src.contains(needed),
                "{needed} is not set on the git invocation"
            );
        }
        assert!(
            src.contains("Stdio::null()"),
            "git must not inherit a terminal"
        );
    }
}

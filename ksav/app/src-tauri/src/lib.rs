//! Tauri desktop shell for Ksav. The frontend (the same SPA) calls these
//! commands in-process via `invoke` — the real Typst engine runs natively,
//! with no HTTP server.
//!
//! # One command for the engine, and the rest for the machine
//!
//! There used to be thirteen `#[tauri::command]`s wrapping engine functions,
//! each of which also had to be listed a second time in `generate_handler!` —
//! where forgetting it is not a compile error, just a command that is never
//! registered and an `invoke` that rejects at runtime. One of the thirteen,
//! `ksav_girsa_presence`, had never been called by anything at all.
//!
//! They are one now: [`ksav_call`], which looks the name up in
//! `ksav_engine::services` — the same registry the HTTP server routes from and
//! the wasm binding exports through. A service added to that table is reachable
//! from the desktop app without this file changing.
//!
//! The commands that remain are the ones that are genuinely *this shell's*:
//! native dialogs, real files, and the writer's dictionary on disk. Those have
//! no engine service behind them and could not have one — they are what having
//! an installed application means.
//!
//! # Why expensive work is `async` and spawns
//!
//! Tauri runs a plain `#[tauri::command] fn` **on the main thread**, which is
//! the thread that draws the window. Compiling, spell-checking and suggesting
//! were declared that way while the two file dialogs beside them were correctly
//! `async`, so the distinction had been understood and simply not applied to the
//! calls that cost anything. Measured compile times are 0.4–2.9 s for 13–43
//! pages, and the editor compiles on every pause in typing — so the window froze
//! for up to three seconds, repeatedly, in the build that ships as the flagship
//! installer.
//!
//! `async fn` alone is not enough either: an async command runs on the async
//! runtime, and Typst layout is CPU-bound work that would occupy a runtime
//! worker for its whole duration. It hands off to `spawn_blocking`, which is
//! what that pool is for. Which calls need it is [`Cost`] on the service rather
//! than a decision taken again per command — that is what got it wrong before.

/// Who owns `ksav://`. Its own module because the rule is worth arguing with
/// away from a `setup` closure — see the table in its header.
mod scheme;

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use ksav_engine::services::{self, Cost};

/// Run CPU-bound engine work off both the UI thread and the async runtime.
async fn offload<F, T>(f: F) -> Result<T, String>
where
    F: FnOnce() -> T + Send + 'static,
    T: Send + 'static,
{
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| format!("engine task failed: {e}"))
}

/// Where the user dictionary lives (B29).
///
/// > *"The user dictionary lives in one browser profile — invisible to the
/// > desktop app, gone if the profile is cleared."*
///
/// A plain newline-separated file, in the format `Lexicon::add_words` already
/// reads and the browser already exports. `KSAV_DICTIONARY` overrides it, which
/// is how a writer puts theirs in Dropbox or in git beside their seforim — the
/// thing the order asks for, since a word list is not worth inventing an account
/// system over.
fn dictionary_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    if let Ok(set) = std::env::var("KSAV_DICTIONARY") {
        if !set.trim().is_empty() {
            return Ok(PathBuf::from(set));
        }
    }
    let dir = tauri::Manager::path(app)
        .app_data_dir()
        .map_err(|e| format!("no place to keep a dictionary: {e}"))?;
    Ok(dir.join("dictionary.txt"))
}

/// The writer's own words, from the file.
///
/// A missing file is an **empty dictionary, not an error**: every writer starts
/// with one and a desktop app that refused to spell-check until a file existed
/// would be absurd.
#[tauri::command]
fn ksav_dictionary_read(app: tauri::AppHandle) -> Result<String, String> {
    let path = dictionary_path(&app)?;
    match std::fs::read_to_string(&path) {
        Ok(text) => Ok(text),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
        Err(e) => Err(format!("{}: {e}", path.display())),
    }
}

/// Write it back.
///
/// Beside and renamed over, like every other file this project rewrites in place:
/// a machine that stops mid-write must cost the last word added, not the zman's
/// worth of them.
#[tauri::command]
fn ksav_dictionary_write(app: tauri::AppHandle, contents: String) -> Result<(), String> {
    let path = dictionary_path(&app)?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| format!("{}: {e}", dir.display()))?;
    }
    let temp = path.with_extension("writing");
    std::fs::write(&temp, contents).map_err(|e| format!("{}: {e}", temp.display()))?;
    std::fs::rename(&temp, &path).map_err(|e| format!("{}: {e}", path.display()))
}

/// The path, so the window can tell the writer where their words are.
///
/// Shown rather than hidden: a file you cannot find is not a file you own, and
/// backing it up or symlinking it is the whole point of it being a file.
#[tauri::command]
fn ksav_dictionary_where(app: tauri::AppHandle) -> Result<String, String> {
    Ok(dictionary_path(&app)?.display().to_string())
}

/// Call an engine service by name — the whole engine, in one command.
///
/// The name and the JSON are the same ones the HTTP build puts in a URL and a
/// request body, and the same ones the browser build passes to the wasm export:
/// three transports, one contract, one registry. `input` is empty for the
/// services that take nothing, exactly as a `GET` carries no body.
///
/// A name with no service behind it is a rejected `invoke` with the name in it,
/// which is what the frontend can act on. It should be unreachable — the only
/// thing that produces these strings is the generated table both sides read.
#[tauri::command]
async fn ksav_call(name: String, input: String) -> Result<String, String> {
    let Some(svc) = services::find(&name) else {
        return Err(format!("no engine service named {name}"));
    };
    match svc.cost {
        // Laying out a document, checking a page of Hebrew, waiting on the
        // loopback: none of that belongs on the thread that draws the window.
        Cost::Layout | Cost::Work => offload(move || (svc.call)(&input)).await,
        // A registry read or a queue drain. Going through the blocking pool for
        // these would cost more in scheduling than the work itself.
        Cost::Quick => Ok((svc.call)(&input)),
    }
}

/// A file's modification time (ms since the epoch) and size.
///
/// The unit of "did this file change underneath us". `None` for every way it can
/// fail — the file deleted, the path unreadable, a clock the platform will not
/// give — because the caller answers all of them the same way: there is nothing
/// to compare against, so do not claim a conflict.
///
/// Gated on the same allow-list as writing. Metadata is a small thing to leak,
/// but "does /etc/shadow exist and how big is it" is still a question a web view
/// has no business asking, and the gate costs one line.
#[tauri::command]
fn ksav_file_stamp(
    allowed: tauri::State<'_, AllowedPaths>,
    path: String,
) -> Option<serde_json::Value> {
    let p = PathBuf::from(&path);
    if !allowed.permits(&p) {
        return None;
    }
    let meta = std::fs::metadata(&p).ok()?;
    let mtime = meta
        .modified()
        .ok()?
        .duration_since(std::time::UNIX_EPOCH)
        .ok()?
        .as_millis() as u64;
    Some(serde_json::json!({ "mtime": mtime, "size": meta.len() }))
}

/// Read a bound file again, for taking the disk's version after it changed.
///
/// Same allow-list as writing: a path this session chose in a dialog, and
/// nothing else.
#[tauri::command]
async fn ksav_read_file(
    allowed: tauri::State<'_, AllowedPaths>,
    path: String,
) -> Result<String, String> {
    let p = PathBuf::from(&path);
    if !allowed.permits(&p) {
        return Err(format!(
            "refusing to read a path that was not chosen in a dialog: {path}"
        ));
    }
    std::fs::read_to_string(&p).map_err(|e| e.to_string())
}

// ---------------------------------------------------------------- real files
//
// The desktop build writes genuine files on disk. These live in Rust rather than
// as JS plugin calls so the app needs no extra npm packages and no filesystem
// capability grant: the only paths ever touched are ones the user just chose in
// a native dialog.
//
// That invariant used to be enforced by JavaScript convention alone —
// `ksav_write_file` took any path the webview cared to send and wrote to it.
// The webview only ever ran our own code, so it was not exploitable; but "the
// frontend promises to behave" is not a security boundary, and an XSS through a
// pasted document or a future plugin would have turned it into arbitrary file
// write. The dialogs now record what the user picked, and writes are checked
// against that list at the Rust boundary.

/// Paths the user has chosen in a native dialog this session.
#[derive(Default)]
struct AllowedPaths(Mutex<HashSet<PathBuf>>);

impl AllowedPaths {
    fn allow(&self, path: &Path) {
        if let Ok(mut set) = self.0.lock() {
            set.insert(normalize(path));
        }
    }

    fn permits(&self, path: &Path) -> bool {
        self.0
            .lock()
            .map(|set| set.contains(&normalize(path)))
            .unwrap_or(false)
    }
}

/// Resolve a path to the form the allow-list is keyed on.
///
/// `canonicalize` where the file exists — which defeats `..` traversal and
/// symlink games — and the path as given where it does not, because Save-As
/// names a file that is not there yet.
fn normalize(path: &Path) -> PathBuf {
    std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf())
}

/// The loopback desk, held where something can let go of it.
///
/// It used to be held by `std::mem::forget`, directly beneath a comment reading
/// *"dropping it is what withdraws the endpoint file, which is how Girsa stops
/// offering to send the moment this window closes"*. `mem::forget` is the
/// guarantee that the drop will never run, so the sentence described a mechanism
/// the line below it had disabled.
///
/// Measured before this changed: close every Ksav window the ordinary way, and
/// `ksav-endpoint.json` is still on disk naming a dead pid. Girsa reads that file
/// to find us, so *every* ordinary close looked from over there like a crash —
/// its presence chip saying **"כְּתָב is registered but not answering — it may
/// have closed badly"**. `Presence::Stale` exists for the crash case and had
/// quietly become Ksav's permanent state.
///
/// `Option`, because withdrawing is `None`: taking the desk out is what drops it,
/// and `Desk::drop` unblocks the listener and removes the endpoint file in that
/// order. See `run`, where the exit that does it lives.
#[derive(Default)]
struct DeskHold(Mutex<Option<girsa_post::desk::Desk>>);

/// One URL from the operating system, turned into a source waiting in the inbox.
///
/// The single place a `ksav://` URL becomes an arrival, and deliberately so:
/// three different things hand a URL to this application — the argv that started
/// it, the argv a second instance forwards, and an open-url event from the
/// window server — and a source that arrived by one route and not another, or
/// arrived differently, is the failure the whole pairing is built to avoid.
/// `engine/tests/deep_link.rs` holds it to one call site.
fn deliver(url: &str) {
    let Some(girsa_post::Errand::Insert { packet }) =
        girsa_post::deep_link(girsa_post::App::Ksav, url)
    else {
        return;
    };
    if let Err(why) = ksav_engine::post::arrived(&packet) {
        eprintln!("a source arrived and was refused: {why}");
    }
}

/// A file the user picked, with its contents.
#[derive(serde::Serialize)]
struct OpenedFile {
    path: String,
    contents: String,
}

/// Show an Open dialog and read the chosen file. `None` if dismissed.
#[tauri::command]
async fn ksav_open_file(
    app: tauri::AppHandle,
    allowed: tauri::State<'_, AllowedPaths>,
) -> Result<Option<OpenedFile>, String> {
    use tauri_plugin_dialog::DialogExt;
    let (tx, rx) = std::sync::mpsc::channel();
    app.dialog()
        .file()
        .add_filter("Ksav document", &["ksav", "typ", "txt"])
        .pick_file(move |f| {
            let _ = tx.send(f);
        });
    let Some(path) = rx.recv().map_err(|e| e.to_string())? else {
        return Ok(None);
    };
    let path = path.into_path().map_err(|e| e.to_string())?;
    let contents = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    // The user chose it, so plain Save may write back to it later.
    allowed.allow(&path);
    Ok(Some(OpenedFile {
        path: path.to_string_lossy().to_string(),
        contents,
    }))
}

/// Show a Save-As dialog, write there, and return the chosen path.
#[tauri::command]
async fn ksav_save_file(
    app: tauri::AppHandle,
    allowed: tauri::State<'_, AllowedPaths>,
    suggested: String,
    contents: String,
) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let (tx, rx) = std::sync::mpsc::channel();
    app.dialog()
        .file()
        .add_filter("Ksav document", &["ksav"])
        .set_file_name(&suggested)
        .save_file(move |f| {
            let _ = tx.send(f);
        });
    let Some(path) = rx.recv().map_err(|e| e.to_string())? else {
        return Ok(None);
    };
    let path = path.into_path().map_err(|e| e.to_string())?;
    std::fs::write(&path, contents).map_err(|e| e.to_string())?;
    // Recorded after the write, so the entry keys on the file that now exists.
    allowed.allow(&path);
    Ok(Some(path.to_string_lossy().to_string()))
}

/// Overwrite an already-chosen file — this is what plain Save does.
///
/// Refuses any path the user has not picked in a dialog this session. A writer
/// who reopens the app and presses Ctrl+S on a document bound to a file from
/// last time gets the Save-As dialog rather than a silent write, which is the
/// same thing the browser build does with a stale handle.
#[tauri::command]
async fn ksav_write_file(
    allowed: tauri::State<'_, AllowedPaths>,
    path: String,
    contents: String,
) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if !allowed.permits(&p) {
        return Err(format!(
            "refusing to write to a path that was not chosen in a dialog: {path}"
        ));
    }
    std::fs::write(&p, contents).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let built = tauri::Builder::default();

    // **First**, before every other plugin, because this is the one that decides
    // whether this process is going to be an application at all — the second
    // instance sends its argv and exits from inside this plugin's setup, so
    // nothing below it runs twice.
    //
    // Measured with Ksav already open: `ksav://insert?packet=…` started a second
    // Ksav. The deep-link listener below was never wrong; on Windows and Linux
    // it only ever hears a *cold* start, and delivering a URL to a running
    // process is this plugin's job. What that cost was two things, and the
    // second is the one that outlives the packet: `post::INBOX` is process-local
    // so the source waited in the wrong window, and `Desk::open` republishes the
    // endpoint file, so the duplicate took the pairing over — every later send
    // from Girsa going to it, over the loopback as much as over `ksav://`, and
    // Girsa reporting Ksav absent the moment the duplicate closed. See the note
    // in `Cargo.toml`.
    //
    // With the plugin's `deep-link` feature the forwarded argv reaches the
    // listener wired below, so there is one delivery path and not two.
    #[cfg(any(windows, target_os = "linux"))]
    let built = built.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
        // The URL routes itself. What is left is the part a writer notices: the
        // window they already had may be behind the document they were reading
        // when they pressed send, and a source that silently landed in a hidden
        // window looks exactly like a source that never arrived.
        use tauri::Manager as _;
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.unminimize();
            let _ = window.show();
            let _ = window.set_focus();
        }
    }));

    let built = built
        .plugin(tauri_plugin_dialog::init())
        .manage(AllowedPaths::default())
        .manage(DeskHold::default())
        // `ksav://insert?packet=…`, and the pairing with Girsa (spec.md §10.6).
        .plugin(tauri_plugin_deep_link::init())
        .setup(|app| {
            use tauri::Manager as _;

            // The loopback desk. A failure here costs the pairing and not the
            // editor: Ksav is a writing application first, and without it the
            // only thing that stops working is being handed a source.
            match ksav_engine::post::open_desk(env!("CARGO_PKG_VERSION")) {
                Ok(desk) => {
                    // Held for the life of the process, and — the part that is
                    // new — let go of when the process ends. This used to be
                    // `std::mem::forget(desk)`, which kept it alive by making
                    // the drop unreachable. See `DeskHold` and the exit in
                    // `run`.
                    if let Ok(mut hold) = app.state::<DeskHold>().0.lock() {
                        *hold = Some(desk);
                    }
                }
                Err(e) => eprintln!("the Girsa pairing is not open: {e}"),
            }

            #[cfg(any(windows, target_os = "linux"))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                // Claimed when it is free or stale, never taken from a copy that
                // is still there. `register_all` used to run here on every start,
                // which made the most recently launched build the owner — and on
                // the machine of anybody working on this, that is a `cargo run`
                // out of `target/debug`. See `scheme.rs` for the table.
                let me = tauri::utils::platform::current_exe().unwrap_or_default();
                let marker = app
                    .path()
                    .app_data_dir()
                    .map(|d| crate::scheme::marker_path(&d))
                    .unwrap_or_default();
                let handler = app.deep_link().is_registered("ksav").unwrap_or(false);
                let claim = crate::scheme::decide(
                    handler,
                    crate::scheme::read_marker(&marker).as_deref(),
                    &me,
                    &|p| p.exists(),
                );
                match &claim {
                    crate::scheme::Claim::Ours => {
                        let _ = crate::scheme::write_marker(&marker, &me);
                    }
                    crate::scheme::Claim::Vacant | crate::scheme::Claim::Stale { .. } => {
                        if let crate::scheme::Claim::Stale { was } = &claim {
                            eprintln!(
                                "ksav:// was registered to {}, which is gone — taking it back",
                                was.display()
                            );
                        }
                        if let Err(e) = app.deep_link().register_all() {
                            eprintln!("could not register ksav:// with the system: {e}");
                        } else {
                            let _ = crate::scheme::write_marker(&marker, &me);
                        }
                    }
                    // Said rather than done. A pairing that changes owner in
                    // silence is the whole of this finding, and a line here is
                    // the difference between "Girsa opens the wrong Ksav" and
                    // "Girsa opens the Ksav that claimed the scheme, which is
                    // this one, and here is its path".
                    crate::scheme::Claim::Theirs { owner } => eprintln!(
                        "ksav:// belongs to {} — leaving it. Sources sent from Girsa will open that one.",
                        owner.display()
                    ),
                }
                // The URL that *started* this process, which on these platforms
                // arrives in argv and does not raise an open-url event at all.
                //
                // Measured before this was here: with nothing running, firing a
                // `ksav://insert` URL opened Ksav and the inbox file was never
                // written — the source was dropped on the floor by the one
                // route that was supposed to be the whole feature. The listener
                // below is for a URL arriving at a process that is already up;
                // this is for the one that brought it up, and the two hand to
                // the same place so a source cannot arrive twice or differently.
                //
                // macOS is not here on purpose: it delivers through the app
                // delegate, which does raise the event, so asking as well would
                // insert the same quote twice.
                match app.deep_link().get_current() {
                    Ok(Some(urls)) => {
                        for url in urls {
                            deliver(url.as_str());
                        }
                    }
                    Ok(None) => {}
                    Err(e) => eprintln!("could not read the URL Ksav was started with: {e}"),
                }
            }
            tauri_plugin_deep_link::DeepLinkExt::deep_link(app).on_open_url(|event| {
                for url in event.urls() {
                    deliver(url.as_str());
                }
            });

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        // Twenty-one entries, of which thirteen were engine services listed
        // here by hand and one of those had no caller anywhere. What is left is
        // the engine, once, and the things only an installed application can do.
        .invoke_handler(tauri::generate_handler![
            ksav_call,
            ksav_file_stamp,
            ksav_read_file,
            ksav_open_file,
            ksav_save_file,
            ksav_write_file,
            ksav_dictionary_read,
            ksav_dictionary_write,
            ksav_dictionary_where
        ])
        // `build` and then `run(callback)`, where this used to be
        // `run(context)`.
        //
        // The difference is that `run(context)` takes no callback, and on
        // Windows it never returns — the event loop calls `exit()` — so nothing
        // managed is ever dropped and there is no moment at which this
        // application can be told it is stopping. That is the only reason the
        // desk was held by `mem::forget`: there was nowhere to let go of it.
        // Here is that moment.
        .build(tauri::generate_context!());

    match built {
        Ok(app) => app.run(|handle, event| {
            if matches!(event, tauri::RunEvent::Exit) {
                // Taking the desk out is what drops it, and `Desk::drop`
                // unblocks the listener and withdraws `ksav-endpoint.json` — in
                // that order, which is the crate's own rule about which of the
                // two may outlive the other.
                //
                // Girsa reads that file to find us. Until this ran, every
                // ordinary close left it behind naming a dead pid, so Girsa's
                // presence chip reported a crash — "registered but not
                // answering, it may have closed badly" — for every close a
                // writer has ever performed.
                use tauri::Manager as _;
                if let Some(hold) = handle.try_state::<DeskHold>() {
                    if let Ok(mut desk) = hold.0.lock() {
                        *desk = None;
                    }
                }
            }
        }),
        Err(e) => {
            // A sentence somebody can act on rather than a panic message. Every
            // other refusal in this shell is legible; the one path that can only
            // stop should be too.
            eprintln!("Ksav could not open its window: {e}");
            std::process::exit(1);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_path_the_user_never_chose_is_refused() {
        let allowed = AllowedPaths::default();
        assert!(!allowed.permits(Path::new("C:/Windows/System32/drivers/etc/hosts")));
        assert!(!allowed.permits(Path::new("/etc/passwd")));
    }

    #[test]
    fn a_path_the_user_chose_is_permitted() {
        let dir = std::env::temp_dir().join("ksav-allowlist-test");
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("sefer.ksav");
        std::fs::write(&file, "").unwrap();
        let allowed = AllowedPaths::default();
        allowed.allow(&file);
        assert!(allowed.permits(&file));
        // …and only that one.
        assert!(!allowed.permits(&dir.join("other.ksav")));
        let _ = std::fs::remove_file(&file);
    }

    #[test]
    fn traversal_does_not_reach_a_path_that_was_never_chosen() {
        // `chosen/../secret` normalizes to `secret`, which is not on the list.
        let dir = std::env::temp_dir().join("ksav-allowlist-traversal");
        std::fs::create_dir_all(&dir).unwrap();
        let chosen = dir.join("chosen.ksav");
        let secret = dir.join("secret.ksav");
        std::fs::write(&chosen, "").unwrap();
        std::fs::write(&secret, "").unwrap();
        let allowed = AllowedPaths::default();
        allowed.allow(&chosen);
        assert!(!allowed.permits(&dir.join("sub").join("..").join("secret.ksav")));
        let _ = std::fs::remove_file(&chosen);
        let _ = std::fs::remove_file(&secret);
    }
}

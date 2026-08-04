//! Tauri desktop shell for Ksav. The frontend (the same SPA) calls these
//! commands in-process via `invoke` — the real Typst engine runs natively,
//! with no HTTP server.
//!
//! # Why every expensive command is `async` and spawns
//!
//! Tauri runs a plain `#[tauri::command] fn` **on the main thread**, which is
//! the thread that draws the window. `ksav_compile`, `ksav_spell` and
//! `ksav_suggest` were declared that way while the two file dialogs beside them
//! were correctly `async`, so the distinction had been understood and simply not
//! applied to the calls that cost anything. Measured compile times are 0.4–2.9 s
//! for 13–43 pages, and the editor compiles on every pause in typing — so the
//! window froze for up to three seconds, repeatedly, in the build that ships as
//! the flagship installer.
//!
//! `async fn` alone is not enough either: an async command runs on the async
//! runtime, and Typst layout is CPU-bound work that would occupy a runtime
//! worker for its whole duration. Each one hands off to `spawn_blocking`, which
//! is what that pool is for.

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

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

/// Compile a document. Input/output JSON match the web `/compile` contract.
#[tauri::command]
async fn ksav_compile(input: String) -> Result<String, String> {
    offload(move || ksav_engine::compile_request(&input)).await
}

/// A click on the page, as a place in the source. Matches the web `/jump`.
///
/// Offloaded like a compile, and for the same reason: answering means laying the
/// document out, so running it on the main thread would freeze the window for
/// exactly as long as a compile does.
#[tauri::command]
async fn ksav_jump(input: String) -> Result<String, String> {
    offload(move || ksav_engine::jump::jump_request(&input)).await
}

/// The cursor, as a place on the page. Matches the web `/reveal`.
#[tauri::command]
async fn ksav_reveal(input: String) -> Result<String, String> {
    offload(move || ksav_engine::jump::reveal_request(&input)).await
}

/// The command registry as JSON.
/// Sources that arrived from Girsa while this window was open (spec.md §10.6).
///
/// Polled by the editor, because the editor is where a cursor is: nothing on
/// this side of the process knows where the writer is typing, and a helpful
/// insertion at the end of the document is a source landing somewhere nobody
/// asked for. Draining, so two windows cannot each insert the same quote.
#[tauri::command]
fn ksav_inbox() -> String {
    ksav_engine::post::drain_json()
}

/// Cite-on-selection (spec.md §10.4): ask Girsa where a phrase is from.
///
/// Forwarded, not answered: the question is about the corpus, and the corpus
/// is the library's. What comes back is Girsa's own JSON, unchanged.
#[tauri::command]
async fn ksav_mekoros(phrase: String, except: Option<String>) -> Result<String, String> {
    offload(move || {
        ksav_engine::post::where_from(&phrase, except.as_deref())
            .unwrap_or_else(|why| serde_json::json!({ "error": why }).to_string())
    })
    .await
}

/// Nothing fitted — put the phrase in Girsa's search and bring it up.
#[tauri::command]
async fn ksav_search_in_girsa(phrase: String) -> Result<String, String> {
    offload(move || match ksav_engine::post::search_in_girsa(&phrase) {
        Ok(()) => r#"{"opened":true}"#.to_string(),
        Err(why) => serde_json::json!({ "error": why }).to_string(),
    })
    .await
}

/// Turn the citations in a piece of prose into live refs (spec.md §10.5).
///
/// Girsa finds them; `girsa-ksav` writes them. Only what is certain is touched.
#[tauri::command]
async fn ksav_linkify(text: String) -> Result<String, String> {
    offload(move || match ksav_engine::post::linkify(&text) {
        Ok(text) => serde_json::json!({ "text": text }).to_string(),
        Err(why) => serde_json::json!({ "error": why }).to_string(),
    })
    .await
}

/// Whether the library is there, so nothing is offered that would fail.
#[tauri::command]
fn ksav_girsa_presence() -> String {
    serde_json::to_string(&ksav_engine::post::girsa()).unwrap_or_else(|_| "{}".to_string())
}

#[tauri::command]
fn ksav_commands() -> String {
    ksav_engine::commands::commands_json()
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
fn ksav_file_stamp(allowed: tauri::State<'_, AllowedPaths>, path: String) -> Option<serde_json::Value> {
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

/// The sefer catalogue as JSON, for citation autocomplete.
#[tauri::command]
fn ksav_sefarim() -> String {
    ksav_engine::sefarim::catalog_json()
}

/// The template registry as JSON.
#[tauri::command]
fn ksav_templates() -> String {
    ksav_engine::templates::templates_json()
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

/// Spell-check text. Input/output JSON match the web `/spell` contract.
#[tauri::command]
async fn ksav_spell(input: String) -> Result<String, String> {
    offload(move || ksav_engine::spell::spell_request(&input)).await
}

/// Suggestions for one word. Matches the web `/suggest` contract.
#[tauri::command]
async fn ksav_suggest(input: String) -> Result<String, String> {
    offload(move || ksav_engine::spell::suggest_request(&input)).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AllowedPaths::default())
        // `ksav://insert?packet=…`, and the pairing with Girsa (spec.md §10.6).
        .plugin(tauri_plugin_deep_link::init())
        .setup(|app| {
            // The loopback desk. A failure here costs the pairing and not the
            // editor: Ksav is a writing application first, and without it the
            // only thing that stops working is being handed a source.
            match ksav_engine::post::open_desk(env!("CARGO_PKG_VERSION")) {
                Ok(desk) => {
                    // Kept for the life of the process: dropping it is what
                    // withdraws the endpoint file, which is how Girsa stops
                    // offering to send the moment this window closes.
                    std::mem::forget(desk);
                }
                Err(e) => eprintln!("the Girsa pairing is not open: {e}"),
            }

            #[cfg(any(windows, target_os = "linux"))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                if let Err(e) = app.deep_link().register_all() {
                    eprintln!("could not register ksav:// with the system: {e}");
                }
            }
            tauri_plugin_deep_link::DeepLinkExt::deep_link(app).on_open_url(|event| {
                for url in event.urls() {
                    if let Some(girsa_post::Errand::Insert { packet }) =
                        girsa_post::deep_link(girsa_post::App::Ksav, url.as_str())
                    {
                        if let Err(why) = ksav_engine::post::arrived(&packet) {
                            eprintln!("a source arrived and was refused: {why}");
                        }
                    }
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
        .invoke_handler(tauri::generate_handler![
            ksav_compile,
            ksav_jump,
            ksav_reveal,
            ksav_commands,
            ksav_sefarim,
            ksav_file_stamp,
            ksav_read_file,
            ksav_templates,
            ksav_open_file,
            ksav_save_file,
            ksav_write_file,
            ksav_spell,
            ksav_suggest,
            ksav_inbox,
            ksav_mekoros,
            ksav_search_in_girsa,
            ksav_girsa_presence,
            ksav_linkify,
            ksav_dictionary_read,
            ksav_dictionary_write,
            ksav_dictionary_where
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
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

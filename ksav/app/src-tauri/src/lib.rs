//! Tauri desktop shell for Ksav. The frontend (the same SPA) calls these
//! commands in-process via `invoke` — the real Typst engine runs natively,
//! with no HTTP server.

/// Compile a document. Input/output JSON match the web `/compile` contract.
#[tauri::command]
fn ksav_compile(input: String) -> String {
    ksav_engine::compile_request(&input)
}

/// The command registry as JSON.
#[tauri::command]
fn ksav_commands() -> String {
    ksav_engine::commands::commands_json()
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

/// A file the user picked, with its contents.
#[derive(serde::Serialize)]
struct OpenedFile {
    path: String,
    contents: String,
}

/// Show an Open dialog and read the chosen file. `None` if dismissed.
#[tauri::command]
async fn ksav_open_file(app: tauri::AppHandle) -> Result<Option<OpenedFile>, String> {
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
    Ok(Some(OpenedFile {
        path: path.to_string_lossy().to_string(),
        contents,
    }))
}

/// Show a Save-As dialog, write there, and return the chosen path.
#[tauri::command]
async fn ksav_save_file(
    app: tauri::AppHandle,
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
    Ok(Some(path.to_string_lossy().to_string()))
}

/// Overwrite an already-chosen file — this is what plain Save does.
#[tauri::command]
fn ksav_write_file(path: String, contents: String) -> Result<(), String> {
    std::fs::write(path, contents).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
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
            ksav_commands,
            ksav_templates,
            ksav_open_file,
            ksav_save_file,
            ksav_write_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

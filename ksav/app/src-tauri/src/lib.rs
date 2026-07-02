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
            ksav_templates
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

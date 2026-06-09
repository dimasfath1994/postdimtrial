// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod request_handler;

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            // Setup log hanya jika di mode debug
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
            request_handler::http_request
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
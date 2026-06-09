// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod request_handler;

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            request_handler::http_request
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
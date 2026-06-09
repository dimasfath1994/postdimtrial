// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// 1. Import module request_handler yang baru kita buat
mod request_handler;

fn main() {
    tauri::Builder::default()
        // 2. Daftarkan command http_request agar bisa dipanggil dari JS
        .invoke_handler(tauri::generate_handler![
            request_handler::http_request
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
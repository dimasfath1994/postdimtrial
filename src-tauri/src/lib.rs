use serde_json::json;

// 1. Definisikan command di sini agar satu paket dengan aplikasi
#[tauri::command]
pub async fn http_request(method: String, url: String) -> Result<serde_json::Value, String> {
    // Untuk mengetes dulu, kita kembalikan respon statis
    Ok(json!({"status": 200, "message": "Berhasil dipanggil dari lib.rs!"}))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
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
    // 2. Daftarkan command di sini
    .invoke_handler(tauri::generate_handler![http_request])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
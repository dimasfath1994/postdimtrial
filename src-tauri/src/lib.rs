use serde_json::json;

// Kita gunakan modul terpisah untuk command agar tidak ter-include dua kali
mod commands {
    use super::*;
    
    #[tauri::command]
    pub async fn http_request(method: String, url: String) -> Result<serde_json::Value, String> {
        Ok(json!({"status": 200, "message": "Berhasil dipanggil dari lib.rs!"}))
    }
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
    // Panggil lewat modul
    .invoke_handler(tauri::generate_handler![commands::http_request])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
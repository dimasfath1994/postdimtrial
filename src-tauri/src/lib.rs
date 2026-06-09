use serde_json::json;
use std::time::{Duration, Instant};
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use reqwest::multipart;

mod commands {
    use super::*;

    #[tauri::command]
    pub async fn http_request(
        method: String,
        url: String,
        headers: Vec<(String, String)>,
        body: Option<serde_json::Value>
    ) -> Result<serde_json::Value, String> {
        
        let client = reqwest::Client::builder()
            .cookie_store(true)
            .redirect(reqwest::redirect::Policy::limited(10))
            .timeout(Duration::from_secs(30))
            .danger_accept_invalid_certs(true)
            .build()
            .map_err(|e| e.to_string())?;

        let mut header_map = HeaderMap::new();
        for (k, v) in headers {
            if let (Ok(key), Ok(val)) = (HeaderName::from_bytes(k.as_bytes()), HeaderValue::from_str(&v)) {
                header_map.insert(key, val);
            }
        }

        let start = Instant::now();
        let mut request = client.request(
            reqwest::Method::from_bytes(method.to_uppercase().as_bytes()).map_err(|_| "Invalid Method")?,
            &url
        ).headers(header_map);

        if let Some(b) = body {
            if b.is_array() {
                let mut form = multipart::Form::new();
                if let Some(items) = b.as_array() {
                    for item in items {
                        let key = item["key"].as_str().unwrap_or("");
                        let val = item["value"].as_str().unwrap_or("");
                        let r#type = item["type"].as_str().unwrap_or("text");

                        if r#type == "file" {
                            let file_content = tokio::fs::read(val).await.map_err(|e| e.to_string())?;
                            let part = multipart::Part::bytes(file_content).file_name(val.split(|c| c == '/' || c == '\\').last().unwrap_or("file").to_string());
                            form = form.part(key.to_string(), part);
                        } else {
                            form = form.text(key.to_string(), val.to_string());
                        }
                    }
                }
                request = request.multipart(form);
            } else {
                request = request.body(b.as_str().unwrap_or(&b.to_string()).to_string());
            }
        }

        let response = request.send().await.map_err(|e| e.to_string())?;
        let duration = start.elapsed().as_millis();
        let status = response.status().as_u16();
        let body_text = response.text().await.map_err(|e| e.to_string())?;
        
        Ok(json!({
            "status": status,
            "body": body_text,
            "time": duration
        }))
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
    .invoke_handler(tauri::generate_handler![commands::http_request])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
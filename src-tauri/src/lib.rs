use serde_json::json;
use std::time::{Duration, Instant};
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use reqwest::multipart;
use tokio;

mod commands {
    use super::*;

    #[tauri::command]
    pub async fn http_request(
        method: String,
        url: String,
        headers: Vec<(String, String)>,
        body: Option<serde_json::Value>
    ) -> Result<serde_json::Value, String> {
        
        // 1. Setup Client
        let client = reqwest::Client::builder()
            .cookie_store(true)
            .redirect(reqwest::redirect::Policy::limited(10))
            .timeout(std::time::Duration::from_secs(30))
            .danger_accept_invalid_certs(true)
            .build()
            .map_err(|e| e.to_string())?;
    
        // 2. Setup Headers
        let mut header_map = reqwest::header::HeaderMap::new();
        for (k, v) in headers {
            if let (Ok(key), Ok(val)) = (
                reqwest::header::HeaderName::from_bytes(k.as_bytes()), 
                reqwest::header::HeaderValue::from_str(&v)
            ) {
                header_map.insert(key, val);
            }
        }
    
        // 3. Prepare Request
        let start = std::time::Instant::now();
        let mut request = client.request(
            reqwest::Method::from_bytes(method.to_uppercase().as_bytes()).map_err(|_| "Invalid Method")?,
            &url
        ).headers(header_map);
    
        // 4. Handle Body
        if let Some(b) = body {
            if b.is_array() {
                let mut form = reqwest::multipart::Form::new();
                if let Some(items) = b.as_array() {
                    for item in items {
                        let key = item["key"].as_str().unwrap_or("");
                        let val = item["value"].as_str().unwrap_or("");
                        let r#type = item["type"].as_str().unwrap_or("text");
    
                        if r#type == "file" {
                            let file_content = tokio::fs::read(val).await.map_err(|e| e.to_string())?;
                            let part = reqwest::multipart::Part::bytes(file_content)
                                .file_name(val.split(|c| c == '/' || c == '\\').last().unwrap_or("file").to_string());
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
    
        // 5. Send Request
        let response = request.send().await.map_err(|e| e.to_string())?;
        
        // 6. Process Response
        let mut res_headers = Vec::new();
        for (name, value) in response.headers() {
            res_headers.push((name.to_string(), value.to_str().unwrap_or("").to_string()));
        }
    
        let duration = start.elapsed().as_millis();
        let status = response.status().as_u16();
        let body_text = response.text().await.map_err(|e| e.to_string())?;
        
        // Hitung size (jumlah bytes dari text body)
        let body_size = body_text.len(); 
        
        // 7. Return Result
        Ok(json!({
            "status": status,
            "body": body_text,
            "time": duration,
            "headers": res_headers,
            "size": body_size  // <-- INI YANG DITAMBAHKAN
        }))
    }


    #[tauri::command]
    pub async fn http_request_collabs(
        method: String,
        url: String,
        headers: Vec<(String, String)>,
        body: serde_json::Value
    ) -> Result<serde_json::Value, String> {
        
        // 1. Setup Client dengan konfigurasi optimal
        let client = reqwest::Client::builder()
            .cookie_store(true)
            .redirect(reqwest::redirect::Policy::limited(10))
            .timeout(std::time::Duration::from_secs(30))
            .danger_accept_invalid_certs(true)
            .build()
            .map_err(|e| format!("Failed to build client: {}", e))?;
    
        // 2. Deteksi Content-Type terlebih dahulu dari frontend
        let mut content_type = String::new();
        for (k, v) in &headers {
            if k.to_lowercase() == "content-type" {
                content_type = v.to_lowercase();
                break;
            }
        }
    
        // Setup Headers (Proteksi khusus untuk Multipart Boundary)
        let mut header_map = reqwest::header::HeaderMap::new();
        for (k, v) in headers {
            // Jika tipenya multipart/form-data, JANGAN masukkan ke header_map secara manual.
            // Kita skip agar reqwest bisa men-generate string boundary otomatis yang valid.
            if k.to_lowercase() == "content-type" && v.to_lowercase().contains("multipart/form-data") {
                continue;
            }
            if let (Ok(key), Ok(val)) = (
                reqwest::header::HeaderName::from_bytes(k.as_bytes()),
                reqwest::header::HeaderValue::from_str(&v)
            ) {
                header_map.insert(key, val);
            }
        }
    
        // 3. Prepare Request Builder
        let start = std::time::Instant::now();
        let request_builder = client.request(
            reqwest::Method::from_bytes(method.to_uppercase().as_bytes()).map_err(|_| "Invalid Method")?,
            &url
        ).headers(header_map);
    
        // 4. Handle Body (Smart & Bulletproof Processing berdasarkan Content-Type)
        let request = if body.is_null() || body.as_object().map_or(false, |obj| obj.is_empty()) {
            request_builder
        } else if content_type.contains("application/x-www-form-urlencoded") {
            if body.is_array() {
                let mut params = Vec::new();
                for item in body.as_array().unwrap() {
                    let key = item["key"].as_str().unwrap_or("");
                    let val = item["value"].as_str().unwrap_or("");
                    params.push((key.to_string(), val.to_string()));
                }
                request_builder.form(&params)
            } else if body.is_object() {
                request_builder.form(&body)
            } else {
                let body_str = body.as_str().unwrap_or(&body.to_string()).to_string();
                request_builder.body(body_str).header("Content-Type", "application/x-www-form-urlencoded")
            }
        } else if content_type.contains("multipart/form-data") || body.is_array() {
            let mut form = reqwest::multipart::Form::new();
            if body.is_array() {
                for item in body.as_array().unwrap() {
                    let key = item["key"].as_str().unwrap_or("");
                    let val = item["value"].as_str().unwrap_or("");
                    let r#type = item["type"].as_str().unwrap_or("text");
    
                    if r#type == "file" && !val.is_empty() {
                        if let Ok(file_content) = tokio::fs::read(val).await {
                            let filename = val.split(|c| c == '/' || c == '\\').last().unwrap_or("file");
                            let part = reqwest::multipart::Part::bytes(file_content)
                                .file_name(filename.to_string());
                            form = form.part(key.to_string(), part);
                        }
                    } else {
                        form = form.text(key.to_string(), val.to_string());
                    }
                }
            }
            request_builder.multipart(form)
        } else if content_type.contains("application/json") {
            if body.is_string() {
                let body_str = body.as_str().unwrap().to_string();
                request_builder.body(body_str).header("Content-Type", "application/json")
            } else {
                request_builder.json(&body)
            }
        } else {
            if body.is_string() {
                let body_str = body.as_str().unwrap().to_string();
                request_builder.body(body_str)
            } else {
                request_builder.json(&body)
            }
        };
    
        // 5. Send & Process Response
        let response = request.send().await.map_err(|e| e.to_string())?;
        
        let mut res_headers = Vec::new();
        for (name, value) in response.headers() {
            res_headers.push((name.to_string(), value.to_str().unwrap_or("").to_string()));
        }
    
        let duration = start.elapsed().as_millis();
        let status = response.status().as_u16();
        let body_text = response.text().await.map_err(|e| e.to_string())?;
        let body_size = body_text.len(); 
    
        Ok(json!({
            "status": status,
            "body": body_text,
            "time": duration,
            "headers": res_headers,
            "size": body_size
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
    .invoke_handler(tauri::generate_handler![commands::http_request, commands::http_request_collabs])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
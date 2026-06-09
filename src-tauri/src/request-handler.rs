use serde::{Deserialize, Serialize};
use serde_json::json;
use std::time::{Duration, Instant};
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use reqwest::multipart;

#[derive(Deserialize)]
struct BodyField {
    key: String,
    value: String,
    r#type: String, // "text" atau "file"
}

#[tauri::command]
pub async fn http_request(
    method: String,
    url: String,
    headers: Vec<(String, String)>,
    body: Option<serde_json::Value> // Kita ubah ke Value untuk menangani JSON atau Multipart
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

    // LOGIKA BODY
    if let Some(b) = body {
        // Cek apakah ini multipart (Array dari field)
        if b.is_array() {
            let mut form = multipart::Form::new();
            for item in b.as_array().unwrap() {
                let key = item["key"].as_str().unwrap_or("");
                let val = item["value"].as_str().unwrap_or("");
                let r#type = item["type"].as_str().unwrap_or("text");

                if r#type == "file" {
                    // Di sini Rust bisa membaca file dari path jika val adalah path
                    // Untuk sekarang kita asumsikan val adalah path file lokal
                    if let Ok(part) = multipart::Part::file(val).await {
                        form = form.part(key.to_string(), part);
                    }
                } else {
                    form = form.text(key.to_string(), val.to_string());
                }
            }
            request = request.multipart(form);
        } else {
            // Raw/JSON body biasa
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
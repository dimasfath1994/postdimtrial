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

    // 1. PENYESUAIAN METHOD: gRPC menggunakan HTTP POST
    let actual_method = if method.to_uppercase() == "GRPC" {
        "POST"
    } else {
        method.as_str()
    };

    let req_method = reqwest::Method::from_bytes(actual_method.to_uppercase().as_bytes())
        .map_err(|_| "Invalid Method")?;

    let start = Instant::now();
    let mut request = client.request(req_method, &url).headers(header_map);

    // 2. LOGIKA BODY (Support Multipart, JSON Object GraphQL/gRPC, & Raw String)
    if let Some(b) = body {
        if b.is_array() {
            // Multipart Form Data (Tetap Aman)
            let mut form = multipart::Form::new();
            for item in b.as_array().unwrap() {
                let key = item["key"].as_str().unwrap_or("");
                let val = item["value"].as_str().unwrap_or("");
                let r#type = item["type"].as_str().unwrap_or("text");

                if r#type == "file" {
                    if let Ok(part) = multipart::Part::file(val).await {
                        form = form.part(key.to_string(), part);
                    }
                } else {
                    form = form.text(key.to_string(), val.to_string());
                }
            }
            request = request.multipart(form);
        } else if b.is_object() {
            // JSON Payload (GraphQL & gRPC): Kirim sebagai JSON & auto-set Content-Type Header
            request = request.json(&b);
        } else if let Some(raw_str) = b.as_str() {
            // Plain String / Raw Body
            request = request.body(raw_str.to_string());
        } else {
            request = request.body(b.to_string());
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
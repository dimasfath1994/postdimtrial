use serde_json::json;
use std::time::Instant;
use tokio;
use base64::{Engine as _, engine::general_purpose};
use tonic_reflection::pb::v1::server_reflection_client::ServerReflectionClient;
use tonic_reflection::pb::v1::ServerReflectionRequest;
use http;
use tokio_stream;

mod commands {
    use super::*;

    // ==========================================
    // EKSISTING (TIDAK DISENGGOL SAMA SEKALI)
    // ==========================================
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
            .timeout(std::time::Duration::from_secs(30))
            .danger_accept_invalid_certs(true)
            .build()
            .map_err(|e| e.to_string())?;
    
        let mut header_map = reqwest::header::HeaderMap::new();
        for (k, v) in headers {
            if let (Ok(key), Ok(val)) = (
                reqwest::header::HeaderName::from_bytes(k.as_bytes()), 
                reqwest::header::HeaderValue::from_str(&v)
            ) {
                header_map.insert(key, val);
            }
        }
    
        let is_grpc = method.to_uppercase() == "GRPC";
        let actual_method = if is_grpc { "POST" } else { method.as_str() };

        if is_grpc && !header_map.contains_key("content-type") {
            header_map.insert(
                reqwest::header::CONTENT_TYPE,
                reqwest::header::HeaderValue::from_static("application/json")
            );
        }

        let req_method = reqwest::Method::from_bytes(actual_method.to_uppercase().as_bytes())
            .map_err(|_| "Invalid Method")?;

        let start = std::time::Instant::now();
        let mut request = client.request(req_method, &url).headers(header_map);
    
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
            } else if b.is_object() {
                request = request.json(&b);
            } else if let Some(s) = b.as_str() {
                if let Ok(json_val) = serde_json::from_str::<serde_json::Value>(s) {
                    request = request.json(&json_val);
                } else {
                    request = request.body(s.to_string());
                }
            } else {
                request = request.body(b.to_string());
            }
        }
    
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

    #[tauri::command]
    pub async fn http_request_collabs(
        method: String,
        url: String,
        headers: Vec<(String, String)>,
        body: serde_json::Value
    ) -> Result<serde_json::Value, String> {
        let client = reqwest::Client::builder()
            .cookie_store(true)
            .redirect(reqwest::redirect::Policy::limited(10))
            .timeout(std::time::Duration::from_secs(30))
            .danger_accept_invalid_certs(true)
            .build()
            .map_err(|e| format!("Failed to build client: {}", e))?;

        let mut content_type = String::new();
        for (k, v) in &headers {
            if k.to_lowercase() == "content-type" {
                content_type = v.to_lowercase();
                break;
            }
        }

        let mut header_map = reqwest::header::HeaderMap::new();
        for (k, v) in headers {
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

        let is_grpc = method.to_uppercase() == "GRPC";
        let actual_method = if is_grpc { "POST" } else { method.as_str() };

        if is_grpc && !header_map.contains_key("content-type") {
            header_map.insert(
                reqwest::header::CONTENT_TYPE,
                reqwest::header::HeaderValue::from_static("application/json")
            );
        }

        let req_method = reqwest::Method::from_bytes(actual_method.to_uppercase().as_bytes())
            .map_err(|_| "Invalid Method")?;

        let start = std::time::Instant::now();
        let request_builder = client.request(req_method, &url).headers(header_map);

        let request = if body.is_null() || body.as_object().map_or(false, |obj| obj.is_empty()) {
            request_builder
        } else if content_type.contains("application/x-www-form-urlencoded") {
            if body.is_array() {
                let mut params = Vec::new();
                for item in body.as_array().unwrap() {
                    params.push((item["key"].as_str().unwrap_or("").to_string(), item["value"].as_str().unwrap_or("").to_string()));
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
                    let file_name = item["file_name"].as_str().unwrap_or("file");
                    let is_path = item["is_path"].as_bool().unwrap_or(false);

                    if r#type == "file" {
                        let mut file_bytes: Vec<u8> = Vec::new();
                        let mut success = false;

                        if is_path {
                            if let Ok(content) = tokio::fs::read(val).await {
                                file_bytes = content;
                                success = true;
                            }
                        } else if let Some(b64_val) = item["file_b64"].as_str() {
                            if let Ok(decoded) = general_purpose::STANDARD.decode(b64_val) {
                                file_bytes = decoded;
                                success = true;
                            }
                        }

                        if success && !file_bytes.is_empty() {
                            let part = reqwest::multipart::Part::bytes(file_bytes).file_name(file_name.to_string());
                            form = form.part(key.to_string(), part);
                        }
                    } else {
                        form = form.text(key.to_string(), val.to_string());
                    }
                }
            }
            request_builder.multipart(form)
        } else {
            if let Some(s) = body.as_str() {
                if let Ok(json_val) = serde_json::from_str::<serde_json::Value>(s) {
                    request_builder.json(&json_val)
                } else {
                    request_builder.body(s.to_string())
                }
            } else {
                request_builder.json(&body)
            }
        };

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

    #[tauri::command]
    pub async fn grpc_request(
        endpoint: String,
        service_method: String,
        payload: serde_json::Value
    ) -> Result<serde_json::Value, String> {
        let start = Instant::now();
        
        let formatted_endpoint = if !endpoint.starts_with("http://") && !endpoint.starts_with("https://") {
            format!("http://{}", endpoint)
        } else {
            endpoint
        };

        let channel = tonic::transport::Channel::from_shared(formatted_endpoint)
            .map_err(|e| format!("Invalid Endpoint URL: {}", e))?
            .connect()
            .await
            .map_err(|e| format!("Failed to connect to gRPC server: {}", e))?;

        let mut client = tonic::client::Grpc::new(channel);

        let body_bytes = serde_json::to_vec(&payload).map_err(|e| e.to_string())?;
        let req = tonic::Request::new(body_bytes);
        
        let path = http::uri::PathAndQuery::from_maybe_shared(service_method)
            .map_err(|_| "Invalid Service/Method path format")?;

        let codec = tonic::codec::ProstCodec::<Vec<u8>, Vec<u8>>::default();
        
        let response = client
            .unary(req, path, codec)
            .await
            .map_err(|status| format!("gRPC Error [Code {}]: {}", status.code(), status.message()))?;

        let duration = start.elapsed().as_millis();
        let res_body_bytes = response.into_inner();
        let res_size = res_body_bytes.len();
        let res_body_str = String::from_utf8_lossy(&res_body_bytes).to_string();

        Ok(json!({
            "status": 200,
            "body": res_body_str,
            "time": duration,
            "headers": [["content-type", "application/grpc"]],
            "size": res_size
        }))
    }

    #[tauri::command]
    pub async fn discover_grpc_services(
        endpoint: String
    ) -> Result<serde_json::Value, String> {
        let clean_endpoint = endpoint
            .trim_start_matches("http://")
            .trim_start_matches("https://")
            .to_string();

        let uri_endpoint = format!("http://{}", clean_endpoint);

        let channel = tonic::transport::Channel::from_shared(uri_endpoint)
            .map_err(|e| format!("Invalid URL: {}", e))?
            .connect()
            .await
            .map_err(|e| format!("Gagal terhubung ke gRPC Server: {}", e))?;

        let mut services_list = Vec::new();

        // 1. Coba Reflection v1 terlebih dahulu
        let mut client_v1 = ServerReflectionClient::new(channel.clone());
        let req_v1 = ServerReflectionRequest {
            host: "".to_string(),
            message_request: Some(
                tonic_reflection::pb::v1::server_reflection_request::MessageRequest::ListServices(
                    "".to_string(),
                ),
            ),
        };

        let v1_success = async {
            let mut stream = client_v1
                .server_reflection_info(tonic::Request::new(tokio_stream::once(req_v1)))
                .await?
                .into_inner();

            while let Some(response) = stream.message().await? {
                if let Some(tonic_reflection::pb::v1::server_reflection_response::MessageResponse::ListServicesResponse(list)) = response.message_response {
                    for svc in list.service {
                        if !svc.name.starts_with("grpc.reflection") {
                            services_list.push(svc.name);
                        }
                    }
                }
            }
            Ok::<(), tonic::Status>(())
        }.await.is_ok() && !services_list.is_empty();

        // 2. Jika v1 gagal atau kosong, fallback ke v1alpha (seperti yang digunakan grpcb.in)
        if !v1_success {
            services_list.clear();
            let mut client_v1alpha = tonic_reflection::pb::v1alpha::server_reflection_client::ServerReflectionClient::new(channel);
            let req_v1alpha = tonic_reflection::pb::v1alpha::ServerReflectionRequest {
                host: "".to_string(),
                message_request: Some(
                    tonic_reflection::pb::v1alpha::server_reflection_request::MessageRequest::ListServices(
                        "".to_string(),
                    ),
                ),
            };

            let mut stream_alpha = client_v1alpha
                .server_reflection_info(tonic::Request::new(tokio_stream::once(req_v1alpha)))
                .await
                .map_err(|e| format!("Reflection gagal (v1 & v1alpha): {}", e))?
                .into_inner();

            while let Some(response) = stream_alpha.message().await.map_err(|e| format!("Stream error v1alpha: {}", e))? {
                if let Some(tonic_reflection::pb::v1alpha::server_reflection_response::MessageResponse::ListServicesResponse(list)) = response.message_response {
                    for svc in list.service {
                        if !svc.name.starts_with("grpc.reflection") {
                            services_list.push(svc.name);
                        }
                    }
                }
            }
        }

        if services_list.is_empty() {
            return Err("Reflection gagal: Server tidak mengembalikan service atau tidak mendukung reflection.".to_string());
        }

        Ok(json!({ "services": services_list }))
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
    .invoke_handler(tauri::generate_handler![
        commands::http_request, 
        commands::http_request_collabs,
        commands::grpc_request,
        commands::discover_grpc_services
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
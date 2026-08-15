use serde::{Deserialize, Serialize};
use serde_json::json;
use std::time::{Duration, Instant};
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use reqwest::multipart;
use tonic_reflection::pb::v1::server_reflection_client::ServerReflectionClient;
use tonic_reflection::pb::v1::ServerReflectionRequest;

#[derive(Deserialize)]
struct BodyField {
    key: String,
    value: String,
    r#type: String, // "text" atau "file"
}

// ----------------------------------------------------
// 1. HANDLER HTTP / REST / GRAPHQL (REPOST & EXISTING)
// ----------------------------------------------------
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

    let is_grpc = method.to_uppercase() == "GRPC";
    let actual_method = if is_grpc { "POST" } else { method.as_str() };

    // Auto-inject header JSON jika dipanggil via method GRPC
    if is_grpc && !header_map.contains_key("content-type") {
        header_map.insert(
            reqwest::header::CONTENT_TYPE,
            HeaderValue::from_static("application/json")
        );
    }

    let req_method = reqwest::Method::from_bytes(actual_method.to_uppercase().as_bytes())
        .map_err(|_| "Invalid Method")?;

    let start = Instant::now();
    let mut request = client.request(req_method, &url).headers(header_map);

    if let Some(b) = body {
        if b.is_array() {
            // Multipart Form Data (Tetap Aman)
            let mut form = multipart::Form::new();
            if let Some(items) = b.as_array() {
                for item in items {
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
            }
            request = request.multipart(form);
        } else if b.is_object() {
            request = request.json(&b);
        } else if let Some(raw_str) = b.as_str() {
            // PENYESUAIAN: Coba parse JSON String dari JS Textarea
            if let Ok(parsed_json) = serde_json::from_str::<serde_json::Value>(raw_str) {
                request = request.json(&parsed_json);
            } else {
                request = request.body(raw_str.to_string());
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

// ----------------------------------------------------
// 2. HANDLER NATIVE gRPC TERPISAH (UNTUK gRPC MURNI)
// ----------------------------------------------------
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
    let request_str = payload.to_string();
    let req = tonic::Request::new(request_str);
    
    let path = http::uri::PathAndQuery::from_maybe_shared(service_method)
        .map_err(|_| "Invalid Service/Method path format")?;

    let codec = tonic::codec::JsonCodec::default();
    
    let response = client
        .unary(req, path, codec)
        .await
        .map_err(|status| format!("gRPC Error [Code {}]: {}", status.code(), status.message()))?;

    let duration = start.elapsed().as_millis();
    let res_body = response.into_inner();
    let res_size = res_body.len();

    Ok(json!({
        "status": 200,
        "body": res_body,
        "time": duration,
        "headers": [["content-type", "application/grpc"]],
        "size": res_size
    }))
}

// ----------------------------------------------------
// 3. BARU: HANDLER AUTO-DISCOVER SERVICE VIA REFLECTION
// ----------------------------------------------------
#[tauri::command]
pub async fn discover_grpc_services(
    endpoint: String
) -> Result<serde_json::Value, String> {
    let formatted_endpoint = if !endpoint.starts_with("http://") && !endpoint.starts_with("https://") {
        format!("http://{}", endpoint)
    } else {
        endpoint
    };

    let channel = tonic::transport::Channel::from_shared(formatted_endpoint)
        .map_err(|e| format!("Invalid URL: {}", e))?
        .connect()
        .await
        .map_err(|e| format!("Gagal terhubung ke gRPC Server: {}", e))?;

    let mut client = ServerReflectionClient::new(channel);

    let req = ServerReflectionRequest {
        host: "".to_string(),
        message_request: Some(
            tonic_reflection::pb::v1::server_reflection_request::MessageRequest::ListServices(
                "".to_string(),
            ),
        ),
    };

    let mut stream = client
        .server_reflection_info(tonic::Request::new(tokio_stream::once(req)))
        .await
        .map_err(|e| format!("Reflection gagal: {}", e))?
        .into_inner();

    let mut services_list = Vec::new();

    if let Some(Ok(response)) = stream.message().await {
        if let Some(tonic_reflection::pb::v1::server_reflection_response::MessageResponse::ListServicesResponse(list)) = response.message_response {
            for svc in list.service {
                // Filter out internal reflection service
                if !svc.name.starts_with("grpc.reflection") {
                    services_list.push(svc.name);
                }
            }
        }
    }

    Ok(json!({ "services": services_list }))
}
use serde_json::json;
use std::time::{Instant, Duration};
use tokio;
use base64::{Engine as _, engine::general_purpose};
use tonic_reflection::pb::v1::server_reflection_client::ServerReflectionClient;
use tonic_reflection::pb::v1::ServerReflectionRequest;
use http;
use tokio_stream::{self, StreamExt};

// --- KODEK KUSTOM UNTUK MENGIRIM BINER PROTOBUF DENGAN AMAN VIA TONIC ---
use prost::bytes::{Buf, BufMut};

lazy_static::lazy_static! {
    static ref GRPC_DESCRIPTOR_CACHE: tokio::sync::RwLock<std::collections::HashMap<String, prost_reflect::DescriptorPool>> = tokio::sync::RwLock::new(std::collections::HashMap::new());
}

#[derive(Clone, Default, Debug)]
struct RawBytesCodec;

impl tonic::codec::Codec for RawBytesCodec {
    type Encode = Vec<u8>;
    type Decode = Vec<u8>;
    type Encoder = Self;
    type Decoder = Self;
    fn encoder(&mut self) -> Self::Encoder { self.clone() }
    fn decoder(&mut self) -> Self::Decoder { self.clone() }
}

impl tonic::codec::Encoder for RawBytesCodec {
    type Item = Vec<u8>;
    type Error = tonic::Status;
    fn encode(&mut self, item: Self::Item, dst: &mut tonic::codec::EncodeBuf<'_>) -> Result<(), Self::Error> {
        dst.put_slice(&item);
        Ok(())
    }
}

impl tonic::codec::Decoder for RawBytesCodec {
    type Item = Vec<u8>;
    type Error = tonic::Status;
    fn decode(&mut self, src: &mut tonic::codec::DecodeBuf<'_>) -> Result<Option<Self::Item>, Self::Error> {
        let vec = src.chunk().to_vec();
        src.advance(vec.len());
        Ok(Some(vec))
    }
}

mod commands {
    use super::*;
    use prost::Message;

    // ==========================================
    // EKSISTING (HTTP REQUEST)
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
            .timeout(Duration::from_secs(30))
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

        let start = Instant::now();
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
            .timeout(Duration::from_secs(30))
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

        let req_method = reqwest::Method::from_bytes(actual_method.to_uppercase().as_bytes())
            .map_err(|_| "Invalid Method")?;

        let start = Instant::now();
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

   // ==========================================
// GRPC REQUEST (SUPPORT UNARY, STREAMING & OPTIONAL METADATA)
// ==========================================
#[tauri::command]
pub async fn grpc_request(
    endpoint: String,
    service_method: String,
    payload: serde_json::Value,
    metadata: Option<serde_json::Value>
) -> Result<serde_json::Value, String> {
    let start = Instant::now();
    
    // Ganti logika manual lama dengan helper cerdas resolve_and_connect_grpc
    let (channel, formatted_endpoint, target_host) = resolve_and_connect_grpc(&endpoint).await?;

    let sanitized = service_method.trim();
    let normalized = sanitized.replace(" / ", "/").replace(" /", "/").replace("/ ", "/");
    let clean_path = normalized.trim_start_matches('/');

    let (service_name, method_name) = if let Some(idx) = clean_path.rfind('/') {
        (clean_path[..idx].trim().to_string(), clean_path[idx+1..].trim().to_string())
    } else {
        return Err(format!("Format service_method salah ('{}'). Gunakan format 'Service/Method'", service_method));
    };

    let cache_key = format!("{}_{}", formatted_endpoint, service_name);
    let mut cached_pool = None;

    {
        let cache = GRPC_DESCRIPTOR_CACHE.read().await;
        if let Some(pool) = cache.get(&cache_key) {
            cached_pool = Some(pool.clone());
        }
    }

    let (pool, was_cached) = if let Some(p) = cached_pool {
        (p, true)
    } else {
        let mut fd_set = prost_types::FileDescriptorSet::default();
        let mut reflection_success = false;
        let mut reflection_err_detail = String::new();

        // PANGGILAN REFLECTION V1
        let reflection_v1_result = async {
            let mut client_v1 = ServerReflectionClient::new(channel.clone());
            let req_v1 = ServerReflectionRequest {
                host: target_host.clone(),
                message_request: Some(
                    tonic_reflection::pb::v1::server_reflection_request::MessageRequest::FileContainingSymbol(service_name.clone())
                ),
            };
            client_v1.server_reflection_info(tonic::Request::new(tokio_stream::once(req_v1))).await
        }.await;

        match reflection_v1_result {
            Ok(response) => {
                let mut stream = response.into_inner();
                if let Ok(Some(msg)) = stream.message().await {
                    match msg.message_response {
                        Some(tonic_reflection::pb::v1::server_reflection_response::MessageResponse::FileDescriptorResponse(fd_res)) => {
                            for fd_bytes in fd_res.file_descriptor_proto {
                                if let Ok(fd) = prost_types::FileDescriptorProto::decode(fd_bytes.as_slice()) {
                                    fd_set.file.push(fd);
                                }
                            }
                            reflection_success = !fd_set.file.is_empty();
                        },
                        Some(tonic_reflection::pb::v1::server_reflection_response::MessageResponse::ErrorResponse(err)) => {
                            reflection_err_detail = format!("v1 Error: {} (code {})", err.error_message, err.error_code);
                        },
                        _ => reflection_err_detail = "v1 Error: Invalid response type".to_string()
                    }
                }
            },
            Err(e) => reflection_err_detail = format!("v1 Status: {}", e),
        }

        if !reflection_success {
            let reflection_v1alpha_result = async {
                let mut client_v1alpha = tonic_reflection::pb::v1alpha::server_reflection_client::ServerReflectionClient::new(channel.clone());
                let req_v1alpha = tonic_reflection::pb::v1alpha::ServerReflectionRequest {
                    host: target_host.clone(),
                    message_request: Some(
                        tonic_reflection::pb::v1alpha::server_reflection_request::MessageRequest::FileContainingSymbol(service_name.clone())
                    ),
                };
                client_v1alpha.server_reflection_info(tonic::Request::new(tokio_stream::once(req_v1alpha))).await
            }.await;

            match reflection_v1alpha_result {
                Ok(response) => {
                    let mut stream = response.into_inner();
                    if let Ok(Some(msg)) = stream.message().await {
                        match msg.message_response {
                            Some(tonic_reflection::pb::v1alpha::server_reflection_response::MessageResponse::FileDescriptorResponse(fd_res)) => {
                                for fd_bytes in fd_res.file_descriptor_proto {
                                    if let Ok(fd) = prost_types::FileDescriptorProto::decode(fd_bytes.as_slice()) {
                                        fd_set.file.push(fd);
                                    }
                                }
                                reflection_success = !fd_set.file.is_empty();
                            },
                            Some(tonic_reflection::pb::v1alpha::server_reflection_response::MessageResponse::ErrorResponse(err)) => {
                                reflection_err_detail = format!("{} | v1alpha Error: {} (code {})", reflection_err_detail, err.error_message, err.error_code);
                            },
                            _ => reflection_err_detail = format!("{} | v1alpha Error: Invalid response type", reflection_err_detail)
                        }
                    }
                },
                Err(e) => reflection_err_detail = format!("{} | v1alpha Status: {}", reflection_err_detail, e),
            }
        }

        if !reflection_success {
            return Err(format!("Gagal memuat descriptor untuk service '{}'. Detail Server: {}", service_name, reflection_err_detail));
        }

        let mut new_pool = prost_reflect::DescriptorPool::new();
        let mut pool_bytes = Vec::new();
        prost::Message::encode(&fd_set, &mut pool_bytes).map_err(|e| e.to_string())?;
        
        new_pool.decode_file_descriptor_set(pool_bytes.as_slice())
            .map_err(|e| format!("Gagal memuat Protobuf descriptor pool: {}", e))?;

        let mut cache = GRPC_DESCRIPTOR_CACHE.write().await;
        cache.insert(cache_key.clone(), new_pool.clone());
        
        (new_pool, false)
    };

    let service_desc = match pool.get_service_by_name(&service_name) {
        Some(desc) => desc,
        None => {
            if was_cached {
                let mut cache = GRPC_DESCRIPTOR_CACHE.write().await;
                cache.remove(&cache_key);
                return Err(format!("Service '{}' usang. Silakan klik 'Send' kembali untuk melakukan re-reflection.", service_name));
            }
            return Err(format!("Service '{}' tidak ditemukan di pool descriptor", service_name));
        }
    };
    
    let method_desc = match service_desc.methods().find(|m| m.name() == method_name) {
        Some(desc) => desc,
        None => return Err(format!("Method '{}' tidak ditemukan di dalam service '{}'", method_name, service_name)),
    };

    let input_desc = method_desc.input();
    let output_desc = method_desc.output();

    // --- PENANGANAN FLEKSIBEL KONFLIK ONEOF & FIELD KOSONG ---
    let mut clean_payload_val = if payload.is_null() {
        serde_json::json!({})
    } else if let Some(s) = payload.as_str() {
        let s_trim = s.trim();
        if s_trim.is_empty() {
            serde_json::json!({})
        } else {
            serde_json::from_str(s_trim).unwrap_or(payload.clone())
        }
    } else {
        payload.clone()
    };

    if let Some(obj) = clean_payload_val.as_object_mut() {
        for oneof_desc in input_desc.oneofs() {
            let fields_in_oneof: Vec<String> = oneof_desc.fields().map(|f| f.name().to_string()).collect();
            let mut found_first = false;
            let mut to_remove = Vec::new();

            for field_name in &fields_in_oneof {
                if let Some(val) = obj.get(field_name) {
                    let is_empty_val = val.is_null() 
                        || (val.is_object() && val.as_object().unwrap().is_empty())
                        || (val.is_string() && val.as_str().unwrap().is_empty());

                    if is_empty_val {
                        to_remove.push(field_name.clone());
                    } else if !found_first {
                        found_first = true;
                    } else {
                        to_remove.push(field_name.clone());
                    }
                }
            }

            for rem in to_remove {
                obj.remove(&rem);
            }
        }
    }

    let request_msg = {
        let json_str = clean_payload_val.to_string();
        let mut deserializer = serde_json::Deserializer::from_str(&json_str);
        prost_reflect::DynamicMessage::deserialize(input_desc, &mut deserializer)
            .map_err(|e| format!("Format JSON tidak sesuai dengan skema Protobuf gRPC: {}", e))?
    };

    let mut req_bytes = Vec::new();
    prost::Message::encode(&request_msg, &mut req_bytes)
        .map_err(|e| format!("Gagal mem-parsing/encode Protobuf: {}", e))?;

    let path_uri = format!("/{}/{}", service_name, method_name);
    let path = http::uri::PathAndQuery::from_maybe_shared(path_uri.clone())
        .map_err(|_| format!("Invalid Route Path: {}", path_uri))?;

    let codec = RawBytesCodec::default();

    // --- PEMBUATAN TONIC REQUEST DAN INJEKSI METADATA OPSIONAL ---
    let mut req = tonic::Request::new(req_bytes);
    
    if let Some(meta) = metadata {
        let headers_mut = req.metadata_mut();
        if let Some(obj) = meta.as_object() {
            for (k, v) in obj {
                if let Some(v_str) = v.as_str() {
                    if let (Ok(key), Ok(val)) = (
                        tonic::metadata::MetadataKey::from_bytes(k.as_bytes()),
                        v_str.parse::<tonic::metadata::MetadataValue<tonic::metadata::Ascii>>()
                    ) {
                        headers_mut.insert(key, val);
                    }
                }
            }
        } else if let Some(arr) = meta.as_array() {
            for item in arr {
                if let Some(pair) = item.as_array() {
                    if pair.len() >= 2 {
                        let k = pair[0].as_str().unwrap_or("");
                        let v = pair[1].as_str().unwrap_or("");
                        if !k.is_empty() {
                            if let (Ok(key), Ok(val)) = (
                                tonic::metadata::MetadataKey::from_bytes(k.as_bytes()),
                                v.parse::<tonic::metadata::MetadataValue<tonic::metadata::Ascii>>()
                            ) {
                                headers_mut.insert(key, val);
                            }
                        }
                    }
                }
            }
        }
    }

    // CEK APAKAH METHOD INI SERVER STREAMING
    if method_desc.is_server_streaming() {
        let mut client = tonic::client::Grpc::new(channel);
        client.ready().await.map_err(|e| format!("gRPC Client belum siap: {}", e))?;

        let response = client.server_streaming(req, path, codec).await
            .map_err(|status| format!("gRPC Server Streaming Error [Code {}]: {}", status.code(), status.message()))?;

        let mut stream = response.into_inner();
        let mut results = Vec::new();
        let mut total_bytes = 0; // [OPTIMASI]: Akumulasi byte langsung tanpa re-serialize ke JSON string

        while let Some(item_res) = stream.next().await {
            match item_res {
                Ok(res_bytes) => {
                    total_bytes += res_bytes.len(); // [OPTIMASI]: Menghemat CPU & memori secara drastis
                    match prost_reflect::DynamicMessage::decode(output_desc.clone(), res_bytes.as_slice()) {
                        Ok(response_msg) => {
                            if let Ok(res_json) = serde_json::to_value(&response_msg) {
                                results.push(res_json);
                            }
                        }
                        Err(e) => println!(">>> [ERROR] Gagal decode stream chunk: {}", e),
                    }
                }
                Err(e) => {
                    println!(">>> [ERROR] Stream error: {}", e);
                    break;
                }
            }
        }

        let duration = start.elapsed().as_millis();

        return Ok(json!({
            "status": 200,
            "body": results, 
            "time": duration,
            "headers": [["content-type", "application/grpc"]],
            "size": total_bytes, // [OPTIMASI]: Menggunakan total ukuran byte stream
            "is_stream": true
        }));
    }

    // UNARY REQUEST BIASA
    let mut client = tonic::client::Grpc::new(channel);
    client.ready().await.map_err(|e| format!("gRPC Client belum siap: {}", e))?;

    let response = client.unary(req, path, codec).await
        .map_err(|status| format!("gRPC Error [Code {}]: {}", status.code(), status.message()))?;

    let duration = start.elapsed().as_millis();
    let res_body_bytes = response.into_inner();
    let res_size = res_body_bytes.len();
    
    let response_msg = prost_reflect::DynamicMessage::decode(output_desc, res_body_bytes.as_slice())
        .map_err(|e| format!("Gagal men-decode response dari Protobuf: {}", e))?;
    
    let res_json = serde_json::to_value(&response_msg)
        .map_err(|e| format!("Gagal men-serialize response Protobuf ke JSON: {}", e))?;

    Ok(json!({
        "status": 200,
        "body": res_json,
        "time": duration,
        "headers": [["content-type", "application/grpc"]],
        "size": res_size,
        "is_stream": false
    }))
}

   // ==========================================
    // HELPER KONEKSI DINAMIS & CERDAS (TANPA HARDCODE)
    // ==========================================
    async fn resolve_and_connect_grpc(endpoint: &str) -> Result<(tonic::transport::Channel, String, String), String> {
        let has_scheme = endpoint.starts_with("http://") || endpoint.starts_with("https://");
        
        let mut candidates = Vec::new();
        if has_scheme {
            candidates.push(endpoint.to_string());
        } else {
            // Ambil bagian host saja tanpa port untuk dianalisis
            let host_only = endpoint.split(':').next().unwrap_or(endpoint);
            let is_ip = host_only.parse::<std::net::IpAddr>().is_ok();
            
            // Logika pintar ala Postman:
            // Jika localhost, IP, atau nama tanpa titik (misal container docker lokal) -> Utamakan http:// dulu, lalu fallback https://
            // Jika berupa domain publik (mengandung titik, misal grpc.postman-echo.com) -> Utamakan https:// dulu, lalu fallback http://
            let is_local = host_only == "localhost" || is_ip || !host_only.contains('.');

            if is_local {
                candidates.push(format!("http://{}", endpoint));
                candidates.push(format!("https://{}", endpoint));
            } else {
                candidates.push(format!("https://{}", endpoint));
                candidates.push(format!("http://{}", endpoint));
            }
        }

        let mut last_err = String::new();
        for uri_str in candidates {
            let endpoint_res = tonic::transport::Endpoint::from_shared(uri_str.clone());
            if let Ok(mut ep) = endpoint_res {
                ep = ep.timeout(Duration::from_secs(10))
                    .tcp_nodelay(true)
                    .keep_alive_while_idle(true);

                // Jika menggunakan https, aktifkan TLS dan baca sertifikat sistem operasi (Root CA)
                if uri_str.starts_with("https://") {
                    if let Ok(tls_ep) = ep.tls_config(
                        tonic::transport::ClientTlsConfig::new().with_native_roots()
                    ) {
                        ep = tls_ep;
                    } else {
                        continue;
                    }
                }

                match ep.connect().await {
                    Ok(channel) => {
                        let parsed_uri = uri_str.parse::<http::Uri>().map_err(|_| "Format URL tidak valid")?;
                        let target_host = parsed_uri.host().unwrap_or("").to_string();
                        return Ok((channel, uri_str, target_host));
                    }
                    Err(err) => {
                        last_err = err.to_string();
                    }
                }
            }
        }
        
        Err(format!("Gagal terhubung ke endpoint '{}'. Detail: {}", endpoint, last_err))
    }

    // ==========================================
    // GRPC DISCOVERY (DINAMIS & TANPA HARDCODE)
    // ==========================================
    #[tauri::command]
    pub async fn discover_grpc_services(
        endpoint: String
    ) -> Result<serde_json::Value, String> {
        // Panggil helper cerdas untuk mendapatkan channel, uri akhir, dan target host secara dinamis
        let (channel, uri_endpoint, target_host) = resolve_and_connect_grpc(&endpoint).await?;

        let mut raw_service_names = Vec::new();
        
        // --- 1. COBA REFLECTION V1 ---
        let v1_res = async {
            let mut client_v1 = ServerReflectionClient::new(channel.clone());
            let req_v1 = ServerReflectionRequest {
                host: target_host.clone(),
                message_request: Some(
                    tonic_reflection::pb::v1::server_reflection_request::MessageRequest::ListServices("".to_string())
                ),
            };
            client_v1.server_reflection_info(tonic::Request::new(tokio_stream::once(req_v1))).await
        }.await;

        if let Ok(response) = v1_res {
            let mut stream = response.into_inner();
            while let Ok(Some(resp)) = stream.message().await {
                if let Some(tonic_reflection::pb::v1::server_reflection_response::MessageResponse::ListServicesResponse(list)) = resp.message_response {
                    for svc in list.service {
                        if !svc.name.starts_with("grpc.reflection") {
                            raw_service_names.push(svc.name);
                        }
                    }
                }
            }
        }

        // --- 2. JIKA V1 KOSONG, COBA V1ALPHA ---
        if raw_service_names.is_empty() {
            let v1alpha_res = async {
                let mut client_v1alpha = tonic_reflection::pb::v1alpha::server_reflection_client::ServerReflectionClient::new(channel.clone());
                let req_v1alpha = tonic_reflection::pb::v1alpha::ServerReflectionRequest {
                    host: target_host.clone(),
                    message_request: Some(
                        tonic_reflection::pb::v1alpha::server_reflection_request::MessageRequest::ListServices("".to_string())
                    ),
                };
                client_v1alpha.server_reflection_info(tonic::Request::new(tokio_stream::once(req_v1alpha))).await
            }.await;

            if let Ok(response) = v1alpha_res {
                let mut stream = response.into_inner();
                while let Ok(Some(resp)) = stream.message().await {
                    if let Some(tonic_reflection::pb::v1alpha::server_reflection_response::MessageResponse::ListServicesResponse(list)) = resp.message_response {
                        for svc in list.service {
                            if !svc.name.starts_with("grpc.reflection") {
                                raw_service_names.push(svc.name);
                            }
                        }
                    }
                }
            }
        }

        if raw_service_names.is_empty() {
            return Err(format!(
                "Reflection gagal pada '{}'. Server mungkin tidak mengaktifkan gRPC Reflection atau memerlukan file .proto manual.", 
                uri_endpoint
            ));
        }

        let mut services_with_methods = Vec::new();
        for svc_name in raw_service_names {
            let mut fd_set = prost_types::FileDescriptorSet::default();
            let mut reflection_success = false;

            // Ambil File Descriptor V1
            let desc_v1_res = async {
                let mut client_v1_desc = ServerReflectionClient::new(channel.clone());
                let req_desc_v1 = tonic_reflection::pb::v1::ServerReflectionRequest {
                    host: target_host.clone(),
                    message_request: Some(
                        tonic_reflection::pb::v1::server_reflection_request::MessageRequest::FileContainingSymbol(svc_name.clone())
                    ),
                };
                client_v1_desc.server_reflection_info(tonic::Request::new(tokio_stream::once(req_desc_v1))).await
            }.await;

            if let Ok(response) = desc_v1_res {
                let mut stream = response.into_inner();
                if let Ok(Some(msg)) = stream.message().await {
                    if let Some(tonic_reflection::pb::v1::server_reflection_response::MessageResponse::FileDescriptorResponse(fd_res)) = msg.message_response {
                        for fd_bytes in fd_res.file_descriptor_proto {
                            if let Ok(fd) = prost_types::FileDescriptorProto::decode(fd_bytes.as_slice()) {
                                fd_set.file.push(fd);
                            }
                        }
                        reflection_success = !fd_set.file.is_empty();
                    }
                }
            }

            // Jika V1 gagal, ambil File Descriptor V1Alpha
            if !reflection_success {
                let desc_v1alpha_res = async {
                    let mut client_v1alpha_desc = tonic_reflection::pb::v1alpha::server_reflection_client::ServerReflectionClient::new(channel.clone());
                    let req_desc_v1alpha = tonic_reflection::pb::v1alpha::ServerReflectionRequest {
                        host: target_host.clone(),
                        message_request: Some(
                            tonic_reflection::pb::v1alpha::server_reflection_request::MessageRequest::FileContainingSymbol(svc_name.clone())
                        ),
                    };
                    client_v1alpha_desc.server_reflection_info(tonic::Request::new(tokio_stream::once(req_desc_v1alpha))).await
                }.await;

                if let Ok(response) = desc_v1alpha_res {
                    let mut stream = response.into_inner();
                    if let Ok(Some(msg)) = stream.message().await {
                        if let Some(tonic_reflection::pb::v1alpha::server_reflection_response::MessageResponse::FileDescriptorResponse(fd_res)) = msg.message_response {
                            for fd_bytes in fd_res.file_descriptor_proto {
                                if let Ok(fd) = prost_types::FileDescriptorProto::decode(fd_bytes.as_slice()) {
                                    fd_set.file.push(fd);
                                }
                            }
                            reflection_success = !fd_set.file.is_empty();
                        }
                    }
                }
            }

            let mut methods: Vec<String> = Vec::new();
            if reflection_success {
                let mut pool = prost_reflect::DescriptorPool::new();
                let mut pool_bytes = Vec::new();
                if prost::Message::encode(&fd_set, &mut pool_bytes).is_ok() {
                    if pool.decode_file_descriptor_set(pool_bytes.as_slice()).is_ok() {
                        if let Some(service_desc) = pool.get_service_by_name(&svc_name) {
                            for method in service_desc.methods() {
                                methods.push(format!("{}/{}", svc_name, method.name()));
                            }
                        }
                    }
                }
            }

            services_with_methods.push(json!({
                "service": svc_name,
                "methods": methods
            }));
        }

        Ok(json!({ "services": services_with_methods }))
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
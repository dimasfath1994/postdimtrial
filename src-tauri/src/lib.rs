use serde_json::json;
use std::time::Instant;
use tokio;
use base64::{Engine as _, engine::general_purpose};
use tonic_reflection::pb::v1::server_reflection_client::ServerReflectionClient;
use tonic_reflection::pb::v1::ServerReflectionRequest;
use http;
use tokio_stream;

// --- KODEK KUSTOM UNTUK MENGIRIM BINER PROTOBUF DENGAN AMAN VIA TONIC ---
use prost::bytes::{Buf, BufMut};

lazy_static::lazy_static! {
    // CACHING: Menyimpan Descriptor Pool gRPC di memori untuk menghindari request Reflection pada tiap hit.
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
        if !src.has_remaining() {
            return Ok(None);
        }
        let len = src.remaining();
        let mut vec = vec![0; len];
        src.copy_to_slice(&mut vec);
        Ok(Some(vec))
    }
}
// -------------------------------------------------------------------------

mod commands {
    use super::*;
    use prost::Message;

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

    // ==========================================
    // MATURE & FINAL: GRPC REQUEST (POSTMAN STYLE) DENGAN CACHE & FIX STREAM
    // ==========================================
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
            endpoint.clone()
        };

        let sanitized = service_method.trim();
        let normalized = sanitized.replace(" / ", "/").replace(" /", "/").replace("/ ", "/");
        let clean_path = normalized.trim_start_matches('/');

        let (service_name, method_name) = if let Some(idx) = clean_path.rfind('/') {
            (clean_path[..idx].trim().to_string(), clean_path[idx+1..].trim().to_string())
        } else {
            return Err("Format service_method salah. Gunakan format 'Service/Method' atau 'Service / Method'".to_string());
        };

        // PERBAIKAN: Konfigurasi TCP NoDelay dan KeepAlive pada Tonic agar HTTP/2 Cleartext stabil.
        let channel = match tokio::time::timeout(
            std::time::Duration::from_secs(10),
            async {
                let endpoint_uri = tonic::transport::Endpoint::from_shared(formatted_endpoint.clone())?;
                
                endpoint_uri
                    .tcp_nodelay(true)
                    .keep_alive_while_idle(true)
                    .connect()
                    .await
            }
        ).await {
            Ok(Ok(ch)) => ch,
            Ok(Err(e)) => return Err(format!("Gagal terkoneksi ke gRPC server: {}", e)),
            Err(_) => return Err("Koneksi ke gRPC server timeout (lebih dari 10 detik)".to_string()),
        };

        let cache_key = formatted_endpoint.clone();
        let mut cached_pool = None;

        // CEK CACHE: Membaca Protobuf Descriptor untuk menghindari re-reflection.
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

            let mut client_v1 = tonic_reflection::pb::v1::server_reflection_client::ServerReflectionClient::new(channel.clone());
            let req_v1 = tonic_reflection::pb::v1::ServerReflectionRequest {
                host: "".to_string(),
                message_request: Some(
                    tonic_reflection::pb::v1::server_reflection_request::MessageRequest::FileContainingSymbol(service_name.clone())
                ),
            };

            let reflection_v1_result = tokio::time::timeout(
                std::time::Duration::from_secs(3),
                async {
                    let response = client_v1.server_reflection_info(tonic::Request::new(tokio_stream::once(req_v1))).await?;
                    let mut stream = response.into_inner();
                    let msg = stream.message().await;
                    
                    // FIX: Drop stream dan client untuk melepas HTTP/2 stream yang tertahan di multiplex
                    drop(stream);
                    drop(client_v1);
                    
                    if let Ok(Some(m)) = msg {
                        Ok::<_, tonic::Status>(Some(m))
                    } else {
                        Ok(None)
                    }
                }
            ).await;

            if let Ok(Ok(Some(msg))) = reflection_v1_result {
                if let Some(tonic_reflection::pb::v1::server_reflection_response::MessageResponse::FileDescriptorResponse(fd_res)) = msg.message_response {
                    for fd_bytes in fd_res.file_descriptor_proto {
                        if let Ok(fd) = prost_types::FileDescriptorProto::decode(fd_bytes.as_slice()) {
                            fd_set.file.push(fd);
                        }
                    }
                    reflection_success = !fd_set.file.is_empty();
                }
            }

            if !reflection_success {
                let mut client_v1alpha = tonic_reflection::pb::v1alpha::server_reflection_client::ServerReflectionClient::new(channel.clone());
                let req_v1alpha = tonic_reflection::pb::v1alpha::ServerReflectionRequest {
                    host: "".to_string(),
                    message_request: Some(
                        tonic_reflection::pb::v1alpha::server_reflection_request::MessageRequest::FileContainingSymbol(service_name.clone())
                    ),
                };

                let reflection_v1alpha_result = tokio::time::timeout(
                    std::time::Duration::from_secs(3),
                    async {
                        let response = client_v1alpha.server_reflection_info(tonic::Request::new(tokio_stream::once(req_v1alpha))).await?;
                        let mut stream = response.into_inner();
                        let msg = stream.message().await;
                        
                        // FIX: Drop stream dan client
                        drop(stream);
                        drop(client_v1alpha);
                        
                        if let Ok(Some(m)) = msg {
                            Ok::<_, tonic::Status>(Some(m))
                        } else {
                            Ok(None)
                        }
                    }
                ).await;

                if let Ok(Ok(Some(msg))) = reflection_v1alpha_result {
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

            if !reflection_success {
                return Err(format!("Gagal memuat descriptor untuk service '{}' via Server Reflection.", service_name));
            }

            let mut new_pool = prost_reflect::DescriptorPool::new();
            let mut pool_bytes = Vec::new();
            prost::Message::encode(&fd_set, &mut pool_bytes).map_err(|e| e.to_string())?;
            
            new_pool.decode_file_descriptor_set(pool_bytes.as_slice())
                .map_err(|e| format!("Gagal memuat Protobuf descriptor pool: {}", e))?;

            // SIMPAN KE CACHE
            let mut cache = GRPC_DESCRIPTOR_CACHE.write().await;
            cache.insert(cache_key.clone(), new_pool.clone());
            
            (new_pool, false)
        };

        // Pencarian service descriptor dengan sistem cache-invalidation
        let service_desc = match pool.get_service_by_name(&service_name) {
            Some(desc) => desc,
            None => {
                if was_cached {
                    // Jika data cache ternyata usang (misal server diperbarui), hapus paksa agar user meretrieve ulang.
                    let mut cache = GRPC_DESCRIPTOR_CACHE.write().await;
                    cache.remove(&cache_key);
                    return Err(format!("Service '{}' usang atau tidak ditemukan di cache. Silakan klik 'Send' kembali untuk melakukan re-reflection.", service_name));
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

        let request_msg = if payload.is_null() || (payload.is_object() && payload.as_object().unwrap().is_empty()) {
            prost_reflect::DynamicMessage::new(input_desc.clone())
        } else {
            let json_str = payload.to_string();
            let mut deserializer = serde_json::Deserializer::from_str(&json_str);
            
            prost_reflect::DynamicMessage::deserialize(input_desc, &mut deserializer)
                .map_err(|e| format!("Format JSON tidak sesuai dengan skema Protobuf gRPC: {}", e))?
        };
        
        let mut req_bytes = Vec::new();
        prost::Message::encode(&request_msg, &mut req_bytes)
            .map_err(|e| format!("Gagal mem-parsing/encode Protobuf: {}", e))?;

        let mut client = tonic::client::Grpc::new(channel);
        let req = tonic::Request::new(req_bytes);
        
        let path_uri = format!("/{}/{}", service_name, method_name);
        let path = http::uri::PathAndQuery::from_maybe_shared(path_uri.clone())
            .map_err(|_| format!("Invalid Route Path: {}", path_uri))?;

        let codec = super::RawBytesCodec::default();
        
        let response = match tokio::time::timeout(
            std::time::Duration::from_secs(30),
            client.unary(req, path, codec)
        ).await {
            Ok(Ok(res)) => res,
            Ok(Err(status)) => return Err(format!("gRPC Error [Code {}]: {}", status.code(), status.message())),
            Err(_) => return Err("gRPC request timeout (lebih dari 30 detik tanpa respons)".to_string()),
        };

        let duration = start.elapsed().as_millis();
        let res_body_bytes = response.into_inner();
        let res_size = res_body_bytes.len();
        
        let response_msg = prost_reflect::DynamicMessage::decode(output_desc, res_body_bytes.as_slice())
            .map_err(|e| format!("Gagal men-decode response dari Protobuf: {}", e))?;
        
        let res_json = serde_json::to_value(&response_msg)
            .map_err(|e| format!("Gagal men-serialize response Protobuf ke JSON: {}", e))?;

        Ok(json!({
            "status": 200,
            "body": res_json.to_string(),
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

        let channel = match tokio::time::timeout(
            std::time::Duration::from_secs(10),
            async {
                let endpoint_uri = tonic::transport::Endpoint::from_shared(uri_endpoint)?;
                
                endpoint_uri
                    .tcp_nodelay(true)
                    .keep_alive_while_idle(true)
                    .connect()
                    .await
            }
        ).await {
            Ok(Ok(ch)) => ch,
            Ok(Err(e)) => return Err(format!("Gagal terhubung ke gRPC Server: {}", e)),
            Err(_) => return Err("Koneksi ke gRPC server timeout (lebih dari 10 detik)".to_string()),
        };

        let mut raw_service_names = Vec::new();

        let mut client_v1 = ServerReflectionClient::new(channel.clone());
        let req_v1 = ServerReflectionRequest {
            host: "".to_string(),
            message_request: Some(
                tonic_reflection::pb::v1::server_reflection_request::MessageRequest::ListServices(
                    "".to_string(),
                ),
            ),
        };

        let v1_success = match tokio::time::timeout(
            std::time::Duration::from_secs(3),
            async {
                let response = client_v1
                    .server_reflection_info(tonic::Request::new(tokio_stream::once(req_v1)))
                    .await?
                    .into_inner();

                let mut stream = response;
                let mut local_names = Vec::new();
                while let Some(resp) = stream.message().await? {
                    if let Some(tonic_reflection::pb::v1::server_reflection_response::MessageResponse::ListServicesResponse(list)) = resp.message_response {
                        for svc in list.service {
                            if !svc.name.starts_with("grpc.reflection") {
                                local_names.push(svc.name);
                            }
                        }
                        break;
                    }
                }
                
                // FIX: Membersihkan stream resource
                drop(stream);
                drop(client_v1);
                
                Ok::<Vec<String>, tonic::Status>(local_names)
            }
        ).await {
            Ok(Ok(names)) => {
                raw_service_names = names;
                !raw_service_names.is_empty()
            }
            _ => false,
        };

        if !v1_success {
            raw_service_names.clear();
            let mut client_v1alpha = tonic_reflection::pb::v1alpha::server_reflection_client::ServerReflectionClient::new(channel.clone());
            let req_v1alpha = tonic_reflection::pb::v1alpha::ServerReflectionRequest {
                host: "".to_string(),
                message_request: Some(
                    tonic_reflection::pb::v1alpha::server_reflection_request::MessageRequest::ListServices(
                        "".to_string(),
                    ),
                ),
            };

            let _ = tokio::time::timeout(
                std::time::Duration::from_secs(3),
                async {
                    let response = client_v1alpha
                        .server_reflection_info(tonic::Request::new(tokio_stream::once(req_v1alpha)))
                        .await?
                        .into_inner();

                    let mut stream = response;
                    let mut local_names = Vec::new();
                    while let Some(resp) = stream.message().await? {
                        if let Some(tonic_reflection::pb::v1alpha::server_reflection_response::MessageResponse::ListServicesResponse(list)) = resp.message_response {
                            for svc in list.service {
                                if !svc.name.starts_with("grpc.reflection") {
                                    local_names.push(svc.name);
                                }
                            }
                            break;
                        }
                    }
                    
                    // FIX: Membersihkan resource
                    drop(stream);
                    drop(client_v1alpha);
                    
                    raw_service_names = local_names;
                    Ok::<(), tonic::Status>(())
                }
            ).await;
        }

        if raw_service_names.is_empty() {
            return Err("Reflection gagal: Server tidak mengembalikan service atau tidak mendukung reflection.".to_string());
        }

        let mut services_with_methods = Vec::new();

        for svc_name in raw_service_names {
            let mut fd_set = prost_types::FileDescriptorSet::default();
            let mut reflection_success = false;

            let mut client_v1_desc = ServerReflectionClient::new(channel.clone());
            let req_desc_v1 = tonic_reflection::pb::v1::ServerReflectionRequest {
                host: "".to_string(),
                message_request: Some(
                    tonic_reflection::pb::v1::server_reflection_request::MessageRequest::FileContainingSymbol(svc_name.clone())
                ),
            };

            let desc_v1_res = tokio::time::timeout(
                std::time::Duration::from_secs(3),
                async {
                    let response = client_v1_desc.server_reflection_info(tonic::Request::new(tokio_stream::once(req_desc_v1))).await?;
                    let mut stream = response.into_inner();
                    let msg = stream.message().await;
                    
                    drop(stream);
                    drop(client_v1_desc);
                    
                    if let Ok(Some(m)) = msg {
                        Ok::<_, tonic::Status>(Some(m))
                    } else {
                        Ok(None)
                    }
                }
            ).await;

            if let Ok(Ok(Some(msg))) = desc_v1_res {
                if let Some(tonic_reflection::pb::v1::server_reflection_response::MessageResponse::FileDescriptorResponse(fd_res)) = msg.message_response {
                    for fd_bytes in fd_res.file_descriptor_proto {
                        if let Ok(fd) = prost_types::FileDescriptorProto::decode(fd_bytes.as_slice()) {
                            fd_set.file.push(fd);
                        }
                    }
                    reflection_success = !fd_set.file.is_empty();
                }
            }

            if !reflection_success {
                let mut client_v1alpha_desc = tonic_reflection::pb::v1alpha::server_reflection_client::ServerReflectionClient::new(channel.clone());
                let req_desc_v1alpha = tonic_reflection::pb::v1alpha::ServerReflectionRequest {
                    host: "".to_string(),
                    message_request: Some(
                        tonic_reflection::pb::v1alpha::server_reflection_request::MessageRequest::FileContainingSymbol(svc_name.clone())
                    ),
                };

                let desc_v1alpha_res = tokio::time::timeout(
                    std::time::Duration::from_secs(3),
                    async {
                        let response = client_v1alpha_desc.server_reflection_info(tonic::Request::new(tokio_stream::once(req_desc_v1alpha))).await?;
                        let mut stream = response.into_inner();
                        let msg = stream.message().await;
                        
                        drop(stream);
                        drop(client_v1alpha_desc);
                        
                        if let Ok(Some(m)) = msg {
                            Ok::<_, tonic::Status>(Some(m))
                        } else {
                            Ok(None)
                        }
                    }
                ).await;

                if let Ok(Ok(Some(msg))) = desc_v1alpha_res {
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
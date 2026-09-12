const fs = require("fs");
const os = require("os");
const path = require("path");
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");

const protoCache = new Map();
const serviceCache = new Map();
const reflectionCache = new Map();
const protoDirectory = path.join(os.tmpdir(), "postdim-vscode-protos");

// === PROTO SPEC FOR REFLECTION V1 & V1ALPHA ===
const reflectionProtoV1 = `
syntax = "proto3";
package grpc.reflection.v1;

service ServerReflection {
  rpc ServerReflectionInfo(stream ServerReflectionRequest) returns (stream ServerReflectionResponse);
}

message ServerReflectionRequest {
  string host = 1;
  oneof message_request {
    string file_by_filename = 3;
    string file_containing_symbol = 4;
    string file_containing_extension = 5;
    string all_extension_numbers_of_type = 6;
    string list_services = 7;
  }
}

message ServerReflectionResponse {
  string valid_host = 1;
  ServerReflectionRequest original_request = 2;
  oneof message_response {
    FileDescriptorResponse file_descriptor_response = 4;
    ExtensionNumberResponse all_extension_numbers_response = 5;
    ListServiceResponse list_services_response = 6;
    ErrorResponse error_response = 7;
  }
}

message FileDescriptorResponse { repeated bytes file_descriptor_proto = 1; }
message ListServiceResponse { repeated ServiceResponse service = 1; }
message ServiceResponse { string name = 1; }
message ErrorResponse { int32 error_code = 1; string error_message = 2; }
message ExtensionNumberResponse { string base_type_name = 1; repeated int32 extension_number = 2; }
`;

const reflectionProtoV1Alpha = reflectionProtoV1.replace(
  "package grpc.reflection.v1;",
  "package grpc.reflection.v1alpha;"
);

function ensureDirectory() {
  fs.mkdirSync(protoDirectory, { recursive: true });
}

function normalizeEndpoint(endpoint, tls = false) {
  let value = String(endpoint || "").trim();
  if (!value) throw new Error("gRPC endpoint belum diisi.");

  const isHttps = value.startsWith("https://");
  value = value.replace(/^[a-z]+:\/\//i, "").replace(/\/$/, "");

  if (!value.includes(":")) {
    const defaultPort = (tls || isHttps) ? "443" : "80";
    value = `${value}:${defaultPort}`;
  }

  return value;
}

function credentialsFor(endpoint, tls) {
  const ep = String(endpoint || "").trim().toLowerCase();
  const isHttps = ep.startsWith("https://");
  const isStandardTlsPort = ep.endsWith(":443") || ep.endsWith(":9001");

  if (isHttps || isStandardTlsPort) {
    return grpc.credentials.createSsl();
  }

  if (typeof tls === "boolean") {
    return tls ? grpc.credentials.createSsl() : grpc.credentials.createInsecure();
  }

  return grpc.credentials.createInsecure();
}

function getChannelOptions(endpoint) {
  const cleanEp = String(endpoint || "").replace(/^[a-z]+:\/\//i, "").split("/")[0];
  const hostname = cleanEp.split(":")[0];
  
  return {
    'grpc.ssl_target_name_override': hostname,
    'grpc.default_authority': hostname
  };
}

function isServiceConstructor(value) {
  return typeof value === "function" && value.service && typeof value.service === "object";
}

function collectServices(value, namespace = "", seen = new Set()) {
  if (!value || (typeof value !== "object" && typeof value !== "function") || seen.has(value)) return [];
  seen.add(value);
  if (isServiceConstructor(value)) {
    return [{ name: namespace || value.serviceName || "Service", constructor: value, definition: value.service }];
  }

  const services = [];
  for (const [key, child] of Object.entries(value)) {
    if (["format", "serialize", "deserialize"].includes(key)) continue;
    services.push(...collectServices(child, namespace ? `${namespace}.${key}` : key, seen));
  }
  return services;
}

function methodNames(definition) {
  return Object.values(definition).map((method) => method.originalName || method.path?.split("/").pop());
}

function registerServices(packageDefinition, filename = "reflection") {
  const loaded = grpc.loadPackageDefinition(packageDefinition);
  const services = collectServices(loaded);
  for (const service of services) {
    const item = { ...service, filename, methods: methodNames(service.definition) };
    serviceCache.set(service.name, item);
    serviceCache.set(service.name.split(".").pop(), item);
  }
  return services.map((service) => ({ service: service.name, methods: methodNames(service.definition) }));
}

function findService(serviceName) {
  const exact = serviceCache.get(serviceName);
  if (exact) return exact;
  for (const [name, service] of serviceCache) {
    if (name.endsWith(`.${serviceName}`) || serviceName.endsWith(`.${name}`)) return service;
  }
  return null;
}

function findMethod(definition, methodName) {
  const wanted = String(methodName).toLowerCase();
  return Object.entries(definition).find(([key, method]) =>
    key.toLowerCase() === wanted || String(method.originalName || "").toLowerCase() === wanted
  );
}

function createMetadata(metadata = {}) {
  const result = new grpc.Metadata();
  const entries = Array.isArray(metadata)
    ? metadata.filter((item) => Array.isArray(item)).map(([key, value]) => [key, value])
    : Object.entries(metadata || {});
  for (const [key, value] of entries) {
    if (key && value !== undefined && value !== null) result.set(String(key), String(value));
  }
  return result;
}

function writeProto(content, filename) {
  ensureDirectory();
  const safeFilename = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, "_");
  const filePath = path.join(protoDirectory, `${Date.now()}-${safeFilename}`);
  fs.writeFileSync(filePath, content, "utf8");
  return filePath;
}

function protoOptions() {
  return { keepCase: true, longs: String, enums: String, defaults: true, oneofs: true };
}

async function loadLocalProto({ content, filename = "postdim.proto" }) {
  if (!content || !String(content).trim()) throw new Error("Isi file .proto kosong.");
  const filePath = writeProto(content, filename);
  const definition = protoLoader.loadSync(filePath, protoOptions());
  const services = registerServices(definition, filename);
  protoCache.set(filename, { filePath, services });
  return { services };
}

function reflectionDefinition(version = "v1") {
  ensureDirectory();
  const filename = version === "v1" ? "grpc-reflection-v1.proto" : "grpc-reflection-v1alpha.proto";
  const filePath = path.join(protoDirectory, filename);
  const content = version === "v1" ? reflectionProtoV1 : reflectionProtoV1Alpha;
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, content, "utf8");
  return protoLoader.loadSync(filePath, protoOptions());
}

function reflectionClient(endpoint, tls, version = "v1") {
  const loaded = grpc.loadPackageDefinition(reflectionDefinition(version));
  const ServiceConstructor = version === "v1"
    ? loaded.grpc.reflection.v1.ServerReflection
    : loaded.grpc.reflection.v1alpha.ServerReflection;
  
  const target = normalizeEndpoint(endpoint, tls);
  const creds = credentialsFor(endpoint, tls);
  const options = getChannelOptions(endpoint);

  return new ServiceConstructor(target, creds, options);
}

function reflectionCallSingle(endpoint, tls, request, version = "v1") {
  return new Promise((resolve, reject) => {
    const client = reflectionClient(endpoint, tls, version);
    const call = client.serverReflectionInfo(createMetadata());
    const responses = [];
    call.on("data", (response) => responses.push(response));
    call.on("error", (error) => {
      client.close();
      reject(error);
    });
    call.on("end", () => {
      client.close();
      resolve(responses);
    });
    call.write(request);
    call.end();
  });
}

async function reflectionCall(endpoint, tls, request) {
  let errV1, errV1Alpha;
  
  try {
    return await reflectionCallSingle(endpoint, tls, request, "v1");
  } catch (err) {
    errV1 = err;
  }

  try {
    return await reflectionCallSingle(endpoint, tls, request, "v1alpha");
  } catch (err) {
    errV1Alpha = err;
  }

  throw new Error(`gRPC Reflection Failed. V1: ${errV1?.message || 'N/A'} | V1Alpha: ${errV1Alpha?.message || 'N/A'}`);
}

function checkReflectionErrors(responses) {
  for (const response of responses) {
    const err = response.error_response || response.errorResponse;
    if (err) {
      throw new Error(`Server Reflection Error [Code ${err.error_code || err.errorCode}]: ${err.error_message || err.errorMessage}`);
    }
  }
}

function encodeVarint(value) {
  const bytes = [];
  let val = value >>> 0;
  while (val > 0x7f) {
    bytes.push((val & 0x7f) | 0x80);
    val >>>= 7;
  }
  bytes.push(val & 0x7f);
  return Buffer.from(bytes);
}

function buildFileDescriptorSet(descriptorBytes) {
  const buffers = [];
  for (const rawBytes of descriptorBytes) {
    const buf = Buffer.isBuffer(rawBytes) ? rawBytes : Buffer.from(rawBytes);
    if (!buf.length) continue;
    const tag = Buffer.from([0x0a]);
    const len = encodeVarint(buf.length);
    buffers.push(tag, len, buf);
  }
  return Buffer.concat(buffers);
}

async function loadReflectionServices(endpoint, tls = false) {
  const normalizedEp = normalizeEndpoint(endpoint, tls);
  const hostValue = normalizedEp.split(":")[0];
  const cacheKey = `${normalizedEp}|${Boolean(tls)}`;
  
  const namesResponse = await reflectionCall(endpoint, tls, { host: hostValue, list_services: "" });
  checkReflectionErrors(namesResponse);
  
  const names = namesResponse
    .flatMap((response) => {
      const resp = response.list_services_response || response.listServicesResponse;
      return resp?.service || [];
    })
    .map((service) => service.name)
    .filter((name) => Boolean(name) && !name.startsWith("grpc.reflection"));

  if (!names.length) throw new Error("Server reflection tidak mengembalikan service apa pun.");
  
  const allServices = [];
  const processedDescriptors = new Set();
  const descriptorBytesAccumulator = [];

  for (const serviceName of names) {
    const descriptorResponses = await reflectionCall(endpoint, tls, { host: hostValue, file_containing_symbol: serviceName });
    checkReflectionErrors(descriptorResponses);
    
    for (const response of descriptorResponses) {
      const fileResp = response.file_descriptor_response || response.fileDescriptorResponse;
      const protos = fileResp?.file_descriptor_proto || fileResp?.fileDescriptorProto || [];
      
      for (const protoByte of protos) {
        const bufKey = Buffer.from(protoByte).toString("base64");
        if (!processedDescriptors.has(bufKey)) {
          processedDescriptors.add(bufKey);
          descriptorBytesAccumulator.push(protoByte);
        }
      }
    }
  }

  if (!descriptorBytesAccumulator.length) {
    throw new Error("Gagal mengekstrak File Descriptor dari respon reflection.");
  }

  const descriptorSet = buildFileDescriptorSet(descriptorBytesAccumulator);
  const definition = protoLoader.loadFileDescriptorSetFromBuffer(descriptorSet, protoOptions());
  allServices.push(...registerServices(definition, `reflection:${cacheKey}`));

  reflectionCache.set(cacheKey, allServices);
  return allServices;
}

async function discoverServices({ endpoint, tls = false } = {}) {
  try {
    const services = await loadReflectionServices(endpoint, tls);
    return { services };
  } catch (error) {
    const cached = [...new Map([...serviceCache.values()].map((item) => [item.name, item])).values()];
    if (cached.length) {
      return { services: cached.map((item) => ({ service: item.name, methods: item.methods })) };
    }
    throw error;
  }
}

function normalizePayload(payload) {
  if (typeof payload !== "string") return payload || {};
  return JSON.parse(payload || "{}");
}

function collectStream(call, client, startedAt) {
  return new Promise((resolve, reject) => {
    const body = [];
    call.on("data", (item) => body.push(item));
    call.on("error", (error) => {
      client.close();
      reject(new Error(`gRPC ${error.code}: ${error.details || error.message}`));
    });
    call.on("end", () => {
      client.close();
      resolve({
        status: 200,
        body,
        body_formatted: body.map((item) => JSON.stringify(item, null, 2)).join("\n\n"),
        headers: [["content-type", "application/grpc"]],
        time: Date.now() - startedAt,
        size: Buffer.byteLength(JSON.stringify(body)),
        is_stream: true
      });
    });
  });
}

async function request({ endpoint, serviceMethod, payload = {}, metadata = {}, tls = false }) {
  const separator = String(serviceMethod || "").lastIndexOf("/");
  if (separator < 1) throw new Error("Format service/method tidak valid.");
  const serviceName = String(serviceMethod).slice(0, separator).replace(/^\//, "");
  const methodName = String(serviceMethod).slice(separator + 1);
  const service = findService(serviceName);
  if (!service) throw new Error(`Service '${serviceName}' belum dimuat. Upload proto atau jalankan reflection terlebih dahulu.`);

  const methodEntry = findMethod(service.definition, methodName);
  if (!methodEntry) throw new Error(`Method '${methodName}' tidak ditemukan pada service '${service.name}'.`);
  const [runtimeMethod, method] = methodEntry;
  
  const target = normalizeEndpoint(endpoint, tls);
  const creds = credentialsFor(endpoint, tls);
  const options = getChannelOptions(endpoint);
  const client = new service.constructor(target, creds, options);
  
  const requestPayload = normalizePayload(payload);
  const requestItems = Array.isArray(requestPayload) ? requestPayload : [requestPayload];
  const call = client[runtimeMethod] || client[method.originalName];
  if (typeof call !== "function") throw new Error(`Method runtime '${runtimeMethod}' tidak tersedia.`);

  const startedAt = Date.now();
  const callMetadata = createMetadata(metadata);

  if (method.requestStream && method.responseStream) {
    const stream = call.call(client, callMetadata);
    const result = collectStream(stream, client, startedAt);
    requestItems.forEach((item) => stream.write(item));
    stream.end();
    return result;
  }

  if (method.responseStream) {
    const stream = call.call(client, requestItems[0], callMetadata);
    return collectStream(stream, client, startedAt);
  }

  if (method.requestStream) {
    return new Promise((resolve, reject) => {
      const stream = call.call(client, callMetadata, (error, response) => {
        client.close();
        if (error) {
          reject(new Error(`gRPC ${error.code}: ${error.details || error.message}`));
          return;
        }
        resolve({
          status: 200,
          body: response,
          headers: [["content-type", "application/grpc"]],
          time: Date.now() - startedAt,
          size: Buffer.byteLength(JSON.stringify(response || {})),
          is_stream: false
        });
      });
      requestItems.forEach((item) => stream.write(item));
      stream.end();
    });
  }

  return new Promise((resolve, reject) => {
    call.call(client, requestItems[0], callMetadata, (error, response) => {
      client.close();
      if (error) {
        reject(new Error(`gRPC ${error.code}: ${error.details || error.message}`));
        return;
      }
      resolve({
        status: 200,
        body: response,
        headers: [["content-type", "application/grpc"]],
        time: Date.now() - startedAt,
        size: Buffer.byteLength(JSON.stringify(response || {})),
        is_stream: false
      });
    });
  });
}

module.exports = { loadLocalProto, discoverServices, request };
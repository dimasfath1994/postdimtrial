const fs = require("fs");
const path = require("path");
const vscode = require("vscode");

function activate(context) {
  const disposable = vscode.commands.registerCommand("postdim.open", () => {
    const panel = vscode.window.createWebviewPanel(
      "postdim",
      "Postdim",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "www")]
      }
    );

    panel.webview.onDidReceiveMessage(async (message) => {
      if (!message.type || !message.type.startsWith("postdim.")) {
        return;
      }

      try {
        let response;

        if (message.type === "postdim.navigate") {
          panel.webview.html = getWebviewContent(panel.webview, context.extensionUri, message.page);
          return;
        }

        if (message.type === "postdim.request") {
          response = await fetch(message.url, {
            method: message.method,
            headers: message.headers,
            body: ["GET", "HEAD"].includes(message.method.toUpperCase())
              ? undefined
              : deserializeRequestBody(message.body, message.headers)
          });
        } else if (message.type === "postdim.invoke") {
          response = await invokeExtensionCommand(message.command, message.payload);
        } else {
          return;
        }

        panel.webview.postMessage({
          type: "postdim.response",
          requestId: message.requestId,
          response: response instanceof Response
            ? {
                status: response.status,
                statusText: response.statusText,
                headers: Object.fromEntries(response.headers.entries()),
                body: await response.text()
              }
            : response
        });
      } catch (error) {
        panel.webview.postMessage({
          type: "postdim.response",
          requestId: message.requestId,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }, undefined, context.subscriptions);

    panel.webview.html = getWebviewContent(panel.webview, context.extensionUri, "index.html");
  });

  context.subscriptions.push(disposable);
}

async function invokeExtensionCommand(command, payload = {}) {
  const grpcClient = command === "load_local_proto" || command === "discover_grpc_services" || command === "grpc_request"
    ? require("./grpc-client")
    : null;

  if (command === "load_local_proto") {
    return grpcClient.loadLocalProto(payload);
  }
  if (command === "discover_grpc_services") {
    return grpcClient.discoverServices(payload);
  }
  if (command === "grpc_request") {
    return grpcClient.request({
      endpoint: payload.endpoint,
      serviceMethod: payload.serviceMethod || payload.service_method,
      payload: payload.payload,
      metadata: payload.metadata,
      tls: payload.tls
    });
  }
  if (command !== "http_request" && command !== "http_request_collabs") {
    throw new Error(`Command '${command}' belum tersedia di VS Code extension.`);
  }

  const method = String(payload.method || "GET").toUpperCase();
  let body = payload.body;
  const headers = { ...(payload.headers || {}) };

  if (Array.isArray(body)) {
    const form = new FormData();
    body.forEach((item) => {
      if (!item || item.enabled === false || !item.key) return;
      if (item.type === "file" && item.file_b64) {
        const bytes = Buffer.from(item.file_b64, "base64");
        form.append(item.key, new Blob([bytes]), item.file_name || "upload.bin");
      } else {
        form.append(item.key, item.value ?? "");
      }
    });
    body = form;
    delete headers["Content-Type"];
  } else if (body && typeof body === "object") {
    body = JSON.stringify(body);
    headers["Content-Type"] ||= "application/json";
  }

  const response = await fetch(payload.url, {
    method,
    headers,
    body: ["GET", "HEAD"].includes(method) ? undefined : body
  });

  return {
    status: response.status,
    statusText: response.statusText,
    headers: Object.fromEntries(response.headers.entries()),
    body: await response.text()
  };
}

function deserializeRequestBody(body, headers = {}) {
  if (!Array.isArray(body)) return body;
  const form = new FormData();
  body.forEach((item) => {
    if (!item || item.enabled === false || !item.key) return;
    if (item.type === "file" && item.file_b64) {
      form.append(item.key, new Blob([Buffer.from(item.file_b64, "base64")]), item.file_name || "upload.bin");
    } else {
      form.append(item.key, item.value ?? "");
    }
  });
  return form;
}

function getWebviewContent(webview, extensionUri, page = "index.html") {
  const safePage = ["index.html", "login.html", "collaboration.html"].includes(page) ? page : "index.html";
  const htmlPath = path.join(extensionUri.fsPath, "www", safePage);
  const wwwUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "www"));
  const workerUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "www", "lib", "js", "monaco-editor", "min", "vs", "workers-DcJshg-q.js")
  );
  const monacoBaseUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "www", "lib", "js", "monaco-editor", "min", "vs")
  );
  const nonce = getNonce();
  let html = fs.readFileSync(htmlPath, "utf8");

  html = html
    .replace(/(src|href)="\.\//g, `$1="${wwwUri}/`)
    .replace(
      'return "./lib/js/monaco-editor/min/vs/base/worker/workerMain.js"',
      `return "${workerUri}"`
    )
    .replace(
      'return "./lib/js/monaco-editor/min/vs/workers-DcJshg-q.js"',
      `return "${workerUri}"`
    )
    .replace(/<script(\s|>)/g, `<script nonce="${nonce}"$1`)
    .replace(
      "</head>",
      `<script nonce="${nonce}">${getBridgeScript(monacoBaseUri, workerUri)}</script>\n</head>`
    )
    .replace(
      "</head>",
      `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https: data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' ${webview.cspSource} 'unsafe-eval'; connect-src https: wss:; worker-src blob: ${webview.cspSource};">\n</head>`
    );

  return html;
}

function getBridgeScript(monacoBaseUri, workerUri) {
  return `(() => {
    window.__POSTDIM_MONACO_BASE__ = ${JSON.stringify(String(monacoBaseUri))};
    window.__POSTDIM_MONACO_WORKER__ = ${JSON.stringify(String(workerUri))};
    if (typeof acquireVsCodeApi !== "function" || window.postdimBridge) return;
    const vscode = acquireVsCodeApi();
    const pending = new Map();
    let nextRequestId = 0;
    window.addEventListener("message", (event) => {
      const message = event.data;
      if (message?.type !== "postdim.response") return;
      const request = pending.get(message.requestId);
      if (!request) return;
      pending.delete(message.requestId);
      if (message.error) request.reject(new Error(message.error));
      else request.resolve(message.response);
    });
    const send = (message) => new Promise((resolve, reject) => {
      const requestId = String(++nextRequestId);
      pending.set(requestId, { resolve, reject });
      vscode.postMessage({ ...message, requestId });
    });
    window.__POSTDIM_VSCODE__ = true;
    window.MonacoEnvironment = window.MonacoEnvironment || {};
    window.MonacoEnvironment.getWorkerUrl = () => window.__POSTDIM_MONACO_WORKER__;
    window.MonacoEnvironment.getWorker = (_moduleId, label) => new Worker(
      window.__POSTDIM_MONACO_WORKER__,
      { type: "module", name: label }
    );
    const serializeBody = async (body) => {
      if (body instanceof FormData) {
        const entries = [];
        for (const [key, value] of body.entries()) {
          if (typeof File !== "undefined" && value instanceof File) {
            const buffer = await value.arrayBuffer();
            const bytes = new Uint8Array(buffer);
            let binary = "";
            for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
            entries.push({ key, type: "file", value: "", file_b64: btoa(binary), file_name: value.name });
          } else {
            entries.push({ key, type: "text", value: String(value ?? "") });
          }
        }
        return entries;
      }
      if (body instanceof URLSearchParams) return body.toString();
      return body;
    };
    const bridgeRequest = async (payload) => send({
      type: "postdim.request",
      ...payload,
      body: await serializeBody(payload.body)
    });
    window.postdimBridge = {
      request: bridgeRequest,
      invoke: (command, payload = {}) => send({ type: "postdim.invoke", command, payload }),
      navigate: (page) => vscode.postMessage({ type: "postdim.navigate", page })
    };
    const nativeFetch = window.fetch.bind(window);
    window.fetch = async (input, init = {}) => {
      const requestUrl = typeof input === "string" ? input : input?.url;
      if (!/^https?:\\/\\//i.test(requestUrl || "")) return nativeFetch(input, init);
      const method = String(init.method || (typeof input === "object" ? input.method : "GET")).toUpperCase();
      const headers = Object.fromEntries(new Headers(init.headers || (typeof input === "object" ? input.headers : undefined)).entries());
      const body = await serializeBody(init.body);
      const result = await bridgeRequest({ method, url: requestUrl, headers, body });
      return new Response(result.body, { status: result.status, statusText: result.statusText, headers: result.headers });
    };
  })();`;
}

function getNonce() {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let nonce = "";

  for (let index = 0; index < 32; index += 1) {
    nonce += characters.charAt(Math.floor(Math.random() * characters.length));
  }

  return nonce;
}

function deactivate() {}

module.exports = {
  activate,
  deactivate
};
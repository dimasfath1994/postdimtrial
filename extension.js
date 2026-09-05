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
      if (message.type !== "postdim.request") {
        return;
      }

      try {
        const response = await fetch(message.url, {
          method: message.method,
          headers: message.headers,
          body: ["GET", "HEAD"].includes(message.method.toUpperCase())
            ? undefined
            : message.body
        });

        panel.webview.postMessage({
          type: "postdim.response",
          requestId: message.requestId,
          response: {
            status: response.status,
            statusText: response.statusText,
            headers: Object.fromEntries(response.headers.entries()),
            body: await response.text()
          }
        });
      } catch (error) {
        panel.webview.postMessage({
          type: "postdim.response",
          requestId: message.requestId,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }, undefined, context.subscriptions);

    panel.webview.html = getWebviewContent(panel.webview, context.extensionUri);
  });

  context.subscriptions.push(disposable);
}

function getWebviewContent(webview, extensionUri) {
  const htmlPath = path.join(extensionUri.fsPath, "www", "index.html");
  const wwwUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "www"));
  const nonce = getNonce();
  let html = fs.readFileSync(htmlPath, "utf8");

  html = html
    .replace(/(src|href)="\.\//g, `$1="${wwwUri}/`)
    .replace(
      'return "./lib/js/monaco-editor/min/vs/base/worker/workerMain.js"',
      `return "${wwwUri}/lib/js/monaco-editor/min/vs/base/worker/workerMain.js"`
    )
    .replace(/<script(\s|>)/g, `<script nonce="${nonce}"$1`)
    .replace(
      "</head>",
      `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https: data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' 'unsafe-eval'; connect-src https: wss:; worker-src blob: ${webview.cspSource};">\n</head>`
    );

  return html;
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
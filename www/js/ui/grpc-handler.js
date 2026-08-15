export class GrpcHandler {
  static editors = {
    body: null
  };

  /**
   * Safe JSON Parser khusus gRPC Body
   */
  static safeParseJSON(str, label = "gRPC Body") {
    if (!str || typeof str !== "string") return {};
    const trimmed = str.trim();
    if (!trimmed) return {};

    try {
      return JSON.parse(trimmed);
    } catch (err) {
      try {
        const sanitized = trimmed
          .replace(/(['"])?([a-zA-Z0-9_]+)(['"])?\s*:/g, '"$2":')
          .replace(/'/g, '"')
          .replace(/,\s*([}\]])/g, "$1");
        return JSON.parse(sanitized);
      } catch (fallbackErr) {
        console.warn(`[${label}] Format JSON tidak valid:`, err);
        return {};
      }
    }
  }

  /**
   * Menyimpan perubahan dari UI/Monaco Editor ke state tab
   */
  static syncToState(tab, ui = {}) {
    if (!tab?.body) return;
    tab.body.grpc ||= {};

    const inputMethod = ui.grpcServiceMethod || document.getElementById("grpcServiceMethod");
    const inputBody = ui.grpcBody || document.getElementById("grpcBody");

    const currentBody = this.editors.body
      ? this.editors.body.getValue()
      : (inputBody?.value || tab.body.grpc.body || "");

    // Menggunakan || agar jika inputMethod.value bernilai "" tidak menimpa state lama
    const currentMethod = inputMethod?.value || tab.body.grpc.serviceMethod || "";

    tab.body.grpc.body = currentBody;
    tab.body.grpc.serviceMethod = currentMethod;
  }

  /**
   * Inisialisasi UI, Event Listener, dan Proto Upload
   */
  static setupUI(ui, tabs, scheduleSync) {
    const handleInputChange = () => {
      this.syncToState(tabs.getActive(), ui);
      scheduleSync();
    };

    // Handler Upload File .proto
    const chooseProtoBtn = document.getElementById("chooseProtoBtn");
    const grpcProtoFile = document.getElementById("grpcProtoFile");
    const protoFileName = document.getElementById("protoFileName");

    if (chooseProtoBtn && grpcProtoFile) {
      chooseProtoBtn.onclick = () => grpcProtoFile.click();
      grpcProtoFile.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
          if (protoFileName) protoFileName.textContent = file.name;
          const activeTab = tabs.getActive();
          if (activeTab?.body) {
            activeTab.body.grpc ||= {};
            activeTab.body.grpc.protoFileName = file.name;
            scheduleSync();
          }
        }
      };
    }

    if (window.monaco) {
      this.initMonacoEditors(ui, tabs, scheduleSync);
    } else {
      const inputBody = ui.grpcBody || document.getElementById("grpcBody");
      if (inputBody) inputBody.classList.remove("hidden");
    }

    const inputMethod = ui.grpcServiceMethod || document.getElementById("grpcServiceMethod");
    const inputBody = ui.grpcBody || document.getElementById("grpcBody");

    inputMethod?.addEventListener("input", handleInputChange);
    inputBody?.addEventListener("input", handleInputChange);
  }

  /**
   * Inisialisasi Monaco Editor untuk gRPC Body
   */
  static initMonacoEditors(ui, tabs, scheduleSync) {
    const grpcEl = document.getElementById("grpcMessageEditor");

    const onContentChange = () => {
      this.syncToState(tabs.getActive(), ui);
      scheduleSync();
    };

    if (grpcEl && !this.editors.body) {
      const inputBody = ui.grpcBody || document.getElementById("grpcBody");
      this.editors.body = monaco.editor.create(grpcEl, {
        value: inputBody?.value || "",
        language: "json",
        theme: "vs-dark",
        automaticLayout: true,
        minimap: { enabled: false }
      });
      this.editors.body.onDidChangeModelContent(() => {
        if (inputBody) inputBody.value = this.editors.body.getValue();
        onContentChange();
      });
    }
  }

  /**
   * Load data dari state ke UI/Editor
   */
  static syncFromState(tab, ui = {}) {
    const body = tab?.body;
    if (!body || body.mode !== "grpc") return;

    const bodyVal = body.grpc?.body || "";
    const methodVal = body.grpc?.serviceMethod || "";
    const protoName = body.grpc?.protoFileName || "";

    const inputBody = ui.grpcBody || document.getElementById("grpcBody");
    const inputMethod = ui.grpcServiceMethod || document.getElementById("grpcServiceMethod");

    if (this.editors.body) {
      this.editors.body.setValue(bodyVal);
    } else if (inputBody) {
      inputBody.value = bodyVal;
    }

    if (inputMethod) inputMethod.value = methodVal;

    const protoFileNameEl = document.getElementById("protoFileName");
    if (protoFileNameEl) protoFileNameEl.textContent = protoName || "Pilih file .proto";
  }

  /**
   * Tampilkan/sembunyikan gRPC Box UI
   */
  static renderUI(body) {
    const grpcBox = document.getElementById("grpcBox");
    if (!grpcBox) return;

    if (body?.mode === "grpc") {
      grpcBox.classList.remove("hidden");
      setTimeout(() => {
        this.editors.body?.layout();
      }, 50);
    } else {
      grpcBox.classList.add("hidden");
    }
  }

  /**
   * Format payload request gRPC
   */
  static prepareRequestBody(tab, resolveVars = (v) => v) {
    const tabBody = tab?.body;
    if (tabBody?.mode !== "grpc") return null;

    const domMethod = document.getElementById("grpcServiceMethod")?.value || "";
    const rawMethod = tabBody.grpc?.serviceMethod || domMethod;
    const rawBody = tabBody.grpc?.body || "";

    return {
      serviceMethod: resolveVars(rawMethod),
      protoFileName: tabBody.grpc?.protoFileName || "",
      data: this.safeParseJSON(resolveVars(rawBody), "gRPC Body")
    };
  }
}
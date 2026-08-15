export class GrpcHandler {
  static editors = {
    body: null
  };
  
  // Flag pencegah loop event Monaco saat switch tab
  static isSyncingFromState = false;

  /**
   * Helper pemanggil Tauri Command yang aman untuk browser & Tauri Desktop
   */
  static async invokeTauri(command, payload = {}) {
    try {
      if (window.__TAURI__?.core?.invoke) {
        return await window.__TAURI__.core.invoke(command, payload);
      } else if (window.__TAURI_INTERNALS__?.invoke) {
        return await window.__TAURI_INTERNALS__.invoke(command, payload);
      } else {
        console.warn(`[Tauri Safe Invoke] Command '${command}' diabaikan (bukan di environment Tauri).`);
        return null;
      }
    } catch (err) {
      console.error(`[Tauri Invoke Error] ${command}:`, err);
      throw err;
    }
  }

  /**
   * Mengambil daftar Service/Method dari gRPC Server Reflection via Tauri Backend
   */
  static async loadReflectionServices(endpoint) {
    const datalist = document.getElementById("grpcServicesList");
    const statusBtn = document.getElementById("btnFetchReflection");
    if (!endpoint || !endpoint.trim()) return;

    if (statusBtn) {
      statusBtn.textContent = "⏳ Fetching...";
      statusBtn.disabled = true;
    }

    try {
      const res = await this.invokeTauri("discover_grpc_services", {
        endpoint: endpoint.trim()
      });

      if (datalist && res) {
        datalist.innerHTML = "";
        const services = res?.services || [];

        if (services.length === 0) {
          if (statusBtn) statusBtn.textContent = "⚠️ No Services Found";
        } else {
          services.forEach((svc) => {
            const opt = document.createElement("option");
            opt.value = svc;
            datalist.appendChild(opt);
          });
          if (statusBtn) statusBtn.textContent = `✅ ${services.length} Services Loaded`;
        }
      }
    } catch (err) {
      console.warn("[gRPC Reflection Error]", err);
      if (statusBtn) statusBtn.textContent = "❌ Reflection Failed";
    } finally {
      if (statusBtn) statusBtn.disabled = false;
    }
  }

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
      : (inputBody ? inputBody.value : (tab.body.grpc.body || ""));

    // FIX: Menggunakan pengecekan eksplisit agar user bisa mengosongkan input
    const currentMethod = inputMethod ? inputMethod.value : (tab.body.grpc.serviceMethod || "");

    tab.body.grpc.body = currentBody;
    tab.body.grpc.serviceMethod = currentMethod;
  }

  /**
   * Inisialisasi UI, Event Listener, Proto Upload, dan Reflection Auto-Trigger
   */
  static setupUI(ui, tabs, scheduleSync) {
    const handleInputChange = () => {
      if (this.isSyncingFromState) return;
      this.syncToState(tabs.getActive(), ui);
      scheduleSync();
    };

    // Auto-trigger reflection saat URL / Method gRPC dipilih
    const urlInput = document.getElementById("url");
    const methodSelect = document.getElementById("method");
    const btnReflection = document.getElementById("btnFetchReflection");

    const triggerReflection = () => {
      const currentMethod = methodSelect?.value;
      const currentUrl = urlInput?.value;
      if (currentMethod === "GRPC" && currentUrl) {
        this.loadReflectionServices(currentUrl);
      }
    };

    urlInput?.addEventListener("blur", triggerReflection);
    urlInput?.addEventListener("change", triggerReflection);
    methodSelect?.addEventListener("change", triggerReflection);
    btnReflection?.addEventListener("click", () => {
      if (urlInput?.value) this.loadReflectionServices(urlInput.value);
    });

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
        if (this.isSyncingFromState) return;
        
        if (inputBody) inputBody.value = this.editors.body.getValue();
        this.syncToState(tabs.getActive(), ui);
        scheduleSync();
      });
    }
  }

  /**
   * Load data dari state ke UI/Editor
   */
  static syncFromState(tab, ui = {}) {
    const body = tab?.body;
    if (!body || body.mode !== "grpc") return;

    this.isSyncingFromState = true; // Aktifkan flag pengunci

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

    this.isSyncingFromState = false; // Matikan pengunci
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
   * Format payload request gRPC sebelum dikirim ke Tauri Rust backend
   */
  static prepareRequestBody(tab, resolveVars = (v) => v) {
    const tabBody = tab?.body;
    if (tabBody?.mode !== "grpc") return null;

    const domMethod = document.getElementById("grpcServiceMethod")?.value || "";
    const rawMethod = domMethod || tabBody.grpc?.serviceMethod || "";
    const rawBody = tabBody.grpc?.body || "";

    return {
      serviceMethod: resolveVars(rawMethod),
      protoFileName: tabBody.grpc?.protoFileName || "",
      data: this.safeParseJSON(resolveVars(rawBody), "gRPC Body")
    };
  }
}
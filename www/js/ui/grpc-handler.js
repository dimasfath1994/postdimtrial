export class GrpcHandler {
  static editors = {
    body: null
  };
  
  static isSyncingFromState = false;

  static async invokeTauri(command, payload = {}) {
    try {
      if (window.__TAURI__?.core?.invoke) {
        return await window.__TAURI__.core.invoke(command, payload);
      } else if (window.__TAURI_INTERNALS__?.invoke) {
        return await window.__TAURI_INTERNALS__.invoke(command, payload);
      } else {
        console.warn(`[Tauri Safe Invoke] Command '${command}' diabaikan.`);
        return null;
      }
    } catch (err) {
      console.error(`[Tauri Invoke Error] ${command}:`, err);
      throw err;
    }
  }

  static async loadReflectionServices(endpoint) {
    const selectElement = document.getElementById("grpcServiceMethod");
    const statusBtn = document.getElementById("btnFetchReflection");
    if (!endpoint || !endpoint.trim()) return;

    if (statusBtn) {
      statusBtn.textContent = "⏳ Fetching...";
      statusBtn.disabled = true;
    }

    try {
      const res = await this.invokeTauri("discover_grpc_services", { endpoint: endpoint.trim() });
      if (selectElement && res) {
        selectElement.innerHTML = '<option value="">-- Pilih Service / Method --</option>';
        const services = res?.services || [];
        
        if (services.length === 0) {
          if (statusBtn) statusBtn.textContent = "⚠️ No Services Found";
        } else {
          let total = 0;
          services.forEach((item) => {
            if (typeof item === "object" && item?.service && Array.isArray(item.methods)) {
              // Buat optgroup untuk setiap Service (seperti grup di Postman)
              const optGroup = document.createElement("optgroup");
              optGroup.label = item.service;

              item.methods.forEach((method) => {
                const opt = document.createElement("option");
                opt.value = `${item.service}/${method}`;
                opt.textContent = method;
                optGroup.appendChild(opt);
                total++;
              });

              selectElement.appendChild(optGroup);
            } else {
              // Fallback jika format data berupa string biasa / item tunggal
              const opt = document.createElement("option");
              opt.value = typeof item === "string" ? item : JSON.stringify(item);
              opt.textContent = opt.value;
              selectElement.appendChild(opt);
              total++;
            }
          });
          if (statusBtn) statusBtn.textContent = `✅ Loaded (${total} endpoints)`;
        }
      }
    } catch (err) {
      if (statusBtn) statusBtn.textContent = "❌ Reflection Failed";
      console.error("Gagal melakukan gRPC discovery:", err);
    } finally {
      if (statusBtn) statusBtn.disabled = false;
    }
  }

  static safeParseJSON(str) {
    if (!str || typeof str !== "string") return {};
    const trimmed = str.trim();
    if (!trimmed) return {};
    try {
      return JSON.parse(trimmed);
    } catch (err) {
      try {
        const sanitized = trimmed.replace(/(['"])?([a-zA-Z0-9_]+)(['"])?\s*:/g, '"$2":').replace(/'/g, '"').replace(/,\s*([}\]])/g, "$1");
        return JSON.parse(sanitized);
      } catch (e) { 
        console.warn("[SafeParseJSON] Gagal memparsing JSON payload, mengirim objek kosong/mentah.");
        return {}; 
      }
    }
  }

  static syncToState(tab, ui = {}) {
    if (!tab) return;
    tab.body ||= {};
    tab.body.grpc ||= {};
    
    const inputMethod = ui.grpcServiceMethod || document.getElementById("grpcServiceMethod");
    const inputBody = ui.grpcBody || document.getElementById("grpcBody");
    
    tab.body.grpc.body = this.editors.body ? this.editors.body.getValue() : (inputBody?.value || "");
    tab.body.grpc.serviceMethod = inputMethod?.value || "";
  }

  static setupUI(ui, tabs, scheduleSync) {
    const handleInputChange = () => {
      if (this.isSyncingFromState) return;
      this.syncToState(tabs.getActive(), ui);
      scheduleSync();
    };

    const methodSelect = document.getElementById("method");
    const grpcTabButtons = document.querySelectorAll("[data-grpc-tab]");
    const grpcPanels = document.querySelectorAll(".grpc-tab-panel");
    const grpcPanelsContainer = document.getElementById("grpcPanelsContainer");

    const btnFetchReflection = document.getElementById("btnFetchReflection");
    btnFetchReflection?.addEventListener("click", () => {
      const endpoint = document.getElementById("url")?.value || "";
      this.loadReflectionServices(endpoint);
    });

    grpcTabButtons.forEach(btn => {
      btn.addEventListener("click", () => {
        grpcTabButtons.forEach(t => t.classList.remove("active"));
        btn.classList.add("active");

        const targetTab = btn.getAttribute("data-grpc-tab");
        const sharedPanel = btn.getAttribute("data-shared-panel");

        if (sharedPanel) {
          if (grpcPanelsContainer) {
            grpcPanelsContainer.style.display = "none";
          }
          grpcPanels.forEach(p => p.style.display = "none");

          document.querySelectorAll(".tab-panel").forEach(p => {
            const pName = (p.getAttribute("data-panel") || p.id || "").toLowerCase();
            if (pName.includes(sharedPanel.toLowerCase())) {
              p.style.display = "block";
            } else {
              p.style.display = "none";
            }
          });
        } else {
          if (grpcPanelsContainer) {
            grpcPanelsContainer.style.display = "block";
          }

          document.querySelectorAll(".tab-panel").forEach(p => {
            p.style.display = "none";
          });

          grpcPanels.forEach(panel => {
            if (panel.getAttribute("data-grpc-panel") === targetTab) {
              panel.style.display = "block";
              if (targetTab === "message") setTimeout(() => this.editors.body?.layout(), 50);
            } else {
              panel.style.display = "none";
            }
          });
        }
      });
    });

    methodSelect?.addEventListener("change", (e) => {
      const isGrpc = e.target.value.toUpperCase() === "GRPC";
      this.renderUI({ mode: isGrpc ? "grpc" : "http" });
      
      const activeTab = tabs.getActive();
      if (activeTab) {
        activeTab.method = e.target.value;
        if (isGrpc) {
          activeTab.body ||= {};
          activeTab.body.mode = "grpc";
        } else {
          activeTab.body ||= {};
          activeTab.body.mode = "raw";
        }
        scheduleSync();
      }
    });

    document.getElementById("grpcServiceMethod")?.addEventListener("change", handleInputChange);
    document.getElementById("grpcBody")?.addEventListener("input", handleInputChange);
  }

  static initMonacoEditors(ui, tabs, scheduleSync) {
    const grpcEl = document.getElementById("grpcMessageEditor");
    if (grpcEl && !this.editors.body) {
      const inputBody = ui.grpcBody || document.getElementById("grpcBody");
      this.editors.body = monaco.editor.create(grpcEl, {
        value: inputBody?.value || "",
        language: "json", theme: "vs-dark", automaticLayout: true, minimap: { enabled: false }
      });
      this.editors.body.onDidChangeModelContent(() => {
        if (this.isSyncingFromState) return;
        if (inputBody) inputBody.value = this.editors.body.getValue();
        this.syncToState(tabs.getActive(), ui);
        scheduleSync();
      });
    }
  }

  static syncFromState(tab, ui = {}) {
    if (!tab) return;
    
    const isGrpc = (tab.method || "").toUpperCase() === "GRPC" || tab.body?.mode === "grpc";
    
    this.isSyncingFromState = true;
    this.renderUI({ mode: isGrpc ? "grpc" : "http" });

    if (isGrpc) {
      const inputBody = ui.grpcBody || document.getElementById("grpcBody");
      const inputMethod = ui.grpcServiceMethod || document.getElementById("grpcServiceMethod");
      
      if (this.editors.body) {
        this.editors.body.setValue(tab.body?.grpc?.body || "");
      } else if (inputBody) {
        inputBody.value = tab.body?.grpc?.body || "";
      }
      
      if (inputMethod) {
        inputMethod.value = tab.body?.grpc?.serviceMethod || "";
      }
      
      const protoFileNameEl = document.getElementById("protoFileName");
      if (protoFileNameEl) {
        protoFileNameEl.textContent = tab.body?.grpc?.protoFileName || "No .proto loaded";
      }
    }

    this.isSyncingFromState = false;
  }

  static renderUI(body) {
    const grpcReqTabs = document.getElementById("grpcReqTabs");
    const grpcPanelsContainer = document.getElementById("grpcPanelsContainer");
    const reqTabs = document.getElementById("reqTabs");

    const isGrpc = body?.mode === "grpc";

    if (isGrpc) {
      if (reqTabs) reqTabs.style.display = "none";
      if (grpcReqTabs) grpcReqTabs.style.display = "flex";
      if (grpcPanelsContainer) grpcPanelsContainer.style.display = "block";

      const defaultGrpcPanel = document.querySelector('.grpc-tab-panel[data-grpc-panel="message"]');
      const defaultGrpcTabBtn = document.querySelector('[data-grpc-tab="message"]');
      
      if (defaultGrpcPanel && defaultGrpcTabBtn) {
        document.querySelectorAll(".grpc-tab-panel").forEach(p => {
          p.style.display = "none";
        });
        document.querySelectorAll("[data-grpc-tab]").forEach(t => t.classList.remove("active"));
        
        defaultGrpcPanel.style.display = "block";
        defaultGrpcTabBtn.classList.add("active");
      }
    } else {
      if (grpcReqTabs) grpcReqTabs.style.display = "none";
      if (grpcPanelsContainer) grpcPanelsContainer.style.display = "none";
      
      if (reqTabs) reqTabs.style.display = "flex";

      document.querySelectorAll(".grpc-tab-panel").forEach(p => {
        p.style.display = "none";
      });
      
      document.querySelectorAll(".tab-panel").forEach(p => {
        p.style.display = "";
      });
    }
  }

  static prepareRequestBody(tab, resolveVars = (v) => v) {
    const tabBody = tab?.body;
    const isGrpc = (tab?.method || "").toUpperCase() === "GRPC" || tabBody?.mode === "grpc";
    if (!isGrpc) return null;
    
    const domMethod = document.getElementById("grpcServiceMethod")?.value || "";
    const rawServiceMethod = domMethod || tabBody?.grpc?.serviceMethod || "";
    const cleanedServiceMethod = resolveVars(rawServiceMethod).trim();

    const rawBodyText = this.editors.body ? this.editors.body.getValue() : (tabBody?.grpc?.body || "{}");
    const resolvedBodyText = resolveVars(rawBodyText).trim();

    let parsedData = {};
    if (resolvedBodyText && resolvedBodyText !== "{}") {
      parsedData = this.safeParseJSON(resolvedBodyText);
    }

    return {
      serviceMethod: cleanedServiceMethod,
      protoFileName: tabBody?.grpc?.protoFileName || "",
      data: parsedData
    };
  }

  static async sendRequest(tab, resolveVars = (v) => v) {
    const payload = this.prepareRequestBody(tab, resolveVars);
    if (!payload || !payload.serviceMethod) {
      throw new Error("gRPC Service / Method belum dipilih atau belum diisi!");
    }
    
    const endpoint = document.getElementById("url")?.value?.trim();
    if (!endpoint) {
      throw new Error("gRPC Endpoint URL belum diisi!");
    }

    try {
      // Timeout JavaScript diatur ke 20 detik (selaras dengan batas waktu di Rust backend)
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Timeout JS: Backend Rust macet / tidak merespons dalam 20 detik!")), 20000)
      );

      const response = await Promise.race([
        this.invokeTauri("grpc_request", {
          endpoint: endpoint,
          serviceMethod: payload.serviceMethod,
          payload: payload.data 
        }),
        timeoutPromise
      ]);

      return response;
    } catch (err) {
      console.error("❌ gRPC Request Error:", err);
      throw err;
    }
  }
}
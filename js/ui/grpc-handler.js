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
        console.warn(`[Tauri Safe Invoke] Command '${command}' diabaikan (Tauri API tidak ditemukan).`);
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

    // Pastikan dropdown di-reset sebelum memulai fetch baru
    if (selectElement) {
      selectElement.innerHTML = '<option value="">-- Pilih Service / Method --</option>';
    }

    try {
      const res = await this.invokeTauri("discover_grpc_services", { endpoint: endpoint.trim() });
      if (selectElement && res) {
        const services = res?.services || [];
        
        if (services.length === 0) {
          if (statusBtn) statusBtn.textContent = "⚠️ No Services Found";
        } else {
          let total = 0;
          services.forEach((item) => {
            if (typeof item === "object" && item?.service && Array.isArray(item.methods)) {
              const optGroup = document.createElement("optgroup");
              optGroup.label = item.service;

              item.methods.forEach((method) => {
                const opt = document.createElement("option");
                
                // Pastikan format 'method' dari backend sudah "Service/Method"
                const fullServiceMethod = method.includes('/') ? method : `${item.service}/${method}`;
                const methodName = method.includes('/') ? method.split('/').pop() : method;

                opt.value = fullServiceMethod; // NILAI UTAMA WAJIB LENGKAP: "Service/Method"
                opt.textContent = methodName;  // Teks yang tampil di dropdown cukup nama method-nya agar rapi
                optGroup.appendChild(opt);
                total++;
              });

              selectElement.appendChild(optGroup);
            } else {
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
      if (selectElement) {
        selectElement.innerHTML = '<option value="">-- Gagal memuat reflection --</option>';
      }
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
        // Coba perbaiki format JSON yang malformed (kutip tunggal, trailing comma, dll)
        const sanitized = trimmed
          .replace(/(['"])?([a-zA-Z0-9_]+)(['"])?\s*:/g, '"$2":')
          .replace(/'/g, '"')
          .replace(/,\s*([}\]])/g, "$1");
        return JSON.parse(sanitized);
      } catch (e) { 
        console.warn("[SafeParseJSON] Gagal memparsing JSON payload, mengirim objek kosong/mentah ke Rust.");
        return {}; 
      }
    }
  }

  // =========================================================================
  // RENDER & SYNC METADATA gRPC
  // =========================================================================
  static renderGrpcMetadata(tab) {
    const container = document.getElementById("grpcMetadataBox");
    if (!container) return;
    
    container.innerHTML = "";
    
    tab.body ||= {};
    tab.body.grpc ||= {};
    tab.body.grpc.metadata ||= [{ key: "", value: "", active: true }];

    const metadataList = tab.body.grpc.metadata;

    metadataList.forEach((item, index) => {
      const row = document.createElement("div");
      row.style.cssText = "display: flex; align-items: center; border-bottom: 1px solid #2a2a2a; padding: 4px 10px;";
      
      row.innerHTML = `
        <div style="width: 30px; text-align: center;">
          <input type="checkbox" class="grpc-meta-active" data-index="${index}" ${item.active !== false ? "checked" : ""}>
        </div>
        <div style="flex: 1; padding: 0 5px;">
          <input type="text" class="grpc-meta-key" data-index="${index}" value="${item.key || ""}" placeholder="Key" style="width: 100%; background: transparent; border: none; color: #fff; outline: none; font-size: 12px;">
        </div>
        <div style="flex: 1; padding: 0 5px;">
          <input type="text" class="grpc-meta-val" data-index="${index}" value="${item.value || ""}" placeholder="Value" style="width: 100%; background: transparent; border: none; color: #fff; outline: none; font-size: 12px;">
        </div>
        <div style="width: 30px; text-align: center;">
          <button type="button" class="grpc-meta-del" data-index="${index}" style="background: none; border: none; color: #888; cursor: pointer; font-size: 14px;">&times;</button>
        </div>
      `;
      container.appendChild(row);
    });
  }

  static syncToState(tab, ui = {}) {
    if (!tab) return;
    tab.body ||= {};
    tab.body.grpc ||= {};
    
    const inputMethod = ui.grpcServiceMethod || document.getElementById("grpcServiceMethod");
    const inputBody = ui.grpcBody || document.getElementById("grpcBody");
    
    tab.body.grpc.body = this.editors.body ? this.editors.body.getValue() : (inputBody?.value || "");
    tab.body.grpc.serviceMethod = inputMethod?.value || "";

    // Sync input metadata dinamis dari DOM langsung ke state tab
    const container = document.getElementById("grpcMetadataBox");
    if (container && tab.body.grpc.metadata) {
      container.querySelectorAll("input.grpc-meta-key").forEach(input => {
        const idx = input.dataset.index;
        if (idx !== undefined && tab.body.grpc.metadata[idx]) {
          tab.body.grpc.metadata[idx].key = input.value;
        }
      });
      container.querySelectorAll("input.grpc-meta-val").forEach(input => {
        const idx = input.dataset.index;
        if (idx !== undefined && tab.body.grpc.metadata[idx]) {
          tab.body.grpc.metadata[idx].value = input.value;
        }
      });
      container.querySelectorAll("input.grpc-meta-active").forEach(input => {
        const idx = input.dataset.index;
        if (idx !== undefined && tab.body.grpc.metadata[idx]) {
          tab.body.grpc.metadata[idx].active = input.checked;
        }
      });
    }
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

    // =========================================================================
    // SETUP EVENT LISTENER UNTUK UPLOAD .PROTO LOKAL
    // =========================================================================
    const chooseProtoBtn = document.getElementById("chooseProtoBtn");
    const grpcProtoFile = document.getElementById("grpcProtoFile");
    const protoFileName = document.getElementById("protoFileName");

    chooseProtoBtn?.addEventListener("click", () => {
      grpcProtoFile?.click();
    });

    grpcProtoFile?.addEventListener("change", async (event) => {
      const file = event.target.files[0];
      if (!file) return;

      try {
        const content = await file.text();
        
        // Panggil command Rust yang mengembalikan JSON dinamis (Pilihan 2)
        const result = await this.invokeTauri("load_local_proto", { 
          content: content, 
          filename: file.name 
        });

        // Simpan nama file ke state tab aktif
        const activeTab = tabs.getActive();
        if (activeTab) {
          activeTab.body ||= {};
          activeTab.body.grpc ||= {};
          activeTab.body.grpc.protoFileName = file.name;
          scheduleSync();
        }

        // Update UI Label
        if (protoFileName) {
          protoFileName.textContent = file.name;
          protoFileName.style.color = "#4CAF50"; // Hijau jika sukses
        }

        // Otomatis isi dropdown grpcServiceMethod dari result.services
        const selectElement = document.getElementById("grpcServiceMethod");
        if (selectElement && result?.services) {
          selectElement.innerHTML = '<option value="">-- Pilih Service / Method --</option>';
          let total = 0;

          result.services.forEach((item) => {
            if (item?.service && Array.isArray(item.methods)) {
              const optGroup = document.createElement("optgroup");
              optGroup.label = item.service;

              item.methods.forEach((method) => {
                const opt = document.createElement("option");
                const fullServiceMethod = `${item.service}/${method}`;
                
                opt.value = fullServiceMethod; // Format: "package.Service/Method"
                opt.textContent = method;      // Nama method saja agar rapi
                optGroup.appendChild(opt);
                total++;
              });

              selectElement.appendChild(optGroup);
            }
          });
          console.log(`>>> [Local Proto Loaded]: ${result.message || file.name} (${total} endpoints)`);
        } else {
          console.log(">>> [Local Proto Loaded]:", result);
        }
      } catch (err) {
        console.error("❌ Gagal memuat file .proto lokal:", err);
        if (protoFileName) {
          protoFileName.textContent = "Error loading file";
          protoFileName.style.color = "red";
        }
      }
    });

    // Setup event listener interaktif untuk tabel Metadata gRPC
    const metadataBox = document.getElementById("grpcMetadataBox");
    metadataBox?.addEventListener("input", (e) => {
      if (this.isSyncingFromState) return;
      handleInputChange();
    });

    metadataBox?.addEventListener("change", (e) => {
      if (this.isSyncingFromState) return;
      handleInputChange();
    });

    metadataBox?.addEventListener("click", (e) => {
      if (e.target.classList.contains("grpc-meta-del")) {
        const idx = parseInt(e.target.dataset.index, 10);
        const activeTab = tabs.getActive();
        if (activeTab && activeTab.body?.grpc?.metadata) {
          activeTab.body.grpc.metadata.splice(idx, 1);
          if (activeTab.body.grpc.metadata.length === 0) {
            activeTab.body.grpc.metadata.push({ key: "", value: "", active: true });
          }
          this.renderGrpcMetadata(activeTab);
          handleInputChange();
        }
      }
    });

    document.getElementById("addGrpcMetadata")?.addEventListener("click", () => {
      const activeTab = tabs.getActive();
      if (!activeTab) return;
      activeTab.body ||= {};
      activeTab.body.grpc ||= {};
      activeTab.body.grpc.metadata ||= [];
      activeTab.body.grpc.metadata.push({ key: "", value: "", active: true });
      this.renderGrpcMetadata(activeTab);
      handleInputChange();
    });

    grpcTabButtons.forEach(btn => {
      btn.addEventListener("click", () => {
        grpcTabButtons.forEach(t => t.classList.remove("active"));
        btn.classList.add("active");

        const targetTab = btn.getAttribute("data-grpc-tab");
        const sharedPanel = btn.getAttribute("data-shared-panel");

        if (sharedPanel) {
          // Sembunyikan kontainer gRPC khusus
          if (grpcPanelsContainer) {
            grpcPanelsContainer.style.display = "none";
          }
          grpcPanels.forEach(p => p.style.display = "none");

          // Tampilkan panel shared (Auth atau Scripts) dari HTTP area
          document.querySelectorAll(".tab-panel").forEach(p => {
            const pName = (p.getAttribute("data-panel") || p.id || "").toLowerCase();
            if (pName.includes(sharedPanel.toLowerCase())) {
              p.style.display = "block";
              // Trigger layout ulang untuk editor Monaco script jika panel scripts dibuka
              if (sharedPanel === "scripts") {
                setTimeout(() => {
                  if (window.preScriptEditor) window.preScriptEditor.layout();
                  if (window.postScriptEditor) window.postScriptEditor.layout();
                }, 50);
              }
            } else {
              p.style.display = "none";
            }
          });
        } else {
          // Tampilkan kembali kontainer gRPC khusus
          if (grpcPanelsContainer) {
            grpcPanelsContainer.style.display = "block";
          }

          // Sembunyikan semua panel tab HTTP/shared
          document.querySelectorAll(".tab-panel").forEach(p => {
            p.style.display = "none";
          });

          grpcPanels.forEach(panel => {
            if (panel.getAttribute("data-grpc-panel") === targetTab) {
              panel.style.display = "block";
              // Timeout kecil agar layout editor Monaco bisa re-render sempurna setelah di-display
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
    
    // Tambahan listener untuk Auth agar langsung mentrigger sinkronisasi state
    document.getElementById("authType")?.addEventListener("change", handleInputChange);
    document.getElementById("authValue")?.addEventListener("input", handleInputChange);
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

      // Render ulang metadata dari state tab
      this.renderGrpcMetadata(tab);
      
      const protoFileNameEl = document.getElementById("protoFileName");
      if (protoFileNameEl) {
        const loadedName = tab.body?.grpc?.protoFileName;
        if (loadedName) {
          protoFileNameEl.textContent = loadedName;
          protoFileNameEl.style.color = "#4CAF50";
        } else {
          protoFileNameEl.textContent = "No .proto loaded";
          protoFileNameEl.style.color = "#aaa";
        }
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

    // Ambil metadata yang aktif saja untuk dikirimkan
    const rawMetadata = tabBody?.grpc?.metadata || [];
    const resolvedMetadata = {};
    rawMetadata.forEach(m => {
      if (m.active !== false && m.key && m.key.trim() !== "") {
        resolvedMetadata[resolveVars(m.key).trim()] = resolveVars(m.value || "");
      }
    });

    // Tangkap Konfigurasi Auth (Menyatu dengan panel shared Auth HTTP)
    const authType = document.getElementById("authType")?.value || "none";
    const authVal = resolveVars(document.getElementById("authValue")?.value || "").trim();
    
    if (authType === "bearer" && authVal) {
      resolvedMetadata["authorization"] = `Bearer ${authVal}`;
    } else if (authType === "apiKey" && authVal) {
      resolvedMetadata["x-api-key"] = authVal;
    }

    // Tangkap Skrip Pengujian (Pre & Post Scripts dari editor global/shared)
    const preScript = window.preScriptEditor ? window.preScriptEditor.getValue() : "";
    const postScript = window.postScriptEditor ? window.postScriptEditor.getValue() : "";

    return {
      serviceMethod: cleanedServiceMethod,
      protoFileName: tabBody?.grpc?.protoFileName || "",
      metadata: resolvedMetadata,
      data: parsedData,
      scripts: {
        pre: preScript,
        post: postScript
      }
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
      const response = await this.invokeTauri("grpc_request", {
        endpoint: endpoint,
        serviceMethod: payload.serviceMethod,
        metadata: payload.metadata, // Menyertakan metadata + auth
        payload: payload.data,
        scripts: payload.scripts   // Menyertakan pre/post script ke backend Rust
      });

      if (response) {
        if (response.is_stream && Array.isArray(response.body)) {
          console.log(">>> [gRPC Stream Responses]:", response.body);
          response.body_formatted = response.body.map(item => JSON.stringify(item, null, 2)).join("\n\n");
        } else {
          response.body_formatted = typeof response.body === "string" 
            ? response.body 
            : JSON.stringify(response.body, null, 2);
        }
      }

      return response;
    } catch (err) {
      console.error("❌ gRPC Request Error:", err);
      throw err;
    }
  }
}
export class GraphqlGrpcHandler {
  static editors = {
    graphqlQuery: null,
    graphqlVariables: null,
    grpcBody: null
  };

  /**
   * Safe JSON Parser dengan toleransi relaxed JSON syntax & empty input
   */
  static safeParseJSON(str, label = "JSON") {
    if (!str || typeof str !== "string") return {};
    const trimmed = str.trim();
    if (!trimmed) return {};

    try {
      return JSON.parse(trimmed);
    } catch (err) {
      try {
        // Toleransi relaxed syntax: pasang double quote pada key, ubah single quote, hapus trailing comma
        const sanitized = trimmed
          .replace(/(['"])?([a-zA-Z0-9_]+)(['"])?\s*:/g, '"$2":')
          .replace(/'/g, '"')
          .replace(/,\s*([}\]])/g, "$1");
        return JSON.parse(sanitized);
      } catch (fallbackErr) {
        console.warn(`[${label}] Format JSON tidak valid, dikembalikan sebagai object kosong:`, err);
        return {};
      }
    }
  }

  /**
   * Inisialisasi Event Listener, Monaco Editor, dan Handler Upload Proto
   */
  static setupUI(ui, tabs, scheduleSync) {
    // 1. Handler Upload File .proto untuk gRPC
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
          if (activeTab?.body?.grpc) {
            activeTab.body.grpc.protoFileName = file.name;
            scheduleSync();
          }
        }
      };
    }

    // 2. Inisialisasi Monaco Editor jika tersedia, atau buka textarea biasa jika tidak ada
    if (window.monaco) {
      this.initMonacoEditors(ui, scheduleSync);
    } else {
      if (ui.graphqlQuery) ui.graphqlQuery.classList.remove("hidden");
      if (ui.graphqlVariables) ui.graphqlVariables.classList.remove("hidden");
      if (ui.grpcBody) ui.grpcBody.classList.remove("hidden");
    }

    // 3. Sync listener untuk input teks biasa (Service Method & Textarea Fallback)
    ui.graphqlQuery?.addEventListener("input", scheduleSync);
    ui.graphqlVariables?.addEventListener("input", scheduleSync);
    ui.grpcServiceMethod?.addEventListener("input", scheduleSync);
    ui.grpcBody?.addEventListener("input", scheduleSync);
  }

  /**
   * Membuat instansi Monaco Editor pada div kontainer
   */
  static initMonacoEditors(ui, scheduleSync) {
    const queryEl = document.getElementById("graphqlQueryEditor");
    const varsEl = document.getElementById("graphqlVariablesEditor");
    const grpcEl = document.getElementById("grpcMessageEditor");

    if (queryEl && !this.editors.graphqlQuery) {
      this.editors.graphqlQuery = monaco.editor.create(queryEl, {
        value: ui.graphqlQuery?.value || "",
        language: "graphql",
        theme: "vs-dark",
        automaticLayout: true,
        minimap: { enabled: false }
      });
      this.editors.graphqlQuery.onDidChangeModelContent(() => {
        if (ui.graphqlQuery) ui.graphqlQuery.value = this.editors.graphqlQuery.getValue();
        scheduleSync();
      });
    }

    if (varsEl && !this.editors.graphqlVariables) {
      this.editors.graphqlVariables = monaco.editor.create(varsEl, {
        value: ui.graphqlVariables?.value || "",
        language: "json",
        theme: "vs-dark",
        automaticLayout: true,
        minimap: { enabled: false }
      });
      this.editors.graphqlVariables.onDidChangeModelContent(() => {
        if (ui.graphqlVariables) ui.graphqlVariables.value = this.editors.graphqlVariables.getValue();
        scheduleSync();
      });
    }

    if (grpcEl && !this.editors.grpcBody) {
      this.editors.grpcBody = monaco.editor.create(grpcEl, {
        value: ui.grpcBody?.value || "",
        language: "json",
        theme: "vs-dark",
        automaticLayout: true,
        minimap: { enabled: false }
      });
      this.editors.grpcBody.onDidChangeModelContent(() => {
        if (ui.grpcBody) ui.grpcBody.value = this.editors.grpcBody.getValue();
        scheduleSync();
      });
    }
  }

  /**
   * Menyinkronkan isi editor dan UI saat user berpindah tab
   */
  static syncFromState(tab, ui = {}) {
    const body = tab?.body;
    if (!body) return;

    if (body.mode === "graphql") {
      const queryVal = body.graphql?.query || "";
      const varsVal = body.graphql?.variables || "";

      if (this.editors.graphqlQuery) {
        this.editors.graphqlQuery.setValue(queryVal);
      } else if (ui.graphqlQuery) {
        ui.graphqlQuery.value = queryVal;
      }

      if (this.editors.graphqlVariables) {
        this.editors.graphqlVariables.setValue(varsVal);
      } else if (ui.graphqlVariables) {
        ui.graphqlVariables.value = varsVal;
      }
    } else if (body.mode === "grpc") {
      const bodyVal = body.grpc?.body || "";
      const methodVal = body.grpc?.serviceMethod || "";
      const protoName = body.grpc?.protoFileName || "";

      if (this.editors.grpcBody) {
        this.editors.grpcBody.setValue(bodyVal);
      } else if (ui.grpcBody) {
        ui.grpcBody.value = bodyVal;
      }

      if (ui.grpcServiceMethod) ui.grpcServiceMethod.value = methodVal;
      
      const protoFileNameEl = document.getElementById("protoFileName");
      if (protoFileNameEl) protoFileNameEl.textContent = protoName || "Pilih file .proto";
    }
  }

  /**
   * Mengatur Tampilan Box UI berdasarkan mode body
   */
  static renderUI(body) {
    const graphqlBox = document.getElementById("graphqlBox");
    const grpcBox = document.getElementById("grpcBox");

    if (graphqlBox) graphqlBox.classList.add("hidden");
    if (grpcBox) grpcBox.classList.add("hidden");

    if (!body) return;

    if (body.mode === "graphql" && graphqlBox) {
      graphqlBox.classList.remove("hidden");
      setTimeout(() => {
        this.editors.graphqlQuery?.layout();
        this.editors.graphqlVariables?.layout();
      }, 50);
    }

    if (body.mode === "grpc" && grpcBox) {
      grpcBox.classList.remove("hidden");
      setTimeout(() => {
        this.editors.grpcBody?.layout();
      }, 50);
    }
  }

  /**
   * Format payload JSON untuk dikirim ke RequestEngine
   */
  static prepareRequestBody(tab, resolveVars = (v) => v) {
    const tabBody = tab?.body;
    if (!tabBody) return null;

    if (tabBody.mode === "graphql") {
      const rawQuery = tabBody.graphql?.query || "";
      const rawVars = tabBody.graphql?.variables || "";

      const resolvedQuery = resolveVars(rawQuery);
      const resolvedVarsStr = resolveVars(rawVars);

      return {
        query: resolvedQuery,
        variables: this.safeParseJSON(resolvedVarsStr, "GraphQL Variables")
      };
    }

    if (tabBody.mode === "grpc") {
      const rawMethod = tabBody.grpc?.serviceMethod || "";
      const rawBody = tabBody.grpc?.body || "";

      const resolvedMethod = resolveVars(rawMethod);
      const resolvedBodyStr = resolveVars(rawBody);

      return {
        serviceMethod: resolvedMethod,
        protoFileName: tabBody.grpc?.protoFileName || "",
        data: this.safeParseJSON(resolvedBodyStr, "gRPC Body")
      };
    }

    return null;
  }
}
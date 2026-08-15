export class GraphqlHandler {
  static editors = {
    query: null,
    variables: null
  };

  static safeParseJSON(str, label = "GraphQL Variables") {
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

  static syncToState(tab, ui = {}) {
    if (!tab?.body) return;

    tab.body.graphql ||= {};
    
    // Ambil nilai dari Monaco jika ada, atau dari textarea UI
    const currentQuery = this.editors.query 
      ? this.editors.query.getValue() 
      : (ui.graphqlQuery?.value ?? tab.body.graphql.query ?? "");

    const currentVars = this.editors.variables 
      ? this.editors.variables.getValue() 
      : (ui.graphqlVariables?.value ?? tab.body.graphql.variables ?? "");

    tab.body.graphql.query = currentQuery;
    tab.body.graphql.variables = currentVars;
  }

  static setupUI(ui, tabs, scheduleSync) {
    const handleInputChange = () => {
      this.syncToState(tabs.getActive(), ui);
      scheduleSync();
    };

    if (window.monaco) {
      this.initMonacoEditors(ui, tabs, scheduleSync);
    } else {
      if (ui.graphqlQuery) ui.graphqlQuery.classList.remove("hidden");
      if (ui.graphqlVariables) ui.graphqlVariables.classList.remove("hidden");
    }

    ui.graphqlQuery?.addEventListener("input", handleInputChange);
    ui.graphqlVariables?.addEventListener("input", handleInputChange);
  }

  static initMonacoEditors(ui, tabs, scheduleSync) {
    const queryEl = document.getElementById("graphqlQueryEditor");
    const varsEl = document.getElementById("graphqlVariablesEditor");

    if (queryEl && !this.editors.query) {
      this.editors.query = monaco.editor.create(queryEl, {
        value: ui.graphqlQuery?.value || "",
        language: "graphql",
        theme: "vs-dark",
        automaticLayout: true,
        minimap: { enabled: false }
      });
      this.editors.query.onDidChangeModelContent(() => {
        if (ui.graphqlQuery) ui.graphqlQuery.value = this.editors.query.getValue();
        this.syncToState(tabs.getActive(), ui);
        scheduleSync();
      });
    }

    if (varsEl && !this.editors.variables) {
      this.editors.variables = monaco.editor.create(varsEl, {
        value: ui.graphqlVariables?.value || "",
        language: "json",
        theme: "vs-dark",
        automaticLayout: true,
        minimap: { enabled: false }
      });
      this.editors.variables.onDidChangeModelContent(() => {
        if (ui.graphqlVariables) ui.graphqlVariables.value = this.editors.variables.getValue();
        this.syncToState(tabs.getActive(), ui);
        scheduleSync();
      });
    }
  }

  static syncFromState(tab, ui = {}) {
    const body = tab?.body;
    if (!body || body.mode !== "graphql") return;

    const queryVal = body.graphql?.query || "";
    const varsVal = body.graphql?.variables || "";

    if (this.editors.query) {
      this.editors.query.setValue(queryVal);
    }
    if (ui.graphqlQuery) {
      ui.graphqlQuery.value = queryVal;
    }

    if (this.editors.variables) {
      this.editors.variables.setValue(varsVal);
    }
    if (ui.graphqlVariables) {
      ui.graphqlVariables.value = varsVal;
    }
  }

  static renderUI(body) {
    const graphqlBox = document.getElementById("graphqlBox");
    if (!graphqlBox) return;

    if (body?.mode === "graphql") {
      graphqlBox.classList.remove("hidden");
      setTimeout(() => {
        this.editors.query?.layout();
        this.editors.variables?.layout();
      }, 50);
    } else {
      graphqlBox.classList.add("hidden");
    }
  }

  static prepareRequestBody(tab, resolveVars = (v) => v) {
    const body = tab?.body || tab;
    if (!body || body.mode !== "graphql") return null;

    const rawQuery = body.graphql?.query || "";
    const rawVars = body.graphql?.variables || "";

    return {
      query: resolveVars(rawQuery),
      variables: this.safeParseJSON(resolveVars(rawVars), "GraphQL Variables")
    };
  }
}
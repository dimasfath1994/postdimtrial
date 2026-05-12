function parseUrl(url) {
  if (!url) return "";

  if (typeof url === "string") return url;

  return url.raw || "";
}

// ================= HEADERS =================
function mapHeaders(headers = []) {
  const result = {};

  headers.forEach(h => {
    if (!h.key) return;

    result[h.key] = {
      value: h.value || "",
      enabled: !h.disabled
    };
  });

  return result;
}

// ================= BODY =================
function mapBody(request) {
  if (!request?.body) return null;

  const body = request.body;

  // raw JSON / text
  if (body.raw !== undefined) {
    return {
      mode: "raw",
      raw: body.raw
    };
  }

  // x-www-form-urlencoded
  if (body.urlencoded) {
    const form = {};

    body.urlencoded.forEach(item => {
      if (!item.key) return;

      form[item.key] = {
        value: item.value || "",
        enabled: !item.disabled
      };
    });

    return {
      mode: "urlencoded",
      urlencoded: form
    };
  }

  // form-data (file + text)
  if (body.formdata) {
    const form = {};

    body.formdata.forEach(item => {
      if (!item.key) return;

      form[item.key] = {
        value: item.value || "",
        type: item.type || "text", // text | file
        enabled: !item.disabled
      };
    });

    return {
      mode: "form-data",
      formdata: form
    };
  }

  return null;
}

// ================= AUTH =================
function mapAuth(auth) {
  if (!auth) return null;

  if (auth.type === "bearer") {
    return {
      type: "bearer",
      value: auth.bearer?.[0]?.value || ""
    };
  }

  if (auth.type === "apikey") {
    return {
      type: "apiKey",
      value: auth.apikey?.[0]?.value || ""
    };
  }

  return null;
}

// ================= SCRIPTS =================
function mapEvents(item) {
  const events = [];

  if (item.event?.length) {
    item.event.forEach(ev => {
      if (!ev.script?.exec) return;

      const code = ev.script.exec.join("\n");

      if (ev.listen === "prerequest") {
        events.push({
          pre: code
        });
      }

      if (ev.listen === "test") {
        events.push({
          post: code
        });
      }
    });
  }

  return events;
}

// ================= REQUEST =================
function mapRequests(items = []) {
  return items.map(item => {
    const r = item.request || {};

    return {
      id: Date.now() + Math.random(),
      name: item.name || "Untitled",
      method: r.method || "GET",
      url: parseUrl(r.url),

      headers: mapHeaders(r.header || []),

      body: mapBodyAdvanced(r),

      auth: mapAuth(r.auth)
    };
  });
}

// ================= RECURSIVE FOLDERS =================
function mapItems(items = []) {
  return items.map(item => {

    if (item.item) {
      return {
        id: Date.now() + Math.random(),
        name: item.name,
        type: "folder",
        children: mapItems(item.item)
      };
    }

    const r = item.request || {};

    return {
      type: "request",
      id: Date.now() + Math.random(),
      name: item.name || "Untitled",
      method: r.method || "GET",
      url: parseUrl(r.url),
      headers: mapHeaders(r.header || []),
      body: mapBodyAdvanced(r),
      auth: mapAuth(r.auth)
    };
  });
}

// ================= ENV =================
function mapVariables(vars = []) {
  const result = {};

  vars.forEach(v => {
    if (!v.key) return;

    result[v.key] = v.value || "";
  });

  return result;
}

function mapBodyAdvanced(request) {
  if (!request.body) {
    return {
      mode: "none",
      raw: "",
      formData: [],
      urlencoded: []
    };
  }

  if (request.body.mode === "formdata") {
    return {
      mode: "form-data",
      formData: request.body.formdata?.map(f => ({
        key: f.key,
        value: f.value,
        type: f.type || "text",
        enabled: !f.disabled
      })) || []
    };
  }

  if (request.body.mode === "urlencoded") {
    return {
      mode: "urlencoded",
      urlencoded: request.body.urlencoded?.map(f => ({
        key: f.key,
        value: f.value,
        enabled: !f.disabled
      })) || []
    };
  }

  return {
    mode: "raw",
    raw: request.body.raw || ""
  };
}

// ================= MAIN EXPORT =================
export function importPostmanCollection(json) {
  try {
    const data = typeof json === "string"
      ? JSON.parse(json)
      : json;

    if (!data?.item) {
      throw new Error("Invalid Postman collection");
    }

    return {
      collections: [
        {
          id: Date.now(),
          name: data.info?.name || "Imported Collection",

          tabs: mapItems(data.item),

          environment: mapVariables(data.variable || [])
        }
      ]
    };

  } catch (err) {
    console.error("Postman import failed:", err);
    return null;
  }
}
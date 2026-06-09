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
  if (!Array.isArray(items)) return [];

  return items.map(item => {
    // 1. Logika Deteksi Folder
    // Folder di Postman memiliki properti 'item' (array) dan TIDAK memiliki properti 'request'
    const isFolder = item.item && !item.request;

    if (isFolder) {
      return {
        id: crypto.randomUUID?.() || Date.now() + Math.random(),
        name: item.name || "Untitled Folder",
        type: "folder",
        // Rekursi: Memanggil diri sendiri untuk memproses isi folder
        children: mapItems(item.item) 
      };
    }

    // 2. Logika Deteksi Request
    const r = item.request || {};
    
    // Mengekstrak script jika ada
    const preScript = item.event?.find(e => e.listen === "prerequest")?.script?.exec;
    const postScript = item.event?.find(e => e.listen === "test")?.script?.exec;

    return {
      type: "request",
      id: crypto.randomUUID?.() || Date.now() + Math.random(),
      name: item.name || "Untitled Request",
      method: r.method || "GET",
      url: parseUrl(r.url),
      headers: mapHeaders(r.header || []),
      body: mapBodyAdvanced(r),
      auth: mapAuth(r.auth),
      scripts: {
        pre: Array.isArray(preScript) ? preScript.join("\n") : "",
        post: Array.isArray(postScript) ? postScript.join("\n") : ""
      }
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
  const data = typeof json === "string" ? JSON.parse(json) : json;
  const collectionId = Date.now(); // ID unik untuk koleksi ini

  // Wadah penampung
  const allTabs = [];
  const rootFolders = [];

  // Fungsi rekursif untuk memproses item (mengisi tabs dan membangun struktur folder)
  function processItems(items, parentFolderId = null) {
      return items.map(item => {
          const isFolder = item.item && !item.request;
          const itemId = Date.now() + Math.floor(Math.random() * 10000);

          if (isFolder) {
              const folderObj = {
                  id: itemId,
                  name: item.name,
                  folders: [],
                  requests: []
              };

              // Proses isi folder
              const children = processItems(item.item, itemId);
              
              // Pisahkan hasil anak-anak ke folder atau request
              children.forEach(child => {
                  if (child.type === 'folder') folderObj.folders.push(child);
                  else folderObj.requests.push(child);
              });

              return { ...folderObj, type: 'folder' };
          } else {
              // Ini adalah Request
              const r = item.request || {};
              const requestObj = {
                  id: itemId,
                  name: item.name || "Untitled",
                  method: r.method || "GET",
                  url: parseUrl(r.url),
                  folderId: parentFolderId,
                  collectionId: collectionId,
                  scripts: {
                      pre: item.event?.find(e => e.listen === "prerequest")?.script?.exec?.join("\n") || "",
                      post: item.event?.find(e => e.listen === "test")?.script?.exec?.join("\n") || ""
                  },
                  body: mapBodyAdvanced(r),
                  opened: false // Default
              };

              // Tambahkan ke master list 'tabs'
              allTabs.push(requestObj);
              
              return { ...requestObj, type: 'request' };
          }
      });
  }

  // Jalankan pemrosesan
  const processed = processItems(data.item || []);
  
  // Ambil hanya root folders untuk struktur koleksi
  const finalFolders = processed.filter(i => i.type === 'folder');

  return {
      tabs: allTabs,
      collections: [
          {
              id: collectionId,
              name: data.info?.name || "Imported Collection",
              requests: [], // Jika perlu diisi, bisa difilter dari allTabs
              folders: finalFolders,
              tabs: allTabs, // Duplikat semua tab di sini sesuai strukturmu
              environment: {},
              activeTabId: allTabs[0]?.id || null
          }
      ],
      environment: {}
  };
}
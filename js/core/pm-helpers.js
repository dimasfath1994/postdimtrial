export function createPM({
  env,
  globals,
  collectionVars,
  runtimeVars,
  request,
  response
}) {

  // ================= VARIABLE PRIORITY (POSTMAN STYLE) =================
  const stores = {
    runtime: runtimeVars,
    collection: collectionVars,
    environment: env,
    globals: globals
  };

  const getStore = (store) => ({
    get: (k) => store?.get?.(k),
    set: (k, v) => store?.set?.(k, v),
    unset: (k) => {
      if (!store) return;
      if (store.remove) return store.remove(k);
      if (store.delete) return store.delete(k);
      if (store.set) store.set(k, null);
    },
    all: () => store?.getAll?.() || store?.all?.() || {}
  });

  const runtime = getStore(runtimeVars);
  const collection = getStore(collectionVars);
  const environment = getStore(env);
  const global = getStore(globals);

  // ================= VARIABLE RESOLUTION (POSTMAN ORDER) =================
  const resolveVar = (key) => {
    const order = [
      runtime,
      collection,
      environment,
      global
    ];

    for (const store of order) {
      const val = store?.get?.(key);
      if (val !== undefined && val !== null) return val;
    }

    return undefined;
  };

  const setVar = (store, key, value) => {
    if (!store?.set) return;
    store.set(key, value);
  };

  const removeVar = (store, key) => {
    if (!store) return;
    if (store.unset) return store.unset(key);
    if (store.set) return store.set(key, null);
  };

  // ================= POSTMAN-LIKE SEND REQUEST =================
  const sendRequest = async (config, callback) => {
    try {
      const res = await fetch(config.url, {
        method: config.method || "GET",
        headers: config.headers || {},
        body: config.body ? JSON.stringify(config.body) : undefined
      });

      let data;
      const text = await res.text();

      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }

      const responseObj = {
        status: res.status,
        code: res.status,
        data,
        headers: Object.fromEntries(res.headers.entries?.() || [])
      };

      callback?.(null, responseObj);
      return responseObj;

    } catch (err) {
      callback?.(err, null);
      throw err;
    }
  };

  // ================= PM OBJECT (POSTMAN COMPATIBLE) =================
  const pm = {

    // ================= ENVIRONMENT =================
    environment: {
      get: (k) => environment.get(k),
      set: (k, v) => environment.set(k, v),
      unset: (k) => environment.unset(k),
      all: () => environment.all()
    },

    // ================= GLOBALS =================
    globals: {
      get: (k) => global.get(k),
      set: (k, v) => global.set(k, v),
      unset: (k) => global.unset(k),
      all: () => global.all()
    },

    // ================= COLLECTION VARIABLES =================
    collectionVariables: {
      get: (k) => collection.get(k),
      set: (k, v) => collection.set(k, v),
      unset: (k) => collection.unset(k),
      all: () => collection.all()
    },

    // ================= VARIABLES (RUNTIME) =================
    variables: {
      get: (k) => runtime.get(k),
      set: (k, v) => runtime.set(k, v),
      unset: (k) => runtime.unset(k),
      all: () => runtime.all(),

      // alias biar mirip postman banget
      clear: () => runtime.all()
    },

    // ================= REQUEST =================
    request: {
      method: request?.method,
      url: request?.url,
      headers: request?.headers,
      body: request?.body
    },

    // ================= RESPONSE =================
    response: response ? {
      status: response.status,
      code: response.status,

      json: () => {
        const data = response.data;
        if (typeof data === "string") {
          try {
            return JSON.parse(data);
          } catch {
            return data;
          }
        }
        return data;
      },

      text: () => {
        const data = response.data;
        return typeof data === "string"
          ? data
          : JSON.stringify(data);
      },

      raw: response.data
    } : null,

    // ================= CORE =================
    sendRequest,

    // ================= LOG =================
    log: (...args) => console.log("[PM]", ...args),

    // ================= ASSERTIONS =================
    expect: (value) => ({
      toBe: (v) => {
        if (value !== v) throw new Error(`Expected ${value} to be ${v}`);
      },
      toEqual: (v) => {
        if (JSON.stringify(value) !== JSON.stringify(v)) {
          throw new Error("Expected deep equal failed");
        }
      },
      toBeTruthy: () => {
        if (!value) throw new Error("Expected truthy value");
      },
      toBeDefined: () => {
        if (value === undefined) throw new Error("Expected defined value");
      }
    })
  };

  return pm;
}
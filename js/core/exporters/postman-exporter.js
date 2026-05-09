function parsePostmanUrl(rawUrl = "", params = {}) {

  try {

    const u = new URL(rawUrl);

    // params dari tab.params
    Object.entries(params).forEach(([key, item]) => {

      if (!item.enabled) return;
      if (!key) return;

      u.searchParams.set(
        key,
        item.value || ""
      );
    });

    return {
      raw: u.toString(),

      protocol: u.protocol.replace(":", ""),

      host: u.hostname.split("."),

      port: u.port,

      path: u.pathname
        .split("/")
        .filter(Boolean),

      query: [...u.searchParams.entries()]
        .map(([key, value]) => ({
          key,
          value
        }))
    };

  } catch {

    return {
      raw: rawUrl
    };
  }
}

function mapHeaders(headers = {}) {

  return Object.entries(headers)

    .map(([key, item]) => ({
      key,
      value: item.value || "",

      disabled: !item.enabled
    }));
}

function mapBody(tab) {

  if (!tab.body) return undefined;

  return {
    mode: "raw",

    raw: tab.body,

    options: {
      raw: {
        language: "json"
      }
    }
  };
}

function mapAuth(auth = {}) {

  if (!auth.type) return undefined;

  // ================= BEARER =================

  if (auth.type === "bearer") {

    return {
      type: "bearer",

      bearer: [
        {
          key: "token",
          value: auth.value,
          type: "string"
        }
      ]
    };
  }

  // ================= API KEY =================

  if (auth.type === "apiKey") {

    return {
      type: "apikey",

      apikey: [
        {
          key: "value",
          value: auth.value,
          type: "string"
        },
        {
          key: "key",
          value: "x-api-key",
          type: "string"
        },
        {
          key: "in",
          value: "header",
          type: "string"
        }
      ]
    };
  }

  return undefined;
}

function mapEvents(tab) {

  const events = [];

  // ================= PRE REQUEST =================

  if (tab.scripts?.pre?.trim()) {

    events.push({
      listen: "prerequest",

      script: {
        type: "text/javascript",

        exec: tab.scripts.pre
          .split("\n")
      }
    });
  }

  // ================= TEST SCRIPT =================

  if (tab.scripts?.post?.trim()) {

    events.push({
      listen: "test",

      script: {
        type: "text/javascript",

        exec: tab.scripts.post
          .split("\n")
      }
    });
  }

  return events;
}

function mapRequest(tab) {

  const request = {

    method: tab.method || "GET",

    header: mapHeaders(tab.headers),

    url: parsePostmanUrl(
      tab.url,
      tab.params
    )
  };

  // body
  if (tab.body) {
    request.body = mapBody(tab);
  }

  // auth
  const auth = mapAuth(tab.auth);

  if (auth) {
    request.auth = auth;
  }

  const result = {
    name: tab.name,

    request,

    response: []
  };

  // scripts/events
  const events = mapEvents(tab);

  if (events.length) {
    result.event = events;
  }

  return result;
}

function mapEnvironment(environment = {}) {

  return Object.entries(environment)
    .map(([key, value]) => ({
      key,
      value,
      enabled: true
    }));
}

export function exportPostmanCollection(collection) {

  return {

    info: {
      _postman_id: crypto.randomUUID(),

      name: collection.name,

      schema:
        "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
    },

    item: (collection.tabs || [])
      .map(mapRequest),

    variable: mapEnvironment(
      collection.environment || {}
    )
  };
}
export function normalizeBody(tab) {
  if (!tab) return;

  if (!tab.body || typeof tab.body !== "object") {
    tab.body = {
      mode: "none",
      raw: typeof tab.body === "string" ? tab.body : "",
      formData: [],
      urlencoded: []
    };
  }
}
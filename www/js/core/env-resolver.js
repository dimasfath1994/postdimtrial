import { Environment } from "./environment.js";
import { Globals } from "./globals.js";

export class EnvResolver {

  static values(extra = {}) {
    return {
      ...Globals.getAll?.(),
      ...Environment.getAll?.(),
      ...extra
    };
  }

  // Resolve strings using local/runtime values first, then environment and globals.
  static resolve(input, extra = {}) {
    if (!input) return input;

    if (typeof input !== "string") return input;
    const values = this.values(extra);

    return input.replace(/{{(.*?)}}/g, (match, key) => {
      const name = String(key).trim();
      const dynamic = this.dynamic(name);
      if (dynamic !== undefined) return dynamic;
      return Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : match;
    });
  }

  static dynamic(name) {
    switch (String(name).toLowerCase()) {
      case "$timestamp":
      case "timestamp":
        return String(Date.now());
      case "$guid":
      case "guid":
        return crypto.randomUUID();
      case "$randomint":
      case "randomint":
        return String(Math.floor(Math.random() * 100000));
      default:
        return undefined;
    }
  }

  static resolveObject(obj, extra = {}) {
    if (typeof obj === "string") return this.resolve(obj, extra);
    if (Array.isArray(obj)) return obj.map((item) => this.resolveObject(item, extra));
    if (!obj || typeof obj !== "object") return obj;

    return Object.fromEntries(
      Object.entries(obj).map(([key, value]) => [
        this.resolve(key, extra),
        this.resolveObject(value, extra)
      ])
    );
  }
}
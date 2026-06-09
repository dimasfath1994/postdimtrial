import { Environment } from "./environment.js";

export class EnvResolver {

  // resolve string / url / body
  static resolve(input) {
    if (!input) return input;

    const env = Environment.getAll();

    return input.replace(/{{(.*?)}}/g, (match, key) => {
      return env[key] !== undefined ? env[key] : match;
    });
  }

  // resolve object (body JSON)
  static resolveObject(obj) {
    if (!obj || typeof obj !== "object") return obj;

    const str = JSON.stringify(obj);

    const replaced = this.resolve(str);

    try {
      return JSON.parse(replaced);
    } catch {
      return obj;
    }
  }
}
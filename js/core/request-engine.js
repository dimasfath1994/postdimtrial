import { EnvResolver } from "./env-resolver.js";

export class RequestEngine {

  static async send({ method, url, body, headers = {} }) {

    url = EnvResolver.resolve(url);

    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...headers
      },
      body: body ? JSON.stringify(body) : undefined
    });

    const type = res.headers.get("content-type") || "";

    let data;

    if (type.includes("application/json")) {
      data = await res.json();
    } else {
      data = await res.text();
    }

    return {
      status: res.status,
      data
    };
  }
}
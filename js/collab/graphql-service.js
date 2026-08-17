// js/core/api/request-graphql-service.js

import { Auth } from "../auth.js";
import { API_BASE_URL } from "../core/api/api-config.js";

const API = `${API_BASE_URL}/request-graphql`;

export const GraphqlService = {

  // ================= GET BY REQUEST =================
  async getByRequest(requestId) {
    const r = await fetch(
      `${API}/request/${requestId}`,
      {
        headers: {
          Authorization: `Bearer ${Auth.getToken()}`
        }
      }
    );

    if (!r.ok) {
      console.error("[GRAPHQL GET ERROR]", await r.text());
      return null;
    }

    return await r.json();
  },

  // ================= CREATE =================
  async create(payload) {
    const reqId = Number(payload.request_id || payload.requestId);
    const variablesStr = typeof payload.variables === 'string' 
      ? payload.variables 
      : JSON.stringify(payload.variables || {});

    const r = await fetch(
      API,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Auth.getToken()}`
        },
        body: JSON.stringify({
          request_id: reqId,
          query: payload.query ?? "",
          variables: variablesStr
        })
      }
    );

    if (!r.ok) {
      console.error("[GRAPHQL CREATE ERROR]", await r.text());
      return null;
    }

    return await r.json();
  },

  // ================= UPDATE =================
  async update(id, payload) {
    // Pastikan request_id selalu terisi angka valid
    const reqId = Number(payload?.request_id || payload?.requestId || id);
    const variablesStr = typeof payload?.variables === 'string' 
      ? payload.variables 
      : JSON.stringify(payload?.variables || {});

    const r = await fetch(
      `${API}/${id}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Auth.getToken()}`
        },
        body: JSON.stringify({
          request_id: reqId,
          query: payload?.query ?? "",
          variables: variablesStr
        })
      }
    );

    if (!r.ok) {
      console.error("[GRAPHQL UPDATE ERROR]", await r.text());
      return null;
    }

    const text = await r.text();
    return text ? JSON.parse(text) : true;
  },

  // ================= DELETE =================
  async delete(id) {
    const r = await fetch(
      `${API}/${id}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${Auth.getToken()}`
        }
      }
    );

    if (!r.ok) {
      console.error("[GRAPHQL DELETE ERROR]", await r.text());
      return false;
    }

    return true;
  }
};
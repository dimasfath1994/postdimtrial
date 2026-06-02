// js/core/api/request-header-service.js

import { Auth } from "../auth.js";
import { API_BASE_URL } from "../core/api/api-config.js";

const API = `${API_BASE_URL}/headers`;

export const RequestHeaderService = {

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
      console.error("[HEADER GET ERROR]", await r.text());
      return [];
    }

    return await r.json();
  },

  // ================= CREATE =================
  async create(payload) {
    const r = await fetch(
      API,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Auth.getToken()}`
        },
        body: JSON.stringify({
          request_id: payload.request_id,
          key: payload.key ?? "",
          value: payload.value ?? "",
          description: payload.description ?? "",
          enabled: Boolean(payload.enabled),
          sort_order: payload.sort_order ?? 0
        })
      }
    );

    if (!r.ok) {
      console.error("[HEADER CREATE ERROR]", await r.text());
      return null;
    }

    return await r.json();
  },

  // ================= UPDATE =================
  async update(id, payload) {
    const r = await fetch(
      `${API}/${id}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Auth.getToken()}`
        },
        body: JSON.stringify({
          request_id: payload.request_id,
          key: payload.key ?? "",
          value: payload.value ?? "",
          description: payload.description ?? "",
          enabled: Boolean(payload.enabled),
          sort_order: payload.sort_order ?? 0
        })
      }
    );

    if (!r.ok) {
      console.error("[HEADER UPDATE ERROR]", await r.text());
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
      console.error("[HEADER DELETE ERROR]", await r.text());
      return false;
    }

    return true;
  },

  // ================= BULK UPDATE =================
  async bulkUpdate(requestId, headers) {
    const r = await fetch(
      `${API}/headers/bulk`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Auth.getToken()}`
        },
        body: JSON.stringify({
          request_id: requestId,
          headers: headers.map(h => ({
            request_id: requestId,
            key: h.key ?? "",
            value: h.value ?? "",
            description: h.description ?? "",
            enabled: Boolean(h.enabled),
            sort_order: h.sort_order ?? 0
          }))
        })
      }
    );

    if (!r.ok) {
      console.error("[HEADER BULK UPDATE ERROR]", await r.text());
      return null;
    }

    return await r.json();
  }
};
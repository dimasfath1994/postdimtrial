// js/core/api/request-body-param-service.js

import { Auth } from "../auth.js";
import { API_BASE_URL } from "../core/api/api-config.js";

const API = `${API_BASE_URL}/body-params`;
const FILE_API = `${API_BASE_URL}/files`;

export const RequestBodyParamService = {

  // ================= UPLOAD FILE =================
  async uploadFile(file) {
    const formData = new FormData();
    formData.append("file", file);

    const r = await fetch(`${FILE_API}/upload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Auth.getToken()}`
      },
      body: formData
    });

    if (!r.ok) {
      console.error("[FILE UPLOAD ERROR]", await r.text());
      return null;
    }
    return await r.json();
  },

  // ================= DELETE FILE =================
  async deleteFile(filePath) {
    const r = await fetch(`${FILE_API}/delete/${filePath}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${Auth.getToken()}`
      }
    });
    return r.ok;
  },

  // ================= DOWNLOAD FILE (UNTUK PENGIRIMAN ULANG) =================
  async downloadFileAsBlob(fileName) {
    // Pastikan FILE_API mengarah ke endpoint yang benar
    // Contoh: http://localhost:8000/download/nama-file.txt
    const response = await fetch(`${FILE_API}/download/${encodeURIComponent(fileName)}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${Auth.getToken()}`
      }
    });

    if (!response.ok) {
      console.error("[FILE DOWNLOAD ERROR]", await response.text());
      throw new Error("Gagal mengunduh file dari server");
    }

    return await response.blob();
  },

  // ================= GET BY REQUEST =================
  async getByRequest(requestId) {
    const r = await fetch(`${API}/request/${requestId}`, {
      headers: {
        Authorization: `Bearer ${Auth.getToken()}`
      }
    });

    if (!r.ok) {
      console.error("[BODY PARAM GET ERROR]", await r.text());
      return [];
    }
    return await r.json();
  },

  // ================= CREATE =================
  async create(payload) {
    const r = await fetch(API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Auth.getToken()}`
      },
      body: JSON.stringify({
        request_id: payload.request_id,
        key: payload.key ?? "",
        value: payload.value ?? "",
        file_name: payload.file_name ?? null,
        description: payload.description ?? "",
        type: payload.type ?? "text",
        mode: payload.mode ?? "formdata",
        enabled: Boolean(payload.enabled ?? true),
        sort_order: payload.sort_order ?? 0
      })
    });

    if (!r.ok) {
      console.error("[BODY PARAM CREATE ERROR]", await r.text());
      return null;
    }
    return await r.json();
  },

  // ================= UPDATE =================
  async update(id, payload) {
    const r = await fetch(`${API}/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Auth.getToken()}`
      },
      body: JSON.stringify({
        request_id: payload.request_id,
        key: payload.key ?? "",
        value: payload.value ?? "",
        file_name: payload.file_name ?? null,
        description: payload.description ?? "",
        type: payload.type ?? "text",
        mode: payload.mode ?? "formdata",
        enabled: Boolean(payload.enabled ?? true),
        sort_order: payload.sort_order ?? 0
      })
    });

    if (!r.ok) {
      console.error("[BODY PARAM UPDATE ERROR]", await r.text());
      return null;
    }
    const text = await r.text();
    return text ? JSON.parse(text) : true;
  },

  // ================= DELETE =================
  async delete(id) {
    const r = await fetch(`${API}/${id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${Auth.getToken()}`
      }
    });
    return r.ok;
  },

  // ================= BULK UPDATE =================
  async bulkUpdate(requestId, params) {
    const r = await fetch(`${API}/bulk`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Auth.getToken()}`
      },
      body: JSON.stringify({
        request_id: requestId,
        params: params.map(p => ({
          request_id: requestId,
          key: p.key ?? "",
          value: p.value ?? "",
          file_name: p.file_name ?? null,
          description: p.description ?? "",
          type: p.type ?? "text",
          mode: p.mode ?? "formdata",
          enabled: Boolean(p.enabled ?? true),
          sort_order: p.sort_order ?? 0
        }))
      })
    });

    if (!r.ok) {
      console.error("[BODY PARAM BULK UPDATE ERROR]", await r.text());
      return null;
    }
    return await r.json();
  }
};
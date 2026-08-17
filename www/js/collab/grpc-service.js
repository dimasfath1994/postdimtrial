// js/core/api/request-grpc-service.js

import { Auth } from "../auth.js";
import { API_BASE_URL } from "../core/api/api-config.js";

const API = `${API_BASE_URL}/request-grpc`;

export const GrpcService = {

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
      console.error("[GRPC GET ERROR]", await r.text());
      return null;
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
          service_method: payload.service_method ?? "",
          proto_file_name: payload.proto_file_name ?? "",
          body: payload.body ?? ""
        })
      }
    );

    if (!r.ok) {
      console.error("[GRPC CREATE ERROR]", await r.text());
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
          service_method: payload.service_method ?? "",
          proto_file_name: payload.proto_file_name ?? "",
          body: payload.body ?? ""
        })
      }
    );

    if (!r.ok) {
      console.error("[GRPC UPDATE ERROR]", await r.text());
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
      console.error("[GRPC DELETE ERROR]", await r.text());
      return false;
    }

    return true;
  }
};
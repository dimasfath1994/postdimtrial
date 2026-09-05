import { Auth } from "./auth.js";

import { API_BASE_URL }
from "./core/api/api-config.js";

const API = API_BASE_URL;

document.addEventListener("DOMContentLoaded", () => {

  const loginBtn = document.getElementById("loginBtn");
  const registerBtn = document.getElementById("registerBtn");

  const loginTab = document.getElementById("loginTab");
  const registerTab = document.getElementById("registerTab");

  const loginForm = document.getElementById("loginForm");
  const registerForm = document.getElementById("registerForm");

  // ================= TAB SWITCH =================
  loginTab.onclick = () => {
    loginTab.classList.add("active");
    registerTab.classList.remove("active");

    loginForm.classList.remove("hidden");
    registerForm.classList.add("hidden");
  };

  registerTab.onclick = () => {
    registerTab.classList.add("active");
    loginTab.classList.remove("active");

    registerForm.classList.remove("hidden");
    loginForm.classList.add("hidden");
  };

  // ================= LOGIN =================
  loginBtn.onclick = async () => {

    try {

      const email = document.getElementById("loginEmail").value.trim();
      const password = document.getElementById("loginPassword").value;

      if (!email || !password) {
        alert("Email / password wajib diisi");
        return;
      }

      const res = await fetch(`${API}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ email, password })
      });

      let data;

      try {
        data = await res.json();
      } catch {
        throw new Error("Invalid JSON response from server");
      }

      if (!res.ok) {
        alert(data?.message || "Login failed");
        return;
      }

      // ================= SAVE AUTH =================
      Auth.setToken(data.token);

      if (data.user) {
        Auth.setUser(data.user);
      } else {
        // fallback minimal user object
        Auth.setUser({ email });
      }

      // ================= SAFE REDIRECT =================
      setTimeout(() => {
        if (window.postdimBridge?.navigate) {
          window.postdimBridge.navigate("collaboration.html");
        } else {
          window.location.replace("collaboration.html");
        }
      }, 50);

    } catch (err) {
      console.error("[LOGIN ERROR]", err);
      alert("Network error");
    }
  };

  // ================= REGISTER =================
  registerBtn.onclick = async () => {

    try {

      const name = document.getElementById("regName").value.trim();
      const email = document.getElementById("regEmail").value.trim();
      const password = document.getElementById("regPassword").value;

      if (!name || !email || !password) {
        alert("Semua field wajib diisi");
        return;
      }

      const res = await fetch(`${API}/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ name, email, password })
      });

      let data;

      try {
        data = await res.json();
      } catch {
        throw new Error("Invalid JSON response from server");
      }

      if (!res.ok) {
        alert(data?.message || "Register failed");
        return;
      }

      Auth.setToken(data.token);

      if (data.user) {
        Auth.setUser(data.user);
      } else {
        Auth.setUser({ email });
      }

      setTimeout(() => {
        if (window.postdimBridge?.navigate) {
          window.postdimBridge.navigate("collaboration.html");
        } else {
          window.location.replace("collaboration.html");
        }
      }, 50);

    } catch (err) {
      console.error("[REGISTER ERROR]", err);
      alert("Network error");
    }
  };

});
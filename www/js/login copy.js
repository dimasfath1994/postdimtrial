import { Auth } from "./auth.js";

const API =
  import.meta?.env?.VITE_API_URL ||
  "https://skilled-fundamental-acquired-express.trycloudflare.com/api";

function trace(where, data) {
  console.log("[LOGIN TRACE]", where, data || "");
}

document.addEventListener("DOMContentLoaded", () => {
  trace("DOM_READY");

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
    trace("LOGIN_CLICKED");

    try {
      const email = document.getElementById("loginEmail").value.trim();
      const password = document.getElementById("loginPassword").value;

      if (!email || !password) {
        alert("Email / Password required");
        trace("VALIDATION_FAILED");
        return;
      }

      trace("VALIDATED_INPUT");

      const payload = { email, password };

      trace("SENDING_REQUEST", payload);

      let res;
      try {
        res = await fetch(`${API}/auth/login`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        });
      } catch (err) {
        console.error("[FETCH ERROR]", err);
        trace("FETCH_ERROR");
        alert("Network error / CORS issue");
        return;
      }

      trace("RESPONSE_RECEIVED", res.status);

      const text = await res.text();

      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        console.error("[PARSE ERROR]", text);
        trace("INVALID_JSON_RESPONSE");
        alert("Invalid server response");
        return;
      }

      trace("PARSED_RESPONSE", data);

      if (!res.ok) {
        alert(data.message || "Login failed");
        trace("LOGIN_FAILED");
        return;
      }

      if (!data.token) {
        alert("Token missing from server");
        trace("NO_TOKEN");
        return;
      }

      Auth.setToken(data.token);

      if (data.user) {
        localStorage.setItem("user", JSON.stringify(data.user));
      }

      trace("LOGIN_SUCCESS");

      // 🚀 REDIRECT KE COLLAB MODE
      if (window.postdimBridge?.navigate) {
        window.postdimBridge.navigate("collaboration.html");
      } else {
        window.location.href = "/collaboration.html";
      }

    } catch (err) {
      console.error(err);
      trace("UNHANDLED_ERROR");
      alert("Unexpected error");
    }
  };

  // ================= REGISTER =================
  registerBtn.onclick = async () => {
    trace("REGISTER_CLICKED");

    try {
      const name = document.getElementById("regName").value.trim();
      const email = document.getElementById("regEmail").value.trim();
      const password = document.getElementById("regPassword").value;

      const res = await fetch(`${API}/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ name, email, password })
      });

      const text = await res.text();
      const data = JSON.parse(text);

      if (!res.ok) {
        alert(data.message || "Register failed");
        return;
      }

      Auth.setToken(data.token);

      if (data.user) {
        localStorage.setItem("user", JSON.stringify(data.user));
      }

      trace("REGISTER_SUCCESS");

      if (window.postdimBridge?.navigate) {
        window.postdimBridge.navigate("collaboration.html");
      } else {
        window.location.href = "/collaboration.html";
      }

    } catch (err) {
      console.error(err);
      alert("Network error");
      trace("REGISTER_ERROR");
    }
  };
});
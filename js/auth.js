export const Auth = {

  // ================= TOKEN =================
  getToken() {
    const token = localStorage.getItem("token");

    if (!token || token === "undefined" || token === "null") {
      localStorage.removeItem("token");
      return null;
    }

    return token;
  },

  setToken(token) {
    if (!token || token === "undefined" || token === "null") {
      localStorage.removeItem("token");
      return;
    }

    localStorage.setItem("token", token);
  },

  // ================= USER =================
  getUser() {
    try {
      const user = localStorage.getItem("user");
      return user ? JSON.parse(user) : null;
    } catch {
      return null;
    }
  },

  setUser(user) {
    if (!user) {
      localStorage.removeItem("user");
      return;
    }

    localStorage.setItem("user", JSON.stringify(user));
  },

  // ================= STATE =================
  isLoggedIn() {
    return !!this.getToken();
  },

  // ================= LOGOUT =================
  logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
  },

  clear() {
    this.logout();
  }
};
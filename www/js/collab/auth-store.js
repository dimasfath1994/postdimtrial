export const AuthStore = {

  getToken() {
    return localStorage.getItem("token");
  },

  isLoggedIn() {
    return !!this.getToken();
  },

  logout() {
    localStorage.removeItem("token");
    localStorage.setItem("app_mode", "local");
    if (window.postdimBridge?.navigate) {
      window.postdimBridge.navigate("login.html");
    } else {
      window.location.href = "/login.html";
    }
  }
};
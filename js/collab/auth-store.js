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
    window.location.href = "/login.html";
  }
};
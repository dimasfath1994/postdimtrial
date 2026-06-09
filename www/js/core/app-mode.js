export const AppMode = {
  mode: "local", // local | collab

  set(mode) {
    this.mode = mode;
    localStorage.setItem("app_mode", mode);
  },

  get() {
    return this.mode;
  },

  load() {
    this.mode = localStorage.getItem("app_mode") || "local";
  }
};
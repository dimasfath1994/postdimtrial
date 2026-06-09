const KEY = "postdim_workspace_v1";

export const Storage = {

  save(data) {
    localStorage.setItem(KEY, JSON.stringify(data));
  },

  load() {
    const data = localStorage.getItem(KEY);
    if (!data) return null;

    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

};
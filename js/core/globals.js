export class Globals {
  static key = "postdim_globals";

  static getAll() {
    return JSON.parse(localStorage.getItem(this.key)) || {};
  }

  static set(k, v) {
    const g = this.getAll();
    g[k] = v;
    localStorage.setItem(this.key, JSON.stringify(g));
  }

  static get(k) {
    return this.getAll()[k];
  }

  static clear() {
    localStorage.removeItem(this.key);
  }
}
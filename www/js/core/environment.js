export class Environment {
  static key = "postdim_env";
  static cache = null;

  // ================= LOAD =================
  static load() {
    try {
      this.cache = JSON.parse(localStorage.getItem(this.key)) || {};
    } catch {
      this.cache = {};
    }
    return this.cache;
  }

  // ================= SAVE =================
  static save() {
    localStorage.setItem(this.key, JSON.stringify(this.cache || {}));
  }

  // ================= GET ALL =================
  static getAll() {
    if (!this.cache) this.load();
    return { ...this.cache }; // 🔥 prevent direct mutation
  }

  // ================= SET =================
  static set(key, value) {
    if (!this.cache) this.load();

    if (!key) return;

    // 🔥 treat null/undefined as delete
    if (value === null || value === undefined) {
      delete this.cache[key];
    } else {
      this.cache[key] = value;
    }

    this.save();
  }

  // ================= GET =================
  static get(key) {
    if (!this.cache) this.load();
    return this.cache[key];
  }

  // ================= REMOVE =================
  static remove(key) {
    if (!this.cache) this.load();

    if (key in this.cache) {
      delete this.cache[key];
      this.save();
    }
  }

  // ================= CLEAR =================
  static clear() {
    this.cache = {};
    localStorage.setItem(this.key, JSON.stringify({}));
  }

  // ================= EXISTS =================
  static has(key) {
    if (!this.cache) this.load();
    return Object.prototype.hasOwnProperty.call(this.cache, key);
  }

  // ================= REFRESH =================
  static refresh() {
    this.load();
  }
}
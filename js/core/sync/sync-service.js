export class SyncService {
  constructor(api) {
    this.api = api;

    this.workspace = null;
    this.workspaceId = null;

    this.deviceId = crypto.randomUUID();

    // optional internal listener registry
    this.listeners = [];
  }

  // ================= LOAD =================
  async loadWorkspace() {
    const data = await this.api.getWorkspace();

    this.workspace = data;
    return data;
  }

  // ================= SAVE =================
  async saveWorkspace(patch) {
    if (!this.workspace) {
      this.workspace = patch;
    } else {
      this.workspace = {
        ...this.workspace,
        ...patch,
        updatedAt: Date.now(),
        deviceId: this.deviceId
      };
    }

    const result = await this.api.updateWorkspace(this.workspace);

    // notify local listeners after save
    this.emit({
      type: "workspace:update",
      data: this.workspace,
      deviceId: this.deviceId
    });

    return result;
  }

  // ================= REALTIME =================
  subscribe(callback) {
    const unsub = this.api.onChange((event) => {

      // inject device filter biar gak loop sendiri
      if (event.deviceId === this.deviceId) return;

      callback(event);
    });

    return unsub;
  }

  // ================= PATCH UPDATE =================
  async patch(type, data) {
    return await this.saveWorkspace({
      [type]: data,
      updatedAt: Date.now(),
      deviceId: this.deviceId
    });
  }

  // ================= FIX: SEND (INI YANG KAMU KURANG) =================
  send(payload) {
    if (!payload) return;

    // merge + update timestamp
    const finalPayload = {
      ...payload,
      updatedAt: Date.now(),
      deviceId: this.deviceId
    };

    // optional local cache
    this.workspace = {
      ...(this.workspace || {}),
      ...finalPayload
    };

    // push via API kalau ada endpoint sync
    if (this.api?.sync) {
      return this.api.sync(finalPayload);
    }

    // fallback: updateWorkspace
    if (this.api?.updateWorkspace) {
      return this.api.updateWorkspace(this.workspace);
    }

    console.warn("[SyncService] No sync method available");
  }

  // ================= OPTIONAL: EVENT EMITTER =================
  emit(event) {
    this.listeners.forEach(fn => fn(event));
  }

  on(callback) {
    this.listeners.push(callback);

    return () => {
      this.listeners = this.listeners.filter(fn => fn !== callback);
    };
  }
}
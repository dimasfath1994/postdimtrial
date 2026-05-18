export class SyncService {
  constructor(api) {
    this.api = api;

    this.workspace = null;
    this.workspaceId = null;

    this.deviceId = crypto.randomUUID();

    this.listeners = [];
  }

  // ================= SAFE ID =================
  extractId(ws) {
    if (!ws) return null;

    const candidates = [
      ws.id,
      ws.workspace_id,
      ws.activeId,
      ws.data?.activeId,
      ws.data?.id
    ];

    for (const c of candidates) {
      const n = Number(c);
      if (Number.isFinite(n)) return n;
    }

    return null;
  }

  // ================= LOAD =================
  async loadWorkspace() {

    const data = await this.api.getWorkspace?.();

    this.workspace = data;
    this.workspaceId = this.extractId(data);

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

    if (!this.workspaceId) {
      this.workspaceId = this.extractId(this.workspace);
    }

    if (this.api?.updateWorkspace && this.workspaceId) {
      return this.api.updateWorkspace(this.workspaceId, this.workspace);
    }

    console.warn("[SyncService] No sync method available");
  }

  // ================= PATCH =================
  async patch(type, data) {
    return this.saveWorkspace({
      [type]: data,
      updatedAt: Date.now(),
      deviceId: this.deviceId
    });
  }

  // ================= SEND (FIXED) =================
  send(payload) {

    if (!payload) return;

    const finalPayload = {
      ...payload,
      updatedAt: Date.now(),
      deviceId: this.deviceId
    };

    this.workspace = {
      ...(this.workspace || {}),
      ...finalPayload
    };

    // optional sync
    if (this.api?.sync) {
      return this.api.sync(finalPayload);
    }

    if (this.api?.updateWorkspace && this.workspaceId) {
      return this.api.updateWorkspace(this.workspaceId, this.workspace);
    }

    //console.warn("[SyncService] No sync method available");
  }

  // ================= EVENTS =================
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
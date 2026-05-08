export class SyncService {
  constructor(api) {
    this.api = api;

    this.workspace = null;
    this.workspaceId = null;

    this.deviceId = crypto.randomUUID();
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

    return await this.api.updateWorkspace(this.workspace);
  }

  // ================= REALTIME =================
  subscribe(callback) {
    return this.api.onChange((event) => {

      // inject device filter biar gak loop sendiri
      if (event.deviceId === this.deviceId) return;

      callback(event);
    });
  }

  // ================= PATCH UPDATE =================
  async patch(type, data) {
    return await this.saveWorkspace({
      [type]: data,
      updatedAt: Date.now(),
      deviceId: this.deviceId
    });
  }
}
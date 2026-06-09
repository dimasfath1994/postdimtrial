export class CollabStateSync {

  constructor({ tabs, state }) {
    this.tabs = tabs;
    this.state = state;
  }

  // ================= ACTIVE TAB =================

  getKey(collectionId) {
    return `active_tab_${collectionId}`;
  }

  saveActiveTab(collectionId, tabId) {
    if (!collectionId || !tabId) return;

    localStorage.setItem(
      this.getKey(collectionId),
      String(tabId)
    );
  }

  restoreActiveTab(collectionId, tabs = []) {
    if (!collectionId) return null;

    const saved = Number(
      localStorage.getItem(this.getKey(collectionId))
    );

    const exists = tabs.find(
      t => Number(t.id) === saved
    );

    return exists?.id || null;
  }

  // ================= SAFE ACTIVE SET =================

  resolveActiveTab({
    collection,
    tabs,
    currentActiveId
  }) {

    const restored =
      this.restoreActiveTab(collection.id, tabs);

    const stillExists =
      tabs.find(t => Number(t.id) === Number(currentActiveId));

    return (
      restored ||
      stillExists?.id ||
      collection.activeTabId ||
      tabs[0]?.id ||
      null
    );
  }

  // ================= APPLY ACTIVE =================

  applyActiveTab(collection, activeId) {

    this.tabs.activeId = activeId;

    if (this.state.activeCollection) {
      this.state.activeCollection.activeTabId = activeId;
    }

    if (collection) {
      collection.activeTabId = activeId;
    }

    this.saveActiveTab(collection.id, activeId);
  }

  // ================= FORM SYNC GUARD =================

  safeSyncForm() {

    const editing =
      document.activeElement?.matches("input,textarea") ||
      document.activeElement?.closest(".monaco-editor");

    if (editing) return;

    this.tabs.syncForm?.();
  }

  // ================= RENDER PIPE =================

  render() {
    this.tabs.render();
    this.safeSyncForm();
  }
}
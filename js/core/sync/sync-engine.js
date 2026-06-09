export class SyncEngine {

  constructor({
    store,
    tabs,
    eventBus
  }) {

    this.store = store;
    this.tabs = tabs;
    this.eventBus = eventBus;

    this.lastMutation = 0;
  }

  // ================= ACTIVE TAB =================

  resolveActiveTab(tabs, collection) {

    const state = this.store.getState();

    const saved =
      localStorage.getItem(`active_tab_${collection.id}`);

    const restored = tabs.find(
      t => Number(t.id) === Number(saved)
    );

    const stillValid = tabs.find(
      t => Number(t.id) === Number(state.activeTabId)
    );

    return (
      restored ||
      stillValid ||
      tabs.find(t => Number(t.id) === Number(collection.activeTabId)) ||
      tabs[0] ||
      null
    );

  }

  setActiveTab(tab, collectionId) {

    this.store.setState({
      activeTabId: tab.id,
      activeCollectionId: collectionId
    });

    localStorage.setItem(
      `active_tab_${collectionId}`,
      String(tab.id)
    );

    this.eventBus.emit("tab:changed", tab);
  }

  // ================= SAFE FORM SYNC =================

  syncFormSafe() {

    const editing =
      document.activeElement?.matches("input,textarea") ||
      document.activeElement?.closest(".monaco-editor");

    if (editing) return;

    this.eventBus.emit("form:sync");
  }

  // ================= RENDER PIPE =================

  render(tabs) {
    this.tabs.render();
    this.syncFormSafe();
  }

}
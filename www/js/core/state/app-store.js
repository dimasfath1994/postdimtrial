export class AppStore {

  constructor() {

    this.state = {
      activeCollectionId: null,
      activeTabId: null,
      collections: []
    };

    this.listeners = new Set();
  }

  getState() {
    return this.state;
  }

  setState(patch) {

    this.state = {
      ...this.state,
      ...patch
    };

    this.emit();
  }

  emit() {
    this.listeners.forEach(fn => fn(this.state));
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

}
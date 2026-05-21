export class EventBus {

  constructor() {
    this.events = {};
  }

  on(event, fn) {

    if (!this.events[event]) {
      this.events[event] = new Set();
    }

    this.events[event].add(fn);

    return () => this.events[event].delete(fn);
  }

  emit(event, data) {

    (this.events[event] || []).forEach(fn => {
      fn(data);
    });

  }

}
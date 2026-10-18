/**
 * Small event bus (on, once, off, emit) that the systems use to talk to each other.
 */
export class EventBus {
  handlers = new Map();
  on(type, handler) {
    let listeners = this.handlers.get(type);
    if (!listeners) this.handlers.set(type, (listeners = new Set()));
    listeners.add(handler);
    return () => this.off(type, handler);
  }
  once(type, handler) {
    const off = this.on(type, (payload) => {
      off();
      handler(payload);
    });
    return off;
  }
  off(type, handler) {
    this.handlers.get(type)?.delete(handler);
  }
  emit(type, payload) {
    const listeners = this.handlers.get(type);
    if (listeners)
      for (const handler of [...listeners])
        try {
          handler(payload);
        } catch (err) {
          console.error(`[events] handler for "${String(type)}" threw`, err);
        }
  }
}

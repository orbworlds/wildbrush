/**
 * Registry that maps Rapier collider handles to what they belong to (kind, surface, object).
 */
export class ColliderRegistry {
  map = new Map();
  register(collider, info) {
    this.map.set(collider.handle, info);
  }
  unregister(collider) {
    this.map.delete(typeof collider == 'number' ? collider : collider.handle);
  }
  get(handle) {
    return handle == null ? undefined : this.map.get(handle);
  }
}

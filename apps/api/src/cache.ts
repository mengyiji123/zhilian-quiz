export class TtlCache<K, V> {
  private readonly values = new Map<K, { value: V; expiresAt: number }>()
  private readonly pending = new Map<K, Promise<V>>()
  private readonly versions = new Map<K, number>()
  private epoch = 0

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries = 1_000,
  ) {}

  get(key: K): V | undefined {
    const entry = this.values.get(key)
    if (!entry) return undefined
    if (entry.expiresAt <= Date.now()) {
      this.values.delete(key)
      return undefined
    }
    return entry.value
  }

  set(key: K, value: V): void {
    if (!this.values.has(key) && this.values.size >= this.maxEntries) {
      const oldestKey = this.values.keys().next().value as K | undefined
      if (oldestKey !== undefined) this.values.delete(oldestKey)
    }
    this.values.delete(key)
    this.values.set(key, { value, expiresAt: Date.now() + this.ttlMs })
  }

  async getOrLoad(key: K, loader: () => Promise<V>): Promise<V> {
    const cached = this.get(key)
    if (cached !== undefined) return cached
    const running = this.pending.get(key)
    if (running) return running

    const version = this.versions.get(key) ?? 0
    const epoch = this.epoch
    const promise = loader()
      .then((value) => {
        if (epoch === this.epoch && version === (this.versions.get(key) ?? 0)) this.set(key, value)
        return value
      })
      .finally(() => {
        if (this.pending.get(key) === promise) this.pending.delete(key)
      })
    this.pending.set(key, promise)
    return promise
  }

  delete(key: K): void {
    this.values.delete(key)
    this.pending.delete(key)
    this.versions.set(key, (this.versions.get(key) ?? 0) + 1)
  }

  deleteWhere(predicate: (value: V, key: K) => boolean): void {
    for (const [key, entry] of this.values) {
      if (predicate(entry.value, key)) this.delete(key)
    }
  }

  clear(): void {
    this.values.clear()
    this.pending.clear()
    this.versions.clear()
    this.epoch += 1
  }
}

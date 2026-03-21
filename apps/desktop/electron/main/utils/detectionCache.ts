interface CacheEntry<T> {
  expiresAt: number
  value: T
}

export class ExpiringValueCache<T> {
  private entry: CacheEntry<T> | null = null
  private inFlight: Promise<T> | null = null

  constructor(private readonly ttlMs: number) {}

  async get(loader: () => Promise<T>, options: { forceRefresh?: boolean } = {}): Promise<T> {
    if (!options.forceRefresh && this.entry && this.entry.expiresAt > Date.now()) {
      return this.entry.value
    }

    if (!options.forceRefresh && this.inFlight) {
      return this.inFlight
    }

    this.inFlight = loader()
      .then((value) => {
        this.entry = {
          value,
          expiresAt: Date.now() + this.ttlMs
        }
        return value
      })
      .finally(() => {
        this.inFlight = null
      })

    return this.inFlight
  }

  invalidate(): void {
    this.entry = null
  }
}

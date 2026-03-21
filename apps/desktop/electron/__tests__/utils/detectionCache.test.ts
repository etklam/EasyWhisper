import { describe, expect, it, vi } from 'vitest'

import { ExpiringValueCache } from '../../main/utils/detectionCache'

describe('ExpiringValueCache', () => {
  it('reuses cached values before expiration', async () => {
    const cache = new ExpiringValueCache<string>(1_000)
    const loader = vi.fn().mockResolvedValue('cached')

    await expect(cache.get(loader)).resolves.toBe('cached')
    await expect(cache.get(loader)).resolves.toBe('cached')

    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('deduplicates concurrent in-flight requests', async () => {
    const cache = new ExpiringValueCache<string>(1_000)
    let resolveLoader: ((value: string) => void) | undefined
    const loader = vi.fn().mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          resolveLoader = resolve
        })
    )

    const first = cache.get(loader)
    const second = cache.get(loader)
    resolveLoader?.('shared')

    await expect(first).resolves.toBe('shared')
    await expect(second).resolves.toBe('shared')
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('supports explicit invalidation', async () => {
    const cache = new ExpiringValueCache<string>(1_000)
    const loader = vi.fn()
      .mockResolvedValueOnce('first')
      .mockResolvedValueOnce('second')

    await expect(cache.get(loader)).resolves.toBe('first')
    cache.invalidate()
    await expect(cache.get(loader)).resolves.toBe('second')

    expect(loader).toHaveBeenCalledTimes(2)
  })
})

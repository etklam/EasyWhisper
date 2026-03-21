import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useQueueStore } from '@/stores/queue'

describe('queue store retention', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('retains active tasks while trimming older terminal tasks', () => {
    const queueStore = useQueueStore()

    queueStore.items = Array.from({ length: 105 }, (_, index) => ({
      id: `done-${index}`,
      source: 'file' as const,
      filePath: `/tmp/${index}.mp3`,
      title: `Done ${index}`,
      status: 'done' as const,
      downloadProgress: 100,
      transcribeProgress: 100,
      paused: false,
      cancelRequested: false,
      aiProgress: 100,
      aiResults: {}
    }))

    queueStore.items.push({
      id: 'pending-1',
      source: 'file',
      filePath: '/tmp/pending.mp3',
      title: 'Pending',
      status: 'pending',
      downloadProgress: 0,
      transcribeProgress: 0,
      paused: false,
      cancelRequested: false,
      aiProgress: 0,
      aiResults: {}
    })

    queueStore.trimRetainedTasks()

    expect(queueStore.items).toHaveLength(101)
    expect(queueStore.items.filter((item) => item.status === 'done')).toHaveLength(100)
    expect(queueStore.items.some((item) => item.id === 'pending-1')).toBe(true)
    expect(queueStore.items.some((item) => item.id === 'done-104')).toBe(false)
  })
})

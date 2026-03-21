import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const message = {
  success: vi.fn(),
  error: vi.fn()
}

vi.mock('naive-ui', async () => {
  const actual = await vi.importActual<typeof import('naive-ui')>('naive-ui')
  return {
    ...actual,
    useMessage: () => message
  }
})

import QueueTable from '@/components/QueueTable.vue'
import i18n from '@/i18n'
import { naive } from '@/plugins/naive'
import { useQueueStore } from '@/stores/queue'

const mockOpenOutputFolder = vi.fn()
const mockOpenFolder = vi.fn()

declare global {
  interface Window {
    fosswhisper: {
      openOutputFolder: () => Promise<{ ok: true; path: string } | { ok: false; error: string }>
      openFolder: (path: string) => Promise<{ ok: true; path: string } | { ok: false; error: string }>
    }
  }
}

Object.defineProperty(window, 'fosswhisper', {
  value: {
    openOutputFolder: mockOpenOutputFolder,
    openFolder: mockOpenFolder
  },
  writable: true,
  configurable: true
})

describe('QueueTable', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('renders queue items and supports pause, cancel, retry actions', async () => {
    const store = useQueueStore()
    vi.spyOn(store, 'pumpQueue').mockImplementation(() => {})

    store.items = [
      {
        id: 'pending-task',
        source: 'file',
        filePath: '/tmp/demo.mp3',
        title: 'demo.mp3',
        status: 'pending',
        downloadProgress: 0,
        transcribeProgress: 0,
        paused: false,
        cancelRequested: false,
        aiResults: {}
      },
      {
        id: 'error-task',
        source: 'ytdlp',
        url: 'https://example.com/video',
        title: 'https://example.com/video',
        status: 'error',
        downloadProgress: 100,
        transcribeProgress: 20,
        outputPath: '/tmp/output/result.srt',
        paused: false,
        cancelRequested: false,
        aiResults: {},
        error: '下载失败',
        message: '下载失败'
      }
    ]

    const wrapper = mount(QueueTable, {
      global: {
        plugins: [naive, i18n]
      }
    })

    expect(wrapper.text()).toContain(i18n.global.t('components.queueTable.title'))
    expect(wrapper.text()).toContain(i18n.global.t('components.queueTable.summaryTotal', { count: 2 }))

    const cards = wrapper.findAll('.queue-item')
    expect(cards).toHaveLength(2)

    const pendingButtons = cards[0].findAll('button')
    await pendingButtons[1].trigger('click')
    expect(store.items[0].paused).toBe(true)
    expect(store.items[0].message).toBe('queue.messages.paused')

    await pendingButtons[2].trigger('click')
    expect(store.items[0].status).toBe('error')
    expect(store.items[0].error).toBe('queue.messages.cancelled')

    const errorButtons = cards[1].findAll('button')
    await errorButtons[3].trigger('click')
    expect(store.items[1].status).toBe('pending')
    expect(store.items[1].downloadProgress).toBe(0)
    expect(store.items[1].transcribeProgress).toBe(0)
  })

  it('opens output folder from the task actions', async () => {
    mockOpenFolder.mockResolvedValue({ ok: true, path: '/tmp/output/result.srt' })

    const store = useQueueStore()
    store.items = [
      {
        id: 'done-task',
        source: 'file',
        filePath: '/tmp/input/demo.mp3',
        sourcePath: '/tmp/input/demo.mp3',
        title: 'demo.mp3',
        status: 'done',
        downloadProgress: 100,
        transcribeProgress: 100,
        outputPath: '/tmp/output/result.srt',
        paused: false,
        cancelRequested: false,
        aiResults: {}
      }
    ]

    const wrapper = mount(QueueTable, {
      global: {
        plugins: [naive, i18n]
      }
    })

    await wrapper.get('.queue-item button').trigger('click')

    expect(mockOpenFolder).toHaveBeenCalledWith('/tmp/output/result.srt')
    expect(message.success).toHaveBeenCalledWith(i18n.global.t('settings.messages.folderOpened'))
  })
})

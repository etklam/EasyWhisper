import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

import QueueTable from '@/components/QueueTable.vue'
import i18n from '@/i18n'
import { naive } from '@/plugins/naive'
import { useQueueStore } from '@/stores/queue'

describe('QueueTable', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
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
    await pendingButtons[0].trigger('click')
    expect(store.items[0].paused).toBe(true)
    expect(store.items[0].message).toBe('queue.messages.paused')

    await pendingButtons[1].trigger('click')
    expect(store.items[0].status).toBe('error')
    expect(store.items[0].error).toBe('queue.messages.cancelled')

    const errorButtons = cards[1].findAll('button')
    await errorButtons[2].trigger('click')
    expect(store.items[1].status).toBe('pending')
    expect(store.items[1].downloadProgress).toBe(0)
    expect(store.items[1].transcribeProgress).toBe(0)
  })
})

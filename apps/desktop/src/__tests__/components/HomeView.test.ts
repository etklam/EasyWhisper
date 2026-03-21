import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/components/ImportPanel.vue', () => ({
  default: { template: '<div data-testid="import-panel">Import Panel</div>' }
}))

vi.mock('@/components/QueueTable.vue', () => ({
  default: { template: '<div data-testid="queue-table">Queue Table</div>' }
}))

vi.mock('@/components/AiQuickToggles.vue', () => ({
  default: { template: '<div data-testid="ai-quick-toggles">AI Quick Toggles</div>' }
}))

declare global {
  interface Window {
    fosswhisper: {
      openOutputFolder: () => Promise<{ ok: true; path: string } | { ok: false; error: string }>
    }
  }
}

Object.defineProperty(window, 'fosswhisper', {
  value: {},
  writable: true,
  configurable: true
})

import HomeView from '@/views/HomeView.vue'
import i18n from '@/i18n'
import { naive } from '@/plugins/naive'
import { useAiStore } from '@/stores/ai'
import { useQueueStore } from '@/stores/queue'
import { useWhisperStore } from '@/stores/whisper'

describe('HomeView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()

    const whisperStore = useWhisperStore()
    const queueStore = useQueueStore()
    const aiStore = useAiStore()

    whisperStore.settings.outputFormats = ['txt', 'srt']
    whisperStore.outputFormats = ['txt', 'srt', 'vtt', 'json']
    whisperStore.temporaryLanguage = null

    vi.spyOn(queueStore, 'bindIpcListeners').mockImplementation(() => {})
    vi.spyOn(whisperStore, 'bindIpcListeners').mockImplementation(() => {})
    vi.spyOn(aiStore, 'bindIpcListeners').mockImplementation(() => {})
    vi.spyOn(whisperStore, 'initialize').mockResolvedValue(undefined)
    vi.spyOn(whisperStore, 'getEffectiveLanguage').mockImplementation(function(this: typeof whisperStore) {
      return this.temporaryLanguage ?? this.settings.language
    })
    vi.spyOn(aiStore, 'initialize').mockResolvedValue(undefined)
    vi.spyOn(queueStore, 'reset').mockImplementation(() => {})
    vi.spyOn(whisperStore, 'reset').mockImplementation(() => {})
    vi.spyOn(aiStore, 'reset').mockImplementation(() => {})
  })

  it('renders the temporary transcription language dropdown', async () => {
    const wrapper = mount(HomeView, {
      global: {
        plugins: [naive, i18n]
      }
    })

    expect(wrapper.find('[data-testid="temporary-language-select"]').exists()).toBe(true)
  })

  it('does not reset stores when the view unmounts', async () => {
    const whisperStore = useWhisperStore()
    const queueStore = useQueueStore()
    const aiStore = useAiStore()

    const queueResetSpy = vi.spyOn(queueStore, 'reset')
    const whisperResetSpy = vi.spyOn(whisperStore, 'reset')
    const aiResetSpy = vi.spyOn(aiStore, 'reset')

    const wrapper = mount(HomeView, {
      global: {
        plugins: [naive, i18n]
      }
    })

    await wrapper.unmount()

    expect(queueResetSpy).not.toHaveBeenCalled()
    expect(whisperResetSpy).not.toHaveBeenCalled()
    expect(aiResetSpy).not.toHaveBeenCalled()
  })
})

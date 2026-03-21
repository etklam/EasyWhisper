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

import AiPanel from '@/components/AiPanel.vue'
import i18n from '@/i18n'
import { naive } from '@/plugins/naive'
import { useAiStore } from '@/stores/ai'
import { useWhisperStore } from '@/stores/whisper'

describe('AiPanel', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('resets a custom prompt back to the default state', async () => {
    const aiStore = useAiStore()
    const whisperStore = useWhisperStore()

    aiStore.connectionStatus = 'connected'
    whisperStore.settings.aiCustomPrompts = {
      correct: 'custom correct prompt',
      translate: 'custom translate prompt',
      summary: 'custom summary prompt'
    }

    const wrapper = mount(AiPanel, {
      global: {
        plugins: [naive, i18n]
      }
    })

    const correctPromptInput = wrapper.get('[data-testid="correct-prompt-input"] textarea')
    expect((correctPromptInput.element as HTMLTextAreaElement).value).toBe('custom correct prompt')

    const resetButtons = wrapper.findAll('button').filter((node) =>
      node.text().includes(i18n.global.t('components.aiPanel.resetPrompt'))
    )
    await resetButtons[0]?.trigger('click')

    expect((correctPromptInput.element as HTMLTextAreaElement).value).toBe('')
  })
})

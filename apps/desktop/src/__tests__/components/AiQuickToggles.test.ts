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

import AiQuickToggles from '@/components/AiQuickToggles.vue'
import i18n from '@/i18n'
import { naive } from '@/plugins/naive'
import { useWhisperStore } from '@/stores/whisper'

describe('AiQuickToggles', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('renders AI step toggles (correct, translate, summary)', () => {
    const wrapper = mount(AiQuickToggles, {
      global: {
        plugins: [naive, i18n]
      }
    })

    // Check that all three toggles exist
    expect(wrapper.find('[data-testid="toggle-correct"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="toggle-translate"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="toggle-summary"]').exists()).toBe(true)
  })

  it('saves AI settings when save button is clicked', async () => {
    const store = useWhisperStore()
    const updateSettingsSpy = vi.spyOn(store, 'updateSettings').mockResolvedValue(undefined)

    const wrapper = mount(AiQuickToggles, {
      global: {
        plugins: [naive, i18n]
      }
    })

    await wrapper.find('[data-testid="save-ai-settings"]').trigger('click')

    expect(updateSettingsSpy).toHaveBeenCalled()
    expect(message.success).toHaveBeenCalledWith(i18n.global.t('components.aiQuickToggles.settingsSaved'))
  })

  it('does not include Ollama status or model selection UI', () => {
    const wrapper = mount(AiQuickToggles, {
      global: {
        plugins: [naive, i18n]
      }
    })

    // Should not have connection status UI
    expect(wrapper.find('[data-testid="ollama-status"]').exists()).toBe(false)
    // Should not have model selector
    expect(wrapper.find('[data-testid="model-selector"]').exists()).toBe(false)
  })

  it('shows error message when save fails', async () => {
    const store = useWhisperStore()
    vi.spyOn(store, 'updateSettings').mockRejectedValue(new Error('save failed'))

    const wrapper = mount(AiQuickToggles, {
      global: {
        plugins: [naive, i18n]
      }
    })

    await wrapper.find('[data-testid="save-ai-settings"]').trigger('click')

    expect(message.error).toHaveBeenCalledWith(i18n.global.t('components.aiQuickToggles.saveFailed'))
  })
})

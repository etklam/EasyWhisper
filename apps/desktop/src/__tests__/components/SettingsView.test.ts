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

vi.mock('@/components/ModelSelector.vue', () => ({
  default: {
    template: '<div data-testid="model-selector">Model Selector</div>'
  }
}))

import SettingsView from '@/views/SettingsView.vue'
import { naive } from '@/plugins/naive'
import { useWhisperStore } from '@/stores/whisper'

describe('SettingsView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('shows an error message when saving transcription settings fails', async () => {
    const store = useWhisperStore()
    vi.spyOn(store, 'updateSettings').mockRejectedValue(new Error('save failed'))

    const wrapper = mount(SettingsView, {
      global: {
        plugins: [naive]
      }
    })

    await wrapper.get('[data-testid="save-transcription-settings"]').trigger('click')

    await vi.waitFor(() => {
      expect(message.error).toHaveBeenCalledWith('保存失败，请重试')
    })
    expect(message.success).not.toHaveBeenCalled()
  })
})

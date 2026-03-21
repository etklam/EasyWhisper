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

vi.mock('@/components/YtDlpStatus.vue', () => ({
  default: {
    template: '<div data-testid="ytdlp-status">yt-dlp Status</div>'
  }
}))

vi.mock('@/components/FfmpegStatus.vue', () => ({
  default: {
    template: '<div data-testid="ffmpeg-status">ffmpeg Status</div>'
  }
}))

// Mock window.fosswhisper APIs
const mockOpenModelFolder = vi.fn()
const mockOpenOutputFolder = vi.fn()

declare global {
  interface Window {
    fosswhisper: {
      openModelFolder: () => Promise<{ ok: true; path: string } | { ok: false; error: string }>
      openOutputFolder: () => Promise<{ ok: true; path: string } | { ok: false; error: string }>
    }
  }
}

Object.defineProperty(window, 'fosswhisper', {
  value: {
    openModelFolder: mockOpenModelFolder,
    openOutputFolder: mockOpenOutputFolder
  },
  writable: true,
  configurable: true
})

import SettingsView from '@/views/SettingsView.vue'
import i18n from '@/i18n'
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
        plugins: [naive, i18n]
      }
    })

    await wrapper.get('[data-testid="save-transcription-settings"]').trigger('click')

    await vi.waitFor(() => {
      expect(message.error).toHaveBeenCalledWith(i18n.global.t('settings.transcription.saveFailed'))
    })
    expect(message.success).not.toHaveBeenCalled()
  })

  it('renders the default transcription language dropdown', async () => {
    const wrapper = mount(SettingsView, {
      global: {
        plugins: [naive, i18n]
      }
    })

    expect(wrapper.find('[data-testid="default-language-select"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="default-output-location-select"]').exists()).toBe(true)
  })

  it('saves the selected default output location with transcription settings', async () => {
    const store = useWhisperStore()
    store.settings.outputToSourceDir = true
    const updateSettingsSpy = vi.spyOn(store, 'updateSettings').mockResolvedValue(undefined)

    const wrapper = mount(SettingsView, {
      global: {
        plugins: [naive, i18n]
      }
    })

    await wrapper.get('[data-testid="save-transcription-settings"]').trigger('click')

    expect(updateSettingsSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        outputToSourceDir: true
      })
    )
  })

  describe('Folder actions', () => {
    it('opens model folder when button is clicked', async () => {
      mockOpenModelFolder.mockResolvedValue({ ok: true, path: '/models' })

      const wrapper = mount(SettingsView, {
        global: {
          plugins: [naive, i18n]
        }
      })

      await wrapper.get('[data-testid="open-model-folder"]').trigger('click')

      expect(mockOpenModelFolder).toHaveBeenCalled()
      expect(message.success).toHaveBeenCalledWith(i18n.global.t('settings.messages.folderOpened'))
    })

    it('shows error when opening model folder fails', async () => {
      mockOpenModelFolder.mockResolvedValue({ ok: false, error: 'Folder not found' })

      const wrapper = mount(SettingsView, {
        global: {
          plugins: [naive, i18n]
        }
      })

      await wrapper.get('[data-testid="open-model-folder"]').trigger('click')

      expect(message.error).toHaveBeenCalledWith(
        i18n.global.t('settings.messages.openFolderFailed', { error: 'Folder not found' })
      )
    })

    it('opens output folder when button is clicked', async () => {
      mockOpenOutputFolder.mockResolvedValue({ ok: true, path: '/output' })

      const wrapper = mount(SettingsView, {
        global: {
          plugins: [naive, i18n]
        }
      })

      await wrapper.get('[data-testid="open-output-folder"]').trigger('click')

      expect(mockOpenOutputFolder).toHaveBeenCalled()
      expect(message.success).toHaveBeenCalledWith(i18n.global.t('settings.messages.folderOpened'))
    })

    it('shows error when opening output folder fails', async () => {
      mockOpenOutputFolder.mockResolvedValue({ ok: false, error: 'Path not found' })

      const wrapper = mount(SettingsView, {
        global: {
          plugins: [naive, i18n]
        }
      })

      await wrapper.get('[data-testid="open-output-folder"]').trigger('click')

      expect(message.error).toHaveBeenCalledWith(
        i18n.global.t('settings.messages.openFolderFailed', { error: 'Path not found' })
      )
    })
  })
})

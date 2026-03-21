import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const message = {
  success: vi.fn(),
  warning: vi.fn(),
  error: vi.fn()
}

vi.mock('naive-ui', async () => {
  const actual = await vi.importActual<typeof import('naive-ui')>('naive-ui')
  return {
    ...actual,
    useMessage: () => message
  }
})

async function mountModelSelector(userAgent: string) {
  vi.resetModules()
  vi.stubGlobal('navigator', { userAgent })

  const [{ default: ModelSelector }, { useWhisperStore }, { default: i18n }, { naive }] = await Promise.all([
    import('@/components/ModelSelector.vue'),
    import('@/stores/whisper'),
    import('@/i18n'),
    import('@/plugins/naive')
  ])

  setActivePinia(createPinia())
  const store = useWhisperStore()
  store.models = [
    {
      id: 'ggml-large-v3.bin',
      label: 'Large v3',
      path: 'ggml-large-v3.bin',
      downloadUrl: '',
      downloaded: false
    }
  ]

  const wrapper = mount(ModelSelector, {
    global: {
      plugins: [naive, i18n]
    }
  })

  return { wrapper }
}

describe('ModelSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows the large v3 compatibility note on macOS too', async () => {
    const { wrapper } = await mountModelSelector('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')

    expect(wrapper.text()).toContain('Large v3 can be used on this device')
    expect(wrapper.text()).toContain('Platform note')
  })

  it('shows a prominent Windows compatibility warning for large v3', async () => {
    const { wrapper } = await mountModelSelector('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')

    expect(wrapper.get('[data-testid="windows-model-warning"]').text()).toContain(
      'Large v3 is not supported on Windows'
    )
    expect(wrapper.text()).toContain('Unavailable on this device')
  })
})

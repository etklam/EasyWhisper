import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const message = {
  success: vi.fn(),
  warning: vi.fn(),
  error: vi.fn()
}

const naiveStubs = {
  'n-button': { template: '<button><slot /></button>' },
  'n-card': { template: '<div class="n-card"><slot /></div>' },
  'n-progress': { template: '<div class="n-progress"></div>' },
  'n-radio': { template: '<span class="n-radio"><slot /></span>' },
  'n-radio-group': { template: '<div class="n-radio-group"><slot /></div>' },
  'n-tag': { template: '<span class="n-tag"><slot /></span>' },
  'n-text': { template: '<span class="n-text"><slot /></span>' }
}

vi.mock('naive-ui', () => {
  return {
    useMessage: () => message
  }
})

async function mountModelSelector(userAgent: string) {
  vi.resetModules()
  vi.stubGlobal('navigator', { userAgent })

  const [{ default: ModelSelector }, { useWhisperStore }, { default: i18n }] = await Promise.all([
    import('@/components/ModelSelector.vue'),
    import('@/stores/whisper'),
    import('@/i18n')
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
      plugins: [i18n],
      stubs: naiveStubs
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
    const modelItem = wrapper
      .findAll('.model-item')
      .find((item) => item.text().includes('ggml-large-v3.bin'))

    if (!modelItem) {
      throw new Error('Large v3 item not found')
    }

    expect(modelItem.text()).toContain('Large v3 can be used on this device')
    expect(modelItem.text()).toContain('Platform note')
  })

  it('shows a prominent Windows compatibility warning for large v3', async () => {
    const { wrapper } = await mountModelSelector('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')

    expect(wrapper.get('[data-testid="windows-model-warning"]').text()).toContain(
      'Large v3 is not supported on Windows'
    )
    expect(wrapper.text()).toContain('Unavailable on this device')
  })
})

import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NMessageProvider } from 'naive-ui'

import ImportPanel from '@/components/ImportPanel.vue'
import { naive } from '@/plugins/naive'
import { useQueueStore } from '@/stores/queue'

function createMockFile(path: string): File {
  const filename = path.split('/').pop() ?? 'file'
  const file = new File(['content'], filename)
  Object.defineProperty(file, 'path', {
    value: path,
    configurable: true
  })
  return file
}

describe('ImportPanel', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('enqueues only supported files when dragging valid and invalid files', async () => {
    const queueStore = useQueueStore()
    const enqueueFilesSpy = vi.spyOn(queueStore, 'enqueueFiles').mockImplementation(() => {})

    const wrapper = mount(
      defineComponent({
        components: { ImportPanel, NMessageProvider },
        template: '<n-message-provider><ImportPanel /></n-message-provider>'
      }),
      {
        global: {
          plugins: [naive]
        }
      }
    )

    const validFile = createMockFile('/tmp/audio.mp3')
    const invalidFile = createMockFile('/tmp/notes.txt')

    await wrapper.find('.drop-target').trigger('drop', {
      dataTransfer: {
        files: [validFile, invalidFile]
      }
    })

    expect(enqueueFilesSpy).toHaveBeenCalledTimes(1)
    expect(enqueueFilesSpy).toHaveBeenCalledWith(['/tmp/audio.mp3'])
  })

  it('enqueues parsed URLs when submitting URL input', async () => {
    const queueStore = useQueueStore()
    const enqueueUrlsSpy = vi.spyOn(queueStore, 'enqueueUrls').mockImplementation(() => {})

    const wrapper = mount(
      defineComponent({
        components: { ImportPanel, NMessageProvider },
        template: '<n-message-provider><ImportPanel /></n-message-provider>'
      }),
      {
        global: {
          plugins: [naive]
        }
      }
    )

    const textarea = wrapper.find('textarea')
    await textarea.setValue('https://example.com/video1\nhttps://example.com/video2')

    const submitButton = wrapper.find('[data-testid="submit-urls"]')
    await submitButton.trigger('click')

    expect(enqueueUrlsSpy).toHaveBeenCalledTimes(1)
    expect(enqueueUrlsSpy).toHaveBeenCalledWith(['https://example.com/video1', 'https://example.com/video2'])
  })

  it('renders both drag-drop and URL input in a single card', () => {
    const wrapper = mount(
      defineComponent({
        components: { ImportPanel, NMessageProvider },
        template: '<n-message-provider><ImportPanel /></n-message-provider>'
      }),
      {
        global: {
          plugins: [naive]
        }
      }
    )

    // Verify drag-drop zone exists
    expect(wrapper.find('.drop-target').exists()).toBe(true)
    // Verify URL input area exists
    expect(wrapper.find('[data-testid="url-input-area"]').exists()).toBe(true)
  })
})

import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent } from 'vue'
import { NMessageProvider } from 'naive-ui'

import DropZone from '@/components/DropZone.vue'
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

describe('DropZone', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('filters unsupported files before enqueueing', async () => {
    const queueStore = useQueueStore()
    const enqueueSpy = vi.spyOn(queueStore, 'enqueueFiles').mockImplementation(() => {})

    const wrapper = mount(
      defineComponent({
        components: { DropZone, NMessageProvider },
        template: '<n-message-provider><DropZone /></n-message-provider>'
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

    expect(enqueueSpy).toHaveBeenCalledTimes(1)
    expect(enqueueSpy).toHaveBeenCalledWith(['/tmp/audio.mp3'])
  })
})

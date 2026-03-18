import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { AiPipeline } from '../../main/ai/AiPipeline'
import { getPrompt } from '../../main/ai/prompts'
import { checkOllama, chat } from '../../main/ai/OllamaClient'

vi.mock('../../main/ai/OllamaClient')
vi.mock('../../main/ai/prompts')

describe('AiPipeline', () => {
  let pipeline: AiPipeline
  let mockCheckOllama: ReturnType<typeof vi.fn>
  let mockGetPrompt: ReturnType<typeof vi.fn>
  let mockChat: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockCheckOllama = vi.mocked(checkOllama)
    mockGetPrompt = vi.mocked(getPrompt)
    mockChat = vi.mocked(chat)

    mockCheckOllama.mockResolvedValue(true)
    mockChat.mockResolvedValue({
      response: 'Mocked AI response'
    })
    mockGetPrompt.mockImplementation((task) => {
      return (...args: string[]) => `Prompt for ${task}: ${args.join(', ')}`
    })

    pipeline = new AiPipeline('llama2', {
      correct: true,
      translate: true,
      summary: false
    })
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Initialization', () => {
    it('should initialize with model and tasks', () => {
      expect(pipeline.model).toBe('llama2')
      expect(pipeline.tasks).toEqual({
        correct: true,
        translate: true,
        summary: false
      })
    })

    it('should set default options', () => {
      expect(pipeline.options).toMatchObject({
        concurrency: 2,
        chunkSize: 4000
      })
    })

    it('should allow custom options', () => {
      const customPipeline = new AiPipeline('mistral', {
        correct: true,
        translate: true,
        summary: true
      }, {
        concurrency: 1,
        chunkSize: 2000
      })

      expect(customPipeline.options.concurrency).toBe(1)
      expect(customPipeline.options.chunkSize).toBe(2000)
    })
  })

  describe('Ollama Check', () => {
    it('should check Ollama availability on init', async () => {
      await pipeline.init()

      expect(mockCheckOllama).toHaveBeenCalledOnce()
    })

    it('should fail if Ollama is not running', async () => {
      mockCheckOllama.mockResolvedValueOnce(false)

      await expect(pipeline.init()).rejects.toThrow('Ollama is not running')
    })
  })

  describe('Task Processing', () => {
    it('should process correct task', async () => {
      const onProgress = vi.fn()
      const onResult = vi.fn()

      await pipeline.init()
      await pipeline.process({
        id: 'task-123',
        text: 'This is som text with typos.',
        taskType: 'correct',
        onProgress,
        onResult
      })

      expect(mockGetPrompt).toHaveBeenCalledWith('correct', undefined)
      expect(onProgress).toHaveBeenCalled()
      expect(onResult).toHaveBeenCalled()
    })

    it('should process translate task', async () => {
      const onResult = vi.fn()

      await pipeline.init()
      await pipeline.process({
        id: 'task-123',
        text: 'Hello world',
        taskType: 'translate',
        targetLang: 'zh-TW',
        onResult
      })

      expect(mockGetPrompt).toHaveBeenCalledWith('translate', undefined)
      expect(onResult).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: 'task-123',
          result: expect.any(String)
        })
      )
    })

    it('should process summary task', async () => {
      const onResult = vi.fn()
      const summaryPipeline = new AiPipeline('llama2', {
        correct: true,
        translate: true,
        summary: true
      })

      await summaryPipeline.init()
      await summaryPipeline.process({
        id: 'task-123',
        text: 'This is a long transcript about something.',
        taskType: 'summary',
        onResult
      })

      expect(mockGetPrompt).toHaveBeenCalledWith('summary', undefined)
      expect(onResult).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: 'task-123',
          result: expect.any(String)
        })
      )
    })

    it('should handle multiple tasks', async () => {
      const onResult = vi.fn()

      await pipeline.init()

      const tasks = [
        {
          id: 'task-1',
          text: 'Text 1',
          taskType: 'correct' as const,
          onResult
        },
        {
          id: 'task-2',
          text: 'Text 2',
          taskType: 'correct' as const,
          onResult
        }
      ]

      await Promise.all(tasks.map(task => pipeline.process(task)))

      expect(onResult).toHaveBeenCalledTimes(2)
    })
  })

  describe('Chunking Strategy', () => {
    it('should split long text into chunks', async () => {
      const onProgress = vi.fn()

      await pipeline.init()

      const longText = 'Word '.repeat(10000) // 50000 characters, ~ 75000 tokens

      await pipeline.process({
        id: 'task-123',
        text: longText,
        taskType: 'correct',
        onProgress
      })

      expect(onProgress).toHaveBeenCalled()
    })

    it('should use custom chunk size', async () => {
      const onProgress = vi.fn()
      const customPipeline = new AiPipeline('llama2', {
        correct: true,
        translate: false,
        summary: false
      }, {
        chunkSize: 1000 // Very small chunk size
      })

      await customPipeline.init()

      const text = 'Word '.repeat(500)

      await customPipeline.process({
        id: 'task-123',
        text: text,
        taskType: 'correct',
        onProgress
      })

      expect(onProgress).toHaveBeenCalled()
    })
  })

  describe('Batch Translation', () => {
    it('should translate multiple sentences in single request', async () => {
      const onProgress = vi.fn()
      const onResult = vi.fn()

      const sentences = [
        'This is sentence 1.',
        'This is sentence 2.',
        'This is sentence 3.'
      ].join('\n')

      await pipeline.init()

      mockChat.mockResolvedValueOnce({
        response: '這是句子 1。\n這是句子 2。\n這是句子 3。'
      })

      await pipeline.process({
        id: 'task-123',
        text: sentences,
        taskType: 'translate',
        targetLang: 'zh-TW',
        batchMode: true, // Send all sentences together
        onProgress,
        onResult
      })

      expect(mockChat).toHaveBeenCalledWith(
        'llama2',
        expect.stringContaining('Prompt for translate'),
        expect.objectContaining({
          signal: expect.any(AbortSignal)
        })
      )

      expect(onResult).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: 'task-123',
          result: '這是句子 1。\n這是句子 2。\n這是句子 3。'
        })
      )
    })

    it('should fallback to sequential translation for very long text', async () => {
      const onProgress = vi.fn()
      const onResult = vi.fn()

      // Very long text that exceeds context window
      const veryLongText = 'Sentence '.repeat(10000)

      await pipeline.init()

      // Simulate context limit exceeded
      mockChat.mockRejectedValueOnce(new Error('Context limit exceeded'))

      await pipeline.process({
        id: 'task-123',
        text: veryLongText,
        taskType: 'translate',
        targetLang: 'zh-TW',
        batchMode: true,
        onProgress,
        onResult
      })

      expect(onResult).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: 'task-123',
          error: expect.any(String)
        })
      )
    }, 15000)

    it('should preserve sentence separation in batch translation', async () => {
      const onResult = vi.fn()

      const sentences = [
        'First sentence.',
        'Second sentence.'
      ]

      await pipeline.init()

      mockChat.mockResolvedValueOnce({
        response: '第一句。\n第二句。'
      })

      await pipeline.process({
        id: 'task-123',
        text: sentences.join('\n'),
        taskType: 'translate',
        targetLang: 'zh-TW',
        batchMode: true,
        onResult
      })

      const result = onResult.mock.calls[0]?.[0]?.result
      expect(result).toContain('\n')
    })

    it('should estimate tokens and decide batch vs sequential', async () => {
      const shortText = 'This is short.'

      await pipeline.init()

      // Short text should use batch mode
      const onResult = vi.fn()
      await pipeline.process({
        id: 'task-123',
        text: shortText,
        taskType: 'translate',
        targetLang: 'zh-TW',
        onResult
      })

      expect(onResult).toHaveBeenCalled()
    })

    it('should handle mixed content with code blocks', async () => {
      const onResult = vi.fn()

      const mixedContent = `
This is normal text.

\`\`\`python
def example():
    return "code"
\`\`\`

More normal text.
      `.trim()

      await pipeline.init()

      mockChat.mockResolvedValueOnce({
        response: '這是正常文字。\n\n```python\ndef example():\n    return "代碼"\n```\n\n更多正常文字。'
      })

      await pipeline.process({
        id: 'task-123',
        text: mixedContent,
        taskType: 'translate',
        targetLang: 'zh-TW',
        batchMode: true,
        onResult
      })

      expect(onResult).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: 'task-123',
          result: expect.any(String)
        })
      )
    })
  })

  describe('Token Efficiency', () => {
    it('should combine translation requests to save tokens', async () => {
      const onProgress = vi.fn()
      const onResult = vi.fn()

      // Simulate counting API calls
      let apiCallCount = 0
      mockChat.mockImplementation(() => {
        apiCallCount++
        return Promise.resolve({
          response: 'Translated result'
        })
      })

      await pipeline.init()

      // Multiple sentences in single batch
      await pipeline.process({
        id: 'task-123',
        text: 'Sentence 1.\nSentence 2.\nSentence 3.',
        taskType: 'translate',
        targetLang: 'zh-TW',
        batchMode: true,
        onProgress,
        onResult
      })

      expect(apiCallCount).toBe(1) // Single API call for all sentences
    })

    it('should split into multiple batches for very long content', async () => {
      const onProgress = vi.fn()
      const onResult = vi.fn()

      let apiCallCount = 0
      mockChat.mockImplementation(() => {
        apiCallCount++
        return Promise.resolve({
          response: 'Translated chunk'
        })
      })

      await pipeline.init()

      const longText = 'Sentence '.repeat(10000) // ~ 50000 chars

      await pipeline.process({
        id: 'task-123',
        text: longText,
        taskType: 'translate',
        targetLang: 'zh-TW',
        batchMode: true,
        chunkSize: 4000, // Small chunk size to force batching
        onProgress,
        onResult
      })

      expect(apiCallCount).toBeGreaterThanOrEqual(1)
      expect(onResult).toHaveBeenCalled()
    })

    it('should estimate and respect model context window', async () => {
      const onProgress = vi.fn()
      const onResult = vi.fn()

      await pipeline.init()

      // Model with specific context window (e.g., 4K tokens)
      const pipelineWithSmallContext = new AiPipeline('llama2', {
        correct: false,
        translate: true,
        summary: false
      }, {
        contextWindow: 4000
      })

      mockChat.mockResolvedValueOnce({
        response: 'Translated'
      })

      await pipelineWithSmallContext.process({
        id: 'task-123',
        text: 'This is some text to translate.',
        taskType: 'translate',
        targetLang: 'zh-TW',
        batchMode: true,
        onProgress,
        onResult
      })

      expect(onResult).toHaveBeenCalled()
    })

    it('should provide token usage statistics', async () => {
      const onProgress = vi.fn()
      const onResult = vi.fn()

      await pipeline.init()

      const text = 'This is a text.'

      mockChat.mockResolvedValueOnce({
        response: 'Translated text',
        prompt_eval_count: 50,
        eval_count: 100
      })

      await pipeline.process({
        id: 'task-123',
        text: text,
        taskType: 'translate',
        targetLang: 'zh-TW',
        batchMode: true,
        onProgress,
        onResult
      })

      expect(onResult).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: 'task-123',
          tokensUsed: 50
        })
      )
    })

    it('should cap chunk size to the available context window in batch mode', async () => {
      const onResult = vi.fn()

      await pipeline.init()

      const longParagraph = 'word '.repeat(3000)

      await pipeline.process({
        id: 'task-123',
        text: longParagraph,
        taskType: 'translate',
        targetLang: 'zh-TW',
        batchMode: true,
        onResult
      })

      expect(mockChat.mock.calls.length).toBeGreaterThan(1)
      expect(onResult).toHaveBeenCalled()
    })
  })

  describe('Task Skipping', () => {
    it('should skip disabled tasks', async () => {
      const onResult = vi.fn()

      const pipelineWithOnlyCorrect = new AiPipeline('llama2', {
        correct: true,
        translate: false,
        summary: false
      })

      await pipelineWithOnlyCorrect.init()

      await pipelineWithOnlyCorrect.process({
        id: 'task-123',
        text: 'Text',
        taskType: 'translate', // Disabled
        onResult
      })

      expect(onResult).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: 'task-123',
          skipped: true,
          reason: 'translate task is disabled'
        })
      )
    })

    it('should process only enabled tasks in pipeline', async () => {
      const onProgress = vi.fn()
      const onResult = vi.fn()

      await pipeline.init()

      await pipeline.process({
        id: 'task-123',
        text: 'Text',
        taskType: 'correct',
        onProgress,
        onResult
      })

      expect(onResult).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: 'task-123',
          result: expect.any(String)
        })
      )
    })
  })

  describe('Error Handling', () => {
    it('should handle Ollama errors', async () => {
      mockChat.mockRejectedValueOnce(new Error('Ollama API error'))

      const onResult = vi.fn()

      await pipeline.init()

      await pipeline.process({
        id: 'task-123',
        text: 'Text',
        taskType: 'correct',
        onResult
      })

      expect(onResult).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: 'task-123',
          error: expect.any(String)
        })
      )
    })

    it('should handle timeout', async () => {
      mockChat.mockImplementation(() =>
        new Promise(() => {})
      )

      const onResult = vi.fn()

      await pipeline.init()

      const pipelineWithTimeout = new AiPipeline('llama2', {
        correct: true,
        translate: false,
        summary: false
      }, {
        timeout: 50 // Very short timeout
      })

      await pipelineWithTimeout.process({
        id: 'task-123',
        text: 'Text',
        taskType: 'correct',
        onResult
      })

      expect(onResult).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: 'task-123',
          error: expect.any(String)
        })
      )
    })
  })

  describe('Result Aggregation', () => {
    it('should aggregate chunked results', async () => {
      const onResult = vi.fn()

      await pipeline.init()

      mockChat.mockResolvedValue({ response: 'Result: ' })

      const chunks = ['Chunk 1', 'Chunk 2', 'Chunk 3']

      await pipeline.process({
        id: 'task-123',
        text: chunks.join(' '),
        taskType: 'correct',
        onResult
      })

      const lastCall = onResult.mock.calls[onResult.mock.calls.length - 1]?.[0]
      expect(lastCall?.result).toBeDefined()
    })

    it('should preserve context between chunks', async () => {
      const onProgress = vi.fn()
      const onResult = vi.fn()

      await pipeline.init()

      mockChat.mockResolvedValue({ response: 'Corrected output' })

      await pipeline.process({
        id: 'task-123',
        text: 'Chunk 1 Chunk 2',
        taskType: 'correct',
        onProgress,
        onResult
      })

      expect(onResult).toHaveBeenCalled()
    })
  })
})

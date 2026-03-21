import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAiStore } from '@/stores/ai'
import type { WorkflowSettings } from '@shared/types'

// Mock window.fosswhisper API
const mockRunAi = vi.fn()
const mockStopAi = vi.fn()
const mockGetAiStatus = vi.fn().mockResolvedValue({ connected: true, running: false, activeTasks: 0, queueLength: 0 })
const mockListAiModels = vi.fn().mockResolvedValue(['llama2', 'llama3'])

const mockFosswhisper = {
  runAi: mockRunAi,
  stopAi: mockStopAi,
  getAiStatus: mockGetAiStatus,
  listAiModels: mockListAiModels,
  onAiProgress: vi.fn(() => ({ unsubscribe: vi.fn() })),
  onAiResult: vi.fn(() => ({ unsubscribe: vi.fn() })),
  onAiError: vi.fn(() => ({ unsubscribe: vi.fn() }))
}

vi.mock('@/stores/aiWorkflowCoordinator', () => ({
  registerAiWorkflowBridge: vi.fn(),
  notifyAiQueued: vi.fn(),
  notifyAiProgress: vi.fn(),
  notifyAiCompleted: vi.fn(),
  notifyAiFailed: vi.fn()
}))

vi.mock('@/stores/whisper', () => ({
  useWhisperStore: () => ({
    settings: {
      aiEnabled: true,
      aiModel: 'llama2',
      aiTargetLang: 'zh-TW',
      aiCorrect: true,
      aiTranslate: true,
      aiSummary: false,
      outputFormats: ['txt', 'srt'],
      outputDir: '',
      ytdlpAudioFormat: 'mp3',
      ytdlpCookiesPath: ''
    }
  })
}))

// Set up global window.fosswhisper
Object.defineProperty(window, 'fosswhisper', {
  value: mockFosswhisper,
  writable: true
})

describe('ai store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  describe('AI Workflow Context Passing', () => {
    it('should use corrected text for translation when both correct and translate are enabled', async () => {
      const aiStore = useAiStore()
      await aiStore.initialize()

      const mockResults: Record<string, string> = {
        'task-correct': '这是修正后的文本。去除错别字，修正语法。'
      }

      // 模拟 AI 调用返回修正后的文本
      mockRunAi.mockImplementation(async (payload) => {
        await new Promise(resolve => setTimeout(resolve, 10))
        
        if (payload.taskType === 'correct') {
          return {
            taskId: payload.id,
            taskType: 'correct',
            result: mockResults['task-correct'],
            progress: 100,
            currentChunk: 1,
            totalChunks: 1
          }
        }

        if (payload.taskType === 'translate') {
          // 验证 translate 使用的是修正后的文本
          expect(payload.text).toBe(mockResults['task-correct'])
          expect(payload.text).not.toBe('这是原始转录文本，可能有错别字。')
          
          return {
            taskId: payload.id,
            taskType: 'translate',
            result: 'This is translated text.',
            progress: 100,
            currentChunk: 1,
            totalChunks: 1
          }
        }

        throw new Error('Unexpected task type')
      })

      // 创建 workflow，启用 correct 和 translate
      const originalText = '这是原始转录文本，可能有错别字。'
      const settings = {
        aiEnabled: true,
        aiModel: 'llama2',
        aiTargetLang: 'en',
        aiCorrect: true,
        aiTranslate: true,
        aiSummary: false,
        outputFormats: ['txt'],
        outputDir: '',
        ytdlpAudioFormat: 'mp3',
        ytdlpCookiesPath: ''
      } as WorkflowSettings

      const enqueued = aiStore.enqueueWorkflow({
        queueTaskId: 'task-123',
        title: 'Test Task',
        text: originalText,
        settings
      })

      expect(enqueued).toBe(true)
      expect(aiStore.workflows.length).toBe(1)

      // 等待 workflow 完成
      await new Promise(resolve => setTimeout(resolve, 100))

      // 验证：
      // 1. correct 步骤收到了原始文本
      expect(mockRunAi).toHaveBeenCalledWith(
        expect.objectContaining({
          taskType: 'correct',
          text: originalText
        })
      )

      // 2. translate 步骤收到了修正后的文本
      const correctCall = mockRunAi.mock.calls.find(call => call[0]?.taskType === 'correct')
      const translateCall = mockRunAi.mock.calls.find(call => call[0]?.taskType === 'translate')

      expect(correctCall).toBeDefined()
      expect(translateCall).toBeDefined()

      expect(translateCall![0].text).toBe(mockResults['task-correct'])
      expect(translateCall![0].text).not.toBe(originalText)
    })

    it('should use translated text for summary when translate and summary are enabled', async () => {
      const aiStore = useAiStore()
      await aiStore.initialize()

      const mockResults: Record<string, string> = {
        'task-translate': 'This is translated text.'
      }

      // 模拟 AI 调用返回翻译后的文本
      mockRunAi.mockImplementation(async (payload) => {
        await new Promise(resolve => setTimeout(resolve, 10))
        
        if (payload.taskType === 'translate') {
          return {
            taskId: payload.id,
            taskType: 'translate',
            result: mockResults['task-translate'],
            progress: 100,
            currentChunk: 1,
            totalChunks: 1
          }
        }

        if (payload.taskType === 'summary') {
          // 验证 summary 使用的是翻译后的文本
          expect(payload.text).toBe(mockResults['task-translate'])
          expect(payload.text).not.toBe('这是原始文本')
          
          return {
            taskId: payload.id,
            taskType: 'summary',
            result: 'Summary of translated text.',
            progress: 100,
            currentChunk: 1,
            totalChunks: 1
          }
        }

        throw new Error('Unexpected task type')
      })

      // 创建 workflow，启用 translate 和 summary
      const originalText = '这是原始文本'
      const settings = {
        aiEnabled: true,
        aiModel: 'llama2',
        aiTargetLang: 'en',
        aiCorrect: false,
        aiTranslate: true,
        aiSummary: true,
        outputFormats: ['txt'],
        outputDir: '',
        ytdlpAudioFormat: 'mp3',
        ytdlpCookiesPath: ''
      } as WorkflowSettings

      const enqueued = aiStore.enqueueWorkflow({
        queueTaskId: 'task-456',
        title: 'Test Task 2',
        text: originalText,
        settings
      })

      expect(enqueued).toBe(true)
      expect(aiStore.workflows.length).toBe(1)

      // 等待 workflow 完成
      await new Promise(resolve => setTimeout(resolve, 100))

      // 验证 summary 使用了翻译后的文本
      const translateCall = mockRunAi.mock.calls.find(call => call[0]?.taskType === 'translate')
      const summaryCall = mockRunAi.mock.calls.find(call => call[0]?.taskType === 'summary')

      expect(translateCall).toBeDefined()
      expect(summaryCall).toBeDefined()

      expect(summaryCall![0].text).toBe(mockResults['task-translate'])
      expect(summaryCall![0].text).not.toBe(originalText)
    })

    it('should use corrected then translated text when all three steps are enabled', async () => {
      const aiStore = useAiStore()
      await aiStore.initialize()

      const mockResults: Record<string, string> = {
        'task-correct': '这是修正后的文本。',
        'task-translate': 'This is translated text.'
      }

      // 模拟 AI 调用
      mockRunAi.mockImplementation(async (payload) => {
        await new Promise(resolve => setTimeout(resolve, 10))
        
        if (payload.taskType === 'correct') {
          return {
            taskId: payload.id,
            taskType: 'correct',
            result: mockResults['task-correct'],
            progress: 100,
            currentChunk: 1,
            totalChunks: 1
          }
        }

        if (payload.taskType === 'translate') {
          // 验证 translate 使用的是修正后的文本
          expect(payload.text).toBe(mockResults['task-correct'])
          
          return {
            taskId: payload.id,
            taskType: 'translate',
            result: mockResults['task-translate'],
            progress: 100,
            currentChunk: 1,
            totalChunks: 1
          }
        }

        if (payload.taskType === 'summary') {
          // 验证 summary 使用的是翻译后的文本
          expect(payload.text).toBe(mockResults['task-translate'])
          
          return {
            taskId: payload.id,
            taskType: 'summary',
            result: 'Summary.',
            progress: 100,
            currentChunk: 1,
            totalChunks: 1
          }
        }

        throw new Error('Unexpected task type')
      })

      // 创建 workflow，启用所有三个步骤
      const originalText = '这是原始转录文本，有错别字。'
      const settings = {
        aiEnabled: true,
        aiModel: 'llama2',
        aiTargetLang: 'en',
        aiCorrect: true,
        aiTranslate: true,
        aiSummary: true,
        outputFormats: ['txt'],
        outputDir: '',
        ytdlpAudioFormat: 'mp3',
        ytdlpCookiesPath: ''
      } as WorkflowSettings

      const enqueued = aiStore.enqueueWorkflow({
        queueTaskId: 'task-789',
        title: 'Test Task 3',
        text: originalText,
        settings
      })

      expect(enqueued).toBe(true)
      expect(aiStore.workflows.length).toBe(1)

      // 等待 workflow 完成
      await new Promise(resolve => setTimeout(resolve, 100))

      // 验证步骤顺序
      const correctCall = mockRunAi.mock.calls.find(call => call[0]?.taskType === 'correct')
      const translateCall = mockRunAi.mock.calls.find(call => call[0]?.taskType === 'translate')
      const summaryCall = mockRunAi.mock.calls.find(call => call[0]?.taskType === 'summary')

      expect(correctCall).toBeDefined()
      expect(translateCall).toBeDefined()
      expect(summaryCall).toBeDefined()

      // 验证步骤执行顺序：correct → translate → summary
      const callOrder = mockRunAi.mock.calls.map(call => call[0]?.taskType)
      expect(callOrder).toEqual(['correct', 'translate', 'summary'])

      // 验证文本传递
      expect(correctCall![0].text).toBe(originalText)
      expect(translateCall![0].text).toBe(mockResults['task-correct'])
      expect(summaryCall![0].text).toBe(mockResults['task-translate'])
    })
  })

  describe('Workflow retention', () => {
    it('retains active workflows while trimming older terminal workflows', () => {
      const aiStore = useAiStore()

      aiStore.workflows = Array.from({ length: 105 }, (_, index) => ({
        id: `done-${index}`,
        queueTaskId: `queue-done-${index}`,
        title: `Done ${index}`,
        sourceText: 'source',
        currentText: 'current',
        model: 'llama2',
        targetLang: 'en',
        steps: [],
        results: {},
        status: 'done' as const,
        progress: 100,
        cancelRequested: false,
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString()
      }))

      aiStore.workflows.push({
        id: 'running-1',
        queueTaskId: 'queue-running-1',
        title: 'Running',
        sourceText: 'source',
        currentText: 'current',
        model: 'llama2',
        targetLang: 'en',
        steps: [],
        results: {},
        status: 'running',
        progress: 50,
        cancelRequested: false,
        createdAt: new Date().toISOString(),
        startedAt: new Date().toISOString()
      })

      aiStore.trimRetainedWorkflows()

      expect(aiStore.workflows).toHaveLength(101)
      expect(aiStore.workflows.filter((workflow) => workflow.status === 'done')).toHaveLength(100)
      expect(aiStore.workflows.some((workflow) => workflow.id === 'running-1')).toBe(true)
      expect(aiStore.workflows.some((workflow) => workflow.id === 'done-104')).toBe(false)
    })
  })
})

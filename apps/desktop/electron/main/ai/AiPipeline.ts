// AI Pipeline - 處理 AI 任務（翻譯、摘要、修正）
import { chat } from './OllamaClient'
import { getPrompt } from './prompts'
import type { AiTask, AiProgress, AiComplete, AiError, AiSettings, PipelineOptions } from './types'

const DEFAULT_OPTIONS: PipelineOptions = {
  concurrency: 2,
  chunkSize: 4000,
  timeout: 30000,
  contextWindow: 4000,
  outputTokenBudget: 1000
}

export class AiPipeline {
  private queue: Map<string, Promise<void>> = new Map()
  private activeCount = 0

  constructor(
    public readonly model: string,
    public readonly tasks: {
      correct: boolean
      translate: boolean
      summary: boolean
    },
    private readonly options: PipelineOptions = {}
  ) {
    this.options = { ...DEFAULT_OPTIONS, ...options }
  }

  async init(): Promise<void> {
    const { checkOllama } = await import('./OllamaClient')
    const running = await checkOllama()
    if (!running) {
      throw new Error('Ollama is not running. Please start Ollama first.')
    }
  }

  async process(task: AiTask): Promise<void> {
    // Check if task is enabled
    if (!this.tasks[task.taskType]) {
      task.onResult?.({
        taskId: task.id,
        skipped: true,
        reason: `${task.taskType} task is disabled`
      })
      return
    }

    // Wait for slot
    await this.waitForSlot()

    // Process task
    this.activeCount++
    try {
      await this.processTask(task)
    } finally {
      this.activeCount--
    }
  }

  private async waitForSlot(): Promise<void> {
    while (this.activeCount >= this.options.concurrency!) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }

  private async processTask(task: AiTask): Promise<void> {
    const promptFn = getPrompt(task.taskType, task.customPrompts)

    // Split into chunks based on strategy
    const chunks = this.splitText(task.text, {
      batchSize: task.batchMode ? this.options.chunkSize! : Infinity,
      batchMode: task.batchMode ?? false,
      chunkSize: task.chunkSize ?? this.options.chunkSize!
    })

    let results: string[] = []
    let totalTokensUsed = 0
    const startTime = Date.now()

    for (let i = 0; i < chunks.length; i++) {
      const progress = ((i + 1) / chunks.length) * 100
      task.onProgress?.({
        taskId: task.id,
        taskType: task.taskType,
        progress,
        currentChunk: i + 1,
        totalChunks: chunks.length
      })

      try {
        // Add context from previous chunk for better coherence
        const context = this.buildContext(chunks, i, task.taskType)
        
        // For translate and correct tasks, pass text and targetLang
        let fullPrompt = context
        if (task.taskType === 'translate') {
          fullPrompt += promptFn(chunks[i], task.targetLang)
        } else if (task.taskType === 'correct') {
          fullPrompt += promptFn(chunks[i], task.targetLang || 'en')
        } else {
          // Summary - only text
          fullPrompt += promptFn(chunks[i])
        }

        const response = await Promise.race([
          chat(this.model, fullPrompt),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('AI task timeout')), task.timeout ?? this.options.timeout!)
          )
        ])

        results.push(response.response)
        totalTokensUsed += response.prompt_eval_count || 0
      } catch (error) {
        task.onResult?.({
          taskId: task.id,
          taskType: task.taskType,
          error: error instanceof Error ? error.message : String(error),
          detail: error
        })
        return
      }
    }

    // Aggregate results
    const finalResult = this.aggregateResults(results, task.taskType, chunks.length)

    task.onResult?.({
      taskId: task.id,
      result: finalResult,
      tokensUsed: totalTokensUsed,
      durationMs: Date.now() - startTime
    })
  }

  private splitText(text: string, options: { batchSize: number; batchMode: boolean; chunkSize: number }): string[] {
    // If batch mode is disabled or text is short enough, return as single chunk
    if (!options.batchMode || text.length <= options.batchSize) {
      return [text]
    }

    const chunks: string[] = []
    let currentChunk = ''
    let currentTokens = 0

    // Split by sentences first to avoid breaking in the middle
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text]

    for (const sentence of sentences) {
      const sentenceTokens = this.estimateTokens(sentence)
      const tokensWithBuffer = currentTokens + sentenceTokens

      if (tokensWithBuffer > options.chunkSize && currentChunk) {
        chunks.push(currentChunk.trim())
        currentChunk = sentence
        currentTokens = sentenceTokens
      } else {
        currentChunk += (currentChunk ? ' ' : '') + sentence
        currentTokens = tokensWithBuffer
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk.trim())
    }

    return chunks
  }

  private buildContext(chunks: string[], currentIndex: number, taskType: string): string {
    // Add context from previous chunks for better coherence
    // Only for translation and correct tasks
    if (currentIndex === 0 || ['summary'].includes(taskType)) {
      return ''
    }

    // Include last 2-3 sentences from previous chunk as context
    const previousChunk = chunks[currentIndex - 1]
    const sentences = previousChunk.match(/[^.!?]+[.!?]+/g) || []
    const contextSentences = sentences.slice(-3).join(' ')

    if (contextSentences) {
      return `Previous context: ${contextSentences}\n\nNow translate the following:\n\n`
    }

    return ''
  }

  private aggregateResults(results: string[], taskType: string, totalChunks: number): string {
    if (totalChunks === 1) {
      return results[0]
    }

    // For batch translation, results should already be complete
    // For other tasks, we might need to clean up
    return results.join('\n\n').trim()
  }

  private estimateTokens(text: string): number {
    // Rough estimation: 1 char ≈ 0.3 tokens for mixed English/Chinese
    return Math.ceil(text.length * 0.3)
  }

  updateSettings(settings: Partial<AiSettings>): void {
    this.tasks = {
      correct: settings.tasks?.correct ?? this.tasks.correct,
      translate: settings.tasks?.translate ?? this.tasks.translate,
      summary: settings.tasks?.summary ?? this.tasks.summary
    }
  }
}

import { chat } from './OllamaClient'
import { getPrompt } from './prompts'
import type {
  AiError,
  AiProgressEvent,
  AiRunResult,
  AiSettings,
  AiTask,
  PipelineOptions,
  ResolvedPipelineOptions
} from './types'

const DEFAULT_OPTIONS: ResolvedPipelineOptions = {
  concurrency: 2,
  chunkSize: 4000,
  timeout: 30000,
  contextWindow: 4000,
  outputTokenBudget: 1000
}

export class AiPipeline {
  public tasks: {
    correct: boolean
    translate: boolean
    summary: boolean
  }

  public readonly options: ResolvedPipelineOptions

  private activeCount = 0

  constructor(
    public readonly model: string,
    tasks: {
      correct: boolean
      translate: boolean
      summary: boolean
    },
    options: PipelineOptions = {}
  ) {
    this.tasks = { ...tasks }
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
    if (!this.tasks[task.taskType]) {
      task.onResult?.({
        taskId: task.id,
        taskType: task.taskType,
        skipped: true,
        reason: `${task.taskType} task is disabled`
      })
      return
    }

    await this.waitForSlot()
    this.activeCount += 1

    try {
      const result = await this.processTask(task)
      task.onResult?.(result)
    } catch (error) {
      task.onResult?.(toAiError(task, error))
    } finally {
      this.activeCount = Math.max(0, this.activeCount - 1)
    }
  }

  updateSettings(settings: Partial<AiSettings>): void {
    this.tasks = {
      correct: settings.tasks?.correct ?? this.tasks.correct,
      translate: settings.tasks?.translate ?? this.tasks.translate,
      summary: settings.tasks?.summary ?? this.tasks.summary
    }
  }

  getStatus(): { activeTasks: number } {
    return {
      activeTasks: this.activeCount
    }
  }

  private async waitForSlot(): Promise<void> {
    while (this.activeCount >= this.options.concurrency) {
      await delay(100)
    }
  }

  private async processTask(task: AiTask): Promise<AiRunResult> {
    const promptFn = getPrompt(task.taskType, task.customPrompts)
    const chunks = this.splitText(task.text, {
      batchSize: task.batchMode ? this.options.contextWindow : Infinity,
      batchMode: task.batchMode ?? false,
      chunkSize: task.chunkSize ?? this.options.chunkSize
    })

    const results: string[] = []
    let totalTokensUsed = 0
    const startedAt = Date.now()

    for (let index = 0; index < chunks.length; index += 1) {
      task.onProgress?.(this.createProgress(task, index, chunks.length))

      const context = this.buildContext(chunks, index, task.taskType)
      const prompt = this.buildPrompt(task, promptFn, context, chunks[index])
      const response = await this.runWithTimeout(
        chat(this.model, prompt),
        task.timeout ?? this.options.timeout
      )

      results.push(response.response)
      totalTokensUsed += response.prompt_eval_count ?? 0
    }

    return {
      taskId: task.id,
      taskType: task.taskType,
      result: this.aggregateResults(results),
      tokensUsed: totalTokensUsed,
      durationMs: Date.now() - startedAt
    }
  }

  private createProgress(task: AiTask, index: number, totalChunks: number): AiProgressEvent {
    return {
      taskId: task.id,
      taskType: task.taskType,
      progress: ((index + 1) / totalChunks) * 100,
      currentChunk: index + 1,
      totalChunks
    }
  }

  private buildPrompt(
    task: AiTask,
    promptFn: (...args: string[]) => string,
    context: string,
    text: string
  ): string {
    if (task.taskType === 'translate') {
      return `${context}${promptFn(text, task.targetLang ?? 'en')}`
    }

    if (task.taskType === 'correct') {
      return `${context}${promptFn(text, task.targetLang ?? 'en')}`
    }

    return `${context}${promptFn(text)}`
  }

  private splitText(
    text: string,
    options: { batchSize: number; batchMode: boolean; chunkSize: number }
  ): string[] {
    if (!options.batchMode || text.length <= options.batchSize) {
      return [text]
    }

    const chunks: string[] = []
    let currentChunk = ''
    let currentTokens = 0
    const sentences = text.match(/[^.!?\n]+[.!?\n]+/g) || [text]

    for (const sentence of sentences) {
      const sentenceTokens = this.estimateTokens(sentence)
      if (currentChunk && currentTokens + sentenceTokens > options.chunkSize) {
        chunks.push(currentChunk.trim())
        currentChunk = sentence
        currentTokens = sentenceTokens
        continue
      }

      currentChunk += `${currentChunk ? ' ' : ''}${sentence}`.trimEnd()
      currentTokens += sentenceTokens
    }

    if (currentChunk) {
      chunks.push(currentChunk.trim())
    }

    return chunks
  }

  private buildContext(chunks: string[], currentIndex: number, taskType: string): string {
    if (currentIndex === 0 || taskType === 'summary') {
      return ''
    }

    const previousChunk = chunks[currentIndex - 1]
    const sentences = previousChunk.match(/[^.!?]+[.!?]+/g) || []
    const contextSentences = sentences.slice(-3).join(' ')
    if (!contextSentences) {
      return ''
    }

    return `Previous context: ${contextSentences}\n\n`
  }

  private aggregateResults(results: string[]): string {
    if (results.length <= 1) {
      return results[0] ?? ''
    }

    return results.join('\n\n').trim()
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length * 0.3)
  }

  private async runWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        setTimeout(() => reject(new Error('AI task timeout')), timeoutMs)
      })
    ])
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function toAiError(task: AiTask, error: unknown): AiError {
  return {
    taskId: task.id,
    taskType: task.taskType,
    error: error instanceof Error ? error.message : String(error),
    detail: error instanceof Error ? error.message : String(error)
  }
}

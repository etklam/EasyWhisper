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
  private readonly slotWaiters: Array<() => void> = []

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

    await this.acquireSlot(task.signal)

    try {
      const result = await this.processTask(task)
      task.onResult?.(result)
    } catch (error) {
      task.onResult?.(toAiError(task, error))
    } finally {
      this.releaseSlot()
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

  private async acquireSlot(signal?: AbortSignal): Promise<void> {
    if (this.activeCount < this.options.concurrency) {
      this.activeCount += 1
      return
    }

    await new Promise<void>((resolve, reject) => {
      const waiter = () => {
        cleanup()
        this.activeCount += 1
        resolve()
      }

      const onAbort = () => {
        const waiterIndex = this.slotWaiters.indexOf(waiter)
        if (waiterIndex >= 0) {
          this.slotWaiters.splice(waiterIndex, 1)
        }
        cleanup()
        reject(normalizeAbortError(signal?.reason, true))
      }

      const cleanup = () => {
        signal?.removeEventListener('abort', onAbort)
      }

      if (signal?.aborted) {
        onAbort()
        return
      }

      signal?.addEventListener('abort', onAbort, { once: true })
      this.slotWaiters.push(waiter)
    })
  }

  private releaseSlot(): void {
    this.activeCount = Math.max(0, this.activeCount - 1)
    const nextWaiter = this.slotWaiters.shift()
    nextWaiter?.()
  }

  private async processTask(task: AiTask): Promise<AiRunResult> {
    const promptFn = getPrompt(task.taskType, task.customPrompts)
    const availableContextWindow = Math.max(1, this.options.contextWindow - this.options.outputTokenBudget)
    const effectiveChunkSize =
      task.batchMode === false
        ? task.chunkSize ?? this.options.chunkSize
        : Math.min(task.chunkSize ?? this.options.chunkSize, availableContextWindow)
    const chunks = this.splitText(task.text, {
      batchSize: task.batchMode ? availableContextWindow : Infinity,
      batchMode: task.batchMode ?? false,
      chunkSize: effectiveChunkSize
    })

    const results: string[] = []
    let totalTokensUsed = 0
    const startedAt = Date.now()

    for (let index = 0; index < chunks.length; index += 1) {
      task.onProgress?.(this.createProgress(task, index, chunks.length))

      const context = this.buildContext(chunks, index, task.taskType)
      const prompt = this.buildPrompt(task, promptFn, context, chunks[index])
      const response = await this.runWithTimeout(
        (signal) => chat(this.model, prompt, { signal }),
        task.timeout ?? this.options.timeout,
        task.signal
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
      progress: Math.max(0, Math.min(100, Math.round((index / totalChunks) * 100))),
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

    for (const paragraph of splitParagraphs(text)) {
      const paragraphTokens = this.estimateTokens(paragraph)

      if (paragraphTokens <= options.chunkSize) {
        const separator = currentChunk ? '\n\n' : ''
        if (currentChunk && currentTokens + paragraphTokens > options.chunkSize) {
          chunks.push(currentChunk.trim())
          currentChunk = paragraph
          currentTokens = paragraphTokens
          continue
        }

        currentChunk = `${currentChunk}${separator}${paragraph}`.trim()
        currentTokens += paragraphTokens
        continue
      }

      if (currentChunk) {
        chunks.push(currentChunk.trim())
        currentChunk = ''
        currentTokens = 0
      }

      for (const sentenceChunk of this.splitParagraphBySentences(paragraph, options.chunkSize)) {
        chunks.push(sentenceChunk)
      }
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
    const sentences = extractSentences(previousChunk)
    const contextSentences = sentences.slice(-3).join(' ')
    if (!contextSentences) {
      return ''
    }

    return `Previous context (continue consistently with these last 2-3 sentences): ${contextSentences}\n\n`
  }

  private aggregateResults(results: string[]): string {
    if (results.length <= 1) {
      return results[0] ?? ''
    }

    return results.join('\n\n').trim()
  }

  private estimateTokens(text: string): number {
    const normalized = text.trim()
    if (!normalized) {
      return 0
    }

    const cjkMatches = normalized.match(/[\u3400-\u9fff\uf900-\ufaff]/g) ?? []
    const latinLength = normalized.length - cjkMatches.length
    return Math.ceil(cjkMatches.length + latinLength / 4)
  }

  private splitParagraphBySentences(paragraph: string, chunkSize: number): string[] {
    const chunks: string[] = []
    let current = ''
    let currentTokens = 0

    for (const sentence of extractSentences(paragraph)) {
      const sentenceTokens = this.estimateTokens(sentence)

      if (sentenceTokens > chunkSize) {
        if (current) {
          chunks.push(current.trim())
          current = ''
          currentTokens = 0
        }

        for (const hardChunk of this.splitOversizedSentence(sentence, chunkSize)) {
          chunks.push(hardChunk)
        }
        continue
      }

      if (current && currentTokens + sentenceTokens > chunkSize) {
        chunks.push(current.trim())
        current = sentence
        currentTokens = sentenceTokens
        continue
      }

      current = `${current}${current ? ' ' : ''}${sentence}`.trim()
      currentTokens += sentenceTokens
    }

    if (current) {
      chunks.push(current.trim())
    }

    return chunks
  }

  private splitOversizedSentence(sentence: string, chunkSize: number): string[] {
    const pieces: string[] = []
    let remaining = sentence.trim()

    while (remaining) {
      let sliceLength = Math.max(1, Math.floor(chunkSize * 4))
      if (remaining.length <= sliceLength) {
        pieces.push(remaining.trim())
        break
      }

      let breakIndex = findBestBreakIndex(remaining, sliceLength)
      if (breakIndex <= 0) {
        breakIndex = sliceLength
      }

      pieces.push(remaining.slice(0, breakIndex).trim())
      remaining = remaining.slice(breakIndex).trim()
    }

    return pieces.filter(Boolean)
  }

  private async runWithTimeout<T>(
    runner: (signal: AbortSignal) => Promise<T>,
    timeoutMs: number,
    upstreamSignal?: AbortSignal
  ): Promise<T> {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined
    const timeoutController = new AbortController()
    const signal = upstreamSignal
      ? mergeAbortSignals(upstreamSignal, timeoutController.signal)
      : timeoutController.signal

    try {
      const timeoutPromise = new Promise<T>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          const timeoutError = new Error('AI 任务超时')
          timeoutController.abort(timeoutError)
          reject(timeoutError)
        }, timeoutMs)
      })

      return await Promise.race([runner(signal), timeoutPromise])
    } catch (error) {
      if (signal.aborted) {
        throw normalizeAbortError(signal.reason, upstreamSignal?.aborted === true)
      }
      throw error
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle)
      }
    }
  }
}

function mergeAbortSignals(...signals: Array<AbortSignal | undefined>): AbortSignal {
  const availableSignals = signals.filter((signal): signal is AbortSignal => signal !== undefined)
  if (availableSignals.length === 0) {
    return new AbortController().signal
  }

  const abortedSignal = availableSignals.find((signal) => signal.aborted)
  if (abortedSignal) {
    const controller = new AbortController()
    controller.abort(abortedSignal.reason)
    return controller.signal
  }

  const controller = new AbortController()
  for (const signal of availableSignals) {
    signal.addEventListener(
      'abort',
      () => {
        if (!controller.signal.aborted) {
          controller.abort(signal.reason)
        }
      },
      { once: true }
    )
  }
  return controller.signal
}

function normalizeAbortError(reason: unknown, cancelledByUser: boolean): Error {
  if (reason instanceof Error) {
    return reason
  }

  if (typeof reason === 'string' && reason.trim()) {
    return new Error(reason)
  }

  return new Error(cancelledByUser ? 'AI 任务已取消' : 'AI 任务超时')
}

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
}

function extractSentences(text: string): string[] {
  const matches = text.match(/[^.!?。！？\n]+(?:[.!?。！？]+|$)/g)
  return (matches ?? [text]).map((sentence) => sentence.trim()).filter(Boolean)
}

function findBestBreakIndex(text: string, preferredIndex: number): number {
  const windowStart = Math.max(0, preferredIndex - 80)
  const candidateSlice = text.slice(windowStart, preferredIndex + 1)
  const punctuationIndex = Math.max(
    candidateSlice.lastIndexOf('。'),
    candidateSlice.lastIndexOf('，'),
    candidateSlice.lastIndexOf(','),
    candidateSlice.lastIndexOf(';'),
    candidateSlice.lastIndexOf('；'),
    candidateSlice.lastIndexOf(' ')
  )

  if (punctuationIndex >= 0) {
    return windowStart + punctuationIndex + 1
  }

  return preferredIndex
}

function toAiError(task: AiTask, error: unknown): AiError {
  return {
    taskId: task.id,
    taskType: task.taskType,
    error: error instanceof Error ? error.message : String(error),
    detail: error instanceof Error ? error.message : String(error)
  }
}

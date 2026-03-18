import { defineStore } from 'pinia'

import type {
  AiCustomPrompts,
  AiProgressEvent,
  AiRunResult,
  AiTaskType,
  WorkflowSettings
} from '@shared/types'
import {
  notifyAiCompleted,
  notifyAiFailed,
  notifyAiProgress,
  notifyAiQueued,
  registerAiWorkflowBridge
} from './aiWorkflowCoordinator'
import { useWhisperStore } from './whisper'

export type AiConnectionStatus = 'idle' | 'checking' | 'connected' | 'disconnected'
export type AiWorkflowStatus = 'pending' | 'running' | 'done' | 'error'
export type AiStepStatus = 'pending' | 'running' | 'done' | 'error' | 'skipped'

export interface AiWorkflowStep {
  taskType: AiTaskType
  status: AiStepStatus
  progress: number
  error?: string
}

export interface AiWorkflowTask {
  id: string
  queueTaskId: string
  title: string
  sourceText: string
  currentText: string
  model: string
  targetLang: string
  customPrompts?: AiCustomPrompts
  steps: AiWorkflowStep[]
  results: Partial<Record<AiTaskType, string>>
  status: AiWorkflowStatus
  progress: number
  currentStep?: AiTaskType
  error?: string
  cancelRequested: boolean
  createdAt: string
  startedAt?: string
  completedAt?: string
}

const MAX_AI_CONCURRENT_TASKS = 2
const AI_STEP_ORDER: AiTaskType[] = ['correct', 'translate', 'summary']

export const useAiStore = defineStore('ai', {
  state: () => ({
    connectionStatus: 'idle' as AiConnectionStatus,
    models: [] as string[],
    loadingModels: false,
    workflows: [] as AiWorkflowTask[],
    listenersBound: false,
    unsubscribeHandles: [] as Array<() => void>,
    lastError: '' as string
  }),
  getters: {
    activeCount(state): number {
      return state.workflows.filter((workflow) => workflow.status === 'running').length
    },
    pendingCount(state): number {
      return state.workflows.filter((workflow) => workflow.status === 'pending').length
    },
    currentWorkflow(state): AiWorkflowTask | undefined {
      return state.workflows.find((workflow) => workflow.status === 'running')
    }
  },
  actions: {
    async initialize() {
      this.registerCoordinator()
      this.bindIpcListeners()
      await Promise.allSettled([this.refreshStatus(), this.refreshModels()])
    },

    registerCoordinator() {
      registerAiWorkflowBridge({
        enqueueWorkflow: (input) => this.enqueueWorkflow(input),
        cancelWorkflow: async (queueTaskId) => {
          await this.cancelWorkflow(queueTaskId)
        },
        clearWorkflow: (queueTaskId) => this.clearWorkflow(queueTaskId)
      })
    },

    bindIpcListeners() {
      if (this.listenersBound) {
        return
      }

      this.unsubscribeHandles.push(
        window.fosswhisper.onAiProgress((event) => {
          this.handleProgressEvent(event)
        })
      )

      this.unsubscribeHandles.push(
        window.fosswhisper.onAiResult((result) => {
          this.handleResultEvent(result)
        })
      )

      this.unsubscribeHandles.push(
        window.fosswhisper.onAiError((result) => {
          this.handleResultEvent(result)
        })
      )

      this.listenersBound = true
    },

    async refreshStatus() {
      this.connectionStatus = 'checking'

      try {
        const status = await window.fosswhisper.getAiStatus()
        this.connectionStatus = status.connected ? 'connected' : 'disconnected'
      } catch (error) {
        this.connectionStatus = 'disconnected'
        this.lastError = toErrorMessage(error)
      }
    },

    async refreshModels() {
      this.loadingModels = true

      try {
        this.models = await window.fosswhisper.listAiModels()
        this.connectionStatus = this.models.length > 0 ? 'connected' : this.connectionStatus
        if (this.connectionStatus === 'checking' || this.connectionStatus === 'idle') {
          this.connectionStatus = 'connected'
        }
      } catch (error) {
        this.models = []
        this.connectionStatus = 'disconnected'
        this.lastError = toErrorMessage(error)
      } finally {
        this.loadingModels = false
      }
    },

    enqueueWorkflow(input: { queueTaskId: string; title: string; text: string; settings?: WorkflowSettings }) {
      this.registerCoordinator()
      const settings = input.settings ?? useWhisperStore().settings
      const steps = getEnabledAiTasks(settings)

      if (!settings.aiEnabled || !settings.aiModel || steps.length === 0) {
        return false
      }

      const workflow = createWorkflowTask(input, settings, steps)
      const existingIndex = this.workflows.findIndex((item) => item.queueTaskId === input.queueTaskId)

      if (existingIndex >= 0) {
        this.workflows.splice(existingIndex, 1, workflow)
      } else {
        this.workflows.unshift(workflow)
      }

      this.lastError = ''
      notifyAiQueued(input.queueTaskId, steps[0])
      this.pumpQueue()
      return true
    },

    async cancelWorkflow(queueTaskId: string) {
      this.registerCoordinator()
      const workflow = this.findWorkflowByQueueTask(queueTaskId)
      if (!workflow) {
        return
      }

      workflow.cancelRequested = true
      const executionTaskId = workflow.currentStep
        ? buildExecutionTaskId(workflow.id, workflow.currentStep)
        : undefined

      if (workflow.status === 'running' && executionTaskId) {
        try {
          await window.fosswhisper.stopAi({ taskId: executionTaskId })
        } catch (error) {
          this.lastError = toErrorMessage(error)
        }
      }

      if (workflow.status === 'pending') {
        workflow.status = 'error'
        workflow.error = '已取消'
        workflow.completedAt = new Date().toISOString()
      }
    },

    clearWorkflow(queueTaskId: string) {
      this.workflows = this.workflows.filter((workflow) => workflow.queueTaskId !== queueTaskId)
    },

    reset() {
      for (const unsubscribe of this.unsubscribeHandles) {
        unsubscribe()
      }
      this.connectionStatus = 'idle'
      this.models = []
      this.loadingModels = false
      this.workflows = []
      this.listenersBound = false
      this.unsubscribeHandles = []
      this.lastError = ''
    },

    pumpQueue() {
      this.registerCoordinator()
      while (this.activeCount < MAX_AI_CONCURRENT_TASKS) {
        const nextWorkflow = this.workflows.find(
          (workflow) => workflow.status === 'pending' && !workflow.cancelRequested
        )

        if (!nextWorkflow) {
          return
        }

        void this.runWorkflow(nextWorkflow.id)
      }
    },

    async runWorkflow(workflowId: string) {
      this.registerCoordinator()
      const workflow = this.findWorkflow(workflowId)
      if (!workflow || workflow.status !== 'pending') {
        return
      }

      workflow.status = 'running'
      workflow.startedAt = new Date().toISOString()
      workflow.progress = 0
      notifyAiProgress(workflow.queueTaskId, 0, workflow.steps[0]?.taskType)

      try {
        for (const step of workflow.steps) {
          if (workflow.cancelRequested) {
            throw new Error('已取消')
          }

          workflow.currentStep = step.taskType
          step.status = 'running'
          step.progress = Math.max(step.progress, 1)

          const result = await window.fosswhisper.runAi({
            id: buildExecutionTaskId(workflow.id, step.taskType),
            model: workflow.model,
            text: workflow.currentText,
            taskType: step.taskType,
            targetLang: workflow.targetLang,
            batchMode: step.taskType !== 'summary',
            customPrompts: workflow.customPrompts
          })

          if (workflow.cancelRequested) {
            throw new Error('已取消')
          }

          if ('error' in result) {
            throw new Error(result.error)
          }

          if ('skipped' in result) {
            step.status = 'skipped'
            step.progress = 100
            continue
          }

          workflow.results[step.taskType] = result.result
          if (step.taskType !== 'summary') {
            workflow.currentText = result.result
          }
        }

        workflow.status = 'done'
        workflow.progress = 100
        workflow.completedAt = new Date().toISOString()
        workflow.currentStep = undefined
        notifyAiCompleted(workflow.queueTaskId, workflow.results)
      } catch (error) {
        workflow.status = 'error'
        workflow.error = toErrorMessage(error)
        workflow.completedAt = new Date().toISOString()
        workflow.currentStep = undefined
        notifyAiFailed(workflow.queueTaskId, workflow.error)
        void this.refreshStatus()
      } finally {
        this.pumpQueue()
      }
    },

    handleProgressEvent(event: AiProgressEvent) {
      const workflow = this.findWorkflowByExecutionTaskId(event.taskId)
      if (!workflow) {
        return
      }

      const step = workflow.steps.find((item) => item.taskType === event.taskType)
      if (!step) {
        return
      }

      step.status = 'running'
      step.progress = clampProgress(event.progress)
      workflow.status = 'running'
      workflow.currentStep = event.taskType
      workflow.progress = calculateWorkflowProgress(workflow.steps)
      notifyAiProgress(workflow.queueTaskId, workflow.progress, event.taskType)
    },

    handleResultEvent(result: AiRunResult) {
      const workflow = this.findWorkflowByExecutionTaskId(result.taskId)
      if (!workflow) {
        return
      }

      const step = workflow.steps.find((item) => item.taskType === result.taskType)
      if (!step) {
        return
      }

      if ('error' in result) {
        step.status = 'error'
        step.error = result.error
        workflow.error = result.error
      } else if ('skipped' in result) {
        step.status = 'skipped'
      } else {
        step.status = 'done'
        step.progress = 100
      }

      workflow.progress = calculateWorkflowProgress(workflow.steps)
    },

    findWorkflow(workflowId: string): AiWorkflowTask | undefined {
      return this.workflows.find((workflow) => workflow.id === workflowId)
    },

    findWorkflowByQueueTask(queueTaskId: string): AiWorkflowTask | undefined {
      return this.workflows.find((workflow) => workflow.queueTaskId === queueTaskId)
    },

    findWorkflowByExecutionTaskId(taskId: string): AiWorkflowTask | undefined {
      const workflowId = extractWorkflowId(taskId)
      return workflowId ? this.findWorkflow(workflowId) : undefined
    }
  }
})

function createWorkflowTask(
  input: { queueTaskId: string; title: string; text: string },
  settings: WorkflowSettings,
  steps: AiTaskType[]
): AiWorkflowTask {
  return {
    id: crypto.randomUUID(),
    queueTaskId: input.queueTaskId,
    title: input.title,
    sourceText: input.text,
    currentText: input.text,
    model: settings.aiModel,
    targetLang: settings.aiTargetLang,
    customPrompts: settings.aiCustomPrompts,
    steps: steps.map((taskType) => ({
      taskType,
      status: 'pending',
      progress: 0
    })),
    results: {},
    status: 'pending',
    progress: 0,
    error: undefined,
    cancelRequested: false,
    createdAt: new Date().toISOString()
  }
}

function buildExecutionTaskId(workflowId: string, taskType: AiTaskType): string {
  return `${workflowId}:${taskType}`
}

function extractWorkflowId(taskId: string): string | undefined {
  const separatorIndex = taskId.lastIndexOf(':')
  if (separatorIndex <= 0) {
    return undefined
  }

  return taskId.slice(0, separatorIndex)
}

function getEnabledAiTasks(settings: WorkflowSettings): AiTaskType[] {
  return AI_STEP_ORDER.filter((taskType) => {
    if (taskType === 'correct') return settings.aiCorrect
    if (taskType === 'translate') return settings.aiTranslate
    return settings.aiSummary
  })
}

function calculateWorkflowProgress(steps: AiWorkflowStep[]): number {
  if (steps.length === 0) {
    return 100
  }

  const total = steps.reduce((sum, step) => {
    if (step.status === 'done' || step.status === 'skipped') {
      return sum + 100
    }
    return sum + step.progress
  }, 0)

  return clampProgress(total / steps.length)
}

function clampProgress(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

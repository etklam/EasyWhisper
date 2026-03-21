import type { AiTaskType, WorkflowSettings } from '@shared/types'

interface EnqueueWorkflowInput {
  queueTaskId: string
  title: string
  text: string
  settings: WorkflowSettings
}

interface QueueBridge {
  markAiQueued: (taskId: string, step?: AiTaskType) => void
  updateAiProgress: (taskId: string, progress: number, step?: AiTaskType) => void
  completeAiTask: (taskId: string, results: Partial<Record<AiTaskType, string>>) => void
  failAiTask: (taskId: string, error: string) => void
}

interface AiBridge {
  enqueueWorkflow: (input: EnqueueWorkflowInput) => boolean
  cancelWorkflow: (queueTaskId: string) => Promise<void>
  clearWorkflow: (queueTaskId: string) => void
}

let queueBridge: QueueBridge | undefined
let aiBridge: AiBridge | undefined

export function registerQueueWorkflowBridge(bridge: QueueBridge): void {
  queueBridge = bridge
}

export function registerAiWorkflowBridge(bridge: AiBridge): void {
  aiBridge = bridge
}

export function enqueueAiWorkflow(input: EnqueueWorkflowInput): boolean {
  return aiBridge?.enqueueWorkflow(input) ?? false
}

export async function cancelAiWorkflow(queueTaskId: string): Promise<void> {
  await aiBridge?.cancelWorkflow(queueTaskId)
}

export function clearAiWorkflow(queueTaskId: string): void {
  aiBridge?.clearWorkflow(queueTaskId)
}

export function notifyAiQueued(taskId: string, step?: AiTaskType): void {
  queueBridge?.markAiQueued(taskId, step)
}

export function notifyAiProgress(taskId: string, progress: number, step?: AiTaskType): void {
  queueBridge?.updateAiProgress(taskId, progress, step)
}

export function notifyAiCompleted(
  taskId: string,
  results: Partial<Record<AiTaskType, string>>
): void {
  queueBridge?.completeAiTask(taskId, results)
}

export function notifyAiFailed(taskId: string, error: string): void {
  queueBridge?.failAiTask(taskId, error)
}

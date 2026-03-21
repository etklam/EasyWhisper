import type { AiTaskType, WorkflowSettings } from './types'

export const AI_STEP_ORDER: AiTaskType[] = ['correct', 'translate', 'summary']

export function getEnabledAiTasks(
  settings: Pick<WorkflowSettings, 'aiCorrect' | 'aiTranslate' | 'aiSummary'>
): AiTaskType[] {
  return AI_STEP_ORDER.filter((taskType) => {
    if (taskType === 'correct') return settings.aiCorrect
    if (taskType === 'translate') return settings.aiTranslate
    return settings.aiSummary
  })
}

export function clampProgress(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}

export function normalizeProgress(value: number): number {
  if (value <= 1) {
    return clampProgress(value * 100)
  }

  return clampProgress(value)
}

export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

import { ipcMain } from 'electron'

import { IPC_CHANNELS } from '@shared/ipc'
import type { WorkflowSettings } from '@shared/types'
import type { SettingsSchema } from '@shared/settings.schema'
import { SettingsManager } from '../settings/SettingsManager'

const settingsManager = new SettingsManager()

export function registerSettingsIpc(): void {
  if (typeof ipcMain.removeHandler === 'function') {
    ipcMain.removeHandler(IPC_CHANNELS.SETTINGS_GET)
  }
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, async (): Promise<WorkflowSettings> => {
    return toWorkflowSettings(settingsManager.getSettings())
  })

  if (typeof ipcMain.removeHandler === 'function') {
    ipcMain.removeHandler(IPC_CHANNELS.SETTINGS_SET)
  }
  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_SET,
    async (_event, partial: Partial<WorkflowSettings>): Promise<WorkflowSettings> => {
      settingsManager.updateSettings(toSettingsPatch(partial))
      return toWorkflowSettings(settingsManager.getSettings())
    }
  )
}

function toWorkflowSettings(settings: SettingsSchema): WorkflowSettings {
  return {
    modelPath: settings.whisperModel,
    threads: settings.whisperThreads,
    language: settings.whisperLanguage ?? 'auto',
    useMetal: settings.whisperUseMetal ?? true,
    outputDir: settings.outputDir,
    outputFormats: settings.outputFormats,
    ytdlpAudioFormat: settings.ytdlpAudioFormat,
    ytdlpCookiesPath: settings.ytdlpCookiesPath ?? '',
    aiEnabled: settings.ai.enabled,
    aiModel: settings.ai.model,
    aiTargetLang: settings.ai.targetLang,
    aiCorrect: settings.ai.tasks.correct,
    aiTranslate: settings.ai.tasks.translate,
    aiSummary: settings.ai.tasks.summary,
    aiCustomPrompts: settings.ai.customPrompts
  }
}

function toSettingsPatch(partial: Partial<WorkflowSettings>): Partial<SettingsSchema> {
  const next: Partial<SettingsSchema> = {}

  if (partial.modelPath !== undefined) next.whisperModel = partial.modelPath
  if (partial.threads !== undefined) next.whisperThreads = partial.threads
  if (partial.language !== undefined) next.whisperLanguage = partial.language
  if (partial.useMetal !== undefined) next.whisperUseMetal = partial.useMetal
  if (partial.outputDir !== undefined) next.outputDir = partial.outputDir
  if (partial.outputFormats !== undefined) next.outputFormats = partial.outputFormats
  if (partial.ytdlpAudioFormat !== undefined) next.ytdlpAudioFormat = partial.ytdlpAudioFormat
  if (partial.ytdlpCookiesPath !== undefined) next.ytdlpCookiesPath = partial.ytdlpCookiesPath || undefined

  const aiPatch: Partial<SettingsSchema['ai']> = {}
  const aiTaskPatch: Partial<SettingsSchema['ai']['tasks']> = {}

  if (partial.aiEnabled !== undefined) aiPatch.enabled = partial.aiEnabled
  if (partial.aiModel !== undefined) aiPatch.model = partial.aiModel
  if (partial.aiTargetLang !== undefined) aiPatch.targetLang = partial.aiTargetLang
  if (partial.aiCustomPrompts !== undefined) aiPatch.customPrompts = partial.aiCustomPrompts
  if (partial.aiCorrect !== undefined) aiTaskPatch.correct = partial.aiCorrect
  if (partial.aiTranslate !== undefined) aiTaskPatch.translate = partial.aiTranslate
  if (partial.aiSummary !== undefined) aiTaskPatch.summary = partial.aiSummary

  if (Object.keys(aiTaskPatch).length > 0) {
    aiPatch.tasks = {
      ...settingsManager.getSettings().ai.tasks,
      ...aiTaskPatch
    }
  }

  if (Object.keys(aiPatch).length > 0) {
    next.ai = {
      ...settingsManager.getSettings().ai,
      ...aiPatch
    }
  }

  return next
}

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getSettingsMock, updateSettingsMock } = vi.hoisted(() => ({
  getSettingsMock: vi.fn(),
  updateSettingsMock: vi.fn()
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
    removeHandler: vi.fn()
  }
}))

vi.mock('../../main/settings/SettingsManager', () => ({
  SettingsManager: vi.fn().mockImplementation(() => ({
    getSettings: getSettingsMock,
    updateSettings: updateSettingsMock
  }))
}))

import { ipcMain } from 'electron'
import { registerSettingsIpc } from '../../main/ipc/settings'

describe('Settings IPC', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getSettingsMock.mockReturnValue(createSettings())
  })

  it('maps persisted settings to workflow settings', async () => {
    registerSettingsIpc()

    const handler = getHandler('settings:get')
    await expect(handler({}, undefined)).resolves.toEqual({
      modelPath: 'ggml-base.bin',
      threads: 4,
      language: 'auto',
      useMetal: true,
      outputDir: '',
      outputFormats: ['txt', 'srt'],
      ytdlpAudioFormat: 'mp3',
      ytdlpCookiesPath: '',
      ytdlpMode: undefined,
      ffmpegMode: undefined,
      aiEnabled: true,
      aiModel: 'llama3',
      aiTargetLang: 'zh-TW',
      aiCorrect: true,
      aiTranslate: false,
      aiSummary: true,
      locale: 'en',
      aiCustomPrompts: {
        summary: 'Summarize: {text}'
      }
    })
  })

  it('merges nested AI settings before persisting', async () => {
    updateSettingsMock.mockImplementation((partial) => {
      getSettingsMock.mockReturnValue({
        ...createSettings(),
        ...partial,
        ai: partial.ai ?? createSettings().ai
      })
    })

    registerSettingsIpc()

    const handler = getHandler('settings:set')
    const result = await handler({}, {
      aiTranslate: true,
      aiSummary: false,
      aiTargetLang: 'ja',
      ytdlpCookiesPath: ''
    })

    expect(updateSettingsMock).toHaveBeenCalledWith({
      ytdlpCookiesPath: undefined,
      ai: {
        enabled: true,
        model: 'llama3',
        targetLang: 'ja',
        customPrompts: {
          summary: 'Summarize: {text}'
        },
        tasks: {
          correct: true,
          translate: true,
          summary: false
        }
      }
    })

    expect(result.aiTranslate).toBe(true)
    expect(result.aiSummary).toBe(false)
    expect(result.aiTargetLang).toBe('ja')
    expect(result.ytdlpCookiesPath).toBe('')
  })
})

function getHandler(channel: string) {
  const record = vi.mocked(ipcMain.handle).mock.calls.find((entry) => entry[0] === channel)
  if (!record) {
    throw new Error(`Handler not found for channel: ${channel}`)
  }

  return record[1]
}

function createSettings() {
  return {
    locale: 'en' as const,
    whisperModel: 'ggml-base.bin',
    whisperThreads: 4,
    whisperLanguage: 'auto',
    whisperUseMetal: true,
    outputDir: '',
    outputFormats: ['txt', 'srt'] as const,
    maxTranscribeConcurrency: 1,
    maxAiConcurrency: 2,
    ytdlpAudioFormat: 'mp3' as const,
    ytdlpCookiesPath: undefined,
    ai: {
      enabled: true,
      model: 'llama3',
      tasks: {
        correct: true,
        translate: false,
        summary: true
      },
      targetLang: 'zh-TW',
      customPrompts: {
        summary: 'Summarize: {text}'
      }
    }
  }
}

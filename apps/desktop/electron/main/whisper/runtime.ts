import { app } from 'electron'
import path from 'node:path'

import { WhisperMac } from './WhisperMac'
import { WhisperWindows } from './WhisperWindows'
import type { WhisperRuntime } from './shared'

let runtime: WhisperRuntime | null = null

export function getWhisperRuntime(): WhisperRuntime {
  if (runtime) {
    return runtime
  }

  const userDataDir = app.getPath('userData')

  if (process.platform === 'win32') {
    runtime = new WhisperWindows({
      userDataDir,
      modelsDir: path.join(userDataDir, 'models')
    })
    return runtime
  }

  runtime = new WhisperMac({
    projectRoot: userDataDir,
    modelsDir: path.join(userDataDir, 'models')
  })
  return runtime
}

import { app } from 'electron'

import { ToolsManager } from './ToolsManager'

let cachedManager: ToolsManager | null = null

export function getToolsManager(): ToolsManager {
  if (!cachedManager) {
    cachedManager = new ToolsManager({ userDataDir: app.getPath('userData') })
  }
  return cachedManager
}

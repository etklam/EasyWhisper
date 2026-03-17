import { app, BrowserWindow } from 'electron'
import path from 'node:path'

import { registerAiIpc } from './ipc/ai'
import { registerSettingsIpc } from './ipc/settings'
import { registerWhisperIpc } from './ipc/whisper'
import { registerYtDlpIpc } from './ipc/ytdlp'

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 980,
    minHeight: 680,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  registerWhisperIpc(mainWindow)
  registerAiIpc(mainWindow)
  registerYtDlpIpc(mainWindow)
  registerSettingsIpc()

  if (process.env.VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'))
  }

  return mainWindow
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

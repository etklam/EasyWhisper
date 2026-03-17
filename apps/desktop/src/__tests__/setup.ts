import { vi } from 'vitest'

// Mock Electron APIs
vi.mock('electron', () => ({
  ipcRenderer: {
    on: vi.fn(),
    once: vi.fn(),
    removeListener: vi.fn(),
    send: vi.fn(),
    invoke: vi.fn()
  },
  contextBridge: {
    exposeInMainWorld: vi.fn()
  }
}))

// Global test utilities
global.matchMedia = vi.fn().mockImplementation((query) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: vi.fn(),
  removeListener: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn()
}))

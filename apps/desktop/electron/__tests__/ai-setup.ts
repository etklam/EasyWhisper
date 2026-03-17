import { vi } from 'vitest'

// Mock fetch globally for all AI tests
global.fetch = vi.fn(() => ({
  ok: true,
  json: async () => ({ models: [] })
}))

global.fetch = vi.fn().mockImplementation((url: string) => {
  // Check for Ollama API endpoints
  if (url.includes('/api/tags')) {
    return Promise.resolve({
      ok: true,
      json: async () => ({ models: [] })
    })
  }

  if (url.includes('/api/generate')) {
    return Promise.resolve({
      ok: true,
      json: async () => ({
        response: 'Mocked AI response',
        prompt_eval_count: 50,
        eval_count: 100
      })
    })
  }

  return Promise.reject(new Error('URL not mocked'))
})

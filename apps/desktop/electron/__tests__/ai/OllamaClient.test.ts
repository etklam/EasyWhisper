import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { checkOllama, listModels, chat } from '../../main/ai/OllamaClient'

vi.mock('node:fetch', () => ({
  default: vi.fn()
}))

describe('OllamaClient', () => {
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  describe('checkOllama', () => {
    it('should return true when Ollama is running', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ models: [] })
      })

      const result = await checkOllama()

      expect(result).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith('http://localhost:11434/api/tags')
    })

    it('should return false when fetch fails', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'))

      const result = await checkOllama()

      expect(result).toBe(false)
    })

    it('should return false when API returns error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false
      })

      const result = await checkOllama()

      expect(result).toBe(false)
    })
  })

  describe('listModels', () => {
    it('should return list of model names', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          models: [
            { name: 'llama2' },
            { name: 'mistral' },
            { name: 'codellama' }
          ]
        })
      })

      const models = await listModels()

      expect(models).toEqual(['llama2', 'mistral', 'codellama'])
    })

    it('should handle empty model list', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ models: [] })
      })

      const models = await listModels()

      expect(models).toEqual([])
    })

    it('should throw error when API call fails', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      await expect(listModels()).rejects.toThrow('Network error')
    })

    it('should handle API error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500
      })

      await expect(listModels()).rejects.toThrow('Ollama API error')
    })
  })

  describe('chat', () => {
    it('should send chat request to Ollama', async () => {
      const mockResponse = {
        response: 'This is a generated response'
      }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      })

      const result = await chat('llama2', 'Test prompt')

      expect(result.response).toBe('This is a generated response')
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('http://localhost:11434/api/generate'),
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('llama2')
        })
      )
    })

    it('should handle chat request error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection error'))

      await expect(chat('llama2', 'Test')).rejects.toThrow('Connection error')
    })

    it('should handle API error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500
      })

      await expect(chat('llama2', 'Test')).rejects.toThrow('Ollama API error')
    })
  })
})

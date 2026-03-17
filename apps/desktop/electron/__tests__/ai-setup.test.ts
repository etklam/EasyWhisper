import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// AI 模块 Mock 配置测试
describe('AI Mock Setup', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should mock fetch globally', () => {
    expect(global.fetch).toBeDefined()
  })

  it('should return success for /api/tags', async () => {
    const response = await global.fetch('http://localhost:11434/api/tags')
    
    expect(response.ok).toBe(true)
    const data = await response.json()
    expect(data).toEqual({ models: [] })
  })

  it('should return success for /api/generate', async () => {
    const response = await global.fetch('http://localhost:11434/api/generate')
    
    expect(response.ok).toBe(true)
    const data = await response.json()
    expect(data.response).toBe('Mocked AI response')
  })

  it('should reject for unknown URLs', async () => {
    await expect(global.fetch('http://unknown.com'))
      .rejects.toThrow('URL not mocked')
  })
})

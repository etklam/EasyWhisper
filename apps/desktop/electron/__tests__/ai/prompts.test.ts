import { describe, it, expect } from 'vitest'
import { getPrompt, DEFAULT_PROMPTS } from '../../main/ai/prompts'

describe('AI Prompts', () => {
  describe('Default Prompts', () => {
    it('should generate translate prompt', () => {
      const prompt = DEFAULT_PROMPTS.translate('Hello world', 'zh-TW')

      expect(prompt).toContain('Hello world')
      expect(prompt).toContain('zh-TW')
      expect(prompt).toContain('Translate')
    })

    it('should generate summary prompt', () => {
      const prompt = DEFAULT_PROMPTS.summary('This is a long transcript about AI development.')

      expect(prompt).toContain('This is a long transcript')
      expect(prompt).toContain('concise summary')
      expect(prompt).toContain('key points')
    })

    it('should generate correct prompt', () => {
      const prompt = DEFAULT_PROMPTS.correct('This is som text with typos.', 'en')

      expect(prompt).toContain('This is som text with typos')
      expect(prompt).toContain('Fix typos')
      expect(prompt).toContain('en')
    })
  })

  describe('getPrompt', () => {
    it('should return default prompt when no custom prompt provided', () => {
      const prompt = getPrompt('translate', undefined)

      expect(typeof prompt).toBe('function')
    })

    it('should return custom prompt when provided', () => {
      const customPrompts = {
        translate: 'Custom translate template: {text}'
      }

      const promptFn = getPrompt('translate', customPrompts)
      const result = promptFn('Hello world')

      expect(result).toBe('Custom translate template: Hello world')
    })

    it('should replace placeholders in custom prompt', () => {
      const customPrompts = {
        translate: 'Translate {text} to {targetLang}'
      }

      const promptFn = getPrompt('translate', customPrompts)
      const result = promptFn('Hello world', 'zh-TW')

      expect(result).toBe('Translate Hello world to zh-TW')
    })

    it('should handle multiple placeholders', () => {
      const customPrompts = {
        correct: 'Correct {lang} text: {text} - {lang}'
      }

      const promptFn = getPrompt('correct', customPrompts)
      const result = promptFn('Hello', 'en')

      expect(result).toBe('Correct en text: Hello - en')
    })

    it('should handle missing placeholders', () => {
      const customPrompts = {
        translate: 'Translate {text} to {targetLang}'
      }

      const promptFn = getPrompt('translate', customPrompts)
      const result = promptFn('Hello world')

      // Missing {targetLang} - should leave it as placeholder
      expect(result).toBe('Translate Hello world to {targetLang}')
    })

    it('should handle extra arguments', () => {
      const customPrompts = {
        summary: 'Summary: {text}'
      }

      const promptFn = getPrompt('summary', customPrompts)
      const result = promptFn('Test')

      // Extra arguments should be ignored
      expect(result).toBe('Summary: Test')
    })
  })

  describe('Prompt Generation', () => {
    it('should generate translate prompt for Chinese', () => {
      const prompt = DEFAULT_PROMPTS.translate('Hello world', 'zh-TW')

      expect(prompt).toMatch(/Translate/)
      expect(prompt).toMatch(/zh-TW/)
    })

    it('should generate summary prompt for technical content', () => {
      const prompt = DEFAULT_PROMPTS.summary(`
        Technical discussion about microservices architecture.
        Key points: service discovery, load balancing, API gateway.
        Challenges: inter-service communication, data consistency.
      `)

      expect(prompt).toContain('concise summary')
      expect(prompt).toContain('Key points')
    })

    it('should generate correct prompt with language specified', () => {
      const prompt = DEFAULT_PROMPTS.correct('Som typos in this sentenc.', 'en')

      expect(prompt).toContain('en')
      expect(prompt).toContain('Fix typos')
    })
  })
})

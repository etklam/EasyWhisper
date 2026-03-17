import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import path from 'node:path'

export default defineConfig({
  plugins: [vue()],
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/__tests__/setup.ts', './electron/__tests__/ai-setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html']
    },
    testIgnore: [
      '**/ai/**',
      '**/OllamaClient.test.ts',
      '**/prompts.test.ts',
      '**/AiPipeline.test.ts'
    ],
    alias: {
      '@shared': path.resolve(__dirname, '../../../packages/shared/src')
    }
  }
})

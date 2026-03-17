import { defineConfig } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import path from 'node:path'

export default defineConfig({
  main: {
    build: {
      outDir: 'dist-electron/main',
      lib: {
        entry: path.resolve(__dirname, 'electron/main/index.ts')
      }
    },
    resolve: {
      alias: {
        '@shared': path.resolve(__dirname, '../../packages/shared/src')
      }
    }
  },
  preload: {
    build: {
      outDir: 'dist-electron/preload',
      lib: {
        entry: path.resolve(__dirname, 'electron/preload/index.ts')
      }
    },
    resolve: {
      alias: {
        '@shared': path.resolve(__dirname, '../../packages/shared/src')
      }
    }
  },
  renderer: {
    build: {
      rollupOptions: {
        input: path.resolve(__dirname, 'src/index.html')
      }
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
        '@shared': path.resolve(__dirname, '../../packages/shared/src')
      }
    },
    plugins: [vue()]
  }
})

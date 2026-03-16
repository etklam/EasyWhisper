# 跨平台 Whisper 工具開發計劃

> Mac 優先 · Windows 次之 · Electron + Native Backend 架構

架構核心思路
整個架構以「平台分支在 Main Process，UI 完全無感」為原則。main/whisper/index.ts 根據 process.platform 自動載入 WhisperMac 或 WhisperWin，Vue UI 層完全不需要知道底層差異。
Mac 優先的具體體現
Phase 1–3 全部在 Mac 上完成，包含批次處理、進度追蹤、全部 AI 功能，確保核心體驗穩定後才開始 Windows 移植。這樣也能讓你在 Windows 階段只需專注處理 const-me COM 介面這個最大的技術難點。
const-me 整合的最大風險
從 Node.js 呼叫 Windows COM 介面是整個專案技術風險最高的點。建議準備備案：先做一個薄的 C++ CLI wrapper exe，接收 stdin 參數、輸出 JSON 到 stdout，讓 Node 的 child_process.spawn 呼叫它，這樣可以完全迴避 FFI/COM 的複雜度，等功能穩定後再考慮是否直接 binding。
ffmpeg 建議
Mac 版本可以使用 ffmpeg-static npm 套件，它會自動提供對應平台的靜態 binary，省去手動管理的麻煩。

---

## 目錄

1. [專案概覽](#專案概覽)
2. [技術架構決策](#技術架構決策)
3. [Phase 1 — Mac 基礎建設](#phase-1--mac-基礎建設-whispercpp--metal)
4. [Phase 2 — Core 功能實作](#phase-2--core-功能實作)
5. [Phase 3 — AI 整合](#phase-3--ai-整合-ollama)
6. [Phase 4 — Windows 移植](#phase-4--windows-移植-const-me-whisper)
7. [Phase 5 — Packaging & 發佈](#phase-5--packaging--發佈)
8. [目錄結構](#目錄結構)
9. [技術選型總表](#技術選型總表)
10. [時程估算](#時程估算)
11. [測試策略](#測試策略)
12. [風險與備案](#風險與備案)

---

## 專案概覽

### 核心功能

| 功能模組 | 說明 |
|---|---|
| **音訊來源 — 檔案拖放** | 支援 `.mp3 .wav .m4a .mp4 .mov .mkv` 等格式拖放入佇列 |
| **音訊來源 — yt-dlp 批量下載** | 多行 URL 輸入框，每行一條影片，僅下載音訊，自動銜接轉錄佇列 |
| **Whisper Batch Process** | 佇列管理、進度追蹤、輸出格式（txt / srt / vtt / json） |
| **AI — 翻譯** | 透過 Ollama 本地模型將轉錄文字翻譯至目標語言 |
| **AI — 摘要** | 長文摘要，支援自訂 prompt 模板 |
| **AI — 修正錯別字** | 後處理 ASR 輸出，修正常見辨識錯誤 |
| **i18n 多語系** | UI 介面支援 English / 繁體中文 / 简体中文，跟隨系統語言或手動切換 |

### 平台目標

| 平台 | Whisper 後端 | GPU 加速 |
|---|---|---|
| macOS (優先) | `whisper.cpp` | Apple Metal (`CoreML` + `ggml-metal`) |
| Windows | `const-me/Whisper` (COM) | DirectCompute → AMD GPU 友善 |

---

## 技術架構決策

### 前端框架：Electron + Vue 3 + TypeScript

```
┌─────────────────────────────────────────┐
│           Electron Renderer              │
│         (Vue 3 + TypeScript)            │
│    UI / 佇列管理 / 設定 / 結果顯示       │
└──────────────┬──────────────────────────┘
               │ IPC (ipcRenderer / ipcMain)
┌──────────────▼──────────────────────────┐
│           Electron Main Process          │
│         Node.js + native addons         │
│    任務排程 / 檔案 I/O / 程序管理        │
└──────────────┬──────────────────────────┘
               │
       ┌───────┴────────┐
       ▼                ▼
 ┌──────────┐    ┌─────────────┐
 │whisper.cpp│    │const-me/    │
 │(macOS)   │    │Whisper(Win) │
 │Metal GPU │    │DirectCompute│
 └──────────┘    └─────────────┘
               │
               ▼
        ┌────────────┐
        │  Ollama    │
        │ Local API  │
        │ :11434     │
        └────────────┘
```

### Whisper 呼叫策略

- **macOS**：以 Node.js `child_process.spawn` 呼叫預編譯的 `whisper-cli` binary（Metal 加速），或透過 `node-addon-api` 封裝 C++ binding。
- **Windows**：透過 `edge-js` 或 `ffi-napi` 呼叫 `const-me/Whisper` 的 COM 介面，也可 spawn 其 CLI wrapper。
- **IPC 通道**：主程序向渲染程序串流 `progress` / `result` / `error` 事件。

### IPC 契約定義

所有 IPC channel name 和 payload type 集中定義在 `shared/ipc.ts`，main process 和 renderer 共用同一份型別，避免 channel name 衝突和 type 不一致。

```typescript
// shared/ipc.ts
// ── Channel 命名規範：{模組}:{動作} ──

export const IPC = {
  // 佇列
  QUEUE_ADD_FILES:    'queue:addFiles',
  QUEUE_ADD_URLS:     'queue:addUrls',
  QUEUE_PAUSE:        'queue:pause',
  QUEUE_CANCEL:       'queue:cancel',
  QUEUE_RETRY:        'queue:retry',
  QUEUE_STATE:        'queue:state',        // main → renderer 推送完整佇列狀態

  // Whisper
  WHISPER_PROGRESS:   'whisper:progress',   // main → renderer
  WHISPER_RESULT:     'whisper:result',
  WHISPER_ERROR:      'whisper:error',

  // yt-dlp
  YTDLP_PROGRESS:     'ytdlp:progress',
  YTDLP_ERROR:        'ytdlp:error',

  // AI
  AI_RUN:             'ai:run',
  AI_PROGRESS:        'ai:progress',
  AI_RESULT:          'ai:result',
  AI_ERROR:           'ai:error',

  // 模型
  MODEL_LIST:         'model:list',
  MODEL_DOWNLOAD:     'model:download',
  MODEL_PROGRESS:     'model:progress',

  // 設定
  SETTINGS_GET:       'settings:get',
  SETTINGS_SET:       'settings:set',
} as const

// ── Payload 型別 ──

export interface QueueProgressPayload {
  id: string
  type: 'download' | 'convert' | 'transcribe' | 'ai'
  progress: number  // 0–100
}

export interface AppError {
  code: string      // e.g. 'YTDLP_PATH_READ_FAILED'
  detail?: string   // 技術細節（debug 用，不直接顯示給使用者）
}

export interface WhisperResultPayload {
  id: string
  outputPath: string
  format: 'txt' | 'srt' | 'vtt' | 'json'
}

export interface AiResultPayload {
  id: string
  task: 'correct' | 'translate' | 'summary'
  text: string
}
```

> 所有 IPC handler 透過 `IPC.XXX` 常數引用 channel name，禁止使用字串字面值。新增 channel 時只需在此檔案加一行，TypeScript 會自動檢查兩端的 payload 型別是否匹配。

---

## Phase 1 — Mac 基礎建設 (whisper.cpp + Metal)

### 1.1 開發環境

```bash
# 安裝必要工具
xcode-select --install
brew install cmake git node

# Clone & 編譯 whisper.cpp（Metal 版）
git clone https://github.com/ggml-org/whisper.cpp
cd whisper.cpp
cmake -B build -DWHISPER_METAL=ON -DWHISPER_BUILD_EXAMPLES=ON
cmake --build build --config Release -j$(sysctl -n hw.logicalcpu)
```

### 1.2 模型管理

```
models/
  ggml-base.bin       # 預設下載
  ggml-small.bin
  ggml-medium.bin
  ggml-large-v3.bin
```

- 應用程式首次啟動時引導使用者下載模型。
- 支援自訂模型路徑。
- 顯示模型大小與預估速度供使用者參考。

### 1.3 whisper.cpp Node.js 整合

選項 A（推薦，快速迭代）：

```typescript
// main/whisper/WhisperMac.ts
import { spawn } from 'child_process'
import path from 'path'
import { createLineBuffer } from '../utils/lineBuffer'

export function transcribe(opts: TranscribeOptions): Promise<TranscribeResult> {
  return new Promise((resolve, reject) => {
    const bin = getWhisperBinaryPath() // app.getAppPath() 內的 resources/
    const args = [
      '-m', opts.modelPath,
      '-f', opts.audioPath,
      '-l', opts.language ?? 'auto',
      '--output-json',
      '-of', opts.outputPath,
      '-t', String(opts.threads ?? 4),
    ]
    const proc = spawn(bin, args)

    // stderr 的 data 事件不保證按行切割，需要 line buffer
    const stderrLine = createLineBuffer((line) => {
      parseProgress(line, opts.onProgress)
    })
    proc.stderr.on('data', (d: Buffer) => stderrLine.push(d))
    proc.stderr.on('end', () => stderrLine.flush())

    proc.on('close', (code) =>
      code === 0 ? resolve(readJson(opts.outputPath)) : reject(new Error(`exit ${code}`))
    )
  })
}
```

> **Line Buffer 工具函式**（供 whisper.cpp 與 yt-dlp 共用）：
>
> ```typescript
> // main/utils/lineBuffer.ts
> export function createLineBuffer(onLine: (line: string) => void) {
>   let buf = ''
>   return {
>     push(chunk: Buffer) {
>       buf += chunk.toString()
>       const lines = buf.split('\n')
>       buf = lines.pop() ?? ''
>       for (const line of lines) {
>         if (line.trim()) onLine(line)
>       }
>     },
>     flush() {
>       if (buf.trim()) onLine(buf)
>       buf = ''
>     },
>   }
> }
> ```

選項 B（長期，效能更佳）：Node Native Addon (`napi-rs` 或 `node-addon-api`) 直接 binding `whisper.cpp` C API。

### 1.4 Electron 專案初始化

```bash
npm create electron-vite@latest whisper-app -- --template vue-ts
cd whisper-app
npm install
```

**關鍵 package.json 設定：**

```json
{
  "main": "dist-electron/main.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build:mac": "electron-vite build && electron-builder --mac",
    "build:win": "electron-vite build && electron-builder --win"
  }
}
```

---

## Phase 2 — Core 功能實作

### 2.1 批次處理佇列

```typescript
// main/queue/BatchQueue.ts
interface QueueItem {
  id: string
  source: 'file' | 'ytdlp'           // 來源類型
  filePath?: string                   // 本地檔案路徑
  url?: string                        // yt-dlp 來源 URL
  title?: string                      // yt-dlp 抓取的影片標題
  status: 'pending' | 'downloading' | 'converting' | 'transcribing' | 'ai' | 'done' | 'error'
  downloadProgress?: number           // yt-dlp 下載進度 0–100
  transcribeProgress: number          // Whisper 轉錄進度 0–100
  result?: TranscribeResult
  error?: string
}
```

- 支援拖放多個音訊 / 影片檔（`.mp3 .wav .m4a .mp4 .mov .mkv`）
- 支援 yt-dlp URL 批量輸入（詳見 2.4）
- 可配置最大並行數（預設 1，避免 GPU 競爭）
- 支援暫停 / 取消單一任務
- 佇列狀態持久化（app 重啟後可恢復）

**佇列持久化方案：**

- 使用 `electron-store`（基於 JSON 檔案），佇列和使用者設定分離為兩個獨立 store，避免互相干擾。
- 所有 store 透過 `shared/settings.schema.ts` 定義 type-safe schema：

```typescript
// shared/settings.schema.ts

/** 使用者設定 schema（存於 userData/settings.json） */
export interface SettingsSchema {
  locale: 'en' | 'zh-TW' | 'zh-CN'
  whisperModel: string              // e.g. 'ggml-base.bin'
  whisperThreads: number
  outputDir: string
  outputFormats: ('txt' | 'srt' | 'vtt' | 'json')[]
  maxTranscribeConcurrency: number  // Whisper 佇列並行數，預設 1
  maxAiConcurrency: number          // AI 佇列並行數，預設 2
  ytdlpAudioFormat: 'mp3' | 'wav' | 'm4a'
  ytdlpCookiesPath?: string
  ai: {
    enabled: boolean
    model: string                   // Ollama 模型名稱
    tasks: {
      correct: boolean
      translate: boolean
      summary: boolean
    }
    targetLang: string              // 翻譯目標語言
    customPrompts?: {
      correct?: string
      translate?: string
      summary?: string
    }
  }
}

/** 佇列持久化 schema（存於 userData/queue.json） */
export interface QueueSchema {
  items: PersistedQueueItem[]
}

export interface PersistedQueueItem {
  id: string
  source: 'file' | 'ytdlp'
  filePath?: string
  url?: string
  title?: string
  status: 'pending' | 'done' | 'error'  // 只持久化終態和 pending
  outputPath?: string
  error?: string
}
```

```typescript
// electron/main/stores.ts
import Store from 'electron-store'
import type { SettingsSchema, QueueSchema } from '../../shared/settings.schema'

export const settingsStore = new Store<SettingsSchema>({
  name: 'settings',
  defaults: {
    locale: 'en',
    whisperModel: 'ggml-base.bin',
    whisperThreads: 4,
    outputDir: '',
    outputFormats: ['txt', 'srt'],
    maxTranscribeConcurrency: 1,
    maxAiConcurrency: 2,
    ytdlpAudioFormat: 'mp3',
    ai: {
      enabled: false,
      model: '',
      tasks: { correct: false, translate: false, summary: false },
      targetLang: 'en',
    },
  },
})

export const queueStore = new Store<QueueSchema>({
  name: 'queue',
  defaults: { items: [] },
})
```

- 恢復策略：app 啟動時讀取佇列，將非終態（`downloading` / `converting` / `transcribing` / `ai`）的任務在持久化時已被過濾，只保留 `pending` / `done` / `error`。
- 檔案驗證：恢復時檢查 `filePath` 是否仍存在，若檔案已被刪除則標記為 `error` 並提示使用者。
- 寫入時機：每次任務狀態變更時 debounce 寫入（500ms），避免頻繁 I/O。

**轉錄與 AI 後處理並行策略：**

- 採用雙佇列設計：Whisper 轉錄佇列（GPU-bound，並行數預設 1）與 AI 後處理佇列（CPU/Ollama-bound，並行數預設 2）獨立運作。
- 當一個任務完成轉錄後，立即進入 AI 佇列，同時 Whisper 佇列可開始處理下一個任務。這樣 GPU 和 Ollama 可以同時工作，不互相阻塞。
- AI 佇列內的三個步驟（修正 → 翻譯 → 摘要）對同一任務仍為串行（有依賴關係），但不同任務的 AI 後處理可並行。
- 使用者可在設定中調整兩個佇列的並行數上限。

### 2.2 音訊前處理

```bash
# 需要 ffmpeg binary（打包進 resources/）
ffmpeg -i input.mp4 -ar 16000 -ac 1 -f wav output.wav
```

- 所有非 WAV 格式先以 ffmpeg 轉檔至 `16kHz mono WAV`
- 轉檔快取避免重複處理

### 2.3 輸出格式

| 格式 | 說明 |
|---|---|
| `.txt` | 純文字逐字稿 |
| `.srt` | 字幕時間碼格式 |
| `.vtt` | WebVTT 格式 |
| `.json` | 含 segment / token 的完整結構 |

### 2.4 yt-dlp 批量下載

**Main Process — yt-dlp 整合：**

```typescript
// main/ytdlp/YtDlpDownloader.ts
import { spawn } from 'child_process'
import { createLineBuffer } from '../utils/lineBuffer'
import { randomUUID } from 'crypto'
import fs from 'fs'

export function downloadAudio(url: string, opts: DownloadOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    const bin = getYtDlpBinaryPath()  // resources/ 內的靜態 binary
    const outTemplate = path.join(opts.tmpDir, '%(title)s.%(ext)s')
    // 將最終路徑寫入臨時檔案，避免與 stdout 進度資訊混淆
    const pathFile = path.join(opts.tmpDir, `ytdlp-path-${randomUUID()}.txt`)
    const args = [
      url,
      '--extract-audio',
      '--audio-format', 'mp3',        // 或 wav / m4a，可設定
      '--audio-quality', '0',
      '--no-playlist',
      '-o', outTemplate,
      '--print-to-file', 'after_move:filepath', pathFile,
      '--newline',                      // 每行一條進度
    ]
    const proc = spawn(bin, args)

    // 使用 line buffer 確保按行解析進度
    const stdoutLine = createLineBuffer((line) => {
      const match = line.match(/\[download\]\s+([\d.]+)%/)
      if (match) opts.onProgress?.(parseFloat(match[1]))
    })
    proc.stdout.on('data', (d: Buffer) => stdoutLine.push(d))
    proc.stdout.on('end', () => stdoutLine.flush())

    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(`yt-dlp exit ${code}`))
      try {
        const outputPath = fs.readFileSync(pathFile, 'utf-8').trim()
        fs.unlinkSync(pathFile) // 清理臨時檔案
        resolve(outputPath)
      } catch (e) {
        reject({ code: 'YTDLP_PATH_READ_FAILED', detail: String(e) } as AppError)
      }
    })
  })
}

// 批量：逐行解析 URL 文字
export function parseUrlList(raw: string): string[] {
  return raw
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0 && !l.startsWith('#'))
}
```

**下載流程：**

```
使用者貼入多行 URL
        │
        ▼
  parseUrlList()        逐行解析，過濾空行 / 註解行
        │
        ▼
  加入佇列 (status: 'pending')
        │
        ▼
  downloadAudio()       yt-dlp 僅抓音訊
        │  onProgress → IPC → UI 進度條
        ▼
  ffmpeg 轉 16kHz WAV   （同本地檔案路徑）
        │
        ▼
  transcribe()          Whisper 轉錄
```

**yt-dlp Binary 管理：**

- 打包靜態 binary 進 `resources/mac/yt-dlp` 和 `resources/win/yt-dlp.exe`
- 應用內提供「檢查更新」按鈕，從 GitHub Releases 更新 yt-dlp
- 支援 cookies 設定（應對需登入的平台，如 YouTube 會員影片）

### 2.5 UI 核心元件（Vue 3 SFC）

```
components/
  DropZone.vue          拖放區域
  UrlInput.vue          多行 URL 輸入框 + 解析預覽
  QueueTable.vue        批次任務列表（含來源 icon：file / yt-dlp）
  QueueItem.vue         單筆任務：雙進度條（下載 + 轉錄）
  ResultViewer.vue      逐字稿顯示 + 複製
  ModelSelector.vue     模型選擇 + 下載管理
  AiPanel.vue           AI 功能開關 + 模型選擇
  SettingsPanel.vue     語言、執行緒、輸出目錄、yt-dlp 設定、介面語言切換

composables/
  useQueue.ts           佇列狀態管理
  useWhisper.ts         轉錄操作封裝
  useYtDlp.ts           下載操作封裝
  useOllama.ts          AI 操作封裝
```

### 2.6 i18n 多語系支援

使用 `vue-i18n` 搭配 Vue 3 Composition API，支援 English (`en`)、繁體中文 (`zh-TW`)、简体中文 (`zh-CN`) 三種語言。

**安裝：**

```bash
npm install vue-i18n@next
```

**初始化：**

```typescript
// src/i18n/index.ts
import { createI18n } from 'vue-i18n'
import en from './locales/en.json'
import zhTW from './locales/zh-TW.json'
import zhCN from './locales/zh-CN.json'

// 偵測系統語言，對應到支援的 locale
function detectLocale(): string {
  const sys = navigator.language // e.g. 'zh-TW', 'zh-CN', 'en-US'
  if (sys.startsWith('zh-TW') || sys.startsWith('zh-Hant')) return 'zh-TW'
  if (sys.startsWith('zh')) return 'zh-CN' // zh-CN, zh-Hans, zh 等
  return 'en'
}

export const i18n = createI18n({
  legacy: false,           // 使用 Composition API 模式
  locale: detectLocale(),
  fallbackLocale: 'en',
  messages: { en, 'zh-TW': zhTW, 'zh-CN': zhCN },
})
```

**Locale 檔案結構：**

```
src/i18n/
  index.ts               # createI18n 初始化 + 語言偵測
  locales/
    en.json              # English
    zh-TW.json           # 繁體中文
    zh-CN.json           # 简体中文
```

**Locale 檔案範例（en.json）：**

```json
{
  "app": {
    "title": "WhisperTool"
  },
  "dropZone": {
    "hint": "Drop audio/video files here",
    "formats": "Supports mp3, wav, m4a, mp4, mov, mkv"
  },
  "queue": {
    "status": {
      "pending": "Pending",
      "downloading": "Downloading",
      "converting": "Converting",
      "transcribing": "Transcribing",
      "ai": "AI Processing",
      "done": "Done",
      "error": "Error"
    },
    "actions": {
      "pause": "Pause",
      "cancel": "Cancel",
      "retry": "Retry"
    }
  },
  "settings": {
    "language": "Interface Language",
    "threads": "Threads",
    "outputDir": "Output Directory",
    "model": "Whisper Model"
  },
  "ai": {
    "translate": "Translate",
    "summary": "Summary",
    "correct": "Fix Typos",
    "ollamaNotRunning": "Ollama is not running. Please start Ollama first."
  }
}
```

**元件中使用：**

```vue
<template>
  <div class="drop-zone">
    <p>{{ t('dropZone.hint') }}</p>
    <span>{{ t('dropZone.formats') }}</span>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
const { t } = useI18n()
</script>
```

**語言切換（SettingsPanel）：**

```typescript
import { useI18n } from 'vue-i18n'

const { locale } = useI18n()
const languages = [
  { value: 'en', label: 'English' },
  { value: 'zh-TW', label: '繁體中文' },
  { value: 'zh-CN', label: '简体中文' },
]

// 切換時同步寫入 electron-store，下次啟動時讀取
function switchLanguage(lang: string) {
  locale.value = lang
  window.electronAPI.setSetting('locale', lang)
}
```

**設計原則：**

- 預設跟隨系統語言（`navigator.language`），使用者可在設定中手動覆蓋。
- 使用者手動選擇的語言透過 `electron-store` 持久化，優先級高於系統偵測。
- `fallbackLocale` 設為 `en`，確保缺少翻譯 key 時不會顯示空白。
- Locale 檔案採用扁平 JSON 結構，按功能模組分 namespace，方便維護。
- AI prompt 模板不走 i18n（prompt 語言由使用者在 AI 設定中獨立選擇，與 UI 語言無關）。

**錯誤訊息 i18n 策略：**

Main process 不直接產生使用者可見的錯誤文字，而是回傳結構化的 `AppError`（定義在 `shared/errors.ts`），由 renderer 端根據 `code` 查找 i18n 翻譯。

```typescript
// shared/errors.ts
export interface AppError {
  code: string      // 錯誤碼，對應 i18n key
  detail?: string   // 技術細節，僅供 debug
}

// 錯誤碼命名規範：{模組}_{錯誤描述}，全大寫
export const ErrorCodes = {
  YTDLP_PATH_READ_FAILED: 'YTDLP_PATH_READ_FAILED',
  YTDLP_EXIT_NONZERO:     'YTDLP_EXIT_NONZERO',
  WHISPER_EXIT_NONZERO:    'WHISPER_EXIT_NONZERO',
  WHISPER_BINARY_MISSING:  'WHISPER_BINARY_MISSING',
  FFMPEG_CONVERT_FAILED:   'FFMPEG_CONVERT_FAILED',
  OLLAMA_NOT_RUNNING:      'OLLAMA_NOT_RUNNING',
  OLLAMA_MODEL_NOT_FOUND:  'OLLAMA_MODEL_NOT_FOUND',
  MODEL_DOWNLOAD_FAILED:   'MODEL_DOWNLOAD_FAILED',
  FILE_NOT_FOUND:          'FILE_NOT_FOUND',
} as const
```

```json
// locale 檔案中對應的 error namespace（en.json 範例）
{
  "error": {
    "YTDLP_PATH_READ_FAILED": "Failed to read yt-dlp output path",
    "WHISPER_EXIT_NONZERO": "Whisper exited with error (code: {detail})",
    "OLLAMA_NOT_RUNNING": "Ollama is not running. Please start Ollama first.",
    "FILE_NOT_FOUND": "File not found: {detail}"
  }
}
```

```typescript
// renderer 端統一錯誤顯示
import { useI18n } from 'vue-i18n'
const { t } = useI18n()

function showError(err: AppError) {
  const msg = t(`error.${err.code}`, { detail: err.detail ?? '' })
  // 顯示 toast / notification
}
```

---

## Phase 3 — AI 整合 (Ollama)

### 3.1 Ollama 連線管理

```typescript
// main/ai/OllamaClient.ts
const BASE = 'http://localhost:11434'

export async function checkOllama(): Promise<boolean> {
  try {
    const r = await fetch(`${BASE}/api/tags`)
    return r.ok
  } catch { return false }
}

export async function listModels(): Promise<string[]> {
  const r = await fetch(`${BASE}/api/tags`)
  const data = await r.json()
  return data.models.map((m: any) => m.name)
}

export async function chat(model: string, prompt: string): Promise<string> {
  const r = await fetch(`${BASE}/api/generate`, {
    method: 'POST',
    body: JSON.stringify({ model, prompt, stream: false })
  })
  const data = await r.json()
  return data.response
}
```

### 3.2 AI 任務模組

**Prompt 模板管理：**

預設模板內建於程式碼中，使用者自訂模板儲存在 `settingsStore.ai.customPrompts`。載入時優先使用自訂模板，若無則 fallback 到預設模板。App 升級時只更新預設模板，不覆蓋使用者自訂內容。

```typescript
// main/ai/prompts.ts

// ── 預設模板（內建，隨 app 更新） ──
const DEFAULT_PROMPTS = {
  translate: (text: string, targetLang: string) =>
    `Translate the following text into ${targetLang}. Output only the translation, no explanation:\n\n${text}`,

  summary: (text: string) =>
    `Provide a concise summary of the following transcript. List key points:\n\n${text}`,

  correct: (text: string, lang: string) =>
    `The following is ${lang} text from speech recognition. Fix typos and recognition errors, preserve the original meaning, output only the corrected text:\n\n${text}`,
} as const

// ── 取得有效模板（自訂 > 預設） ──
export function getPrompt(
  task: keyof typeof DEFAULT_PROMPTS,
  customPrompts?: Record<string, string>
): (...args: any[]) => string {
  const custom = customPrompts?.[task]
  if (custom) {
    // 自訂模板使用 {text}, {targetLang}, {lang} 作為佔位符
    return (...args: string[]) => {
      let result = custom
      const placeholders = ['{text}', '{targetLang}', '{lang}']
      placeholders.forEach((ph, i) => {
        if (args[i] !== undefined) result = result.replace(ph, args[i])
      })
      return result
    }
  }
  return DEFAULT_PROMPTS[task]
}
```

> 自訂模板使用 `{text}`、`{targetLang}`、`{lang}` 佔位符，UI 設定頁面提供模板編輯器並即時預覽替換結果。使用者可隨時「重設為預設」恢復內建模板。

### 3.3 Pipeline 設計

```
轉錄完成
    │
    ├─► [可選] 修正錯別字  →  corrected.txt
    │
    ├─► [可選] 翻譯        →  translated_[lang].txt
    │
    └─► [可選] 摘要        →  summary.txt
```

- 每個 AI 步驟獨立可選，可組合
- 支援自訂 prompt 模板（進階設定）
- 長文自動分段處理後合併

**長文分段策略：**

- 分段依據：以 whisper.cpp 輸出的 segment 為最小單位，按 token 數累加至接近模型 context window 的 70%（預留回應空間）。例如使用 4K context 的模型時，每段約 2800 tokens。
- 分段邊界：優先在段落 / 句號處切割，避免在句子中間斷開。若單一 segment 超過上限則強制切割。
- 上下文銜接：翻譯與修正任務中，每段開頭附帶前一段最後 2–3 句作為上下文提示（不納入輸出），減少斷句造成的語意偏差。
- 合併策略：依序拼接各段結果，去除重複的上下文銜接部分。摘要任務則對各段摘要再做一次彙總摘要。
- Token 估算：中文以 1 字 ≈ 1.5 tokens、英文以 1 word ≈ 1.3 tokens 粗估，實際可透過 Ollama `/api/tokenize` 端點精確計算。

---

## Phase 4 — Windows 移植 (const-me Whisper)

> 在 Mac 版功能穩定後開始

### 4.1 const-me/Whisper 整合

```typescript
// main/whisper/WhisperWin.ts
// 方案 A：呼叫 CLI wrapper
import { spawn } from 'child_process'

export function transcribe(opts: TranscribeOptions) {
  const bin = 'resources/WhisperDesktop.exe' // 或自製 CLI wrapper
  // const-me 提供 COM API，可用 edge-js 或 PowerShell bridge 呼叫
}
```

**COM 介面呼叫方案（推薦）：**

```
Windows Main Process
      │
      ▼
  edge-js / node-ffi-napi
      │
      ▼
  Whisper.dll (const-me)
  ├── IWhisperModel
  ├── IWhisperContext
  └── sFullParams (DirectCompute/GPU)
```

### 4.2 平台分支管理

```typescript
// main/whisper/index.ts
import { platform } from 'process'
import type { WhisperBackend } from './types'

let _backend: WhisperBackend | null = null

export async function getWhisper(): Promise<WhisperBackend> {
  if (_backend) return _backend
  _backend = platform === 'darwin'
    ? await import('./WhisperMac')
    : await import('./WhisperWin')
  return _backend
}
```

> 避免使用 top-level `await`，因為 Electron main process 預設為 CommonJS 環境，即使 electron-vite 支援 ESM 編譯，部分版本仍有相容性問題。使用 async factory function + 單例快取是更穩健的做法。

### 4.3 Windows 特有考量

- 打包 `whisper.dll` + GGML 模型至 `resources/`
- AMD GPU：確認 DirectX 12 版本需求（Windows 10 1903+）
- NVIDIA GPU：const-me 同樣支援，無需額外處理
- CPU fallback：自動偵測 GPU 不可用時降級

---

## Phase 5 — Packaging & 發佈

### 5.1 electron-builder 設定

```yaml
# electron-builder.yml
appId: com.yourname.whispertool
productName: WhisperTool

mac:
  category: public.app-category.productivity
  target:
    - target: dmg
      arch: [x64, arm64]   # Intel + Apple Silicon
  icon: build/icon.icns
  hardenedRuntime: true
  gatekeeperAssess: false
  entitlements: build/entitlements.mac.plist

win:
  target:
    - target: nsis
      arch: [x64]
  icon: build/icon.ico

extraResources:
  - from: resources/${os}/
    to: resources/
    filter: ["**/*"]
  - from: resources/models/
    to: models/
    filter: ["*.bin"]

# yt-dlp、ffmpeg、whisper-cli 執行權限（macOS 必須）
afterSign: scripts/fixPermissions.js
```

> ⚠️ **macOS 打包注意**：公證（Notarization）完成後，`resources/` 內的所有 binary（`whisper-cli`、`ffmpeg`、`yt-dlp`）必須具備執行權限，否則 spawn 時會收到 `EACCES` 錯誤。透過 `afterSign` hook 補上：
>
> ```javascript
> // scripts/fixPermissions.js
> const { execSync } = require('child_process')
> const path = require('path')
>
> exports.default = async function(context) {
>   if (context.electronPlatformName !== 'darwin') return
>   const bins = ['whisper-cli', 'ffmpeg', 'yt-dlp']
>   const resDir = path.join(context.appOutDir, 'WhisperTool.app',
>     'Contents', 'Resources', 'resources')
>   for (const bin of bins) {
>     execSync(`chmod +x "${path.join(resDir, bin)}"`)
>   }
> }
> ```

### 5.2 資源打包策略

```
resources/
  mac/
    whisper-cli          # 預編譯 Metal binary (arm64 + x64 universal)
    ffmpeg               # universal binary
    yt-dlp               # universal binary
  win/
    whisper.dll          # const-me build
    WhisperCLI.exe       # 自製 wrapper
    ffmpeg.exe
    yt-dlp.exe
  models/               # 預設放空，由 app 下載
```

**外部 Binary 版本管理：**

所有打包的外部 binary 透過 `resources/versions.json` 追蹤版本，app 啟動時讀取並記錄至 log，方便 debug。

```json
// resources/versions.json
{
  "whisper-cli": {
    "version": "1.7.3",
    "commit": "abc1234",
    "buildDate": "2026-03-10"
  },
  "ffmpeg": {
    "version": "7.1",
    "build": "static-lgpl"
  },
  "yt-dlp": {
    "version": "2026.03.15",
    "autoUpdate": true
  }
}
```

- 打包時由 build script 自動寫入各 binary 的版本資訊。
- yt-dlp 支援應用內自動更新（已有機制），更新後同步更新 `versions.json`。
- whisper-cli 和 ffmpeg 隨 app 版本更新，在 release notes 中註明版本變更。
- 設定頁面的「關於」區塊顯示各 binary 版本，使用者回報問題時可直接提供。

### 5.3 Mac 公證（Notarization）

```bash
# 需要 Apple Developer 帳號
electron-builder --mac --publish never
xcrun notarytool submit dist/WhisperTool.dmg \
  --apple-id $APPLE_ID \
  --password $APP_PASSWORD \
  --team-id $TEAM_ID \
  --wait
```

### 5.4 自動更新

使用 `electron-updater` + GitHub Releases：

```typescript
import { autoUpdater } from 'electron-updater'
autoUpdater.checkForUpdatesAndNotify()
```

---

## 目錄結構

```
whisper-app/
├── shared/                      # main + renderer 共用型別
│   ├── ipc.ts                   # IPC channel 常數 + payload 型別
│   ├── errors.ts                # 錯誤碼定義
│   └── settings.schema.ts       # 設定 schema 型別
├── electron/
│   ├── main/
│   │   ├── index.ts              # Main entry
│   │   ├── ipc/
│   │   │   ├── whisperHandlers.ts
│   │   │   ├── ytdlpHandlers.ts
│   │   │   ├── aiHandlers.ts
│   │   │   └── modelHandlers.ts
│   │   ├── whisper/
│   │   │   ├── index.ts          # 平台分支
│   │   │   ├── WhisperMac.ts
│   │   │   └── WhisperWin.ts
│   │   ├── ytdlp/
│   │   │   └── YtDlpDownloader.ts
│   │   ├── ai/
│   │   │   ├── OllamaClient.ts
│   │   │   ├── translate.ts
│   │   │   ├── summary.ts
│   │   │   └── correct.ts
│   │   ├── queue/
│   │   │   └── BatchQueue.ts
│   │   └── utils/
│   │       ├── ffmpeg.ts
│   │       └── modelManager.ts
│   └── preload/
│       ├── index.ts              # contextBridge 統一入口，組合各模組 API
│       ├── queue.ts              # 佇列相關 IPC 封裝
│       ├── whisper.ts            # 轉錄相關 IPC 封裝
│       ├── ytdlp.ts              # 下載相關 IPC 封裝
│       ├── ai.ts                 # AI 任務 IPC 封裝
│       └── settings.ts           # 設定讀寫 IPC 封裝
├── src/
│   ├── components/
│   │   ├── DropZone.vue
│   │   ├── UrlInput.vue          # yt-dlp 多行 URL 輸入
│   │   ├── QueueTable.vue
│   │   ├── QueueItem.vue
│   │   ├── ResultViewer.vue
│   │   ├── ModelSelector.vue
│   │   ├── AiPanel.vue
│   │   └── SettingsPanel.vue
│   ├── composables/              # Vue composables
│   │   ├── useQueue.ts
│   │   ├── useWhisper.ts
│   │   ├── useYtDlp.ts
│   │   └── useOllama.ts
│   ├── i18n/                    # 多語系
│   │   ├── index.ts             # createI18n 初始化
│   │   └── locales/
│   │       ├── en.json          # English
│   │       ├── zh-TW.json       # 繁體中文
│   │       └── zh-CN.json       # 简体中文
│   ├── stores/                   # Pinia
│   │   ├── queueStore.ts
│   │   └── settingsStore.ts
│   └── App.vue
├── resources/
│   ├── mac/
│   │   ├── whisper-cli
│   │   ├── ffmpeg
│   │   └── yt-dlp
│   └── win/
│       ├── whisper.dll
│       ├── WhisperCLI.exe
│       ├── ffmpeg.exe
│       └── yt-dlp.exe
├── build/                        # icons, entitlements
├── electron-builder.yml
└── package.json
```

---

## 技術選型總表

| 類別 | 技術 | 理由 |
|---|---|---|
| 框架 | Electron + Vite | 跨平台，打包成熟 |
| UI | Vue 3 + TypeScript | SFC 直觀，Composition API 適合複雜狀態 |
| 狀態管理 | Pinia | Vue 官方推薦，TypeScript 友善 |
| Mac Whisper | whisper.cpp + Metal | 官方 Apple Silicon 支援 |
| Win Whisper | const-me/Whisper | AMD GPU DirectCompute |
| 音訊下載 | yt-dlp (靜態 binary) | 支援 YouTube / Bilibili 等主流平台 |
| AI | Ollama HTTP API | 本地，無需雲端 |
| 音訊轉換 | ffmpeg (靜態 binary) | 格式支援最廣 |
| i18n | vue-i18n v10 | Vue 3 官方推薦，Composition API 原生支援 |
| 打包 | electron-builder | DMG + NSIS 成熟方案 |
| 更新 | electron-updater | 搭配 GitHub Releases |

---

## 時程估算

```
Week 1–2    Phase 1   Mac 環境 + whisper.cpp Metal 整合 + Electron + Vue 骨架
Week 3–4    Phase 2a  批次佇列核心 + 檔案拖放 + ffmpeg 前處理 + 佇列持久化
Week 5      Phase 2b  yt-dlp 整合 + URL 輸入 UI + 雙進度條
Week 6–7    Phase 3   Ollama 整合 + 三個 AI 功能 + 長文分段處理
Week 8      Phase 1–3 整合測試、效能調優、Mac .app 打包
Week 9–11   Phase 4   Windows const-me 整合（含 COM 介面研究 + 備案評估）
Week 12     Phase 4   Windows 測試 + .exe 打包
Week 13–14  Phase 5   雙平台公測、bug fix、CI/CD
```

> 相較原始 10 週估算，主要調整：Phase 2a 多給 1 週處理佇列持久化與雙佇列並行設計；Phase 3 多給 1 週處理長文分段邏輯；Phase 4 從 2 週擴展為 3 週，因為 const-me COM 整合是最高風險項目，需要預留備案切換時間。

---

## 測試策略

### 工具選型

| 工具 | 用途 |
|---|---|
| Vitest | 單元測試（與 Vite 原生整合，速度快） |
| @testing-library/vue | Vue 元件測試 |
| Playwright | E2E 測試（支援 Electron） |

### 測試範圍

**單元測試（必須）：**

- `createLineBuffer` — 邊界情況：空 chunk、多行混合、不完整行、flush 行為
- `BatchQueue` 狀態機 — 狀態轉換正確性：pending → downloading → converting → transcribing → ai → done / error
- `parseUrlList` — 空行過濾、註解行、特殊字元 URL
- AI 分段邏輯 — token 累加、邊界切割、上下文銜接、合併去重
- `getPrompt` — 預設模板 fallback、自訂模板佔位符替換
- `detectLocale` — 各種 `navigator.language` 值的對應
- `SettingsSchema` / `QueueSchema` — store 讀寫、defaults、型別驗證
- `AppError` → i18n key 對應 — 確保所有 error code 在三個 locale 檔案中都有翻譯

**元件測試（重要 UI 互動）：**

- `DropZone` — 拖放事件、檔案格式過濾
- `QueueTable` — 狀態顯示、暫停 / 取消操作
- `SettingsPanel` — 語言切換即時生效

**E2E 測試（核心流程）：**

- 拖放檔案 → 轉錄完成 → 結果顯示
- yt-dlp URL 輸入 → 下載 → 轉錄（需 mock yt-dlp binary）
- AI pipeline：轉錄結果 → 修正 → 翻譯 → 摘要

### 外部 Binary Mock 策略

whisper-cli、ffmpeg、yt-dlp 在測試中以 mock script 替代，回傳預錄的 stdout/stderr 輸出，確保測試不依賴實際 binary 且可在 CI 環境執行。

```
tests/
  mocks/
    whisper-cli.sh       # 模擬 whisper 輸出 + 進度
    yt-dlp.sh            # 模擬下載進度 + filepath 輸出
    ffmpeg.sh            # 模擬轉檔成功
  unit/
    lineBuffer.test.ts
    batchQueue.test.ts
    parseUrlList.test.ts
    aiChunking.test.ts
    prompts.test.ts
    errorCodes.test.ts
  components/
    DropZone.test.ts
    QueueTable.test.ts
  e2e/
    transcribe.spec.ts
    ytdlp-flow.spec.ts
    ai-pipeline.spec.ts
```

---

## 風險與備案

| 風險 | 影響 | 備案 |
|---|---|---|
| const-me COM 介面難以從 Node.js 呼叫 | Windows GPU 功能延誤 | 先用 whisper.cpp Win + CUDA，等 Windows 版穩定再切換 |
| whisper.cpp binary 公證問題 | Mac 無法安裝 | 改用 node-addon-api 直接 binding，binary 在 app 內部 |
| Ollama 未啟動 | AI 功能不可用 | UI 顯示明確提示 + 一鍵啟動指引，AI 步驟設為可選 |
| 大模型轉錄速度慢 | UX 體驗差 | 預設 `ggml-base`，提供速度 vs 精度選項讓使用者自選 |
| yt-dlp 平台反爬更新導致下載失效 | 下載功能中斷 | 內建 yt-dlp 自我更新機制，版本落後時主動提示 |
| YouTube / 平台 TOS 限制 | 法律風險 | 僅提供工具，不內建任何平台帳號；加入使用者責任說明 |
| ffmpeg 授權問題 | 無法打包 | 使用 LGPL build 或引導使用者自行安裝 |

---

*最後更新：2026-03*
# 跨平台 Whisper 工具開發計劃

> Mac 優先 · Windows 次之 · Electron + Native Backend 架構

## 架構核心思路
整個架構以「平台分支在 Main Process，UI 完全無感」為原則。Electron main process 的 `whisper/runtime.ts` 根據 `process.platform` 載入對應 runtime，Vue UI 層完全不需要知道底層差異。

**兩平台統一使用 whisper.cpp**，但 Windows 採 **Vulkan-first** 路線：Mac 使用 Metal；Windows Phase 4 先只跑通 Vulkan backend，等 CLI 路線穩定後再補 CUDA 與 CPU fallback。這樣能先把最大的未知數縮小到「Windows whisper.cpp CLI 是否能穩定整合」。

Mac 優先的具體體現：Phase 1–3 全部在 Mac 上完成，包含批次處理、進度追蹤、全部 AI 功能，確保核心體驗穩定後才開始 Windows 移植。Windows 階段不追求一次做完多 backend 與自動偵測，而是先取得第一個可用的 Vulkan 版 Windows build。

ffmpeg 建議：Mac 與 Windows 均可使用 ffmpeg-static npm 套件，它會自動提供對應平台的靜態 binary，省去手動管理的麻煩。

---

## 目錄

1. [專案概覽](#專案概覽)
2. [技術架構決策](#技術架構決策)
3. [Phase 1 — Mac 基礎建設](#phase-1--mac-基礎建設-whispercpp--metal)
4. [Phase 2 — Core 功能實作](#phase-2--core-功能實作)
5. [Phase 3 — AI 整合](#phase-3--ai-整合-ollama)
6. [Phase 4 — Windows 移植](#phase-4--windows-移植-whispercpp--vulkan-first)
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
| macOS (優先) | `whisper.cpp` | Apple Metal (`ggml-metal`) |
| Windows | `whisper.cpp` | Vulkan（Phase 4 MVP；先跑通單一 backend，後續再補 CUDA / CPU fallback） |

> **兩平台統一使用 whisper.cpp**，但 MVP 先求 Windows 單一 backend 跑通，再擴展多 binary 管理與自動偵測。renderer / IPC / queue 結構可共用，大部分差異集中在 runtime 與 staging script。

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
 ┌──────────────┐  ┌──────────────────┐
 │ whisper.cpp  │  │  whisper.cpp     │
 │ (macOS)      │  │  (Windows)       │
 │ Metal GPU    │  │  Vulkan (MVP)    │
 └──────────────┘  └──────────────────┘
               │
               ▼
        ┌────────────┐
        │  Ollama    │
        │ Local API  │
        │ :11434     │
        └────────────┘
```

### Whisper 呼叫策略

- **macOS**：以 Node.js `child_process.spawn` 呼叫預編譯的 `whisper-cli` binary（Metal 加速）。
- **Windows**：保留既有 `WhisperWindows.ts` 外殼，改為直接以 `child_process.spawn` 呼叫單一 `whisper-cli.exe`（Vulkan build），不再依賴 `Const-me` wrapper + `whisper.dll`。
- **打包路徑**：所有打包進 app 的 binary 一律從 `process.resourcesPath` 尋找，不以 `app.getAppPath()` 假設 `extraResources` 位置。
- **長期選項**：Windows Vulkan 路線穩定後，再補 CUDA / CPU fallback，必要時再評估抽共用 `WhisperBase` 或改成 `node-addon-api`。
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
  code: string      // e.g. 'WHISPER_EXIT_NONZERO'
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

> 所有 IPC handler 透過 `IPC.XXX` 常數引用 channel name，禁止使用字串字面值。

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

### 1.3 whisper.cpp Node.js 整合原則

```typescript
// main/whisper/shared.ts
export interface WhisperRuntime {
  transcribe(options: WhisperTranscribeOptions): Promise<WhisperCompleteEvent>
  listModels(): Promise<WhisperModelInfo[]>
  downloadModel(
    modelId: WhisperModelId,
    onProgress?: (event: WhisperModelDownloadProgressEvent) => void
  ): Promise<string>
}
```

```typescript
// packaged runtime path helper
function getPackagedBinaryPath(...segments: string[]): string | null {
  return process.resourcesPath ? path.join(process.resourcesPath, ...segments) : null
}
```

```typescript
// main/whisper/WhisperWindows.ts
function getWhisperWindowsCliCandidates(userDataDir: string): string[] {
  return [
    process.env.WHISPER_WINDOWS_CLI_PATH,
    path.join(userDataDir, 'whisper-win', 'whisper-cli.exe'),
    process.resourcesPath ? path.join(process.resourcesPath, 'win', 'whisper-cli.exe') : undefined,
    process.resourcesPath ? path.join(process.resourcesPath, 'resources', 'win', 'whisper-cli.exe') : undefined,
  ].filter((candidate): candidate is string => Boolean(candidate))
}
```

- **現階段不強行抽 `WhisperBase.ts`**：先保留 `WhisperMac.ts` / `WhisperWindows.ts` 各自實作，僅把 model resolve、output 讀取、line buffer 等 helper 放進 `shared.ts` / `utils/` 共用。
- **Windows Phase 4 的重點**：替換 `WhisperWindows.ts` 的底層 contract，從 `Const-me` wrapper 改為直接執行 `whisper.cpp` CLI，而不是先做大規模 class hierarchy 重構。

> **Line Buffer 工具函式**（供 whisper.cpp 與 yt-dlp 共用）：
>
> ```typescript
> // main/utils/lineBuffer.ts
> export function createLineBuffer(onLine: (line: string) => void) {
>   let buf = ''
>   return {
>     push(chunk: Buffer) {
>       buf += chunk.toString('utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
>       const lines = buf.split('\n')
>       buf = lines.pop() ?? ''
>       for (const line of lines) {
>         const trimmed = line.trim()
>         if (trimmed) onLine(trimmed)
>       }
>     },
>     flush() {
>       const trimmed = buf.trim()
>       if (trimmed) onLine(trimmed)
>       buf = ''
>     },
>   }
> }
> ```

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
  source: 'file' | 'ytdlp'
  filePath?: string
  url?: string
  title?: string
  status: 'pending' | 'downloading' | 'converting' | 'transcribing' | 'ai' | 'done' | 'error'
  downloadProgress?: number
  transcribeProgress: number
  result?: TranscribeResult
  error?: string
}
```

- 支援拖放多個音訊 / 影片檔（`.mp3 .wav .m4a .mp4 .mov .mkv`）
- 支援 yt-dlp URL 批量輸入
- 可配置最大並行數（預設 1，避免 GPU 競爭）
- 支援暫停 / 取消單一任務
- 佇列狀態持久化（app 重啟後可恢復）

**佇列持久化方案：**

使用 `electron-store`（基於 JSON 檔案），佇列和使用者設定分離為兩個獨立 store。

```typescript
// shared/settings.schema.ts

export interface SettingsSchema {
  locale: 'en' | 'zh-TW' | 'zh-CN'
  whisperModel: string
  whisperThreads: number
  outputDir: string
  outputFormats: ('txt' | 'srt' | 'vtt' | 'json')[]
  maxTranscribeConcurrency: number
  maxAiConcurrency: number
  ytdlpAudioFormat: 'mp3' | 'wav' | 'm4a'
  ytdlpCookiesPath?: string
  ai: {
    enabled: boolean
    model: string
    tasks: { correct: boolean; translate: boolean; summary: boolean }
    targetLang: string
    customPrompts?: { correct?: string; translate?: string; summary?: string }
  }
}

export interface QueueSchema {
  items: PersistedQueueItem[]
}

export interface PersistedQueueItem {
  id: string
  source: 'file' | 'ytdlp'
  filePath?: string
  url?: string
  title?: string
  status: 'pending' | 'done' | 'error'
  outputPath?: string
  error?: string
}
```

**轉錄與 AI 後處理並行策略：**

採用雙佇列設計：Whisper 轉錄佇列（GPU-bound，並行數預設 1）與 AI 後處理佇列（CPU/Ollama-bound，並行數預設 2）獨立運作。當一個任務完成轉錄後，立即進入 AI 佇列，同時 Whisper 佇列可開始處理下一個任務。

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

```typescript
// main/ytdlp/YtDlpDownloader.ts
import { spawn } from 'child_process'
import { createLineBuffer } from '../utils/lineBuffer'
import { randomUUID } from 'crypto'
import fs from 'fs'

export function downloadAudio(url: string, opts: DownloadOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    const bin = getYtDlpBinaryPath()
    const outTemplate = path.join(opts.tmpDir, '%(title)s.%(ext)s')
    const pathFile = path.join(opts.tmpDir, `ytdlp-path-${randomUUID()}.txt`)
    const args = [
      url,
      '--extract-audio',
      '--audio-format', 'mp3',
      '--audio-quality', '0',
      '--no-playlist',
      '-o', outTemplate,
      '--print-to-file', 'after_move:filepath', pathFile,
      '--newline',
    ]
    const proc = spawn(bin, args)

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
        fs.unlinkSync(pathFile)
        resolve(outputPath)
      } catch (e) {
        reject({ code: 'YTDLP_PATH_READ_FAILED', detail: String(e) } as AppError)
      }
    })
  })
}

export function parseUrlList(raw: string): string[] {
  return raw
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0 && !l.startsWith('#'))
}
```

### 2.5 UI 核心元件（Vue 3 SFC）

```
components/
  DropZone.vue
  UrlInput.vue
  QueueTable.vue
  QueueItem.vue
  ResultViewer.vue
  ModelSelector.vue
  AiPanel.vue
  SettingsPanel.vue

composables/
  useQueue.ts
  useWhisper.ts
  useYtDlp.ts
  useOllama.ts
```

### 2.6 i18n 多語系支援

使用 `vue-i18n` 搭配 Vue 3 Composition API，支援 English (`en`)、繁體中文 (`zh-TW`)、简体中文 (`zh-CN`)。

```typescript
// src/i18n/index.ts
import { createI18n } from 'vue-i18n'
import en from './locales/en.json'
import zhTW from './locales/zh-TW.json'
import zhCN from './locales/zh-CN.json'

function detectLocale(): string {
  const sys = navigator.language
  if (sys.startsWith('zh-TW') || sys.startsWith('zh-Hant')) return 'zh-TW'
  if (sys.startsWith('zh')) return 'zh-CN'
  return 'en'
}

export const i18n = createI18n({
  legacy: false,
  locale: detectLocale(),
  fallbackLocale: 'en',
  messages: { en, 'zh-TW': zhTW, 'zh-CN': zhCN },
})
```

**錯誤訊息 i18n 策略：**

Main process 回傳結構化的 `AppError`，由 renderer 端根據 `code` 查找 i18n 翻譯。

```typescript
// shared/errors.ts
export const ErrorCodes = {
  YTDLP_PATH_READ_FAILED:  'YTDLP_PATH_READ_FAILED',
  YTDLP_EXIT_NONZERO:      'YTDLP_EXIT_NONZERO',
  WHISPER_EXIT_NONZERO:    'WHISPER_EXIT_NONZERO',
  WHISPER_BINARY_MISSING:  'WHISPER_BINARY_MISSING',
  FFMPEG_CONVERT_FAILED:   'FFMPEG_CONVERT_FAILED',
  OLLAMA_NOT_RUNNING:      'OLLAMA_NOT_RUNNING',
  OLLAMA_MODEL_NOT_FOUND:  'OLLAMA_MODEL_NOT_FOUND',
  MODEL_DOWNLOAD_FAILED:   'MODEL_DOWNLOAD_FAILED',
  FILE_NOT_FOUND:          'FILE_NOT_FOUND',
} as const
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

### 3.2 Pipeline 設計

```
轉錄完成
    │
    ├─► [可選] 修正錯別字  →  corrected.txt
    ├─► [可選] 翻譯        →  translated_[lang].txt
    └─► [可選] 摘要        →  summary.txt
```

長文分段策略與 prompt 模板管理同原計劃，略。

---

## Phase 4 — Windows 移植 (whisper.cpp + Vulkan First)

> 目標不是一次做完 Windows 所有 backend，而是先讓 `whisper.cpp` 的 Vulkan CLI 在現有 Electron 流程中跑通。

### 4.0 範圍定義（MVP）

**本階段要做：**

- 保留現有 Windows runtime 外殼：`runtime.ts`、`WhisperWindows.ts`、`shared.ts`
- 將 Windows runtime contract 從 `WhisperCLI.exe + whisper.dll` 改成直接執行 `whisper.cpp` 的 `whisper-cli.exe`
- 先支援單一 Vulkan build
- 將 repo 內 active `Const-me` 實作殘留一併移除，不保留雙軌
- 更新 `stage:win:whisper`、`resources/versions.json`、`resources/win/README.md`、Windows 測試與文件

**本階段不做：**

- CUDA
- CPU fallback
- 多 binary 自動偵測
- 為了 Windows 先強行抽象成 `WhisperBase.ts`

### 4.1 保留與替換邊界

**直接沿用：**

- 所有 IPC 定義（`shared/ipc.ts`）與 payload 型別
- `BatchQueue`、`YtDlpDownloader`、`OllamaClient`
- Vue UI 層、Pinia stores、i18n
- `WhisperRuntime` 介面、模型下載與模型解析 helper

**需要替換：**

- `WhisperWindows.ts` 的 CLI 參數契約與 runtime 偵測
- `stage_windows_whisper_runtime.mjs`
- `resources/versions.json`
- `resources/win/README.md`
- 既有 `Const-me` 專屬文件與測試

**需要移除：**

- `WhisperWindows.ts` 中所有 `whisper.dll` / `--dll` / wrapper JSON line protocol 邏輯
- `WHISPER_WINDOWS_DLL_PATH` 與相關 env var 假設
- `versions.json` 中 `whisper-dll` 條目
- `resources/win/` 對 `WhisperCLI.exe + whisper.dll` 的說明
- 所有仍將 Windows runtime 描述為 `Const-me` 的 active docs / tests / scripts

### 4.2 Windows whisper.cpp Vulkan 編譯

```powershell
git clone https://github.com/ggml-org/whisper.cpp
cd whisper.cpp
cmake -B build -DGGML_VULKAN=1
cmake --build build --config Release
```

**手動驗證先於 repo 整合：**

```powershell
# whisper-cli.exe 實際位置依 generator 而不同，先直接手動驗證可執行
path\to\whisper-cli.exe -m models\ggml-base.bin -f sample.wav --output-json -of out\sample
```

> 只有當 Vulkan 版 `whisper-cli.exe` 能在 Windows 機器上獨立跑通，才進入 Electron 整合。這一步不通，後續的 staging 與 package 都沒有意義。

### 4.3 Electron 整合方式

```typescript
// main/whisper/WhisperWindows.ts
function getWhisperWindowsCliCandidates(userDataDir: string): string[] {
  return [
    process.env.WHISPER_WINDOWS_CLI_PATH,
    path.join(userDataDir, 'whisper-win', 'whisper-cli.exe'),
    process.resourcesPath ? path.join(process.resourcesPath, 'win', 'whisper-cli.exe') : undefined,
    process.resourcesPath ? path.join(process.resourcesPath, 'resources', 'win', 'whisper-cli.exe') : undefined,
  ].filter((candidate): candidate is string => Boolean(candidate))
}
```

- `WhisperWindows.ts` 直接呼叫 `whisper.cpp` CLI，不再使用 `whisper.dll`
- CLI 參數對齊 `whisper.cpp`：`-m` / `-f` / `-l` / `--output-json` / `-of` / `-t`
- 進度先統一從 `stderr` 百分比解析，不再依賴 wrapper JSON line protocol
- `WHISPER_WINDOWS_DLL_PATH`、`--dll`、`whisper.dll`、`WhisperCLI.exe` wrapper contract 全部移除
- 找不到 Vulkan runtime 時，直接回傳明確錯誤，不在此階段做 CPU fallback

### 4.4 Staging 與打包調整

- `stage:win:whisper` 第一版只 staging 單一 `whisper-cli.exe`
- `resources/win/` 第一版只要求放入 Vulkan 版 `whisper-cli.exe`
- `versions.json` 記錄為 `win: vulkan`
- 若 Vulkan build 還依賴其他 DLL，應一併由 staging script 管理並記錄 manifest，不把這些假設寫死在 app 邏輯裡
- staging script 不再接受 `whisper.dll` 作為必要輸入
- package 後的 Windows runtime 資源不再包含 `Const-me` 專屬命名與 manifest 結構

### 4.5 驗收條件

- 在至少一台 Vulkan-capable Windows 機器上，打包後 app 可成功轉錄
- `WhisperWindows.ts` 的 active runtime path 不再依賴 `whisper.dll`
- `pnpm stage:win:whisper` 可正確放入 Vulkan runtime
- repo 內 active docs / tests / resource notes 不再描述 `Const-me` 路線
- active codebase 中不再存在 `--dll`、`WHISPER_WINDOWS_DLL_PATH`、`whisper-dll` 這類 `Const-me` 專屬整合點

### 4.6 後續擴展（非本階段）

- CUDA backend
- CPU fallback
- 多 binary 自動偵測
- `WhisperMac.ts` / `WhisperWindows.ts` 的共用 helper 再抽象化
- 視 `whisper.cpp` upstream 發展評估 DirectML

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
      arch: [x64, arm64]
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
  - from: resources/mac/
    to: mac/
    filter: ["**/*"]
  - from: resources/win/
    to: win/
    filter: ["**/*"]
  - from: resources/models/
    to: models/
    filter: ["*.bin"]
  - from: resources/versions.json
    to: versions.json

afterSign: scripts/fixPermissions.js
```

> ⚠️ **打包路徑注意**：app 執行時應透過 `process.resourcesPath` 讀取 `extraResources`。例如 Windows 的 `whisper-cli.exe` 實際會在 `process.resourcesPath/win/whisper-cli.exe`，而不是 `app.getAppPath()/resources/...`。

> ⚠️ **macOS 打包注意**：`resources/` 內的所有 binary（`whisper-cli`、`ffmpeg`、`yt-dlp`）必須具備執行權限，否則 spawn 時會收到 `EACCES` 錯誤。透過 `afterSign` hook 補上。

### 5.2 資源打包策略

```
resources/
  mac/
    whisper/
      whisper-cli        # 預編譯 Metal binary
      lib/...
    ffmpeg               # universal binary
    yt-dlp               # universal binary
  win/
    whisper-cli.exe      # Phase 4 MVP：Vulkan build
    ffmpeg.exe
    yt-dlp.exe
  models/               # 預設放空，由 app 下載
  versions.json         # 各 binary 版本記錄
```

**外部 Binary 版本管理：**

```json
// resources/versions.json
{
  "whisper-cli": {
    "version": "1.7.3",
    "commit": "abc1234",
    "buildDate": "2026-03-10",
    "variants": {
      "mac": "metal",
      "win": "vulkan"
    }
  },
  "ffmpeg": { "version": "7.1", "build": "static-lgpl" },
  "yt-dlp": { "version": "2026.03.15", "autoUpdate": true }
}
```

### 5.3 Mac 公證（Notarization）

```bash
electron-builder --mac --publish never
xcrun notarytool submit dist/WhisperTool.dmg \
  --apple-id $APPLE_ID \
  --password $APP_PASSWORD \
  --team-id $TEAM_ID \
  --wait
```

### 5.4 自動更新

```typescript
import { autoUpdater } from 'electron-updater'
autoUpdater.checkForUpdatesAndNotify()
```

---

## 目錄結構

```
whisper-app/
├── shared/
│   ├── ipc.ts
│   ├── errors.ts
│   └── settings.schema.ts
├── electron/
│   ├── main/
│   │   ├── index.ts
│   │   ├── ipc/
│   │   │   ├── whisperHandlers.ts
│   │   │   ├── ytdlpHandlers.ts
│   │   │   ├── aiHandlers.ts
│   │   │   └── modelHandlers.ts
│   │   ├── whisper/
│   │   │   ├── runtime.ts        # 平台分支
│   │   │   ├── shared.ts         # WhisperRuntime 介面 + 共用 helper
│   │   │   ├── WhisperMac.ts
│   │   │   └── WhisperWindows.ts # Windows Vulkan CLI 整合
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
│   │       ├── lineBuffer.ts
│   │       └── modelManager.ts
│   └── preload/
│       ├── index.ts
│       ├── queue.ts
│       ├── whisper.ts
│       ├── ytdlp.ts
│       ├── ai.ts
│       └── settings.ts
├── src/
│   ├── components/
│   │   ├── DropZone.vue
│   │   ├── UrlInput.vue
│   │   ├── QueueTable.vue
│   │   ├── QueueItem.vue
│   │   ├── ResultViewer.vue
│   │   ├── ModelSelector.vue
│   │   ├── AiPanel.vue
│   │   └── SettingsPanel.vue
│   ├── composables/
│   │   ├── useQueue.ts
│   │   ├── useWhisper.ts
│   │   ├── useYtDlp.ts
│   │   └── useOllama.ts
│   ├── i18n/
│   │   ├── index.ts
│   │   └── locales/
│   │       ├── en.json
│   │       ├── zh-TW.json
│   │       └── zh-CN.json
│   ├── stores/
│   │   ├── queueStore.ts
│   │   └── settingsStore.ts
│   └── App.vue
├── resources/
│   ├── mac/
│   │   ├── whisper/
│   │   │   ├── whisper-cli
│   │   │   └── lib/...
│   │   ├── ffmpeg
│   │   └── yt-dlp
│   └── win/
│       ├── whisper-cli.exe
│       ├── ffmpeg.exe
│       └── yt-dlp.exe
├── build/
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
| Win Whisper | whisper.cpp + Vulkan（Phase 4 MVP） | 先用單一 backend 跑通 Windows；後續再補 CUDA / CPU fallback |
| 音訊下載 | yt-dlp (靜態 binary) | 支援 YouTube / Bilibili 等主流平台 |
| AI | Ollama HTTP API | 本地，無需雲端 |
| 音訊轉換 | ffmpeg (靜態 binary) | 格式支援最廣 |
| i18n | vue-i18n v10 | Vue 3 官方推薦 |
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
Week 9–10   Phase 4   Windows whisper.cpp Vulkan 編譯 + 手動驗證
                      + `WhisperWindows.ts` contract 替換
Week 11     Phase 4   移除 `Const-me` 實作殘留
                      + staging script / resources / tests / docs 更新
                      + Windows 打包測試
Week 12–13  Phase 5   雙平台公測、bug fix、CI/CD
```

> Windows 階段的核心調整不是「更快做完全部 backend」，而是「先用單一 Vulkan 路線拿到第一個可用版本」。多 backend 偵測與 fallback 刻意延後，避免 Phase 4 一開始就被多 binary 管理拖慢。

---

## 測試策略

### 工具選型

| 工具 | 用途 |
|---|---|
| Vitest | 單元測試 |
| @testing-library/vue | Vue 元件測試 |
| Playwright | E2E 測試（支援 Electron） |

### 測試範圍

**單元測試：**

- `createLineBuffer` — 邊界情況
- `BatchQueue` 狀態機
- `parseUrlList`
- AI 分段邏輯
- `getPrompt`
- `detectLocale`
- `AppError` → i18n key 對應
- `WhisperWindows` — runtime path 查找、CLI args 生成、stderr progress 解析

**元件測試：**

- `DropZone`、`QueueTable`、`SettingsPanel`

**E2E 測試：**

- 拖放檔案 → 轉錄完成 → 結果顯示
- yt-dlp URL 輸入 → 下載 → 轉錄（mock binary）
- AI pipeline

**Windows 平台測試：**

- 在至少一台 Vulkan-capable Windows 機器驗證 packaged app 可成功轉錄
- 在缺少 Vulkan runtime 或 driver 不相容時，確認顯示明確錯誤

### 外部 Binary Mock 策略

```
tests/
  mocks/
    whisper-cli.sh / whisper-cli.cmd   # 平台對應
    yt-dlp.sh / yt-dlp.cmd
    ffmpeg.sh / ffmpeg.cmd
  unit/
    lineBuffer.test.ts
    batchQueue.test.ts
    parseUrlList.test.ts
    aiChunking.test.ts
    whisperWindowsRuntime.test.ts     # runtime path / args / progress
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
| Windows Vulkan 編譯環境或 driver 差異導致 CLI 無法穩定運作 | Windows MVP 延誤 | 先鎖定一台已驗證的測試機型；必要時暫緩 Windows 發佈 |
| 既有 `Const-me` contract 與新 CLI contract 差異過大 | Windows migration 期間改動面擴大 | 採增量替換：保留 `WhisperWindows.ts` 外殼，只換底層 binary 與參數契約 |
| whisper.cpp binary 公證問題（Mac） | Mac 無法安裝 | 改用 node-addon-api 直接 binding |
| Ollama 未啟動 | AI 功能不可用 | UI 明確提示 + 一鍵啟動指引，AI 設為可選 |
| 大模型轉錄速度慢 | UX 體驗差 | 預設 `ggml-base`，提供速度 vs 精度選項 |
| yt-dlp 平台反爬更新 | 下載中斷 | 內建 yt-dlp 自我更新機制 |
| ffmpeg 授權問題 | 無法打包 | 使用 LGPL build 或引導使用者自行安裝 |

---

*最後更新：2026-03*

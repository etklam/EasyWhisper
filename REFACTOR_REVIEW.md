# Phase 1 & 2 Code Review - 可維護性分析

> 2026-03-17 | Reviewer: Ana

## 🔴 高優先級問題

### 1. 常量定義重複且分散

**問題：**
```typescript
// apps/desktop/electron/main/queue/BatchQueue.ts
const SUPPORTED_EXTENSIONS = new Set(['mp3', 'wav', 'm4a', 'mp4', 'mov', 'mkv'])

// apps/desktop/electron/main/audio/AudioProcessor.ts
private readonly supportedAudio = new Set(['mp3', 'wav', 'm4a', 'flac'])
private readonly supportedVideo = new Set(['mp4', 'mov', 'mkv', 'avi'])

// apps/desktop/electron/main/settings/SettingsManager.ts
const VALID_LOCALES = new Set(['en', 'zh-TW', 'zh-CN'])
const VALID_OUTPUT_FORMATS = new Set(['txt', 'srt', 'vtt', 'json'])
```

**影響：**
- 更新支援格式時需要在多個地方修改
- 容易遺漏某些定義
- 型別不一致（Set vs 陣列）

**建議：**
創建統一的 `constants.ts` 檔案集中管理所有常量

---

### 2. 型別定義重複

**問題：**
```typescript
// apps/desktop/electron/main/queue/BatchQueue.ts
export interface QueueItem {
  id: string
  source: QueueSource
  filePath?: string
  url?: string
  title?: string
  status: QueueStatus
  // ...
}

// packages/shared/src/settings.schema.ts
export interface PersistedQueueItem {
  id: string
  source: 'file' | 'ytdlp'
  filePath?: string
  url?: string
  title?: string
  status: 'pending' | 'done' | 'error'
  // ...
}
```

**影響：**
- `QueueItem` 和 `PersistedQueueItem` 有重複欄位
- 容易出現不同步
- 轉換邏輯分散

**建議：**
統一型別定義，`PersistedQueueItem` 應該從 `QueueItem` 繼承或組成

---

### 3. 魔法字串散落各處

**問題：**
```typescript
// SettingsManager.ts
const event = `change:${String(key)}`  // 硬編碼前綴

// BatchQueue.ts
case 'whisper:start':  // IPC channel 名稱硬編碼

// YtDlpDownloader.ts
const pathFile = path.join(this.tmpDir, `ytdlp-path-${randomUUID()}.txt`)  // 檔名模式
```

**影響：**
- 字串容易拼寫錯誤
- 重構時需要搜尋替換
- 無自動完成檢查

**建議：**
創建 `events.ts` 和 `constants.ts` 定義所有字面值

---

## 🟡 中優先級問題

### 4. 工具函式重複

**問題：**
```typescript
// OutputFormatter.ts (底部 helper functions)
function normalizeText(text: string): string {
  return text.trim().replace(/\s+/g, ' ')
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

function pad3(value: number): string {
  return String(value).padStart(3, '0')
}

// AudioProcessor.ts (底部 helper functions)
function extensionOf(filename: string): string {
  // 實現類似
}

function timeToSeconds(timecode: string): number {
  // 實現類似
}
```

**影響：**
- 重複實現相同邏輯
- 難以測試
- 無法跨模組重用

**建議：**
創建 `utils/string.ts` 和 `utils/timecode.ts` 集中管理工具函式

---

### 5. 錯誤處理不一致

**問題：**
```typescript
// AudioProcessor.ts
reject(new Error(`ffmpeg exited with code ${code}`))

// YtDlpDownloader.ts
throw {
  code: 'YTDLP_PATH_READ_FAILED',
  detail: String(error)
} satisfies YtDlpPathReadError

// BatchQueue.ts
throw new Error(`Unsupported file format: ${filePath}`)
```

**影響：**
- 有的返回 Error 物件，有的返回結構化錯誤
- 錯誤碼不統一
- UI 端難以統一處理

**建議：**
定義統一的錯誤類型系統，包含錯誤碼和用戶友好訊息

---

### 6. 事件系統不統一

**問題：**
```typescript
// BatchQueue.ts
export class BatchQueue extends EventEmitter {
  // 使用 Node.js EventEmitter
}

// SettingsManager.ts
export class SettingsManager {
  private readonly emitter = new EventEmitter()
  // 內部使用 EventEmitter
}
```

**影響：**
- 事件命名不一致
- 監聽器管理分散
- 難以追蹤事件流

**建議：**
創建統一的 EventBus 或使用已有 EventEmitter 並制定事件命名規範

---

## 🟢 低優先級問題

### 7. 檔案路徑操作重複

**問題：**
```typescript
// 多個檔案重複的 path.join 和 path.resolve
path.join(this.tmpDir, `ytdlp-path-${randomUUID()}.txt`)
path.join(this.cacheDir, `${this.getCacheKey(inputPath)}.wav`)
path.resolve(process.cwd(), 'whisper.cpp/build/bin/whisper-cli')
```

**影響：**
- 檔案結構分散在程式碼中
- 變更路徑困難
- 難以測試

**建議：**
創建 `paths.ts` 集中管理所有檔案路徑

---

### 8. 驗證邏輯重複

**問題：**
```typescript
// SettingsManager.ts
const VALID_LOCALES = new Set(['en', 'zh-TW', 'zh-CN'])

// SettingsManager.setSetting()
if (!VALID_LOCALES.has(value as string)) {
  throw new Error(`Invalid locale: ${value}`)
}
```

**影響：**
- 每個驗證點都要寫邏輯
- 錯誤訊息不統一
- 擴展困難

**建議：**
創建 `validators.ts` 統一驗證邏輯

---

### 9. 進度追蹤介面不一致

**問題：**
```typescript
// ConversionProgress (AudioProcessor)
export interface ConversionProgress {
  percentage: number
  time: string
}

// QueueProgressEvent (測試)
export interface QueueProgressPayload {
  id: string
  type: 'download' | 'convert' | 'transcribe' | 'ai'
  progress: number  // 注意這是 progress 不是 percentage
}
```

**影響：**
- 欄位名稱不一致
- 類型不統一
- 組合使用時需要轉換

**建議：**
統一進度介面定義

---

## 📋 建議的 Refactoring 計劃

### Phase 2.1: 統一常量和型別

**任務：**
1. 創建 `electron/main/constants/index.ts`
2. 創建 `electron/main/types/index.ts`
3. 將所有常量移至 `constants/`
4. 將重複型別統一並匯出

**檔案結構：**
```
electron/main/
├── constants/
│   ├── index.ts          # 統一匯出
│   ├── formats.ts        # 支援格式
│   ├── errors.ts         # 錯誤碼
│   ├── events.ts         # 事件名稱
│   └── paths.ts         # 路徑常量
├── types/
│   ├── index.ts          # 統一匯出
│   ├── queue.ts          # 佇列型別
│   ├── progress.ts       # 進度型別
│   └── errors.ts        # 錯誤型別
└── utils/
    ├── index.ts
    ├── string.ts        # 字串工具
    ├── timecode.ts      # 時間碼工具
    ├── file.ts          # 檔案工具
    └── validation.ts    # 驗證工具
```

---

### Phase 2.2: 統一錯誤處理

**任務：**
1. 創建 `types/errors.ts` 定義錯誤類型
2. 創建 `constants/errors.ts` 定義錯誤碼
3. 創建 `utils/errors.ts` 錯誤處理工具

**錯誤類型範例：**
```typescript
export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    public message: string,
    public detail?: unknown
  ) {
    super(message)
  }
}

export enum ErrorCode {
  // File errors
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  FILE_FORMAT_UNSUPPORTED = 'FILE_FORMAT_UNSUPPORTED',
  FILE_READ_FAILED = 'FILE_READ_FAILED',

  // Conversion errors
  CONVERSION_FAILED = 'CONVERSION_FAILED',
  FFMPEG_NOT_FOUND = 'FFMPEG_NOT_FOUND',

  // Download errors
  DOWNLOAD_FAILED = 'DOWNLOAD_FAILED',
  YTDLP_PATH_READ_FAILED = 'YTDLP_PATH_READ_FAILED',

  // Transcription errors
  TRANSCRIPTION_FAILED = 'TRANSCRIPTION_FAILED',
  WHISPER_CLI_NOT_FOUND = 'WHISPER_CLI_NOT_FOUND',

  // Validation errors
  INVALID_LOCALE = 'INVALID_LOCALE',
  INVALID_OUTPUT_FORMAT = 'INVALID_OUTPUT_FORMAT',
  INVALID_SETTING_VALUE = 'INVALID_SETTING_VALUE'
}
```

---

### Phase 2.3: 統一事件系統

**任務：**
1. 創建 `utils/EventBus.ts` 統一事件管理
2. 定義事件命名規範
3. 更新所有模組使用 EventBus

**事件命名規範：**
```typescript
// 格式: {module}:{action}:{detail}
const Events = {
  QUEUE: {
    ITEM_ADDED: 'queue:item:added',
    ITEM_STARTED: 'queue:item:started',
    ITEM_PROGRESS: 'queue:item:progress',
    ITEM_COMPLETED: 'queue:item:completed',
    ITEM_ERROR: 'queue:item:error',
    ITEM_CANCELLED: 'queue:item:cancelled',
    PAUSED: 'queue:paused',
    RESUMED: 'queue:resumed',
    CLEARED: 'queue:cleared'
  },
  SETTINGS: {
    CHANGED: 'settings:changed',
    KEY_CHANGED: 'settings:key:changed'
  },
  PROGRESS: {
    CONVERSION: 'progress:conversion',
    DOWNLOAD: 'progress:download',
    TRANSCRIPTION: 'progress:transcription'
  }
}
```

---

### Phase 2.4: 提取並統一工具函式

**任務：**
1. 將 `normalizeText`、`pad2`、`pad3` 移至 `utils/string.ts`
2. 將 `extensionOf` 移至 `utils/file.ts`
3. 將 `timeToSeconds` 移至 `utils/timecode.ts`
4. 將 `validateLocale`、`validateOutputFormat` 移至 `utils/validation.ts`

---

## 📊 重構收益評估

### 代碼重複減少

| 模組 | 當前重複 | 重構後 | 減少 |
|---|---|---|---|
| 常量定義 | ~100 行 | 1 個檔案 | 80% |
| 工具函式 | ~50 行 | 4 個檔案 | 70% |
| 錯誤處理 | 分散 | 統一 | 90% |

### 可維護性提升

- ✅ **單一資料來源**：常量和型別集中管理
- ✅ **更好的型別安全**：統一的錯誤類型系統
- ✅ **更容易測試**：工具函式可獨立測試
- ✅ **更易擴展**：新增格式/語言只需修改一處
- ✅ **更好的 IDE 支援**：自動完成和重構更準確

### 風險評估

| 項目 | 風險 | 緩解措施 |
|---|---|---|
| 大規模重構 | 高 | 分階段進行，每階段測試 |
| 破壞現有功能 | 中 | 完整測試覆蓋，保留舊介面 |
| API 變更 | 中 | 使用 deprecation 期間 |

---

## 🎯 優先級建議

### 立即執行（Phase 3 之前）
1. ✅ **統一常量定義** - 影響多個模組
2. ✅ **統一錯誤處理** - Phase 3 AI 整合需要

### Phase 4 之前執行
3. 統一事件系統
4. 提取工具函式

### 可選執行
5. 創建 EventBus
6. 統一進度介面

---

## 🔍 其他觀察

### 做得好的地方

1. ✅ **良好的型別定義** - 使用 TypeScript interface 和 type
2. ✅ **測試覆蓋** - 每個模組都有測試
3. ✅ **異步處理** - 正確使用 async/await
4. ✅ **錯誤處理** - 有 try-catch 和 reject
5. ✅ **事件驅動** - 使用 EventEmitter 進行解耦

### 改進空間

1. 🔄 **日誌系統** - 目前無統一日誌
2. 🔄 **效能監控** - 無性能指標追蹤
3. 🔄 **配置驗證** - schema 驗證可以更完善
4. 🔄 **文檔** - API 文檔需要補充

---

## 📝 行動項

- [ ] 創建 `electron/main/constants/` 目錄
- [ ] 創建 `electron/main/types/` 目錄
- [ ] 創建 `electron/main/utils/` 目錄結構
- [ ] 統一所有常量定義
- [ ] 統一錯誤處理系統
- [ ] 提取並統一工具函式
- [ ] 更新測試以使用新的導入
- [ ] 更新文檔

---

**結論：** Phase 1 & 2 的程式碼品質整體良好，有完整的測試覆蓋。主要問題集中在**常量和工具函式的重複**，以及**型別和錯誤處理的不統一**。建議在進入 Phase 3（AI 整合）之前，先完成 Phase 2.1 和 2.2 的重構工作，以降低後續開發的技術債。

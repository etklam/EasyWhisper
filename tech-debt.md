# Technical Debt - FOSSWhisper 專案

## 狀態

此檔案已重新啟用。

先前在 2026-03-18 的清理工作已處理一批既有技術債，但本次 review 仍發現新的架構與效能風險，特別是「沒有實際工作時或接近 idle 時，仍可能造成不必要 CPU 喚醒」的路徑。

截至 2026-03-21，本輪記錄中的 high / medium priority 項目已處理完成。

## 本次新增記錄

### 1. AI pipeline 使用 timer-based busy wait

- 狀態: 已於 2026-03-21 處理
- 處理摘要:
  - `waitForSlot()` 輪詢已改為 event-driven slot queue。
  - 移除固定 100ms timer busy-wait，改由任務完成時直接喚醒下一個等待中的 task。

- 位置: `apps/desktop/electron/main/ai/AiPipeline.ts`
- 風險: `waitForSlot()` 以 `while (...)` 加 `setTimeout(100)` 等待併發槽位，屬於 polling 式等待。
- 影響:
  - 任務排隊時會持續喚醒 main process。
  - 工作剛結束或 backlog 尚未完全清空時，容易出現不必要 CPU 活動。
  - 之後若提高 concurrency 或增加更多 AI 工作型別，成本會跟著放大。
- 建議:
  - 改成 event-driven semaphore / queue。
  - 避免以固定 100ms timer 輪詢可用槽位。

### 2. Settings 頁工具偵測成本偏高且集中在 main process 同步執行

- 狀態: 已於 2026-03-21 處理
- 處理摘要:
  - `FfmpegDetector`、`YtDlpDetector`、`JsRuntimeDetector` 已加入短期 cache 與 in-flight dedupe。
  - Settings 頁首次進入會吃到 cache，只有使用者手動 refresh 時才強制 bypass cache 重跑探測。

- 位置:
  - `apps/desktop/src/components/FfmpegStatus.vue`
  - `apps/desktop/src/components/YtDlpStatus.vue`
  - `apps/desktop/electron/main/audio/FfmpegDetector.ts`
  - `apps/desktop/electron/main/ytdlp/YtDlpDetector.ts`
  - `apps/desktop/electron/main/ytdlp/JsRuntimeDetector.ts`
- 風險:
  - 進入 settings 頁時，ffmpeg 與 yt-dlp 卡片都會主動執行 detect。
  - detect 內部會同步呼叫 `which`/`where`、`--version`、目錄掃描、wildcard 展開與 runtime 探測。
  - 這些工作都在 Electron main process 內執行。
- 影響:
  - 會造成頁面切換時 CPU spike。
  - 若設定回寫或 mode 切換頻繁，會重複觸發相同探測。
  - 使用者可能感知成「沒在轉檔也沒在下載，但 app 還是有點忙」。
- 建議:
  - 對 detect 結果加短期 cache。
  - 只在使用者主動 refresh、切換 mode、或 cache 過期時重跑。
  - 優先把同步探測改成較可控的非阻塞流程。

### 3. Renderer 端存在重疊的 queue / task 架構

- 狀態: 已於 2026-03-21 處理
- 處理摘要:
  - `whisperStore` 已收斂為 settings / model store，不再維護第二套 runtime queue/task state。
  - 未接線的 `BatchQueue` prototype 已從 production code 與測試中移除，正式 queue architecture 只保留 `queueStore`。

- 位置:
  - `apps/desktop/src/stores/queue.ts`
  - `apps/desktop/src/stores/whisper.ts`
  - `apps/desktop/electron/main/queue/BatchQueue.ts`
- 風險:
  - 目前 UI 主流程主要走 `queueStore`，但 `whisperStore` 仍保留另一套 task/event 流。
  - repo 中還有未接入正式流程的 `BatchQueue` 實作。
- 影響:
  - 同類責任分散在三套模型中，增加維護成本。
  - 容易重複綁 listener、重複更新 reactive state。
  - 未來修 perf 或 idle CPU 問題時，診斷範圍會被放大。
- 建議:
  - 明確指定唯一正式 queue architecture。
  - 把 `whisperStore` 中已不屬於正式 UI 流程的 runtime task 管理抽離或刪除。
  - 決定 `BatchQueue` 是要接線、重構，還是移除。

### 4. Queue summary 計算為 repeated full-array scan

- 狀態: 已於 2026-03-21 處理
- 處理摘要:
  - queue summary 已集中到 `queueStore.summary` getter，UI 統一讀取同一份聚合結果。
  - `HomeView` 與 `QueueTable` 不再各自重複對 `items` 做 full-array `filter()` 掃描。

- 位置:
  - `apps/desktop/src/views/HomeView.vue`
  - `apps/desktop/src/components/QueueTable.vue`
- 風險:
  - `activeCount`、`doneCount`、`errorCount` 等統計每次都以 `filter()` 全掃 queue items。
- 影響:
  - 真正 idle 時影響不大。
  - 但在大量 progress event 下，renderer 會反覆做 O(n) 重算。
  - queue 規模大時，summary badge/table 會放大每次事件的渲染成本。
- 建議:
  - 將統計集中到 store 層維護。
  - 或至少避免在多個元件重複對同一份陣列做相同掃描。

### 5. yt-dlp 取消功能未實作

- 狀態: 已於 2026-03-21 處理
- 處理摘要:
  - IPC handler 現在會追蹤 active downloader 實例。
  - `cancel` 請求已可正確轉送到對應下載程序並回傳實際取消結果。

- 位置: `apps/desktop/electron/main/ipc/ytdlpHandlers.ts:184-189`
- 風險: TODO 註解顯示取消功能未實作，目前直接回傳 `cancelled: false`。
- 影響: 使用者無法取消進行中的下載，UX 差。
- 建議: 追蹤 active downloader 實例並正確處理取消請求。

### 6. Abort signal merge 存在額外 listener/bookkeeping 成本

- 狀態: 已於 2026-03-21 處理
- 處理摘要:
  - `AiPipeline.runWithTimeout()` 現在只有在存在 upstream signal 時才會建立 merged signal。
  - 一般 timeout-only 路徑直接使用 timeout controller signal，減少多餘 listener 與 controller bookkeeping。

- 位置: `apps/desktop/electron/main/ai/AiPipeline.ts:346-372`
- 風險: `mergeAbortSignals()` 會為每個來源 signal 註冊 listener。雖然目前已使用 `{ once: true }`，不屬於明確的 listener leak，但大量建立 merged signal 時仍會增加額外 listener 與生命週期管理成本。
- 影響:
  - 大多情況下影響有限。
  - 若未來 AI task 建立頻率更高，這段會是值得持續注意的成本點。
- 建議:
  - 保持目前 `{ once: true }` 的做法。
  - 若後續重構 AI pipeline，可一併檢查是否能減少 signal merge 次數。

### 7. Unbounded arrays 可能導致長期記憶體增長

- 狀態: 已於 2026-03-21 處理
- 處理摘要:
  - `queueStore.items` 與 `aiStore.workflows` 已加入 terminal entries retention。
  - 目前會保留最近 100 筆已完成/失敗項目，避免長 session 無上限成長。

- 位置:
  - `apps/desktop/src/stores/queue.ts: items: QueueTask[]`
  - `apps/desktop/src/stores/ai.ts: workflows: AiWorkflowTask[]`
- 風險: 已完成的項目目前沒有自動裁剪機制，陣列理論上可無上限成長。
- 影響:
  - 這是長時間 session 下的潛在增長風險，未必代表目前已存在實際 memory leak。
  - queue 與 workflow 累積很多後，會增加 renderer 記憶體與重算成本。
- 建議: 實作自動清理機制（如保留最近 N 項）或手動清空選項。

### 8. 重複的工具函式散落各處

- 狀態: 已於 2026-03-21 處理
- 處理摘要:
  - 共用的 `clampProgress()`、`toErrorMessage()`、`getEnabledAiTasks()` 已抽到 `packages/shared/src/workflow.ts`。
  - `queueStore`、`aiStore`、`WhisperMac` 等正式流程已改用共享 helper，避免主流程再分叉維護。

- 位置: 多個檔案包含重複的函式定義
  - `clampProgress()` - 出現於 `queue.ts:67`, `ai.ts:423`, `WhisperMac.ts:281` 等
  - `toErrorMessage()` - 出現於 `queue.ts:630`, `ai.ts:427`, `BatchQueue.ts:290`
  - `getEnabledAiTasks()` - 出現於 `queue.ts:616`, `whisper.ts:374`, `ai.ts:400`
- 影響: 維護負擔，行為可能不一致。
- 建議: 抽取至共享 utility 模組。

### 9. AI Store 與 Whisper Store 緊密耦合

- 狀態: 已於 2026-03-21 處理
- 處理摘要:
  - `aiStore.enqueueWorkflow()` 現在要求呼叫端顯式傳入 `settings`。
  - 已移除對 `useWhisperStore().settings` 的 fallback 讀取，AI flow 不再直接耦合 Whisper store。

- 位置: `apps/desktop/src/stores/ai.ts:150`
- 風險: `aiStore.enqueueWorkflow()` 雖支援透過 `input.settings` 注入設定，但 fallback 仍直接讀取 `useWhisperStore().settings`，存在 store-level coupling。
- 影響: 測試與後續重構時，AI flow 仍依賴其他 store 的存在與形狀。
- 建議: 優先讓正式呼叫路徑都顯式傳入 settings，再視情況移除 fallback 耦合。

## 補充觀察

- 本次 review 沒有發現明確的永久性 `setInterval` 輪詢或「完全 idle 仍無限自旋」型 bug。
- 目前更像是多個設計選擇疊加後，讓 app 在特定畫面或任務邊界狀態下出現不必要 CPU 喚醒。

## 嚴重程度分類

### Performance / Idle CPU Focus

#### High Priority
- 無

#### Medium Priority
- 無

### Other Technical Debt

#### High Priority
- 無

#### Medium Priority
- 無

## 目前待處理項目摘要

- 本輪記錄中的 high / medium priority 項目已清空。
- 後續若再新增技術債，建議延續同一份檔案追蹤。

## 歷史註記

- 2026-03-18: 曾完成一輪技術債清理。
- 2026-03-21: 重新開啟記錄，新增 idle/CPU 相關技術債。
- 2026-03-21: 已完成 #1、#5、#7。
- 2026-03-21: 已完成 #2、#3、#4、#6、#8、#9。

**最後更新：** 2026-03-21
**狀態：** Active

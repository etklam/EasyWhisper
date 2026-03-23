# Technical Debt - FOSSWhisper 專案

## 狀態

此檔案已重新啟用。

先前在 2026-03-18 的清理工作已處理一批既有技術債，但本次 review 仍發現新的架構與效能風險，特別是「沒有實際工作時或接近 idle 時，仍可能造成不必要 CPU 喚醒」的路徑。

截至 2026-03-24，2026-03-21 那輪 high / medium priority 項目已處理完成；本次 review 另外新增一批以 Windows packaging / maintainability 為主的技術債，其中 #10 至 #13 已於 2026-03-24 處理完成。

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

### 10. Windows runtime staging 允許混合來源輸入

- 狀態: 已於 2026-03-24 處理
- 處理摘要:
  - `stage_windows_whisper_runtime.mjs` 現在只接受單一 `--source` runtime bundle 目錄。
  - 已移除 `--cli` / `FOSSWHISPER_WINDOWS_WHISPER_CLI_PATH` 混合來源路徑。
  - staged `whisper-cli.exe` 與其他 runtime 檔案必須來自同一份 source bundle。

- 位置: `apps/desktop/scripts/stage_windows_whisper_runtime.mjs`
- 風險:
  - `--cli` 與 `--source` 目前是兩套可同時存在的輸入來源。
  - script 會用 `cliSource` 當主程式來源，但額外 runtime 檔案仍從 `sourceDir` 掃描與複製。
  - 沒有任何 guard 保證 `whisper-cli.exe` 與其他 DLL / runtime files 來自同一份 build。
- 影響:
  - 容易把不同版本或不同 build 變體的檔案混進同一個 packaged runtime。
  - 問題發生時較難重現，因為 staging 結果取決於操作者當時如何組合參數。
  - release/debug 過程會高度依賴人工記憶，而不是流程保證。
- 建議:
  - 明確規定只能接受單一來源模式，例如 `--source` 或 `--cli` 二選一。
  - 若保留混用模式，至少要加入一致性檢查與更明確的 manifest metadata。

### 11. Windows runtime staging 採 denylist 複製 source artifact

- 狀態: 已於 2026-03-24 處理
- 處理摘要:
  - 受管理 runtime 檔案規則已收斂到 `windows_runtime_manifest.mjs`。
  - staging 現在改用 variant-aware allowlist / pattern 規則。
  - source bundle 中未知的 top-level file 會直接報錯，不再被靜默帶進 installer。

- 位置:
  - `apps/desktop/scripts/stage_windows_whisper_runtime.mjs`
  - `apps/desktop/scripts/verify_windows_whisper_runtime.mjs`
- 風險:
  - 除了少數被忽略的檔名外，`sourceDir` 下大多數 top-level file 都會被當成 runtime 一起 stage。
  - verify script 只檢查 manifest 與實際檔案是否一致，無法區分哪些其實是不該打包的 artifact。
- 影響:
  - `.pdb`、額外 exe、測試產物或其他雜項檔案都可能被帶進 installer。
  - release 內容會被外部 artifact 目錄形狀左右，增加維護與排錯成本。
  - 後續若更換 upstream build 流程，打包輸出會更難預測。
- 建議:
  - 改為 allowlist 或 pattern-based staging，明確列出允許帶入的 runtime 類型。
  - 把「什麼算受管理 runtime」收斂成單一規則，而不是由當下 source 目錄內容隱式決定。

### 12. Windows packaging metadata 存在多個 source of truth

- 狀態: 已於 2026-03-24 處理
- 處理摘要:
  - 新增 `windows_runtime_manifest.mjs`，把 Windows runtime manifest shape、variant 規則與受管理檔案規則集中到單一 helper。
  - `runtime-manifest.json` 現在同時記錄 runtime `version` 與受管理檔案清單。
  - Windows packaging preflight 與 docs 已改以 `runtime-manifest.json` 為唯一 runtime metadata contract。

- 位置:
  - `apps/desktop/resources/win/runtime-manifest.json`
  - `apps/desktop/resources/versions.json`
  - `apps/desktop/package.json`
- 風險:
  - Windows runtime 是否正確 stage / package，目前同時依賴實際檔案、`runtime-manifest.json`、`versions.json` 與 `electron-builder` 的 `extraResources` 設定。
  - 這些資訊之間沒有單一 canonical source，自動同步完全仰賴 script 與維護者習慣。
- 影響:
  - 日後擴充新的 runtime 依賴或支援新 variant 時，需要同步修改多個地方。
  - 少改一處時，常見結果不是 compile error，而是 packaging / runtime 階段才出錯。
  - review 與 debug 的認知成本偏高。
- 建議:
  - 盡量把 runtime metadata 收斂成單一 manifest，再由 script 產出其餘衍生資訊。
  - 明確區分「build-time metadata」與「app runtime 真的需要讀取的 metadata」。

### 13. `versions.json` 被打進正式 app，但目前主要服務 packaging/preflight

- 狀態: 已於 2026-03-24 處理
- 處理摘要:
  - `apps/desktop/package.json` 已移除 `resources/versions.json` 的 Windows `extraResources` 設定。
  - Windows preflight 現在不再讀取 `versions.json`。
  - whisper runtime `version` 已搬進 `runtime-manifest.json`，不再把本機絕對路徑寫進 packaged metadata。

- 位置:
  - `apps/desktop/resources/versions.json`
  - `apps/desktop/package.json`
  - `apps/desktop/scripts/stage_windows_whisper_runtime.mjs`
- 風險:
  - `versions.json` 現在會透過 `extraResources` 進入正式 app。
  - 目前 repo 內沒有明確 runtime consumer；它主要被 staging / verify script 使用。
  - `notes` 還會寫入開發機本地絕對路徑。
- 影響:
  - 正式產物攜帶與執行時無直接關聯的 dead payload。
  - 會把本機工作目錄資訊一起帶進產物，增加資訊洩漏與後續清理成本。
  - 維護者容易誤以為 app runtime 依賴這份檔案，進一步放大 coupling。
- 建議:
  - 若 app runtime 不需要，將其保留在 build-time / CI artifact，而不是 packaged resource。
  - 至少避免把本機絕對路徑寫進版本註記欄位。

### 14. Mac / Windows whisper CLI runner 邏輯持續分叉

- 狀態: 待處理
- 位置:
  - `apps/desktop/electron/main/whisper/WhisperMac.ts`
  - `apps/desktop/electron/main/whisper/WhisperWindows.ts`
- 風險:
  - 兩邊目前都各自維護 spawn、progress parse、output JSON read 與 output file naming 邏輯。
  - 這批重複碼不是逐字相同，但責任邊界高度重疊。
- 影響:
  - 之後若 `whisper.cpp` CLI contract、progress 格式或輸出 JSON schema 再變動，容易出現平台間 drift。
  - 測試也必須平行維護兩套近似情境，增加修改成本。
- 建議:
  - 抽出共享的 CLI orchestration helper，平台特有部分只保留 path resolution 與少量 args 差異。
  - 讓跨平台測試更多聚焦在共同 contract，而不是各自重複驗證相同流程。

### 15. App icon packaging 依賴自製 ICO / ICNS 組裝邏輯

- 狀態: 待處理
- 位置: `apps/desktop/scripts/generate_app_icons.mjs`
- 風險:
  - script 直接實作 ICO / ICNS binary 組裝規則，而不是交由成熟工具鏈處理。
  - 相關格式知識目前集中在單一腳本內，對維護者有較高背景知識要求。
- 影響:
  - 日後若要調整尺寸集、加入新 icon variant 或排查平台相容性問題，修改成本偏高。
  - 這類問題通常只會在 packaging 或真機環境暴露，不容易靠一般開發流程提早發現。
- 建議:
  - 保持目前測試的同時，評估是否改用更成熟的 icon build tooling。
  - 若維持自製方案，至少要把格式假設與限制更明確寫進 script / README。

### 16. Repo 直接追蹤大型 Windows runtime binary

- 狀態: 待評估
- 位置: `apps/desktop/resources/win/whisper-cli.exe`
- 風險:
  - repo 目前直接追蹤約 64 MB 的 `whisper-cli.exe`。
  - 每次升級 runtime 都會放大 clone、fetch、diff 與 branch churn 成本。
- 影響:
  - 對日常開發者來說，與原始碼無關的 release artifact 會持續增加 repo 負擔。
  - code review 對 runtime 更新本身幾乎沒有可讀性，只能看到 binary replaced。
- 建議:
  - 評估改成由 release artifact、內部 package source 或 CI staging 流程提供 binary。
  - 若短期內仍需留在 repo，至少要明確定義更新節奏與驗證流程，降低 churn。
- 補充註記:
  - 2026-03-24: 目前先維持 repo tracked binary，不立即切到 staging/CI 注入。
  - 後續若建立穩定的 Windows packaging pipeline，再重新評估是否將 runtime binary 移出 repo。

## 補充觀察

- 本次 review 沒有發現明確的永久性 `setInterval` 輪詢或「完全 idle 仍無限自旋」型 bug。
- 目前更像是多個設計選擇疊加後，讓 app 在特定畫面或任務邊界狀態下出現不必要 CPU 喚醒。
- 2026-03-24 新增的項目主要偏向 release workflow、metadata 管理與跨平台維護成本，不是立即功能失效。

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

#### Low Priority
- #14 Mac / Windows whisper CLI runner 邏輯持續分叉
- #15 App icon packaging 依賴自製 ICO / ICNS 組裝邏輯
- #16 Repo 直接追蹤大型 Windows runtime binary

## 目前待處理項目摘要

- 2026-03-21 那輪 high / medium priority 項目已清空。
- Windows runtime staging / packaging metadata 的 medium priority debt（#10 至 #13）已於 2026-03-24 處理完成。
- 目前剩餘項目集中在跨平台 runner 重複、icon tooling 與大型 binary 管理成本。
- 後續若再新增技術債，建議延續同一份檔案追蹤。

## 歷史註記

- 2026-03-18: 曾完成一輪技術債清理。
- 2026-03-21: 重新開啟記錄，新增 idle/CPU 相關技術債。
- 2026-03-21: 已完成 #1、#5、#7。
- 2026-03-21: 已完成 #2、#3、#4、#6、#8、#9。
- 2026-03-24: 新增 #10、#11、#12、#13、#14、#15、#16（維護性 / packaging debt）。
- 2026-03-24: 已完成 #10、#11、#12、#13。
- 2026-03-24: #16 補記為待評估，先維持 repo tracked binary，未來再考慮 staging/CI 注入。

**最後更新：** 2026-03-24
**狀態：** Active

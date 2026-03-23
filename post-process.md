# AI Post-Processing Architecture

這份文件描述的是 **目前 repo 中已存在的 AI post-processing 實作**，不是目標設計稿。
重點是讓後續 review 時可以快速看懂：

- AI 後處理是在哪個階段接進 transcription pipeline
- 哪些責任在 renderer，哪些責任在 main process
- 資料如何從 queue task 流到 AI workflow，再回到 UI
- 目前架構有哪些明顯限制

## 範圍

目前 AI post-processing 指的是 transcription 完成之後，透過 Ollama 執行的三種可選步驟：

- `correct`
- `translate`
- `summary`

相關核心檔案：

- `apps/desktop/src/stores/queue.ts`
- `apps/desktop/src/stores/ai.ts`
- `apps/desktop/src/stores/aiWorkflowCoordinator.ts`
- `apps/desktop/electron/main/ipc/ai.ts`
- `apps/desktop/electron/main/ai/AiPipeline.ts`
- `apps/desktop/electron/main/ai/prompts.ts`
- `apps/desktop/electron/main/ai/OllamaClient.ts`
- `apps/desktop/electron/main/ipc/settings.ts`
- `apps/desktop/src/stores/whisper.ts`

## 高層流程

目前的高層流程如下：

1. 使用者在 settings 中開啟 AI，選模型與啟用步驟。
2. queue task 完成 transcription 與 output format 產出。
3. queue store 判斷是否需要跑 AI。
4. 若需要，queue store 透過 `aiWorkflowCoordinator` 把任務送到 `aiStore`。
5. `aiStore` 以 workflow 形式管理多步驟 AI 任務，按順序執行 `correct -> translate -> summary`。
6. 每個步驟都透過 preload API 呼叫 `window.fosswhisper.runAi()`。
7. main process 的 `ipc/ai.ts` 建立 `AiPipeline`，呼叫 Ollama，並透過 IPC event 回傳 progress / result / error。
8. `aiStore` 更新 workflow 狀態，同時透過 coordinator 回寫 queue item 的 AI 進度與結果。
9. queue item 進入 `done` 或 `error`，UI 顯示 AI 結果預覽。

## 設定來源

AI 設定的持久化來源在 main process 的 `SettingsManager`。

- `SettingsManager` 預設值定義在 `apps/desktop/electron/main/settings/SettingsManager.ts`
- `ipc/settings.ts` 把內部 `SettingsSchema` 映射成 renderer 用的 `WorkflowSettings`
- `whisperStore.settings` 會在 renderer 初始化時載入這份設定

目前 AI 相關設定包含：

- `aiEnabled`
- `aiModel`
- `aiTargetLang`
- `aiCorrect`
- `aiTranslate`
- `aiSummary`
- `aiCustomPrompts`

queue store 在需要 enqueue AI workflow 時，會直接讀目前的 `WorkflowSettings`，而不是自己維護另一份 AI 設定快照。

但要注意：**這份設定只在 enqueue 當下被複製進 workflow**。

也就是說：

- 已經 enqueue 的 workflow 會持有自己的 `model` / `targetLang` / `customPrompts`
- 使用者之後再改 settings，只會影響後續新進來的 workflow，不會回頭改正在排隊或執行中的 workflow

## Queue 與 AI 的接點

AI 不是和 transcription 同時跑，而是 **在 transcription 完成後才接上去**。

位於 `apps/desktop/src/stores/queue.ts` 的流程是：

1. `handleWhisperComplete()` 收到 transcription 完成事件。
2. 先把 `event.text` 存進 `item.transcript`。
3. 先執行 `generateOutputsForTask()`，把原始 transcript 轉成 `txt` / `srt` / `vtt` / `json` 等輸出。
4. 然後才透過 `enqueueAiWorkflow()` 把 AI workflow 送進 `aiStore`。

也就是說，**目前 output format 的正式輸出永遠先於 AI 後處理**。

如果 AI 沒啟用，queue item 直接變成 `done`。
如果 AI 啟用且成功 enqueue，queue item 狀態會變成 `ai`，等待 workflow 完成。

## `aiWorkflowCoordinator` 的角色

`apps/desktop/src/stores/aiWorkflowCoordinator.ts` 是一個很薄的 bridge layer。

它做兩件事：

1. 讓 queue store 可以把 transcription 結果 enqueue 成 AI workflow
2. 讓 `aiStore` 可以把 workflow 的進度、完成、失敗回寫到 queue store

這裡沒有真正的排程邏輯，只有 bridge：

- Queue -> AI
  - `enqueueAiWorkflow()`
  - `cancelAiWorkflow()`
  - `clearAiWorkflow()`
- AI -> Queue
  - `notifyAiQueued()`
  - `notifyAiProgress()`
  - `notifyAiCompleted()`
  - `notifyAiFailed()`

## Renderer 端的 workflow orchestration

真正的 AI 後處理 orchestration 在 `apps/desktop/src/stores/ai.ts`。

### 資料模型

`AiWorkflowTask` 代表一個 queue item 對應的一條 AI workflow，包含：

- `sourceText`
- `currentText`
- `steps`
- `results`
- `status`
- `progress`
- `currentStep`
- `cancelRequested`

其中最關鍵的是：

- `sourceText`: transcription 原始文字
- `currentText`: 每一步執行後往下傳遞的文字
- `results`: 每個 AI step 的輸出結果

### 步驟決定

workflow 會透過 `@shared/workflow` 的 `getEnabledAiTasks()` 決定步驟，固定順序是：

1. `correct`
2. `translate`
3. `summary`

### 執行方式

`runWorkflow()` 會逐步執行每個 enabled step。

每個 step 都呼叫：

```ts
window.fosswhisper.runAi({
  id,
  model,
  text: workflow.currentText,
  taskType,
  targetLang,
  batchMode,
  customPrompts
})
```

目前資料傳遞規則是：

- `correct` 讀 `sourceText`
- `translate` 讀前一步更新後的 `currentText`
- `summary` 讀前一步更新後的 `currentText`

所以現在是明確的串接式 post-processing：

- `correct -> translate`
- `translate -> summary`
- `correct -> translate -> summary`

不是三個步驟各自讀同一份原始 transcript。

### Renderer 端併發

`aiStore` 自己維護 workflow queue，並在 `pumpQueue()` 中控制最多同時執行 `2` 條 workflow。

這個併發限制是 renderer store 層級的，不是 global backend queue。

## Main process 的 AI IPC 層

`apps/desktop/electron/main/ipc/ai.ts` 提供幾個 IPC handler：

- `AI_RUN`
- `AI_STOP`
- `AI_GET_STATUS`
- `AI_LIST_MODELS`

### `AI_GET_STATUS`

`AI_GET_STATUS` 目前只能反映 main process 看到的 active task 數量。

由於真正 pending workflow queue 在 renderer，這裡的：

- `activeTasks`
- `running`
- `queueLength`

都不是完整的 workflow 視角；特別是 `queueLength` 現在固定是 `0`。

### `AI_RUN`

每次 `runAi()` 都會：

1. 建立新的 `AbortController`
2. 建立新的 `AiPipeline`
3. `pipeline.init()` 檢查 Ollama 是否可用
4. `pipeline.process()` 執行單一 AI task
5. 用 IPC event 推送 progress / result / error
6. 同時把 result 作為 `invoke()` 的回傳值 resolve 回 renderer

也就是說，現在 renderer 端會同時收到：

- `runAi()` 的 promise result
- `onAiProgress` / `onAiResult` / `onAiError` 事件

### `AI_STOP`

`AI_STOP` 透過 `taskId -> AbortController` map 做取消。

取消是 step-level 的，不是直接取消整條 workflow。
renderer 端會把目前 step 的 execution task id 傳進來，例如：

```text
<workflowId>:correct
<workflowId>:translate
<workflowId>:summary
```

## `AiPipeline` 的責任

`apps/desktop/electron/main/ai/AiPipeline.ts` 是單一 AI task 的執行器。

它的責任包括：

- 檢查 task 是否啟用
- 根據 context window / chunk size 決定是否切 chunk
- 建立 prompt
- 呼叫 Ollama
- 發 progress
- 做 timeout / abort 處理
- 聚合 chunk 結果

### Chunking

Pipeline 會根據：

- `chunkSize`
- `contextWindow`
- `outputTokenBudget`
- `batchMode`

決定文字是否要拆段。

目前設計上：

- `translate` / `correct` 可以 chunk
- `summary` 在 renderer 端目前會以 `batchMode: false` 呼叫

`AiPipeline` 內也會在 chunk 之間帶前文 context，避免 correction / translation 在段落切分後完全失去連續性。

### Prompt 建立

`apps/desktop/electron/main/ai/prompts.ts` 提供兩種 prompt 來源：

- 內建預設 prompt
- 使用者自訂 prompt template

目前 prompt template 支援的 placeholder 包含：

- `{text}`
- `{targetLang}`
- `{lang}`

### Ollama client

`apps/desktop/electron/main/ai/OllamaClient.ts` 目前是非常薄的一層：

- `checkOllama()` -> `/api/tags`
- `listModels()` -> `/api/tags`
- `chat()` -> `/api/generate`

目前沒有做：

- streaming generation
- retry
- richer error mapping
- server-side queueing

## 結果如何回到 UI

AI 結果最後會分成兩條路更新：

### 1. 更新 `aiStore.workflows`

`aiStore` 會在：

- `handleProgressEvent()`
- `handleResultEvent()`

更新 workflow step 狀態與 workflow progress。

但它不負責把 step 的文字結果寫進 `workflow.results`，也不負責更新串接用的 `currentText`。

這份狀態主要給 `AiPanel.vue` 顯示，用來看 workflow 細節。

### 2. 更新 queue item

`aiStore` 透過 `notifyAiQueued/Progress/Completed/Failed()` 回寫 queue store。

queue store 會更新：

- `item.aiProgress`
- `item.aiCurrentStep`
- `item.aiError`
- `item.aiResults`
- `item.status`
- `item.message`

這份狀態主要給 queue UI 顯示，用來看整體任務進度。

換句話說，現在 result 的責任其實被拆成兩半：

- IPC event listener 更新 step status / workflow progress
- `runWorkflow()` 中 `await runAi()` 的回傳值更新 `workflow.results` / `currentText` / queue 完成狀態

## 目前的持久化行為

目前 AI post-processing 的正式結果 **沒有獨立落地成檔案**。

已落地的只有：

- transcription 原始輸出
- output format 轉換後的檔案

AI 結果目前只存在：

- `aiStore.workflows`
- `queueStore.items[].aiResults`

也就是說它們目前偏向 session-memory 結果，而不是正式 artifact。

## 目前的狀態模型

Queue task 狀態：

- `pending`
- `downloading`
- `converting`
- `transcribing`
- `ai`
- `done`
- `error`

AI workflow 狀態：

- `pending`
- `running`
- `done`
- `error`

AI step 狀態：

- `pending`
- `running`
- `done`
- `error`
- `skipped`

這代表目前其實存在兩套狀態視角：

- queue item 的 user-facing job status
- AI workflow 的 internal step status

## 當前架構的關鍵特徵

### 1. AI 是 transcription 後的附加階段

AI 不是 transcription pipeline 的內建一部分，而是 transcription 完成後追加的 workflow。

### 2. Orchestration 主要在 renderer

真正決定 workflow 順序、步驟串接、併發數的是 `aiStore`，不是 main process。

### 3. Main process 主要負責單一 AI task execution

main process 的 `AiPipeline` 負責單一 task 的 chunking / prompt / Ollama call，不負責整條 workflow 排程。

### 4. Queue 與 AI 是透過 bridge 耦合

queue store 不直接依賴 `aiStore` 的實作細節，而是透過 `aiWorkflowCoordinator` 溝通。

### 5. 現在是「雙軌回傳」

每個 AI step 的結果同時透過：

- `ipcRenderer.invoke()` 回傳值
- IPC event stream

回到 renderer。

## 目前已知的 review points

以下是依照目前實作整理出的 review 重點，不是新的設計提案：

### 1. Summary 對長文本的保護不足

目前 summary 是用 `batchMode: false` 呼叫，容易直接吃整段長文本。

### 2. AI 結果目前偏向 UI/session state

AI 輸出沒有正式落地成 artifact，重啟 app 後不保證保留。

### 3. AI failure 會把整個 queue item 打成失敗

即使 transcription 已完成，只要 AI step 出錯，整個任務仍會進入 `error`。

### 4. Main process 沒有真正的 global AI queue

`AiPipeline` 雖有 concurrency / slot queue，但 `AI_RUN` 每次都建立新 instance，實際的 workflow queue 仍在 renderer。

### 5. 狀態更新存在雙寫風格

renderer 一邊等 `runAi()` return，一邊也聽 `onAiResult/onAiError` 事件，狀態來源有重疊。

## 建議 review 時優先看什麼

如果要 review 這套架構，建議先聚焦這幾題：

1. AI 結果是否應該成為正式輸出檔？
2. AI failure 是否應該讓整個 queue item fail？
3. workflow orchestration 應該留在 renderer，還是收回 main process？
4. summary 長文本是否需要和 correct / translate 一樣走 chunking 策略？
5. `invoke + event stream` 雙軌回傳是否值得收斂成單一模式？

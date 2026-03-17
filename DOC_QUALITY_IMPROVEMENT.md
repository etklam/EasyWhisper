# 文档和代码质量提升计划

> 2026-03-17 | 基于可维护性 Review 的改进建议
> 目标：提升代码质量和文档覆盖率

---

## 📊 当前状态

```
测试覆盖率：100% (187/187)
可维护性评分：8.9/10 (优秀)
功能完成度：100% (Phase 1, 2, 3)
技术债：已清零
```

---

## 🎯 改进目标

### 短期（1-2 小时）

**优先级 P0（立即执行）：**

1. **为公共 API 添加 JSDoc 注释**
   - AI 模块的公共函数
   - Core 功能的公共接口
   - 工具函数的说明

2. **创建 API 文档**
   - 生成 TypeScript API 文档
   - 添加使用示例
   - 添加架构图

**预期成果：**
- 所有公共 API 有 JSDoc 注释
- 自动生成的 API 文档
- 更好的 IDE 自动完成支持

---

### 中期（2-3 小时）

**优先级 P1（Phase 4 之前）：**

3. **统一错误处理系统**
   - 创建 `AppError` 类
   - 定义错误码枚举
   - 更新所有模块使用新错误处理

4. **统一事件系统**
   - 创建 `AppEventEmitter` 单例
   - 定义事件命名规范
   - 添加日志记录

5. **添加日志系统**
   - 创建 `Logger` 类
   - 支持不同日志级别
   - 支持日志输出到文件

**预期成果：**
- 一致的错误类型和处理
- 统一的事件命名和追踪
- 结构化日志和日志级别控制

---

## 📋 详细任务列表

### 任务 1：JSDoc 注释

**AI 模块：**
- [ ] `checkOllama()` - 检查 Ollama 是否运行
- [ ] `listModels()` - 列出可用模型
- [ ] `chat()` - 执行 chat API 调用
- [ ] `getPrompt()` - 取得模板
- [ ] `AiPipeline.init()` - 初始化 Pipeline
- [ ] `AiPipeline.process()` - 处理 AI 任务
- [ ] `updateSettings()` - 更新配置

**Core 功能：**
- [ ] `AudioProcessor.convertToWav()` - 转換為 16kHz WAV
- [ ] `YtDlpDownloader.downloadAudio()` - 下載音訊
- [ ] `BatchQueue.addFiles()` - 添加文件到佇列
- [ ] `BatchQueue.start()` - 開始處理佇列
- [ ] `SettingsManager.getSettings()` - 獲取設定
- [ ] `SettingsManager.updateSettings()` - 更新設定

**工具函式：**
- [ ] `normalizeText()` - 正規化文本
- [ ] `getExtension()` - 獲取副檔名
- [ ] `formatSrtTimecode()` - 格式化 SRT 時間碼

---

### 任务 2：API 文檔

**模塊文檔：**
- [ ] `docs/modules/AI.md` - AI 模組文檔
- [ ] `docs/modules/AudioProcessor.md` - 音訊處理文檔
- [ ] `docs/modules/BatchQueue.md` - 批次佇列文檔
- [ ] `docs/modules/YtDlpDownloader.md` - YouTube 下載文檔
- [ ] `docs/modules/SettingsManager.md` - 設定管理文檔
- [ ] `docs/modules/OutputFormatter.md` - 輸出格式文檔

**架構文檔：**
- [ ] `docs/architecture/overview.md` - 架構概覽
- [ ] `docs/architecture/data-flow.md` - 數據流
- [ ] `docs/architecture/async-communication.md` - 異步通訊

**API 文檔：**
- [ ] `docs/api/ai.md` - AI API 文檔
- [ ] `docs/api/audio.md` - 音訊處理 API
- [ ] `docs/api/queue.md` - 佇列 API
- [ ] `docs/api/settings.md` - 設定 API

---

### 任务 3：统一错误处理

**创建错误系统：**
- [ ] `electron/main/errors/AppError.ts` - 錯誤類
- [ ] `electron/main/errors/errorCodes.ts` - 錯誤碼枚舉
- [ ] `electron/main/errors/errorUtils.ts` - 錯誤處理工具

**更新模塊：**
- [ ] `AudioProcessor` - 使用 AppError
- [ ] `YtDlpDownloader` - 使用 AppError
- [ ] `BatchQueue` - 使用 AppError
- [ ] `SettingsManager` - 使用 AppError
- [ ] `AiPipeline` - 使用 AppError

---

### 任务 4：统一事件系统

**创建事件系统：**
- [ ] `electron/main/events/EventEmitter.ts` - 事件發射器單例
- [ ] `electron/main/events/eventTypes.ts` - 事件類型定義
- [ ] `electron/main/events/eventLogger.ts` - 事件日誌記錄

**更新模塊：**
- [ ] `BatchQueue` - 使用新事件系統
- [ ] `SettingsManager` - 使用新事件系統
- [ ] `AiPipeline` - 使用新事件系統

---

### 任务 5：添加日志系统

**創建日誌系統：**
- [ ] `electron/main/utils/logger.ts` - Logger 類
- [ ] `electron/main/utils/logLevels.ts` - 日誌級別定義
- [ ] `electron/main/utils/fileLogger.ts` - 文件日誌

**配置日誌：**
- [ ] `electron/main/utils/logger.config.ts` - 日誌配置
- [ ] `electron/main/index.ts` - 初始化日誌系統
- [ ] `electron/vite.config.ts` - 瀏試時的日誌配置

---

## 🎯 執行計劃

### 階段 1：JSDoc 注释（45-60 分钟）

**任務：**
1. 為 AI 模塊的所有公共 API 添加 JSDoc
2. 為 Core 功能的所有公共接口添加 JSDoc
3. 為工具函式添加 JSDoc

**驗證：**
```bash
npx jsdoc apps/desktop/electron/main --destination docs/api
```

---

### 階段 2：API 文档生成（30-45 分钟）

**任務：**
1. 創建模塊文檔結構
2. 編寫模塊概覽文檔
3. 編寫 API 使用示例
4. 生成架構圖

**驗證：**
```bash
ls -la docs/api/
ls -la docs/modules/
ls -la docs/architecture/
```

---

### 階段 3：统一错误处理（1-2 小时）

**任務：**
1. 创建错误类和错误码系统
2. 更新 AudioProcessor 使用新错误处理
3. 更新 YtDlpDownloader 使用新错误处理
4. 更新 BatchQueue 使用新错误处理
5. 更新 SettingsManager 使用新错误处理
6. 更新 AiPipeline 使用新错误处理

**驗證：**
```bash
pnpm test:run
# 确保所有测试仍然通过
```

---

### 階段 4：统一事件系统（1-2 小时）

**任務：**
1. 创建 AppEventEmitter 单例
2. 定义事件命名规范
3. 添加日志记录功能
4. 更新 BatchQueue 使用新事件系统
5. 更新 SettingsManager 使用新事件系统
6. 更新 AiPipeline 使用新事件系统

**驗證：**
```bash
pnpm test:run
# 确保所有测试仍然通过
```

---

### 階段 5：添加日志系统（45-60 分钟）

**任務：**
1. 创建 Logger 类
2. 支持不同日志级别（debug, info, warn, error）
3. 支持日志输出到文件
4. 配置日志系统
5. 初始化全局 logger

**驗證：**
```bash
pnpm dev
# 确保日志正常输出
```

---

## 📊 預期成果

### 文档改進

- ✅ 所有公共 API 有 JSDoc 注释
- ✅ 完整的 API 文檔
- ✅ 模塊架構文檔
- ✅ 使用示例和教程

### 代碼質量改進

- ✅ 統一的錯誤處理系統
- ✅ 統一的事件系統
- ✅ 結構化的日誌系統
- ✅ 更好的調試體驗

### 可維護性提升

- ✅ 更好的 IDE 自動完成
- ✅ 更容易追蹤問題
- ✅ 更容易添加新功能
- ✅ 更容易代碼審查

---

## 🎯 成功標準

### 短期標準（1-2 小时）

- [ ] 90% 公共 API 有 JSDoc 注释
- [ ] 完整的模塊文檔結構
- [ ] 所有测试通过

### 中期標準（4-6 小时）

- [ ] 100% 公共 API 有 JSDoc 注释
- [ ] 完整的 API 文檔（auto-generated）
- [ ] 完整的架構文檔
- [ ] 統一的錯誤處理系統
- [ ] 統一的事件系統
- [ ] 完整的日誌系統
- [ ] 所有测试通过

---

**下一步：** 开始執行階段 1（JSDoc 注释）

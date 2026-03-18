# 更新日志

## [0.1.0] - 2026-03-18

### 🎉 重大发布：Phase 1-3 完成 + AI 整合 + Mac 版本可用

---

## ✅ 新增功能

### Phase 1 - Mac 基础建设
- ✅ **whisper.cpp + Metal 整合**
  - 自动下载和编译 whisper.cpp（Metal 版）
  - GPU 加速支持（Apple Silicon）
  - 模型管理（Base/Small/Medium/Large v3）

- ✅ **模型管理系统**
  - 一键下载模型
  - 下载进度跟踪
  - 模型状态显示

- ✅ **音频前处理**
  - 支持多种音频格式（MP3/WAV/M4A/FLAC）
  - 支持视频格式（MP4/MOV/MKV）
  - 自动转换为 16kHz mono WAV
  - 缓存机制避免重复处理

### Phase 2 - Core 功能实现
- ✅ **批次处理队列**
  - 支持多任务并发
  - 暂停/恢复/取消
  - 错误重试机制
  - 进度实时显示

- ✅ **文件拖放**
  - 支持拖放多个音频/视频文件
  - 自动识别文件类型
  - 拖放状态反馈

- ✅ **yt-dlp 集成**
  - 支持从 URL 下载音频
  - 批量 URL 导入
  - 下载进度跟踪
  - 支持自定义格式

- ✅ **输出格式化**
  - 支持 TXT（纯文本）
  - 支持 SRT（字幕）
  - 支持 VTT（WebVTT）
  - 支持 JSON（完整结构）

### Phase 3 - AI 整合
- ✅ **Ollama 集成**
  - 自动检测 Ollama 状态
  - 模型列表管理
  - 一键刷新模型

- ✅ **AI 修正**
  - 修正转录中的错别字
  - 改善语法
  - 自定义 Prompt 支持

- ✅ **AI 翻译**
  - 支持多种目标语言
  - 繁体中文、简体中文、英文等
  - 使用修正后的文本进行翻译
  - 批量翻译支持

- ✅ **AI 摘要**
  - 自动生成内容摘要
  - 关键点提取
  - 支持长文本分段处理

- ✅ **AI 工作流**
  - 自动编排修正→翻译→摘要流程
  - 上下文传递（使用前一步的输出）
  - 双队列设计（Whisper + AI）
  - 任务取消支持

---

## 🔧 改进

### 架构优化
- ✅ **Coordinator 模式**
  - 解耦 queue 和 ai stores
  - 事件驱动通信
  - 更清晰的职责分离

- ✅ **统一格式常量**
  - 移除重复定义
  - 统一从 `@shared/formats` 导入
  - 更好的类型安全

### 性能优化
- ✅ **Token 估算优化**
  - 支持 CJK 字符（1 字 = 1 token）
  - 拉丁字符优化（1 word ≈ 1/4 token）
  - 更准确的分段

- ✅ **长文分段处理**
  - 段落优先分段
  - 智能边界检测
  - 上下文传递（前 2-3 句）
  - 动态上下文窗口计算

### 错误处理
- ✅ **AI 任务取消**
  - AbortController 支持
  - 真正中断 Ollama 请求
  - 资源清理

- ✅ **Timeout 清理**
  - 防止内存泄漏
  - 正确清理定时器

### 测试
- ✅ **新增 204 个测试**
  - AI 工作流测试
  - 上下文传递测试
  - IPC handlers 测试
  - 组件测试

---

## 🐛 修复

### 关键修复
- ✅ 修复 `AiPipeline` 分段上限问题
- ✅ 修复 timeout 清理问题
- ✅ 修复未使用代码/导入
- ✅ 修复构建路径问题（`index.html`）
- ✅ 修复类型约束宽松问题

### 高优先级技术债务
- ✅ AI 任务取消功能未实现 → 已实现
- ✅ Store 循环依赖 → Coordinator 架构设计

---

## 📦 新增文件

### 核心模块
- `apps/desktop/electron/main/ipc/audioHandlers.ts`
- `apps/desktop/electron/main/ipc/modelHandlers.ts`
- `apps/desktop/electron/main/ipc/outputHandlers.ts`
- `apps/desktop/electron/main/ipc/ytdlpHandlers.ts`
- `packages/shared/src/formats.ts`
- `packages/shared/src/url.ts`

### 前端
- `apps/desktop/src/stores/ai.ts`
- `apps/desktop/src/stores/aiWorkflowCoordinator.ts`
- `apps/desktop/src/stores/queue.ts`
- `apps/desktop/src/components/AiPanel.vue`
- `apps/desktop/src/components/ModelSelector.vue`
- `apps/desktop/src/components/QueueItem.vue`
- `apps/desktop/src/components/QueueTable.vue`
- `apps/desktop/src/components/UrlInput.vue`

### 文档
- `PHASE3_COMPLETE.md`
- `PHASE3_TECH_DEBT.md`
- `PHASE3_TECH_DEBT_SUMMARY.md`
- `HIGH_PRIORITY_FIXED.md`
- `PROJECT_STATUS.md`
- `TECH_DEBT_CLEANED.md`

---

## 📊 统计

### 代码量
- 总文件数：100+
- 总代码行数：~5,000+
- 测试文件数：17
- 测试用例数：204
- IPC Channels：25+
- TypeScript 类型：70+

### 完成度
| Phase | 状态 | 完成度 |
|-------|------|--------|
| Phase 1 - Mac 基础建设 | ✅ 完成 | 100% |
| Phase 2 - Core 功能实现 | ✅ 完成 | 100% |
| Phase 3 - AI 整合 | ✅ 完成 | 100% |
| 技术债务清理 | ✅ 完成 | 100% |
| **Phase 1-3 累计** | **✅ 完成** | **~60%** |

---

## 🚀 下一步

### Phase 4 - Windows 移植
- const-me/Whisper COM 接口集成
- Windows 平台检测
- GPU 加速支持（DirectCompute）
- 构建脚本适配
- 测试和调试

### Phase 5 - 打包和发布
- macOS DMG 打包
- Windows MSI/EXE 打包
- 代码签名
- 自动更新
- 发布到 GitHub Releases

---

## 🙏 致谢

- [whisper.cpp](https://github.com/ggml-org/whisper.cpp) - 开源 Whisper 引擎
- [Ollama](https://ollama.com/) - 本地 AI 模型运行时
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) - 视频下载工具
- [Electron](https://www.electronjs.org/) - 跨平台桌面应用框架
- [Vue 3](https://vuejs.org/) - 渐进式 JavaScript 框架
- [Naive UI](https://www.naiveui.com/) - Vue 3 组件库
- [Pinia](https://pinia.vuejs.org/) - Vue 3 状态管理

---

**发布日期：** 2026-03-18
**版本：** 0.1.0
**状态：** Mac 版本可用 ✅

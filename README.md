# FOSSWhisper 🤖🔊

> 本地 Whisper 转录工作台，支持 AI 后处理和多格式输出

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen)](https://github.com/)
[![Tests](https://img.shields.io/badge/tests-204%20passing-brightgreen)](https://github.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-100%25-brightblue)](https://www.typescriptlang.org/)
[![Vue 3](https://img.shields.io/badge/Vue-3.x-brightgreen)](https://vuejs.org/)
[![Electron](https://img.shields.io/badge/Electron-Latest-brightgreen)](https://www.electronjs.org/)

**FOSSWhisper** 是一个跨平台的 Whisper 转录工具，使用 whisper.cpp 作为引擎，支持本地 GPU 加速（Mac Metal / Windows DirectCompute），并提供 AI 后处理功能。

---

## ✨ 特性

### 🎯 核心功能
- ✅ **本地 Whisper 转录**
  - whisper.cpp 引擎
  - Mac Metal GPU 加速（Apple Silicon）
  - 多种模型支持（Base/Small/Medium/Large v3）

- ✅ **批次处理**
  - 支持多个任务并发
  - 暂停/恢复/取消
  - 进度实时显示
  - 错误重试机制

- ✅ **文件导入**
  - 拖放音频/视频文件
  - 支持 MP3/WAV/M4A/FLAC（音频）
  - 支持 MP4/MOV/MKV（视频）
  - 批量 URL 导入（yt-dlp）

- ✅ **音频处理**
  - 自动转换为 16kHz mono WAV
  - 缓存机制避免重复处理
  - 支持多种输出格式

### 🤖 AI 功能
- ✅ **Ollama 集成**
  - 自动检测 Ollama 状态
  - 模型列表管理
  - 一键刷新模型

- ✅ **AI 修正**
  - 修正转录中的错别字
  - 改善语法
  - 自定义 Prompt 支持

- ✅ **AI 翻译**
  - 支持多种目标语言（繁体中文、简体中文、英文等）
  - 使用修正后的文本进行翻译
  - 批量翻译支持

- ✅ **AI 摘要**
  - 自动生成内容摘要
  - 关键点提取
  - 支持长文本分段处理

### 🎨 用户界面
- ✅ **现代化 UI**
  - Vue 3 + Naive UI
  - 响应式设计
  - 中文界面

- ✅ **实时反馈**
  - 进度条显示
  - 状态标签
  - 错误提示

---

## 📦 技术栈

### 前端
- **框架**：Electron 27+
- **UI**：Vue 3 + TypeScript
- **组件库**：Naive UI
- **状态管理**：Pinia
- **构建工具**：Vite 6

### 后端
- **运行时**：Node.js 22+
- **转录引擎**：whisper.cpp（Metal 版）
- **音频处理**：ffmpeg
- **AI 引擎**：Ollama
- **视频下载**：yt-dlp

---

## 🚀 快速开始

### 安装依赖
```bash
pnpm install
```

### 开发模式
```bash
pnpm -r dev
```

### 构建
```bash
pnpm -r build
```

---

## 📊 项目状态

| Phase | 状态 | 完成度 |
|-------|------|--------|
| Phase 1 - Mac 基础建设 | ✅ 完成 | 100% |
| Phase 2 - Core 功能实现 | ✅ 完成 | 100% |
| Phase 3 - AI 整合 | ✅ 完成 | 100% |
| Phase 4 - Windows 移植 | ⏳ 未开始 | 0% |
| Phase 5 - 打包和发布 | ⏳ 未开始 | 0% |

**总体完成度：** ~60%

---

## 🎯 路线图

### [v0.1.0] - 当前开发
- ✅ Mac 版本
- ✅ Whisper 转录
- ✅ 批次处理
- ✅ AI 整合
- ⏳ Windows 移植
- ⏳ 打包和发布

### [v0.2.0] - 计划
- Windows 版本
- Linux 版本
- 更多 AI 模型支持
- 云端同步

---

## 📚 文档

- [开发计划](./dev-plan.md)
- [项目状态](./PROJECT_STATUS.md)
- [Phase 3 完成报告](./PHASE3_COMPLETE.md)
- [技术债务清理](./TECH_DEBT_CLEANED.md)
- [更新日志](./CHANGELOG.md)

---

## 🤝 贡献

欢迎贡献！请查看 [开发计划](./dev-plan.md) 了解更多信息。

---

## 📄 许可证

MIT

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

**版本：** 0.1.0
**最后更新：** 2026-03-18
**状态：** Mac 版本可用 ✅

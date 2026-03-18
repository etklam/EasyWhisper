# Phase 3 技术债务清理报告

> 2026-03-18 | Phase 3 AI 整合后的代码 review

---

## 📋 执行摘要

**Phase 3 状态：** ✅ 已完成
**Review 范围：** AI 相关模块
**修复状态：** 4/9 项已修复
**测试状态：** ✅ 204 个测试全部通过
**类型检查：** ✅ 通过（包括 `--noUnusedLocals --noUnusedParameters`）

---

## 🔴 高优先级问题

### 1. ⚠️ AI 任务取消功能未实现

**问题：**
- `cancelWorkflow` 只在前端打 `cancelRequested` 标记
- 主进程的 `AI_STOP` IPC handler 是空实现
- Ollama 请求会继续跑到完成或超时
- 取消体验和资源占用都不正确

**影响文件：**
- `apps/desktop/src/stores/ai.ts` (L154)
- `apps/desktop/src/stores/queue.ts` (L218)
- `apps/desktop/electron/main/ipc/ai.ts` (L59)

**状态：** ⚠️ 未修复

**建议修复方案：**
1. 在主进程维护任务注册表
2. `AI_STOP` 调用 `AbortController` 中断 `fetch/chat`
3. 前端取消时同步 invoke 停止

**预估修复时间：** 3-5 小时

---

### 2. ✅ 长文本分段上限和上下文窗口不一致

**问题：**
- 长文本批处理的分段上限和上下文窗口曾不一致
- 可能把 chunk 切到超过可用上下文
- 导致模型上下文溢出或无谓失败

**影响文件：**
- `apps/desktop/electron/main/ai/AiPipeline.ts` (L97)

**修复方案：**
```typescript
// 修复前
const availableContextWindow = Math.max(
  1,
  (task.chunkSize ?? this.options.contextWindow) - this.options.outputTokenBudget
)

// 修复后
const availableContextWindow = Math.max(1, this.options.contextWindow - this.options.outputTokenBudget)
const effectiveChunkSize =
  task.batchMode === false
    ? task.chunkSize ?? this.options.chunkSize
    : Math.min(task.chunkSize ?? this.options.chunkSize, availableContextWindow)
```

**状态：** ✅ 已修复

**新增回归测试：**
```typescript
it('should cap chunk size to available context window in batch mode', async () => {
  const longParagraph = 'word '.repeat(3000)
  await pipeline.process({
    id: 'task-123',
    text: longParagraph,
    taskType: 'translate',
    targetLang: 'zh-TW',
    batchMode: true,
    onResult
  })
  expect(mockChat.mock.calls.length).toBeGreaterThan(1)
})
```

---

## 🟡 中优先级问题

### 3. ⚠️ Store 循环依赖

**问题：**
- `ai store` 依赖 `queue store`
- `queue store` 依赖 `ai store`
- 职责已经耦合到互相调度、互相改状态
- 后续很容易出现初始化/HMR/测试隔离问题

**影响文件：**
- `apps/desktop/src/stores/ai.ts` (L10)
- `apps/desktop/src/stores/queue.ts` (L4)

**状态：** ⚠️ 未修复

**建议修复方案：**

**方案 A（推荐）：**
- 抽一个 `aiWorkflowCoordinator` 或 service 层统一编排
- stores 只管状态
- 去掉直接互调

**方案 B：**
- 保留双 store
- 改成事件/回调接口
- 至少去掉直接互调

**预估修复时间：** 2-4 小时

---

### 4. ⚠️ WhisperStore 保留旧版 AI 后处理工作流

**问题：**
- `whisper store` 保留了旧版 AI 后处理工作流
- 与 Phase 3 新链路并存
- 容易让维护者误判真实主路径
- 当前 UI 入口已经走 `queueStore`，但 `whisperStore` 里仍有旧逻辑

**影响文件：**
- `apps/desktop/src/stores/whisper.ts` (L110, L288)
- `apps/desktop/src/views/HomeView.vue` (L57)

**状态：** ⚠️ 未修复

**建议修复方案：**

**方案 A（推荐）：**
- 删除旧 AI 路径
- 把 `whisperStore` 收缩成设置/模型 store

**方案 B：**
- 保留备用模式
- 至少不要在 `HomeView` 里默认绑定这套监听器

**预估修复时间：** 3-6 小时

---

### 5. ⚠️ AI 相关重复逻辑

**问题：**
- `getEnabledAiTasks` 同时存在于 3 个文件
- 步骤标签/错误格式化也有重复
- 职责边界不够干净

**影响文件：**
- `apps/desktop/src/stores/ai.ts` (L357)
- `apps/desktop/src/stores/queue.ts` (L520)
- `apps/desktop/src/stores/whisper.ts` (L338)

**状态：** ⚠️ 未修复

**建议修复方案：**
- 抽到 `src/ai/utils.ts` 或 `src/ai/config.ts`

**预估修复时间：** 1-2 小时

---

### 6. ⚠️ AiPipeline 并发控制使用轮询

**问题：**
- `AiPipeline` 的并发控制还是 100ms 轮询等待
- 功能没错，但吞吐和延迟都比较粗糙
- 任务一多会有空转等待

**影响文件：**
- `apps/desktop/electron/main/ai/AiPipeline.ts` (L91)

**状态：** ⚠️ 未修复

**建议修复方案：**
- 换成 semaphore/queue

**预估修复时间：** 1-2 小时

---

### 7. ⚠️ 测试覆盖不均衡

**问题：**
- `AiPipeline`/prompt 测得很多
- 但前端 `ai store`、`AiPanel`、`ipc/ai` 没有对应专门测试文件
- `packages/shared` 的类型测试也没有覆盖 `AiRunResult/AiStatusResponse` 判别联合

**影响文件：**
- `apps/desktop/electron/__tests__/ai/AiPipeline.test.ts`
- `apps/desktop/electron/__tests__/ai/prompts.test.ts`
- `packages/shared/src/__tests__/types.test.ts` (L161)

**状态：** ⚠️ 未修复

**建议修复方案：**
- 新增 store/component/ipc 三层测试

**预估修复时间：** 3-5 小时

---

### 8. ⚠️ WhisperStore 测试已脱节

**问题：**
- 现有 `whisperStore` 测试已经和 Phase 3 主链路脱节
- 很多断言是手动改 store 状态
- 不是真正触发监听器或 AI 流程

**影响文件：**
- `apps/desktop/src/__tests__/stores/whisper.test.ts` (L147)

**状态：** ⚠️ 未修复

**建议修复方案：**
- 把这些测试迁到 `queue + ai store` 集成流

**预估修复时间：** 2-3 小时

---

## 🟢 低优先级问题

### 9. ✅ AiPanel 状态函数类型约束宽松

**问题：**
- `AiPanel` 的状态辅助函数用裸 `string`
- 类型约束偏松

**影响文件：**
- `apps/desktop/src/components/AiPanel.vue` (L239)

**修复方案：**
```typescript
// 修复前
function getWorkflowStatusLabel(status: string): string

// 修复后
function getWorkflowStatusLabel(status: AiWorkflowStatus): string
function getWorkflowTagType(status: AiWorkflowStatus): ...
function getStepTagType(status: AiStepStatus): ...
```

**状态：** ✅ 已修复

---

### 10. ✅ 未使用代码/导入

**问题：**
- 前端队列中有未使用函数
- 测试里有未使用导入

**影响文件：**
- `apps/desktop/src/stores/queue.ts`
- `apps/desktop/electron/__tests__/ai/AiPipeline.test.ts` (L1)
- `apps/desktop/electron/__tests__/ai/prompts.test.ts` (L1)

**修复方案：**
- 删除未使用的 `summarizeAiFailure` 函数
- 删除未使用的 `DEFAULT_PROMPTS` 导入
- 删除未使用的 `beforeEach/afterEach` 导入

**状态：** ✅ 已修复

---

### 11. ✅ Timeout 清理问题

**问题：**
- `runWithTimeout` 之前没有清理定时器
- 长时间批量任务会留下无用 timeout 句柄

**影响文件：**
- `apps/desktop/electron/main/ai/AiPipeline.ts` (L307)

**修复方案：**
```typescript
// 修复前
private async runWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error('AI task timeout')), timeoutMs)
    })
  ])
}

// 修复后
private async runWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error('AI task timeout')), timeoutMs)
      })
    ])
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle)
    }
  }
}
```

**状态：** ✅ 已修复

---

## 📊 总结

### 问题统计

| 优先级 | 发现 | 已修复 | 待修复 |
|--------|------|--------|--------|
| 🔴 高 | 2 | 1 | 1 |
| 🟡 中 | 6 | 0 | 6 |
| 🟢 低 | 3 | 3 | 0 |
| **总计** | **11** | **4** | **7** |

### 修复时间估算

| 问题 | 预估时间 | 状态 |
|------|---------|------|
| AI 任务取消功能 | 3-5 小时 | ⚠️ 未修复 |
| 长文本分段上限 | 30-45 分钟 | ✅ 已修复 |
| Store 循环依赖 | 2-4 小时 | ⚠️ 未修复 |
| WhisperStore 旧工作流 | 3-6 小时 | ⚠️ 未修复 |
| AI 相关重复逻辑 | 1-2 小时 | ⚠️ 未修复 |
| AiPipeline 并发控制 | 1-2 小时 | ⚠️ 未修复 |
| 测试覆盖不均衡 | 3-5 小时 | ⚠️ 未修复 |
| WhisperStore 测试脱节 | 2-3 小时 | ⚠️ 未修复 |
| AiPanel 类型约束 | 10 分钟 | ✅ 已修复 |
| 未使用代码/导入 | 10-15 分钟 | ✅ 已修复 |
| Timeout 清理 | 10 分钟 | ✅ 已修复 |
| **总计** | **16-26 小时** | - |

---

## 🎯 发现的其他问题

### ✅ 无明显问题

- Phase 3 范围内未发现 `TODO/FIXME`
- 生产 AI 模块里没看到明显的 `any` 滥用
- 循环依赖只确认到 `queue <-> ai` 这一组

---

## 💡 下一步建议

Codex 建议：

1. **优先修复 AI 任务取消功能**
   - 更影响功能
   - 涉及资源管理

2. **然后拆掉 `queue/ai` 的循环依赖**
   - 影响架构清晰度
   - 为后续开发铺路

3. **其他中优先级问题**
   - 可以逐步修复
   - 不阻塞 Phase 4 开发

---

## 📚 验证结果

### 测试结果

```
✅ 204 个测试全部通过（新增 1 个测试）
✅ TypeScript 类型检查通过（包括 --noUnusedLocals --noUnusedParameters）
✅ 17 个测试文件全部通过
```

### 新增测试

```typescript
it('should cap chunk size to available context window in batch mode', async () => {
  // 验证长文本在 batch mode 下会被正确分段
  // 确保不会超过可用上下文窗口
})
```

---

**最后更新：** 2026-03-18
**Review 工具：** Codex
**下一步：** Phase 4 - Windows 移植（或先修复高优先级问题）

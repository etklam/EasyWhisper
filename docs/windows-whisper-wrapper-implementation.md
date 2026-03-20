# Windows Whisper Wrapper Implementation

这份文档面向接下来在有 `.NET SDK` 的 Windows 机器上继续开发 `Const-me/Whisper` wrapper 的实现工作。

相关背景文档：

- [windows-whisper-runtime.md](/Users/klam/Desktop/project/FOSSWhisper/docs/windows-whisper-runtime.md)

## 当前仓库状态

截至当前提交，Electron 侧已经具备以下前置条件：

- Windows Whisper runtime 走独立 wrapper 路线，不再把 Windows 后端硬绑到 `WhisperMac`
- Electron main process 已经按平台分发 runtime
- Windows runtime 会优先从打包产物中的 `resources/win/` 查找：
  - `WhisperCLI.exe`
  - `whisper.dll`
- 打包配置已经会把 `apps/desktop/resources/win/` 和 `apps/desktop/resources/versions.json` 带进 Windows 安装产物
- 已存在 staging 脚本：
  - `pnpm stage:win:whisper --source <dir> --version <ver>`

当前还没有完成的部分是：真实 `WhisperCLI.exe` 和 `whisper.dll` 的 Windows 实现与发布产物。

## Electron 侧集成点

你在 Windows 机上做 wrapper 时，需要对齐当前 Electron 侧的这些文件：

- [WhisperWindows.ts](/Users/klam/Desktop/project/FOSSWhisper/apps/desktop/electron/main/whisper/WhisperWindows.ts)
- [runtime.ts](/Users/klam/Desktop/project/FOSSWhisper/apps/desktop/electron/main/whisper/runtime.ts)
- [windows-whisper-runtime.md](/Users/klam/Desktop/project/FOSSWhisper/docs/windows-whisper-runtime.md)
- [stage_windows_whisper_runtime.mjs](/Users/klam/Desktop/project/FOSSWhisper/apps/desktop/scripts/stage_windows_whisper_runtime.mjs)

关键行为：

- Electron 调用 `WhisperCLI.exe`
- 通过命令行参数传入输入音频、模型路径、输出路径、线程数、语言和可选 DLL 路径
- wrapper 成功后必须写出 JSON 结果文件
- wrapper 运行时应尽量输出可解析的进度信息

## 建议的 Windows 工程结构

建议新建一个独立目录，例如：

```text
windows/
  WhisperCLI/
    WhisperCLI.sln
    WhisperCLI/
      WhisperCLI.csproj
      Program.cs
      CliOptions.cs
      ProgressEvent.cs
      IWhisperRunner.cs
      MockWhisperRunner.cs
      ConstMeWhisperRunner.cs
      OutputWriter.cs
```

如果后续需要把 COM / PInvoke 细节隔离，可以拆成两层：

```text
windows/
  WhisperCLI/
    WhisperCLI/                 # CLI entry
    WhisperInterop/             # COM / PInvoke bridge
```

## 推荐技术路线

优先推荐：

1. 用 `.NET 8` 建一个 `console` 工程
2. 先把 CLI 参数解析、输出 JSON、progress 输出做对
3. 再把 `Const-me/Whisper` 的调用封装到独立 runner
4. 最后做 `publish` 产物并接回 staging 脚本

原因：

- Electron 侧现在已经稳定依赖“独立 exe + 结果 JSON + stdout progress”的模式
- 先稳定 wrapper contract，比一开始就把 COM 绑定做到很深更稳
- 真实调用失败时，wrapper 仍然可以用明确退出码和错误信息向 Electron 反馈

## Wrapper CLI Contract

当前 Electron 默认按下面的参数协议调用：

```text
WhisperCLI.exe
  --model <path>
  --input <path>
  --output <path>
  --language <auto|lang>
  --threads <n>
  --compute auto
  --dll <path>
```

### 参数语义

- `--model`: whisper 模型文件路径
- `--input`: 输入音频路径
- `--output`: 输出 JSON 文件路径
- `--language`: `auto` 或明确语言代码
- `--threads`: CPU 线程数
- `--compute`: 预留字段，当前 Electron 传 `auto`
- `--dll`: 可选，显式指定 `whisper.dll` 路径

### 成功输出

wrapper 成功时必须写出一个 JSON 文件到 `--output`，至少包含：

```json
{
  "text": "transcribed text"
}
```

建议尽量对齐现有桌面输出结构，后续可扩展为：

```json
{
  "text": "transcribed text",
  "language": "en",
  "durationMs": 12345,
  "segments": [
    {
      "start": 0,
      "end": 1200,
      "text": "hello world"
    }
  ]
}
```

即使暂时没有 segment，`text` 也必须可靠输出。

### 进度输出

stdout 最好输出 JSON line：

```json
{"type":"progress","progress":42,"stage":"transcribing","message":"running"}
```

字段建议：

- `type`: 固定为 `progress`
- `progress`: `0-100`
- `stage`: `preparing | transcribing | finalizing`
- `message`: 可读文本

Electron 当前也支持退化解析纯文本中的百分比，例如：

```text
42%
```

但建议优先使用 JSON line。

### 错误处理

建议约定以下退出码：

- `0`: 成功
- `2`: 参数错误
- `3`: runtime 未初始化或 DLL 加载失败
- `4`: 转录执行失败
- `5`: 输出写入失败

stderr 应输出一行明确错误，便于 Electron 拼接成用户可见错误信息。

## 建议的实现阶段

### Phase 1

先做“可运行但不接真实 `Const-me`”的 wrapper：

- 参数解析
- 文件存在性校验
- mock 模式
- 输出 JSON
- stdout progress JSON line

目标：

- 在 Windows 上能独立运行
- 可以先让 Electron 全链路接通

建议加一个环境变量：

```text
FOSSWHISPER_WINDOWS_WRAPPER_MOCK=1
```

这样可以在真实 interop 完成前先验证打包与调用链。

### Phase 2

接 `Const-me/Whisper`：

- 决定是 COM、PInvoke，还是 wrapper 内部再调现成 API
- 把 GPU / DirectCompute 初始化逻辑封装在 runner 层
- 增加 CPU fallback
- 确认语言参数映射方式

### Phase 3

补生产化：

- 结构化错误码
- 更细的 progress
- 版本信息输出
- publish 脚本
- 与仓库 staging 脚本联调

## Build / Publish 建议

建议 Windows 侧最终产出一个可直接 staging 的目录，例如：

```text
artifacts/
  WhisperCLI.exe
  whisper.dll
  other-required-runtime-files...
```

然后在仓库根目录执行：

```bash
pnpm stage:win:whisper --source C:\path\to\artifacts --version 1.0.0
pnpm package:win
```

如果 `Const-me/Whisper` 还有额外依赖 DLL，建议一起放进 `resources/win/`，并补到 `versions.json` 或单独列一个 manifest。

## 与现有打包脚本的关系

当前仓库已有两段和 Windows wrapper 强相关的流程：

1. `pnpm stage:win:whisper`
   作用：
   - 复制 `WhisperCLI.exe`
   - 复制 `whisper.dll`
   - 更新 `apps/desktop/resources/versions.json`

2. `pnpm package:win` / `pnpm package:win:dir`
   作用：
   - 打包 `apps/desktop/resources/win/`
   - 打包 `apps/desktop/resources/versions.json`
   - Windows 打包前清理旧的 `release/win-*` 产物，避免残留旧 runtime

所以 Windows 机上的工作重点不是改 Electron 打包，而是稳定生成 staging 所需产物。

## 建议的最小开发清单

在 Windows + .NET 机器上建议按这个顺序做：

1. 新建 `WhisperCLI` console 工程
2. 完成参数解析和输出 JSON 文件
3. 加 mock 模式并手动运行
4. 用当前 repo 的 `pnpm stage:win:whisper` 接一次
5. 回到 Electron 侧验证 `package:win:dir`
6. 再接入真实 `Const-me/Whisper`
7. 验证 GPU / CPU fallback
8. 最后跑完整 `pnpm package:win`

## 需要重点确认的技术问题

这些点建议在 Windows 机上尽早确认，不要拖到最后：

- `Const-me/Whisper` 最稳定的调用方式是 COM 还是 PInvoke
- 是否必须同目录放置额外 DLL
- DirectCompute 初始化失败时的 fallback 行为
- 语言参数是否支持 `auto`
- 输出 segment 数据的结构是否容易取得
- `whisper.dll` 的 license / redistribution 约束

## 建议的提交拆分

为了后续 review 清晰，建议拆成 3 笔左右：

1. `feat(windows): scaffold WhisperCLI wrapper`
2. `feat(windows): integrate Const-me whisper runtime`
3. `feat(desktop): stage and package real windows whisper runtime`

## 交接建议

切到 Windows 机后，建议优先做一件事：

先把一个“可 publish 的 mock wrapper”做出来，并让它成功接入当前 Electron。

这样你可以先验证：

- 参数传递
- stdout progress
- JSON 输出
- staging
- Windows 打包

这些都通了以后，再把精力集中到 `Const-me/Whisper` 的 interop 细节上，风险会小很多。

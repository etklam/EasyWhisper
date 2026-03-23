# Windows Whisper CLI Integration

这份文档现在对应的是 `whisper.cpp` Vulkan CLI 集成，聚焦当前的单一 CLI 路线。

相关背景文档：

- [windows-whisper-runtime.md](./windows-whisper-runtime.md)

## 当前仓库状态

截至当前提交，Electron 侧已经具备以下前置条件：

- Windows runtime 会优先从打包产物中的 `resources/win/` 查找 `whisper-cli.exe`
- `WhisperWindows.ts` 直接调用 `whisper.cpp` CLI
- 打包配置会把 `apps/desktop/resources/win/` 和 `apps/desktop/resources/versions.json` 带进 Windows 安装产物
- 已存在 staging 脚本：
  - `pnpm stage:win:whisper --source <dir> --version <ver>`
- staging 结果会额外写出 `apps/desktop/resources/win/runtime-manifest.json`，记录受管理的 runtime 文件

当前还没有完成的部分是：在真实 Windows Vulkan 机器上完成 build、验证运行，并补齐可能的额外 runtime 依赖。

## Electron 侧集成点

需要对齐的关键文件：

- `apps/desktop/electron/main/whisper/WhisperWindows.ts`
- `apps/desktop/electron/main/whisper/runtime.ts`
- `apps/desktop/scripts/stage_windows_whisper_runtime.mjs`
- `apps/desktop/resources/win/README.md`
- `apps/desktop/resources/versions.json`

关键行为：

- Electron 调用 `whisper-cli.exe`
- 通过命令行参数传入模型、音频、语言、输出前缀与线程数
- CLI 成功后必须写出 JSON 结果文件
- Electron 从 `stderr` 百分比文本解析转录进度

## CLI Contract

当前 Electron 默认按下面的参数协议调用：

```text
whisper-cli.exe
  -m <model-path>
  -f <audio-path>
  -l <auto|lang>
  --output-json
  -of <output-path-without-extension>
  -t <threads>
```

### 成功输出

CLI 成功时必须写出一个 JSON 文件到 `-of <prefix>.json`，至少包含：

```json
{
  "text": "transcribed text"
}
```

如果有 segments，也可以沿用 `whisper.cpp` 现有 JSON 结构；Electron 已会优先读 `text`，否则回退拼接 `transcription[].text`。

### 进度输出

优先接受 `whisper.cpp` 原生 `stderr` 进度，例如：

```text
whisper_full: progress = 42%
```

Electron 会解析其中的 `%` 百分比，不再依赖旧的结构化 JSON `stderr` 协议。

## Staging / Packaging 建议

建议把 Windows build 产出整理成一个目录，例如：

```text
artifacts/
  whisper-cli.exe
  <extra-runtime-files>
```

然后在仓库根目录执行：

```bash
pnpm stage:win:whisper --source C:\path\to\artifacts --version 1.7.3
pnpm package:win
```

`stage:win:whisper` 会把 `whisper-cli.exe` 和同目录中的其他当前 runtime 文件一并复制进 `apps/desktop/resources/win/`，并写出 `runtime-manifest.json`；如果 source 目录里残留旧 wrapper 产物或旧 manifest，脚本会主动忽略它们。Windows packaging preflight 会再校验 manifest 中列出的 runtime 文件都已到位，并拒绝 `resources/win/` 里任何未受管理的额外文件，这样额外依赖由 staging 统一管理。

## Windows 机器上的最小验证清单

1. 手动运行 `whisper-cli.exe`，确认 Vulkan build 能独立转录
2. 用 `pnpm stage:win:whisper` 把产物放进 repo
3. 跑 `WhisperWindows` 相关测试
4. 跑 `pnpm package:win:dir`
5. 在 packaged app 中验证一次真实转录

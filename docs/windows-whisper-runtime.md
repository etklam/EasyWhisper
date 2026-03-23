# Windows Whisper Runtime

当前 Windows 路线直接使用 `whisper.cpp` CLI，MVP 先锁定 Vulkan build。

补充说明请同时参考：

- [windows-whisper-cli-integration.md](./windows-whisper-cli-integration.md)

## 打包位置

Windows runtime 资源应放在：

- `apps/desktop/resources/win/whisper-cli.exe`
- 与同一份 build 搭配的其他 runtime 文件（如额外 DLL）可直接并排放在同目录
- `apps/desktop/resources/win/runtime-manifest.json` 由 staging script 生成，用来记录本次受管理的 runtime 文件清单

打包后会进入：

- `resources/win/whisper-cli.exe`
- `resources/win/<extra-runtime-files>`
- `resources/win/runtime-manifest.json`

## Staging

推荐用脚本将外部产物复制进仓库资源目录：

```bash
pnpm stage:win:whisper --source /path/to/whispercpp-vulkan-runtime --version 1.7.3
```

可选环境变量：

- `FOSSWHISPER_WINDOWS_WHISPER_SOURCE_DIR`
- `FOSSWHISPER_WINDOWS_WHISPER_CLI_PATH`
- `FOSSWHISPER_WINDOWS_WHISPER_VERSION`

`--source` 会复制 `whisper-cli.exe`，并把同目录中的其他当前 runtime 文件一并带进 `apps/desktop/resources/win/`。脚本同时会写出 `runtime-manifest.json`，记录受管理的 runtime 文件，让额外依赖由 staging 管理，而不是写死在应用逻辑里。

如果 source 目录里还混着旧的 wrapper 产物或旧的 `runtime-manifest.json`，staging script 会主动忽略这些文件，并按当前 CLI runtime 重新生成 manifest。

打包前的 `pnpm package:win` / `pnpm package:win:dir` preflight 会检查：

- `whisper-cli.exe` 存在
- `versions.json` 中 `whisper-cli` 记录为 `platform: win32`、`variant: vulkan`
- `runtime-manifest.json` 存在、格式正确，且其中列出的 runtime 文件都已实际 staged
- `resources/win/` 中不存在 manifest 之外的未受管理 runtime 文件

## CLI Contract

当前 Electron 侧按以下参数协议调用 `whisper-cli.exe`：

```text
-m <model-path>
-f <audio-path>
-l <auto|lang>
--output-json
-of <output-path-without-extension>
-t <threads>
```

输出约定：

- 成功时写出 JSON 文件，至少包含 `{ "text": "..." }`
- 进度从 `stderr` 的百分比文本解析，例如 `whisper_full: progress = 42%`
- 不再依赖旧的结构化 JSON `stderr` 协议、额外动态库参数或 runtime 注入环境变量

## 验收重点

- `whisper-cli.exe` 可在 Windows Vulkan 机器上独立跑通
- `pnpm stage:win:whisper` 只要求当前 Vulkan CLI runtime 所需文件
- `apps/desktop/electron/main/whisper/WhisperWindows.ts` 只解析 `whisper.cpp` CLI 契约

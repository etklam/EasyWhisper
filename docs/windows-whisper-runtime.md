# Windows Whisper Runtime

当前 Windows 路线直接使用 `whisper.cpp` CLI。Task 1 先把 Windows runtime packaging contract 收敛到单一 manifest，当前 staged runtime 仍锁定 Vulkan build。

补充说明请同时参考：

- [windows-whisper-cli-integration.md](./windows-whisper-cli-integration.md)

## 打包位置

Windows runtime 资源应放在：

- `apps/desktop/resources/win/whisper-cli.exe`
- 与同一份 build 搭配的其他 runtime 文件，例如必要 DLL
- `apps/desktop/resources/win/runtime-manifest.json`

`runtime-manifest.json` 是 Windows runtime 唯一的 metadata contract，至少记录：

- `platform`
- `variant`
- `version`
- `files`

打包后只会进入：

- `resources/win/whisper-cli.exe`
- `resources/win/<extra-runtime-files>`
- `resources/win/runtime-manifest.json`

`apps/desktop/resources/versions.json` 不再作为 Windows whisper runtime packaging / preflight contract 的一部分，也不会被打进 Windows 安装产物。

## Staging

推荐用脚本将外部产物复制进仓库资源目录：

```bash
pnpm stage:win:whisper --source /path/to/whispercpp-vulkan-runtime --version 1.7.3
```

可选环境变量：

- `FOSSWHISPER_WINDOWS_WHISPER_SOURCE_DIR`
- `FOSSWHISPER_WINDOWS_WHISPER_VERSION`

staging 现在只接受一份 runtime bundle 目录作为输入。脚本会从 `--source` 目录读取 `whisper-cli.exe`，并把同目录中符合当前受管理规则的 runtime 文件一并复制进 `apps/desktop/resources/win/`。

脚本会重新生成 `runtime-manifest.json`，把本次 staged runtime 的 `version` 与受管理文件清单写进同一份 manifest。source 目录中的 `README.md` 与旧的 `runtime-manifest.json` 会被视为 repo-owned support file，因此不会被复制；其他不属于当前 runtime allowlist 的 top-level file 会直接让 staging 失败，避免把额外 artifact 静默打进 installer。

## Packaging Preflight

打包前的 `pnpm package:win` / `pnpm package:win:dir` preflight 会检查：

- `whisper-cli.exe` 存在
- `runtime-manifest.json` 存在、格式正确，并且已经记录当前 staged runtime 的 `version`
- `runtime-manifest.json` 中列出的 runtime 文件都已实际 staged
- `resources/win/` 中不存在 manifest 之外的未受管理 runtime 文件

当前仓库中的 Windows 打包脚本额外固定带上 `--config.win.signAndEditExecutable=false`，这是为了避开这台 Windows 打包机上 `winCodeSign` helper 解压符号链接时的权限问题，并把已经验证可行的本地 workaround 固化成正式命令。

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
- `pnpm stage:win:whisper` 只接受单一 runtime bundle 目录，不再混用 `--cli` 与 `--source`
- `pnpm stage:win:whisper` 只允许当前 Vulkan CLI runtime 所需文件进入 `resources/win/`
- Windows runtime metadata 只以 `runtime-manifest.json` 为准
- `apps/desktop/electron/main/whisper/WhisperWindows.ts` 只解析 `whisper.cpp` CLI 契约

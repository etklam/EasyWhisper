# Windows Whisper Runtime

当前 Windows Whisper 路线基于 `Const-me/Whisper`，桌面端通过一个可执行 wrapper 调用运行时。

## 打包位置

Windows runtime 资源应放在：

- `apps/desktop/resources/win/WhisperCLI.exe`
- `apps/desktop/resources/win/whisper.dll`

打包后会进入：

- `resources/win/WhisperCLI.exe`
- `resources/win/whisper.dll`

## Staging

推荐用脚本将外部产物复制进仓库资源目录：

```bash
pnpm stage:win:whisper --source /path/to/const-me-runtime --version 1.0.0
```

可选环境变量：

- `FOSSWHISPER_WINDOWS_WHISPER_SOURCE_DIR`
- `FOSSWHISPER_WINDOWS_WHISPER_CLI_PATH`
- `FOSSWHISPER_WINDOWS_WHISPER_DLL_PATH`
- `FOSSWHISPER_WINDOWS_WHISPER_VERSION`
- `FOSSWHISPER_WINDOWS_WHISPER_DLL_VERSION`

## Wrapper Contract

当前 Electron 侧假设 `WhisperCLI.exe` 接受以下参数：

```text
--model <path>
--input <path>
--output <path-to-json>
--language <auto|lang>
--threads <n>
--compute auto
--dll <path>
```

输出约定：

- 成功时写出 JSON 文件，至少包含 `{ "text": "..." }`
- `stdout` 可输出 JSON line 进度事件：

```json
{"type":"progress","progress":42,"stage":"transcribing","message":"running"}
```

- 若未输出 JSON line，Electron 会回退解析包含 `%` 的纯文本进度

## 下一步

- 产出真实 `WhisperCLI.exe`
- 确认 `whisper.dll` 及依赖 DLL 清单
- 固定 wrapper 的退出码与错误输出格式

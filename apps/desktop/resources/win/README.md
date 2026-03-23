Place Windows whisper.cpp runtime files here for packaging.

Expected minimum file:
- `whisper-cli.exe`

Optional runtime dependencies from the same Windows build can live beside it in this directory.
After running `pnpm stage:win:whisper`, the staging script also writes
`runtime-manifest.json`. That manifest is the canonical Windows runtime metadata
contract and records the staged platform, variant, version, and managed files.
The staging script ignores source-side `README.md` and source-side
`runtime-manifest.json`, but it rejects any other unexpected top-level file so a
release cannot silently package stray artifacts.

These files are packaged by `electron-builder` into `resources/win/` and discovered by
`apps/desktop/electron/main/whisper/WhisperWindows.ts`.

Recommended staging command:

```bash
pnpm stage:win:whisper --source /path/to/whispercpp-vulkan-runtime --version 1.7.3
```

`apps/desktop/resources/versions.json` is no longer part of the Windows runtime
packaging contract.

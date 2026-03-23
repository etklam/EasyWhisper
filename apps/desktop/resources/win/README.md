Place Windows whisper.cpp runtime files here for packaging.

Expected minimum file:
- `whisper-cli.exe`

Optional runtime dependencies from the same Windows build can live beside it in this directory.
After running `pnpm stage:win:whisper`, the staging script also writes
`runtime-manifest.json` to record the managed runtime files that were copied here.
If the source artifact folder still contains stale wrapper binaries or an old
`runtime-manifest.json`, the staging script ignores those files and regenerates
the manifest from the current CLI runtime inputs.

These files are packaged by `electron-builder` into `resources/win/` and discovered by
`apps/desktop/electron/main/whisper/WhisperWindows.ts`.

Recommended staging command:

```bash
pnpm stage:win:whisper --source /path/to/whispercpp-vulkan-runtime --version 1.7.3
```

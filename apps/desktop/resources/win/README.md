Place Windows Whisper runtime binaries here for packaging.

Expected files:
- `WhisperCLI.exe`
- `whisper.dll`

These files are packaged by `electron-builder` into `resources/win/` and discovered by
`apps/desktop/electron/main/whisper/WhisperWindows.ts`.

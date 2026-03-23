# Desktop App Icons

`icon.svg` is the source of truth for the EASYWhisper desktop app icon.

Generated files:

- `icon.ico` for Windows packaging
- `icon.icns` for macOS packaging

Generate them with:

```bash
pnpm --filter @easywhisper/desktop run icons:build
```

The generated `.ico` and `.icns` files are ignored by git. Rebuild them instead of editing them manually.

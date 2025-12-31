### BetterTwitchControls

### Build

From the project folder:

```bash
pnpm run build
```

This produces `dist/index.js`.

### Install in Chrome / Arc / Brave (Extension)

- **Build**: `pnpm run build`
- **Open extensions page**:
  - Chrome/Brave: `chrome://extensions`
  - Arc: `arc://extensions`
- **Enable**: Developer mode
- **Click**: “Load unpacked”
- **Select folder**: the repo root (`BetterTwitchControls/`) — the one containing `manifest.json`

The content script only runs on `twitch.tv` due to `manifest.json` match patterns, and `index.ts` also has a runtime guard as a second safety net.

### Optional: Load unpacked without `node_modules/`

If you don’t want to “Load unpacked” the repo root (which may contain `node_modules/`), run:

```bash
pnpm run build:extension
```

Then “Load unpacked” the generated `extension/` folder.

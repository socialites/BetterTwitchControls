### BetterTwitchControls

<img src="assets/icons/icon128.png" alt="BetterTwitchControls icon" width="72" height="72" />

### Controls

<!-- CONTROLS:START -->


### BetterTwitchControls — Controls

### Implemented

- **Automatic player focus**: Focus the player after two seconds outside chat, including after navigation or clicking elsewhere. Chat hover/focus and other text fields are protected.
- **`p`**: Immediately focus the player controls when you are outside chat and not typing (without toggling playback).
- **`c`**: Focus the chat input (only when you are *not* already typing in an input/textarea/contenteditable).
- **`Esc` (while chat is focused)**: Leave chat focus and focus the player controls (so player hotkeys work again).
- **`t` (while player controls are focused)**: Toggle Theatre Mode (clicks the Twitch theatre-mode button that’s labeled with `(alt+t)`).
- **`l` (while player controls are focused)**: Skip to Live (activates the “LIVE” control that appears after rewinding).
- **`ArrowUp` / `ArrowDown` (while player controls are focused)**: Volume up/down (focuses the volume slider if needed, then increments/decrements it).

- **Focus**
  - **Focus chat from outside chat**: `c` (**implemented**)
  - **Focus player from outside chat**: `p` (**implemented**)
  - **Focus player from inside chat**: `Esc` (**implemented**)
- **Playback / Player**
  - **Fullscreen**: `f` (Twitch built-in; restores player focus if needed)
  - **Play/Pause**: `k` or `Space` (Twitch built-in; should work once player is focused)
  - **Exit Theatre Mode**: `Esc` (Twitch built-in; should work once player is focused)
  - **Volume up/down**: `ArrowUp` / `ArrowDown` (custom; focuses + adjusts the volume slider, **implemented**)
  - **Seek**: `ArrowLeft` / `ArrowRight` (Twitch built-in; should work once player is focused)
- **Theatre Mode**
  - **Toggle Theatre Mode**: `t` (custom, replaces needing `⌥+t`, **implemented**)
- **Live Rewind / Live**
  - **Skip to Live**: `l` (custom; activates the “LIVE” control when you’ve rewound, **implemented**)
- **Misc**
  - **Clip**: `⌥+x` (Twitch built-in)
  - **Mute/Unmute**: `m` (Twitch built-in)

<!-- CONTROLS:END -->

### Updating / Testing the extension

Reload BetterTwitchControls on your browser's extensions page, then refresh Twitch.
The player focuses after two seconds outside chat; press `p` for immediate focus.
Chat hover/focus and other text fields keep their focus while you type.

For a packaged install, extract `BetterTwitchControls.zip` and use “Load unpacked”
on the extracted folder containing `manifest.json`.

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

### Keep README controls in sync

Edit `CONTROLS.md`, then run:

```bash
pnpm run sync:docs
```

### Chrome Web Store updates

Use Node 22 for the store commands. These scripts update an **existing** store
item through the [Chrome Web Store API v2](https://developer.chrome.com/docs/webstore/using-api).
Finish the listing and privacy information in the Developer Dashboard first.

One-time setup:

1. Enable the Chrome Web Store API in a Google Cloud project.
2. Configure an OAuth client and authorize the account that owns the extension
   with the `https://www.googleapis.com/auth/chromewebstore` scope. Obtain a client
   ID, client secret, and refresh token using Google's
   [setup guide](https://developer.chrome.com/docs/webstore/using-api).
3. Copy `.env.store.example` to `.env.store` and fill in those credentials, your
   publisher ID (Publisher > Settings), and your existing extension ID.
   `.env.store` is ignored by Git; exported environment variables take precedence.

Alternatively, provide `CWS_ACCESS_TOKEN` from an authorized account or a
[linked service account](https://developer.chrome.com/docs/webstore/service-accounts).
This token takes precedence over the OAuth refresh credentials and must be
renewed when it expires. The scripts do not create service accounts or manage key files.

Before uploading an update, increase `version` in both `package.json` and the root
`manifest.json` to match. The generated package takes its version from `package.json`.
Google requires a version higher than the one previously uploaded.

```bash
source ~/.nvm/nvm.sh && nvm use 22
pnpm store:upload              # Build/package and upload a draft; does not submit
pnpm store:status              # Show upload, review, and published status
pnpm store:submit              # Submit for review; stage the version after approval
```

The upload command waits up to one minute for asynchronous upload processing.
If it fails or times out, check `store:status` and the Developer Dashboard before
retrying or submitting. Store errors exit with a nonzero status.

By default, submission uses `STAGED_PUBLISH`: once Google approves it, release
the staged version from the Developer Dashboard. To publish automatically after
approval instead, run:

```bash
source ~/.nvm/nvm.sh && nvm use 22
pnpm store:submit --auto-publish
```

Submission operates on the draft currently uploaded to the configured store item.
It does not build or upload a ZIP. It refuses an upload still processing, a failed
upload, an item already under review, or an approved staged item. Existing store
visibility settings apply; changes to visibility may require a manual dashboard
publication first. See the
[publishing API](https://developer.chrome.com/docs/webstore/api/reference/rest/v2/publishers.items/publish).

Preview requests without credentials or network access by setting the publisher
and extension IDs and using `--dry-run`:

```bash
source ~/.nvm/nvm.sh && nvm use 22
pnpm store:upload --dry-run    # Still builds the local ZIP
pnpm store:submit --dry-run
pnpm store:status --dry-run
```

The CLI also supports `--help`. No store credentials are included in the extension
ZIP. Run `pnpm test` to verify the scripts with mocked Google responses.

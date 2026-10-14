
### BetterTwitchControls — Controls

### Implemented

- **Automatic player focus**: Focus the player after two seconds outside chat, including after navigation or clicking elsewhere. Chat hover/focus and other text fields are protected.
- **`p`**: Immediately focus the player controls when you are outside chat and not typing (without toggling playback).
- **`h` / `H`**: Show or hide the chat sidebar when outside chat and not typing; returns focus to the player.
- **`r` / `R` (requires 7TV)**: Restart the player using 7TV’s “Restart player” button, when that button is available and you are outside chat and not typing.
- **`c`**: Focus the chat input (only when you are *not* already typing in an input/textarea/contenteditable).
- **`Esc` (while chat is focused)**: Leave chat focus and focus the player controls (so player hotkeys work again).
- **`t` (while player controls are focused)**: Toggle Theatre Mode (clicks the Twitch theatre-mode button that’s labeled with `(alt+t)`).
- **`l` (while player controls are focused)**: Skip to Live (activates the “LIVE” control that appears after rewinding).
- **`ArrowUp` / `ArrowDown` (while player controls are focused)**: Volume up/down with a fading percentage indicator centered 30% down from the player’s top.

- **Focus**
  - **Focus chat from outside chat**: `c` (**implemented**)
  - **Focus player from outside chat**: `p` (**implemented**)
  - **Focus player from inside chat**: `Esc` (**implemented**)
- **Playback / Player**
  - **Fullscreen**: `f` (Twitch built-in; restores player focus if needed)
  - **Play/Pause**: `k` or `Space` (Twitch built-in; should work once player is focused)
  - **Exit Theatre Mode**: `Esc` (Twitch built-in; should work once player is focused)
  - **Volume up/down**: `ArrowUp` / `ArrowDown` (custom; focuses + adjusts the volume slider, **implemented**)
  - **Restart player**: `r` (**requires the 7TV extension and its Restart player button**)
  - **Volume feedback**: A translucent, blurred percentage indicator appears centered 30% down from the player’s top while using the volume arrow keys, then fades away.
  - **Seek**: `ArrowLeft` / `ArrowRight` (Twitch built-in; should work once player is focused)
- **Chat Sidebar**
  - **Show/Hide chat**: `h` (**implemented**)
- **Theatre Mode**
  - **Toggle Theatre Mode**: `t` (custom, replaces needing `⌥+t`, **implemented**)
- **Live Rewind / Live**
  - **Skip to Live**: `l` (custom; activates the “LIVE” control when you’ve rewound, **implemented**)
- **Misc**
  - **Clip**: `⌥+x` (Twitch built-in)
  - **Mute/Unmute**: `m` (Twitch built-in)

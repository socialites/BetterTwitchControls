## v1.2.1 (October 5, 2026):
- Make explicit `p` / `P` player focus work even when an earlier keyboard listener prevents the key's default action.
- Register shortcuts at document start and prevent later listeners from undoing explicit player focus.
- Keep the same player focus target for manual focus and the two-second timer.
- Add regression coverage for pressing `p` then `t` immediately, without waiting for automatic focus.

## v1.2.0 (October 5, 2026):
- Automatically restore player focus after two seconds outside chat, including after navigation and late player loading.
- Add `p` / `P` to focus the player immediately without toggling playback.
- Preserve chat and other text-field focus while typing.
- Route built-in player shortcuts to the player when focus is elsewhere or on the volume slider.
- Update controls, README, and popup with the new focus shortcuts.
- Add regression coverage for focus, navigation, typing protection, and shortcut routing.

## v1.1.3 (January 1, 2026):
- Update script to not attach focus to volume slider so that volume up/down keys work as expected while still allowing other shortcuts to work as intended

## v1.1.2 (January 1, 2026):
- Update CONTROLS.md to include new features

## v1.1.1 (January 1, 2026):
- Update popup to show "You are up to date" when no update is available
- Update popup to show current version

## v1.1.0 (January 1, 2026):
- Add Icon to popup
- Add script to automatically focus player controls when player is ready
- Update README

## v1.0.3 (January 1, 2026):
- Update icons

## v1.0.2 (January 1, 2026):
- Added icons
- Updated build scripts

## v1.0.1 (January 1, 2026):
- Added popup

## v1.0.0 (January 1, 2026):
- Initial release

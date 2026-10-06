
/**
 * BetterTwitchControls
 * - Restore player focus outside chat after two seconds.
 * - Press "c" to focus chat, or "p" to focus the player, when not typing.
 *
 * Works with Twitch's WYSIWYG + 7TV because it targets Twitch's stable data attributes:
 *   - [data-a-target="chat-input"]
 *   - [data-test-selector="chat-input"]
 */
const INSTALL_FLAG = "__betterTwitchControlsInstalled__";
const PLAYER_FOCUS_DELAY_MS = 2000;
const CHAT_REGION_SELECTOR =
  '[data-a-target="chat-room-component"], [data-test-selector="chat-room-component"], .chat-room, [data-a-target="chat-input"], [data-test-selector="chat-input"], .chat-wysiwyg-input__editor';

function isInChat(el: Element | null): boolean {
  return Boolean(el?.closest(CHAT_REGION_SELECTOR));
}

const isTwitchDomain = () => {
  try {
    const host = window.location.hostname || "";
    if (host === "twitch.tv") return true;
    const suffix = "twitch.tv";
    if (host.length <= suffix.length) return false;
    if (host.substring(host.length - suffix.length) !== suffix) return false;
    // Ensure it's a subdomain like "<something>.twitch.tv"
    return host.charAt(host.length - suffix.length - 1) === ".";
  } catch {
    return false;
  }
};

function isEditableElement(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLInputElement) {
    // Treat range sliders (like Twitch volume) as "non-editable" so our hotkeys still work.
    if ((el.getAttribute("type") || "").toLowerCase() === "range") return false;
    return true;
  }
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLSelectElement) return true;
  const htmlEl = el as HTMLElement;
  if (htmlEl.isContentEditable) return true;
  return false;
}

function getChatInputEl(): HTMLElement | null {
  // Prefer Twitch's stable target attributes.
  const selectors = [
    '[data-a-target="chat-input"]',
    '[data-test-selector="chat-input"]',
    '.chat-wysiwyg-input__editor',
  ];

  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el instanceof HTMLElement) return el;
  }

  return null;
}

function isChatInputFocused(): boolean {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return false;

  // If focus is on the editor itself, this will be true.
  if (
    active.matches?.(
      '[data-a-target="chat-input"], [data-test-selector="chat-input"], .chat-wysiwyg-input__editor',
    )
  ) {
    return true;
  }

  // Or if a descendant is focused (e.g. 7TV / Slate internals).
  return Boolean(
    active.closest?.(
      '[data-a-target="chat-input"], [data-test-selector="chat-input"], .chat-wysiwyg-input__editor',
    ),
  );
}

function focusChatInput(chatInput: HTMLElement) {
  // Slate-based editors sometimes respond better to click() + focus().
  try {
    chatInput.click();
  } catch {
    // ignore
  }

  try {
    // preventScroll isn't supported everywhere; cast keeps TS happy.
    chatInput.focus({ preventScroll: true } as any);
  } catch {
    chatInput.focus();
  }

  // Move caret to end (best-effort). If Slate blocks it, focus still works.
  try {
    const sel = window.getSelection?.();
    if (!sel) return;
    const range = document.createRange();
    range.selectNodeContents(chatInput);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  } catch {
    // ignore
  }
}

function getPlayerFocusTarget(): HTMLElement | null {
  // Prefer an actual focusable control button.
  const selectors = [
    '[data-a-target="player-play-pause-button"]',
    '[data-a-target="player-controls"]',
    "#channel-player",
  ];

  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el instanceof HTMLElement) return el;
  }

  return null;
}

function focusPlayerControls(): HTMLElement | null {
  const target = getPlayerFocusTarget();
  if (!target) return null;

  // If it's not naturally focusable, make it programmatically focusable.
  if (target.tabIndex < 0 && !(target instanceof HTMLButtonElement)) {
    // Avoid clobbering existing tabindex=0 etc.
    const hasTabIndexAttr = target.hasAttribute("tabindex");
    if (!hasTabIndexAttr) target.setAttribute("tabindex", "-1");
  }

  try {
    target.focus({ preventScroll: true } as any);
  } catch {
    target.focus();
  }
  return document.activeElement === target ? target : null;
}

function canStealFocusForPlayer(): boolean {
  if (document.visibilityState !== "visible" || !document.hasFocus()) return false;
  const active = document.activeElement;
  return !isEditableElement(active) && !isInChat(active);
}

function installAutoPlayerFocus() {
  let pointerInChat = false;
  let pendingFocus: number | null = null;

  const cancelPendingFocus = () => {
    if (pendingFocus !== null) window.clearTimeout(pendingFocus);
    pendingFocus = null;
  };
  const scheduleFocus = () => {
    if (!canStealFocusForPlayer() || pointerInChat || isPlayerControlsFocused()) {
      cancelPendingFocus();
      return;
    }
    if (pendingFocus !== null || !getPlayerFocusTarget()) return;
    pendingFocus = window.setTimeout(() => {
      pendingFocus = null;
      if (canStealFocusForPlayer() && !pointerInChat && !isPlayerControlsFocused()) {
        focusPlayerControls();
      }
    }, PLAYER_FOCUS_DELAY_MS);
  };

  document.addEventListener("pointerover", (e) => {
    pointerInChat = isInChat(e.target instanceof Element ? e.target : null);
    scheduleFocus();
  });
  document.addEventListener("pointerout", (e) => {
    pointerInChat = isInChat(e.relatedTarget instanceof Element ? e.relatedTarget : null);
    scheduleFocus();
  });
  document.addEventListener("pointerdown", () => {
    cancelPendingFocus();
    scheduleFocus();
  }, { capture: true });
  document.addEventListener("focusin", scheduleFocus);
  document.addEventListener("focusout", scheduleFocus);
  document.addEventListener("visibilitychange", scheduleFocus);
  window.addEventListener("focus", scheduleFocus);
  window.addEventListener("blur", cancelPendingFocus);

  // Keep checking for late mounts, removed focused controls, and SPA navigation.
  // A single timer avoids watching every mutation in Twitch's busy chat DOM.
  window.setInterval(scheduleFocus, 1000);
  scheduleFocus();
}

function isPlayerControlsFocused(): boolean {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return false;

  // Focus may be on a button inside the controls, or on the controls container itself.
  return Boolean(
    active.closest?.(
      '[data-a-target="player-controls"], #channel-player, [data-a-target="player-play-pause-button"]',
    ),
  );
}

function getTheatreModeToggleButton(): HTMLButtonElement | null {
  // Twitch labels this control with "(alt+t)" and either "Theatre Mode" or "Exit Theatre Mode".
  const selectors = [
    'button[aria-label*="(alt+t)"][aria-label*="Theatre"]',
    'button[aria-label*="(alt+t)"][aria-label*="theatre"]',
  ];

  for (let i = 0; i < selectors.length; i++) {
    const el = document.querySelector(selectors[i]);
    if (el instanceof HTMLButtonElement) return el;
  }

  // Fallback: scan buttons without using ES2015+ helpers.
  const allButtons = document.querySelectorAll("button");
  for (let i = 0; i < allButtons.length; i++) {
    const btn = allButtons[i];
    if (!(btn instanceof HTMLButtonElement)) continue;
    const label = btn.getAttribute("aria-label") || "";
    if (!label) continue;
    if (label.indexOf("(alt+t)") === -1) continue;
    if (label.indexOf("Theatre") === -1 && label.indexOf("theatre") === -1)
      continue;
    return btn;
  }

  return null;
}

function toggleTheatreMode() {
  const btn = getTheatreModeToggleButton();
  if (!btn) return;
  btn.click();
}

function getChatSidebarToggleButton(): HTMLButtonElement | null {
  const selectors = [
    'button[data-a-target="right-column__toggle-collapse-btn"]',
    'button[aria-label="Collapse Chat"], button[aria-label="Expand Chat"]',
  ];
  for (const selector of selectors) {
    const buttons = document.querySelectorAll(selector);
    for (const button of buttons) {
      if (button instanceof HTMLButtonElement && !button.disabled &&
          button.getAttribute("aria-disabled") !== "true" &&
          !button.closest('[hidden], [aria-hidden="true"]')) {
        return button;
      }
    }
  }
  return null;
}

function getPlayerControlsRoot(): HTMLElement | null {
  const selectors = ['[data-a-target="player-controls"]', "#channel-player"];
  for (let i = 0; i < selectors.length; i++) {
    const el = document.querySelector(selectors[i]);
    if (el instanceof HTMLElement) return el;
  }
  return null;
}

function getSkipToLiveControl(): HTMLElement | null {
  // The control isn't always present (only after rewinding). It's focusable (tabindex="0")
  // and its visible text is typically "LIVE".
  const root = getPlayerControlsRoot() || document.body;
  if (!root) return null;

  const focusables = root.querySelectorAll('[tabindex="0"]');
  for (let i = 0; i < focusables.length; i++) {
    const el = focusables[i];
    if (!(el instanceof HTMLElement)) continue;

    const text = (el.textContent || "").replace(/\s+/g, " ").trim();
    // Avoid ES2015+ String helpers to keep compatibility with older targets.
    if (text.indexOf("LIVE") !== 0) continue;

    return el;
  }

  return null;
}

function activateSkipToLive() {
  const el = getSkipToLiveControl();
  if (!el) return;

  // Prefer click if Twitch attaches a click handler.
  try {
    el.click();
    return;
  } catch {
    // ignore
  }

  // Fallback: focus + Enter (you confirmed Enter works when focused).
  try {
    el.focus({ preventScroll: true } as any);
  } catch {
    try {
      el.focus();
    } catch {
      // ignore
    }
  }

  try {
    const down = new KeyboardEvent("keydown", {
      key: "Enter",
      code: "Enter",
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true,
    } as any);
    el.dispatchEvent(down);
    const up = new KeyboardEvent("keyup", {
      key: "Enter",
      code: "Enter",
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true,
    } as any);
    el.dispatchEvent(up);
  } catch {
    // ignore
  }
}

function getVolumeSlider(): HTMLInputElement | null {
  const el = document.querySelector('[data-a-target="player-volume-slider"]');
  return el instanceof HTMLInputElement ? el : null;
}

function isVolumeSliderFocused(): boolean {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return false;
  return Boolean(active.closest?.('[data-a-target="player-volume-slider"]'));
}

function setRangeValue(slider: HTMLInputElement, next: number) {
  const min = Number(slider.min || 0);
  const max = Number(slider.max || 1);
  const clamped = Math.min(max, Math.max(min, next));
  slider.value = String(clamped);

  // Let Twitch react as if the user moved the slider.
  try {
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    slider.dispatchEvent(new Event("change", { bubbles: true }));
  } catch {
    // ignore
  }
}

function adjustVolume(delta: number) {
  const slider = getVolumeSlider();
  if (!slider) return;

  const current = Number(slider.value || 0);
  const stepAttr = Number(slider.step || 0.01);
  const step = stepAttr > 0 ? stepAttr : 0.01;

  setRangeValue(slider, current + delta * step);
}

function onKeyDown(e: KeyboardEvent) {
  if (e.isComposing) return;
  const isPlayerFocusKey = e.key === "p" || e.key === "P";
  // Manual player focus must work even if Twitch or another extension has
  // already claimed this key. Typing/chat and modifier guards still apply.
  if (e.defaultPrevented && !isPlayerFocusKey) return;

  const active = document.activeElement;

  // Esc: when you're typing in chat, exit chat focus back to the player.
  if (e.key === "Escape" && isChatInputFocused()) {
    e.preventDefault();
    e.stopPropagation();
    focusPlayerControls();
    return;
  }

  // If you're already typing anywhere (including chat), don't steal keys.
  if (isEditableElement(active) || isInChat(active)) return;

  // Plain "p" explicitly restores focus without toggling playback.
  if (isPlayerFocusKey) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (!focusPlayerControls()) return;
    e.preventDefault();
    // Stop later listeners on the same window from undoing explicit focus.
    e.stopImmediatePropagation();
    return;
  }

  // "h": use Twitch's own collapse/expand button, then restore player focus.
  if (e.key === "h" || e.key === "H") {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const button = getChatSidebarToggleButton();
    if (!button) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (!e.repeat) {
      button.click();
      focusPlayerControls();
    }
    return;
  }

  // Focusing during a keydown doesn't change that event's original target.
  // Re-dispatch built-in player shortcuts on the focused control so the first
  // keypress also reaches Twitch's player handlers (including fullscreen).
  const key = e.key.toLowerCase();
  const isNativePlayerKey =
    key === "f" || key === "k" || key === "m" || key === " " ||
    key === "space" || key === "spacebar" || key === "arrowleft" ||
    key === "arrowright" || key === "escape";
  if (
    isNativePlayerKey && !e.altKey && !e.ctrlKey && !e.metaKey &&
    (!isPlayerControlsFocused() || isVolumeSliderFocused())
  ) {
    const target = focusPlayerControls();
    if (!target) return;
    e.preventDefault();
    e.stopPropagation();
    target.dispatchEvent(new KeyboardEvent("keydown", {
      key: e.key, code: e.code, location: e.location,
      keyCode: e.keyCode, which: e.which,
      shiftKey: e.shiftKey, repeat: e.repeat,
      bubbles: true, cancelable: true, composed: true,
    } as KeyboardEventInit));
    return;
  }

  // "t": toggle theatre mode when the player controls are focused.
  if (e.key === "t" || e.key === "T") {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (!isPlayerControlsFocused()) focusPlayerControls();
    e.preventDefault();
    e.stopPropagation();
    toggleTheatreMode();
    return;
  }

  // "l": Skip to Live when the player controls are focused (button appears after rewinding).
  if (e.key === "l" || e.key === "L") {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (!isPlayerControlsFocused()) focusPlayerControls();
    e.preventDefault();
    e.stopPropagation();
    activateSkipToLive();
    return;
  }

  // ArrowUp/ArrowDown: adjust volume via the player volume slider when player controls are focused.
  if (e.key === "ArrowUp" || e.key === "ArrowDown") {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (!isPlayerControlsFocused()) focusPlayerControls();

    // If the slider doesn't exist, don't interfere with scrolling.
    if (!getVolumeSlider()) return;

    e.preventDefault();
    e.stopPropagation();

    // Use slider.step (Twitch typically uses 0.01). Up = louder, Down = quieter.
    adjustVolume(e.key === "ArrowUp" ? 1 : -1);

    // If focus was on the slider (mouse click, etc), unstick it.
    if (isVolumeSliderFocused()) focusPlayerControls();
    return;
  }

  // Only plain "c" (or "C") with no modifiers.
  if (e.key !== "c" && e.key !== "C") return;
  if (e.altKey || e.ctrlKey || e.metaKey) return;

  const chatInput = getChatInputEl();
  if (!chatInput) return;

  // Consume the key so Twitch/player doesn't treat it as anything else.
  e.preventDefault();
  e.stopPropagation();

  focusChatInput(chatInput);
}

function install() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (!isTwitchDomain()) return;

  const w = window as any;
  if (w[INSTALL_FLAG]) return;
  w[INSTALL_FLAG] = true;

  // Install at document_start, before Twitch registers its keyboard handlers.
  window.addEventListener("keydown", onKeyDown, { capture: true });

  installAutoPlayerFocus();
}

install();

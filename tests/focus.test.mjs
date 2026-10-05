import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { JSDOM } from 'jsdom';

const script = readFileSync(new URL('../dist/index.js', import.meta.url), 'utf8');
const playerHTML = `<div id="channel-player"><div data-a-target="player-controls">
  <button data-a-target="player-play-pause-button">Play</button>
  <button aria-label="Theatre Mode (alt+t)">Theatre</button>
  <button tabindex="0">LIVE</button>
  <input data-a-target="player-volume-slider" type="range" min="0" max="1" step="0.01" value="0.5">
</div></div>`;

function setup(t, { player = true, url = 'https://www.twitch.tv/example', beforeInstall } = {}) {
  const dom = new JSDOM(`${player ? playerHTML : ''}
    <div data-a-target="chat-room-component"><textarea data-a-target="chat-input"></textarea>
      <button id="chat-link">Chat action</button></div>
    <input id="search"><div contenteditable="true" tabindex="0" id="editor"></div>
    <button id="outside">Outside</button>`, { url, runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  const { document } = window;
  t.after(() => window.close());
  let focused = true;
  document.hasFocus = () => focused;
  // jsdom doesn't implement this browser property.
  Object.defineProperty(window.HTMLElement.prototype, 'isContentEditable', {
    get() { return Boolean(this.closest('[contenteditable="true"]')); },
  });
  let now = 0;
  let nextID = 0;
  const timers = new Map();
  window.setTimeout = (fn, delay) => {
    const id = ++nextID;
    timers.set(id, { fn, at: now + delay });
    return id;
  };
  window.clearTimeout = id => timers.delete(id);
  window.setInterval = (fn, delay) => {
    const id = ++nextID;
    timers.set(id, { fn, at: now + delay, interval: delay });
    return id;
  };
  function advance(ms) {
    const end = now + ms;
    while (true) {
      const next = [...timers].filter(([, timer]) => timer.at <= end)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      const [id, timer] = next;
      now = timer.at;
      if (timer.interval) timer.at += timer.interval;
      else timers.delete(id);
      timer.fn();
    }
    now = end;
  }
  const find = selector => document.querySelector(selector);
  function key(value, options = {}) {
    const event = new window.KeyboardEvent('keydown', {
      key: value, bubbles: true, cancelable: true, ...options,
    });
    document.activeElement.dispatchEvent(event);
    return event;
  }
  beforeInstall?.(window);
  window.eval(script);
  return { window, document, find, advance, key,
    setFocused(value) { focused = value; window.dispatchEvent(new window.Event(value ? 'focus' : 'blur')); },
    get play() { return find('[data-a-target="player-play-pause-button"]'); },
  };
}

test('defaults to player after two seconds and restores focus after an outside click', t => {
  const h = setup(t);
  h.advance(1999);
  assert.equal(h.document.activeElement, h.document.body);
  h.advance(1);
  assert.equal(h.document.activeElement, h.play);
  h.find('#outside').focus();
  h.advance(1999);
  assert.equal(h.document.activeElement.id, 'outside');
  h.advance(1);
  assert.equal(h.document.activeElement, h.play);
});

test('keeps finding players mounted late or replaced during SPA navigation', t => {
  const h = setup(t, { player: false });
  h.advance(10000);
  h.document.body.insertAdjacentHTML('afterbegin', playerHTML);
  h.advance(3000);
  assert.equal(h.document.activeElement, h.play);
  h.find('#channel-player').remove();
  h.document.body.insertAdjacentHTML('afterbegin', playerHTML);
  h.advance(3000);
  assert.equal(h.document.activeElement, h.play);
});

test('chat, search, and contenteditable fields retain focus and their keys', t => {
  const h = setup(t);
  for (const selector of ['textarea', '#search', '#editor', '#chat-link']) {
    const target = h.find(selector);
    target.focus();
    h.advance(5000);
    assert.equal(h.document.activeElement, target);
    for (const key of ['p', 'P', 'f', 't', 'l', 'ArrowLeft', 'ArrowUp']) {
      assert.equal(h.key(key).defaultPrevented, false);
      assert.equal(h.document.activeElement, target);
    }
  }
});

test('chat hover cancels automatic focus; leaving chat restarts the delay', t => {
  const h = setup(t);
  h.advance(1000);
  const chat = h.find('textarea');
  chat.dispatchEvent(new h.window.MouseEvent('pointerover', { bubbles: true }));
  h.advance(5000);
  assert.equal(h.document.activeElement, h.document.body);
  chat.dispatchEvent(new h.window.MouseEvent('pointerout', { bubbles: true, relatedTarget: h.find('#outside') }));
  h.advance(1999);
  assert.equal(h.document.activeElement, h.document.body);
  h.advance(1);
  assert.equal(h.document.activeElement, h.play);
});

test('p/P focus player immediately without clicking play or consuming modified keys', t => {
  const h = setup(t);
  let clicks = 0;
  h.play.addEventListener('click', () => clicks++);
  for (const key of ['p', 'P']) {
    h.find('#outside').focus();
    assert.equal(h.key(key).defaultPrevented, true);
    assert.equal(h.document.activeElement, h.play);
  }
  assert.equal(clicks, 0);
  for (const modifier of ['ctrlKey', 'metaKey', 'altKey', 'isComposing']) {
    h.find('#outside').focus();
    assert.equal(h.key('p', { [modifier]: true }).defaultPrevented, false);
    assert.equal(h.document.activeElement.id, 'outside');
  }
});

test('c enters chat and Escape immediately returns to player', t => {
  const h = setup(t);
  assert.equal(h.key('c').defaultPrevented, true);
  assert.equal(h.document.activeElement, h.find('textarea'));
  h.advance(10000);
  assert.equal(h.document.activeElement, h.find('textarea'));
  assert.equal(h.key('Escape').defaultPrevented, true);
  assert.equal(h.document.activeElement, h.play);
});

test('native shortcuts reach player exactly once from outside, slider, or player', t => {
  const h = setup(t);
  const received = [];
  h.find('#channel-player').addEventListener('keydown', e => received.push([e.key, e.target]));
  for (const selector of ['#outside', '[type="range"]', '[data-a-target="player-play-pause-button"]']) {
    for (const key of ['f', 'k', 'm', ' ', 'ArrowLeft', 'ArrowRight', 'Escape']) {
      h.find(selector).focus();
      const before = received.length;
      h.key(key);
      assert.equal(received.length, before + 1);
      assert.equal(received.at(-1)[0], key);
      assert.equal(received.at(-1)[1], h.play);
    }
  }
});

test('custom theatre/live/volume shortcuts still work with focus elsewhere', t => {
  const h = setup(t);
  let theatre = 0;
  let live = 0;
  h.find('[aria-label]').addEventListener('click', () => theatre++);
  h.find('button[tabindex]').addEventListener('click', () => live++);
  h.find('#outside').focus(); h.key('t');
  h.find('#outside').focus(); h.key('l');
  h.find('#outside').focus(); h.key('ArrowUp');
  assert.equal(h.find('[type="range"]').value, '0.51');
  h.key('ArrowDown');
  assert.equal(h.find('[type="range"]').value, '0.5');
  assert.equal(theatre, 1);
  assert.equal(live, 1);
});

test('does not focus a background window or hidden tab', t => {
  const h = setup(t);
  h.setFocused(false);
  h.advance(5000);
  assert.equal(h.document.activeElement, h.document.body);
  h.setFocused(true);
  Object.defineProperty(h.document, 'visibilityState', { configurable: true, value: 'hidden' });
  h.document.dispatchEvent(new h.window.Event('visibilitychange'));
  h.advance(5000);
  assert.equal(h.document.activeElement, h.document.body);
  Object.defineProperty(h.document, 'visibilityState', { configurable: true, value: 'visible' });
  h.document.dispatchEvent(new h.window.Event('visibilitychange'));
  h.advance(2000);
  assert.equal(h.document.activeElement, h.play);
});

test('no player leaves p and native shortcuts alone', t => {
  const h = setup(t, { player: false });
  for (const key of ['p', 'f', 'ArrowLeft']) assert.equal(h.key(key).defaultPrevented, false);
});

test('fallback player container can be focused without controls', t => {
  const h = setup(t, { player: false });
  h.document.body.insertAdjacentHTML('afterbegin', '<div id="channel-player"></div>');
  h.key('p');
  assert.equal(h.document.activeElement, h.find('#channel-player'));
});

test('domain guard and installation guard prevent unwanted listeners', t => {
  const other = setup(t, { url: 'https://nottwitch.tv/' });
  assert.equal(other.key('p').defaultPrevented, false);
  other.advance(10000);
  assert.equal(other.document.activeElement, other.document.body);
  const h = setup(t);
  h.window.eval(script);
  let count = 0;
  h.find('[aria-label]').addEventListener('click', () => count++);
  h.key('t');
  assert.equal(count, 1);
});

// A site or another extension may already have claimed the p key before our
// window listener runs. Explicit player focus should still happen outside chat.
test('p then t works immediately even if another listener prevents p', t => {
  const h = setup(t, { beforeInstall(window) {
    window.addEventListener('keydown', event => {
      if (event.key.toLowerCase() === 'p') event.preventDefault();
    }, { capture: true });
  } });
  let toggles = 0;
  h.find('[aria-label]').addEventListener('click', () => toggles++);
  h.find('#outside').focus();
  h.key('p');
  assert.equal(h.document.activeElement, h.play);
  h.key('t');
  assert.equal(toggles, 1);
  // No automatic-focus time has passed in this test.
});


test('later window listeners cannot undo explicit p focus', t => {
  const h = setup(t);
  h.window.addEventListener('keydown', event => {
    if (event.key === 'p') h.find('#outside').focus();
  }, { capture: true });
  h.find('#outside').focus();
  h.key('p');
  assert.equal(h.document.activeElement, h.play);
});

test('previously prevented p still preserves chat, text fields, and modified shortcuts', t => {
  const h = setup(t, { beforeInstall(window) {
    window.addEventListener('keydown', event => event.preventDefault(), { capture: true });
  } });
  for (const selector of ['textarea', '#search', '#editor', '#chat-link']) {
    h.find(selector).focus();
    h.key('p');
    assert.equal(h.document.activeElement, h.find(selector));
  }
  for (const modifier of ['ctrlKey', 'altKey', 'metaKey', 'isComposing']) {
    h.find('#outside').focus();
    h.key('p', { [modifier]: true });
    assert.equal(h.document.activeElement.id, 'outside');
  }
});

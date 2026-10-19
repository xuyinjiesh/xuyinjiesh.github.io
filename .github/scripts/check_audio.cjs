// Deterministic lifecycle tests: node .github/scripts/check_audio.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../../js/audio.js'), 'utf8');

function environment({ blocked = false, delayed = false } = {}) {
  let now = 0, id = 0;
  const timers = new Map(), audios = [];
  function target(extra = {}) {
    const listeners = new Map();
    return Object.assign(extra, {
      addEventListener(type, listener) {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type).add(listener);
      },
      removeEventListener(type, listener) { listeners.get(type)?.delete(listener); },
      emit(type) { for (const listener of [...(listeners.get(type) || [])]) listener(); }
    });
  }
  const document = target({ hidden: false, title: 'Test' });
  const window = target();
  class Audio {
    constructor() {
      Object.assign(this, target({ volume: 1, paused: true, src: '', currentTime: 42, plays: 0 }));
      audios.push(this);
    }
    play() {
      this.plays++;
      if (!blocked) {
        this.paused = false;
        if (!delayed) this.emit('playing');
      }
      return { catch(fn) { if (blocked) fn({ name: 'NotAllowedError' }); } };
    }
    pause() { this.paused = true; this.emit('pause'); }
  }
  const context = {
    window, document, navigator: {}, Audio,
    performance: { now: () => now },
    setTimeout(fn, ms) { const key = ++id; timers.set(key, { time: now + ms, fn }); return key; },
    clearTimeout(key) { timers.delete(key); },
    requestAnimationFrame() { throw Error('rAF is unavailable in background tabs'); }
  };
  vm.runInNewContext(source, context);
  const api = window.AmbientAudio;
  api.setTheme({ id: 'test', music: 'https://example.com/music.mp3' });
  return {
    api, audios, window, document,
    unblock() { blocked = false; },
    hidden(value) { document.hidden = value; document.emit('visibilitychange'); },
    advance(ms) {
      const end = now + ms;
      while (true) {
        const next = [...timers].filter(([, timer]) => timer.time <= end).sort((a, b) => a[1].time - b[1].time)[0];
        if (!next) break;
        timers.delete(next[0]); now = next[1].time; next[1].fn();
      }
      now = end;
    }
  };
}

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < .00001, `${actual} != ${expected}`);
const t = environment();
t.api.setEnabled(true);
const music = t.audios[0];
near(music.volume, 0);
t.advance(750); near(music.volume, .15);
t.advance(750); near(music.volume, .3);

t.hidden(true); t.advance(325);
assert.ok(music.volume > 0 && music.volume < .3);
t.hidden(false); t.advance(1500);
near(music.volume, .3); assert.equal(music.paused, false);
assert.equal(music.plays, 1); assert.equal(music.currentTime, 42);
t.hidden(true); t.advance(650);
near(music.volume, 0); assert.equal(music.paused, true);
t.hidden(false); near(music.volume, 0);
t.advance(750); near(music.volume, .15);
t.advance(750); near(music.volume, .3);
assert.equal(music.currentTime, 42);

// Changing tracks while away must complete despite a simultaneous presence fade.
t.api.setTheme({ id: 'next', music: 'https://example.com/next.mp3' });
t.hidden(true); t.advance(1500);
assert.equal(music.src, 'https://example.com/next.mp3');
assert.equal(music.paused, true);
t.hidden(false); t.advance(1500);
assert.equal(music.paused, false); near(music.volume, .3);

t.api.setMood('rain'); t.advance(3000);
const rain = t.audios[1];
near(rain.volume, .15);
t.hidden(true); t.advance(650);
near(rain.volume, 0); assert.equal(rain.paused, true);
t.hidden(false); t.advance(1500);
near(rain.volume, .15); assert.equal(rain.paused, false);

// Disabling music while away must never be undone on return.
t.hidden(true); t.advance(650);
t.api.setEnabled(false); t.advance(650);
const count = music.plays;
t.hidden(false); t.advance(2000);
assert.equal(music.plays, count); assert.equal(music.paused, true); near(music.volume, 0);
t.api.setEnabled(true); t.advance(1500);
assert.equal(rain.paused, false); near(rain.volume, .15);

t.window.emit('pagehide');
near(music.volume, 0); assert.equal(music.paused, true);
t.window.emit('pageshow'); t.advance(1500);
near(music.volume, .3); assert.equal(music.paused, false);
const before = music.plays;
t.api.setEnabled(true);
assert.equal(music.plays, before);

// Slow loading / autoplay rejection must leave the fade at zero until playback starts.
const slow = environment({ delayed: true });
slow.api.setEnabled(true); slow.advance(5000);
near(slow.audios[0].volume, 0);
slow.audios[0].emit('playing'); slow.advance(750);
near(slow.audios[0].volume, .15);
const blocked = environment({ blocked: true });
blocked.api.setEnabled(true); blocked.advance(5000);
near(blocked.audios[0].volume, 0);
blocked.unblock(); blocked.document.emit('pointerdown'); blocked.advance(750);
near(blocked.audios[0].volume, .15);

// A late playing/error event for an old track cannot cancel a pending theme change.
const switching = environment({ delayed: true });
switching.api.setEnabled(true);
switching.api.setTheme({ id: 'new', music: 'https://example.com/new.mp3' });
switching.audios[0].emit('playing');
switching.audios[0].emit('error');
switching.advance(1500);
assert.equal(switching.audios[0].src, 'https://example.com/new.mp3');
switching.audios[0].emit('playing'); switching.advance(1500);
near(switching.audios[0].volume, .3);

const cancelledMood = environment();
cancelledMood.api.setEnabled(true);
cancelledMood.api.setMood('rain'); cancelledMood.api.setMood(null);
cancelledMood.advance(3000);
assert.equal(cancelledMood.audios[1].src, '');
assert.equal(cancelledMood.audios[1].paused, true);

console.log('Passed audio fades, quick tab switches, playback position, background track changes, weather layer, manual stop, cache restore, slow loading and autoplay retry without rAF.');

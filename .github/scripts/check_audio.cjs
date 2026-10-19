// Deterministic lifecycle tests: node .github/scripts/check_audio.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../../js/audio.js'), 'utf8');

function environment({ blocked = false, delayed = false, library = false } = {}) {
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
  if (library) vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../js/music.js'), 'utf8'), context);
  vm.runInNewContext(source, context);
  const api = window.AmbientAudio;
  api.setTheme({ id: 'test', music: 'https://example.com/music.mp3' });
  return {
    api, audios, window, document,
    chooseTheme(id) {
      const tracks = window.MusicLibrary.forTheme(id);
      api.setTheme({ id, music: tracks[0].src, musicTrack: tracks[0], musicFallbacks: tracks.slice(1) });
    },
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

const catalog = environment({ library: true });
catalog.chooseTheme('yushui'); catalog.api.setEnabled(true); catalog.advance(1500);
assert.equal(catalog.audios[0].src, 'assets/audio/music/water-lily.mp3');
assert.equal(catalog.api.getState().track.artist, 'Kevin MacLeod');
catalog.audios[0].emit('error');
assert.equal(catalog.audios[0].src, 'assets/audio/music/gymnopedie-1.mp3');
assert.equal(catalog.api.getState().track.id, 'gymnopedie-1');
catalog.chooseTheme('xiaoxue'); catalog.advance(3000);
const plays = catalog.audios[0].plays;
catalog.chooseTheme('daxue'); catalog.advance(2000);
assert.equal(catalog.audios[0].plays, plays, 'Shared recordings must keep their playback position');
catalog.api.setMoment('reverie'); catalog.advance(3000);
assert.equal(catalog.api.getState().track.id, 'reverie');
const momentPlays = catalog.audios[0].plays;
catalog.chooseTheme('mid-autumn'); catalog.advance(2000);
assert.equal(catalog.audios[0].plays, momentPlays, 'An active blue-hour track must keep playing across themes');
catalog.api.setMoment(null); catalog.advance(3000);
assert.equal(catalog.api.getState().track.id, 'clair-de-lune');
assert.equal(catalog.api.getState().track.license, 'CC BY 3.0');
catalog.chooseTheme('spring-festival'); catalog.advance(3000);
assert.equal(catalog.audios[0].src, 'https://cdn.pixabay.com/audio/2026/01/14/audio_3265c1aace.mp3');
assert.equal(catalog.api.getState().track.id, 'spring-festival-original');
catalog.audios[0].emit('error');
assert.equal(catalog.api.getState().track.id, 'a-new-year');
for (let i = 0; i < 20; i++) catalog.audios[0].emit('error');
assert.equal(catalog.api.getState().state, 'unavailable');
assert.equal(catalog.api.isEnabled(), true);

// Fireworks must stay bounded, vary recordings, and obey the same mute/presence
// controls as music. One-shots are discarded on return rather than resumed.
const fireworks = environment();
fireworks.document.emit('firework-burst');
assert.equal(fireworks.audios.length, 0, 'Muted fireworks must not create players');
fireworks.api.setEnabled(true); fireworks.advance(1500);
fireworks.document.emit('firework-burst');
const firstBurst = fireworks.audios[1];
assert.ok(firstBurst.src.startsWith('assets/audio/fireworks-'));
near(firstBurst.volume, .25);
assert.equal(firstBurst.playbackRate, 1, 'Keep the original explosion pitch and timing');
fireworks.document.emit('firework-burst');
assert.equal(fireworks.audios.length, 2, 'Simultaneous bursts are throttled');
for (let i = 0; i < 5; i++) { fireworks.advance(180); fireworks.document.emit('firework-burst'); }
assert.equal(fireworks.audios.length, 4, 'Only three overlapping voices are allocated');
assert.notEqual(fireworks.audios[1].src, fireworks.audios[2].src, 'Adjacent bursts use different recordings');
assert.notEqual(fireworks.audios[2].src, fireworks.audios[3].src);
firstBurst.emit('ended');
fireworks.advance(180); fireworks.document.emit('firework-burst');
assert.equal(fireworks.audios.length, 5, 'Ended voices release their slot');
const fadingBurst = fireworks.audios[4];
const fullVolume = fadingBurst.volume;
fireworks.hidden(true); fireworks.advance(325);
assert.ok(fadingBurst.volume > 0 && fadingBurst.volume < fullVolume);
fireworks.advance(325);
near(fadingBurst.volume, 0); assert.equal(fadingBurst.paused, true);
const awayCount = fireworks.audios.length;
fireworks.document.emit('firework-burst');
assert.equal(fireworks.audios.length, awayCount, 'Background tabs cannot start bursts');
fireworks.hidden(false); fireworks.advance(1500);
assert.equal(fadingBurst.plays, 1, 'Returning must not resume a spent explosion');
fireworks.document.emit('firework-burst');
const mutedBurst = fireworks.audios.at(-1);
fireworks.api.setEnabled(false); fireworks.advance(650);
near(mutedBurst.volume, 0); assert.equal(mutedBurst.paused, true);
fireworks.api.setEnabled(true); fireworks.advance(1500);
fireworks.document.emit('firework-burst');
const oldThemeBurst = fireworks.audios.at(-1);
fireworks.api.setTheme({ id: 'spring', music: 'https://example.com/spring.mp3' });
assert.equal(oldThemeBurst.paused, true, 'Switching scenery clears old firework tails');
fireworks.document.emit('firework-burst');
const navigatingBurst = fireworks.audios.at(-1);
fireworks.window.emit('pagehide');
assert.equal(navigatingBurst.paused, true);
const navigatingCount = fireworks.audios.length;
fireworks.document.emit('firework-burst');
assert.equal(fireworks.audios.length, navigatingCount, 'Navigation suppresses late particle events');

const rejectedBursts = environment({ blocked: true });
rejectedBursts.api.setEnabled(true);
for (let i = 0; i < 5; i++) { rejectedBursts.advance(180); rejectedBursts.document.emit('firework-burst'); }
assert.equal(rejectedBursts.audios.length, 6, 'Rejected play promises must release burst slots');
rejectedBursts.unblock(); rejectedBursts.advance(180); rejectedBursts.document.emit('firework-burst');
const failedBurst = rejectedBursts.audios.at(-1);
failedBurst.emit('error');
for (let i = 0; i < 3; i++) { rejectedBursts.advance(180); rejectedBursts.document.emit('firework-burst'); }
assert.equal(rejectedBursts.audios.length, 10, 'Failed files also release burst slots');

console.log('Passed music/audio lifecycle, source fallback, firework variation/limits, rejection cleanup, and one-shot mute/visibility/navigation without rAF.');

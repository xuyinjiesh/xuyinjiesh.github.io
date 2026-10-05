/*
 * 氛围音乐：主题驱动，约定 assets/audio/<主题id>.mp3，
 * 回退链：时刻曲目（蓝调时刻 bluehour 等）→ 远程URL（主题 music 字段）→ 主题id
 *        → 季节id → default.mp3（404 自动降级）。
 * 时刻由调用方按太阳高度角喂入（见 js/chat.js 的蓝调时刻计算）。
 * 天气音效层：assets/audio/<mood>.mp3 或 .wav（rain / thunder / wind），低音量叠在音乐下，
 * 由调用方按“跟随天气”开关喂入 mood（见 js/chat.js）。
 * 烟花音效：assets/audio/fireworks-<n>.wav（程序合成），由粒子爆发事件触发，归总开关管。
 * 浏览器禁止手势前播放有声内容，play() 被拒时自动等待首次手势。
 * 是否启用由调用方按站内开关决定（见 js/chat.js）。
 */
(function () {
  'use strict';

  var VOLUME = 0.3;
  var SFX_VOLUME = 0.15;
  var FADE_MS = 1500;

  var el = null;        // 音乐层
  var sfx = null;       // 天气音效层
  var enabled = false;
  var theme = null;
  var moment = null;    // 时刻曲目（如 'bluehour'）
  var mood = null;
  var moodSrc = null;
  var candidates = [];
  var candidateIdx = 0;
  var fades = { music: null, sfx: null };
  var pausedHidden = { music: false, sfx: false };
  var waitingGesture = false;

  function fadeTo(key, elm, target, done) {
    if (fades[key]) cancelAnimationFrame(fades[key]);
    var from = elm.volume, t0 = performance.now();
    function step(now) {
      var k = Math.min((now - t0) / FADE_MS, 1);
      elm.volume = from + (target - from) * k;
      if (k < 1) fades[key] = requestAnimationFrame(step);
      else { fades[key] = null; if (done) done(); }
    }
    fades[key] = requestAnimationFrame(step);
  }

  function tryPlay(elm) {
    var p = elm.play();
    if (p && p.catch) p.catch(function (e) {
      if (e && e.name === 'NotAllowedError') waitGesture();
    });
  }

  function waitGesture() {
    if (waitingGesture) return;
    waitingGesture = true;
    var once = function () {
      document.removeEventListener('pointerdown', once);
      document.removeEventListener('keydown', once);
      waitingGesture = false;
      if (!enabled || document.hidden) return;
      if (el && el.paused && el.src) tryPlay(el);
      if (sfx && sfx.paused && moodSrc) tryPlay(sfx);
    };
    document.addEventListener('pointerdown', once);
    document.addEventListener('keydown', once);
  }

  function onVisibility() {
    if (document.hidden) {
      pausedHidden.music = !!(el && !el.paused);
      pausedHidden.sfx = !!(sfx && !sfx.paused);
      if (pausedHidden.music) el.pause();
      if (pausedHidden.sfx) sfx.pause();
    } else {
      if (pausedHidden.music) tryPlay(el);
      if (pausedHidden.sfx) tryPlay(sfx);
      pausedHidden.music = pausedHidden.sfx = false;
    }
  }

  // ---- 音乐层 ----
  function ensureEl() {
    if (el) return;
    el = new Audio();
    el.loop = true;
    el.volume = 0;
    el.addEventListener('error', onError);
    document.addEventListener('visibilitychange', onVisibility);
  }

  function onError() {
    if (!enabled) return;
    candidateIdx++;
    if (candidateIdx < candidates.length) load(candidates[candidateIdx]);
  }

  function buildCandidates(t) {
    var list = [];
    if (moment) list.push(/^https?:\/\//.test(moment) ? moment : 'assets/audio/' + moment + '.mp3'); // 时刻曲目优先（蓝调时刻等），可配直链
    if (t && t.music) list.push(t.music); // 主题可直接指定远程 URL（如 Pixabay CDN 直链）
    if (t && t.id) list.push('assets/audio/' + t.id + '.mp3');
    if (t && t.season && t.season !== t.id) list.push('assets/audio/' + t.season + '.mp3');
    list.push('assets/audio/default.mp3');
    return list;
  }

  function load(src) {
    el.src = src;
    tryPlay(el);
  }

  function startPlayback() {
    candidates = buildCandidates(theme);
    candidateIdx = 0;
    load(candidates[0]);
    fadeTo('music', el, VOLUME);
  }

  // ---- 天气音效层 ----
  var SFX_EXTS = ['mp3', 'wav']; // 无转码工具时可直接放 .wav
  var sfxCandidates = [], sfxIdx = 0;

  function ensureSfx() {
    if (sfx) return;
    sfx = new Audio();
    sfx.loop = true;
    sfx.volume = 0;
    sfx.addEventListener('error', function () {
      if (!enabled || !mood) return;
      sfxIdx++;
      if (sfxIdx < sfxCandidates.length) loadSfx(sfxCandidates[sfxIdx]);
      // 全部缺失：安静跳过
    });
  }

  function loadSfx(src) {
    moodSrc = src;
    sfx.src = src;
    tryPlay(sfx);
  }

  function applyMood() {
    if (!enabled) return; // 总开关关闭时只记 mood，保持安静
    if (!mood) {
      if (sfx && moodSrc) fadeTo('sfx', sfx, 0, function () { sfx.pause(); moodSrc = null; });
      return;
    }
    ensureSfx();
    var next = SFX_EXTS.map(function (e) { return 'assets/audio/' + mood + '.' + e; });
    if (sfxCandidates[0] === next[0] && moodSrc) return; // 同 mood 已在播
    sfxCandidates = next;
    sfxIdx = 0;
    fadeTo('sfx', sfx, 0, function () {
      loadSfx(sfxCandidates[0]);
      fadeTo('sfx', sfx, SFX_VOLUME);
    });
  }

  // ---- 烟花单次音效：由 js/particles.js 的 firework-burst 事件驱动 ----
  // 程序合成素材，无版权问题；每次爆发新建 Audio 实例以允许重叠
  var BURST_SFX = [
    'assets/audio/fireworks-1.wav',
    'assets/audio/fireworks-2.wav',
    'assets/audio/fireworks-3.wav'
  ];
  document.addEventListener('firework-burst', function () {
    if (!enabled || document.hidden) return;
    var a = new Audio(BURST_SFX[Math.floor(Math.random() * BURST_SFX.length)]);
    a.volume = 0.25;
    var p = a.play();
    if (p && p.catch) p.catch(function () { /* 手势前静默 */ });
  });

  window.AmbientAudio = {
    setEnabled: function (on) {
      enabled = !!on;
      if (!enabled) {
        if (el) fadeTo('music', el, 0, function () { el.pause(); });
        if (sfx) fadeTo('sfx', sfx, 0, function () { sfx.pause(); });
        return;
      }
      ensureEl();
      startPlayback();
      applyMood();
    },
    setTheme: function (t) {
      theme = t;
      if (!enabled || !el) return;
      fadeTo('music', el, 0, function () { startPlayback(); }); // 淡出换曲再淡入
    },
    setMoment: function (m) {
      m = m || null;
      if (m === moment) return;
      moment = m;
      if (!enabled || !el) return;
      // 链首候选不变就不换曲（例如时刻曲目缺失、已在播回退曲目时离开蓝调时刻）
      if (candidates[candidateIdx] === buildCandidates(theme)[0]) return;
      fadeTo('music', el, 0, function () { startPlayback(); });
    },
    setMood: function (m) {
      mood = m || null;
      applyMood();
    },
    isEnabled: function () { return enabled; }
  };
})();

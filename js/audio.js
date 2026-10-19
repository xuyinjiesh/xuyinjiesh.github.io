/*
 * 氛围音乐：目录与主题搭配见 js/music.js，本地录音在 assets/audio/music/。
 * 回退链：时刻曲目 → 当前主题及备选 → 日常曲目 → 对应录音的远程源。
 * 时刻由调用方按太阳高度角喂入（见 js/chat.js 的蓝调时刻计算）。
 * 天气音效层：assets/audio/<mood>.mp3 或 .wav（rain / thunder / wind），低音量叠在音乐下，
 * 由调用方按“跟随天气”开关喂入 mood（见 js/chat.js）。
 * 烟花音效：assets/audio/fireworks-<n>.wav（程序合成），由粒子爆发事件触发，归总开关管。
 * 浏览器禁止手势前播放有声内容，play() 被拒时自动等待首次手势。
 * 切走标签页/切到别的 App：渐出至静音后暂停，回来从原进度渐入。
 * 页面卸载时立即收尾；前进/后退缓存恢复后可继续渐入。
 * 同时用 MediaSession 把曲目信息交给系统媒体控件。
 * 是否启用由调用方按站内开关决定（见 js/chat.js）。
 */
(function () {
  'use strict';

  var VOLUME = 0.3;
  var SFX_VOLUME = 0.15;
  var FADE_MS = 1500;
  var FADE_OUT_MS = 650;
  var FADE_STEP_MS = 25;

  var el = null;        // 音乐层
  var sfx = null;       // 天气音效层
  var enabled = false;
  var theme = null;
  var moment = null;    // 时刻曲目（如 'bluehour'）
  var mood = null;
  var moodSrc = null;
  var candidates = [];
  var candidateIdx = 0;
  // 曲目切换和页面显隐分别控制音量，切标签页不会打断换曲的回调。
  var fades = { music: null, sfx: null, presence: null };
  var levels = { music: 0, sfx: 0, presence: document.hidden ? 0 : 1 };
  var pausedForVisibility = { music: false, sfx: false };
  var waitingForMusic = false;
  var waitingForSfx = false;
  var changingTrack = false;
  var currentTrack = null;
  var musicState = 'off';
  var pageHiding = false;
  var awayState = document.hidden;
  var mediaSessionReady = false;
  var waitingGesture = false;

  function isAway() { return pageHiding || document.hidden; }

  function stopFade(key) {
    if (fades[key] !== null) clearTimeout(fades[key]);
    fades[key] = null;
  }

  function setLevel(key, value) {
    levels[key] = value;
    if (el) el.volume = Math.max(0, Math.min(1, levels.music * levels.presence));
    if (sfx) sfx.volume = Math.max(0, Math.min(1, levels.sfx * levels.presence));
  }

  function fadeTo(key, target, done, ms) {
    stopFade(key);
    var dur = ms === undefined ? FADE_MS : ms;
    var from = levels[key], t0 = performance.now();
    function step() {
      var k = dur > 0 ? Math.min((performance.now() - t0) / dur, 1) : 1;
      var eased = k * k * (3 - 2 * k);
      setLevel(key, from + (target - from) * eased);
      // 后台标签页会停止 rAF；音频渐变使用计时器，并按实际经过时间收尾。
      if (k < 1) fades[key] = setTimeout(step, FADE_STEP_MS);
      else { fades[key] = null; if (done) done(); }
    }
    step();
  }

  function tryPlay(elm) {
    var p = elm.play();
    if (p && p.catch) p.catch(function (e) {
      if (e && e.name === 'NotAllowedError') {
        if (elm === el) publishMusic('waiting');
        waitGesture();
      }
    });
  }

  function waitGesture() {
    if (waitingGesture) return;
    waitingGesture = true;
    var once = function () {
      document.removeEventListener('pointerdown', once);
      document.removeEventListener('keydown', once);
      waitingGesture = false;
      if (!enabled || isAway()) return;
      if (el && el.paused && el.src) tryPlay(el);
      if (sfx && sfx.paused && moodSrc) tryPlay(sfx);
    };
    document.addEventListener('pointerdown', once);
    document.addEventListener('keydown', once);
  }

  function pauseForVisibility() {
    if (el && !el.paused) { pausedForVisibility.music = enabled; el.pause(); }
    if (sfx && !sfx.paused) { pausedForVisibility.sfx = enabled && !!mood; sfx.pause(); }
  }

  function onVisibility() {
    var away = isAway();
    if (away === awayState) return;
    awayState = away;
    if (!enabled) return;
    if (away) {
      fadeTo('presence', 0, function () {
        if (enabled && isAway()) pauseForVisibility();
      }, FADE_OUT_MS);
      return;
    }
    if (pausedForVisibility.music && el && el.src) {
      pausedForVisibility.music = false;
      tryPlay(el);
    }
    if (pausedForVisibility.sfx && sfx && moodSrc) {
      pausedForVisibility.sfx = false;
      tryPlay(sfx);
    }
    fadeTo('presence', 1);
  }

  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', function () {
    pageHiding = true;
    awayState = true;
    // 导航/刷新可能立即冻结或销毁页面，不能等待异步渐变结束。
    stopFade('presence');
    setLevel('presence', 0);
    pauseForVisibility();
  });
  window.addEventListener('pageshow', function () {
    pageHiding = false;
    onVisibility();
  });

  // ---- 系统媒体会话：让锁屏 / 系统媒体面板认识这个站 ----
  function trackLabel(src) {
    if (!src) return '';
    var s = String(src).split('?')[0].split('/').pop() || '';
    try { s = decodeURIComponent(s); } catch (e) {}
    return s.replace(/\.[a-z0-9]{2,4}$/i, '');
  }

  function setMediaMeta() {
    if (!('mediaSession' in navigator) || !window.MediaMetadata) return;
    var title = currentTrack ? currentTrack.title : trackLabel(el && el.src) || '氛围音乐';
    var artist = currentTrack ? currentTrack.artist : (theme && theme.persona && theme.persona.name) || document.title || '';
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: title,
        artist: artist,
        album: (theme && (theme.label || theme.id)) || ''
      });
    } catch (e) {}
  }

  function publishMusic(state) {
    musicState = enabled ? state : 'off';
    if (document.dispatchEvent && window.CustomEvent) {
      document.dispatchEvent(new CustomEvent('musicchange', {
        detail: { enabled: enabled, state: musicState, track: currentTrack }
      }));
    }
  }

  function setPlaybackState(state) {
    publishMusic(state);
    if (!('mediaSession' in navigator)) return;
    try { navigator.mediaSession.playbackState = state; } catch (e) {}
  }

  function ensureMediaSession() {
    if (!('mediaSession' in navigator) || mediaSessionReady) return;
    mediaSessionReady = true;
    setMediaMeta();
    // 系统面板上的播放/暂停只切总开关，保持与站内「音乐」按钮同一份状态
    try {
      navigator.mediaSession.setActionHandler('play', function () { window.AmbientAudio.setEnabled(true); });
      navigator.mediaSession.setActionHandler('pause', function () { window.AmbientAudio.setEnabled(false); });
      navigator.mediaSession.setActionHandler('stop', function () { window.AmbientAudio.setEnabled(false); });
    } catch (e) {}
  }

  // ---- 音乐层 ----
  function ensureEl() {
    if (el) return;
    el = new Audio();
    el.loop = true;
    el.playsInline = true;
    el.volume = 0;
    el.addEventListener('error', onError);
    el.addEventListener('playing', function () {
      if (!enabled) { el.pause(); return; }
      if (isAway() && levels.presence === 0) {
        pausedForVisibility.music = true;
        el.pause();
        return;
      }
      if (waitingForMusic) {
        waitingForMusic = false;
        fadeTo('music', VOLUME);
      }
      setPlaybackState('playing');
    });
    el.addEventListener('pause', function () { setPlaybackState('paused'); });
    ensureMediaSession();
  }

  function onError() {
    if (!enabled || changingTrack) return;
    candidateIdx++;
    if (candidateIdx < candidates.length) load(candidates[candidateIdx]);
    else publishMusic('unavailable');
  }

  function buildCandidates(t) {
    var list = [];
    var library = window.MusicLibrary;
    if (library && t && t.musicTrack) {
      var tracks = [];
      var momentTrack = library.get(moment);
      if (momentTrack) tracks.push(momentTrack);
      else if (moment) list.push(/^https?:\/\//.test(moment) ? moment : 'assets/audio/' + moment + '.mp3');
      tracks.push(t.musicTrack);
      tracks = tracks.concat(t.musicFallbacks || [], library.forTheme('default'));
      tracks.forEach(function (track) { if (list.indexOf(track.src) === -1) list.push(track.src); });
      tracks.forEach(function (track) { if (track.download && list.indexOf(track.download) === -1) list.push(track.download); });
      return list;
    }
    if (moment) list.push(/^https?:\/\//.test(moment) ? moment : 'assets/audio/' + moment + '.mp3'); // 时刻曲目优先（蓝调时刻等），可配直链
    if (t && t.music) list.push(t.music); // 主题可直接指定远程 URL（如 Pixabay CDN 直链）
    if (t && t.id) list.push('assets/audio/' + t.id + '.mp3');
    if (t && t.season && t.season !== t.id) list.push('assets/audio/' + t.season + '.mp3');
    list.push('assets/audio/default.mp3');
    return list;
  }

  function load(src) {
    stopFade('music');
    setLevel('music', 0);
    waitingForMusic = true;
    currentTrack = window.MusicLibrary ? window.MusicLibrary.findSource(src) : null;
    el.src = src;
    setMediaMeta(); // 换曲后同步系统媒体信息
    publishMusic('loading');
    if (isAway()) pausedForVisibility.music = true;
    else tryPlay(el);
  }

  function startPlayback() {
    changingTrack = false;
    candidates = buildCandidates(theme);
    candidateIdx = 0;
    load(candidates[0]);
  }

  function changeTrack() {
    waitingForMusic = false;
    changingTrack = true;
    fadeTo('music', 0, startPlayback);
  }

  // ---- 天气音效层 ----
  var SFX_EXTS = ['mp3', 'wav']; // 无转码工具时可直接放 .wav
  var sfxCandidates = [], sfxIdx = 0;

  function ensureSfx() {
    if (sfx) return;
    sfx = new Audio();
    sfx.loop = true;
    sfx.volume = 0;
    sfx.addEventListener('playing', function () {
      if (!enabled || !mood || !moodSrc) { sfx.pause(); return; }
      if (isAway() && levels.presence === 0) {
        pausedForVisibility.sfx = true;
        sfx.pause();
        return;
      }
      if (waitingForSfx) {
        waitingForSfx = false;
        fadeTo('sfx', SFX_VOLUME);
      }
    });
    sfx.addEventListener('error', function () {
      if (!enabled || !mood) return;
      sfxIdx++;
      if (sfxIdx < sfxCandidates.length) loadSfx(sfxCandidates[sfxIdx]);
      // 全部缺失：安静跳过
    });
  }

  function loadSfx(src) {
    stopFade('sfx');
    setLevel('sfx', 0);
    waitingForSfx = true;
    moodSrc = src;
    sfx.src = src;
    if (isAway()) pausedForVisibility.sfx = true;
    else tryPlay(sfx);
  }

  function applyMood() {
    if (!enabled) return; // 总开关关闭时只记 mood，保持安静
    if (!mood) {
      stopFade('sfx');
      waitingForSfx = false;
      pausedForVisibility.sfx = false;
      if (sfx && moodSrc) fadeTo('sfx', 0, function () { sfx.pause(); moodSrc = null; });
      return;
    }
    ensureSfx();
    var next = SFX_EXTS.map(function (e) { return 'assets/audio/' + mood + '.' + e; });
    if (sfxCandidates[0] === next[0] && moodSrc) {
      stopFade('sfx');
      waitingForSfx = true;
      if (isAway()) pausedForVisibility.sfx = true;
      else if (sfx.paused) tryPlay(sfx);
      else { waitingForSfx = false; fadeTo('sfx', SFX_VOLUME); }
      return;
    }
    sfxCandidates = next;
    sfxIdx = 0;
    fadeTo('sfx', 0, function () {
      loadSfx(sfxCandidates[0]);
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
      if (enabled === !!on) return;
      enabled = !!on;
      if (!enabled) {
        pausedForVisibility.music = false;
        pausedForVisibility.sfx = false;
        publishMusic('off');
        if (el) fadeTo('music', 0, function () { el.pause(); }, FADE_OUT_MS);
        if (sfx) fadeTo('sfx', 0, function () { sfx.pause(); }, FADE_OUT_MS);
        return;
      }
      stopFade('presence');
      setLevel('presence', isAway() ? 0 : 1);
      ensureEl();
      startPlayback();
      applyMood();
    },
    setTheme: function (t) {
      var sameTrack = theme && t && buildCandidates(theme)[0] === buildCandidates(t)[0];
      theme = t;
      if (!enabled || !el) return;
      // 相邻节气共用曲目时保留播放进度，也保留正在进行的切换。
      if (sameTrack && !changingTrack) { setMediaMeta(); return; }
      changeTrack(); // 淡出换曲再淡入
    },
    setMoment: function (m) {
      m = m || null;
      if (m === moment) return;
      moment = m;
      if (!enabled || !el) return;
      // 链首候选不变就不换曲（例如时刻曲目缺失、已在播回退曲目时离开蓝调时刻）
      if (candidates[candidateIdx] === buildCandidates(theme)[0]) return;
      changeTrack();
    },
    setMood: function (m) {
      mood = m || null;
      applyMood();
    },
    isEnabled: function () { return enabled; },
    getState: function () { return { enabled: enabled, state: musicState, track: currentTrack }; }
  };
})();

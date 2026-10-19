/*
 * 聊天引擎：消息渲染、打字机节奏、意图路由、历史续聊。
 */
(function () {
  'use strict';

  var theme = window.__theme;
  var SITE = window.SITE;
  var STORE_KEY = 'homepage.chat.v1';
  var MAX_HISTORY = 100;

  var $msgs = document.getElementById('messages');
  var $quick = document.getElementById('quick-replies');
  var $form = document.getElementById('composer');
  var $input = document.getElementById('composer-input');
  var $motion = document.getElementById('motion-toggle');

  // ---- 动效开关：首次访问默认开，之后沿用访客的选择 ----
  var MOTION_KEY = 'homepage.motion.v1';

  function storedMotion() {
    try { return localStorage.getItem(MOTION_KEY); } catch (e) { return null; }
  }
  var reducedMotion = storedMotion() === 'off';

  function syncParticles() {
    if (!window.Particles) return;
    if (reducedMotion) window.Particles.stop();
    else window.Particles.start(theme.particles, theme.vars['--accent'], theme);
  }

  function renderMotionBtn() {
    $motion.setAttribute('aria-pressed', String(!reducedMotion));
    $motion.textContent = reducedMotion ? '动效：关' : '动效：开';
  }

  $motion.addEventListener('click', function () {
    reducedMotion = !reducedMotion;
    try { localStorage.setItem(MOTION_KEY, reducedMotion ? 'off' : 'on'); } catch (e) {}
    document.documentElement.dataset.motion = reducedMotion ? 'reduce' : 'full';
    renderMotionBtn();
    syncParticles();
  });

  // ---- 氛围音乐开关：首次访问默认开，之后沿用访客的选择 ----
  // 自动播放被拦截时，由 js/audio.js 等待首次点击/按键后重试。
  var MUSIC_KEY = 'homepage.music.v1';
  var $music = document.getElementById('music-toggle');
  var musicOn = (function () {
    try { return localStorage.getItem(MUSIC_KEY) !== 'off'; } catch (e) { return true; }
  })();

  function renderMusicBtn() {
    $music.setAttribute('aria-pressed', String(musicOn));
    $music.textContent = musicOn ? '音乐：开' : '音乐：关';
  }

  document.addEventListener('musicchange', function (event) {
    if (musicOn !== event.detail.enabled) {
      musicOn = event.detail.enabled;
      try { localStorage.setItem(MUSIC_KEY, musicOn ? 'on' : 'off'); } catch (e) {}
    }
    renderMusicBtn();
  });

  $music.addEventListener('click', function () {
    musicOn = !musicOn;
    try { localStorage.setItem(MUSIC_KEY, musicOn ? 'on' : 'off'); } catch (e) {}
    renderMusicBtn();
    if (window.AmbientAudio) window.AmbientAudio.setEnabled(musicOn); // 点击本身是合法手势
  });

  // ---- 跟随天气：默认关；打开后请求定位，拉 Open-Meteo 当前天气，叠加音效层 ----
  // 定位权限被拒 / 拉取失败都安静跳过，不影响其他功能
  var WEATHER_KEY = 'homepage.weather.v1';
  var $weather = document.getElementById('weather-toggle');
  var weatherTimer = null;
  var weatherOn = (function () {
    try { return localStorage.getItem(WEATHER_KEY) === 'on'; } catch (e) { return false; }
  })();

  function renderWeatherBtn() {
    $weather.setAttribute('aria-pressed', String(weatherOn));
    $weather.textContent = weatherOn ? '天气：开' : '天气：关';
  }

  // WMO 天气码 → 音效档位
  function moodFromCode(code) {
    if (code === 95 || code === 96 || code === 99) return 'thunder';      // 雷暴
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain'; // 毛毛雨/雨/阵雨
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'wind'; // 雪
    return null;
  }

  function fetchWeather(lat, lon) {
    var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat +
      '&longitude=' + lon + '&current=weather_code';
    return fetch(url).then(function (r) { return r.json(); }).then(function (d) {
      var code = d && d.current && d.current.weather_code;
      if (window.AmbientAudio) window.AmbientAudio.setMood(moodFromCode(code));
    });
  }

  // ---- 蓝调时刻：太阳在地平线下 4°–8°（民用晨昏蒙影深处），早晚各一段，约 20–40 分钟 ----
  // 有经纬度 + 时间即可本地算太阳高度角，无需网络。每分钟检查一次。
  var blueTimer = null;
  // 蓝调时刻曲目：本地文件名（对应 assets/audio/<名字>.mp3）或 http(s) 直链
  var BLUEHOUR_TRACK = 'reverie';

  function sunElevation(lat, lon, date) {
    var rad = Math.PI / 180;
    var doy = Math.floor((Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) -
      Date.UTC(date.getUTCFullYear(), 0, 0)) / 86400000);
    var utcMin = date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
    var B = (360 / 365) * (doy - 81) * rad;
    var eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B); // 均时差（分钟）
    var decl = -23.44 * Math.cos((360 / 365) * (doy + 10) * rad);              // 赤纬（度）
    var hourAngle = ((utcMin + eot + 4 * lon) / 4 - 180) * rad;                // 时角（东经为正）
    var latR = lat * rad, dR = decl * rad;
    return Math.asin(Math.sin(latR) * Math.sin(dR) +
      Math.cos(latR) * Math.cos(dR) * Math.cos(hourAngle)) / rad;
  }

  function checkBlueHour(lat, lon) {
    if (!window.AmbientAudio) return;
    var e = sunElevation(lat, lon, new Date());
    window.AmbientAudio.setMoment(e <= -4 && e >= -8 ? BLUEHOUR_TRACK : null);
  }

  function startBlueHour(lat, lon) {
    checkBlueHour(lat, lon);
    blueTimer = setInterval(function () { checkBlueHour(lat, lon); }, 60 * 1000);
  }

  function stopBlueHour() {
    clearInterval(blueTimer); blueTimer = null;
    if (window.AmbientAudio) window.AmbientAudio.setMoment(null);
  }

  function startWeather() {
    if (!('geolocation' in navigator)) { weatherOn = false; renderWeatherBtn(); return; }
    navigator.geolocation.getCurrentPosition(function (pos) {
      // 坐标裁到两位小数（约 1km 精度），够用也更克制
      var lat = parseFloat(pos.coords.latitude.toFixed(2));
      var lon = parseFloat(pos.coords.longitude.toFixed(2));
      fetchWeather(lat, lon).catch(function () {});
      clearInterval(weatherTimer);
      weatherTimer = setInterval(function () {
        fetchWeather(lat, lon).catch(function () {});
      }, 30 * 60 * 1000); // 半小时刷新一次天气
      startBlueHour(lat, lon); // 蓝调时刻纯本地计算，同一组坐标复用
    }, function () {
      // 拒绝定位：安静关闭开关
      weatherOn = false;
      try { localStorage.setItem(WEATHER_KEY, 'off'); } catch (e) {}
      renderWeatherBtn();
    });
  }

  function stopWeather() {
    clearInterval(weatherTimer); weatherTimer = null;
    stopBlueHour();
    if (window.AmbientAudio) window.AmbientAudio.setMood(null);
  }

  $weather.addEventListener('click', function () {
    weatherOn = !weatherOn;
    try { localStorage.setItem(WEATHER_KEY, weatherOn ? 'on' : 'off'); } catch (e) {}
    renderWeatherBtn();
    if (weatherOn) startWeather(); else stopWeather();
  });

  // ---- 外观 ----
  function applyPersona() {
    document.getElementById('avatar').textContent = theme.label ? theme.label.charAt(0) : theme.persona.avatar;
    document.getElementById('peer-name').textContent = theme.persona.name;
    document.getElementById('peer-status').textContent = theme.persona.status;
    document.title = SITE.profile.name + ' · 主页';
  }

  // ---- 口令解锁 ----
  // 源码只存口令的 SHA-256 哈希；命中后解锁隐藏主题和 locked 内容。
  var KEY_STORE = 'homepage.key.v1';
  var unlocked = false;

  function sha256Hex(s) {
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (b) {
        return ('0' + b.toString(16)).slice(-2);
      }).join('');
    });
  }

  function secretConfigured() {
    return SITE.secret && SITE.secret.sha256 && SITE.secret.sha256.indexOf('REPLACE') !== 0;
  }

  function tryUnlock(key) {
    if (!key || !secretConfigured()) return Promise.resolve(false);
    return sha256Hex(key.trim()).then(function (h) {
      if (h !== SITE.secret.sha256.toLowerCase()) return false;
      unlocked = true;
      try { localStorage.setItem(KEY_STORE, key.trim()); } catch (e) {}
      return true;
    }).catch(function () { return false; });
  }

  // ---- 工具 ----
  function rand(min, max) { return min + Math.random() * (max - min); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function delay(ms) { return new Promise(function (r) { setTimeout(r, reducedMotion ? 0 : ms); }); }

  function esc(s) {
    return s.replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function scrollBottom() {
    $msgs.scrollTop = $msgs.scrollHeight;
  }

  // ---- 历史 ----
  function loadHistory() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || []; }
    catch (e) { return []; }
  }
  function saveMsg(side, html) {
    var h = loadHistory();
    h.push({ side: side, html: html, ts: Date.now() });
    if (h.length > MAX_HISTORY) h = h.slice(-MAX_HISTORY);
    try { localStorage.setItem(STORE_KEY, JSON.stringify(h)); } catch (e) {}
  }

  // ---- 渲染 ----
  function addMsg(side, html, opts) {
    opts = opts || {};
    var li = document.createElement('li');
    li.className = 'msg ' + side + (opts.hongbao ? ' hongbao' : '');
    var time = new Date(opts.ts || Date.now());
    var ts = ('0' + time.getHours()).slice(-2) + ':' + ('0' + time.getMinutes()).slice(-2);
    li.innerHTML = '<div class="bubble">' + html + '</div><span class="ts">' + ts + '</span>';
    if (li.querySelector('.sd')) li.classList.add('spire-response');
    $msgs.appendChild(li);
    scrollBottom();
    if (!opts.restore) saveMsg(side, html);
    hydrateProjects(li);
    return li;
  }

  var typingEl = null;
  function typingOn() {
    typingEl = document.createElement('li');
    typingEl.className = 'msg bot typing';
    typingEl.innerHTML = '<div class="bubble"><i></i><i></i><i></i></div>';
    $msgs.appendChild(typingEl);
    scrollBottom();
  }
  function typingOff() {
    if (typingEl) { typingEl.remove(); typingEl = null; }
  }

  // 机器人逐条回复：typing -> 延迟 -> 冒出
  var chain = Promise.resolve();
  function botSay(items) {
    chain = chain.then(function () {
      return items.reduce(function (p, item) {
        return p.then(function () {
          if (item && item.instant) {
            addMsg('bot', item.html);
            if (item.onShown) item.onShown();
            return;
          }
          typingOn();
          return delay(rand(theme.typingDelay[0], theme.typingDelay[1])).then(function () {
            typingOff();
            if (typeof item === 'string') item = { html: item };
            addMsg('bot', item.html, { hongbao: item.hongbao });
            return delay(250);
          });
        });
      }, Promise.resolve());
    });
    return chain;
  }

  // ---- 六爻占卜：对话里问事 → 掷六次铜钱 → 成卦释义 + 排盘 ----
  var liuyao = null; // { stage: 'ask'|'toss', question, tosses }
  var chartTexts = []; // 排盘文本注册表，供“复制排盘”按钮按序号取

  function liuyaoTossLabel() {
    return '🪙 掷铜钱（第' + (liuyao.tosses.length + 1) + '次）';
  }
  function liuyaoReplies() {
    return [
      { label: liuyaoTossLabel(), action: function () { liuyaoToss(); } },
      { label: '不占了', action: function () { liuyaoCancel(); } }
    ];
  }

  function startLiuyao() {
    if (!window.LiuYao) return ['占卜模块没加载出来，刷新试试？'];
    liuyao = { stage: 'ask', question: '', tosses: [] };
    renderQuickReplies([{ label: '不占了', action: function () { liuyaoCancel(); } }]);
    return [
      '好，铜钱备好。🪙',
      '六爻讲究「一事一占」：先说说你想问什么（事业、感情、财运……都行），然后默想此事，连掷六次铜钱成卦。',
      '你问的是？'
    ];
  }

  function liuyaoCancel() {
    liuyao = null;
    renderQuickReplies();
    botSay(['好，这事就先放着，想占了随时来。']);
  }

  function liuyaoAsk(text) {
    liuyao.question = text.slice(0, 50);
    liuyao.stage = 'toss';
    renderQuickReplies(liuyaoReplies());
    botSay(['记下了。默想此事，开始掷铜钱——从下往上，一共六次。']);
  }

  // 掷一次；用户消息由调用方负责回显（按钮在 renderQuickReplies 里，输入在 userSend 里）
  function liuyaoToss() {
    if (!liuyao || liuyao.stage !== 'toss') return;
    var t = LiuYao.toss();
    liuyao.tosses.push(t);
    var n = liuyao.tosses.length;
    var coinStr = t.coins.map(function (c) { return c === 3 ? '字' : '背'; }).join('·');
    var msgs = [
      '第' + n + '掷：' + coinStr + ' —— ' + t.name + ' ' + (t.yang ? '⚊' : '⚋') +
        (t.moving ? '（动爻 ' + t.mark + '）' : ''),
      { html: '<pre class="chart">' + esc(LiuYao.progress(liuyao.tosses)) + '</pre>' }
    ];
    if (n < 6) {
      renderQuickReplies(liuyaoReplies());
      botSay(msgs);
    } else {
      finishLiuyao(msgs);
    }
  }

  function finishLiuyao(msgs) {
    var chart = LiuYao.build(liuyao.tosses, liuyao.question, new Date());
    var text = LiuYao.format(chart);
    chartTexts.push(text);
    var idx = chartTexts.length - 1;
    msgs.push('卦成了：' + chart.ben.hex.n +
      (chart.bian ? ' 之 ' + chart.bian.hex.n : '（六爻安静，无动爻）') + '。');
    msgs.push('《' + chart.ben.hex.n + '》' + chart.ben.hex.c + ' —— ' + chart.ben.hex.b);
    if (chart.bian) msgs.push('变卦《' + chart.bian.hex.n + '》：' + chart.bian.hex.b);
    msgs.push('更细的断法（用神、生克、应期）我就不逞能了——这是完整排盘，复制给 AI 让它细断 👇');
    msgs.push({
      html: '<pre class="chart">' + esc(text) + '</pre>' +
        '<button type="button" class="copy-chart" data-idx="' + idx + '">复制排盘</button>'
    });
    liuyao = null;
    renderQuickReplies();
    botSay(msgs);
  }

  // “复制排盘”按钮（事件委托，历史消息恢复后按钮失效则静默忽略）
  $msgs.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('.copy-chart') : null;
    if (!btn) return;
    var text = chartTexts[+btn.getAttribute('data-idx')];
    if (!text || !navigator.clipboard) return;
    navigator.clipboard.writeText(text).then(function () { btn.textContent = '已复制 ✓'; });
  });

  // ---- 口袋地牢：房间二选一 + 骰子战斗 ----
  var SPIRE_KEY = 'homepage.spire.v2';
  var spire = null;
  var spireReady = false;

  function spireLoad() {
    try {
      var saved = JSON.parse(localStorage.getItem(SPIRE_KEY));
      return window.Spire && window.Spire.isValidRun(saved) ? saved : null;
    } catch (e) { return null; }
  }

  function spireFinished(run) { return !run || run.phase === 'over' || run.phase === 'won'; }

  function spireSave() {
    try {
      if (spire) localStorage.setItem(SPIRE_KEY, JSON.stringify(spire));
    } catch (e) {}
  }

  function spireHpBar(cur, max) {
    var pct = max > 0 ? Math.max(0, Math.min(100, Math.round(cur / max * 100))) : 0;
    return '<span class="sb-hp' + (pct <= 25 ? ' low' : '') + '"><i style="width:' + pct + '%"></i>' +
      '<b>' + cur + '/' + max + '</b></span>';
  }

  // 内联线条图标不依赖系统的 emoji 字体。
  function spireIcon(name) {
    var paths = {
      bat: '<path d="M12 10 9 6 8 9 2 5l1 10 5-2 4 6 4-6 5 2 1-10-6 4-1-3z"/>',
      golem: '<path d="m6 3 12 1 3 6-2 11H5L3 10zM8 9h1m6 0h1M9 16h6"/>',
      skeleton: '<path d="M5 14a9 9 0 1 1 14 0l-3 2v5H8v-5zM11 17v4m2-4v4"/><circle cx="8" cy="10" r="1.5"/><circle cx="16" cy="10" r="1.5"/><path d="m11 14 1-2 1 2"/>',
      camp: '<path d="M12 2c2 6 7 7 7 12a7 7 0 0 1-14 0c0-3 2-5 4-7 0 3 1 4 2 4 2-2 1-6 1-9zM9 22l8-2m-10 0 8 2"/>',
      treasure: '<path d="M3 11V8a5 5 0 0 1 5-5h8a5 5 0 0 1 5 5v3M3 11h18v10H3zM7 3v8m10-8v8"/><rect x="10" y="9" width="4" height="5" rx="1"/>',
      merchant: '<path d="M9 5V3a3 3 0 0 1 6 0v2M6 6h12l2 13H4zM7 22h10M8 6l1 13m7-13-1 13M9 11h6"/>',
      trap: '<path d="M2 20h20M3 20l3-10 3 10 3-14 3 14 3-10 3 10M5 4h3m9 0h2"/>',
      boss: '<path d="m3 6 5 5 4-8 4 8 5-5-2 13H5zM5 22h14"/>',
      unknown: '<path d="M5 22V3h14v19M2 22h20M10 9a2 2 0 1 1 3 2c-1 1-1 2-1 2m0 3v.1"/>'
    };
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (paths[name] || paths.unknown) + '</svg>';
  }

  function spireDie(value) {
    var positions = {
      1: [[12, 12]], 2: [[6, 6], [18, 18]], 3: [[6, 6], [12, 12], [18, 18]],
      4: [[6, 6], [18, 6], [6, 18], [18, 18]],
      5: [[6, 6], [18, 6], [12, 12], [6, 18], [18, 18]],
      6: [[6, 6], [18, 6], [6, 12], [18, 12], [6, 18], [18, 18]]
    };
    return '<svg viewBox="0 0 24 24" role="img" aria-label="骰子 ' + value + ' 点"><rect x="1" y="1" width="22" height="22" rx="4" fill="none" stroke="currentColor"/>' +
      positions[value].map(function (point) { return '<circle cx="' + point[0] + '" cy="' + point[1] + '" r="1.6" fill="currentColor"/>'; }).join('') + '</svg>';
  }

  function spireRoomCard(icon, tag, name, desc, hidden) {
    return '<div class="sd-room' + (hidden ? ' sd-hidden' : '') + '"><span class="sd-room-tag">' + esc(tag) + '</span>' +
      '<span class="sd-room-icon" aria-hidden="true">' + spireIcon(icon) + '</span><strong>' + esc(name) + '</strong>' +
      '<span class="sd-room-desc">' + esc(desc) + '</span></div>';
  }

  function spireBoard(run) {
    var v = window.Spire.view(run);
    var h = '<div class="sb sd" data-phase="' + esc(v.phase) + '">';
    h += '<div class="sd-heading"><strong>口袋地牢</strong><span>第 ' + v.floor + ' / 3 层</span></div>';
    h += '<div class="sd-route" aria-label="已探索 ' + v.cleared + ' / 9 间房">';
    for (var i = 0; i < 9; i++) {
      h += '<span class="sd-step' + (i < v.cleared ? ' done' : i === v.cleared ? ' current' : '') +
        (i === 3 || i === 6 ? ' sd-step-floor' : '') + '" aria-hidden="true"></span>';
    }
    h += '<span class="sd-route-end" aria-hidden="true">♜</span><small>' + (v.cleared === 9 ? '塔顶' : '房间 ' + v.room + ' / 3') + '</small></div>';
    h += '<div class="sb-row sb-me"><span class="sb-who">生命</span>' + spireHpBar(v.hp, v.maxHp) + '</div>';
    h += '<div class="sd-resources"><span>口粮 <b>' + v.food + '</b></span><span>金币 <b>' + v.gold +
      '</b></span><span>武器 <b>+' + v.weapon + '</b></span><span>护甲 <b>' + v.armor + '</b></span><span>药水 <b>' + v.potions + '</b></span></div>';
    if (v.known) {
      h += '<div class="sd-rooms">' + spireRoomCard(v.known.icon, '明牌 · 看得见的选择', v.known.name, v.known.desc, false) +
        spireRoomCard('unknown', '暗牌 · 试试运气', '另一扇门', '也许是补给，也许是危险。推开后必须接受。', true) + '</div>';
    } else if (v.foe) {
      h += '<div class="sd-enemy"><div class="sd-enemy-head"><strong><span aria-hidden="true">' + spireIcon(v.foe.icon) + '</span> ' + esc(v.foe.name) +
        '</strong><span>第 ' + v.turn + ' 回合</span></div><div class="sb-row sb-foe">' + spireHpBar(v.foe.hp, v.foe.maxHp) +
        '<span class="sd-enemy-attack">攻击 ' + v.foe.attack + '</span></div></div>';
    } else if (v.encounter) {
      h += '<div class="sd-encounter"><span aria-hidden="true">' + spireIcon(v.encounter.icon) + '</span><div><strong>' + esc(v.encounter.name) + '</strong><p>' + esc(v.encounter.desc) + '</p></div></div>';
    } else if (v.phase === 'stairs') {
      h += '<div class="sd-milestone"><span aria-hidden="true">↟</span><strong>歇一歇，再上一层</strong><p>带上一点成长，前面还有新的房间。</p></div>';
    } else if (v.phase === 'boss') {
      h += '<div class="sd-milestone"><span aria-hidden="true">♜</span><strong>最后一扇门</strong><p>塔顶守关者，正在等你。</p></div>';
    } else {
      h += '<div class="sb-result ' + (v.phase === 'won' ? 'sb-win' : 'sb-lose') + '">' +
        (v.phase === 'won' ? '✦ 满载而归' : '营火，等你再来') + '</div>';
      h += '<div class="sd-summary">探索 ' + v.cleared + ' 间房 · 击败 ' + v.kills + ' 个敌人 · 带回 ' + (v.phase === 'won' ? v.gold : 0) + ' 金币</div>';
    }
    if (v.roll) {
      h += '<div class="sd-roll"><span>' + esc(v.roll.purpose) + '</span><span class="sd-dice">' + v.roll.values.map(function (n) {
        return spireDie(n);
      }).join('') + '</span></div>';
    }
    if (v.log.length) h += '<div class="sd-log">' + v.log.map(function (line) { return '<p>' + esc(line) + '</p>'; }).join('') + '</div>';
    h += '<p class="sb-note">' + esc(v.note) + '</p>';
    h += '<details class="sd-rules"><summary>玩法小抄<span>种子 ' + v.seed + '</span></summary><p>' + esc(v.rules) + '</p>' +
      '<p>点下方按钮，或输入按钮前的数字。随时「暂存离开」，下次说「爬塔」继续。</p></details>';
    return h + '</div>';
  }

  function spireRender(run) {
    var snapshot = run;
    renderQuickReplies(window.Spire.actions(run).map(function (a, index) {
      var utility = a.id === 'potion' || a.id === 'quit';
      return {
        label: (index + 1) + ' ' + a.label,
        cls: 'spire-action' + (utility ? ' sa-utility' : ' sa-choice'),
        disabled: a.disabled || !spireReady,
        html: '<span class="sa-title"><small>' + (index + 1) + '</small><b>' + esc(a.name) + '</b></span>' +
          (a.desc ? '<span class="sa-desc">' + esc(a.desc) + '</span>' : ''),
        action: function () { if (spire === snapshot) spireAct(a.id); }
      };
    }));
  }

  function spirePanel(run) {
    return { html: spireBoard(run), instant: true, onShown: function () {
      if (spire === run) {
        spireReady = true;
        spireRender(run);
        // 按钮高度变化后重新定位；面板高于消息区时优先露出标题和资源。
        var panel = $msgs.lastElementChild;
        $msgs.scrollTop += panel.getBoundingClientRect().top - $msgs.getBoundingClientRect().top - 8;
      }
    } };
  }

  function spireAct(id) {
    if (!spire || !spireReady || !window.Spire) return;
    var res = window.Spire.act(spire, id);
    if (res.invalid) {
      botSay([{ html: '这个行动暂时不可用，看看口粮、金币或生命是否满足条件。', instant: true }]);
      return;
    }
    if (res.quit) {
      spire = null;
      spireReady = false;
      try { localStorage.setItem(SPIRE_KEY, JSON.stringify(res.run)); } catch (e) {}
      renderQuickReplies();
      botSay(res.log);
      return;
    }
    spire = res.run;
    spireReady = false;
    spireSave();
    spireRender(spire);
    botSay([spirePanel(spire)]);
  }

  function spireBegin(seed) {
    spire = window.Spire.newRun(seed);
    spireReady = false;
    spireSave();
    spireRender(spire);
    return [
      '提灯出发！这次是三层的「口袋地牢」：选房间、掷骰战斗、留点口粮上楼，最后击败塔顶守关者。点下方按钮就能玩，规则随时看面板里的「玩法小抄」。',
      spirePanel(spire)
    ];
  }

  function spireResume(saved) {
    spire = saved;
    spireReady = false;
    spireSave();
    spireRender(spire);
    botSay([{ html: '灯还亮着，接着走。', instant: true }, spirePanel(spire)]);
  }

  function startSpire() {
    if (!window.Spire) return ['爬塔模块没加载出来，刷新试试？'];
    if (spire && !spireFinished(spire)) {
      spireRender(spire);
      return ['还在地牢里呢，点下面的按钮继续。想歇歇就「暂存离开」。'];
    }
    spire = null;
    var saved = spireLoad();
    if (saved && !spireFinished(saved)) {
      renderQuickReplies([
        { label: '继续这局', cls: 'spire-action', action: function () { spireResume(saved); } },
        { label: '重新开一局', cls: 'spire-action', action: function () { botSay(spireBegin()); } },
        { label: '先聊聊', action: function () { renderQuickReplies(); } }
      ]);
      return ['上次停在第 ' + saved.floor + ' 层，生命 ' + saved.hp + '/' + saved.maxHp +
        '，口粮 ' + saved.food + '，金币 ' + saved.gold + '。继续这局，还是重新出发？'];
    }
    var legacy = null;
    try { legacy = JSON.parse(localStorage.getItem('homepage.spire.v1')); } catch (e) {}
    var opening = spireBegin();
    if (!saved && legacy && legacy.deck && !spireFinished(legacy)) {
      opening.unshift('爬塔已换成轻量的骰子地牢。旧版卡牌存档已保留，但无法按新规则续玩；这次会单独保存。');
    }
    return opening;
  }

  // ---- 私信小纸条：访客写留言，直接进站主邮箱 ----
  function startNote() {
    if (!window.Note) return ['小纸条模块没加载出来，刷新试试？'];
    if (!window.Note.ready()) return ['小纸条还没接通，站主配好密钥就能用了。'];
    return [
      '给你一张小纸条——写完点「递出去」，内容会直接进我邮箱，别人看不到。',
      { html: window.Note.card() }
    ];
  }

  // ---- 意图 ----
  function renderProjectCards(projects) {
    var html = '<div class="cards project-cards">';
    projects.forEach(function (p) {
      if (p.locked && !unlocked) return;
      html += '<a class="card project-card" href="' + esc(p.link) + '" target="_blank" rel="noopener">' +
        '<span class="project-card-top"><span class="card-tag">' + esc(p.tag || '代码仓库') + '</span><span aria-hidden="true">↗</span></span>' +
        '<strong>' + esc(p.title) + '</strong>' +
        '<span class="project-description">' + esc(p.desc || '还没有写项目介绍，去仓库看看吧。') + '</span>';
      if (typeof p.stars === 'number') {
        html += '<span class="project-meta"><span aria-label="' + p.stars + ' 个 Star">☆ ' + p.stars + '</span>' +
          '<span aria-label="' + p.forks + ' 个 Fork"><svg class="project-fork-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 5v2a4 4 0 0 0 4 4m4-6v2a4 4 0 0 1-4 4v2"/><circle cx="4" cy="3" r="2"/><circle cx="12" cy="3" r="2"/><circle cx="8" cy="14" r="1.5"/></svg>' + p.forks + '</span>';
        if (p.updatedAt) html += '<time datetime="' + esc(p.updatedAt) + '">更新于 ' + esc(p.updatedAt.slice(0, 10).replace(/-/g, '.')) + '</time>';
        html += '</span>';
      }
      html += '</a>';
    });
    return html + '</div>';
  }

  function projectCards() {
    if (!window.GitHubProjects || !window.GitHubProjects.available()) return renderProjectCards(SITE.profile.projects);
    return '<div class="project-collection" data-github-projects aria-busy="true">' +
      '<p class="project-loading" role="status">正在看看 GitHub 上的项目…</p></div>';
  }

  function hydrateProjects(li) {
    var panel = li.querySelector('[data-github-projects]');
    if (!panel) return;
    li.classList.add('project-response');
    function render(result) {
      if (!panel.isConnected) return;
      var nearBottom = $msgs.scrollHeight - $msgs.scrollTop - $msgs.clientHeight < 64;
      var automatic = ['live', 'cache', 'stale'].indexOf(result.source) !== -1;
      var projects = automatic ? result.projects.concat(SITE.profile.projects.filter(function (p) { return p.locked && unlocked; })) : SITE.profile.projects;
      var user = (SITE.githubProjects && SITE.githubProjects.username) || (window.IDENTITY && window.IDENTITY.github);
      panel.innerHTML = '<div class="project-heading"><strong>公开作品</strong><span>' +
        (automatic ? 'GitHub · 最近推送' : '项目选集') + '</span></div>' +
        (projects.length ? renderProjectCards(projects) : '<p class="project-empty">还没有可展示的公开项目，之后再来看看吧。</p>') +
        (result.source === 'stale' ? '<p class="project-note">这是上次看到的项目，最新动态可以去 GitHub 看看。</p>' : '') +
        (!automatic ? '<p class="project-note">先看看这几项作品，更多项目在 GitHub。</p>' : '') +
        (user ? '<a class="project-more" href="https://github.com/' + encodeURIComponent(user) + '?tab=repositories" target="_blank" rel="noopener">去 GitHub 看全部 <span aria-hidden="true">↗</span></a>' : '');
      panel.setAttribute('aria-busy', 'false');
      // 列表展开时先展示第一张卡片；访客已向上翻阅则保留其位置。
      if (nearBottom) {
        if (li.offsetHeight > $msgs.clientHeight) $msgs.scrollTop += li.getBoundingClientRect().top - $msgs.getBoundingClientRect().top - 16;
        else scrollBottom();
      }
    }
    if (!window.GitHubProjects) { render({ source: 'fallback', projects: [] }); return; }
    window.GitHubProjects.load().then(render, function () { render({ source: 'fallback', projects: [] }); });
  }

  function contactCard() {
    var html = '<div class="cards">';
    SITE.profile.contacts.forEach(function (c) {
      html += '<a class="card" href="' + esc(c.href) + '" target="_blank" rel="noopener">' +
        '<strong>' + esc(c.label) + '</strong><span>' + esc(c.value) + '</span></a>';
    });
    return html + '</div>';
  }

  function intentReply(intent) {
    switch (intent) {
      case 'who':
        return SITE.profile.bio.slice();
      case 'projects':
        return ['做过的部分项目，点卡片就能去看看：', { html: projectCards() }];
      case 'now':
        return SITE.profile.now.slice();
      case 'contact':
        return ['这是我的“名片”，随时来撩：', { html: contactCard() }];
      case 'liuyao':
        return startLiuyao();
      case 'spire':
        return startSpire();
      case 'note':
        return startNote();
      case 'bainian':
        return [
          '给你拜年啦！🎊',
          '祝你新的一年：代码一次跑通，需求永不改稿，想做的事都能成。',
          { html: '🧧 赛博红包拿好，图个吉利！', hongbao: true }
        ];
      case 'birthday-wish':
        return ['谢谢！🎂', '愿望分你一个：愿你也被这个世界温柔以待。'];
      case 'chat':
        return [pick(SITE.smalltalk)];
      default:
        return [pick(SITE.fallback)];
    }
  }

  // ---- 路由 ----
  function route(text) {
    var lower = text.toLowerCase();
    for (var i = 0; i < SITE.keywords.length; i++) {
      var k = SITE.keywords[i];
      if (k.themeOnly && k.themeOnly !== theme.id) continue;
      var hit = k.keys.some(function (key) { return lower.indexOf(key.toLowerCase()) !== -1; });
      if (!hit) continue;
      if (k.intent) return intentReply(k.intent);
      return k.reply.map(function (r, idx) {
        return (k.hongbao && idx === 0) ? { html: r, hongbao: true } : r;
      });
    }
    // 数字/字母较多的“真问题”兜底提示用快捷回复，纯闲聊用 smalltalk
    return [pick(text.length <= 6 ? SITE.smalltalk : SITE.fallback)];
  }

  function userSend(text) {
    text = text.trim();
    if (!text) return;
    addMsg('user', esc(text));
    // 占卜流程中的输入优先接管：取消 / 记下所问 / 记一掷
    if (liuyao) {
      if (/^(不占了?|取消|算了)/.test(text)) liuyaoCancel();
      else if (liuyao.stage === 'ask') liuyaoAsk(text);
      else liuyaoToss();
      return;
    }
    // 地牢进行中：数字与行动名称接管输入，避免闲聊冲掉游戏按钮
    if (spire) {
      if (/^(不玩了|退出|放弃|quit|stop)$/i.test(text)) { spireAct('quit'); return; }
      var spireMove = window.Spire ? window.Spire.matchText(spire, text) : null;
      if (spireMove) { spireAct(spireMove); return; }
      botSay(['还在地牢里。点下方按钮，或输入按钮前的数字，也可以说「攻击」「强攻」「喝药」。输入「不玩了」会暂存离开。']);
      return;
    }
    // 任何输入都先悄悄试一次口令；命中则原地切到隐藏主题，未命中走正常路由
    tryUnlock(text).then(function (ok) {
      if (!ok) { botSay(route(text)); return; }
      // 原地换装，不再 location.reload()——重载会打断正在播的氛围音乐
      var unlockT = ThemeEngine.get(SITE.secret.unlocksTheme || 'birthday');
      botSay(['🎂 暗号正确！为你打开隐藏主题…']).then(function () {
        return delay(1000);
      }).then(function () {
        switchTheme(unlockT);
        if (!unlockT) botSay(['这个主题暂时没配好，不过暗号我记住了。']);
      });
    });
  }

  // ---- 快捷回复 ----
  // 传 items 时渲染临时按钮（占卜流程用，带 action）；不传则回到当前主题的常驻按钮
  // 小纸条入口：密钥配好了才出现，附在常驻快捷回复最后（各主题通用，不用逐主题改）
  function noteEntry() {
    if (!SITE.note || !window.Note || !window.Note.ready() || !SITE.note.quickReply) return [];
    return [{ label: SITE.note.quickReply, intent: 'note' }];
  }

  function renderQuickReplies(items) {
    $quick.innerHTML = '';
    $quick.classList.toggle('spire-controls', !!(spire && items));
    (items && items.length ? items : theme.quickReplies.concat(noteEntry())).forEach(function (q) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.disabled = !!q.disabled;
      // label 同时作为读屏名称和点击后的回显；禁用动作也使用原生 disabled。
      if (q.html) btn.innerHTML = q.html; else btn.textContent = q.label;
      btn.setAttribute('aria-label', q.label);
      if (q.cls) btn.className = q.cls;
      btn.addEventListener('click', function () {
        addMsg('user', esc(q.label));
        if (q.action) { q.action(); return; }
        botSay(intentReply(q.intent));
      });
      $quick.appendChild(btn);
    });
  }

  // ---- 事件 ----
  $form.addEventListener('submit', function (e) {
    e.preventDefault();
    var v = $input.value;
    $input.value = '';
    userSend(v);
  });

  document.getElementById('clear-chat').addEventListener('click', function () {
    localStorage.removeItem(STORE_KEY);
    $msgs.innerHTML = '';
    greet(false);
    if (spire) {
      spireReady = false;
      spireRender(spire);
      botSay([spirePanel(spire)]);
    }
  });

  // ---- 开场 ----
  function greet(returning) {
    var lines;
    if (returning) {
      lines = theme.returnGreetings ? [pick(theme.returnGreetings)]
        : ['又见面了。👋', '接着上次聊？'];
    } else {
      lines = [pick(theme.greetings)];
      if (Math.random() < 0.5 && theme.greetings.length > 1) {
        var second = pick(theme.greetings);
        if (second !== lines[0]) lines.push(second);
      }
      lines.push('不知道从何聊起的话，试试下面的快捷回复 👇');
    }
    botSay(lines);
  }

  // ---- 主题切换：原地换装，不重载页面（重载会把音乐一起带走） ----
  // 同时负责刷新问候语、快捷回复、粒子与背景音乐，等价于原来 location.reload() 后的效果
  function switchTheme(t) {
    if (!t) return false;
    theme = t;
    ThemeEngine.apply(t);
    applyPersona();
    if (spire) spireRender(spire);
    else if (liuyao) renderQuickReplies(liuyaoReplies());
    else renderQuickReplies();
    syncParticles();
    if (window.AmbientAudio) window.AmbientAudio.setTheme(theme);
    return true;
  }

  document.addEventListener('theme-request', function (event) {
    switchTheme(ThemeEngine.select(event.detail));
  });

  // 跨过午夜（或跨过按小时命中的规则）时重新解析主题，只在真的变了的时候换装。
  // 用定期检查而不是一次性定时器，避免标签页休眠/系统挂起把定时器拖偏。
  function scheduleThemeRefresh() {
    function check() {
      // 拿着暗号解锁过隐藏主题的访客不做自动换装，保持他解锁到的样子
      var storedKey = null;
      try { storedKey = localStorage.getItem(KEY_STORE); } catch (e) {}
      if (storedKey && secretConfigured()) return;
      var next = ThemeEngine.resolve(new Date());
      if (!next) return;
      // 只在主题真的变了才换装——每小时都重启一次音乐就本末倒置了
      if (next.id !== theme.id) switchTheme(next);
    }
    var now = new Date();
    var midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 3);
    setTimeout(function () {
      check();
      setInterval(check, 30 * 1000);
    }, midnight - now);
  }

  function start() {
    applyPersona();
    renderQuickReplies();
    var history = loadHistory();
    if (history.length) {
      history.forEach(function (m) {
        addMsg(m.side, m.html, { restore: true, ts: m.ts });
      });
      greet(true);
    } else {
      greet(false);
    }
    // 有没走完的地牢就提一句；入口不占常驻快捷回复
    var savedRun = spireLoad();
    if (savedRun && !spireFinished(savedRun)) {
      botSay(['（对了，上次那局爬塔还停在第 ' + savedRun.floor + ' 层，说「爬塔」就能接着走。）']);
    }
    scheduleThemeRefresh();

    renderMotionBtn();
    syncParticles();
    renderMusicBtn();
    if (window.AmbientAudio) {
      window.AmbientAudio.setTheme(theme);
      window.AmbientAudio.setEnabled(musicOn);
    }
    renderWeatherBtn();
    if (weatherOn) startWeather();
  }

  function boot() {
    // 口令来源：URL ?key= 优先，其次 localStorage 里存过的
    var urlKey = new URLSearchParams(location.search).get('key');
    var stored = null;
    try { stored = localStorage.getItem(KEY_STORE); } catch (e) {}
    var candidate = urlKey || stored;
    var check = candidate ? tryUnlock(candidate) : Promise.resolve(false);
    check.then(function (ok) {
      if (ok) {
        if (urlKey && history.replaceState) {
          history.replaceState(null, '', location.pathname); // 抹掉 URL 里的口令
        }
        var t = ThemeEngine.get(SITE.secret.unlocksTheme || 'birthday');
        if (t) switchTheme(t);
      }
      start();
    });
  }

  boot();
})();

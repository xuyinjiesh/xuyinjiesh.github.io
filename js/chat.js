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

  // ---- 动效开关：站内显式设置优先于系统 prefers-reduced-motion ----
  var MOTION_KEY = 'homepage.motion.v1';
  var motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

  function storedMotion() {
    try { return localStorage.getItem(MOTION_KEY); } catch (e) { return null; }
  }
  function effectiveReduced() {
    var v = storedMotion();
    if (v === 'off') return true;
    if (v === 'on') return false;
    return motionQuery.matches;
  }
  var reducedMotion = effectiveReduced();

  function syncParticles() {
    if (!window.Particles) return;
    if (reducedMotion) window.Particles.stop();
    else window.Particles.start(theme.particles, theme.vars['--accent']);
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

  // ---- 氛围音乐开关：默认关，记住选择 ----
  // 浏览器禁止手势前播放：回访时若记住了“开”，等首次点击/按键再开播
  var MUSIC_KEY = 'homepage.music.v1';
  var $music = document.getElementById('music-toggle');
  var musicOn = (function () {
    try { return localStorage.getItem(MUSIC_KEY) === 'on'; } catch (e) { return false; }
  })();

  function renderMusicBtn() {
    $music.setAttribute('aria-pressed', String(musicOn));
    $music.textContent = musicOn ? '音乐：开' : '音乐：关';
  }

  $music.addEventListener('click', function () {
    musicOn = !musicOn;
    try { localStorage.setItem(MUSIC_KEY, musicOn ? 'on' : 'off'); } catch (e) {}
    renderMusicBtn();
    if (window.AmbientAudio) window.AmbientAudio.setEnabled(musicOn); // 点击本身是合法手势
  });

  function armMusicAutoplay() {
    if (!musicOn || !window.AmbientAudio) return;
    var resume = function () {
      document.removeEventListener('pointerdown', resume);
      document.removeEventListener('keydown', resume);
      window.AmbientAudio.setEnabled(true);
    };
    document.addEventListener('pointerdown', resume);
    document.addEventListener('keydown', resume);
  }

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
  var BLUEHOUR_TRACK = 'https://cdn.pixabay.com/audio/2026/06/23/audio_c81d83c3db.mp3';

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
    document.getElementById('avatar').textContent = theme.persona.avatar;
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
    $msgs.appendChild(li);
    scrollBottom();
    if (!opts.restore) saveMsg(side, html);
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

  // ---- 文字爬塔：按钮驱动的卡牌 Roguelike ----
  // 引擎（js/spire.js）只吃 run、吐 {run, log}；这里负责按钮、文案和存档。
  // 存档 key 跟聊天历史分开：聊天历史只存 HTML，刷新后按钮是死的，局面必须另存。
  var SPIRE_KEY = 'homepage.spire.v1';
  var spire = null; // 当前这一局；null = 不在局中

  function spireLoad() {
    try {
      var s = JSON.parse(localStorage.getItem(SPIRE_KEY));
      return (s && s.phase && s.deck) ? s : null;
    } catch (e) { return null; }
  }

  function spireFinished(run) { return !run || run.phase === 'over' || run.phase === 'won'; }

  function spireSave() {
    try {
      if (spire) localStorage.setItem(SPIRE_KEY, JSON.stringify(spire));
      else localStorage.removeItem(SPIRE_KEY);
    } catch (e) {}
  }

  // ---- 爬塔的展示层 ----
  // 引擎只给语义数据（几点能量、多少伤害、什么状态），图标和配色都在这一层决定；
  // 面板里的每个数字都来自 Spire.view()，渲染层不重算任何规则。
  var SPIRE_ICON = { cost: '⚡', dmg: '⚔', blk: '🛡', vuln: '💥', weak: '💧', heal: '✚', hp: '❤', buff: '💢' };

  function spireBadge(k, v, icon) {
    var ic = icon === undefined ? (SPIRE_ICON[k] || '') : icon;
    return '<i class="sb-b sb-' + k + '">' +
      (ic ? '<span aria-hidden="true">' + ic + '</span>' : '') + esc(String(v)) + '</i>';
  }

  function spireBadges(list) {
    return (list || []).map(function (b) { return spireBadge(b.k, b.v); }).join('');
  }

  // 日志高亮：引擎日志保持纯文本（可测、可复制），这里只把关键数字换成带图标的强调
  var SPIRE_LOG_RULES = [
    [/造成 (\d+) 点伤害/g, '造成 <b class="lg lg-dmg">⚔$1</b> 点伤害'],
    [/获得 (\d+) 点格挡/g, '获得 <b class="lg lg-blk">🛡$1</b> 点格挡'],
    [/回复了? (\d+) 点生命/g, '回复 <b class="lg lg-heal">✚$1</b> 点生命'],
    [/获得 (\d+) 层易伤/g, '获得 <b class="lg lg-vuln">💥$1</b> 层易伤'],
    [/获得 (\d+) 层虚弱/g, '获得 <b class="lg lg-weak">💧$1</b> 层虚弱'],
    [/还剩 (\d+) 点生命/g, '还剩 <b class="lg lg-hp">❤$1</b> 点生命'],
    [/剩余 (\d+) 点生命/g, '剩余 <b class="lg lg-hp">❤$1</b> 点生命'],
    [/格挡吸收 (\d+)/g, '格挡吸收 <b class="lg lg-blk">🛡$1</b>'],
    [/能量 (\d+)/g, '能量 <b class="lg lg-cost">⚡$1</b>'],
    [/需要 (\d+) 点/g, '需要 <b class="lg lg-cost">⚡$1</b> 点']
  ];

  function spireLog(line) {
    var h = esc(line);
    SPIRE_LOG_RULES.forEach(function (r) { h = h.replace(r[0], r[1]); });
    return h;
  }

  function spireHpBar(cur, max) {
    var pct = max > 0 ? Math.round(cur / max * 100) : 0;
    return '<span class="sb-hp' + (pct <= 25 ? ' low' : '') + '"><i style="width:' + pct + '%"></i>' +
      '<b>' + cur + '/' + max + '</b></span>';
  }

  function spireEnergy(cur, max) {
    var pips = '';
    for (var i = 0; i < max; i++) pips += '<span class="pip ' + (i < cur ? 'on' : 'off') + '">⚡</span>';
    return '<i class="sb-b sb-cost sb-energy" title="能量">' + pips + '<b>' + cur + '/' + max + '</b></i>';
  }

  // 敌人意图：图标 + 招式名 + 已经结算过的数字
  function spireIntent(it) {
    if (!it) return '';
    if (it.kind === 'block') return spireBadge('blk', it.name + ' +' + it.block, '🛡');
    if (it.kind === 'buff') return spireBadge('buff', it.name + ' 攻击+' + it.buff, '💢');
    var extra = '';
    if (it.weak) extra += ' +' + it.weak + '虚弱';
    if (it.heal) extra += ' +回复' + it.heal;
    return spireBadge('atk', it.name + ' ' + it.dmg + extra, '⚔');
  }

  function spireBoard(run) {
    var v = window.Spire ? window.Spire.view(run) : null;
    if (!v) return '';
    var h = '<div class="sb">';
    h += '<div class="sb-head"><span class="sb-floor">第 ' + v.floor + '/' + v.maxFloor + ' 层</span>' +
      '<span class="sb-seed">种子 ' + esc(String(v.seed)) + '</span></div>';

    if (v.phase === 'combat') {
      var me = spireEnergy(v.me.energy, v.me.maxEnergy);
      if (v.me.block) me += spireBadge('blk', v.me.block);
      if (v.me.vuln) me += spireBadge('vuln', '易伤 ' + v.me.vuln);
      if (v.me.weak) me += spireBadge('weak', '虚弱 ' + v.me.weak);
      h += '<div class="sb-row sb-me"><span class="sb-who">你</span>' + spireHpBar(v.hp, v.maxHp) +
        '<span class="sb-chips">' + me + '</span></div>';

      var f = v.foe, foe = spireIntent(f.intent);
      if (f.block) foe += spireBadge('blk', f.block);
      if (f.dmgBonus) foe += spireBadge('buff', '攻击+' + f.dmgBonus);
      if (f.vuln) foe += spireBadge('vuln', '易伤 ' + f.vuln);
      if (f.weak) foe += spireBadge('weak', '虚弱 ' + f.weak);
      h += '<div class="sb-row sb-foe"><span class="sb-who">' + esc(f.name) + (f.boss ? '👑' : '') + '</span>' +
        spireHpBar(f.hp, f.maxHp) + '<span class="sb-chips">' + foe + '</span></div>';

      h += '<div class="sb-foot"><span>🎴 抽牌 ' + v.piles.draw + '</span><span>♻ 弃牌 ' + v.piles.discard +
        '</span><span>✋ 手牌 ' + v.piles.hand + '</span><span>🕒 第 ' + v.piles.turn + ' 回合</span></div>';
    } else {
      h += '<div class="sb-row sb-me"><span class="sb-who">你</span>' + spireHpBar(v.hp, v.maxHp) + '</div>';
      if (v.phase === 'won') h += '<div class="sb-result sb-win">🏆 通关</div>';
      else if (v.phase === 'over') h += '<div class="sb-result sb-lose">💀 阵亡</div>';
      if (v.loot && v.loot.length) {
        h += '<div class="sb-loot">' + v.loot.map(function (c) {
          return '<span class="sb-card">' + esc(c.name) + spireBadges(c.badges) + '</span>';
        }).join('') + '</div>';
      }
      if (v.note) h += '<div class="sb-note">' + esc(v.note) + '</div>';
    }
    return h + '</div>';
  }

  // 卡牌按钮：名字 + 徽章（渲染层不认识「费 / 伤 / 格挡」，只认引擎给的 k）
  function spireActionItem(a) {
    var isCard = (a.kind === 'card' || a.kind === 'loot');
    var cls = 'spire-action';
    var html = null;
    if (isCard) {
      cls += ' sa-card' + (a.disabled ? ' sa-off' : '');
      html = '<b class="sa-name">' + esc(a.name) + '</b>' + spireBadges(a.badges) +
        (a.desc ? '<span class="sa-desc">' + esc(a.desc) + '</span>' : '');
    } else if (a.badges && a.badges.length) {
      html = '<span class="sa-name">' + esc(a.label) + '</span>' + spireBadges(a.badges);
    }
    return { label: a.label, cls: cls, html: html, action: function () { spireAct(a.id); } };
  }

  // 引擎给什么动作就渲染什么按钮；每次状态变更整组重建 = 天然的状态渲染
  function spireRender(run) {
    var acts = window.Spire ? window.Spire.actions(run) : [];
    renderQuickReplies(acts.map(spireActionItem));
  }

  function spirePanel(run) {
    return { html: spireBoard(run) };
  }

  // 状态先改完再发言：botSay 是异步打字链，绝不能把状态变更放在它的回调里
  function spireAct(id) {
    if (!spire || !window.Spire) return;
    var res = window.Spire.act(spire, id);
    if (res.quit) {
      // 退出也留着存档，回头说「爬塔」能接着打
      spire = null;
      try { localStorage.setItem(SPIRE_KEY, JSON.stringify(res.run)); } catch (e) {}
      renderQuickReplies();
      botSay(res.log.map(spireLog));
      return;
    }
    spire = res.run;
    spireSave();
    spireRender(spire);
    botSay(res.log.map(spireLog).concat([spirePanel(spire)]));
  }

  function spireBegin(seed) {
    spire = window.Spire.newRun(seed);
    var opening = spire.log.slice();
    spire.log = [];
    spireSave();
    spireRender(spire);
    return [
      '🃏 开爬！规则很简单：每回合 3 点能量，用《劈砍》《格挡》《猛击》把挡路的家伙敲掉，一直打到第 5 层的 Boss。',
      '点下面的按钮出牌，也可以直接输入 1/2/3 或「结束回合」；不想玩了就说「不玩了」。'
    ].concat(opening).concat([spirePanel(spire)]);
  }

  function spireResume(saved) {
    spire = saved;
    spireSave();
    spireRender(spire);
    botSay(['接着来。'].concat([spirePanel(spire)]));
  }

  function startSpire() {
    if (!window.Spire) return ['爬塔模块没加载出来，刷新试试？'];
    if (spire && !spireFinished(spire)) {
      spireRender(spire);
      return ['这一局还打着呢 —— 接着出牌吧。想撂下就说「不玩了」。'];
    }
    spire = null;
    var saved = spireLoad();
    if (saved && !spireFinished(saved)) {
      renderQuickReplies([
        { label: '继续这局', cls: 'spire-action', action: function () { spireResume(saved); } },
        { label: '重新开一局', cls: 'spire-action', action: function () { botSay(spireBegin()); } },
        { label: '算了', action: function () { renderQuickReplies(); } }
      ]);
      return [
        '上次爬到第 ' + saved.floor + ' 层，❤ ' + saved.hp + '/' + saved.maxHp + '，牌组 ' + saved.deck.length + ' 张。',
        '接着爬，还是重新来过？'
      ];
    }
    return spireBegin();
  }

  // ---- 意图 ----
  function projectCards() {
    var html = '<div class="cards">';
    SITE.profile.projects.forEach(function (p) {
      if (p.locked && !unlocked) return;
      html += '<a class="card" href="' + esc(p.link) + '" target="_blank" rel="noopener">' +
        '<span class="card-tag">' + esc(p.tag) + '</span>' +
        '<strong>' + esc(p.title) + '</strong>' +
        '<span>' + esc(p.desc) + '</span></a>';
    });
    return html + '</div>';
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
        return ['做过的部分项目：', { html: projectCards() }];
      case 'now':
        return SITE.profile.now.slice();
      case 'contact':
        return ['这是我的“名片”，随时来撩：', { html: contactCard() }];
      case 'liuyao':
        return startLiuyao();
      case 'spire':
        return startSpire();
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
    // 牌局进行中：输入接管（文字别名 / 退出），否则提示，避免闲聊把按钮冲掉
    if (spire) {
      if (/^(不玩了|退出|放弃|quit|stop)$/i.test(text)) { spireAct('quit'); return; }
      var spireMove = window.Spire ? window.Spire.matchText(spire, text) : null;
      if (spireMove) { spireAct(spireMove); return; }
      botSay(['现在在牌局里 —— 点下面的按钮行动，或者输入 1/2/3 选牌、「结束回合」；不想玩了就说「不玩了」。']);
      return;
    }
    // 任何输入都先悄悄试一次口令；命中则切换隐藏主题并重载，未命中走正常路由
    tryUnlock(text).then(function (ok) {
      if (!ok) { botSay(route(text)); return; }
      botSay(['🎂 暗号正确！为你打开隐藏主题…']).then(function () {
        return delay(1000);
      }).then(function () { location.reload(); });
    });
  }

  // ---- 快捷回复 ----
  // 传 items 时渲染临时按钮（占卜流程用，带 action）；不传则回到当前主题的常驻按钮
  function renderQuickReplies(items) {
    $quick.innerHTML = '';
    (items && items.length ? items : theme.quickReplies).forEach(function (q) {
      var btn = document.createElement('button');
      btn.type = 'button';
      // html 用于带徽章的按钮（爬塔的卡牌），label 同时作为读屏名称和点击后的回显
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
    // 有没打完的牌局就提一句；入口不占常驻快捷回复
    var savedRun = spireLoad();
    if (savedRun && !spireFinished(savedRun)) {
      botSay(['（对了，上次那局爬塔还停在第 ' + savedRun.floor + ' 层，说「爬塔」就能接着打。）']);
    }
    // 跨过午夜后刷新主题
    var now = new Date();
    var midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 3);
    setTimeout(function () { location.reload(); }, midnight - now);

    renderMotionBtn();
    syncParticles();
    renderMusicBtn();
    if (window.AmbientAudio) window.AmbientAudio.setTheme(theme);
    armMusicAutoplay();
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
        if (t) { theme = t; ThemeEngine.apply(t); }
      }
      start();
    });
  }

  boot();
})();

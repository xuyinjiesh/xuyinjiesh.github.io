/*
 * 文字版爬塔：杀戮尖塔式单角色卡牌 Roguelike 的纯逻辑引擎。
 *
 * 设计约定（跟 js/liuyao.js 一致，方便渲染层随便换）：
 *   - 不碰 DOM、不碰 localStorage，只吃 run 对象、吐 { run, log }；
 *   - 全部随机走 run.rng（mulberry32），同一种子可复现，存档里存种子就够了；
 *   - act() 不改传进来的 run，内部深拷贝，方便做回放/悔棋/测试；
 *   - 内容（卡牌 / 敌人）都是文件顶部的数据表，加内容不用动逻辑。
 *
 * 渲染层在 js/chat.js（按钮驱动），面板样式复用 css/style.css 的 pre.chart。
 */
(function () {
  'use strict';

  // ==================== 数据：卡牌 ====================
  // desc 用于奖励界面；dmg/block 是基础值，升级（up）时 +3
  var CARDS = {
    strike:  { name: '劈砍', cost: 1, desc: '造成 6 点伤害', dmg: 6 },
    defend:  { name: '格挡', cost: 1, desc: '获得 5 点格挡', block: 5 },
    bash:    { name: '猛击', cost: 2, desc: '造成 8 点伤害，施加 2 层易伤', dmg: 8, vuln: 2 },
    combo:   { name: '连击', cost: 1, desc: '造成 4 点伤害两次', dmg: 4, times: 2 },
    bulwark: { name: '铁壁', cost: 1, desc: '获得 8 点格挡', block: 8 },
    smash:   { name: '蛮力', cost: 2, desc: '造成 12 点伤害', dmg: 12 }
  };

  // 战后战利品池（阶段 1 只有这三张，之后往这里加就是了）
  var LOOT_POOL = ['combo', 'bulwark', 'smash'];

  // ==================== 数据：敌人 ====================
  // moves.kind: 'attack' | 'block' | 'buff'；weak 是给对方叠的虚弱层数，
  // heal 是自回血，buff 是永久攻击力成长（Boss 的狂暴）
  var ENEMIES = {
    slime: {
      name: '黏液球', hp: [15, 19], moves: [
        { name: '撞击', kind: 'attack', dmg: 6 },
        { name: '黏住', kind: 'attack', dmg: 5, weak: 1 }
      ]
    },
    bat: {
      name: '小蝙蝠', hp: [12, 16], moves: [
        { name: '撕咬', kind: 'attack', dmg: 6 },
        { name: '吸血', kind: 'attack', dmg: 4, heal: 4 }
      ]
    },
    king: {
      name: '黏液之王', hp: [106, 106], boss: true, moves: [
        { name: '重压', kind: 'attack', dmg: 12 },
        { name: '黏液喷吐', kind: 'attack', dmg: 7, weak: 2 },
        { name: '硬化', kind: 'block', block: 10 },
        { name: '狂暴', kind: 'buff', buff: 3 }
      ]
    }
  };

  // 普通敌人按楼层变强（Boss 不吃这张表，它自己就是数值）
  var FLOOR_SCALE = [
    { hp: 1, dmg: 0 },
    { hp: 1.3, dmg: 2 },
    { hp: 1.6, dmg: 4 },
    { hp: 1.9, dmg: 6 }
  ];

  var FLOORS = 5;          // 第 5 层是 Boss
  var MAX_ENERGY = 3;
  var DRAW_PER_TURN = 5;
  var HAND_LIMIT = 10;
  var NUM = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];

  // ==================== 随机：mulberry32 ====================
  function rnd(run) {
    run.rng = (run.rng + 0x6D2B79F5) >>> 0;
    var t = run.rng;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function randInt(run, min, max) { return min + Math.floor(rnd(run) * (max - min + 1)); }
  function shuffle(run, arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rnd(run) * (i + 1));
      var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
  }

  function log(run, line) { (run.log = run.log || []).push(line); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  // ==================== 卡牌 ====================
  function entry(id) { return { id: id, up: 0 }; }

  function stats(e) {
    var c = CARDS[e.id];
    var up = e.up || 0;
    return {
      id: e.id,
      name: c.name + (up ? '+' : ''),
      cost: c.cost,
      desc: c.desc,
      dmg: c.dmg ? c.dmg + (up ? 3 : 0) : 0,
      times: c.times || 1,
      block: c.block ? c.block + (up ? 3 : 0) : 0,
      vuln: c.vuln || 0
    };
  }

  function startDeck() {
    var d = [], i;
    for (i = 0; i < 5; i++) d.push(entry('strike'));
    for (i = 0; i < 4; i++) d.push(entry('defend'));
    d.push(entry('bash'));
    return d;
  }

  // ==================== 伤害结算 ====================
  // 虚弱：造成伤害 ×0.75；易伤：受到伤害 ×1.5（都向下取整，跟原作手感一致）
  function calcDmg(base, attacker, target) {
    var d = base;
    if (attacker && attacker.weak > 0) d = Math.floor(d * 0.75);
    if (target && target.vuln > 0) d = Math.floor(d * 1.5);
    return Math.max(0, d);
  }

  function damagePlayer(run, amount) {
    var c = run.combat;
    var toHp = Math.max(0, amount - c.block);
    var absorbed = amount - toHp;
    c.block -= Math.min(c.block, amount);
    run.hp -= toHp;
    return { toHp: toHp, absorbed: absorbed };
  }

  // ==================== 敌人 ====================
  function spawnEnemy(run, id, floor) {
    var t = ENEMIES[id];
    var sc = t.boss ? { hp: 1, dmg: 0 } : FLOOR_SCALE[Math.min(floor, FLOOR_SCALE.length) - 1];
    var hp = randInt(run, Math.round(t.hp[0] * sc.hp), Math.round(t.hp[1] * sc.hp));
    return {
      id: id, name: t.name, hp: hp, maxHp: hp,
      block: 0, vuln: 0, weak: 0, boss: !!t.boss,
      dmgBonus: sc.dmg, move: null, lastMove: -1
    };
  }

  // 随机挑一个意图，尽量不跟上一回合重复；伤害在这里一次性定死（含楼层加成），
  // 这样「预告的数字」和「真正打出来的数字」永远是同一个值
  function rollMove(run, e) {
    var moves = ENEMIES[e.id].moves;
    var idx = randInt(run, 0, moves.length - 1);
    if (moves.length > 1 && idx === e.lastMove) idx = (idx + 1) % moves.length;
    e.lastMove = idx;
    var m = moves[idx];
    e.move = {
      name: m.name, kind: m.kind,
      dmg: m.dmg ? m.dmg + (e.dmgBonus || 0) : 0,
      block: m.block || 0, weak: m.weak || 0, heal: m.heal || 0, buff: m.buff || 0
    };
  }

  function intentText(run) {
    var e = run.combat.enemy, m = e.move;
    if (!m) return '意图：不明';
    if (m.kind === 'block') return '意图：' + m.name + '（获得 ' + m.block + ' 格挡）';
    if (m.kind === 'buff') return '意图：' + m.name + '（攻击力永久 +' + m.buff + '）';
    var d = calcDmg(m.dmg, e, run.combat);
    var extra = [];
    if (m.weak) extra.push('+' + m.weak + ' 虚弱');
    if (m.heal) extra.push('回复 ' + m.heal);
    return '意图：' + m.name + '（' + d + ' 点伤害' + (extra.length ? ' ' + extra.join(' ') : '') + '）';
  }

  // ==================== 回合流程 ====================
  function beginCombat(run, floor) {
    var id = floor >= FLOORS ? 'king' : (rnd(run) < 0.5 ? 'slime' : 'bat');
    var e = spawnEnemy(run, id, floor);
    run.combat = {
      enemy: e, energy: 0, maxEnergy: MAX_ENERGY,
      hand: [], draw: [], discard: [],
      block: 0, vuln: 0, weak: 0, turn: 0
    };
    run.phase = 'combat';
    run.reward = null;
    // 战斗用的是牌组副本，升级状态跟着走；原 deck 顺序不受影响
    run.combat.draw = shuffle(run, run.deck.map(function (x) { return { id: x.id, up: x.up || 0 }; }));
    rollMove(run, e);
    log(run, '第 ' + floor + ' 层：' + e.name + ' 挡住了去路！' + (e.boss ? ' 👑 Boss 战' : ''));
    startPlayerTurn(run);
  }

  function startPlayerTurn(run) {
    var c = run.combat;
    c.turn++;
    c.block = 0;                 // 格挡只在自己回合开始时清空
    c.energy = c.maxEnergy;
    drawCards(run, DRAW_PER_TURN);
    log(run, '—— 你的第 ' + c.turn + ' 回合：能量 ' + c.energy + '，手牌 ' + c.hand.length + ' 张 ——');
  }

  function drawCards(run, n) {
    var c = run.combat, i;
    for (i = 0; i < n; i++) {
      if (c.hand.length >= HAND_LIMIT) { log(run, '手牌满了，抽不下更多。'); return; }
      if (!c.draw.length) {
        if (!c.discard.length) { log(run, '牌堆和弃牌堆都空了，没牌可抽。'); return; }
        c.draw = shuffle(run, c.discard);
        c.discard = [];
        log(run, '弃牌堆洗回抽牌堆。');
      }
      c.hand.push(c.draw.pop());
    }
  }

  function hurtEnemy(run, dmg) {
    var e = run.combat.enemy;
    var toHp = Math.max(0, dmg - e.block);
    var absorbed = dmg - toHp;
    e.block -= Math.min(e.block, dmg);
    e.hp -= toHp;
    log(run, '你对 ' + e.name + ' 造成 ' + toHp + ' 点伤害' +
      (absorbed ? '（格挡吸收 ' + absorbed + '）' : '') + '，它还剩 ' + Math.max(0, e.hp) + ' 点生命。');
  }

  function playCard(run, idx) {
    var c = run.combat;
    var e = c.hand[idx];
    if (!e) return;
    var s = stats(e);
    if (c.energy < s.cost) { log(run, '能量不够，《' + s.name + '》打不出去（需要 ' + s.cost + ' 点）。'); return; }

    c.energy -= s.cost;
    c.hand.splice(idx, 1);
    c.discard.push(e);
    log(run, '你打出《' + s.name + '》。');

    if (s.block) {
      c.block += s.block;
      log(run, '获得 ' + s.block + ' 点格挡，当前格挡 ' + c.block + '。');
    }
    for (var i = 0; i < s.times; i++) {
      if (c.enemy.hp <= 0) break;
      hurtEnemy(run, calcDmg(s.dmg, c, c.enemy));
    }
    if (s.vuln && c.enemy.hp > 0) {
      c.enemy.vuln += s.vuln;
      log(run, c.enemy.name + ' 获得 ' + s.vuln + ' 层易伤。');
    }
    if (c.enemy.hp <= 0) winCombat(run);
  }

  function endPlayerTurn(run) {
    var c = run.combat;
    if (c.vuln > 0) c.vuln--;
    if (c.weak > 0) c.weak--;
    c.discard = c.discard.concat(c.hand);
    c.hand = [];
    log(run, '—— ' + c.enemy.name + ' 的回合 ——');
    enemyAct(run);
  }

  function enemyAct(run) {
    var c = run.combat, e = c.enemy, m = e.move;
    e.block = 0;
    if (m.kind === 'block') {
      e.block += m.block;
      log(run, e.name + ' 使出「' + m.name + '」，获得 ' + m.block + ' 点格挡。');
    } else if (m.kind === 'buff') {
      e.dmgBonus += m.buff;
      log(run, e.name + ' 使出「' + m.name + '」，攻击力永久 +' + m.buff + '（现在每次攻击 +' + e.dmgBonus + '）。');
    } else {
      var d = calcDmg(m.dmg, e, c);
      var res = damagePlayer(run, d);
      log(run, e.name + ' 使出「' + m.name + '」，对你造成 ' + res.toHp + ' 点伤害' +
        (res.absorbed ? '（格挡吸收 ' + res.absorbed + '）' : '') + '，你剩余 ' + Math.max(0, run.hp) + ' 点生命。');
      if (m.weak) { c.weak += m.weak; log(run, '你获得 ' + m.weak + ' 层虚弱。'); }
      if (m.heal) {
        e.hp = Math.min(e.maxHp, e.hp + m.heal);
        log(run, e.name + ' 回复了 ' + m.heal + ' 点生命。');
      }
    }
    if (run.hp <= 0) {
      run.hp = 0;
      run.phase = 'over';
      run.combat = null;
      log(run, '💀 你倒在了第 ' + run.floor + ' 层。');
      return;
    }
    if (e.vuln > 0) e.vuln--;
    if (e.weak > 0) e.weak--;
    rollMove(run, e);
    startPlayerTurn(run);
  }

  function winCombat(run) {
    var e = run.combat.enemy;
    e.hp = 0;
    log(run, e.name + ' 被击倒了！');
    run.combat = null;
    if (run.floor >= run.maxFloor) {
      run.phase = 'won';
      log(run, '🏆 黏液之王倒下了，你爬到了塔顶 —— 通关！');
      return;
    }
    run.phase = 'reward';
    run.reward = shuffle(run, LOOT_POOL.slice()).slice(0, 2);
    log(run, '战斗结束。挑一样战利品，然后继续向上。');
  }

  function advance(run) {
    run.reward = null;
    run.floor++;
    log(run, '你沿楼梯继续向上……');
    beginCombat(run, run.floor);
  }

  // ==================== 对外接口 ====================
  function newRun(seed) {
    var s;
    if (seed === undefined || seed === null || seed === '') {
      s = Math.floor(Math.random() * 1000000000);
    } else {
      s = Math.abs(parseInt(String(seed).replace(/\D/g, ''), 10));
      if (!s) s = 1;
    }
    var run = {
      seed: s, rng: s >>> 0,
      phase: 'combat', floor: 1, maxFloor: FLOORS,
      hp: 70, maxHp: 75,
      deck: startDeck(), combat: null, reward: null, log: []
    };
    beginCombat(run, 1);
    return run;
  }

  // 徽章只描述「语义」（几点能量、多少伤害、多少格挡…），画成什么图标由渲染层决定
  function cardBadges(s) {
    var b = [{ k: 'cost', v: s.cost }];
    if (s.dmg) b.push({ k: 'dmg', v: s.times > 1 ? s.dmg + '×' + s.times : s.dmg });
    if (s.block) b.push({ k: 'blk', v: s.block });
    if (s.vuln) b.push({ k: 'vuln', v: s.vuln });
    return b;
  }

  function actions(run) {
    if (!run) return [];
    if (run.phase === 'combat') {
      var c = run.combat;
      var list = c.hand.map(function (e, i) {
        var s = stats(e);
        var bits = ['· ' + s.cost + '费'];
        if (s.dmg) bits.push('· ' + s.dmg + '伤' + (s.times > 1 ? '×' + s.times : ''));
        if (s.block) bits.push('· ' + s.block + '格挡');
        return {
          id: 'card:' + i,
          kind: 'card',
          name: s.name,
          badges: cardBadges(s),
          disabled: c.energy < s.cost,
          label: NUM[i] + ' ' + s.name + ' ' + bits.join(' ') + (c.energy < s.cost ? '（能量不足）' : '')
        };
      });
      list.push({ id: 'end', kind: 'end', label: '结束回合 ▶' });
      list.push({ id: 'quit', kind: 'quit', label: '不玩了' });
      return list;
    }
    if (run.phase === 'reward') {
      var l = run.reward.map(function (id) {
        var s = stats({ id: id, up: 0 });
        return {
          id: 'card:' + id, kind: 'loot', name: s.name, desc: s.desc,
          badges: cardBadges(s), label: '🃏 ' + CARDS[id].name + ' · ' + CARDS[id].desc
        };
      });
      if (run.hp < run.maxHp) {
        l.push({ id: 'food', kind: 'food', badges: [{ k: 'heal', v: 6 }], label: '🍞 干粮 · 回复 6 点生命' });
      }
      l.push({ id: 'skip', kind: 'skip', label: '跳过' });
      return l;
    }
    if (run.phase === 'over' || run.phase === 'won') {
      return [
        { id: 'restart', kind: 'restart', label: '🔁 再来一局' },
        { id: 'quit', kind: 'quit', label: '不玩了' }
      ];
    }
    return [];
  }

  function act(run, id) {
    var r = clone(run);
    r.log = [];

    if (id === 'quit') {
      log(r, '好，这局先撂这儿，想接着爬随时喊我。');
      return { run: r, log: r.log, quit: true };
    }
    if (id === 'restart') {
      var fresh = newRun(null);
      fresh.log.push('🃏 好，重新来过 —— 新的塔，新的运气。');
      return { run: fresh, log: fresh.log };
    }
    if (r.phase === 'combat') {
      if (id === 'end') endPlayerTurn(r);
      else if (id.indexOf('card:') === 0) playCard(r, +id.slice(5));
    } else if (r.phase === 'reward') {
      if (id === 'skip') {
        log(r, '你什么都没拿，继续上路。');
        advance(r);
      } else if (id === 'food') {
        r.hp = Math.min(r.maxHp, r.hp + 6);
        log(r, '你啃了口干粮，回复 6 点生命。');
        advance(r);
      } else if (id.indexOf('card:') === 0) {
        var cid = id.slice(5);
        if (CARDS[cid]) {
          r.deck.push(entry(cid));
          log(r, '你把《' + CARDS[cid].name + '》收进了牌组。');
          advance(r);
        }
      }
    }
    return { run: r, log: r.log };
  }

  // 文字输入别名：1-9 选牌、卡名选牌、结束回合
  function matchText(run, text) {
    var t = String(text || '').trim();
    if (!t) return null;
    if (/^(结束|结束回合|过|end|e|pass)$/i.test(t)) return 'end';
    if (run && run.phase === 'combat') {
      var m = t.match(/^([1-9]|10)$/);
      if (m) {
        var i = +m[1] - 1;
        if (run.combat.hand[i]) return 'card:' + i;
      }
      for (var k = 0; k < run.combat.hand.length; k++) {
        if (stats(run.combat.hand[k]).name === t) return 'card:' + k;
      }
    }
    return null;
  }

  // ==================== 文本面板 ====================
  function bar(cur, max) {
    var n = 12;
    var f = max > 0 ? Math.round(n * Math.max(0, cur) / max) : 0;
    if (f > n) f = n;
    var s = '';
    for (var i = 0; i < n; i++) s += i < f ? '█' : '░';
    return s;
  }

  function render(run) {
    if (!run) return '';
    var L = [];
    L.push('══ 文字爬塔 · 第 ' + run.floor + '/' + run.maxFloor + ' 层 · 种子 ' + run.seed + ' ══');
    var me = ['[' + bar(run.hp, run.maxHp) + '] ' + Math.max(0, run.hp) + '/' + run.maxHp];
    if (run.phase === 'combat') {
      var c = run.combat, e = c.enemy;
      me.push('⚡' + c.energy + '/' + c.maxEnergy);
      if (c.block) me.push('🛡' + c.block);
      if (c.weak) me.push('虚弱×' + c.weak);
      if (c.vuln) me.push('易伤×' + c.vuln);
      L.push('你  ' + me.join('  '));
      var foe = ['[' + bar(e.hp, e.maxHp) + '] ' + Math.max(0, e.hp) + '/' + e.maxHp];
      if (e.block) foe.push('🛡' + e.block);
      if (e.dmgBonus) foe.push('攻击+' + e.dmgBonus);
      if (e.weak) foe.push('虚弱×' + e.weak);
      if (e.vuln) foe.push('易伤×' + e.vuln);
      L.push('敌  ' + e.name + (e.boss ? '👑' : '') + ' ' + foe.join('  '));
      L.push('    ' + intentText(run));
      L.push('牌堆  抽 ' + c.draw.length + ' · 弃 ' + c.discard.length + ' · 手牌 ' + c.hand.length + ' · 第 ' + c.turn + ' 回合');
    } else {
      L.push('你  ' + me.join('  '));
      if (run.phase === 'reward') L.push('🃏 战利品：挑一张牌收进牌组，或者啃口干粮。');
      else if (run.phase === 'won') L.push('🏆 通关！这一局的种子是 ' + run.seed + '。');
      else L.push('💀 你倒在了第 ' + run.floor + ' 层。牌组里还剩 ' + run.deck.length + ' 张牌。');
    }
    return L.join('\n');
  }

  // ==================== 结构化视图 ====================
  // 给渲染层用的「数据版战况」：渲染层不用懂规则，也不需要自己算虚弱/易伤，
  // 拿到的每个数字都已经结算过（比如意图伤害已含虚弱和你的易伤）。
  function cardView(e, i, energy) {
    var s = stats(e);
    return {
      i: i, name: s.name, cost: s.cost, dmg: s.dmg, times: s.times, block: s.block,
      vuln: s.vuln, playable: energy >= s.cost, badges: cardBadges(s)
    };
  }

  function view(run) {
    if (!run) return null;
    var v = {
      floor: run.floor, maxFloor: run.maxFloor, seed: run.seed, phase: run.phase,
      hp: Math.max(0, run.hp), maxHp: run.maxHp, me: null, foe: null,
      piles: null, hand: [], loot: null, note: ''
    };
    if (run.phase === 'combat') {
      var c = run.combat, e = c.enemy;
      v.me = { block: c.block, energy: c.energy, maxEnergy: c.maxEnergy, weak: c.weak, vuln: c.vuln };
      v.foe = {
        name: e.name, boss: !!e.boss, hp: Math.max(0, e.hp), maxHp: e.maxHp,
        block: e.block, weak: e.weak, vuln: e.vuln, dmgBonus: e.dmgBonus || 0,
        intent: e.move ? {
          kind: e.move.kind, name: e.move.name,
          dmg: calcDmg(e.move.dmg, e, c),
          block: e.move.block, buff: e.move.buff, weak: e.move.weak, heal: e.move.heal
        } : null
      };
      v.piles = { draw: c.draw.length, discard: c.discard.length, hand: c.hand.length, turn: c.turn };
      v.hand = c.hand.map(function (h, i) { return cardView(h, i, c.energy); });
    } else if (run.phase === 'reward') {
      v.loot = (run.reward || []).map(function (id) { return cardView({ id: id, up: 0 }, 0, 0); });
      v.note = '战斗结束，挑一样战利品，然后继续向上。';
    } else if (run.phase === 'won') {
      v.note = '第 5 层的守护者倒下了，这一局的种子是 ' + run.seed + '。';
    } else {
      v.note = '你倒在了第 ' + run.floor + ' 层，牌组里还剩 ' + run.deck.length + ' 张牌。';
    }
    return v;
  }

  window.Spire = {
    newRun: newRun,
    actions: actions,
    act: act,
    render: render,
    view: view,
    matchText: matchText,
    // 供渲染层做提示文案用
    cardName: function (id) { return CARDS[id] ? CARDS[id].name : id; }
  };
})();

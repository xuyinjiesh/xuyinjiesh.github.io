/*
 * 口袋地牢：三层、房间二选一、骰子战斗。
 * 纯逻辑引擎，不访问 DOM 或存储。act 不修改输入；所有局内随机使用存档中的 rng。
 * 借鉴 Iron Helm 的明暗房间选择与 Mini Rogue 的轻量资源管理，规则为本站原创简化版。
 */
(function () {
  'use strict';

  var VERSION = 2;
  var FLOORS = 3;
  var ROOMS = 3;
  var ENEMIES = [
    { name: '洞穴蝙蝠', icon: 'bat', hp: 6, attack: 2 },
    { name: '苔石守卫', icon: 'golem', hp: 9, attack: 1 },
    { name: '游荡骷髅', icon: 'skeleton', hp: 7, attack: 2 }
  ];
  var ROOM_TYPES = ['monster', 'monster', 'monster', 'camp', 'treasure', 'treasure', 'merchant', 'trap'];
  var ROOMS_INFO = {
    camp: { name: '余温营火', icon: 'camp', desc: '休息回复 7 点生命，或收集 2 份口粮。' },
    treasure: { name: '遗落宝箱', icon: 'treasure', desc: '稳拿 4 金币，或掷骰寻找装备。' },
    merchant: { name: '提灯商人', icon: 'merchant', desc: '4 金币买补给，6 金币磨利武器；也可离开。' },
    trap: { name: '机关走廊', icon: 'trap', desc: '掷出 4–6 拆除机关得 3 金币，或花 1 口粮绕路。' }
  };
  var RULES = '共 3 层，每层 3 间房，塔顶还有守关者。每次选眼前的房间，或放弃它、进入未知房间。攻击 = 六面骰 + 武器；敌人存活就反击，护甲每次减伤。强攻花 1 口粮，掷两骰取高再 +2；药水回复 8 生命，不触发反击。前两层结束各吃 1 口粮，不够就损失 4 生命。';

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function log(run, text) { run.log.push(text); }
  function rnd(run) {
    run.rng = (run.rng + 0x6D2B79F5) >>> 0;
    var t = run.rng;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function randomInt(run, min, max) { return min + Math.floor(rnd(run) * (max - min + 1)); }
  function dice(run, count, purpose) {
    var values = [];
    for (var i = 0; i < count; i++) values.push(randomInt(run, 1, 6));
    run.lastRoll = { values: values, purpose: purpose };
    return Math.max.apply(null, values);
  }
  function heal(run, amount) {
    var actual = Math.min(amount, run.maxHp - run.hp);
    run.hp += actual;
    log(run, '回复 ' + actual + ' 点生命。');
  }
  function hurt(run, amount) {
    run.hp = Math.max(0, run.hp - amount);
    if (!run.hp) {
      run.phase = 'over';
      log(run, '你倒在第 ' + run.floor + ' 层。营火还在，下一次再来。');
    }
  }
  function makeRoom(run) {
    var type = ROOM_TYPES[randomInt(run, 0, ROOM_TYPES.length - 1)];
    if (type !== 'monster') return { type: type };
    var base = ENEMIES[randomInt(run, 0, ENEMIES.length - 1)];
    var hp = base.hp + (run.floor - 1) * 3;
    return { type: type, enemy: {
      name: base.name, icon: base.icon, hp: hp, maxHp: hp,
      attack: base.attack + run.floor - 1, boss: false
    } };
  }
  function roomView(room) {
    if (room.type === 'monster') {
      return { name: room.enemy.name, icon: room.enemy.icon, type: 'monster',
        desc: '生命 ' + room.enemy.maxHp + ' · 攻击 ' + room.enemy.attack + '。击败获得 3 金币。' };
    }
    var info = ROOMS_INFO[room.type];
    return { name: info.name, icon: info.icon, desc: info.desc, type: room.type };
  }
  function dealRooms(run) {
    run.phase = 'explore';
    run.encounter = null;
    run.combat = null;
    run.choices = [makeRoom(run), makeRoom(run)];
  }
  function finishRoom(run) {
    run.cleared++;
    run.encounter = null;
    run.combat = null;
    if (run.room < ROOMS) {
      run.room++;
      dealRooms(run);
    } else if (run.floor < FLOORS) {
      run.phase = 'stairs';
      log(run, '找到了向上的阶梯。选一项成长，再进入下一层。');
    } else {
      run.phase = 'boss';
      log(run, '塔顶的门已经打开。最后一战就在眼前。');
    }
  }
  function enterRoom(run, index) {
    run.encounter = run.choices[index];
    run.choices = null;
    var info = roomView(run.encounter);
    log(run, (index ? '推开暗门，遇见' : '走进眼前的房间，遇见') + '「' + info.name + '」。');
    if (run.encounter.type === 'monster') {
      run.phase = 'combat';
      run.combat = { enemy: clone(run.encounter.enemy), turn: 1 };
    } else run.phase = 'room';
  }
  function startBoss(run) {
    run.phase = 'combat';
    run.combat = { turn: 1, enemy: {
      name: '塔顶守关者', icon: 'boss', hp: 26, maxHp: 26, attack: 6, boss: true
    } };
    log(run, '塔顶守关者举起巨斧。击败它，就能带着战利品回家。');
  }
  function fight(run, strong) {
    var enemy = run.combat.enemy;
    if (strong) run.food--;
    var roll = dice(run, strong ? 2 : 1, strong ? '强攻 · 两骰取高' : '攻击');
    var damage = roll + run.weapon + (strong ? 2 : 0);
    enemy.hp = Math.max(0, enemy.hp - damage);
    log(run, '掷出 ' + run.lastRoll.values.join('、') + (strong ? '，取 ' + roll : '') +
      ' + 武器 ' + run.weapon + (strong ? ' + 强攻 2' : '') + '，造成 ' + damage + ' 点伤害。');
    if (!enemy.hp) {
      run.kills++;
      if (enemy.boss) {
        run.gold += 10;
        run.phase = 'won';
        log(run, '守关者倒下了！获得 10 金币，你带着 ' + run.gold + ' 金币走出高塔。');
      } else {
        run.gold += 3;
        log(run, '击败' + enemy.name + '，获得 3 金币。');
        finishRoom(run);
      }
      return;
    }
    var incoming = Math.max(0, enemy.attack - run.armor);
    log(run, enemy.name + '反击 ' + enemy.attack + '，护甲抵挡 ' + Math.min(enemy.attack, run.armor) + '，损失 ' + incoming + ' 点生命。');
    hurt(run, incoming);
    if (run.phase === 'combat') run.combat.turn++;
  }
  function resolveRoom(run, id) {
    if (id === 'rest') heal(run, 7);
    else if (id === 'forage') {
      run.food += 2;
      log(run, '收好 2 份口粮。');
    } else if (id === 'gold') {
      run.gold += 4;
      log(run, '拿走 4 金币，平安离开。');
    } else if (id === 'search') {
      var found = dice(run, 1, '翻找宝箱 · 4–6 成功');
      if (found >= 4) {
        if (run.weapon >= 4 && run.armor >= 2) {
          run.gold += 6;
          log(run, '掷出 ' + found + '，找到 6 金币！装备已经足够好了。');
        } else if (run.weapon < 4) {
          run.weapon++;
          log(run, '掷出 ' + found + '，找到趁手的武器，武器 +1！');
        } else {
          run.armor++;
          log(run, '掷出 ' + found + '，找到护甲，护甲 +1！');
        }
      } else {
        log(run, '掷出 ' + found + '，被暗刺扎伤，损失 3 点生命。');
        hurt(run, 3);
      }
    } else if (id === 'supply') {
      run.gold -= 4;
      run.food += 2;
      log(run, '花 4 金币买了热汤和 2 份口粮。');
      heal(run, 5);
    } else if (id === 'smith') {
      run.gold -= 6;
      run.weapon++;
      log(run, '花 6 金币磨利武器，武器 +1。');
    } else if (id === 'leave') log(run, '和商人道别，继续前行。');
    else if (id === 'disarm') {
      var check = dice(run, 1, '拆除机关 · 4–6 成功');
      if (check >= 4) {
        run.gold += 3;
        log(run, '掷出 ' + check + '，拆除机关，获得 3 金币。');
      } else {
        log(run, '掷出 ' + check + '，触发机关，损失 ' + (run.floor + 2) + ' 点生命。');
        hurt(run, run.floor + 2);
      }
    } else if (id === 'detour') {
      run.food--;
      log(run, '花 1 份口粮绕路，安全通过。');
    }
    if (run.phase !== 'over') finishRoom(run);
  }
  function climb(run, id) {
    if (id === 'weapon') { run.weapon++; log(run, '武器 +1，每次攻击都更有力。'); }
    else if (id === 'armor') { run.armor++; log(run, '护甲 +1，每次反击都少受一点伤。'); }
    else { run.maxHp += 2; log(run, '生命上限 +2。'); heal(run, 8); }
    if (run.food > 0) { run.food--; log(run, '吃掉 1 份口粮，向上一层出发。'); }
    else { log(run, '没有口粮，饥饿让你损失 4 点生命。'); hurt(run, 4); }
    if (run.phase === 'over') return;
    run.floor++;
    run.room = 1;
    dealRooms(run);
  }
  function newRun(seed) {
    var s = Number(seed);
    if (seed === undefined || seed === null || seed === '' || !Number.isFinite(s)) s = Math.floor(Math.random() * 1000000000);
    s = Math.abs(Math.trunc(s)) >>> 0;
    var run = {
      version: VERSION, seed: s, rng: s, phase: 'explore', floor: 1, maxFloor: FLOORS, room: 1,
      hp: 24, maxHp: 24, food: 3, gold: 0, weapon: 1, armor: 0, potions: 1,
      choices: null, encounter: null, combat: null, lastRoll: null, cleared: 0, kills: 0, log: []
    };
    dealRooms(run);
    return run;
  }

  // 展示文案与可行动条件一起生成，按钮、文字输入和 act 共用同一份合法动作列表。
  function action(id, name, desc, disabled) {
    return { id: id, name: name, desc: desc || '', disabled: !!disabled, label: name + (desc ? ' · ' + desc : '') };
  }
  function actions(run) {
    if (!run) return [];
    var list = [];
    if (run.phase === 'explore') {
      list = [action('known', '进入眼前房间', roomView(run.choices[0]).name), action('unknown', '试试另一扇门', '放弃明牌，接受未知遭遇')];
    } else if (run.phase === 'combat') {
      list = [action('attack', '掷骰攻击', '1 骰 + 武器 ' + run.weapon),
        action('power', '口粮强攻', '−1 口粮 · 两骰取高 + 武器 +2', run.food < 1)];
    } else if (run.phase === 'room') {
      switch (run.encounter.type) {
        case 'camp': list = [action('rest', '坐下休息', '回复 7 生命', run.hp === run.maxHp), action('forage', '收集口粮', '+2 口粮')]; break;
        case 'treasure': list = [action('gold', '拿走金币', '+4 金币'), action('search', '翻找装备', '4–6 成功；失败损失 3 生命')]; break;
        case 'merchant': list = [action('supply', '购买补给', '4 金币 → 2 口粮、5 生命', run.gold < 4),
          action('smith', '磨利武器', '6 金币 → 武器 +1' + (run.weapon >= 4 ? '（已满级）' : ''), run.gold < 6 || run.weapon >= 4),
          action('leave', '继续赶路')]; break;
        case 'trap': list = [action('disarm', '拆除机关', '4–6 得 3 金币；失败损失 ' + (run.floor + 2) + ' 生命'),
          action('detour', '绕路通过', '消耗 1 口粮', run.food < 1)]; break;
      }
    } else if (run.phase === 'stairs') {
      list = [action('weapon', '磨利武器', '武器 +1' + (run.weapon >= 4 ? '（已满级）' : ''), run.weapon >= 4),
        action('armor', '加固护甲', '护甲 +1' + (run.armor >= 2 ? '（已满级）' : ''), run.armor >= 2),
        action('recover', '养精蓄锐', '生命上限 +2，回复 8 生命')];
    } else if (run.phase === 'boss') list = [action('enter', '挑战守关者', '生命 26 · 攻击 6')];
    else if (run.phase === 'won' || run.phase === 'over') list = [action('restart', '再来一局', '新的房间与运气')];
    if (run.phase !== 'won' && run.phase !== 'over') {
      list.push(action('potion', '喝药水', '回复 8 生命 · 余 ' + run.potions + ' 瓶', run.potions < 1 || run.hp === run.maxHp));
    }
    list.push(action('quit', run.phase === 'won' || run.phase === 'over' ? '回去聊天' : '暂存离开'));
    return list;
  }
  function act(run, id) {
    var selected = actions(run).filter(function (item) { return item.id === id; })[0];
    // 不合法、重复或禁用的动作不推进随机数，也不改变存档。
    if (!selected || selected.disabled) return { run: clone(run), log: [], invalid: true };
    if (id === 'restart') {
      var fresh = newRun();
      return { run: fresh, log: fresh.log };
    }
    var r = clone(run);
    r.log = [];
    if (id === 'quit') return { run: r, log: ['好，先回去聊聊。下次说「爬塔」就能继续。'], quit: true };
    r.lastRoll = null;
    if (id === 'potion') { r.potions--; heal(r, 8); }
    else if (r.phase === 'explore') enterRoom(r, id === 'unknown' ? 1 : 0);
    else if (r.phase === 'combat') fight(r, id === 'power');
    else if (r.phase === 'room') resolveRoom(r, id);
    else if (r.phase === 'stairs') climb(r, id);
    else if (r.phase === 'boss') startBoss(r);
    return { run: r, log: r.log };
  }
  function matchText(run, text) {
    var t = String(text || '').trim();
    var list = actions(run);
    var number = t.match(/^[1-9]$/);
    if (number) return list[Number(t) - 1] ? list[Number(t) - 1].id : null;
    var aliases = {
      '攻击': 'attack', '掷骰': 'attack', '强攻': 'power', '喝药': 'potion', '药水': 'potion',
      '明牌': 'known', '暗牌': 'unknown', '休息': 'rest', '口粮': 'forage', '金币': 'gold',
      '拆除': 'disarm', '绕路': 'detour', '再来': 'restart', '不玩了': 'quit', '退出': 'quit',
      'quit': 'quit', 'stop': 'quit'
    };
    for (var i = 0; i < list.length; i++) {
      if (list[i].name === t || list[i].id === t.toLowerCase() || aliases[t.toLowerCase()] === list[i].id) return list[i].id;
    }
    return null;
  }
  function view(run) {
    if (!run) return null;
    var v = {
      phase: run.phase, floor: run.floor, maxFloor: FLOORS, room: run.room, roomsPerFloor: ROOMS,
      seed: run.seed, hp: run.hp, maxHp: run.maxHp, food: run.food, gold: run.gold,
      weapon: run.weapon, armor: run.armor, potions: run.potions, cleared: run.cleared, kills: run.kills,
      known: null, encounter: null, foe: null, turn: null,
      roll: run.lastRoll ? clone(run.lastRoll) : null, log: run.log.slice(), note: '', rules: RULES
    };
    if (run.phase === 'explore') {
      v.known = roomView(run.choices[0]); // 暗牌内容不进入展示层。
      v.note = '两扇门，只能选一扇。选了暗门，就不能回头。';
    } else if (run.phase === 'combat') {
      v.foe = clone(run.combat.enemy);
      v.foe.incoming = Math.max(0, v.foe.attack - run.armor);
      v.turn = run.combat.turn;
      v.note = '敌人若存活，就反击 ' + v.foe.incoming + ' 点生命；击败它则不反击。';
    } else if (run.phase === 'room') {
      v.encounter = roomView(run.encounter);
      v.note = run.encounter.type === 'merchant' ? '商人只停留片刻，交易一次便继续前行。' : '选一项行动，随后进入下一个房间。';
    } else if (run.phase === 'stairs') v.note = '选一项成长，再消耗 1 口粮上楼。' + (run.food ? '目前还有 ' + run.food + ' 份。' : '口粮不足，将损失 4 生命。');
    else if (run.phase === 'boss') v.note = '最后的守关者：26 生命、6 攻击。可以先喝药，再推开塔顶的门。';
    else if (run.phase === 'won') v.note = '穿过三层地牢，带着 ' + run.gold + ' 金币平安归来。';
    else v.note = '倒在第 ' + run.floor + ' 层，已探索 ' + run.cleared + ' 间房。换条路，再试一次。';
    return v;
  }

  // 版本不兼容或损坏的存档不能进入引擎，避免刷新后出现无法操作的局面。
  function isValidRun(run) {
    function int(value, min, max) { return Number.isInteger(value) && value >= min && value <= max; }
    function enemy(value) {
      return value && typeof value.name === 'string' && typeof value.icon === 'string' &&
        int(value.hp, 0, 100) && int(value.maxHp, 1, 100) && value.hp <= value.maxHp &&
        int(value.attack, 0, 20) && typeof value.boss === 'boolean';
    }
    function room(value) {
      return value && (value.type === 'monster' ? enemy(value.enemy) : Object.prototype.hasOwnProperty.call(ROOMS_INFO, value.type));
    }
    if (!run || run.version !== VERSION || !int(run.seed, 0, 4294967295) || !int(run.rng, 0, 4294967295) ||
      !int(run.floor, 1, FLOORS) || run.maxFloor !== FLOORS || !int(run.room, 1, ROOMS) ||
      !int(run.maxHp, 1, 50) || !int(run.hp, 0, run.maxHp) || !int(run.food, 0, 100) ||
      !int(run.gold, 0, 1000) || !int(run.weapon, 1, 4) || !int(run.armor, 0, 2) || !int(run.potions, 0, 1) ||
      !int(run.cleared, 0, 9) || !int(run.kills, 0, 10) || !Array.isArray(run.log) ||
      !run.log.every(function (line) { return typeof line === 'string'; })) return false;
    if (run.lastRoll !== null && (!run.lastRoll || typeof run.lastRoll.purpose !== 'string' ||
      !Array.isArray(run.lastRoll.values) || !int(run.lastRoll.values.length, 1, 2) ||
      !run.lastRoll.values.every(function (value) { return int(value, 1, 6); }))) return false;
    if (run.phase === 'over') return run.hp === 0;
    if (run.hp === 0) return false;
    if (run.phase === 'won') return run.floor === FLOORS && run.cleared === 9;
    if (run.phase === 'explore') return Array.isArray(run.choices) && run.choices.length === 2 && run.choices.every(room);
    if (run.phase === 'combat') return run.combat && enemy(run.combat.enemy) && run.combat.enemy.hp > 0 && int(run.combat.turn, 1, 100);
    if (run.phase === 'room') return room(run.encounter) && run.encounter.type !== 'monster';
    if (run.phase === 'stairs') return run.floor < FLOORS && run.room === ROOMS;
    return run.phase === 'boss' && run.floor === FLOORS && run.room === ROOMS;
  }
  function render(run) {
    var v = view(run);
    if (!v) return '';
    var lines = ['口袋地牢 · 第 ' + v.floor + '/3 层 · 房间 ' + v.room + '/3',
      '生命 ' + v.hp + '/' + v.maxHp + ' · 口粮 ' + v.food + ' · 金币 ' + v.gold,
      '武器 +' + v.weapon + ' · 护甲 ' + v.armor + ' · 药水 ' + v.potions];
    if (v.known) lines.push('眼前：' + v.known.name + '；另一扇门：未知。');
    if (v.encounter) lines.push(v.encounter.name + '：' + v.encounter.desc);
    if (v.foe) lines.push(v.foe.name + ' ' + v.foe.hp + '/' + v.foe.maxHp + ' · 攻击 ' + v.foe.attack);
    return lines.concat(v.log, [v.note]).join('\n');
  }
  window.Spire = { newRun: newRun, actions: actions, act: act, view: view, render: render, matchText: matchText, isValidRun: isValidRun };
})();

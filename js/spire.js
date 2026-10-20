/*
 * 口袋地牢：三层、骰子战斗、三件遗物的局内构筑。
 * 纯逻辑引擎；act 不修改输入，随机结果与待选奖励一起存档。
 * 所有遗物只在本局生效。效果在战斗事件中触发，不由展示层计算。
 */
(function () {
  'use strict';

  var VERSION = 3;
  var FLOORS = 3;
  var ROOMS = 3;
  var SLOTS = 3;
  var RELICS = {
    blade: { name: '磨刀石', tag: '即战力', desc: function (u) { return '每场战斗前两次攻击，伤害 +' + (2 + u) + '。'; }, hint: '过渡很强；长战里，后续攻击不再增伤。' },
    cloak: { name: '旅行斗篷', tag: '即战力', desc: function (u) { return '每场战斗前两次受到反击，额外减伤 ' + (2 + u) + '。'; }, hint: '帮你少掉血走到下一次奖励，之后可以换掉。' },
    ember: { name: '余烬瓶', tag: '点燃', desc: function (u) { return '每次攻击附加 ' + (1 + u) + ' 层灼烧；敌人反击前受到层数等量伤害。'; }, hint: '灼烧持续叠加，防守时也会结算；可搭配风箱。' },
    bellows: { name: '风箱', tag: '点燃组件', desc: function (u) { return '每次附加灼烧时，额外增加 ' + (1 + u) + ' 层。自身不能点燃。'; }, hint: '需要余烬瓶才能发挥作用，单拿暂时没有收益。' },
    buckler: { name: '折叠盾', tag: '防守', desc: function (u) { return '防守时，额外获得 ' + (2 + u) + ' 点格挡。'; }, hint: '先保护生命；搭配荆棘扣，格挡也能变成输出。' },
    thorns: { name: '荆棘扣', tag: '防反', desc: function (u) { return '防守并存活后，反弹本次被格挡抵消的伤害' + (u ? '，再 +2' : '') + '。'; }, hint: '基础防守即可触发；护甲、斗篷减伤不计入反伤。' },
    spring: { name: '蓄力弹簧', tag: '防守组件', desc: function (u) { return '防守后，下次攻击伤害 +' + (4 + u * 2) + '。连续防守不叠加。'; }, hint: '防守转进攻；可与反伤、强攻一起用。' },
    loaded: { name: '刻度骰', tag: '骰点', desc: function (u) { return '攻击骰取值 +' + (1 + u) + '，最高为 6。'; }, hint: '现在就能加伤害，也更容易触发六面护符。' },
    lucky: { name: '六面护符', tag: '骰点组件', desc: function (u) { return '攻击骰最终取值为 6 时，额外造成 ' + (5 + u * 3) + ' 伤害。'; }, hint: '搭配刻度骰提高触发率；强攻两骰取高也有帮助。' },
    tooth: { name: '幼龙牙', tag: '成长', desc: function (u) { return '携带期间每胜一战，本局攻击 +1，最多 +' + (4 + u * 2) + '；刚获得时为 +0。'; }, hint: '需要先赢下战斗才成长；晚拿可能来不及回本。' }
  };
  var RELIC_IDS = Object.keys(RELICS);
  var ENEMIES = [
    { name: '洞穴蝙蝠', icon: 'bat', hp: 7, attack: 2 },
    { name: '苔石守卫', icon: 'golem', hp: 10, attack: 1 },
    { name: '游荡骷髅', icon: 'skeleton', hp: 8, attack: 2 }
  ];
  var ROOM_TYPES = ['monster', 'camp', 'treasure', 'merchant', 'trap'];
  var ROOMS_INFO = {
    camp: { name: '余温营火', icon: 'camp', desc: '回血、补粮或强化一件遗物，只能选一项。' },
    treasure: { name: '遗落宝箱', icon: 'treasure', desc: '拿 4 金币，或打开遗物匣三选一。' },
    merchant: { name: '提灯商人', icon: 'merchant', desc: '购买补给、磨利武器或买下陈列的遗物；只交易一次。' },
    trap: { name: '机关走廊', icon: 'trap', desc: '掷出 4–6 拆除机关得 3 金币，或花 1 口粮绕路。' }
  };
  var RULES = '每局从零开始，最多携带 3 件遗物，满位时替换或放弃。每层先战斗拿奖励，再探索一间房，最后选精英或营火。攻击 = 六面骰 + 武器；强攻花 1 口粮，两骰取高再 +2。防守放弃攻击，获得 4 格挡；灼烧仍会结算。敌人每过 3 回合攻击 +1。营火只能回血、补粮、强化遗物三选一；每件遗物只能强化一次。上楼消耗 1 口粮，不足则损失 4 生命。塔顶守关者有 42 生命、6 基础攻击。';

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function log(run, text) { run.log.push(text); }
  function own(run, id) { return run.relics.filter(function (r) { return r.id === id; })[0] || null; }
  function effect(run, id, base, upgrade) { var r = own(run, id); return r ? base + r.up * upgrade : 0; }
  function rnd(run) {
    run.rng = (run.rng + 0x6D2B79F5) >>> 0;
    var t = run.rng;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function randomInt(run, min, max) { return min + Math.floor(rnd(run) * (max - min + 1)); }
  function shuffle(run, array) {
    for (var i = array.length - 1; i > 0; i--) {
      var j = randomInt(run, 0, i), temp = array[i]; array[i] = array[j]; array[j] = temp;
    }
    return array;
  }
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
    if (!run.hp) { run.phase = 'over'; log(run, '你倒在第 ' + run.floor + ' 层。这一局的搭配留在这里，下次从零出发。'); }
  }

  function relicView(run, item) {
    var data = RELICS[item.id];
    var hint = data.hint;
    if (item.id === 'bellows') hint = own(run, 'ember') ? '已有余烬瓶：每次攻击都能额外叠灼烧。' : '尚无点燃来源：需要余烬瓶，当前不会触发。';
    if (item.id === 'lucky' && own(run, 'loaded')) hint = '已有刻度骰：提高后的骰点也能触发六点爆发。';
    if (item.id === 'loaded' && own(run, 'lucky')) hint = '已有六面护符：更容易触发额外伤害。';
    if (item.id === 'buckler' && own(run, 'thorns')) hint = '已有荆棘扣：多挡下的伤害也能反弹。';
    if (item.id === 'thorns' && own(run, 'buckler')) hint = '已有折叠盾：防守时能格挡并反弹更多伤害。';
    if (item.id === 'tooth') hint = '当前攻击 +' + item.stacks + ' / 上限 +' + (4 + item.up * 2) + '；只计算携带后的胜利，丢弃后成长清零。';
    return { id: item.id, name: data.name + (item.up ? ' +' : ''), tag: data.tag,
      desc: data.desc(item.up), hint: hint, up: item.up, upgradeDesc: data.desc(1) };
  }
  function freshRelic(id) { return { id: id, up: 0, stacks: 0 }; }
  function offers(run, opening) {
    if (opening) return ['blade', ['ember', 'thorns', 'loaded'][randomInt(run, 0, 2)], 'tooth'];
    var pool = shuffle(run, RELIC_IDS.filter(function (id) { return !own(run, id); }));
    // 给一个能马上生效的选项，其余两项从池中抽取；不保证凑齐组件。
    var bridge = pool.filter(function (id) { return ['blade', 'cloak', 'loaded', 'buckler'].indexOf(id) !== -1; })[0];
    var result = bridge ? [bridge] : [];
    return result.concat(pool.filter(function (id) { return id !== bridge; }).slice(0, 3 - result.length));
  }
  function reward(run, source, after) {
    run.reward = { ids: offers(run, after === 'start'), source: source, after: after };
    run.phase = 'reward';
  }
  function makeRoom(run, forced) {
    var type = forced || ROOM_TYPES[randomInt(run, 0, ROOM_TYPES.length - 1)];
    if (type === 'merchant') {
      var pool = RELIC_IDS.filter(function (id) { return !own(run, id); });
      return { type: type, stock: pool[randomInt(run, 0, pool.length - 1)] };
    }
    if (type !== 'monster' && type !== 'elite') return { type: type };
    var base = ENEMIES[randomInt(run, 0, ENEMIES.length - 1)];
    var elite = type === 'elite';
    var hp = elite ? 14 + run.floor * 4 : base.hp + (run.floor - 1) * 4;
    return { type: type, enemy: {
      name: elite ? '精英 · 铁甲守卫' : base.name, icon: elite ? 'golem' : base.icon,
      hp: hp, maxHp: hp, attack: elite ? 3 + run.floor : base.attack + run.floor - 1,
      boss: false, elite: elite, burn: 0
    } };
  }
  function roomView(run, room) {
    if (room.type === 'monster' || room.type === 'elite') return {
      name: room.enemy.name, icon: room.enemy.icon, type: room.type,
      desc: '生命 ' + room.enemy.maxHp + ' · 基础攻击 ' + room.enemy.attack + '。胜利：' + (room.enemy.elite ? '6' : '3') + ' 金币、遗物三选一。'
    };
    var info = ROOMS_INFO[room.type];
    return { name: info.name, icon: info.icon, desc: info.desc, type: room.type,
      stock: room.stock ? relicView(run, freshRelic(room.stock)) : null };
  }
  function dealRooms(run) {
    run.phase = 'explore'; run.encounter = null; run.combat = null;
    run.scouted = run.room === ROOMS;
    if (run.room === 1) run.choices = [makeRoom(run, 'monster'), makeRoom(run, 'monster')];
    else if (run.scouted) run.choices = [makeRoom(run, 'elite'), makeRoom(run, 'camp')];
    else run.choices = [makeRoom(run), makeRoom(run)];
  }
  function finishRoom(run) {
    run.cleared++;
    run.encounter = null; run.combat = null; run.reward = null; run.pending = null;
    if (run.room < ROOMS) { run.room++; dealRooms(run); }
    else if (run.floor < FLOORS) { run.phase = 'stairs'; log(run, '选一项补强，随后消耗口粮上楼。'); }
    else { run.phase = 'boss'; log(run, '塔顶的门已打开。检查遗物与补给，准备最后一战。'); }
  }
  function beginCombat(run, enemy) {
    run.phase = 'combat';
    run.combat = { enemy: clone(enemy), turn: 1, attacks: 0, retaliations: 0, charge: 0 };
  }
  function enterRoom(run, index) {
    run.encounter = run.choices[index]; run.choices = null;
    log(run, '进入「' + roomView(run, run.encounter).name + '」。');
    if (run.encounter.enemy) beginCombat(run, run.encounter.enemy);
    else run.phase = 'room';
  }
  function startBoss(run) {
    beginCombat(run, { name: '塔顶守关者', icon: 'boss', hp: 42, maxHp: 42, attack: 6, boss: true, elite: false, burn: 0 });
    log(run, '守关者举起巨斧。战斗拖得越久，它的攻击越高。');
  }
  function enemyAttack(run) { return run.combat.enemy.attack + Math.floor((run.combat.turn - 1) / 3); }
  function defense(run, guarding) {
    var attack = enemyAttack(run);
    var armor = Math.min(attack, run.armor);
    var cloak = Math.min(attack - armor, run.combat.retaliations < 2 ? effect(run, 'cloak', 2, 1) : 0);
    var block = guarding ? Math.min(attack - armor - cloak, 4 + effect(run, 'buckler', 2, 1)) : 0;
    return { attack: attack, armor: armor, cloak: cloak, block: block, damage: attack - armor - cloak - block };
  }
  function winCombat(run) {
    var enemy = run.combat.enemy;
    run.kills++;
    if (enemy.elite) run.elites++;
    var tooth = own(run, 'tooth');
    if (tooth && tooth.stacks < 4 + tooth.up * 2) { tooth.stacks++; log(run, '幼龙牙成长：本局攻击 +' + tooth.stacks + '。'); }
    var gold = enemy.boss ? 10 : enemy.elite ? 6 : 3;
    run.gold += gold;
    log(run, '击败' + enemy.name + '，获得 ' + gold + ' 金币。');
    run.combat = null;
    if (enemy.boss) { run.phase = 'won'; log(run, '你带着这一局的搭配走到了塔顶！'); }
    else reward(run, enemy.elite ? '精英战利品' : '战斗奖励', 'room');
  }
  function fight(run, id) {
    var c = run.combat, enemy = c.enemy;
    var guarding = id === 'guard';
    if (guarding) {
      c.charge = Math.max(c.charge, effect(run, 'spring', 4, 2));
      log(run, '举盾防守，获得 ' + (4 + effect(run, 'buckler', 2, 1)) + ' 点临时格挡。');
      if (c.charge) log(run, '蓄力弹簧：下次攻击 +' + c.charge + '（不叠加）。');
    } else {
      var strong = id === 'power';
      if (strong) run.food--;
      var raw = dice(run, strong ? 2 : 1, strong ? '强攻 · 两骰取高' : '攻击');
      var roll = Math.min(6, raw + effect(run, 'loaded', 1, 1));
      var damage = roll + run.weapon + (strong ? 2 : 0);
      log(run, '掷出 ' + run.lastRoll.values.join('、') + '，取值 ' + roll + (raw !== roll ? '（刻度骰提高）' : '') + '。');
      var blade = c.attacks < 2 ? effect(run, 'blade', 2, 1) : 0;
      var lucky = roll === 6 ? effect(run, 'lucky', 5, 3) : 0;
      var tooth = own(run, 'tooth');
      damage += blade + lucky + c.charge + (tooth ? tooth.stacks : 0);
      if (blade) log(run, '磨刀石：伤害 +' + blade + '。');
      if (lucky) log(run, '六面护符：六点爆发，伤害 +' + lucky + '！');
      if (c.charge) log(run, '释放蓄力：伤害 +' + c.charge + '。');
      if (tooth && tooth.stacks) log(run, '幼龙牙：伤害 +' + tooth.stacks + '。');
      c.charge = 0; c.attacks++;
      enemy.hp = Math.max(0, enemy.hp - damage);
      log(run, '本次攻击共造成 ' + damage + ' 点伤害。');
      if (!enemy.hp) { winCombat(run); return; }
      var burn = effect(run, 'ember', 1, 1);
      if (burn) {
        var extra = effect(run, 'bellows', 1, 1);
        enemy.burn += burn + extra;
        log(run, '余烬瓶' + (extra ? ' + 风箱' : '') + '：附加 ' + (burn + extra) + ' 层灼烧，累计 ' + enemy.burn + ' 层。');
      }
    }
    if (enemy.burn) {
      enemy.hp = Math.max(0, enemy.hp - enemy.burn);
      log(run, '灼烧造成 ' + enemy.burn + ' 点伤害。');
      if (!enemy.hp) { winCombat(run); return; }
    }
    var d = defense(run, guarding);
    c.retaliations++;
    log(run, '敌人反击 ' + d.attack + '；护甲减伤 ' + d.armor + (d.cloak ? '，斗篷减伤 ' + d.cloak : '') +
      (guarding ? '，格挡 ' + d.block : '') + '，损失 ' + d.damage + ' 点生命。');
    hurt(run, d.damage);
    if (run.phase === 'over') return;
    if (guarding && d.block && own(run, 'thorns')) {
      var reflect = d.block + effect(run, 'thorns', 0, 2);
      enemy.hp = Math.max(0, enemy.hp - reflect);
      log(run, '荆棘扣：反弹 ' + reflect + ' 点伤害。');
      if (!enemy.hp) { winCombat(run); return; }
    }
    c.turn++;
  }

  function finishReward(run, after) {
    run.reward = null; run.pending = null;
    if (after === 'start') dealRooms(run);
    else finishRoom(run);
  }
  function equip(run, pending, index) {
    var item = freshRelic(pending.id);
    if (index === undefined) run.relics.push(item);
    else {
      log(run, '放下「' + RELICS[run.relics[index].id].name + '」，其效果与成长一并移除。');
      run.relics[index] = item;
    }
    run.gold -= pending.price;
    log(run, '获得「' + RELICS[item.id].name + '」' + (pending.price ? '，花费 ' + pending.price + ' 金币' : '') + '。');
    finishReward(run, pending.after);
  }
  function takeRelic(run, id, price, after) {
    var pending = { id: id, price: price, after: after, from: run.phase };
    if (run.relics.length < SLOTS) equip(run, pending);
    else { run.pending = pending; run.phase = 'replace'; log(run, '行囊已满。选一件替换，或返回重新考虑。'); }
  }
  function resolveRoom(run, id) {
    if (id === 'rest') heal(run, 7);
    else if (id === 'forage') { run.food += 2; log(run, '收好 2 份口粮。'); }
    else if (id === 'upgrade') { run.phase = 'upgrade'; return; }
    else if (id === 'gold') { run.gold += 4; log(run, '拿走 4 金币，继续赶路。'); }
    else if (id === 'relic') { reward(run, '宝箱遗物', 'room'); return; }
    else if (id === 'buy') { takeRelic(run, run.encounter.stock, 8, 'room'); return; }
    else if (id === 'supply') { run.gold -= 4; run.food += 2; log(run, '花 4 金币买了 2 份口粮与热汤。'); heal(run, 5); }
    else if (id === 'smith') { run.gold -= 6; run.weapon++; log(run, '武器 +1，花费 6 金币。'); }
    else if (id === 'leave') log(run, '和商人道别。');
    else if (id === 'disarm') {
      var check = dice(run, 1, '拆除机关 · 4–6 成功');
      if (check >= 4) { run.gold += 3; log(run, '拆除成功，获得 3 金币。'); }
      else { log(run, '触发机关，损失 ' + (run.floor + 2) + ' 点生命。'); hurt(run, run.floor + 2); }
    } else if (id === 'detour') { run.food--; log(run, '花 1 份口粮绕路，安全通过。'); }
    if (run.phase !== 'over') finishRoom(run);
  }
  function climb(run, id) {
    if (id === 'weapon') { run.weapon++; log(run, '武器 +1。'); }
    else if (id === 'armor') { run.armor++; log(run, '护甲 +1。'); }
    else { run.maxHp += 2; log(run, '生命上限 +2。'); heal(run, 8); }
    if (run.food > 0) { run.food--; log(run, '吃掉 1 份口粮，继续向上。'); }
    else { log(run, '没有口粮，饥饿让你损失 4 点生命。'); hurt(run, 4); }
    if (run.phase === 'over') return;
    run.floor++; run.room = 1; dealRooms(run);
  }
  function newRun(seed) {
    var s = Number(seed);
    if (seed === undefined || seed === null || seed === '' || !Number.isFinite(s)) s = Math.floor(Math.random() * 1000000000);
    s = Math.abs(Math.trunc(s)) >>> 0;
    var run = {
      version: VERSION, seed: s, rng: s, phase: 'reward', floor: 1, maxFloor: FLOORS, room: 1,
      hp: 24, maxHp: 24, food: 3, gold: 0, weapon: 1, armor: 0, potions: 1,
      relics: [], reward: null, pending: null, scouted: false,
      choices: null, encounter: null, combat: null, lastRoll: null, cleared: 0, kills: 0, elites: 0, log: []
    };
    reward(run, '出发前的行囊', 'start');
    return run;
  }

  function action(id, name, desc, disabled) {
    return { id: id, name: name, desc: desc || '', disabled: !!disabled, label: name + (desc ? ' · ' + desc : '') };
  }
  function actions(run) {
    if (!run) return [];
    var list = [];
    if (run.phase === 'explore') {
      list = [action('known', run.scouted ? '挑战精英' : '进入眼前房间', roomView(run, run.choices[0]).name),
        action('unknown', run.scouted ? '前往营火' : '试试另一扇门', run.scouted ? '放弃精英奖励，休整或强化' : run.room === 1 ? '另一名守卫，同样有战利品' : '放弃明牌，接受未知遭遇')];
    } else if (run.phase === 'combat') {
      list = [action('attack', '掷骰攻击', '1 骰 + 武器 ' + run.weapon),
        action('power', '口粮强攻', '−1 口粮 · 两骰取高 + 武器 +2', run.food < 1),
        action('guard', '举盾防守', '格挡 ' + (4 + effect(run, 'buckler', 2, 1)) + ' · 本次预计受伤 ' + defense(run, true).damage)];
    } else if (run.phase === 'reward') {
      list = run.reward.ids.map(function (id) { var r = relicView(run, freshRelic(id)); return action('take:' + id, r.name, r.tag + ' · ' + r.desc); });
      list.push(action('supplies', '只拿应急补给', '放弃本次遗物，回复 6 生命、+1 口粮'));
    } else if (run.phase === 'replace') {
      list = run.relics.map(function (r, i) { return action('replace:' + i, '替换 ' + RELICS[r.id].name, '换成 ' + RELICS[run.pending.id].name + '；旧强化与成长失去'); });
      list.push(action('back', '返回再想想', '保留现有遗物与金币'));
    } else if (run.phase === 'upgrade') {
      list = run.relics.map(function (r) { return action('upgrade:' + r.id, '强化 ' + RELICS[r.id].name, r.up ? '已经强化过' : RELICS[r.id].desc(1), !!r.up); });
      list.push(action('back', '返回营火', '重新选择休息或补粮'));
    } else if (run.phase === 'room') {
      switch (run.encounter.type) {
        case 'camp': list = [action('rest', '坐下休息', '回复 7 生命', run.hp === run.maxHp), action('forage', '收集口粮', '+2 口粮'),
          action('upgrade', '强化遗物', '放弃休息，强化一件遗物', !run.relics.some(function (r) { return !r.up; }))]; break;
        case 'treasure': list = [action('gold', '拿走金币', '+4 金币'), action('relic', '打开遗物匣', '遗物三选一')]; break;
        case 'merchant': list = [action('supply', '购买补给', '4 金币 → 2 口粮、5 生命', run.gold < 4),
          action('smith', '磨利武器', '6 金币 → 武器 +1' + (run.weapon >= 4 ? '（已满级）' : ''), run.gold < 6 || run.weapon >= 4),
          action('buy', '购买 ' + RELICS[run.encounter.stock].name, '8 金币 · ' + RELICS[run.encounter.stock].desc(0), run.gold < 8 || !!own(run, run.encounter.stock)),
          action('leave', '继续赶路')]; break;
        case 'trap': list = [action('disarm', '拆除机关', '4–6 得 3 金币；失败损失 ' + (run.floor + 2) + ' 生命'),
          action('detour', '绕路通过', '消耗 1 口粮', run.food < 1)]; break;
      }
    } else if (run.phase === 'stairs') {
      list = [action('weapon', '磨利武器', '武器 +1' + (run.weapon >= 4 ? '（已满级）' : ''), run.weapon >= 4),
        action('armor', '加固护甲', '护甲 +1' + (run.armor >= 2 ? '（已满级）' : ''), run.armor >= 2),
        action('recover', '养精蓄锐', '生命上限 +2，回复 8 生命')];
    } else if (run.phase === 'boss') list = [action('enter', '挑战守关者', '42 生命 · 基础攻击 6 · 越战越强')];
    else if (run.phase === 'won' || run.phase === 'over') list = [action('restart', '再来一局', '清空成长，从零搭配')];
    if (['won', 'over', 'reward', 'replace', 'upgrade'].indexOf(run.phase) === -1) {
      list.push(action('potion', '喝药水', '回复 8 生命 · 余 ' + run.potions + ' 瓶', run.potions < 1 || run.hp === run.maxHp));
    }
    list.push(action('quit', run.phase === 'won' || run.phase === 'over' ? '回去聊天' : '暂存离开'));
    return list;
  }
  function act(run, id) {
    var selected = actions(run).filter(function (item) { return item.id === id; })[0];
    if (!selected || selected.disabled) return { run: clone(run), log: [], invalid: true };
    if (id === 'restart') { var fresh = newRun(); return { run: fresh, log: fresh.log }; }
    var r = clone(run); r.log = [];
    if (id === 'quit') return { run: r, log: ['这局与遗物一起存好了，下次说「爬塔」继续。'], quit: true };
    r.lastRoll = null;
    if (id === 'potion') { r.potions--; heal(r, 8); }
    else if (r.phase === 'explore') enterRoom(r, id === 'unknown' ? 1 : 0);
    else if (r.phase === 'combat') fight(r, id);
    else if (r.phase === 'room') resolveRoom(r, id);
    else if (r.phase === 'stairs') climb(r, id);
    else if (r.phase === 'boss') startBoss(r);
    else if (r.phase === 'reward') {
      if (id === 'supplies') { r.food++; heal(r, 6); log(r, '放弃遗物，收好 1 份口粮。'); finishReward(r, r.reward.after); }
      else takeRelic(r, id.slice(5), 0, r.reward.after);
    } else if (r.phase === 'replace') {
      if (id === 'back') { r.phase = r.pending.from; r.pending = null; }
      else equip(r, r.pending, Number(id.slice(8)));
    } else if (r.phase === 'upgrade') {
      if (id === 'back') r.phase = 'room';
      else { var item = own(r, id.slice(8)); item.up = 1; log(r, '强化「' + RELICS[item.id].name + '」：' + RELICS[item.id].desc(1)); finishRoom(r); }
    }
    return { run: r, log: r.log };
  }
  function matchText(run, text) {
    var t = String(text || '').trim(), list = actions(run);
    if (/^[1-9]$/.test(t)) return list[Number(t) - 1] ? list[Number(t) - 1].id : null;
    var aliases = { '攻击': 'attack', '掷骰': 'attack', '强攻': 'power', '防守': 'guard', '格挡': 'guard',
      '喝药': 'potion', '药水': 'potion', '明牌': 'known', '暗牌': 'unknown', '精英': 'known', '营火': 'unknown',
      '休息': 'rest', '口粮': 'forage', '金币': 'gold', '强化': 'upgrade', '拆除': 'disarm', '绕路': 'detour',
      '再来': 'restart', '不玩了': 'quit', '退出': 'quit', 'quit': 'quit', 'stop': 'quit' };
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
      weapon: run.weapon, armor: run.armor, potions: run.potions, cleared: run.cleared, kills: run.kills, elites: run.elites,
      relics: run.relics.map(function (r) { return relicView(run, r); }),
      known: null, alternative: null, encounter: null, foe: null, turn: null, charge: 0,
      offers: null, rewardTitle: '', pending: null,
      roll: run.lastRoll ? clone(run.lastRoll) : null, log: run.log.slice(), note: '', rules: RULES
    };
    if (run.phase === 'explore') {
      v.known = roomView(run, run.choices[0]);
      if (run.scouted) v.alternative = roomView(run, run.choices[1]);
      v.note = run.scouted ? '精英给更多金币与一次遗物选择；营火能回血或强化。只能走一边。' :
        run.room === 1 ? '这一间必遇守卫，胜利后挑遗物。先考虑手中的搭配能否过关。' : '两扇门只能选一扇，推开暗门后不能回头。';
    } else if (run.phase === 'combat') {
      v.foe = clone(run.combat.enemy);
      v.foe.currentAttack = enemyAttack(run); v.foe.incoming = defense(run, false).damage; v.foe.guarded = defense(run, true).damage;
      v.turn = run.combat.turn; v.charge = run.combat.charge;
      v.note = '敌人存活才反击：攻击后预计受伤 ' + v.foe.incoming + '，防守后 ' + v.foe.guarded + '。每过 3 回合敌人攻击 +1。';
    } else if (run.phase === 'reward') {
      v.offers = run.reward.ids.map(function (id) { return relicView(run, freshRelic(id)); }); v.rewardTitle = run.reward.source;
      v.note = run.relics.length === SLOTS ? '三个位置已满。拿新遗物需要放下一件，也可只拿补给。' : '挑一件遗物，或放弃这次成长换取 6 生命、1 口粮。';
    } else if (run.phase === 'replace') {
      v.pending = relicView(run, freshRelic(run.pending.id));
      v.note = '替换后旧遗物的强化与成长会消失。返回可保留原选择' + (run.pending.price ? '；确认替换才支付 ' + run.pending.price + ' 金币。' : '。');
    } else if (run.phase === 'upgrade') {
      v.note = '只能强化一件，随后离开营火。强化遗物就放弃这次回血与补粮。';
    } else if (run.phase === 'room') {
      v.encounter = roomView(run, run.encounter);
      v.note = run.encounter.type === 'merchant' ? '商品已摆好，只能交易一次。遗物需要 8 金币。' : '选一项行动，然后继续前行。';
    } else if (run.phase === 'stairs') v.note = '选一项补强，再消耗 1 口粮上楼。' + (run.food ? '目前还有 ' + run.food + ' 份。' : '口粮不足，将损失 4 生命。');
    else if (run.phase === 'boss') v.note = '守关者有 42 生命、6 基础攻击，每过 3 回合攻击 +1。短战爆发或长战成长，都要在这里兑现。';
    else if (run.phase === 'won') v.note = '这一局探索了 ' + run.cleared + ' 间房，击败 ' + run.elites + ' 名精英，带回 ' + run.gold + ' 金币。';
    else v.note = '倒在第 ' + run.floor + ' 层，已探索 ' + run.cleared + ' 间房。下局的遗物和成长重新开始。';
    return v;
  }

  function isValidRun(run) {
    function int(value, min, max) { return Number.isInteger(value) && value >= min && value <= max; }
    function relicId(id) { return Object.prototype.hasOwnProperty.call(RELICS, id); }
    function enemy(e) { return e && typeof e.name === 'string' && typeof e.icon === 'string' && int(e.hp, 0, 100) &&
      int(e.maxHp, 1, 100) && e.hp <= e.maxHp && int(e.attack, 0, 20) && typeof e.boss === 'boolean' && typeof e.elite === 'boolean' && int(e.burn, 0, 200); }
    function room(r) { return r && ((r.type === 'monster' || r.type === 'elite') ? enemy(r.enemy) :
      Object.prototype.hasOwnProperty.call(ROOMS_INFO, r.type) && (r.type !== 'merchant' || relicId(r.stock))); }
    function rewardValid(r) { return r && typeof r.source === 'string' && ['start', 'room'].indexOf(r.after) !== -1 &&
      Array.isArray(r.ids) && r.ids.length === 3 && new Set(r.ids).size === 3 && r.ids.every(function (id) { return relicId(id) && !own(run, id); }); }
    if (!run || run.version !== VERSION || !int(run.seed, 0, 4294967295) || !int(run.rng, 0, 4294967295) ||
      !int(run.floor, 1, FLOORS) || run.maxFloor !== FLOORS || !int(run.room, 1, ROOMS) || typeof run.scouted !== 'boolean' ||
      !int(run.maxHp, 1, 50) || !int(run.hp, 0, run.maxHp) || !int(run.food, 0, 100) || !int(run.gold, 0, 1000) ||
      !int(run.weapon, 1, 4) || !int(run.armor, 0, 2) || !int(run.potions, 0, 1) || !int(run.cleared, 0, 9) ||
      !int(run.kills, 0, 10) || !int(run.elites, 0, 3) || !Array.isArray(run.log) || !run.log.every(function (x) { return typeof x === 'string'; }) ||
      !Array.isArray(run.relics) || run.relics.length > SLOTS || !run.relics.every(function (r) { return r && relicId(r.id) && int(r.up, 0, 1) &&
        int(r.stacks, 0, r.id === 'tooth' ? 4 + r.up * 2 : 0); }) || new Set(run.relics.map(function (r) { return r.id; })).size !== run.relics.length) return false;
    if (run.lastRoll !== null && (!run.lastRoll || typeof run.lastRoll.purpose !== 'string' || !Array.isArray(run.lastRoll.values) ||
      !int(run.lastRoll.values.length, 1, 2) || !run.lastRoll.values.every(function (v) { return int(v, 1, 6); }))) return false;
    if (run.phase === 'over') return run.hp === 0;
    if (run.hp === 0) return false;
    if (run.phase === 'won') return run.floor === FLOORS && run.cleared === 9;
    if (run.phase === 'explore') return Array.isArray(run.choices) && run.choices.length === 2 && run.choices.every(room);
    if (run.phase === 'combat') return !!(run.combat && enemy(run.combat.enemy) && run.combat.enemy.hp > 0 && int(run.combat.turn, 1, 200) &&
      int(run.combat.attacks, 0, 200) && int(run.combat.retaliations, 0, 200) && int(run.combat.charge, 0, 6));
    if (run.phase === 'room') return !!(room(run.encounter) && !run.encounter.enemy);
    if (run.phase === 'upgrade') return !!(room(run.encounter) && run.encounter.type === 'camp' && run.relics.some(function (r) { return !r.up; }));
    if (run.phase === 'reward') return !!rewardValid(run.reward);
    if (run.phase === 'replace') {
      var p = run.pending;
      return !!(p && run.relics.length === SLOTS && relicId(p.id) && !own(run, p.id) && ['room', 'start'].indexOf(p.after) !== -1 &&
        (p.from === 'reward' && p.price === 0 && rewardValid(run.reward) && run.reward.ids.indexOf(p.id) !== -1 && p.after === run.reward.after ||
         p.from === 'room' && p.price === 8 && run.gold >= 8 && room(run.encounter) && run.encounter.type === 'merchant' && run.encounter.stock === p.id && p.after === 'room'));
    }
    if (run.phase === 'stairs') return run.floor < FLOORS && run.room === ROOMS;
    return run.phase === 'boss' && run.floor === FLOORS && run.room === ROOMS;
  }
  function render(run) {
    var v = view(run);
    if (!v) return '';
    var lines = ['口袋地牢 · 第 ' + v.floor + '/3 层 · 房间 ' + v.room + '/3',
      '生命 ' + v.hp + '/' + v.maxHp + ' · 口粮 ' + v.food + ' · 金币 ' + v.gold,
      '武器 +' + v.weapon + ' · 护甲 ' + v.armor + ' · 药水 ' + v.potions,
      '遗物：' + (v.relics.map(function (r) { return r.name + '（' + r.desc + '）'; }).join('、') || '尚未选择')];
    if (v.known) lines.push('眼前：' + v.known.name + '；另一扇门：' + (v.alternative ? v.alternative.name : '未知') + '。');
    if (v.encounter) lines.push(v.encounter.name + '：' + v.encounter.desc);
    if (v.foe) lines.push(v.foe.name + ' ' + v.foe.hp + '/' + v.foe.maxHp + ' · 当前攻击 ' + v.foe.currentAttack + ' · 灼烧 ' + v.foe.burn);
    if (v.offers) v.offers.forEach(function (r) { lines.push(r.name + '：' + r.desc + ' ' + r.hint); });
    return lines.concat(v.log, [v.note]).join('\n');
  }
  window.Spire = { newRun: newRun, actions: actions, act: act, view: view, render: render, matchText: matchText, isValidRun: isValidRun };
})();

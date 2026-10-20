// Run with: node --test tests/spire.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const context = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/spire.js'), 'utf8'), context);
const S = context.window.Spire;
const copy = value => JSON.parse(JSON.stringify(value));
const act = (run, id) => S.act(run, id).run;
const relic = (id, up = 0, stacks = 0) => ({ id, up, stacks });
function fresh(seed = 42) {
  const run = act(S.newRun(seed), 'supplies');
  run.food = 3;
  run.log = [];
  return run;
}
function combat(overrides = {}) {
  return Object.assign(fresh(23), {
    phase: 'combat', choices: null,
    combat: { turn: 1, attacks: 0, retaliations: 0, charge: 0,
      enemy: { name: '测试守卫', icon: 'golem', hp: 42, maxHp: 42, attack: 6, boss: false, elite: false, burn: 0 } }
  }, overrides);
}
function room(type, overrides = {}) {
  return Object.assign(fresh(), { phase: 'room', choices: null, encounter: { type, ...(type === 'merchant' ? { stock: 'ember' } : {}) } }, overrides);
}
function rewardRun(overrides = {}) {
  return Object.assign(fresh(), { phase: 'reward', choices: null, reward: { ids: ['ember', 'spring', 'lucky'], source: '测试奖励', after: 'room' } }, overrides);
}
function choose(run, style = 'burn') {
  const actions = S.actions(run);
  const enabled = actions.filter(a => !a.disabled).map(a => a.id);
  const has = id => run.relics.some(r => r.id === id);
  const scores = { blade: run.floor === 1 ? 5 : 2, cloak: run.hp < 10 ? 6 : 2, tooth: run.floor === 1 ? 8 : 1,
    ember: style === 'burn' ? 12 : 6, bellows: has('ember') ? 13 : 0,
    buckler: has('thorns') ? 11 : 3, thorns: style === 'guard' ? 12 : 5, spring: style === 'guard' ? 10 : 4,
    loaded: style === 'dice' || has('lucky') ? 12 : 5, lucky: has('loaded') ? 13 : style === 'dice' ? 8 : 3 };
  if (run.hp <= run.maxHp - 8 && enabled.includes('potion')) return 'potion';
  if (run.phase === 'reward') {
    if (run.hp < 10 && run.reward.after !== 'start') return 'supplies';
    const best = [...run.reward.ids].sort((a, b) => scores[b] - scores[a])[0];
    if (run.relics.length === 3 && scores[best] <= Math.min(...run.relics.map(r => scores[r.id]))) return 'supplies';
    return 'take:' + best;
  }
  if (run.phase === 'replace') {
    const index = run.relics.map((r, i) => ({ i, score: scores[r.id] })).sort((a, b) => a.score - b.score)[0].i;
    return 'replace:' + index;
  }
  if (run.phase === 'upgrade') return 'upgrade:' + run.relics.filter(r => !r.up).sort((a, b) => scores[b.id] - scores[a.id])[0].id;
  if (run.phase === 'explore') {
    if (run.scouted) return run.hp >= 18 && run.relics.length >= 2 && run.floor < 3 ? 'known' : 'unknown';
    const known = S.view(run).known.type;
    return known === 'trap' || (known === 'merchant' && run.gold < 4) ? 'unknown' : 'known';
  }
  if (run.phase === 'combat') {
    const c = run.combat;
    const v = S.view(run);
    if ((has('thorns') || has('spring')) && !c.charge && c.turn % 2 === 1) return 'guard';
    if (c.enemy.burn >= c.enemy.hp || (c.enemy.burn >= 4 && v.foe.guarded === 0)) return 'guard';
    return enabled.includes('power') && (run.food > 3 - run.floor || c.enemy.boss || c.enemy.elite) && c.enemy.hp > run.weapon + 4 ? 'power' : 'attack';
  }
  if (run.phase === 'room') {
    if (run.encounter.type === 'camp') return run.hp <= run.maxHp - 7 ? 'rest' : enabled.includes('upgrade') ? 'upgrade' : 'forage';
    if (run.encounter.type === 'treasure') return 'relic';
    if (run.encounter.type === 'merchant') {
      if (enabled.includes('supply') && (run.food < 2 || run.hp < 16)) return 'supply';
      if (enabled.includes('buy') && scores[run.encounter.stock] > Math.min(...run.relics.map(r => scores[r.id]), 4)) return 'buy';
      return enabled.includes('smith') ? 'smith' : 'leave';
    }
    return run.food > 2 ? 'detour' : 'disarm';
  }
  if (run.phase === 'stairs') return run.hp < 16 ? 'recover' : run.armor < 1 ? 'armor' : enabled.includes('weapon') ? 'weapon' : 'recover';
  return 'enter';
}

test('opening offers immediate power, a build direction and future growth; nothing persists between runs', () => {
  const r = S.newRun(8);
  assert.equal(r.phase, 'reward');
  assert.equal(r.relics.length, 0);
  assert.ok(r.reward.ids.includes('blade') && r.reward.ids.includes('tooth'));
  const next = act(r, 'take:tooth');
  assert.equal(next.phase, 'explore');
  assert.equal(next.relics[0].stacks, 0);
  assert.equal(next.relics[0].up, 0);
  assert.equal(S.act(next, 'take:tooth').invalid, true);
  const restart = act({ ...next, phase: 'over', hp: 0 }, 'restart');
  assert.equal(restart.relics.length, 0);
  assert.equal(restart.gold, 0);
});

test('same seed and save round-trips replay rewards and combat exactly without mutating input', () => {
  let a = S.newRun(20261019), b = copy(a);
  for (let i = 0; i < 180 && !['won', 'over'].includes(a.phase); i++) {
    const before = copy(a), id = choose(a);
    const result = S.act(a, id);
    assert.ok(!result.invalid, id);
    assert.deepEqual(copy(a), before);
    a = result.run; b = act(copy(b), id);
    assert.deepEqual(copy(a), copy(b));
    assert.ok(S.isValidRun(copy(a)), a.phase);
  }
  assert.ok(['won', 'over'].includes(a.phase));
});

test('unknown rooms are hidden; the final room explicitly offers elite versus camp', () => {
  const r = fresh(); r.choices = [{ type: 'camp' }, { type: 'trap' }];
  assert.equal(S.view(r).alternative, null);
  assert.equal(JSON.stringify(S.view(r)).includes('"type":"trap"'), false);
  const entered = act(r, 'unknown');
  assert.equal(entered.encounter.type, 'trap');
  assert.equal(entered.choices, null);
  assert.equal(S.act(entered, 'known').invalid, true);
  const fork = act(room('camp', { room: 2, cleared: 1 }), 'forage');
  assert.equal(fork.scouted, true);
  assert.equal(S.view(fork).known.type, 'elite');
  assert.equal(S.view(fork).alternative.type, 'camp');
});

test('ordinary and power attacks use the displayed damage and costs', () => {
  const r = combat({ armor: 2 });
  const next = act(r, 'attack');
  assert.equal(next.combat.enemy.hp, 42 - next.lastRoll.values[0] - r.weapon);
  assert.equal(next.hp, r.hp - S.view(r).foe.incoming);
  assert.equal(next.combat.turn, 2);
  const powered = act(r, 'power');
  assert.equal(powered.food, r.food - 1);
  assert.equal(powered.lastRoll.values.length, 2);
  assert.equal(powered.combat.enemy.hp, 42 - Math.max(...powered.lastRoll.values) - r.weapon - 2);
});

test('killing blows prevent retaliation and reward only once; picking loot advances the room', () => {
  const r = combat({ hp: 1 }); r.combat.enemy.hp = 1;
  const next = act(r, 'attack');
  assert.equal(next.hp, 1); assert.equal(next.gold, 3); assert.equal(next.kills, 1);
  assert.equal(next.phase, 'reward'); assert.equal(next.cleared, 0);
  assert.equal(S.act(next, 'attack').invalid, true);
  const onward = act(next, 'supplies');
  assert.equal(onward.room, 2); assert.equal(onward.cleared, 1); assert.equal(onward.hp, 7);
});

test('blade bridges the first two attacks only; cloak protects only two retaliations', () => {
  let r = combat({ relics: [relic('blade'), relic('cloak')] });
  for (let i = 0; i < 3; i++) {
    const next = act(r, 'attack');
    assert.equal(r.combat.enemy.hp - next.combat.enemy.hp, next.lastRoll.values[0] + 1 + (i < 2 ? 2 : 0));
    assert.equal(r.hp - next.hp, i < 2 ? 4 : 6);
    r = next;
  }
});

test('bellows alone is dormant; ember + bellows stacks burn and guard keeps it ticking', () => {
  const plain = act(combat(), 'attack');
  const dormant = act(combat({ relics: [relic('bellows')] }), 'attack');
  assert.equal(plain.combat.enemy.hp, dormant.combat.enemy.hp);
  assert.match(S.view(dormant).relics[0].hint, /尚无点燃来源/);
  let r = act(combat({ relics: [relic('ember'), relic('bellows')] }), 'attack');
  assert.equal(r.combat.enemy.burn, 2);
  assert.equal(r.combat.enemy.hp, 42 - r.lastRoll.values[0] - 1 - 2);
  const beforeHp = r.combat.enemy.hp;
  r = act(r, 'guard');
  assert.equal(r.combat.enemy.hp, beforeHp - 2);
  assert.equal(r.combat.enemy.burn, 2);
  r = act(r, 'attack');
  assert.equal(r.combat.enemy.burn, 4);
});

test('burn can kill before retaliation; statuses reset on the next enemy', () => {
  const r = combat({ hp: 1 }); r.combat.enemy.burn = 2; r.combat.enemy.hp = 2;
  const won = act(r, 'guard');
  assert.equal(won.phase, 'reward'); assert.equal(won.hp, 1);
  const fork = act({ ...won, room: 2, cleared: 1 }, 'supplies');
  const next = act(fork, 'known');
  assert.equal(next.combat.enemy.burn, 0); assert.equal(next.combat.charge, 0); assert.equal(next.combat.attacks, 0);
});

test('guard + buckler + thorns reflects actual block; armor is not reflected', () => {
  const r = combat({ armor: 2, relics: [relic('buckler'), relic('thorns')] });
  const guarded = act(r, 'guard');
  assert.equal(guarded.hp, 24);
  assert.equal(guarded.combat.enemy.hp, 38); // 6 attack - 2 armor = 4 actual block.
  assert.equal(guarded.lastRoll, null);
  const noBlock = combat({ armor: 2, relics: [relic('thorns', 1)] }); noBlock.combat.enemy.attack = 1;
  assert.equal(act(noBlock, 'guard').combat.enemy.hp, 42);
});

test('spring charges once, does not stack on repeated guard, and is spent on attack', () => {
  let r = combat({ relics: [relic('spring')] });
  r = act(r, 'guard'); r = act(r, 'guard');
  assert.equal(r.combat.charge, 4);
  const next = act(r, 'attack');
  assert.equal(next.combat.enemy.hp, 42 - next.lastRoll.values[0] - 1 - 4);
  assert.equal(next.combat.charge, 0);
});

test('loaded dice can trigger lucky on a natural five, with a cap of six', () => {
  let source;
  for (let rng = 0; rng < 100; rng++) {
    const r = combat({ rng });
    if (act(r, 'attack').lastRoll.values[0] === 5) { source = r; break; }
  }
  assert.ok(source);
  source.relics = [relic('loaded'), relic('lucky')];
  const combined = act(source, 'attack');
  assert.equal(combined.combat.enemy.hp, 42 - 6 - 1 - 5);
  source.relics = [relic('loaded', 1), relic('lucky', 1)];
  assert.equal(act(source, 'attack').combat.enemy.hp, 42 - 6 - 1 - 8);
});

test('tooth grows after future victories only, respects its cap, and loses stacks when replaced', () => {
  let r = combat({ kills: 3, relics: [relic('tooth')] }); r.combat.enemy.hp = 1;
  r = act(r, 'attack'); assert.equal(r.relics[0].stacks, 1);
  const capped = combat({ relics: [relic('tooth', 0, 4)] }); capped.combat.enemy.hp = 1;
  assert.equal(act(capped, 'attack').relics[0].stacks, 4);
  const upgraded = combat({ relics: [relic('tooth', 1, 4)] }); upgraded.combat.enemy.hp = 1;
  assert.equal(act(upgraded, 'attack').relics[0].stacks, 5);
  const replacing = rewardRun({ relics: [relic('tooth', 1, 5), relic('blade'), relic('cloak')] });
  const taken = act(act(replacing, 'take:ember'), 'replace:0');
  assert.equal(taken.relics.some(x => x.id === 'tooth'), false);
  assert.equal(taken.relics[0].stacks, 0);
});

test('three-slot replacement is atomic, cancellable, and resumes after serialization', () => {
  const r = rewardRun({ relics: [relic('blade', 1), relic('cloak'), relic('tooth', 0, 3)] });
  const waiting = act(r, 'take:ember');
  assert.equal(waiting.phase, 'replace'); assert.ok(S.isValidRun(copy(waiting)));
  assert.deepEqual(copy(waiting.relics), copy(r.relics)); assert.equal(waiting.cleared, 0);
  const back = act(copy(waiting), 'back');
  assert.deepEqual(copy(back.reward), copy(r.reward)); assert.equal(back.rng, r.rng);
  const chosen = act(copy(waiting), 'replace:0');
  assert.equal(chosen.relics.length, 3); assert.equal(chosen.relics[0].id, 'ember');
  assert.equal(chosen.relics[0].up, 0); assert.equal(chosen.cleared, 1);
  assert.equal(S.act(chosen, 'replace:0').invalid, true);
});

test('merchant stock stays fixed and payment happens only when replacement commits', () => {
  const r = room('merchant', { gold: 10, relics: [relic('blade'), relic('cloak'), relic('tooth')] });
  const waiting = act(r, 'buy');
  assert.equal(waiting.gold, 10); assert.ok(S.isValidRun(copy(waiting)));
  const back = act(waiting, 'back');
  assert.equal(back.phase, 'room'); assert.equal(back.encounter.stock, 'ember'); assert.equal(back.gold, 10);
  const bought = act(copy(waiting), 'replace:1');
  assert.equal(bought.gold, 2); assert.equal(bought.relics[1].id, 'ember'); assert.equal(bought.cleared, 1);
  assert.equal(S.act(bought, 'buy').invalid, true);
});

test('camp upgrade consumes the room, excludes healing and is limited to once per relic', () => {
  const r = room('camp', { hp: 10, relics: [relic('ember')] });
  const selecting = act(r, 'upgrade');
  assert.equal(selecting.phase, 'upgrade'); assert.ok(S.isValidRun(copy(selecting)));
  assert.equal(act(selecting, 'back').phase, 'room');
  const done = act(selecting, 'upgrade:ember');
  assert.equal(done.hp, 10); assert.equal(done.relics[0].up, 1); assert.equal(done.cleared, 1);
  assert.equal(S.act(room('camp', { relics: done.relics }), 'upgrade').invalid, true);
  const burning = act(combat({ relics: done.relics }), 'attack');
  assert.equal(burning.combat.enemy.burn, 2);
});

test('enemies gain attack every three rounds and the preview matches the next hit', () => {
  let r = combat({ maxHp: 50, hp: 50, armor: 2 });
  for (let turn = 1; turn <= 7; turn++) {
    const view = S.view(r);
    assert.equal(view.foe.currentAttack, 6 + Math.floor((turn - 1) / 3));
    const next = act(r, 'guard');
    assert.equal(r.hp - next.hp, view.foe.guarded);
    r = next;
  }
});

test('potion heals without enemy action, spending a turn, or changing RNG', () => {
  const r = combat({ hp: 19 }); const next = act(r, 'potion');
  assert.equal(next.hp, 24); assert.equal(next.potions, 0);
  assert.deepEqual(copy(next.combat), copy(r.combat)); assert.equal(next.rng, r.rng);
});

test('invalid, unavailable, or forged actions preserve the entire run', () => {
  const cases = [[fresh(), 'attack'], [fresh(), 'restart'], [fresh(), 'potion'], [S.newRun(2), 'take:bellows'],
    [combat({ food: 0 }), 'power'], [room('merchant'), 'buy'], [room('merchant'), 'supply'],
    [room('merchant', { gold: 10, weapon: 4 }), 'smith'], [room('trap', { food: 0 }), 'detour'],
    [room('camp'), 'rest'], [room('camp'), 'upgrade'], [room('camp'), 'upgrade:ember'],
    [rewardRun(), 'replace:99'], [fresh(), 'card:strike']];
  for (const [run, id] of cases) {
    const res = S.act(run, id); assert.equal(res.invalid, true, id); assert.deepEqual(copy(res.run), copy(run));
  }
});

test('starvation and traps can kill without advancing, and terminal states cannot act again', () => {
  const stairs = Object.assign(fresh(), { phase: 'stairs', room: 3, cleared: 3, food: 0, hp: 4 });
  const dead = act(stairs, 'weapon'); assert.equal(dead.phase, 'over'); assert.equal(dead.floor, 1);
  assert.equal(S.act(dead, 'potion').invalid, true); assert.equal(S.act(dead, 'quit').quit, true);
  assert.equal(act(dead, 'restart').phase, 'reward');
  const recovered = act({ ...stairs, hp: 1 }, 'recover'); assert.equal(recovered.hp, 5); assert.equal(recovered.floor, 2);
  let fatalTrap;
  for (let rng = 0; rng < 100; rng++) { const r = act(room('trap', { hp: 1, rng }), 'disarm'); if (r.phase === 'over') { fatalTrap = r; break; } }
  assert.ok(fatalTrap); assert.equal(fatalTrap.cleared, 0);
});

test('elite loot and final victory award once, including reflected kills', () => {
  const elite = combat({ relics: [relic('thorns')] }); elite.combat.enemy.elite = true; elite.combat.enemy.hp = 1;
  const result = act(elite, 'guard'); assert.equal(result.gold, 6); assert.equal(result.elites, 1); assert.equal(result.phase, 'reward');
  const boss = combat({ floor: 3, room: 3, cleared: 9 }); boss.combat.enemy.boss = true; boss.combat.enemy.hp = 1;
  const won = act(boss, 'attack'); assert.equal(won.phase, 'won'); assert.equal(won.gold, 10); assert.ok(S.isValidRun(copy(won)));
  assert.equal(S.act(won, 'attack').invalid, true);
  const fatal = combat({ hp: 1, relics: [relic('thorns')] }); fatal.combat.enemy.attack = 10; fatal.combat.enemy.hp = 1;
  const fallen = act(fatal, 'guard'); assert.equal(fallen.phase, 'over'); assert.equal(fallen.kills, 0);
});

test('save validation rejects legacy saves, unknown relics, malformed rewards and replacements', () => {
  const r = fresh();
  const pending = act(rewardRun({ relics: [relic('blade'), relic('cloak'), relic('tooth')] }), 'take:ember');
  const invalid = [null, {}, { ...r, version: 2 }, { ...r, rng: null }, { ...r, choices: [] }, { ...r, hp: -1 },
    { ...r, relics: [relic('toString')] }, { ...r, relics: [relic('ember'), relic('ember')] }, { ...r, relics: [relic('tooth', 0, 6)] },
    { ...r, relics: [relic('blade', 2)] }, { ...r, lastRoll: { values: [8], purpose: 'x' } },
    { ...r, phase: 'combat', combat: null }, { ...r, phase: 'reward', reward: null },
    { ...pending, pending: { ...pending.pending, id: 'blade' } }, { ...pending, pending: { ...pending.pending, price: -8 } }];
  for (const value of invalid) assert.ok(!S.isValidRun(value), JSON.stringify(value));
});

test('numeric and named inputs track every displayed choice', () => {
  const states = [S.newRun(1), fresh(), combat(), room('merchant'), room('trap'),
    act(room('camp', { relics: [relic('ember')] }), 'upgrade'),
    act(rewardRun({ relics: [relic('blade'), relic('cloak'), relic('tooth')] }), 'take:ember')];
  for (const r of states) S.actions(r).forEach((a, i) => {
    assert.equal(S.matchText(r, String(i + 1)), a.id); assert.equal(S.matchText(r, a.name), a.id);
  });
  assert.equal(S.matchText(combat(), '防守'), 'guard'); assert.equal(S.matchText(fresh(), '攻击'), null);
});

test('three build policies complete 600 seeded games; every intermediate save remains playable', () => {
  const phases = new Set(); let wins = 0, totalSteps = 0;
  for (const style of ['burn', 'guard', 'dice']) {
    let styleWins = 0;
    for (let seed = 0; seed < 200; seed++) {
      let r = S.newRun(seed), steps = 0;
      while (!['won', 'over'].includes(r.phase) && steps < 180) {
        assert.ok(S.isValidRun(copy(r)), `invalid ${style} seed ${seed} phase ${r.phase}`);
        phases.add(r.phase);
        const id = choose(r, style), result = S.act(r, id);
        assert.ok(!result.invalid, `invalid ${style} seed ${seed} ${r.phase}/${id}`);
        r = result.run; steps++;
      }
      assert.ok(['won', 'over'].includes(r.phase), `nonterminal ${style} seed ${seed}`);
      assert.ok(S.isValidRun(copy(r)));
      if (r.phase === 'won') { styleWins++; assert.equal(r.cleared, 9); }
      totalSteps += steps;
    }
    assert.ok(styleWins > 0 && styleWins < 200);
    wins += styleWins;
    console.log(`${style}: ${styleWins}/200 wins`);
  }
  for (const phase of ['explore', 'combat', 'room', 'reward', 'replace', 'upgrade', 'stairs', 'boss']) assert.ok(phases.has(phase), phase);
  console.log(`Simulation: ${wins}/600 wins; ${(totalSteps / 600).toFixed(1)} actions per run.`);
});

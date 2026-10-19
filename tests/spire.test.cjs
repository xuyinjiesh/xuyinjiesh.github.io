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

function combat(overrides = {}) {
  return Object.assign(S.newRun(23), {
    phase: 'combat', choices: null,
    combat: { turn: 1, enemy: { name: '测试守卫', icon: '♜', hp: 26, maxHp: 26, attack: 6, boss: false } }
  }, overrides);
}
function room(type, overrides = {}) {
  return Object.assign(S.newRun(42), { phase: 'room', choices: null, encounter: { type } }, overrides);
}
function choose(run) {
  const enabled = S.actions(run).filter(a => !a.disabled).map(a => a.id);
  if (run.hp <= run.maxHp - 8 && enabled.includes('potion')) return 'potion';
  if (run.phase === 'explore') {
    const known = S.view(run).known.type;
    return known === 'trap' || (known === 'monster' && run.hp < 16) ||
      (known === 'merchant' && run.gold < 4) ? 'unknown' : 'known';
  }
  if (run.phase === 'combat') {
    return enabled.includes('power') && (run.food > 3 - run.floor || run.combat.enemy.boss) &&
      run.combat.enemy.hp > run.weapon + 3 ? 'power' : 'attack';
  }
  if (run.phase === 'room') {
    if (run.encounter.type === 'camp') return run.hp <= run.maxHp - 6 ? 'rest' : 'forage';
    if (run.encounter.type === 'treasure') return run.weapon < 3 ? 'search' : 'gold';
    if (run.encounter.type === 'merchant') return enabled.includes('supply') && (run.food < 3 || run.hp < 18) ? 'supply' : enabled.includes('smith') ? 'smith' : 'leave';
    return run.food > 2 ? 'detour' : 'disarm';
  }
  if (run.phase === 'stairs') return run.hp < 15 ? 'recover' : run.armor < 1 ? 'armor' : enabled.includes('weapon') ? 'weapon' : 'recover';
  return 'enter';
}

test('same seed and saved RNG replay exactly without mutating the input', () => {
  let a = S.newRun(20261019);
  let b = copy(a);
  for (let i = 0; i < 100 && !['won', 'over'].includes(a.phase); i++) {
    const before = copy(a);
    const id = choose(a);
    const result = S.act(a, id);
    assert.deepEqual(copy(a), before);
    a = result.run;
    b = act(copy(b), id);
    assert.deepEqual(copy(a), copy(b));
  }
  assert.ok(['won', 'over'].includes(a.phase));
});

test('unknown room is hidden from the view and commits to the predealt room', () => {
  const run = S.newRun(6);
  run.choices = [{ type: 'camp' }, { type: 'trap' }];
  assert.equal(S.view(run).known.type, 'camp');
  assert.equal(JSON.stringify(S.view(run)).includes('trap'), false);
  const entered = act(run, 'unknown');
  assert.equal(entered.encounter.type, 'trap');
  assert.equal(entered.choices, null);
  assert.equal(S.act(entered, 'known').invalid, true);
});

test('ordinary combat applies dice + weapon and the displayed retaliation', () => {
  const run = combat({ armor: 2 });
  const next = act(run, 'attack');
  const damage = next.lastRoll.values[0] + run.weapon;
  assert.equal(next.combat.enemy.hp, run.combat.enemy.hp - damage);
  assert.equal(next.hp, run.hp - S.view(run).foe.incoming);
  assert.equal(next.combat.turn, 2);
  assert.equal(next.lastRoll.values.length, 1);
});

test('power attack spends one ration and uses the higher die plus two', () => {
  const run = combat();
  const next = act(run, 'power');
  assert.equal(next.food, run.food - 1);
  assert.equal(next.lastRoll.values.length, 2);
  assert.equal(next.combat.enemy.hp, 26 - Math.max(...next.lastRoll.values) - run.weapon - 2);
});

test('killing blows prevent retaliation, award loot once, and advance one room', () => {
  const run = combat({ hp: 1 });
  run.combat.enemy.hp = 1;
  const next = act(run, 'attack');
  assert.equal(next.hp, 1);
  assert.equal(next.gold, 3);
  assert.equal(next.kills, 1);
  assert.equal(next.room, 2);
  assert.equal(next.cleared, 1);
  assert.equal(S.act(next, 'attack').invalid, true);
});

test('potion heals without consuming a round or changing the enemy and RNG', () => {
  const run = combat({ hp: 19 });
  const next = act(run, 'potion');
  assert.equal(next.hp, 24);
  assert.equal(next.potions, 0);
  assert.deepEqual(copy(next.combat), copy(run.combat));
  assert.equal(next.rng, run.rng);
  assert.equal(S.act(next, 'potion').invalid, true);
});

test('all invalid and disabled actions preserve state, including currency and RNG', () => {
  const cases = [
    [S.newRun(1), 'attack'], [S.newRun(1), 'restart'], [S.newRun(1), 'potion'],
    [combat({ food: 0 }), 'power'], [room('merchant'), 'supply'], [room('merchant'), 'smith'],
    [room('merchant', { gold: 10, weapon: 4 }), 'smith'], [room('trap', { food: 0 }), 'detour'],
    [room('camp'), 'rest'], [room('camp'), 'gold'], [S.newRun(1), 'card:strike']
  ];
  for (const [run, id] of cases) {
    const res = S.act(run, id);
    assert.equal(res.invalid, true, id);
    assert.deepEqual(copy(res.run), copy(run));
  }
});

test('room rewards and merchant payments resolve only once', () => {
  assert.equal(act(room('camp'), 'forage').food, 5);
  assert.equal(act(room('camp', { hp: 20 }), 'rest').hp, 24);
  assert.equal(act(room('treasure'), 'gold').gold, 4);
  const bought = act(room('merchant', { gold: 7, hp: 20 }), 'supply');
  assert.equal(bought.gold, 3);
  assert.equal(bought.food, 5);
  assert.equal(bought.hp, 24);
  assert.equal(S.act(bought, 'supply').invalid, true);
  const forged = act(room('merchant', { gold: 6 }), 'smith');
  assert.equal(forged.gold, 0);
  assert.equal(forged.weapon, 2);
  const detour = act(room('trap'), 'detour');
  assert.equal(detour.food, 2);
  assert.equal(detour.hp, 24);
});

test('both outcomes of treasure and traps are reachable and fatal traps do not advance', () => {
  const outcomes = new Set();
  for (let seed = 0; seed < 100; seed++) {
    for (const type of ['treasure', 'trap']) {
      const run = room(type, { rng: seed, hp: 1 });
      const next = act(run, type === 'treasure' ? 'search' : 'disarm');
      const success = next.lastRoll.values[0] >= 4;
      outcomes.add(type + ':' + success);
      if (success) assert.equal(next.room, 2);
      else {
        assert.equal(next.phase, 'over');
        assert.equal(next.room, 1);
        assert.equal(next.cleared, 0);
      }
    }
  }
  assert.equal(outcomes.size, 4);
});

test('stairs consume food once; starvation can kill before entering the next floor', () => {
  const run = Object.assign(S.newRun(5), { phase: 'stairs', room: 3, cleared: 3, food: 1 });
  const next = act(run, 'weapon');
  assert.equal(next.floor, 2);
  assert.equal(next.room, 1);
  assert.equal(next.food, 0);
  assert.equal(next.weapon, 2);
  const starving = act({ ...run, hp: 4, food: 0 }, 'armor');
  assert.equal(starving.phase, 'over');
  assert.equal(starving.hp, 0);
  assert.equal(starving.floor, 1);
  const recovered = act({ ...run, hp: 1, food: 0 }, 'recover');
  assert.equal(recovered.floor, 2);
  assert.equal(recovered.hp, 5);
  assert.equal(recovered.maxHp, 26);
});

test('boss victory and death are terminal, can exit or restart, and never award twice', () => {
  const run = combat({ floor: 3, room: 3, cleared: 9 });
  run.combat.enemy.boss = true;
  run.combat.enemy.hp = 1;
  const won = act(run, 'attack');
  assert.equal(won.phase, 'won');
  assert.equal(won.gold, 10);
  assert.equal(S.act(won, 'attack').invalid, true);
  assert.equal(act(won, 'restart').phase, 'explore');
  const dead = act(combat({ hp: 1 }), 'attack');
  assert.equal(dead.phase, 'over');
  assert.equal(S.act(dead, 'potion').invalid, true);
  assert.equal(S.act(dead, 'quit').quit, true);
});

test('save validation rejects legacy, broken state and invalid dice', () => {
  const run = S.newRun(1);
  assert.equal(S.isValidRun(copy(run)), true);
  const invalid = [null, {}, { phase: 'combat', deck: [] }, { ...run, rng: null },
    { ...run, choices: [] }, { ...run, hp: -1 }, { ...run, phase: 'missing' },
    { ...run, lastRoll: { values: [8], purpose: 'attack' } }, { ...run, log: [42] },
    { ...run, phase: 'combat', combat: null }, { ...run, phase: 'room', encounter: { type: 'toString' } }];
  for (const value of invalid) assert.ok(!S.isValidRun(value));
});

test('numeric and named inputs correspond to displayed choices in every phase', () => {
  const states = [S.newRun(1), combat(), room('merchant'), room('trap'),
    { ...S.newRun(1), phase: 'stairs' }, { ...S.newRun(1), phase: 'won' }];
  for (const run of states) {
    S.actions(run).forEach((a, i) => {
      assert.equal(S.matchText(run, String(i + 1)), a.id);
      assert.equal(S.matchText(run, a.name), a.id);
    });
  }
  assert.equal(S.matchText(combat(), '强攻'), 'power');
  assert.equal(S.matchText(S.newRun(1), '攻击'), null);
});

test('500 complete seeded games remain valid, terminate, and have wins and losses', () => {
  const phases = new Set();
  const rooms = new Set();
  let wins = 0;
  let actions = 0;
  for (let seed = 0; seed < 500; seed++) {
    let run = S.newRun(seed);
    let steps = 0;
    while (!['won', 'over'].includes(run.phase) && steps < 100) {
      assert.ok(S.isValidRun(copy(run)), `invalid seed ${seed} phase ${run.phase}`);
      phases.add(run.phase);
      if (run.encounter) rooms.add(run.encounter.type);
      const result = S.act(run, choose(run));
      assert.ok(!result.invalid, `invalid choice seed ${seed} phase ${run.phase}`);
      run = result.run;
      steps++;
    }
    assert.ok(['won', 'over'].includes(run.phase));
    assert.ok(S.isValidRun(copy(run)));
    if (run.phase === 'won') { wins++; assert.equal(run.cleared, 9); }
    actions += steps;
  }
  assert.equal(phases.size, 5);
  assert.equal(rooms.size, 5);
  assert.ok(wins > 0 && wins < 500);
  console.log(`Simulation: ${wins}/500 wins, ${(actions / 500).toFixed(1)} actions per run.`);
});

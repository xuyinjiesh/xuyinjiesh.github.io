// GitHub project data tests, without network: node .github/scripts/check_projects.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../../js/projects.js'), 'utf8');
const repo = (name, extra = {}) => Object.assign({
  name, owner: { login: 'tester' }, private: false, fork: false, archived: false,
  description: 'Project ' + name, language: 'JavaScript', stargazers_count: 12,
  forks_count: 2, pushed_at: '2026-10-01T00:00:00Z'
}, extra);
const response = (data, status = 200, headers = {}) => ({
  ok: status === 200, status, headers: { get: name => headers[name] || null }, json: async () => data
});

function environment({ config = {}, storage = new Map(), handler, denied = false } = {}) {
  let now = Date.parse('2026-10-19T04:00:00Z'), nextTimer = 0;
  const calls = [], timers = new Map();
  class ClockDate extends Date { static now() { return now; } }
  const context = {
    window: { SITE: { githubProjects: Object.assign({ enabled: true, username: 'tester', limit: 6, cacheMinutes: 30, exclude: ['tester'] }, config) } },
    Date: ClockDate, AbortController,
    localStorage: {
      getItem(key) { if (denied) throw Error('Storage denied'); return storage.get(key) || null; },
      setItem(key, value) { if (denied) throw Error('Storage denied'); storage.set(key, value); }
    },
    fetch: (url, options) => { calls.push({ url, options }); return handler ? handler(url, options) : Promise.resolve(response([repo('default')])); },
    setTimeout(fn) { const id = ++nextTimer; timers.set(id, fn); return id; },
    clearTimeout(id) { timers.delete(id); }
  };
  vm.runInNewContext(source, context);
  return {
    api: context.window.GitHubProjects, config: context.window.SITE.githubProjects, calls, storage,
    advance(ms) { now += ms; },
    timeout() { const pending = [...timers.values()]; timers.clear(); pending.forEach(fn => fn()); }
  };
}

(async () => {
  const t = environment({ handler: async () => response([
    repo('older'), repo('newer', { pushed_at: '2026-10-18T00:00:00Z', html_url: 'javascript:alert(1)' }),
    repo('fork', { fork: true }), repo('archived', { archived: true }),
    repo('private', { private: true }), repo('hidden', { visibility: 'private' }),
    repo('disabled', { disabled: true }), repo('tester'),
    repo('someone-elses', { owner: { login: 'other' } }), repo('unsafe/name'), repo('newer')
  ]) });
  const first = t.api.load(), second = t.api.load();
  assert.equal(first, second, 'deduplicate concurrent requests');
  const result = await first;
  assert.equal(result.source, 'live');
  assert.deepEqual(Array.from(result.projects, p => p.title), ['newer', 'older']);
  assert.equal(result.projects[0].link, 'https://github.com/tester/newer');
  assert.equal(t.calls.length, 1);
  assert.ok(t.calls[0].url.includes('sort=pushed'));
  assert.equal(t.calls[0].options.credentials, 'omit');
  assert.equal(t.calls[0].options.headers.Authorization, undefined);
  assert.equal((await t.api.load()).source, 'cache');
  assert.equal(t.calls.length, 1);

  const cached = environment({ storage: t.storage, handler: async () => { throw Error('offline'); } });
  assert.equal((await cached.api.load()).source, 'cache');
  assert.equal(cached.calls.length, 0);
  cached.advance(31 * 60000);
  assert.equal((await cached.api.load()).source, 'stale');
  assert.equal((await cached.api.load()).source, 'stale');
  assert.equal(cached.calls.length, 1, 'do not retry every click while offline');
  cached.advance(8 * 86400000);
  assert.equal((await cached.api.load()).source, 'fallback');

  const limited = environment({ handler: async () => response(null, 403, { 'retry-after': '120' }) });
  assert.equal((await limited.api.load()).source, 'fallback');
  limited.advance(61000); await limited.api.load();
  assert.equal(limited.calls.length, 1);
  limited.advance(60000); await limited.api.load();
  assert.equal(limited.calls.length, 2);

  const pages = environment({ config: { limit: 2 }, handler: async url => response(url.endsWith('page=1')
    ? Array.from({ length: 100 }, (_, i) => repo('fork-' + i, { fork: true }))
    : [repo('second-page-a'), repo('second-page-b')]) });
  assert.equal((await pages.api.load()).projects.length, 2);
  assert.equal(pages.calls.length, 2);
  const forks = environment({ config: { includeForks: true }, handler: async () => response([repo('fork', { fork: true })]) });
  assert.equal((await forks.api.load()).projects[0].title, 'fork');

  const denied = environment({ denied: true });
  assert.equal((await denied.api.load()).source, 'live');
  assert.equal((await denied.api.load()).source, 'cache');
  const malformed = environment({ handler: async () => response({ message: 'not an array' }) });
  assert.equal((await malformed.api.load()).source, 'fallback');
  const empty = environment({ handler: async () => response([]) });
  const emptyResult = await empty.api.load();
  assert.equal(emptyResult.source, 'live'); assert.equal(emptyResult.projects.length, 0);

  const slow = environment({ handler: () => new Promise(() => {}) });
  const timedOut = slow.api.load();
  await Promise.resolve();
  slow.timeout();
  assert.equal((await timedOut).source, 'fallback');
  assert.equal(slow.calls[0].options.signal.aborted, true);
  const disabled = environment({ config: { enabled: false } });
  assert.equal(disabled.api.available(), false); await disabled.api.load(); assert.equal(disabled.calls.length, 0);
  const invalid = environment({ config: { username: '../bad' } });
  assert.equal(invalid.api.available(), false);
  const differentAccount = environment({ config: { username: 'another' }, storage: t.storage });
  assert.equal((await differentAccount.api.load()).source, 'live');
  assert.equal(differentAccount.calls.length, 1);

  console.log('Passed public repository filtering, sorting, pagination, safe links, request deduplication, persistent cache, offline/rate-limit/timeout fallback, unavailable storage and account isolation.');
})().catch(error => { console.error(error); process.exitCode = 1; });

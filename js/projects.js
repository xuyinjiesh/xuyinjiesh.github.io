/* GitHub 公开项目：按需读取、合并并发请求、缓存与断网回退。无需 token。 */
(function () {
  'use strict';

  var CACHE_PREFIX = 'homepage.github-projects.v1.';
  var MAX_STALE_MS = 7 * 86400000;
  var TIMEOUT_MS = 6000;
  var states = Object.create(null);

  function config() {
    var c = (window.SITE && window.SITE.githubProjects) || {};
    var username = String(c.username || '').trim();
    var exclude = Array.isArray(c.exclude) ? c.exclude.map(function (name) { return String(name).toLowerCase(); }).sort() : [];
    return {
      enabled: c.enabled !== false && /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(username),
      username: username,
      limit: Math.max(1, Math.min(12, Math.floor(Number(c.limit)) || 6)),
      ttl: Math.max(1, Math.min(1440, Number(c.cacheMinutes) || 30)) * 60000,
      includeForks: c.includeForks === true,
      exclude: exclude
    };
  }

  function available() { return config().enabled; }

  function count(value) {
    return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  }

  // 所有链接由账号与仓库名构造；网络响应和缓存里的 URL 不直接进入页面。
  function cleanProject(p, c) {
    if (!p || typeof p.title !== 'string' || !/^[\w.-]{1,100}$/.test(p.title)) return null;
    if (c.exclude.indexOf(p.title.toLowerCase()) !== -1) return null;
    var timestamp = Date.parse(p.updatedAt);
    return {
      title: p.title,
      desc: typeof p.desc === 'string' ? p.desc.slice(0, 500) : '',
      tag: typeof p.tag === 'string' ? p.tag.slice(0, 64) : '',
      link: 'https://github.com/' + encodeURIComponent(c.username) + '/' + encodeURIComponent(p.title),
      stars: count(p.stars),
      forks: count(p.forks),
      updatedAt: Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : ''
    };
  }

  function selectRepositories(repos, c) {
    var names = Object.create(null);
    return repos.filter(function (r) {
      return r && !r.private && r.visibility !== 'private' && !r.archived && !r.disabled &&
        (c.includeForks || !r.fork) && r.owner && typeof r.owner.login === 'string' &&
        r.owner.login.toLowerCase() === c.username.toLowerCase();
    }).map(function (r) {
      return cleanProject({ title: r.name, desc: r.description, tag: r.language,
        stars: r.stargazers_count, forks: r.forks_count, updatedAt: r.pushed_at || r.updated_at }, c);
    }).filter(function (p) {
      if (!p || names[p.title.toLowerCase()]) return false;
      names[p.title.toLowerCase()] = true;
      return true;
    }).sort(function (a, b) {
      return (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0) || a.title.localeCompare(b.title);
    }).slice(0, c.limit);
  }

  function signature(c) { return JSON.stringify([c.limit, c.includeForks, c.exclude]); }

  function readCache(c) {
    try {
      var record = JSON.parse(localStorage.getItem(CACHE_PREFIX + c.username.toLowerCase()));
      if (!record || record.signature !== signature(c) || !Array.isArray(record.projects) ||
        typeof record.savedAt !== 'number' || record.savedAt > Date.now() || Date.now() - record.savedAt > MAX_STALE_MS) return null;
      var projects = record.projects.map(function (p) { return cleanProject(p, c); });
      if (projects.some(function (p) { return !p; }) || projects.length > c.limit) return null;
      return { projects: projects, savedAt: record.savedAt };
    } catch (e) { return null; }
  }

  function fetchProjects(c) {
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timer;
    var repos = [];
    function page(number) {
      var url = 'https://api.github.com/users/' + encodeURIComponent(c.username) +
        '/repos?type=owner&sort=pushed&direction=desc&per_page=100&page=' + number;
      return fetch(url, {
        credentials: 'omit',
        headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2026-03-10' },
        signal: controller ? controller.signal : undefined
      }).then(function (response) {
        if (!response.ok) {
          var error = new Error('GitHub request failed');
          var reset = Number(response.headers.get('x-ratelimit-reset')) * 1000;
          var retry = Number(response.headers.get('retry-after')) * 1000;
          error.retryMs = response.status === 403 || response.status === 429
            ? Math.max(60000, Math.min(3600000, retry || reset - Date.now() || 300000)) : 60000;
          throw error;
        }
        return response.json();
      }).then(function (data) {
        if (!Array.isArray(data)) throw new Error('Invalid repository list');
        repos = repos.concat(data);
        var selected = selectRepositories(repos, c);
        if (selected.length < c.limit && data.length === 100 && number < 3) return page(number + 1);
        return selected;
      });
    }
    var timeout = new Promise(function (resolve, reject) {
      timer = setTimeout(function () {
        if (controller) controller.abort();
        reject(new Error('GitHub request timed out'));
      }, TIMEOUT_MS);
    });
    return Promise.race([Promise.resolve().then(function () { return page(1); }), timeout]).then(function (projects) {
      clearTimeout(timer);
      return projects;
    }, function (error) {
      clearTimeout(timer);
      throw error;
    });
  }

  function load() {
    var c = config();
    if (!c.enabled) return Promise.resolve({ source: 'disabled', projects: [] });
    var key = c.username.toLowerCase() + ':' + signature(c);
    var state = states[key] || (states[key] = { cached: readCache(c), pending: null, retryAt: 0 });
    var cached = state.cached;
    if (cached && Date.now() - cached.savedAt < c.ttl) return Promise.resolve({ source: 'cache', projects: cached.projects });
    if (state.pending) return state.pending;
    function fallback() {
      return cached && Date.now() - cached.savedAt <= MAX_STALE_MS
        ? { source: 'stale', projects: cached.projects } : { source: 'fallback', projects: [] };
    }
    if (Date.now() < state.retryAt) return Promise.resolve(fallback());
    state.pending = fetchProjects(c).then(function (projects) {
      var record = { projects: projects, savedAt: Date.now(), signature: signature(c) };
      state.cached = record;
      try { localStorage.setItem(CACHE_PREFIX + c.username.toLowerCase(), JSON.stringify(record)); } catch (e) {}
      return { source: 'live', projects: projects };
    }).catch(function (error) {
      state.retryAt = Date.now() + (error.retryMs || 60000);
      return fallback();
    }).then(function (result) {
      state.pending = null;
      return result;
    });
    return state.pending;
  }

  window.GitHubProjects = { available: available, load: load };
})();

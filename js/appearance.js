/* 时令手记、风景收藏与起始页。全部使用本地资源。 */
(function () {
  'use strict';

  var root = document.documentElement;
  var dialog = document.getElementById('theme-dialog');
  var grid = document.getElementById('theme-grid');
  var toggle = document.getElementById('theme-toggle');
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.theme-tabs [role="tab"]'));
  var catalog = Object.keys(ThemeEngine.THEMES).filter(function (id) { return id !== 'birthday'; });
  var terms = catalog.filter(function (id) { return ThemeEngine.THEMES[id].category === 'term'; });
  var activeCategory = 'term';

  function updateDate() {
    var date = new Date();
    var time = document.getElementById('scene-date');
    var pad = function (n) { return String(n).padStart(2, '0'); };
    time.dateTime = date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
    time.textContent = time.dateTime.replace(/-/g, '.') + ' / ' + date.toLocaleDateString('zh-CN', { weekday: 'long' });
  }

  function updateScene(theme) {
    if (!theme) return;
    document.getElementById('current-theme-label').textContent = theme.label;
    document.getElementById('scene-name').textContent = theme.label;
    document.getElementById('scene-caption').textContent = theme.caption;
    document.getElementById('scene-icon').textContent = '✳';
    document.getElementById('scene-category').textContent = {
      term: '二十四节气', festival: '人间好时节', daily: '四季手记'
    }[theme.category];
    document.getElementById('scene-index').textContent = theme.category === 'term'
      ? String(terms.indexOf(theme.id) + 1).padStart(2, '0') + ' / 24'
      : theme.category === 'festival' ? 'A DAY TO REMEMBER' : theme.id === 'default' ? 'EVERYDAY' : theme.id.toUpperCase();
    document.getElementById('loader-caption').textContent = theme.label + ' · ' + theme.caption;
    toggle.setAttribute('aria-label', '当前风景：' + theme.label + '，打开风景收藏');
    Array.prototype.forEach.call(grid.querySelectorAll('button'), function (button) {
      button.setAttribute('aria-pressed', String(button.dataset.theme === theme.id));
    });
    updateDate();
  }

  function requestTheme(id) {
    document.dispatchEvent(new CustomEvent('theme-request', { detail: id }));
    document.getElementById('theme-selection-status').textContent = id ? '已切换 · ' + window.__theme.label : '已跟随时令';
  }

  function renderCollection(category) {
    activeCategory = category;
    tabs.forEach(function (tab) {
      var selected = tab.dataset.category === category;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
    grid.setAttribute('aria-labelledby', 'tab-' + category);
    grid.replaceChildren();
    grid.scrollTop = 0;
    catalog.filter(function (id) { return ThemeEngine.THEMES[id].category === category; }).forEach(function (id) {
      var theme = ThemeEngine.get(id);
      var tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'theme-tile';
      tile.dataset.theme = id;
      tile.style.backgroundColor = theme.vars['--bg-1'];
      tile.style.setProperty('--swatch', 'url("' + new URL(theme.wallpaper, document.baseURI).href + '")');
      tile.setAttribute('aria-pressed', String(window.__theme.id === id));
      tile.setAttribute('aria-label', theme.label + '，' + theme.caption);
      var name = document.createElement('strong');
      name.textContent = theme.label;
      var caption = document.createElement('small');
      caption.textContent = theme.caption;
      tile.append(name, caption);
      tile.addEventListener('click', function () { requestTheme(id); });
      grid.appendChild(tile);
    });
  }

  toggle.addEventListener('click', function () {
    renderCollection(activeCategory);
    document.getElementById('theme-selection-status').textContent = '';
    dialog.showModal();
  });
  document.getElementById('close-themes').addEventListener('click', function () { dialog.close(); });
  dialog.addEventListener('click', function (event) {
    if (event.target !== dialog) return;
    var rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  document.getElementById('auto-theme').addEventListener('click', function () { requestTheme(null); });
  tabs.forEach(function (tab, index) {
    tab.addEventListener('click', function () { renderCollection(tab.dataset.category); });
    tab.addEventListener('keydown', function (event) {
      var next;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = tabs.length - 1;
      if (next === undefined) return;
      event.preventDefault();
      renderCollection(tabs[next].dataset.category);
      tabs[next].focus();
    });
  });
  document.addEventListener('themechange', function (event) { updateScene(event.detail); });
  updateScene(window.__theme);
  setInterval(updateDate, 60000);

  function updateMusic(state) {
    var panel = document.getElementById('now-playing');
    panel.hidden = !state.enabled || !state.track;
    if (!state.track) return;
    var track = state.track;
    document.getElementById('music-state').textContent = {
      loading: '正在载入', playing: '此刻正在听', paused: '已暂停 · 返回后继续',
      waiting: '轻触页面，继续播放', unavailable: '曲目暂时无法播放'
    }[state.state] || '时令音乐';
    var title = document.getElementById('music-title');
    title.textContent = track.title;
    title.href = track.source;
    title.title = track.composer ? track.composer + ' · ' + track.title : track.title;
    document.getElementById('music-artist').textContent = track.artist;
    var license = document.getElementById('music-license');
    license.textContent = track.license;
    license.href = track.licenseUrl;
    license.setAttribute('aria-label', track.title + ' 的录音许可：' + track.license);
  }
  document.addEventListener('musicchange', function (event) { updateMusic(event.detail); });
  if (window.AmbientAudio) updateMusic(window.AmbientAudio.getState());

  var app = document.getElementById('site-content');
  var loader = document.getElementById('page-loader');
  var released = false;
  function finishLoading() {
    if (released) return;
    released = true;
    clearTimeout(window.__loadingFallback);
    app.inert = false;
    delete root.dataset.loading;
    if (loader.contains(document.activeElement)) toggle.focus({ preventScroll: true });
    loader.inert = true;
    loader.setAttribute('aria-hidden', 'true');
  }
  document.getElementById('skip-loader').addEventListener('click', finishLoading);
  if (root.hasAttribute('data-loading')) {
    app.inert = true;
    var reduced = root.dataset.motion === 'reduce' ||
      (root.dataset.motion !== 'full' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    var minimum = Math.max(0, (reduced ? 0 : 1100) - (performance.now() - window.__loadingStarted));
    Promise.race([
      Promise.all([window.__themeReady || Promise.resolve(), new Promise(function (done) { setTimeout(done, minimum); })]),
      new Promise(function (done) { setTimeout(done, 2800); })
    ]).then(function () {
      document.getElementById('loader-status').textContent = '风景已就绪，欢迎光临';
      finishLoading();
    });
  } else {
    finishLoading();
  }
})();

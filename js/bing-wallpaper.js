/* 可选 Bing 随机壁纸：打开面板才请求，手动应用后在本机保存同一张图片。
 * 用 Blob URL 复用已下载的图片，避免随机接口在预览、应用时返回不同图片。
 */
(function () {
  'use strict';

  var ENDPOINT = 'https://uapis.cn/api/v1/image/bing-daily';
  var TIMEOUT_MS = 15000;
  var STORE_KEY = 'homepage.bing-wallpaper.v1';
  var root = document.documentElement;
  var frame = document.getElementById('bing-preview');
  var placeholder = document.getElementById('bing-placeholder');
  var status = document.getElementById('bing-status');
  var randomButton = document.getElementById('bing-random');
  var applyButton = document.getElementById('bing-apply');
  var resetButton = document.getElementById('bing-reset');
  var badge = document.getElementById('bing-active');
  var selectionStatus = document.getElementById('theme-selection-status');
  var memoryHint = document.getElementById('bing-memory');
  var candidate = null;
  var candidateBlob = null;
  var candidateData = null;
  var applied = null;
  var busy = false;
  var attempted = false;
  var selectionVersion = 0;
  var restoreCancelled = false;

  function release(url) {
    if (url && url.indexOf('blob:') === 0 && url !== candidate && url !== applied) URL.revokeObjectURL(url);
  }

  function updateControls() {
    randomButton.disabled = busy;
    randomButton.textContent = busy ? '加载中…' : '随机一张';
    applyButton.disabled = busy || !candidate || candidate === applied;
    applyButton.textContent = candidate && candidate === applied ? '已设为背景' : '设为背景';
    resetButton.disabled = !applied;
    badge.hidden = !applied;
    frame.setAttribute('aria-busy', String(busy));
  }

  function notifyChange() {
    updateControls();
    document.dispatchEvent(new CustomEvent('wallpaperchange'));
  }

  function decodeImage(url, signal) {
    return new Promise(function (resolve, reject) {
      var image = new Image();
      image.alt = 'Bing 随机风景预览';
      function cleanup() {
        image.onload = image.onerror = null;
        signal.removeEventListener('abort', abort);
      }
      function abort() {
        cleanup();
        reject(new Error('Image loading timed out'));
      }
      image.onload = function () { cleanup(); resolve(image); };
      image.onerror = function () { cleanup(); reject(new Error('Invalid image')); };
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) { abort(); return; }
      image.src = url;
    });
  }

  function forgetSaved() {
    try { localStorage.removeItem(STORE_KEY); return true; } catch (error) { return false; }
  }

  function readImageData(blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = reader.onabort = function () { reject(new Error('Image could not be saved')); };
      reader.readAsDataURL(blob);
    });
  }

  async function remember(blob, data, url, version) {
    try {
      var saved = data || await readImageData(blob);
      // 转换图片期间可能已恢复主题或应用另一张；旧任务不能写回选择。
      if (version !== selectionVersion || applied !== url) return;
      localStorage.setItem(STORE_KEY, saved);
      memoryHint.textContent = '已记住这帧风景';
      status.textContent = '已记住这帧风景，下次打开还会在这里。';
    } catch (error) {
      if (version !== selectionVersion || applied !== url) return;
      forgetSaved();
      memoryHint.textContent = '暂未保存，仅本次生效';
      status.textContent = '已设为背景，但浏览器暂时无法保存，下次可重新选择。';
    }
  }

  async function restoreSaved() {
    var saved;
    try { saved = localStorage.getItem(STORE_KEY); } catch (error) { return; }
    if (!saved) return;
    // 只接受自己保存的图片数据，不恢复远程地址或已失效的 Blob URL。
    if (!/^data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=]+$/i.test(saved)) { forgetSaved(); return; }
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, TIMEOUT_MS);
    try {
      var image = await decodeImage(saved, controller.signal);
      if (restoreCancelled) return;
      candidate = applied = candidateData = saved;
      attempted = true;
      frame.replaceChildren(image);
      root.style.setProperty('--bing-wallpaper', 'url("' + applied + '")');
      root.dataset.bingWallpaper = '';
      memoryHint.textContent = '已记住这帧风景';
      status.textContent = '已恢复上次选择的风景，欢迎回来。';
      notifyChange();
    } catch (error) {
      if (!restoreCancelled) {
        forgetSaved();
        status.textContent = '保存的风景暂时无法打开，请重新选一帧。';
      }
    } finally {
      clearTimeout(timer);
    }
  }

  async function randomPreview() {
    if (busy) return;
    restoreCancelled = true;
    attempted = true;
    busy = true;
    status.textContent = '正在寻找一帧风景…';
    updateControls();
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, TIMEOUT_MS);
    var url = null;
    try {
      var endpoint = new URL(ENDPOINT);
      endpoint.searchParams.set('random', 'true');
      endpoint.searchParams.set('resolution', '1080');
      endpoint.searchParams.set('r', Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
      var response = await fetch(endpoint.href, {
        signal: controller.signal, credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer'
      });
      if (!response.ok) throw new Error('Wallpaper request failed');
      var blob = await response.blob();
      if (!/^image\//i.test(blob.type) || !blob.size) throw new Error('Invalid image response');
      url = URL.createObjectURL(blob);
      var image = await decodeImage(url, controller.signal);
      var previous = candidate;
      candidate = url;
      candidateBlob = blob;
      candidateData = null;
      frame.replaceChildren(image);
      release(previous);
      status.textContent = '喜欢这帧风景，就把它设为背景吧。';
    } catch (error) {
      status.textContent = '这次没能载入风景，点击「随机一张」再试试。';
      if (!candidate) placeholder.textContent = '风景暂时没有抵达';
    } finally {
      clearTimeout(timer);
      release(url);
      busy = false;
      updateControls();
    }
  }

  function reset() {
    restoreCancelled = true;
    selectionVersion++;
    var cleared = forgetSaved();
    var previous = applied;
    applied = null;
    root.style.removeProperty('--bing-wallpaper');
    delete root.dataset.bingWallpaper;
    release(previous);
    memoryHint.textContent = '会记住已应用的壁纸';
    if (previous) {
      status.textContent = cleared ? '已恢复主题背景，并清除保存的选择。' : '已恢复主题背景，但浏览器未能清除保存记录。';
      selectionStatus.textContent = '已恢复主题背景';
      notifyChange();
    }
  }

  randomButton.addEventListener('click', randomPreview);
  applyButton.addEventListener('click', function () {
    if (busy || !candidate) return;
    restoreCancelled = true;
    var version = ++selectionVersion;
    var previous = applied;
    applied = candidate;
    root.style.setProperty('--bing-wallpaper', 'url("' + applied + '")');
    root.dataset.bingWallpaper = '';
    release(previous);
    status.textContent = '已换上这帧风景，主题配色与音乐照常。';
    selectionStatus.textContent = '已应用 · Bing 壁纸';
    memoryHint.textContent = '正在记住这帧风景…';
    notifyChange();
    remember(candidateBlob, candidateData, applied, version);
  });
  resetButton.addEventListener('click', reset);

  window.BingWallpaper = {
    open: function () { window.__bingWallpaperReady.then(function () { if (!attempted) randomPreview(); }); },
    reset: reset,
    isActive: function () { return !!applied; }
  };
  updateControls();
  window.__bingWallpaperReady = restoreSaved();
})();

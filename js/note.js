/*
 * 私信小纸条：在聊天流里渲染一张表单卡片，把留言 POST 给 Web3Forms 转成邮件。
 * 纯前端、无依赖；文案与密钥都在 js/content.js 的 SITE.note 里改。
 *
 * 注意：气泡 HTML 会被 chat.js 存进 localStorage 并在刷新后原样恢复，
 * 所以事件一律走 document 级委托 —— 恢复出来的旧表单同样能提交。
 */
(function () {
  'use strict';

  var COOLDOWN_KEY = 'homepage.note.last.v1';

  function cfg() { return (window.SITE && window.SITE.note) || {}; }

  // access key 是公开的（官方说明无需隐藏），但没填之前不该让访客白写一通
  function ready() {
    var c = cfg();
    return !!(c.enabled !== false && c.accessKey && c.accessKey.indexOf('REPLACE') !== 0 && c.endpoint);
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function cooldownLeft() {
    try {
      var last = Number(localStorage.getItem(COOLDOWN_KEY) || 0);
      return Math.max(0, (cfg().cooldownMs || 60000) - (Date.now() - last));
    } catch (e) { return 0; }
  }

  // 卡片 HTML 交给 chat.js 的 addMsg 塞进气泡
  // 蜜罐用 Web3Forms 认的 botcheck（必须是 checkbox），真人看不见，脚本填了就丢弃
  function card() {
    var c = cfg(), max = c.maxLength || 500;
    if (!ready()) {
      return '<div class="note-card"><p class="note-tip">小纸条还没接通：' +
        '把 Web3Forms 的 access key 填进 SITE.note.accessKey 就好。</p></div>';
    }
    return '' +
      '<form class="note-card" data-note-form novalidate>' +
        '<p class="note-tip">' + esc(c.intro || '') + '</p>' +
        '<label class="note-row"><span>怎么称呼</span>' +
          '<input name="name" maxlength="24" autocomplete="nickname" placeholder="可以不写"></label>' +
        '<label class="note-row"><span>回信地址</span>' +
          '<input name="email" type="email" maxlength="80" autocomplete="email" placeholder="想收回信就留一个"></label>' +
        '<label class="note-row"><span>纸条内容</span>' +
          '<textarea name="message" rows="3" maxlength="' + max + '" placeholder="写点什么…"></textarea></label>' +
        '<input class="note-hp" type="checkbox" name="botcheck" tabindex="-1" aria-hidden="true">' +
        '<div class="note-foot">' +
          '<span class="note-count" data-note-count>0/' + max + '</span>' +
          '<button type="submit">递出去 ✉️</button>' +
        '</div>' +
        '<p class="note-status" data-note-status role="status" aria-live="polite"></p>' +
      '</form>';
  }

  function textOf(form, name) {
    var el = form.elements[name];
    return el ? String(el.value || '').trim() : '';
  }

  function setStatus(form, msg, kind) {
    var el = form.querySelector('[data-note-status]');
    if (!el) return;
    el.textContent = msg;
    el.className = 'note-status' + (kind ? ' ' + kind : '');
  }

  function submit(form) {
    var c = cfg(), max = c.maxLength || 500;
    var msg = textOf(form, 'message');
    if (!msg) { setStatus(form, '纸条还是空的，写两句再递吧。', 'err'); return; }
    if (msg.length > max) { setStatus(form, '有点长，精简一下？', 'err'); return; }
    if (form.elements.botcheck && form.elements.botcheck.checked) {
      setStatus(form, '已收到，谢谢。', 'ok');  // 蜜罐命中：只哄走机器人，不发请求
      return;
    }
    var left = cooldownLeft();
    if (left > 0) {
      setStatus(form, '刚递过一张啦，' + Math.ceil(left / 1000) + ' 秒后再来。', 'err');
      return;
    }

    var email = textOf(form, 'email');
    var btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    setStatus(form, '正在递送…');

    fetch(c.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        access_key: c.accessKey,
        subject: c.subject || '来自个人主页的小纸条',
        from_name: c.fromName || '个人主页 · 小纸条',
        name: textOf(form, 'name') || '匿名访客',
        // Web3Forms 默认把 email 当作通知邮件的 Reply-To：你直接点「回复」就能回信
        email: email || undefined,
        message: msg,
        page: location.href,
        sent_at: new Date().toLocaleString('zh-CN')
      })
    }).then(function (r) {
      // 出错时服务端可能返回非 JSON，别让解析失败盖掉真正的错误
      return r.json().then(function (d) { return d; }, function () { return null; });
    }).then(function (d) {
      d = d || {};
      // 成功只有一个判据：success === true（官方成功结构里 message 可能嵌在 body 下）
      if (d.success !== true) {
        throw new Error((d.body && d.body.message) || d.message || d.error || '发送失败');
      }
    }).then(function () {
      try { localStorage.setItem(COOLDOWN_KEY, String(Date.now())); } catch (e) {}
      form.reset();
      var cnt = form.querySelector('[data-note-count]');
      if (cnt) cnt.textContent = '0/' + max;
      setStatus(form, '递到了！站主会看到的，谢谢你的纸条。💌', 'ok');
    }).catch(function (err) {
      // 失败也要说清原因（配额用尽、密钥失效…），并留一条邮箱兜底，别把内容弄丢
      var mail = ((window.SITE.profile.contacts || []).filter(function (x) {
        return x.href && x.href.indexOf('mailto:') === 0;
      })[0] || {}).href || 'mailto:';
      var el = form.querySelector('[data-note-status]');
      var reason = (err && err.message && err.message !== '发送失败')
        ? err.message : '网络或服务出了点问题';
      if (el) {
        el.className = 'note-status err';
        el.innerHTML = '没递出去（' + esc(reason) + '），可以<a href="' + esc(mail) +
          '?subject=' + encodeURIComponent('小纸条') +
          '&body=' + encodeURIComponent(msg) + '">直接用邮箱发给我</a>。';
      }
    }).then(function () { btn.disabled = false; });
  }

  // 事件委托：新渲染的表单和历史记录里恢复出来的表单走同一套逻辑
  document.addEventListener('submit', function (e) {
    var f = e.target;
    if (!f || !f.hasAttribute || !f.hasAttribute('data-note-form')) return;
    e.preventDefault();
    submit(f);
  });

  document.addEventListener('input', function (e) {
    var f = e.target && e.target.form;
    if (!f || !f.hasAttribute('data-note-form') || e.target.name !== 'message') return;
    var cnt = f.querySelector('[data-note-count]');
    if (cnt) cnt.textContent = e.target.value.length + '/' + (cfg().maxLength || 500);
  });

  window.Note = { card: card, ready: ready };
})();

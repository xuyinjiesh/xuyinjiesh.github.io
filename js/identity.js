/*
 * 身份信息的唯一入口（数据层）。
 *
 * 真实值不写在仓库里，而是放在 js/identity.local.js —— 该文件被 .gitignore 忽略，
 * 本地由你自己维护，线上由 GitHub Actions 在部署时从仓库变量/密钥注入：
 *
 *   window.IDENTITY = { name: '...', email: '...', github: '...' };
 *
 * 若该文件不存在（例如刚 clone 下来），下面的 DEFAULTS 兜底，站点照常渲染。
 * 改一处即可全局生效：content.js 的数据、index.html 的静态文案都从这里派生。
 */
(function () {
  'use strict';

  // 刻意只放非敏感项。邮箱留空，真实邮箱永远不进入 git 历史。
  var DEFAULTS = {
    name: 'Yinjie Xu',
    email: '',
    github: 'xuyinjiesh'
  };

  var injected = window.IDENTITY || {};
  var identity = {};
  Object.keys(DEFAULTS).forEach(function (key) {
    identity[key] = injected[key] || DEFAULTS[key];
  });
  window.IDENTITY = Object.freeze(identity);

  // 把身份信息写回静态 HTML（title / meta / sr-only / noscript）。
  // HTML 里只放 {{NAME}} 这类占位符；CI 部署时会再做一次构建期替换，
  // 让不执行 JS 的爬虫与 noscript 访客也能拿到真值。
  window.applyIdentity = function (root) {
    var scope = root || document;
    var derived = {
      name: identity.name,
      email: identity.email,
      github: identity.github,
      githubText: identity.github ? 'github.com/' + identity.github : '',
      title: identity.name ? identity.name + ' 的个人主页' : '',
      description: identity.name
        ? identity.name + ' 的个人主页：一个住在聊天窗口里的主页。关于我、项目作品、最近动态与联系方式。'
        : ''
    };

    Array.prototype.forEach.call(scope.querySelectorAll('[data-identity]'), function (el) {
      var key = el.getAttribute('data-identity');
      var value = derived[key];

      // 值缺失（例如线上没配 SITE_EMAIL）时，宁可整条移除，
      // 也绝不把 {{EMAIL}} 这种占位符裸露给访客和读屏软件。
      if (!value) {
        var item = el.closest('[data-identity-item]');
        (item || el).remove();
        return;
      }

      if (key === 'email') {
        el.textContent = value;
        el.setAttribute('href', 'mailto:' + value);
      } else if (key === 'github') {
        el.setAttribute('href', 'https://github.com/' + value);
      } else if (key === 'description') {
        el.setAttribute('content', value);
      } else {
        el.textContent = value;
      }
    });
  };
})();

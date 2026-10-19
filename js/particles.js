/*
 * 背景粒子与随主题变化的点击小景。
 * 密度刻意压得很低，只负责“呼吸感”。
 * 是否启动由调用方按站内动效开关决定（见 js/chat.js），本文件不再自查系统偏好。
 */
(function () {
  'use strict';

  var rafId = null;
  var onResize = null;
  var onClick = null;

  function clickEffect(theme, type) {
    var motifs = {
      lanterns: 'lanterns', leaves: 'leaves', wheat: 'leaves', reeds: 'leaves',
      persimmons: 'leaves', sprouts: 'leaves', willow: 'leaves', trees: 'leaves',
      flowers: 'petals', plum: 'petals', chrysanthemums: 'flowers',
      snow: 'snow', stars: 'stars', moon: 'stars', hearts: 'hearts',
      balloons: 'balloons', pumpkins: 'pumpkins', fireworks: 'fireworks',
      rain: 'ripples', boats: 'ripples', mountains: 'ripples',
      lotus: 'fireflies', sun: 'fireflies', lights: 'fireflies'
    };
    return motifs[theme.motif] || { spring: 'petals', summer: 'fireflies', autumn: 'leaves', winter: 'snow' }[theme.season] ||
      (type === 'none' || type === 'rain' ? 'ripples' : type);
  }

  // 用矢量绘制，避免额外图片请求；所有坐标均为相对粒子大小的局部坐标。
  function drawClick(ctx, p) {
    ctx.save();
    ctx.globalAlpha = Math.min(p.age / 0.12, 1, (p.life - p.age) / 0.65) * 0.9;
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    var size = p.size * (0.75 + Math.min(p.age * 4, 0.25));
    ctx.scale(size, size);
    ctx.fillStyle = p.color;
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 0.08;
    ctx.lineCap = 'round';

    switch (p.kind) {
      case 'leaves':
        ctx.beginPath(); ctx.moveTo(0, -1);
        ctx.bezierCurveTo(1.1, -0.6, 0.95, 0.5, 0, 1);
        ctx.bezierCurveTo(-0.95, 0.5, -1.1, -0.6, 0, -1); ctx.fill();
        ctx.strokeStyle = 'rgba(80,55,28,.45)';
        ctx.beginPath(); ctx.moveTo(0, -0.75); ctx.lineTo(0, 1.25);
        ctx.moveTo(0, 0.25); ctx.lineTo(0.42, -0.15);
        ctx.moveTo(0, -0.1); ctx.lineTo(-0.4, -0.45); ctx.stroke();
        break;
      case 'petals':
        ctx.beginPath(); ctx.moveTo(0, 1);
        ctx.bezierCurveTo(-1.2, 0.2, -0.95, -1, -0.22, -0.85);
        ctx.lineTo(0, -0.6); ctx.lineTo(0.22, -0.85);
        ctx.bezierCurveTo(0.95, -1, 1.2, 0.2, 0, 1); ctx.fill();
        break;
      case 'lanterns':
        var glow = ctx.createRadialGradient(0, 0, 0.2, 0, 0, 1.8);
        glow.addColorStop(0, 'rgba(255,192,93,.35)');
        glow.addColorStop(1, 'rgba(255,160,65,0)');
        ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, 0, 1.8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.ellipse(0, 0, 0.78, 0.95, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#ffd58a'; ctx.lineWidth = 0.055;
        ctx.beginPath(); ctx.ellipse(0, 0, 0.35, 0.9, 0, 0, Math.PI * 2);
        ctx.moveTo(-0.75, 0); ctx.lineTo(0.75, 0); ctx.stroke();
        ctx.fillStyle = '#f8cd7a';
        ctx.fillRect(-0.3, -0.98, 0.6, 0.14); ctx.fillRect(-0.3, 0.84, 0.6, 0.14);
        ctx.beginPath(); ctx.moveTo(0, -0.98); ctx.lineTo(0, -1.3);
        ctx.moveTo(0, 0.98); ctx.lineTo(0, 1.48); ctx.stroke();
        ctx.fillRect(-0.09, 1.3, 0.18, 0.35);
        break;
      case 'snow':
        ctx.strokeStyle = '#eefaff'; ctx.lineWidth = 0.09;
        for (var s = 0; s < 6; s++) {
          ctx.rotate(Math.PI / 3);
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -1);
          ctx.moveTo(-0.22, -0.55); ctx.lineTo(0, -0.75); ctx.lineTo(0.22, -0.55); ctx.stroke();
        }
        break;
      case 'stars':
        ctx.beginPath();
        for (var k = 0; k < 10; k++) {
          var angle = k * Math.PI / 5 - Math.PI / 2;
          var radius = k % 2 ? 0.4 : 1;
          if (k === 0) ctx.moveTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
          else ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
        }
        ctx.closePath(); ctx.fill();
        break;
      case 'hearts':
        ctx.beginPath(); ctx.moveTo(0, 0.95);
        ctx.bezierCurveTo(-1.7, -0.15, -0.65, -1.5, 0, -0.55);
        ctx.bezierCurveTo(0.65, -1.5, 1.7, -0.15, 0, 0.95); ctx.fill();
        break;
      case 'balloons':
        ctx.beginPath(); ctx.ellipse(0, 0, 0.72, 0.95, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(0, 0.85); ctx.lineTo(-0.15, 1.1); ctx.lineTo(0.15, 1.1); ctx.fill();
        ctx.strokeStyle = 'rgba(255,244,216,.7)'; ctx.lineWidth = 0.04;
        ctx.beginPath(); ctx.moveTo(0, 1.1); ctx.bezierCurveTo(-0.4, 1.5, 0.4, 1.8, 0, 2.25); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 0.1;
        ctx.beginPath(); ctx.ellipse(-0.24, -0.3, 0.15, 0.28, 0.4, Math.PI, Math.PI * 1.8); ctx.stroke();
        break;
      case 'pumpkins':
        ctx.beginPath(); ctx.ellipse(0, 0, 0.95, 0.78, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#b97139'; ctx.lineWidth = 0.045;
        ctx.beginPath(); ctx.ellipse(0, 0, 0.45, 0.75, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#ffe59a';
        ctx.beginPath(); ctx.moveTo(-0.55, -0.05); ctx.lineTo(-0.22, -0.05); ctx.lineTo(-0.35, -0.36); ctx.fill();
        ctx.beginPath(); ctx.moveTo(0.22, -0.05); ctx.lineTo(0.55, -0.05); ctx.lineTo(0.35, -0.36); ctx.fill();
        ctx.beginPath(); ctx.arc(0, 0.13, 0.33, 0, Math.PI); ctx.fill();
        ctx.strokeStyle = '#a4b779'; ctx.lineWidth = 0.16;
        ctx.beginPath(); ctx.moveTo(0, -0.75); ctx.lineTo(0.15, -1.02); ctx.stroke();
        break;
      case 'flowers':
        for (var f = 0; f < 12; f++) {
          ctx.rotate(Math.PI / 6);
          ctx.beginPath(); ctx.ellipse(0, -0.56, 0.17, 0.6, 0, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = '#d7a653'; ctx.beginPath(); ctx.arc(0, 0, 0.25, 0, Math.PI * 2); ctx.fill();
        break;
      case 'ripples':
        ctx.lineWidth = 0.055;
        ctx.beginPath(); ctx.ellipse(0, 0, 0.3 + p.age * 1.8, 0.12 + p.age * 0.7, 0, 0, Math.PI * 2); ctx.stroke();
        break;
      default: // 萤火：柔光的中心保留一个明亮光点。
        var light = ctx.createRadialGradient(0, 0, 0, 0, 0, 1.5);
        light.addColorStop(0, p.color); light.addColorStop(1, 'rgba(226,245,175,0)');
        ctx.fillStyle = light; ctx.beginPath(); ctx.arc(0, 0, 1.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fffbd5'; ctx.beginPath(); ctx.arc(0, 0, 0.18, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  window.Particles = {
    start: function (config, accent, theme) {
      window.Particles.stop(); // 防止重复启动叠出多个动画循环
      var canvas = document.getElementById('particles');
      if (!canvas || !config) return;

      var ctx = canvas.getContext('2d');
      if (!ctx) return;
      theme = theme || {};
      var W, H, dpr;
      var ps = [];
      var type = config.type;
      var density = type === 'none' || type === 'fireworks' ? 0 : (config.density || 20);
      var effect = clickEffect(theme, type);
      var clicks = [];
      var lastClick = -Infinity;
      var lastFrame = performance.now();

      function resize() {
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        W = window.innerWidth; H = window.innerHeight;
        canvas.width = W * dpr; canvas.height = H * dpr;
        canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      resize();
      onResize = resize;
      window.addEventListener('resize', onResize);

      // 使用 click 而非 pointerdown，手机滑动、拖动选字与键盘操作不会误触。
      onClick = function (e) {
        if (e.defaultPrevented || e.button !== 0 || e.detail === 0 ||
            document.documentElement.hasAttribute('data-loading') || document.querySelector('dialog[open]')) return;
        if (!e.target || !e.target.closest || e.target.closest(
          '.chat-window, button, a, input, textarea, select, label, dialog, [role="button"], [role="dialog"], [contenteditable]:not([contenteditable="false"])'
        )) return;
        var selection = window.getSelection();
        if (selection && !selection.isCollapsed) return;
        var now = performance.now();
        if (now - lastClick < 180) return;
        lastClick = now;
        if (effect === 'fireworks') {
          if (rockets.length < 4 && sparksFw.length + rockets.length * 70 < 420) launchRocketAt(e.clientX, e.clientY);
        } else {
          burst(e.clientX, e.clientY);
        }
        // 日常纯背景没有常驻动画，只在点击后临时唤醒。
        if (rafId === null) { lastFrame = now; rafId = requestAnimationFrame(tick); }
      };
      window.addEventListener('click', onClick, { passive: true });

      function rnd(a, b) { return a + Math.random() * (b - a); }

      function burst(x, y) {
        var rising = /^(lanterns|balloons|hearts|fireflies)$/.test(effect);
        var large = /^(lanterns|balloons|pumpkins)$/.test(effect);
        var count = effect === 'ripples' ? 3 : large || effect === 'flowers' ? 4 : 9;
        var green = theme.season === 'spring' || theme.season === 'summer';
        var palettes = {
          leaves: green ? ['#a9ca7c', '#79ac80', '#d0dda0'] : ['#dca153', '#c97449', '#eac578'],
          petals: ['#ffd2df', '#eeb5ce', '#ffe7d6'], lanterns: ['#de6852', '#d8504c', '#ec9063'],
          hearts: ['#eaa8bd', '#ffd1da', '#e786a7'], balloons: ['#ecc885', '#9ecbd0', '#ddaed0'],
          pumpkins: ['#e9a054', '#f1ba69'], flowers: ['#efd38e', '#f8e6ab']
        };
        var colors = palettes[effect] || [accent || '#e6d49c'];
        for (var i = 0; i < count; i++) {
          var spread = i - (count - 1) / 2;
          clicks.push({
            kind: effect, x: x + spread * (large ? 12 : 3) + rnd(-4, 4), y: y + rnd(-6, 6), age: -i * 0.025,
            life: effect === 'lanterns' || effect === 'balloons' ? 3.4 : 2.6,
            vx: spread * (large ? 28 : 16) + rnd(-8, 8), vy: rising ? rnd(-65, -35) : rnd(-70, -25),
            rot: effect === 'lanterns' || effect === 'balloons' || effect === 'ripples' ? 0 : rnd(-1.5, 1.5),
            vr: rnd(-0.8, 0.8), phase: rnd(0, Math.PI * 2),
            size: large ? rnd(12, 17) : rnd(6, 11),
            color: colors[Math.floor(rnd(0, colors.length))]
          });
        }
        // 快速连点保持固定上限，旧的一批先退场。
        if (clicks.length > 64) clicks.splice(0, clicks.length - 64);
      }

      function tickClicks(dt) {
        for (var i = clicks.length - 1; i >= 0; i--) {
          var p = clicks[i];
          p.age += dt;
          if (p.age >= p.life) { clicks.splice(i, 1); continue; }
          if (p.age < 0) continue;
          if (p.kind !== 'ripples') {
            p.x += (p.vx + Math.sin(p.age * 3 + p.phase) * 14) * dt;
            p.y += p.vy * dt;
            p.vx *= Math.pow(0.65, dt);
            if (!/^(lanterns|balloons|hearts|fireflies)$/.test(p.kind)) p.vy += 48 * dt;
            p.rot += /^(lanterns|balloons)$/.test(p.kind) ? Math.sin(p.age * 3 + p.phase) * 0.15 * dt : p.vr * dt;
          }
          drawClick(ctx, p);
        }
      }

      function spawn(init) {
        var p = { x: rnd(0, W), y: init ? rnd(0, H) : -20, t: rnd(0, Math.PI * 2) };
        switch (type) {
          case 'rain':
            p.r = rnd(9, 17); p.vy = rnd(3, 5); p.vx = -0.7;
            break;
          case 'snow':
            p.r = rnd(1, 3); p.vy = rnd(0.3, 1); p.vx = rnd(-0.3, 0.3);
            break;
          case 'petals':
          case 'leaves':
            p.r = rnd(3, 6); p.vy = rnd(0.4, 1.1); p.vx = rnd(-0.4, 0.4);
            p.rot = rnd(0, Math.PI * 2); p.vr = rnd(-0.02, 0.02);
            break;
          case 'lanterns':
            p.r = rnd(4, 9); p.vy = -rnd(0.2, 0.6); p.y = init ? rnd(0, H) : H + 20;
            break;
          case 'stars':
            p.r = rnd(0.5, 1.8); p.tw = rnd(0.005, 0.02);
            break;
          case 'fireflies':
            p.r = rnd(1, 2.5); p.vx = rnd(-0.4, 0.4); p.vy = rnd(-0.4, 0.4); p.tw = rnd(0.01, 0.03);
            break;
        }
        return p;
      }

      for (var i = 0; i < density; i++) ps.push(spawn(true));

      // 烟花：火箭升空 → 顶点爆发（借鉴 Caleb Miller fireworks 的思路：
      // 拖尾用 destination-out 把旧帧向透明衰减——透明画布版的"长曝光"）
      var rockets = [];
      var sparksFw = [];
      var flashes = [];
      var fwColors = null;
      function launchRocket() {
        rockets.push({
          x: rnd(W * 0.2, W * 0.8),
          y: H + 10,
          vy: -rnd(H * 0.011, H * 0.014),
          targetY: rnd(H * 0.15, H * 0.45)
        });
      }
      // 点击发射：火箭从点击处正下方升空，在点击高度爆炸
      function launchRocketAt(x, y) {
        rockets.push({
          x: Math.min(Math.max(x, 20), W - 20),
          y: H + 10,
          vy: -rnd(H * 0.011, H * 0.014),
          targetY: Math.min(Math.max(y, H * 0.08), H * 0.8)
        });
      }
      function explode(x, y) {
        if (!fwColors) fwColors = [accentRGB, '#ffd76b', '#ffffff'];
        var color = fwColors[Math.floor(Math.random() * fwColors.length)];
        var n = 70;
        for (var j = 0; j < n; j++) {
          var a = (j / n) * Math.PI * 2 + rnd(-0.06, 0.06);
          var v = rnd(1.2, 3.6);
          sparksFw.push({ x: x, y: y, px: x, py: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, color: color });
        }
        flashes.push({ x: x, y: y, life: 1 });
        // 通知音效层（js/audio.js 监听；没启用声音时无副作用）
        document.dispatchEvent(new CustomEvent('firework-burst'));
      }

      var accentRGB = accent || '#f5c26b';

      function tick(now) {
        var dt = Math.min(Math.max((now - lastFrame) / 1000, 0), 0.05);
        lastFrame = now;
        if (type === 'fireworks') {
          // 拖尾：旧帧向透明衰减，而不是清屏
          ctx.globalCompositeOperation = 'destination-out';
          ctx.fillStyle = 'rgba(0,0,0,0.22)';
          ctx.fillRect(0, 0, W, H);
          ctx.globalCompositeOperation = 'source-over';
        } else {
          ctx.clearRect(0, 0, W, H);
        }

        for (var i = 0; i < ps.length; i++) {
          var p = ps[i];
          p.t += 0.016;

          switch (type) {
            case 'rain':
              p.y += p.vy; p.x += p.vx;
              ctx.globalAlpha = 0.25;
              ctx.strokeStyle = accentRGB;
              ctx.lineWidth = 1;
              ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - 2, p.y + p.r); ctx.stroke();
              if (p.y > H + 20) ps[i] = spawn(false);
              break;
            case 'snow':
              p.y += p.vy; p.x += p.vx + Math.sin(p.t) * 0.3;
              ctx.globalAlpha = 0.7;
              ctx.fillStyle = '#fff';
              ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
              if (p.y > H + 10) ps[i] = spawn(false);
              break;
            case 'petals':
            case 'leaves':
              p.y += p.vy; p.x += p.vx + Math.sin(p.t) * 0.6; p.rot += p.vr;
              ctx.globalAlpha = 0.65;
              ctx.fillStyle = type === 'petals' ? 'rgba(255,200,215,.8)' : 'rgba(224,164,88,.8)';
              ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
              ctx.beginPath(); ctx.ellipse(0, 0, p.r, p.r * 0.6, 0, 0, 7); ctx.fill();
              ctx.restore();
              if (p.y > H + 10) ps[i] = spawn(false);
              break;
            case 'lanterns':
              p.y += p.vy; p.x += Math.sin(p.t * 0.5) * 0.3;
              var g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 2.2);
              g.addColorStop(0, 'rgba(255,120,80,.9)');
              g.addColorStop(0.4, 'rgba(220,60,40,.55)');
              g.addColorStop(1, 'rgba(220,60,40,0)');
              ctx.globalAlpha = 0.8;
              ctx.fillStyle = g;
              ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 2.2, 0, 7); ctx.fill();
              if (p.y < -30) ps[i] = spawn(false);
              break;
            case 'stars':
              ctx.globalAlpha = 0.3 + Math.abs(Math.sin(p.t * p.tw * 100)) * 0.6;
              ctx.fillStyle = '#fff';
              ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
              break;
            case 'fireflies':
              p.x += p.vx + Math.sin(p.t) * 0.4; p.y += p.vy + Math.cos(p.t * 0.7) * 0.3;
              if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
              if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
              ctx.globalAlpha = 0.2 + Math.abs(Math.sin(p.t * p.tw * 60)) * 0.7;
              ctx.fillStyle = accentRGB;
              ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
              break;
          }
        }

        if (type === 'fireworks') {
          if (Math.random() < 0.004 && rockets.length < 3 && sparksFw.length + rockets.length * 70 < 420) launchRocket();

          // 加法混合：光点重叠处更亮
          ctx.globalCompositeOperation = 'lighter';

          // 火箭：升空拖出亮线，到达目标高度或失速即爆发
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1.4;
          for (var r = rockets.length - 1; r >= 0; r--) {
            var rk = rockets[r];
            rk.y += rk.vy; rk.vy *= 0.992;
            ctx.globalAlpha = 0.9;
            ctx.beginPath(); ctx.moveTo(rk.x, rk.y); ctx.lineTo(rk.x, rk.y - rk.vy * 2.5); ctx.stroke();
            if (rk.y <= rk.targetY || rk.vy > -1) { explode(rk.x, rk.y); rockets.splice(r, 1); }
          }

          // 爆发火花：重力 + 空气阻力，画线段形成拖尾
          ctx.lineWidth = 1.2;
          for (var b = sparksFw.length - 1; b >= 0; b--) {
            var s = sparksFw[b];
            s.px = s.x; s.py = s.y;
            s.x += s.vx; s.y += s.vy;
            s.vx *= 0.985; s.vy = s.vy * 0.985 + 0.045;
            s.life -= 0.011;
            if (s.life <= 0) { sparksFw.splice(b, 1); continue; }
            ctx.globalAlpha = Math.min(s.life * 1.4, 1);
            ctx.strokeStyle = s.color;
            ctx.beginPath(); ctx.moveTo(s.px, s.py); ctx.lineTo(s.x, s.y); ctx.stroke();
          }

          // 爆点闪光：白 → 橙的径向渐变快速消散
          for (var f = flashes.length - 1; f >= 0; f--) {
            var fl = flashes[f];
            fl.life -= 0.07;
            if (fl.life <= 0) { flashes.splice(f, 1); continue; }
            var fr = 46 * (1 - fl.life * 0.4);
            var fg = ctx.createRadialGradient(fl.x, fl.y, 0, fl.x, fl.y, fr);
            fg.addColorStop(0, 'rgba(255,255,255,' + (fl.life * 0.9) + ')');
            fg.addColorStop(0.3, 'rgba(255,170,60,' + (fl.life * 0.35) + ')');
            fg.addColorStop(1, 'rgba(255,140,20,0)');
            ctx.globalAlpha = 1;
            ctx.fillStyle = fg;
            ctx.beginPath(); ctx.arc(fl.x, fl.y, fr, 0, 7); ctx.fill();
          }

          ctx.globalCompositeOperation = 'source-over';
        }

        tickClicks(dt);
        ctx.globalAlpha = 1;
        rafId = type !== 'none' || clicks.length ? requestAnimationFrame(tick) : null;
      }
      tick(lastFrame);
    },
    stop: function () {
      if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
      if (onResize) { window.removeEventListener('resize', onResize); onResize = null; }
      if (onClick) { window.removeEventListener('click', onClick); onClick = null; }
      var canvas = document.getElementById('particles');
      if (canvas) {
        var ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
  };
})();

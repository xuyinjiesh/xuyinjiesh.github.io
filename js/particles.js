/*
 * 背景粒子：雪 / 花瓣 / 灯笼 / 落叶 / 星星 / 萤火虫 / 烟花。
 * 密度刻意压得很低，只负责“呼吸感”。
 * 是否启动由调用方按站内动效开关决定（见 js/chat.js），本文件不再自查系统偏好。
 */
(function () {
  'use strict';

  var rafId = null;
  var onResize = null;
  var onPointer = null;

  window.Particles = {
    start: function (config, accent) {
      window.Particles.stop(); // 防止重复启动叠出多个动画循环
      var canvas = document.getElementById('particles');
      if (!canvas || !config || config.type === 'none') return;

      var ctx = canvas.getContext('2d');
      var W, H, dpr;
      var ps = [];
      var type = config.type;
      var density = config.density || 20;

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

      // 烟花支持点击/触摸发射；聊天窗区域内的点击不触发（避免误伤 UI 交互）
      if (type === 'fireworks') {
        onPointer = function (e) {
          if (e.target && e.target.closest && e.target.closest('.chat-window')) return;
          launchRocketAt(e.clientX, e.clientY);
        };
        window.addEventListener('pointerdown', onPointer);
      }

      function rnd(a, b) { return a + Math.random() * (b - a); }

      function spawn(init) {
        var p = { x: rnd(0, W), y: init ? rnd(0, H) : -20, t: rnd(0, Math.PI * 2) };
        switch (type) {
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

      function tick() {
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
          if (Math.random() < 0.004 && rockets.length < 3 && sparksFw.length < 500) launchRocket();

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

        ctx.globalAlpha = 1;
        rafId = requestAnimationFrame(tick);
      }
      tick();
    },
    stop: function () {
      if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
      if (onResize) { window.removeEventListener('resize', onResize); onResize = null; }
      if (onPointer) { window.removeEventListener('pointerdown', onPointer); onPointer = null; }
      var canvas = document.getElementById('particles');
      if (canvas) {
        var ctx = canvas.getContext('2d');
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
  };
})();

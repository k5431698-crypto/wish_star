// 달밤 마을 시안 (2D): 옆으로 넓은 배경 위를 작은 동자승이 걸어 다닌다.
// 배경 그림을 assets/world-bg.jpg 로 넣으면 자동으로 그 그림을 쓰고, 없으면 코드로 그린 임시 배경을 쓴다.
(function () {
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  const bubble = document.getElementById('bubble');
  const hint = document.getElementById('hint');

  // ---- 배경 설정 (그림에 맞춰 조절하는 값) ----
  const BG_SRC = 'assets/world-bg.jpg';
  const WALK = { top: 0.66, bottom: 0.93 };   // 걸을 수 있는 땅의 세로 범위 (화면 높이 비율)
  const CHAR_H = 0.125;                        // 캐릭터 키 (화면 높이 비율, 가까울 때)
  const WORLD_ASPECT = 2.2;                    // 임시 배경의 가로:세로 비율

  let W = 0, H = 0, DPR = 1;
  let bgImg = null, bgCanvas = null, worldW = 0;

  function seeded(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

  // ---- 임시 배경 (그림이 없을 때) ----
  function paintPlaceholder(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.round(w); c.height = Math.round(h);
    const g = c.getContext('2d');
    const rnd = seeded(77);
    const sky = g.createLinearGradient(0, 0, 0, h * 0.6);
    sky.addColorStop(0, '#120f33'); sky.addColorStop(0.55, '#2a2565'); sky.addColorStop(1, '#5a4c9c');
    g.fillStyle = sky; g.fillRect(0, 0, w, h);
    // 별
    for (let i = 0; i < w / 6; i++) {
      g.fillStyle = `rgba(255,247,224,${0.25 + rnd() * 0.6})`;
      const r = rnd() * 1.4 + 0.3;
      g.beginPath(); g.arc(rnd() * w, rnd() * h * 0.5, r, 0, Math.PI * 2); g.fill();
    }
    // 오로라 (은은하게)
    [['rgba(120,240,200,', 0.12, 0.06], ['rgba(170,140,255,', 0.2, 0.05], ['rgba(120,200,255,', 0.3, 0.04]].forEach(([col, y0, amp], k) => {
      const grad = g.createLinearGradient(0, h * y0, 0, h * (y0 + 0.22));
      grad.addColorStop(0, col + '0)'); grad.addColorStop(0.5, col + '0.22)'); grad.addColorStop(1, col + '0)');
      g.fillStyle = grad;
      g.beginPath(); g.moveTo(0, h * y0);
      for (let x = 0; x <= w; x += 20) g.lineTo(x, h * y0 + Math.sin(x / (160 + k * 50) + k) * h * amp);
      for (let x = w; x >= 0; x -= 20) g.lineTo(x, h * (y0 + 0.22) + Math.sin(x / (200 + k * 40) + k * 2) * h * amp);
      g.closePath(); g.fill();
    });
    // 달
    const mx = w * 0.72, my = h * 0.2;
    const mg = g.createRadialGradient(mx, my, 0, mx, my, h * 0.22);
    mg.addColorStop(0, 'rgba(255,244,214,0.55)'); mg.addColorStop(1, 'rgba(255,244,214,0)');
    g.fillStyle = mg; g.beginPath(); g.arc(mx, my, h * 0.22, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff4d6'; g.beginPath(); g.arc(mx, my, h * 0.055, 0, Math.PI * 2); g.fill();
    // 바다
    const seaTop = h * 0.5, seaBot = h * 0.7;
    const sea = g.createLinearGradient(0, seaTop, 0, seaBot);
    sea.addColorStop(0, '#3b4a9a'); sea.addColorStop(1, '#27337a');
    g.fillStyle = sea; g.fillRect(0, seaTop, w, seaBot - seaTop);
    // 달빛이 비친 물결
    for (let i = 0; i < 26; i++) {
      const y = seaTop + (i / 26) * (seaBot - seaTop);
      const half = 8 + i * 3;
      g.fillStyle = `rgba(255,244,214,${0.35 - i * 0.012})`;
      g.fillRect(mx - half * (0.6 + rnd() * 0.6), y, half * 1.4 * rnd() + 6, 2);
    }
    g.strokeStyle = 'rgba(180,200,255,0.18)'; g.lineWidth = 1.5;
    for (let i = 0; i < w / 50; i++) {
      const x = rnd() * w, y = seaTop + rnd() * (seaBot - seaTop);
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 10, y - 3, x + 22, y); g.stroke();
    }
    // 등대
    const lx = w * 0.3, ly = h * 0.64;
    g.fillStyle = '#f6f0ff'; g.beginPath(); g.moveTo(lx - 14, ly); g.lineTo(lx - 8, ly - h * 0.14); g.lineTo(lx + 8, ly - h * 0.14); g.lineTo(lx + 14, ly); g.fill();
    g.fillStyle = '#ffb6cc'; g.fillRect(lx - 11, ly - h * 0.08, 22, 8);
    g.fillStyle = '#b9a7ff'; g.beginPath(); g.moveTo(lx - 12, ly - h * 0.14); g.lineTo(lx, ly - h * 0.175); g.lineTo(lx + 12, ly - h * 0.14); g.fill();
    const lg = g.createRadialGradient(lx, ly - h * 0.15, 0, lx, ly - h * 0.15, 60);
    lg.addColorStop(0, 'rgba(255,238,170,0.7)'); lg.addColorStop(1, 'rgba(255,238,170,0)');
    g.fillStyle = lg; g.beginPath(); g.arc(lx, ly - h * 0.15, 60, 0, Math.PI * 2); g.fill();
    // 땅 (모래와 연보라)
    const shore = (x) => h * 0.64 + Math.sin(x / 140) * 5 + Math.sin(x / 57) * 2;
    const ground = g.createLinearGradient(0, h * 0.62, 0, h);
    ground.addColorStop(0, '#f1d9d4'); ground.addColorStop(0.12, '#c8bdf2'); ground.addColorStop(1, '#8e84d6');
    g.fillStyle = ground;
    g.beginPath(); g.moveTo(0, h);
    for (let x = 0; x <= w; x += 10) g.lineTo(x, shore(x));
    g.lineTo(w, h); g.closePath(); g.fill();
    // 분화구와 반짝이는 돌
    for (let i = 0; i < w / 90; i++) {
      const x = rnd() * w, y = h * (0.72 + rnd() * 0.24);
      g.fillStyle = 'rgba(120,105,200,0.22)';
      g.beginPath(); g.ellipse(x, y, 20 + rnd() * 30, 5 + rnd() * 8, 0, 0, Math.PI * 2); g.fill();
    }
    // 나무
    const cols = ['#c8b6ff', '#9fe3d2', '#ffd1e3', '#b7d3ff'];
    for (let i = 0; i < w / 150; i++) {
      const x = rnd() * w, y = h * (0.67 + rnd() * 0.06), s = 0.8 + rnd() * 0.5;
      g.fillStyle = '#9b86a8'; g.fillRect(x - 3 * s, y - 26 * s, 6 * s, 26 * s);
      g.fillStyle = cols[i % 4];
      g.beginPath(); g.ellipse(x, y - 38 * s, 20 * s, 24 * s, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.beginPath(); g.ellipse(x - 6 * s, y - 46 * s, 8 * s, 10 * s, 0, 0, Math.PI * 2); g.fill();
    }
    return c;
  }

  function layout() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (bgImg) {
      worldW = bgImg.width * (H / bgImg.height);
    } else {
      worldW = Math.max(W * 3, H * WORLD_ASPECT);
      bgCanvas = paintPlaceholder(worldW * DPR / DPR, H);
    }
  }

  // ---- 동자승 캐릭터 (코드로 그린 그림) ----
  function createKid() {
    const SIZE = 256;
    const cv = document.createElement('canvas');
    cv.width = cv.height = SIZE;
    const g = cv.getContext('2d');
    function blob(x, y, rx, ry, c0, c1, c2) {
      const gr = g.createRadialGradient(x - rx * 0.3, y - ry * 0.4, rx * 0.1, x, y, Math.max(rx, ry) * 1.05);
      gr.addColorStop(0, c0); gr.addColorStop(0.7, c1); gr.addColorStop(1, c2);
      g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill();
    }
    function soft(x, y, r, color) {
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, color); gr.addColorStop(1, 'rgba(255,170,190,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    function draw(phase, walking, face, blink) {
      g.clearRect(0, 0, SIZE, SIZE);
      const sw = walking ? Math.sin(phase) : 0;
      const bob = walking ? Math.abs(Math.sin(phase)) * 6 : Math.sin(phase * 0.5) * 1.2;
      const skin0 = '#fff1e6', skin1 = '#ffdcc4', skin2 = '#f2bfa3';
      const rob0 = '#d3d6e6', rob1 = '#b3b8d0', rob2 = '#9096b5';
      g.fillStyle = 'rgba(50,35,110,0.28)';
      g.beginPath(); g.ellipse(128, 248, 44 - bob, 8, 0, 0, Math.PI * 2); g.fill();
      blob(108 + sw * 9, 241 - Math.max(0, -sw) * 8, 18, 9, '#ffffff', '#f4f1ea', '#d8d2c6');
      blob(148 - sw * 9, 241 - Math.max(0, sw) * 8, 18, 9, '#ffffff', '#f4f1ea', '#d8d2c6');
      const by = 196 - bob * 0.6;
      const gr = g.createLinearGradient(0, by - 50, 0, by + 48);
      gr.addColorStop(0, rob0); gr.addColorStop(1, rob2);
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(98, by - 40); g.quadraticCurveTo(128, by - 54, 158, by - 40);
      g.quadraticCurveTo(176, by + 10, 170, by + 44);
      g.quadraticCurveTo(128, by + 54, 86, by + 44);
      g.quadraticCurveTo(80, by + 10, 98, by - 40);
      g.fill();
      g.strokeStyle = rob2; g.lineWidth = 3; g.lineCap = 'round';
      g.beginPath(); g.moveTo(112, by - 44); g.lineTo(128, by - 8); g.lineTo(146, by - 44); g.stroke();
      g.strokeStyle = '#c9a07a'; g.lineWidth = 6;
      g.beginPath(); g.moveTo(90, by + 12); g.quadraticCurveTo(128, by + 22, 166, by + 12); g.stroke();
      if (walking) {
        blob(90 - sw * 4, by - 4 + sw * 6, 12, 22, rob0, rob1, rob2);
        blob(166 + sw * 4, by - 4 - sw * 6, 12, 22, rob0, rob1, rob2);
        blob(88 - sw * 5, by + 18 + sw * 6, 8, 8, skin0, skin1, skin2);
        blob(168 + sw * 5, by + 18 - sw * 6, 8, 8, skin0, skin1, skin2);
      } else {
        blob(108, by - 6, 14, 22, rob0, rob1, rob2);
        blob(148, by - 6, 14, 22, rob0, rob1, rob2);
        blob(128, by - 14, 10, 12, skin0, skin1, skin2);
      }
      const hy = 104 - bob;
      blob(62, hy + 4, 11, 14, skin0, skin1, skin2);
      blob(194, hy + 4, 11, 14, skin0, skin1, skin2);
      blob(128, hy, 68, 64, skin0, skin1, skin2);
      g.fillStyle = 'rgba(255,255,255,0.55)';
      g.beginPath(); g.ellipse(104, hy - 36, 20, 9, -0.5, 0, Math.PI * 2); g.fill();
      soft(128 + face * 6 - 38, hy + 24, 16, 'rgba(255,150,170,0.7)');
      soft(128 + face * 6 + 38, hy + 24, 16, 'rgba(255,150,170,0.7)');
      const ex = face * 8, ey = hy + 10;
      g.fillStyle = '#3a2a3e'; g.strokeStyle = '#3a2a3e'; g.lineWidth = 3.5;
      if (blink > 0.5) {
        g.beginPath(); g.arc(128 + ex - 24, ey, 7, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
        g.beginPath(); g.arc(128 + ex + 24, ey, 7, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
      } else {
        g.beginPath(); g.ellipse(128 + ex - 24, ey, 6.5, 8, 0, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.ellipse(128 + ex + 24, ey, 6.5, 8, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#ffffff';
        g.beginPath(); g.arc(128 + ex - 26, ey - 3, 2.2, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.arc(128 + ex + 22, ey - 3, 2.2, 0, Math.PI * 2); g.fill();
      }
      g.strokeStyle = '#b4707a'; g.lineWidth = 3;
      g.beginPath(); g.arc(128 + ex, hy + 30, 9, 0.2 * Math.PI, 0.8 * Math.PI); g.stroke();
    }
    return { cv, draw };
  }
  const kid = createKid();

  // ---- 상태 ----
  const me = { x: 0, y: 0, tx: null, ty: null, face: 0, wantFace: 0, phase: 0, blinkT: 3, blink: 0, acc: 0, jump: 0, flip: 1 };
  const fairy = { x: 0, y: 0, t: 0, spin: 0, trail: 0 };
  const sparks = [];
  const ripples = [];
  let cam = 0;
  let ring = null;   // { x, y, t }
  let bubbleFor = null, bubbleTimer = 0;

  function charH(y) {
    const t = Math.min(1, Math.max(0, (y - H * WALK.top) / (H * (WALK.bottom - WALK.top))));
    return H * CHAR_H * (0.62 + 0.38 * t);
  }
  function clampWalk(x, y) {
    return [Math.min(worldW - 20, Math.max(20, x)), Math.min(H * WALK.bottom, Math.max(H * WALK.top, y))];
  }

  function say(text, who) {
    bubble.textContent = text;
    bubble.classList.add('on');
    bubbleFor = who;
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => { bubble.classList.remove('on'); bubbleFor = null; }, 2800);
  }
  const kidLines = ['안녕! 오늘 밤도 별이 참 예쁘다', '같이 바닷가 걸어 볼래?', '조용한 밤이라 마음이 편안해', '저기 등대에 불이 켜져 있어'];
  const fairyLines = ['소원 하나 들려줄래?', '반짝! 오늘도 소원들이 빛나고 있어', '나는 소원을 별에게 전해 주는 요정이야', '조용히 쉬었다 가도 괜찮아'];
  let kl = 0, fl = 0;

  function burst(x, y, color, n, speed) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = speed * (0.4 + Math.random());
      sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.3, life: 0, max: 0.8 + Math.random() * 0.6, color, r: 2 + Math.random() * 2.5 });
    }
  }

  // ---- 입력 ----
  let down = null;
  canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('pointerup', (e) => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    down = null;
    if (moved > 12) return;
    hint.classList.add('off');
    const wx = e.clientX + cam, wy = e.clientY;
    if (Math.hypot(wx - fairy.x, wy - fairy.y) < 34) {
      fairy.spin = 1.2;
      burst(fairy.x, fairy.y, 'rgba(255,240,168,', 16, 90);
      say(fairyLines[fl++ % fairyLines.length], 'fairy');
      return;
    }
    const ch = charH(me.y);
    if (Math.abs(wx - me.x) < ch * 0.4 && wy > me.y - ch && wy < me.y + 6) {
      me.jump = 0.5;
      burst(me.x, me.y - ch * 0.6, 'rgba(255,182,210,', 12, 70);
      say(kidLines[kl++ % kidLines.length], 'kid');
      return;
    }
    if (wy < H * WALK.top - 24) say('저기는 바다야. 땅을 눌러 줘!', 'kid');
    const [tx, ty] = clampWalk(wx, wy);
    me.tx = tx; me.ty = ty;
    ring = { x: tx, y: ty, t: 0 };
    ripples.push({ x: tx, y: ty, t: 0 });
  });

  // ---- 그리기 ----
  function drawBg() {
    if (bgImg) {
      const s = H / bgImg.height;
      ctx.drawImage(bgImg, -cam, 0, bgImg.width * s, H);
    } else {
      ctx.drawImage(bgCanvas, -cam, 0, worldW, H);
    }
  }
  function drawRing() {
    for (let i = ripples.length - 1; i >= 0; i--) {
      const r = ripples[i];
      const k = r.t / 0.9;
      ctx.strokeStyle = `rgba(255,255,255,${0.7 * (1 - k)})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.ellipse(r.x - cam, r.y, 14 + k * 46, (14 + k * 46) * 0.38, 0, 0, Math.PI * 2); ctx.stroke();
    }
    if (ring) {
      const pulse = 1 + Math.sin(ring.t * 5) * 0.08;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(ring.x - cam, ring.y, 17 * pulse, 17 * pulse * 0.38, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath(); ctx.ellipse(ring.x - cam, ring.y, 4, 1.6, 0, 0, Math.PI * 2); ctx.fill();
    }
  }
  function drawKid() {
    const ch = charH(me.y);
    const sc = ch / 210;               // 그림 안에서 캐릭터 높이 약 210px
    const jumpY = me.jump > 0 ? Math.sin((1 - me.jump / 0.5) * Math.PI) * ch * 0.35 : 0;
    ctx.save();
    ctx.translate(me.x - cam, me.y - jumpY);
    ctx.scale(sc * 1, sc * 1);
    ctx.drawImage(kid.cv, -128, -248);  // 발바닥(그림의 y=248)이 땅에 닿도록
    ctx.restore();
  }
  function drawFairy() {
    const x = fairy.x - cam, y = fairy.y;
    const g1 = ctx.createRadialGradient(x, y, 0, x, y, 34);
    g1.addColorStop(0, 'rgba(255,240,180,0.85)'); g1.addColorStop(1, 'rgba(255,240,180,0)');
    ctx.fillStyle = g1; ctx.beginPath(); ctx.arc(x, y, 34, 0, Math.PI * 2); ctx.fill();
    const flap = 0.5 + Math.sin(fairy.t * 22) * 0.45;
    ctx.fillStyle = 'rgba(191,233,255,0.7)';
    [-1, 1].forEach((s) => {
      ctx.save(); ctx.translate(x + s * 5, y - 2); ctx.rotate(s * (0.5 + flap * 0.4));
      ctx.beginPath(); ctx.ellipse(s * 9, -4, 11 * flap + 3, 7, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    });
    ctx.fillStyle = '#fff6d0'; ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
  }
  function drawSparks() {
    sparks.forEach((p) => {
      const k = p.life / p.max;
      ctx.fillStyle = p.color + (0.9 * (1 - k)) + ')';
      ctx.beginPath(); ctx.arc(p.x - cam, p.y, p.r * (1 - k * 0.5), 0, Math.PI * 2); ctx.fill();
    });
  }

  // ---- 갱신 ----
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    // 걷기
    let walking = false;
    if (me.tx !== null) {
      const dx = me.tx - me.x, dy = me.ty - me.y;
      const dist = Math.hypot(dx, dy);
      const speed = 150 * (H / 800);
      if (dist < 3) { me.tx = null; }
      else {
        const step = Math.min(dist, speed * dt);
        me.x += (dx / dist) * step; me.y += (dy / dist) * step;
        me.wantFace = Math.max(-1, Math.min(1, dx / 30));
        walking = true;
      }
    } else { me.wantFace *= 0.9; }
    me.face += (me.wantFace - me.face) * Math.min(1, dt * 8);
    me.phase += dt * (walking ? 9 : 2.2);
    if (me.jump > 0) me.jump = Math.max(0, me.jump - dt);
    me.blinkT -= dt;
    if (me.blinkT < 0) { me.blink = 1; me.blinkT = 2.5 + Math.random() * 3; }
    if (me.blink > 0) me.blink = Math.max(0, me.blink - dt * 7);
    me.acc += dt;
    if (me.acc > 1 / 24) { me.acc = 0; kid.draw(me.phase, walking, me.face, me.blink); }
    if (ring) { ring.t += dt; if (!walking && me.tx === null) { ring.fade = (ring.fade || 0) + dt; if (ring.fade > 0.3) ring = null; } }

    // 별 요정
    fairy.t += dt;
    const ch = charH(me.y);
    const wantX = me.x + 46 * (me.wantFace >= 0 ? 1 : -1) + Math.cos(fairy.t * 0.9) * 14;
    const wantY = me.y - ch * 1.15 + Math.sin(fairy.t * 1.7) * 8 - (fairy.spin > 0 ? Math.sin((1 - fairy.spin / 1.2) * Math.PI) * 24 : 0);
    if (!fairy.x) { fairy.x = wantX; fairy.y = wantY; }
    const k = 1 - Math.exp(-dt * 2.2);
    fairy.x += (wantX - fairy.x) * k; fairy.y += (wantY - fairy.y) * k;
    fairy.spin = Math.max(0, fairy.spin - dt);
    fairy.trail -= dt;
    if (fairy.trail <= 0) { fairy.trail = 0.1; sparks.push({ x: fairy.x, y: fairy.y + 4, vx: (Math.random() - 0.5) * 10, vy: 14, life: 0, max: 1, color: 'rgba(255,240,176,', r: 2.2 }); }

    for (let i = sparks.length - 1; i >= 0; i--) {
      const p = sparks[i];
      p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - dt * 1.5; p.vy *= 1 - dt * 1.5;
      if (p.life >= p.max) sparks.splice(i, 1);
    }
    for (let i = ripples.length - 1; i >= 0; i--) { ripples[i].t += dt; if (ripples[i].t > 0.9) ripples.splice(i, 1); }

    // 카메라 (가로로 따라감)
    const want = Math.min(Math.max(0, worldW - W), Math.max(0, me.x - W / 2));
    cam += (want - cam) * (1 - Math.exp(-dt * 4));

    // 그리기
    ctx.clearRect(0, 0, W, H);
    drawBg();
    drawRing();
    drawKid();
    drawFairy();
    drawSparks();

    if (bubbleFor) {
      const bx = (bubbleFor === 'fairy' ? fairy.x : me.x) - cam;
      const by = (bubbleFor === 'fairy' ? fairy.y - 18 : me.y - charH(me.y) - 10);
      bubble.style.left = Math.min(W - 110, Math.max(110, bx)) + 'px';
      bubble.style.top = by + 'px';
    }
    requestAnimationFrame(frame);
  }

  function start() {
    layout();
    me.x = Math.min(worldW * 0.35, worldW - 40); me.y = H * 0.8;
    cam = Math.max(0, me.x - W / 2);
    addEventListener('resize', layout);
    requestAnimationFrame(frame);
  }
  const img = new Image();
  img.onload = () => { bgImg = img; start(); };
  img.onerror = () => start();
  img.src = BG_SRC;
})();

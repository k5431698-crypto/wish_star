// 달 위 시안: 둥근 달 위를 달토끼가 걷고, 별 요정이 따라다닌다. (Three.js r128, 로우폴리 파스텔)
(function () {
  if (!window.THREE) { document.getElementById('fail').style.display = 'flex'; return; }

  const R = 5;                    // 달 반지름
  const WALK_SPEED = 1.6 / R;     // 걷는 속도: 초당 1.6칸 (각속도)
  const canvas = document.getElementById('c');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  } catch (err) {
    document.getElementById('fail').style.display = 'flex';
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  const BG = 0x15123a;
  scene.background = new THREE.Color(BG);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 120);

  // ---- 빛 ----
  scene.add(new THREE.HemisphereLight(0xd6dcff, 0x4a3d86, 0.8));
  const sun = new THREE.DirectionalLight(0xfff0d8, 0.55);
  scene.add(sun);

  // ---- 부드러운 빛 알갱이 그림 ----
  const glowTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.45)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();

  function glowSprite(color, scale, opacity) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    s.scale.set(scale, scale, 1);
    return s;
  }

  // ---- 달 ----
  const moonGeo = new THREE.IcosahedronGeometry(R, 3);
  (function paint() {
    const pos = moonGeo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i += 3) {
      const x = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
      const y = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
      const z = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
      const n = Math.sin(x * 1.3 + y * 0.7) * Math.cos(z * 1.1 - x * 0.4);
      c.setHSL(0.68 + n * 0.05, 0.55, 0.82 + Math.sin(i * 12.9898) * 0.025);
      for (let k = 0; k < 3; k++) { colors[(i + k) * 3] = c.r; colors[(i + k) * 3 + 1] = c.g; colors[(i + k) * 3 + 2] = c.b; }
    }
    moonGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  })();
  const moon = new THREE.Mesh(moonGeo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }));
  scene.add(moon);

  const halo = glowSprite(0x7a68ff, R * 3.4, 0.35);
  scene.add(halo);

  function seeded(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
  const rnd = seeded(20241109);
  function randDir() {
    const u = rnd() * 2 - 1, t = rnd() * Math.PI * 2, r = Math.sqrt(1 - u * u);
    return new THREE.Vector3(r * Math.cos(t), u, r * Math.sin(t));
  }
  const Z = new THREE.Vector3(0, 0, 1);

  // 분화구
  const craterMat = new THREE.MeshStandardMaterial({ color: 0xc9bff0, flatShading: true, roughness: 1 });
  for (let i = 0; i < 16; i++) {
    const d = randDir();
    const m = new THREE.Mesh(new THREE.CircleGeometry(0.3 + rnd() * 0.5, 20), craterMat);
    m.position.copy(d).multiplyScalar(R + 0.03);
    m.quaternion.setFromUnitVectors(Z, d);
    scene.add(m);
  }

  // 별빛 수정 (몽환적인 장식)
  const crystalColors = [0xffc2e0, 0xb8e8ff, 0xd9c8ff, 0xfff0b8];
  for (let i = 0; i < 14; i++) {
    const d = randDir();
    const mat = new THREE.MeshStandardMaterial({
      color: crystalColors[i % 4], emissive: crystalColors[i % 4], emissiveIntensity: 0.45, flatShading: true, roughness: 0.6,
    });
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.16 + rnd() * 0.14), mat);
    m.scale.y = 1.8;
    m.position.copy(d).multiplyScalar(R + 0.2);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
    scene.add(m);
  }

  // 먼 별들
  (function stars() {
    const n = 450, arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const d = randDir().multiplyScalar(50 + rnd() * 10);
      arr[i * 3] = d.x; arr[i * 3 + 1] = d.y; arr[i * 3 + 2] = d.z;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xfff7e0, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0.85 })));
  })();

  // ---- 미니미 캐릭터 (코드로 그린 선명한 그림, 항상 화면을 바라봄) ----
  function makeKid() {
    const SIZE = 256;
    const cv = document.createElement('canvas');
    cv.width = cv.height = SIZE;
    const g = cv.getContext('2d');
    const tex = new THREE.CanvasTexture(cv);
    tex.anisotropy = 4;

    function blob(x, y, rx, ry, c0, c1, c2) {
      const gr = g.createRadialGradient(x - rx * 0.3, y - ry * 0.4, rx * 0.1, x, y, Math.max(rx, ry) * 1.05);
      gr.addColorStop(0, c0); gr.addColorStop(0.7, c1); gr.addColorStop(1, c2);
      g.fillStyle = gr;
      g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill();
    }
    function soft(x, y, r, color) {
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, color); gr.addColorStop(1, 'rgba(255,170,190,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }

    // phase: 걸음 위상, walking: 걷는 중, face: -1(왼쪽)~1(오른쪽), blink: 눈 감는 정도(0~1)
    function draw(phase, walking, face, blink) {
      g.clearRect(0, 0, SIZE, SIZE);
      const sw = walking ? Math.sin(phase) : 0;
      const bob = walking ? Math.abs(Math.sin(phase)) * 7 : Math.sin(phase * 0.5) * 1.5;
      // 발밑 그림자
      g.fillStyle = 'rgba(70,50,140,0.22)';
      g.beginPath(); g.ellipse(128, 247, 40 - bob, 7, 0, 0, Math.PI * 2); g.fill();
      // 발
      blob(108 + sw * 8, 238 - Math.max(0, -sw) * 8, 17, 11, '#ffffff', '#f3f0fa', '#d9d3ec');
      blob(148 - sw * 8, 238 - Math.max(0, sw) * 8, 17, 11, '#ffffff', '#f3f0fa', '#d9d3ec');
      // 몸
      blob(128, 207 - bob * 0.6, 30, 31, '#ffffff', '#f6f3fb', '#d9d3ec');
      // 팔 (걸을 때 흔들림)
      blob(93 - sw * 4, 200 - bob * 0.6 + sw * 6, 11, 17, '#ffffff', '#f3f0fa', '#d9d3ec');
      blob(163 + sw * 4, 200 - bob * 0.6 - sw * 6, 11, 17, '#ffffff', '#f3f0fa', '#d9d3ec');
      // 머리
      const hy = 118 - bob;
      blob(128, hy, 80, 76, '#ffffff', '#f7f4fc', '#d6cfea');
      // 볼터치
      soft(128 + face * 6 - 42, hy + 22, 17, 'rgba(255,160,185,0.75)');
      soft(128 + face * 6 + 42, hy + 22, 17, 'rgba(255,160,185,0.75)');
      // 눈 (바라보는 쪽으로 살짝 치우침)
      const ex = face * 9, ey = hy + 6;
      g.fillStyle = '#2b2550';
      const ry = Math.max(0.5, 8.5 * (1 - blink));
      g.beginPath(); g.ellipse(128 + ex - 25, ey, 7, ry, 0, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.ellipse(128 + ex + 25, ey, 7, ry, 0, 0, Math.PI * 2); g.fill();
      if (blink < 0.5) {
        g.fillStyle = '#ffffff';
        g.beginPath(); g.arc(128 + ex - 27, ey - 3, 2.2, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.arc(128 + ex + 23, ey - 3, 2.2, 0, Math.PI * 2); g.fill();
      }
      tex.needsUpdate = true;
    }

    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    const SC = 1.7;
    sprite.scale.set(SC, SC, 1);
    sprite.position.y = SC * (122 / SIZE) ;      // 발이 땅에 닿도록 위로 올림
    const outer = new THREE.Group();
    outer.matrixAutoUpdate = false;
    outer.add(sprite);
    const hit = new THREE.Mesh(new THREE.SphereGeometry(0.95, 8, 6), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    hit.position.y = 0.85;
    outer.add(hit);
    draw(0, false, 0, 0);
    return { outer, hit, draw, state: { face: 0, wantFace: 0, blinkT: 3, blink: 0, acc: 0 } };
  }
  const rabbit = makeKid();   // (이전 토끼 코드와 이름을 맞춰 둠)
  scene.add(rabbit.outer);

  const rb = {
    dir: new THREE.Vector3(0, 0, 1),   // 달 위 위치(방향)
    fwd: new THREE.Vector3(1, 0, 0),   // 바라보는 방향
    target: null,
    phase: 0,
    jump: 0,
  };
  rb.fwd.sub(rb.dir.clone().multiplyScalar(rb.fwd.dot(rb.dir))).normalize();

  // ---- 별 요정 ----
  function makeFairy() {
    const g = new THREE.Group();
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), new THREE.MeshBasicMaterial({ color: 0xfff6d0 }));
    g.add(core);
    g.add(glowSprite(0xffe9a8, 1.6, 0.9));
    const wingMat = new THREE.MeshBasicMaterial({ color: 0xbfe9ff, transparent: true, opacity: 0.65, side: THREE.DoubleSide, depthWrite: false });
    const wings = [];
    [-1, 1].forEach((s) => {
      const w = new THREE.Mesh(new THREE.CircleGeometry(0.3, 14), wingMat);
      w.scale.set(0.6, 1, 1);
      const pivot = new THREE.Group();
      w.position.set(s * 0.2, 0.08, 0);
      pivot.add(w);
      g.add(pivot);
      wings.push({ pivot, s });
    });
    const hit = new THREE.Mesh(new THREE.SphereGeometry(0.75, 8, 6), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    g.add(hit);
    return { g, wings, hit };
  }
  const fairy = makeFairy();
  scene.add(fairy.g);
  const fy = { dir: new THREE.Vector3(0.3, 0.2, 1).normalize(), t: 0, spin: 0, trail: 0 };

  // ---- 반짝이 알갱이 ----
  const sparks = [];
  function burst(pos, color, n, speed) {
    for (let i = 0; i < n; i++) {
      const s = glowSprite(color, 0.5, 0.95);
      s.position.copy(pos);
      const v = new THREE.Vector3(rnd() - 0.5, rnd() - 0.2, rnd() - 0.5).normalize().multiplyScalar(speed * (0.5 + rnd()));
      sparks.push({ s, v, life: 0, max: 0.9 + rnd() * 0.6 });
      scene.add(s);
    }
  }
  function updateSparks(dt) {
    for (let i = sparks.length - 1; i >= 0; i--) {
      const p = sparks[i];
      p.life += dt;
      const k = p.life / p.max;
      if (k >= 1) { scene.remove(p.s); p.s.material.dispose(); sparks.splice(i, 1); continue; }
      p.s.position.addScaledVector(p.v, dt);
      p.v.multiplyScalar(1 - dt * 1.5);
      p.s.material.opacity = 0.95 * (1 - k);
      const sc = 0.5 * (1 - k * 0.6);
      p.s.scale.set(sc, sc, 1);
    }
  }

  // 목적지 표시 (발자국 불빛)
  const mark = glowSprite(0xffffff, 0.9, 0);
  scene.add(mark);
  let markLife = 0;

  // ---- 말풍선 ----
  const bubble = document.getElementById('bubble');
  const hint = document.getElementById('hint');
  let bubbleFor = null, bubbleTimer = 0;
  function say(text, who) {
    bubble.textContent = text;
    bubble.classList.add('on');
    bubbleFor = who;
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => { bubble.classList.remove('on'); bubbleFor = null; }, 2800);
  }
  const rabbitLines = ['안녕! 오늘 밤도 별이 참 예쁘다', '같이 달 한 바퀴 돌아볼래?', '조용한 밤이라 마음이 편안해', '소원은 따뜻한 마음으로 빌면 더 잘 닿아'];
  const fairyLines = ['소원 하나 들려줄래?', '반짝! 오늘도 소원들이 빛나고 있어', '나는 소원을 별에게 전해 주는 요정이야', '조용히 쉬었다 가도 괜찮아'];
  let rl = 0, fl = 0;

  // ---- 입력 ----
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let down = null;
  canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('pointerup', (e) => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    down = null;
    if (moved > 12) return;
    hint.classList.add('off');
    ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    if (raycaster.intersectObject(fairy.hit, false).length) {
      fy.spin = 1.2;
      burst(fairy.g.position, 0xfff0a8, 16, 3);
      say(fairyLines[fl++ % fairyLines.length], 'fairy');
      return;
    }
    if (raycaster.intersectObject(rabbit.hit, false).length) {
      rb.jump = 0.7;
      burst(rabbit.outer.position.clone().addScaledVector(rb.dir, 1.6), 0xffb6d2, 12, 2.4);
      say(rabbitLines[rl++ % rabbitLines.length], 'rabbit');
      return;
    }
    const hit = raycaster.intersectObject(moon, false)[0];
    if (hit) {
      rb.target = hit.point.clone().normalize();
      mark.position.copy(rb.target).multiplyScalar(R + 0.15);
      markLife = 1;
    }
  });

  // ---- 갱신 ----
  const up = new THREE.Vector3(), right = new THREE.Vector3(), tmp = new THREE.Vector3(), axis = new THREE.Vector3();
  const mat = new THREE.Matrix4();
  const camPos = new THREE.Vector3(0, 0, R + 9), camUp = new THREE.Vector3(0, 1, 0), look = new THREE.Vector3();
  let camInit = false;

  function stepRabbit(dt) {
    let walking = false;
    if (rb.target) {
      const dot = THREE.MathUtils.clamp(rb.dir.dot(rb.target), -1, 1);
      const remain = Math.acos(dot);
      axis.crossVectors(rb.dir, rb.target);
      if (remain < 0.02 || axis.lengthSq() < 1e-8) {
        rb.target = null;
      } else {
        axis.normalize();
        const step = Math.min(WALK_SPEED * dt, remain);
        const moveFwd = tmp.crossVectors(axis, rb.dir).normalize();
        rb.fwd.lerp(moveFwd, Math.min(1, dt * 10));
        rb.dir.applyAxisAngle(axis, step).normalize();
        walking = true;
      }
    }
    rb.fwd.addScaledVector(rb.dir, -rb.fwd.dot(rb.dir)).normalize();
    rb.phase += dt * (walking ? 9 : 2.2);
    if (rb.jump > 0) rb.jump = Math.max(0, rb.jump - dt);
    const hop = walking ? Math.abs(Math.sin(rb.phase)) * 0.2 : 0;
    const jumpY = rb.jump > 0 ? Math.sin((1 - rb.jump / 0.7) * Math.PI) * 0.8 : 0;
    right.crossVectors(rb.dir, rb.fwd).normalize();
    mat.makeBasis(right, rb.dir, rb.fwd);
    mat.setPosition(tmp.copy(rb.dir).multiplyScalar(R + hop + jumpY));
    rabbit.outer.matrix.copy(mat);
    rabbit.outer.matrixWorldNeedsUpdate = true;
    rabbit.outer.position.setFromMatrixPosition(mat);
    // 화면 기준 걷는 방향으로 얼굴을 돌리고, 눈을 깜빡이며, 그림을 갱신
    const st = rabbit.state;
    if (walking) {
      const p0 = rabbit.outer.position.clone().project(camera);
      const p1 = rabbit.outer.position.clone().addScaledVector(rb.fwd, 0.6).project(camera);
      const dx = (p1.x - p0.x) * innerWidth;
      st.wantFace = THREE.MathUtils.clamp(dx / 25, -1, 1);
    } else {
      st.wantFace *= 0.9;
    }
    st.face += (st.wantFace - st.face) * Math.min(1, dt * 8);
    st.blinkT -= dt;
    if (st.blinkT < 0) { st.blink = 1; st.blinkT = 2.5 + rnd() * 3; }
    if (st.blink > 0) st.blink = Math.max(0, st.blink - dt * 7);
    st.acc += dt;
    if (st.acc > 1 / 24) { st.acc = 0; rabbit.draw(rb.phase, walking, st.face, st.blink); }
  }

  function stepFairy(dt) {
    fy.t += dt;
    right.crossVectors(rb.dir, rb.fwd).normalize();
    const desired = tmp.copy(rb.dir)
      .addScaledVector(right, 0.3 + Math.cos(fy.t * 0.9) * 0.1)
      .addScaledVector(rb.fwd, 0.22 + Math.sin(fy.t * 0.7) * 0.1)
      .normalize();
    fy.dir.lerp(desired, 1 - Math.exp(-dt * 1.6)).normalize();
    fy.spin = Math.max(0, fy.spin - dt);
    const h = R + 1.5 + Math.sin(fy.t * 1.7) * 0.18 + (fy.spin > 0 ? Math.sin((1 - fy.spin / 1.2) * Math.PI) * 0.6 : 0);
    fairy.g.position.copy(fy.dir).multiplyScalar(h);
    fairy.wings.forEach((w) => { w.pivot.rotation.y = w.s * (0.5 + Math.sin(fy.t * 22) * 0.45); });
    fairy.g.rotation.y += dt * (fy.spin > 0 ? 14 : 0);
    fy.trail -= dt;
    if (fy.trail <= 0) {
      fy.trail = 0.12;
      const s = glowSprite(0xfff0b0, 0.34, 0.8);
      s.position.copy(fairy.g.position);
      sparks.push({ s, v: new THREE.Vector3((rnd() - 0.5) * 0.4, -0.5, (rnd() - 0.5) * 0.4), life: 0, max: 1.1 });
      scene.add(s);
    }
  }

  function stepCamera(dt) {
    // 토끼 뒤쪽 위에서 내려다보는 시점 (달이 둥글게 보이도록 조금 멀리)
    const wantPos = tmp.copy(rb.dir).multiplyScalar(R + 11).addScaledVector(rb.fwd, -4.5);
    const wantUp = rb.dir;
    if (!camInit) { camPos.copy(wantPos); camUp.copy(wantUp); camInit = true; }
    const k = 1 - Math.exp(-dt * 3);
    camPos.lerp(wantPos, k);
    camUp.lerp(wantUp, k).normalize();
    camera.position.copy(camPos);
    camera.up.copy(camUp);
    look.copy(rb.dir).multiplyScalar(R + 0.5).addScaledVector(rb.fwd, 1.2);
    camera.lookAt(look);
    sun.position.copy(camPos).add(new THREE.Vector3(4, 6, 2));
    halo.position.set(0, 0, 0);
  }

  function updateBubble() {
    if (!bubbleFor) return;
    const p = (bubbleFor === 'fairy' ? fairy.g.position : rabbit.outer.position.clone().addScaledVector(rb.dir, 2.3)).clone().project(camera);
    bubble.style.left = ((p.x * 0.5 + 0.5) * innerWidth) + 'px';
    bubble.style.top = ((-p.y * 0.5 + 0.5) * innerHeight - 8) + 'px';
  }

  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w / h < 0.8 ? 52 : 44; // 폰 세로 화면에서는 시야를 조금 넓게
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    stepRabbit(dt);
    stepFairy(dt);
    stepCamera(dt);
    updateSparks(dt);
    if (markLife > 0) {
      markLife = Math.max(0, markLife - dt * 0.8);
      mark.material.opacity = markLife * 0.9;
      if (!rb.target) markLife = Math.max(0, markLife - dt * 2);
    }
    updateBubble();
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();

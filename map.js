// 달빛 섬 (Blender 맵 버전): Blender로 만든 섬(assets/models/island.glb)과 캐릭터(character.glb)를 불러와 걷는다.
// island.js(코드로 만든 섬)를 바탕으로, 지형·나무·등대·캐릭터를 Blender 모델로 바꾼 버전.
// - 땅을 누르면 그 자리에 원이 생기고, 캐릭터가 그쪽을 바라보며 걸어간다 (8방향으로 자연스럽게 보이도록 그림이 바뀜)
// - 화면을 옆으로 밀면 카메라가 캐릭터 주위를 돈다
(function () {
  if (!window.THREE || !THREE.GLTFLoader) { document.getElementById('fail').style.display = 'flex'; return; }
  const hintEl = document.getElementById('hint');
  const hintText = hintEl.textContent;
  hintEl.textContent = '섬을 불러오는 중이에요...';
  const loader = new THREE.GLTFLoader();
  const load = (url) => new Promise((ok, no) => loader.load(url, ok, undefined, no));
  // 나무·덤불·모닥불 등은 Quaternius 무료(CC0) 모델 (assets/models/q/LICENSE.md)
  const PROP_FILES = {
    tree_autumn1: 'CommonTree_Autumn_1', tree_autumn2: 'CommonTree_Autumn_2', tree_autumn3: 'CommonTree_Autumn_3',
    tree_green: 'CommonTree_1', tree_willow: 'Willow_1', tree_pine: 'PineTree_1', tree_birch: 'BirchTree_Autumn_1',
    bush: 'Bush_1', bush_berry: 'BushBerries_1', flowers: 'Flowers', rock: 'Rock_Moss_1', log: 'WoodLog',
    campfire: 'Bonfire', fire: 'Bonfire_Fire',
  };
  const kinds = Object.keys(PROP_FILES);
  Promise.all([fetch('assets/models/island-map.json').then((r) => r.json()), load('assets/models/island.glb'), load('assets/models/character.glb'),
    Promise.all(kinds.map((k) => load('assets/models/q/' + PROP_FILES[k] + '.glb')))])
    .then(([map, isl, ch, props]) => {
      const PROPS = {};
      kinds.forEach((k, i) => { PROPS[k] = props[i].scene; });
      hintEl.textContent = hintText; main(map, isl, ch, PROPS);
    })
    .catch(() => { document.getElementById('fail').textContent = '섬을 불러오지 못했어요. 새로고침해 주세요.'; document.getElementById('fail').style.display = 'flex'; });

  function main(MAP, ISL, CH, PROPS) {

  const canvas = document.getElementById('c');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  } catch (err) {
    document.getElementById('fail').style.display = 'flex';
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const HORIZON = new THREE.Color(0xe8bcbc);
  scene.fog = new THREE.FogExp2(HORIZON, 0.0065);
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 2000);

  const lin = (hex) => new THREE.Color(hex).convertSRGBToLinear();

  // ---- 잡음 함수 (지형용) ----
  function hash(x, y) {
    const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return s - Math.floor(s);
  }
  function vnoise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return (a + (b - a) * u) + ((c + (d - c) * u) - (a + (b - a) * u)) * v;
  }
  function fbm(x, y) {
    let s = 0, amp = 0.5, f = 1;
    for (let i = 0; i < 4; i++) { s += amp * vnoise(x * f, y * f); f *= 2; amp *= 0.5; }
    return s;
  }
  function sstep(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

  // ---- 길과 높이: Blender에서 내보낸 지도(island-map.json) 사용 ----
  const PATHS = Object.values(MAP.paths);
  function pathDist(x, z) {
    let best = 1e9;
    PATHS.forEach((P) => {
      for (let i = 0; i < P.length - 1; i++) {
        const a = P[i], b = P[i + 1];
        const abx = b[0] - a[0], abz = b[1] - a[1];
        const t = Math.max(0, Math.min(1, ((x - a[0]) * abx + (z - a[1]) * abz) / (abx * abx + abz * abz)));
        best = Math.min(best, Math.hypot(x - (a[0] + abx * t), z - (a[1] + abz * t)));
      }
    });
    return best;
  }
  const HG = MAP.heights, RES = MAP.res, STEP = MAP.size / MAP.res, OX = MAP.origin[0], OZ = MAP.origin[1];
  function heightAt(x, z) {
    const fx = (x - OX) / STEP, fz = (z - OZ) / STEP;
    if (fx < 0 || fz < 0 || fx >= RES || fz >= RES) return -2;
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    const a = HG[j][i], b = HG[j][i + 1], c = HG[j + 1][i], d = HG[j + 1][i + 1];
    return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
  }
  const WALKABLE = 0.25;   // 이보다 낮으면 물가라서 못 들어감
  const trees = MAP.obstacles.map(([x, z, r]) => ({ x, z, r }));   // 나무·바위·등대 등 막힌 곳

  // ---- 하늘 (그라데이션 돔) ----
  const skyGeo = new THREE.SphereGeometry(900, 32, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: lin(0x221c48) }, mid: { value: lin(0x7a5894) }, bottom: { value: lin(0xf6c6ae) },
    },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; varying vec3 vP;' +
      'void main(){ float h = vP.y; vec3 c = mix(bottom, mid, smoothstep(-0.02, 0.22, h)); c = mix(c, top, smoothstep(0.22, 0.75, h)); gl_FragColor = vec4(c, 1.0); }',
  });
  scene.add(new THREE.Mesh(skyGeo, skyMat));

  // 별
  (function stars() {
    const n = 1400, arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 0.95 + 0.05, t = Math.random() * Math.PI * 2, rr = Math.sqrt(1 - u * u);
      arr[i * 3] = rr * Math.cos(t) * 850; arr[i * 3 + 1] = u * 850; arr[i * 3 + 2] = rr * Math.sin(t) * 850;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xfff7e0, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.9, fog: false })));
  })();

  // 부드러운 빛 그림
  function radialTex(stops) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    stops.forEach(([o, col]) => gr.addColorStop(o, col));
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    return t;
  }
  const glowTex = radialTex([[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,255,255,0.4)'], [1, 'rgba(255,255,255,0)']]);
  function glowSprite(color, scale, opacity) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    s.scale.set(scale, scale, 1);
    return s;
  }

  // 달
  const moonDir = new THREE.Vector3(-0.35, 0.32, -1).normalize();
  (function moon() {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(118, 112, 10, 128, 128, 100);
    gr.addColorStop(0, '#fffaf0'); gr.addColorStop(0.8, '#f6ead0'); gr.addColorStop(1, '#e9d9b8');
    g.fillStyle = gr; g.beginPath(); g.arc(128, 128, 100, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(190,175,150,0.35)';
    [[100, 100, 22], [150, 140, 16], [120, 165, 12], [165, 95, 10], [85, 150, 9]].forEach(([x, y, r]) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); });
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding;
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, fog: false, depthWrite: false }));
    m.scale.set(70, 70, 1);
    m.position.copy(moonDir).multiplyScalar(800);
    scene.add(m);
    const halo = glowSprite(0xffe8c0, 340, 0.35);
    halo.position.copy(m.position);
    scene.add(halo);
  })();

  // 구름 (파스텔빛 뭉게구름, 수평선 근처)
  (function clouds() {
    function cloudTex(seed) {
      const W = 1024, Hh = 512;
      const c = document.createElement('canvas');
      c.width = W; c.height = Hh;
      const g = c.getContext('2d');
      let sd = seed;
      const r = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
      for (let i = 0; i < 70; i++) {
        const x = 260 + r() * 504, y = 270 + (r() - 0.5) * 120 - Math.sin(((x - 260) / 504) * Math.PI) * 70;
        const rad = 45 + r() * 90;
        const gr = g.createRadialGradient(x, y - rad * 0.25, 0, x, y, rad);
        gr.addColorStop(0, 'rgba(255,244,240,0.5)'); gr.addColorStop(0.55, 'rgba(240,215,235,0.22)'); gr.addColorStop(1, 'rgba(210,190,235,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
      }
      // 가장자리를 부드럽게 지워서 그림 경계가 보이지 않게 함
      g.globalCompositeOperation = 'destination-in';
      const m = g.createRadialGradient(W / 2, Hh / 2 + 20, 20, W / 2, Hh / 2 + 20, W * 0.48);
      m.addColorStop(0, 'rgba(0,0,0,1)'); m.addColorStop(0.55, 'rgba(0,0,0,0.9)'); m.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = m; g.fillRect(0, 0, W, Hh);
      const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding;
      t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
      return t;
    }
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + Math.random() * 0.4;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex(1000 + i * 77), transparent: true, depthWrite: false, fog: false, opacity: 0.8 }));
      sp.scale.set(520, 260, 1);
      sp.position.set(Math.cos(a) * 700, 60 + Math.random() * 60, Math.sin(a) * 700);
      scene.add(sp);
    }
  })();

  // ---- 빛 ----
  scene.add(new THREE.HemisphereLight(0xffdcc8, 0x5a4058, 0.8));
  const moonLight = new THREE.DirectionalLight(0xffe4c4, 1.0);
  moonLight.castShadow = true;
  moonLight.shadow.mapSize.set(1024, 1024);
  const sc = moonLight.shadow.camera;
  sc.left = -18; sc.right = 18; sc.top = 18; sc.bottom = -18; sc.near = 1; sc.far = 120;
  moonLight.shadow.bias = -0.0008;
  scene.add(moonLight, moonLight.target);

  // ---- 바다 (반짝이는 물결) ----
  function makeWaterNormals() {
    const N = 256;
    const c = document.createElement('canvas');
    c.width = c.height = N;
    const g = c.getContext('2d');
    const img = g.createImageData(N, N);
    const H = (x, y) => {
      const p = Math.PI * 2 / N;
      return Math.sin(x * p * 3 + y * p * 2) * 0.5 + Math.sin(x * p * 7 - y * p * 5 + 1.3) * 0.3 +
        Math.sin(x * p * 11 + y * p * 13 + 2.1) * 0.18 + Math.sin(-x * p * 17 + y * p * 9 + 0.7) * 0.1;
    };
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const dx = H(x + 1, y) - H(x - 1, y), dy = H(x, y + 1) - H(x, y - 1);
      const nx = -dx * 6, ny = -dy * 6, nz = 1, l = Math.hypot(nx, ny, nz);
      const i = (y * N + x) * 4;
      img.data[i] = (nx / l * 0.5 + 0.5) * 255; img.data[i + 1] = (ny / l * 0.5 + 0.5) * 255; img.data[i + 2] = (nz / l * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }
  let water = null;
  if (THREE.Water) {
    water = new THREE.Water(new THREE.PlaneGeometry(3000, 3000), {
      textureWidth: 512, textureHeight: 512,
      waterNormals: makeWaterNormals(),
      sunDirection: moonDir.clone(),
      sunColor: 0xffd9a8,
      waterColor: 0x3b3a7a,
      distortionScale: 2.2,
      fog: true,
    });
    water.rotation.x = -Math.PI / 2;
    water.material.uniforms.size.value = 3.0;
    scene.add(water);
  } else {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), new THREE.MeshStandardMaterial({ color: 0x2b3a78, roughness: 0.2, metalness: 0.3 }));
    w.rotation.x = -Math.PI / 2;
    scene.add(w);
  }

  // ---- 섬: Blender 모델 ----
  scene.add(ISL.scene);
  let terrain = null;
  const glowSpots = [];
  ISL.scene.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true; o.receiveShadow = true;
      if (!terrain && (o.name.startsWith('Terrain') || (o.parent && o.parent.name.startsWith('Terrain')))) { terrain = o; o.castShadow = false; o.material.color.set(0xffe6d8); }   // 땅을 따뜻한 빛으로
      if (/LanternGlow|LighthouseLamp/.test(o.name) || (o.parent && /LanternGlow|LighthouseLamp/.test(o.parent.name))) glowSpots.push(o);
    }
  });
  ISL.scene.updateMatrixWorld(true);
  glowSpots.forEach((o) => {
    const p = new THREE.Vector3(); o.getWorldPosition(p);
    const big = /Lighthouse/.test(o.name + (o.parent ? o.parent.name : ''));
    const g = glowSprite(0xffcf8a, big ? 6 : 2.2, big ? 0.85 : 0.8); g.position.copy(p); scene.add(g);
    if (big) { const pl = new THREE.PointLight(0xffd99a, 1.4, 16, 2); pl.position.copy(p); scene.add(pl); }
  });

  const uniTime = { value: 0 };

  // ---- 나무·덤불·꽃·바위·모닥불 놓기 (Quaternius CC0 모델) ----
  let campfire = null;
  (function placeProps() {
    const base = { tree: 1, bush: 1, flowers: 1.3, rock: 0.9, log: 1, campfire: 1 };
    MAP.props.forEach((p) => {
      const src = PROPS[p.k];
      if (!src) return;
      const o = src.clone(true);
      o.position.set(p.x, heightAt(p.x, p.z) - 0.03, p.z);
      o.rotation.y = p.r;
      o.scale.setScalar(p.s * (base[p.k.split('_')[0]] || 1));
      o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
      scene.add(o);
      if (p.k === 'campfire') {
        const fire = PROPS.fire.clone(true);
        fire.position.copy(o.position); fire.rotation.y = p.r; fire.scale.copy(o.scale);
        fire.traverse((m) => { if (m.isMesh) { m.material = m.material.clone(); m.material.emissive = new THREE.Color(0xff7a2a); m.material.emissiveIntensity = 1.2; } });
        scene.add(fire);
        const light = new THREE.PointLight(0xff9a4a, 2.2, 12, 2);
        light.position.set(o.position.x, o.position.y + 0.9, o.position.z);
        scene.add(light);
        const glow = glowSprite(0xffa060, 3.2, 0.7);
        glow.position.set(o.position.x, o.position.y + 0.6, o.position.z);
        scene.add(glow);
        campfire = { fire, light, glow, pos: o.position.clone(), base: o.scale.x, embers: [], t: 0 };
      }
    });
  })();

  // ---- 반딧불이 ----
  const flies = [];
  for (let i = 0; i < 40; i++) {
    const s = glowSprite(i % 3 ? 0xfff3a0 : 0xc8ffd8, 0.45, 0.9);
    const x = (Math.random() - 0.5) * 50, z = (Math.random() - 0.5) * 50;
    const h = heightAt(x, z);
    if (h < 0.4) { i--; continue; }
    s.position.set(x, h + 0.6 + Math.random() * 1.2, z);
    scene.add(s);
    flies.push({ s, bx: x, bz: z, by: s.position.y, ph: Math.random() * 10 });
  }

  // ---- 캐릭터: Blender 모델 (기본 몸 + 토끼 후드) ----
  function makeKid() {
    const root = new THREE.Group();
    const body = CH.scene;
    root.add(body);
    const WEAR = ['Item_BunnyHood'];          // 지금 입고 있는 아이템
    body.traverse((o) => {
      if (o.name.startsWith('Item_')) o.visible = WEAR.includes(o.name);
      if (o.isMesh) { o.castShadow = true; }
    });
    const part = (n) => { const o = body.getObjectByName(n); return o ? { o, p: o.position.clone(), r: o.rotation.clone() } : null; };
    const P = { head: part('Head'), sl: part('SleeveL'), sr: part('SleeveR'), fl: part('ShoeL'), fr: part('ShoeR') };
    function animate(phase, walking) {
      const sw = walking ? Math.sin(phase) : 0;
      body.position.y = walking ? Math.abs(Math.sin(phase)) * 0.035 : 0;
      if (P.fl) { P.fl.o.position.z = P.fl.p.z + sw * 0.07; P.fl.o.position.y = P.fl.p.y + Math.max(0, sw) * 0.04; }
      if (P.fr) { P.fr.o.position.z = P.fr.p.z - sw * 0.07; P.fr.o.position.y = P.fr.p.y + Math.max(0, -sw) * 0.04; }
      if (P.sl) P.sl.o.rotation.x = P.sl.r.x - sw * 0.5;
      if (P.sr) P.sr.o.rotation.x = P.sr.r.x + sw * 0.5;
      if (P.head) P.head.o.position.y = P.head.p.y + (walking ? Math.abs(Math.sin(phase)) * 0.015 : Math.sin(phase * 0.5) * 0.006);
    }
    const hit = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    return { root, hit, animate, H: 1.1 };
  }
  const kid = makeKid();
  scene.add(kid.root, kid.hit);

  const me = {
    pos: new THREE.Vector3(MAP.spawn[0], 0, MAP.spawn[1]),
    heading: 0,                     // 바라보는 방향 (0 = +z 카메라 쪽, π = -z 길 쪽)
    target: null, phase: 0, blinkT: 3, blink: 0, acc: 0, jump: 0, stuck: 0, lastDist: 1e9,
  };
  me.pos.y = heightAt(me.pos.x, me.pos.z);

  // ---- 별 요정 ----
  const fairy = { g: new THREE.Group(), t: 0, spin: 0, trail: 0, pos: new THREE.Vector3() };
  fairy.g.add(glowSprite(0xfff0b0, 0.55, 0.75));
  const fcore = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff8dc }));
  fairy.g.add(fcore);
  const fhit = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
  fairy.g.add(fhit);
  scene.add(fairy.g);

  // ---- 반짝이 ----
  const sparks = [];
  function burst(pos, color, n, speed) {
    for (let i = 0; i < n; i++) {
      const s = glowSprite(color, 0.25, 0.95);
      s.position.copy(pos);
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random()));
      sparks.push({ s, v, life: 0, max: 0.8 + Math.random() * 0.6 });
      scene.add(s);
    }
  }

  // ---- 목적지 원 ----
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const ringG = new THREE.Group();
  ringG.add(new THREE.Mesh(new THREE.RingGeometry(0.32, 0.4, 40), ringMat), new THREE.Mesh(new THREE.CircleGeometry(0.08, 16), ringMat));
  ringG.rotation.x = -Math.PI / 2;
  scene.add(ringG);
  let ringOn = 0, ringT = 0;
  const ripples = [];

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
  const kidLines = ['안녕! 오늘 밤 바다가 참 반짝인다', '길 끝에 등대가 있어. 같이 가 볼래?', '바람 소리가 좋다', '조용히 쉬었다 가도 괜찮아'];
  const fairyLines = ['소원 하나 들려줄래?', '반짝! 오늘도 소원들이 빛나고 있어', '나는 소원을 별에게 전해 주는 요정이야'];
  let kl = 0, fl = 0;

  // ---- 카메라 조작: 탭은 걷기, 옆으로 밀기는 둘러보기 ----
  let camYaw = 0, camPitch = 0.42, camDist = 8;
  const camPos = new THREE.Vector3();
  let down = null;
  canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, drag: false }; });
  canvas.addEventListener('pointermove', (e) => {
    if (!down) return;
    if (!down.drag && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 10) down.drag = true;
    if (down.drag) {
      camYaw -= (e.clientX - down.lx) * 0.006;
      camPitch = Math.min(0.75, Math.max(0.12, camPitch + (e.clientY - down.ly) * 0.003));
      down.lx = e.clientX; down.ly = e.clientY;
    }
  });
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  canvas.addEventListener('pointerup', (e) => {
    if (!down) return;
    const wasDrag = down.drag;
    down = null;
    hint.classList.add('off');
    if (wasDrag) return;
    ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    if (raycaster.intersectObject(fhit, false).length) {
      fairy.spin = 1.2;
      burst(fairy.g.position, 0xfff0a8, 16, 1.6);
      say(fairyLines[fl++ % fairyLines.length], 'fairy');
      return;
    }
    if (raycaster.intersectObject(kid.hit, false).length) {
      me.jump = 0.5;
      burst(me.pos.clone().setY(me.pos.y + 1.0), 0xffb6d2, 12, 1.4);
      say(kidLines[kl++ % kidLines.length], 'kid');
      return;
    }
    const hit = raycaster.intersectObject(terrain, false)[0];
    let target = null;
    if (hit && hit.point.y > WALKABLE) target = hit.point.clone();
    else {
      // 바다를 눌렀으면 그 방향의 물가까지만
      const wp = hit ? hit.point : (() => {
        const t = -raycaster.ray.origin.y / raycaster.ray.direction.y;
        return t > 0 ? raycaster.ray.origin.clone().addScaledVector(raycaster.ray.direction, t) : null;
      })();
      if (!wp) return;
      const from = me.pos.clone(), d = wp.clone().sub(from); d.y = 0;
      const len = d.length(); d.normalize();
      let last = null;
      for (let s = 0.5; s < len; s += 0.4) {
        const x = from.x + d.x * s, z = from.z + d.z * s;
        if (heightAt(x, z) <= WALKABLE + 0.05) break;
        last = new THREE.Vector3(x, heightAt(x, z), z);
      }
      say('여기서부터는 바다야. 더는 못 가!', 'kid');
      target = last;
    }
    if (!target) return;
    me.target = target; me.lastDist = 1e9; me.stuck = 0;
    ringG.position.set(target.x, heightAt(target.x, target.z) + 0.04, target.z);
    ringOn = 1; ringT = 0;
    const rp = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.38, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
    rp.rotation.x = -Math.PI / 2; rp.position.copy(ringG.position);
    scene.add(rp); ripples.push({ m: rp, t: 0 });
  });

  // ---- 갱신 ----
  const tmp = new THREE.Vector3(), camFwd = new THREE.Vector3(), camRight = new THREE.Vector3();
  const SPEED = 2.0;   // 초당 2칸
  let walkingPrev = false;

  function angleLerp(a, b, t) {
    let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    return a + d * t;
  }

  function step(dt, time) {
    uniTime.value = time;
    if (water) water.material.uniforms.time.value = time * 0.6;

    // 걷기
    let walking = false;
    if (me.target) {
      tmp.copy(me.target).sub(me.pos); tmp.y = 0;
      const dist = tmp.length();
      if (dist < 0.08) me.target = null;
      else {
        const want = Math.atan2(tmp.x, tmp.z);
        const st = Math.min(dist, SPEED * dt);
        // 막힌 곳 안으로 더 들어가는 걸음만 막는다 (이미 가까이 있어도 빠져나오는 쪽으로는 걸을 수 있음)
        const blocked = (nx, nz) => heightAt(nx, nz) < WALKABLE ||
          trees.some((o) => { const d2 = Math.hypot(o.x - nx, o.z - nz); return d2 < o.r && d2 < Math.hypot(o.x - me.pos.x, o.z - me.pos.z); });
        let moved = false;
        // 똑바로 못 가면 조금씩 옆으로 꺾어서 돌아간다
        for (const da of [0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2, 1.6, -1.6]) {
          const hd = want + da;
          const nx = me.pos.x + Math.sin(hd) * st, nz = me.pos.z + Math.cos(hd) * st;
          if (!blocked(nx, nz)) {
            me.heading = angleLerp(me.heading, hd, Math.min(1, dt * 8));
            me.pos.x = nx; me.pos.z = nz; moved = true; walking = true;
            break;
          }
        }
        // 오래 제자리면(돌아갈 길이 없으면) 멈춘다
        me.stuck = moved && dist < me.lastDist - 0.002 ? 0 : (me.stuck || 0) + dt;
        me.lastDist = dist;
        if (!moved || me.stuck > 1.5) { me.target = null; me.stuck = 0; }
      }
    }
    me.pos.y = heightAt(me.pos.x, me.pos.z);
    me.phase += dt * (walking ? 9 : 2.2);
    if (me.jump > 0) me.jump = Math.max(0, me.jump - dt);
    const jumpY = me.jump > 0 ? Math.sin((1 - me.jump / 0.5) * Math.PI) * 0.45 : 0;
    kid.root.position.set(me.pos.x, me.pos.y + jumpY, me.pos.z);
    kid.root.rotation.y = me.heading;
    kid.hit.position.set(me.pos.x, me.pos.y + 0.6, me.pos.z);

    // 카메라: 캐릭터 뒤쪽 위에서 따라감 (밀어서 돌릴 수 있음)
    const look = tmp.set(me.pos.x, me.pos.y + 0.9, me.pos.z);
    const want = new THREE.Vector3(
      look.x + Math.sin(camYaw) * Math.cos(camPitch) * camDist,
      look.y + Math.sin(camPitch) * camDist,
      look.z + Math.cos(camYaw) * Math.cos(camPitch) * camDist);
    const ground = heightAt(want.x, want.z) + 0.6;
    if (want.y < ground) want.y = ground;
    if (!camPos.lengthSq()) camPos.copy(want);
    camPos.lerp(want, 1 - Math.exp(-dt * 4));
    camera.position.copy(camPos);
    camera.lookAt(look);

    // 화면 기준으로 캐릭터가 어느 쪽을 보는지 계산 → 그림 선택
    camera.getWorldDirection(camFwd); camFwd.y = 0; camFwd.normalize();
    camRight.set(-camFwd.z, 0, camFwd.x);
    const hx = Math.sin(me.heading), hz = Math.cos(me.heading);
    const side = hx * camRight.x + hz * camRight.z;     // +면 화면 오른쪽
    const away = hx * camFwd.x + hz * camFwd.z;          // +면 화면 안쪽(뒷모습)
    me.blinkT -= dt;
    if (me.blinkT < 0) { me.blink = 1; me.blinkT = 2.5 + Math.random() * 3; }
    if (me.blink > 0) me.blink = Math.max(0, me.blink - dt * 7);
    me.acc += dt;
    kid.animate(me.phase, walking);
    walkingPrev = walking;

    // 달빛 그림자가 캐릭터 주변을 비추도록
    moonLight.position.set(me.pos.x + moonDir.x * 40, me.pos.y + 40, me.pos.z + moonDir.z * 40 + 10);
    moonLight.target.position.set(me.pos.x, me.pos.y, me.pos.z);

    // 별 요정
    fairy.t += dt;
    const fw = new THREE.Vector3(
      me.pos.x + camRight.x * 0.7 + Math.cos(fairy.t * 0.9) * 0.25,
      me.pos.y + 1.6 + Math.sin(fairy.t * 1.7) * 0.12 + (fairy.spin > 0 ? Math.sin((1 - fairy.spin / 1.2) * Math.PI) * 0.5 : 0),
      me.pos.z + camRight.z * 0.7 + Math.sin(fairy.t * 0.7) * 0.25);
    if (!fairy.pos.lengthSq()) fairy.pos.copy(fw);
    fairy.pos.lerp(fw, 1 - Math.exp(-dt * 2.5));
    fairy.g.position.copy(fairy.pos);
    fairy.spin = Math.max(0, fairy.spin - dt);
    fairy.trail -= dt;
    if (fairy.trail <= 0) {
      fairy.trail = 0.1;
      const s = glowSprite(0xfff0b0, 0.14, 0.8);
      s.position.copy(fairy.pos);
      sparks.push({ s, v: new THREE.Vector3((Math.random() - 0.5) * 0.2, -0.35, (Math.random() - 0.5) * 0.2), life: 0, max: 1.1 });
      scene.add(s);
    }

    // 모닥불: 불꽃이 살랑이고, 불씨가 위로 날아오름
    if (campfire) {
      const c = campfire;
      const f = 1 + Math.sin(time * 9) * 0.06 + Math.sin(time * 23) * 0.04;
      c.fire.scale.set(c.base * (1 + Math.sin(time * 7) * 0.03), c.base * f, c.base * (1 + Math.cos(time * 6) * 0.03));
      c.light.intensity = 2.0 + Math.sin(time * 11) * 0.35 + Math.sin(time * 27) * 0.2;
      c.glow.material.opacity = 0.6 + Math.sin(time * 13) * 0.1;
      c.t -= dt;
      if (c.t <= 0) {
        c.t = 0.08;
        const s = glowSprite(0xffb070, 0.12, 0.95);
        s.position.set(c.pos.x + (Math.random() - 0.5) * 0.5, c.pos.y + 0.6, c.pos.z + (Math.random() - 0.5) * 0.5);
        sparks.push({ s, v: new THREE.Vector3((Math.random() - 0.5) * 0.3, 1.1 + Math.random() * 0.6, (Math.random() - 0.5) * 0.3), life: 0, max: 1.4 });
        scene.add(s);
      }
    }

    // 반딧불이
    flies.forEach((f) => {
      f.s.position.set(f.bx + Math.sin(time * 0.4 + f.ph) * 0.8, f.by + Math.sin(time * 0.9 + f.ph * 2) * 0.3, f.bz + Math.cos(time * 0.35 + f.ph) * 0.8);
      f.s.material.opacity = 0.45 + Math.sin(time * 2 + f.ph * 3) * 0.4;
    });

    // 반짝이와 원
    for (let i = sparks.length - 1; i >= 0; i--) {
      const p = sparks[i];
      p.life += dt;
      const k = p.life / p.max;
      if (k >= 1) { scene.remove(p.s); p.s.material.dispose(); sparks.splice(i, 1); continue; }
      p.s.position.addScaledVector(p.v, dt);
      p.v.multiplyScalar(1 - dt * 1.5);
      p.s.material.opacity = 0.95 * (1 - k);
    }
    if (ringOn > 0) {
      ringT += dt;
      if (!me.target) ringOn = Math.max(0, ringOn - dt * 3);
      ringMat.opacity = ringOn * 0.9;
      const k = 1 + Math.sin(ringT * 5) * 0.08;
      ringG.scale.set(k, k, 1);
    }
    for (let i = ripples.length - 1; i >= 0; i--) {
      const r = ripples[i];
      r.t += dt;
      const k = 1 + r.t * 2.5;
      r.m.scale.set(k, k, 1);
      r.m.material.opacity = Math.max(0, 0.8 * (1 - r.t / 0.9));
      if (r.t > 0.9) { scene.remove(r.m); r.m.geometry.dispose(); r.m.material.dispose(); ripples.splice(i, 1); }
    }

    if (bubbleFor) {
      const p = (bubbleFor === 'fairy' ? fairy.pos.clone().setY(fairy.pos.y + 0.3) : me.pos.clone().setY(me.pos.y + kid.H * 1.15)).project(camera);
      bubble.style.left = Math.min(innerWidth - 110, Math.max(110, (p.x * 0.5 + 0.5) * innerWidth)) + 'px';
      bubble.style.top = ((-p.y * 0.5 + 0.5) * innerHeight - 6) + 'px';
    }
  }

  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w / h < 0.8 ? 62 : 50;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    step(dt, now / 1000);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  }
})();

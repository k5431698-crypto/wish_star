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
  const PROP_FILES = { flowers: 'Flowers', log: 'WoodLog', campfire: 'Bonfire', fire: 'Bonfire_Fire' };
  const kinds = Object.keys(PROP_FILES);
  Promise.all([fetch('assets/models/island-map.json').then((r) => r.json()), load('assets/models/island.glb'), load('assets/models/character.glb'),
    Promise.all(kinds.map((k) => load('assets/models/q/' + PROP_FILES[k] + '.glb')))])
    .then(([map, isl, ch, props]) => {
      const PROPS = {};
      kinds.forEach((k, i) => { PROPS[k] = props[i].scene; });
      hintEl.textContent = hintText; main(map, isl, ch, PROPS);
    })
    .catch((err) => { console.error('load/main error: ' + (err && err.stack || err)); document.getElementById('fail').textContent = '섬을 불러오지 못했어요. 새로고침해 주세요.'; document.getElementById('fail').style.display = 'flex'; });

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
  scene.fog = new THREE.FogExp2(HORIZON, 0.0048);
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

  // ---- 큰 뭉게구름: 작은 구름 덩어리를 수천 장 쌓아 올린 뭉게구름 (노을빛을 받는 쪽은 분홍·금빛, 그늘은 푸른 보라) ----
  const cloudDrift = { value: 0 };
  (function clouds() {
    let sd = 4242;
    const R = () => (sd = (sd * 16807) % 2147483647) / 2147483647, rr = (a, b) => a + (b - a) * R();
    // 구름 덩어리 그림: 부드러운 가장자리 + 안쪽에 몽글몽글한 명암
    const cv = document.createElement('canvas'); cv.width = cv.height = 256;
    const g = cv.getContext('2d');
    const gr = g.createRadialGradient(128, 128, 10, 128, 128, 126);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.92)'); gr.addColorStop(0.82, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 26; i++) {            // 안쪽의 작은 몽글이 (살짝 어둡게, 살짝 밝게)
      const a = R() * Math.PI * 2, d = R() * 70, x = 128 + Math.cos(a) * d, y = 128 + Math.sin(a) * d * 0.9, r = 20 + R() * 34;
      const rg = g.createRadialGradient(x - r * 0.25, y - r * 0.3, 0, x, y, r);
      const dark = R() < 0.5;
      rg.addColorStop(0, dark ? 'rgba(170,160,200,0.18)' : 'rgba(255,255,255,0.22)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = rg; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    const tex = new THREE.CanvasTexture(cv); tex.encoding = THREE.sRGBEncoding;

    const pos = [], size = [], col = [], rot = [], drift = [];
    const sun = new THREE.Vector3(-0.35, 0.0, -1).normalize();      // 노을이 있는 방향
    const cShadow = new THREE.Color(0xa89ad8).convertSRGBToLinear(), cMid = new THREE.Color(0xffd0cc).convertSRGBToLinear(), cLit = new THREE.Color(0xfff0d0).convertSRGBToLinear();
    function addCloud(az, dist, base, width, height, speed, seed) {
      const cx = Math.sin(az) * dist, cz = -Math.cos(az) * dist;
      const out = new THREE.Vector3(Math.sin(az), 0, -Math.cos(az)), side = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
      const puffs = [];
      function add(p, r, depth) {
        puffs.push({ p, r });
        if (depth >= 3) return;
        const k = depth === 0 ? 7 : depth === 1 ? 5 : 4;
        for (let i = 0; i < k; i++) {
          const dir = new THREE.Vector3(rr(-1, 1), rr(0.05, 1), rr(-1, 1)).normalize();
          add(p.clone().addScaledVector(dir, r * rr(0.55, 0.85)), r * rr(0.5, 0.68), depth + 1);
        }
      }
      // 아래는 넓고 평평하게, 위로 갈수록 좁게 솟는 여러 개의 탑
      const towers = 4 + Math.floor(R() * 3);
      for (let t = 0; t < towers; t++) {
        const f = (t / (towers - 1)) - 0.5, h = height * rr(0.45, 1.0) * (1 - Math.abs(f) * 0.9);
        const bx = f * width, r0 = width * rr(0.11, 0.17);
        for (let y = 0; y < h; y += r0 * 0.9) {
          const k = 1 - y / (h + 1), rad = r0 * (0.55 + 0.75 * k);
          add(new THREE.Vector3(bx + rr(-0.15, 0.15) * r0, base + y, rr(-0.35, 0.35) * r0), rad, 1);
        }
      }
      puffs.forEach(({ p, r }) => {
        const w = new THREE.Vector3().set(cx, 0, cz).addScaledVector(side, p.x).addScaledVector(out, p.z);
        w.y = p.y;
        const up = Math.min(1, Math.max(0, (p.y - base) / height));
        const lit = Math.min(1, up * 1.15 + 0.12 + R() * 0.15);
        const c = new THREE.Color().copy(cShadow).lerp(cMid, Math.min(1, lit * 1.5)).lerp(cLit, Math.max(0, lit - 0.55) * 1.6);
        pos.push(w.x, w.y, w.z); size.push(r * 2.3); col.push(c.r, c.g, c.b); rot.push(R() * 6.28); drift.push(speed);
      });
    }
    // 노을 쪽에 가장 큰 구름, 둘레에 크기가 다른 구름들
    addCloud(-0.25, 560, 30, 560, 520, 0.25, 1);
    addCloud(0.85, 640, 10, 460, 360, 0.18, 2);
    addCloud(-1.15, 620, 20, 480, 380, 0.22, 3);
    addCloud(2.4, 700, 30, 500, 420, 0.2, 4);
    addCloud(-2.4, 680, 10, 420, 320, 0.16, 5);
    addCloud(1.7, 740, 50, 380, 230, 0.14, 6);
    addCloud(3.5, 660, 20, 440, 340, 0.17, 7);

    // 멀리 있는 것부터 그리기 (섬 중심 기준)
    const idx = pos.length / 3, order = Array.from({ length: idx }, (_, i) => i).sort((a, b) => Math.hypot(pos[b * 3], pos[b * 3 + 2]) - Math.hypot(pos[a * 3], pos[a * 3 + 2]));
    const geo = new THREE.InstancedBufferGeometry();
    const base = new THREE.PlaneGeometry(1, 1);
    geo.index = base.index; geo.setAttribute('position', base.attributes.position); geo.setAttribute('uv', base.attributes.uv);
    const pick = (arr, n) => { const o = new Float32Array(idx * n); order.forEach((src, i) => { for (let k = 0; k < n; k++) o[i * n + k] = arr[src * n + k]; }); return o; };
    geo.setAttribute('aPos', new THREE.InstancedBufferAttribute(pick(pos, 3), 3));
    geo.setAttribute('aSize', new THREE.InstancedBufferAttribute(pick(size, 1), 1));
    geo.setAttribute('aCol', new THREE.InstancedBufferAttribute(pick(col, 3), 3));
    geo.setAttribute('aRot', new THREE.InstancedBufferAttribute(pick(rot, 1), 1));
    geo.setAttribute('aDrift', new THREE.InstancedBufferAttribute(pick(drift, 1), 1));
    geo.instanceCount = idx;
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false,
      uniforms: { map: { value: tex }, uTime: cloudDrift },
      vertexShader: 'attribute vec3 aPos; attribute float aSize; attribute vec3 aCol; attribute float aRot; attribute float aDrift; uniform float uTime; varying vec2 vUv; varying vec3 vCol;\n' +
        'void main(){ vUv = uv; vCol = aCol; vec3 c = aPos; c.x += uTime * aDrift; vec4 mv = modelViewMatrix * vec4(c,1.0);\n' +
        ' float cs = cos(aRot), sn = sin(aRot); vec2 p = position.xy * aSize; mv.xy += vec2(p.x*cs - p.y*sn, p.x*sn + p.y*cs); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform sampler2D map; varying vec2 vUv; varying vec3 vCol;\n' +
        'void main(){ vec4 t = texture2D(map, vUv); gl_FragColor = vec4(vCol, t.a * 0.95); }',
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false; mesh.renderOrder = -1;
    scene.add(mesh);
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
      if (!terrain && (o.name.startsWith('Terrain') || (o.parent && o.parent.name.startsWith('Terrain')))) { terrain = o; o.castShadow = false;
        // 땅 색: 연한 풀빛과 라벤더가 섞이게 + 위치에 따라 은은한 얼룩(평평해 보이지 않게)
        const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide });
        mat.onBeforeCompile = (sh) => {
          sh.vertexShader = 'varying vec3 vW;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vW = (modelMatrix * vec4(position,1.0)).xyz;');
          sh.fragmentShader = 'varying vec3 vW;\nfloat h21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}\n' +
            'float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}\n' +
            sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n' +
              ' float n1 = vn(vW.xz*0.35), n2 = vn(vW.xz*1.8), n3 = vn(vW.xz*7.0);\n' +
              ' vec3 greenT = vec3(0.55,0.95,0.42), warmT = vec3(1.0,0.93,0.82);\n' +
              ' diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb*greenT*1.5, smoothstep(0.25,0.65,n1)*0.8);\n' +
              ' diffuseColor.rgb *= (0.9 + 0.2*n2 + 0.1*(n3-0.5)) * 0.85;\n' +
              ' diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb*warmT, 0.25);');
        };
        o.material = mat;
      }
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

  // ---- 나무: 나무마다 모양이 다르게 코드로 만든다 (가지 + 수천 장의 잎) ----
  function rngFrom(seed) { let t = Math.floor(seed) % 2147483647; if (t <= 0) t += 2147483646; return () => (t = (t * 16807) % 2147483647) / 2147483647; }

  // 잎 그림: 잎사귀 여러 장이 모인 덩어리 (회색~흰색이라 나무마다 색을 입힘)
  const leafTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    const R = rngFrom(11);
    g.fillStyle = 'rgb(150,150,150)'; g.beginPath(); g.arc(64, 64, 9, 0, Math.PI * 2); g.fill();
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + R() * 0.5, len = 36 + R() * 14, w = 11 + R() * 5;
      g.save(); g.translate(64, 64); g.rotate(a);
      const gr = g.createLinearGradient(0, 0, len, 0);
      gr.addColorStop(0, 'rgb(160,160,160)'); gr.addColorStop(1, 'rgb(255,255,255)');
      g.fillStyle = gr; g.beginPath(); g.moveTo(3, 0);
      g.bezierCurveTo(len * 0.3, -w, len * 0.78, -w * 0.8, len, 0);
      g.bezierCurveTo(len * 0.78, w * 0.8, len * 0.3, w, 3, 0); g.fill();
      g.strokeStyle = 'rgba(170,170,170,0.45)'; g.lineWidth = 0.9;
      g.beginPath(); g.moveTo(3, 0); g.lineTo(len * 0.9, 0); g.stroke();
      g.restore();
    }
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4; return t;
  })();
  const leafGeo = new THREE.PlaneGeometry(1, 1, 4, 4);      // 칸을 나눠서 잎이 살짝 휘게
  const leafMat = new THREE.MeshStandardMaterial({ map: leafTex, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.75, emissive: 0x4a3036, emissiveMap: leafTex, emissiveIntensity: 0.28 });
  leafMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniTime;
    // 잎마다 '나무 바깥쪽'을 향하는 부드러운 법선(aN)을 써서, 종이 조각이 아니라 둥근 수관 덩어리처럼 빛을 받게 함
    sh.vertexShader = 'uniform float uTime; attribute vec3 aN; varying float vWarm;\n' + sh.vertexShader
      .replace('#include <begin_vertex>',
        '#include <begin_vertex>\n' +
        ' transformed.z += (position.x * position.x + position.y * position.y) * 0.55 - 0.1;\n')             // 잎을 숟가락처럼 오목하게 휘게
      .replace('#include <defaultnormal_vertex>', '#include <defaultnormal_vertex>\n transformedNormal = normalize(normalMatrix * aN);')
      .replace('#include <project_vertex>',
        ' vec4 mvPosition = vec4(transformed, 1.0);\n' +
        ' vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);\n' +
        ' mvPosition = instanceMatrix * mvPosition;\n' +
        ' vec3 wp = (modelMatrix * vec4(ip, 1.0)).xyz;\n' +
        // 바람: 일정하지 않고 큰 돌풍이 지나가듯 세졌다 약해졌다 함 (장소와 시간에 따라 다르게)
        ' float gA = sin(uTime * 0.31 - wp.x * 0.05 - wp.z * 0.035) * 0.5 + 0.5;\n' +
        ' float gB = sin(uTime * 0.17 + wp.z * 0.04 - wp.x * 0.02 + 1.7) * 0.5 + 0.5;\n' +
        ' float gust = smoothstep(0.15, 0.95, gA * gB * 1.5 + 0.12);\n' +
        ' float ph = ip.x * 3.1 + ip.y * 2.3 + ip.z * 2.7;\n' +
        ' float hh = clamp(ip.y / 5.0, 0.0, 1.0) * 0.8 + 0.2;\n' +
        ' float f1 = sin(uTime * (1.3 + gust * 1.6) + ph), f2 = sin(uTime * (2.9 + gust * 2.4) + ph * 1.7);\n' +
        ' vec3 sway = vec3(f1 * 0.7 + f2 * 0.3, f2 * 0.25, cos(uTime * (1.1 + gust) + ph) * 0.5) * (0.035 + 0.17 * gust) * hh;\n' +
        ' mvPosition.xyz += sway;\n' +
        ' mvPosition = modelViewMatrix * mvPosition;\n' +
        ' gl_Position = projectionMatrix * mvPosition;\n');
  };
  const barkMat = new THREE.MeshStandardMaterial({ color: 0x4a3830, roughness: 1 });
  const blobTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(30,15,50,0.5)'); gr.addColorStop(1, 'rgba(30,15,50,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
  })();

  // 종류: crown=수관 모양, h=키, tr=줄기 굵기, spread=가지 뻗음, cards=잎 장수, card=잎 크기, cols=잎 색
  const SPECIES = {
    oak:    { crown: 'round', h: [4.6, 5.8], tr: 0.30, spread: 1.9, cards: 1228, card: 0.61, cols: [0x7fae62, 0x6a9c52, 0x93bd70] },
    maple:  { crown: 'round', h: [5.2, 6.4], tr: 0.34, spread: 2.1, cards: 1333, card: 0.61, cols: [0xd9482f, 0xe5653a, 0xc43a2c] },
    golden: { crown: 'oval',  h: [5.4, 6.8], tr: 0.26, spread: 1.5, cards: 1123, card: 0.58, cols: [0xe8b84a, 0xf2cb62, 0xd9a03a] },
    violet: { crown: 'round', h: [4.4, 5.4], tr: 0.28, spread: 1.8, cards: 1228, card: 0.59, cols: [0x4d4a8a, 0x5d5aa0, 0x403e74] },
    cherry: { crown: 'round', h: [3.8, 4.8], tr: 0.24, spread: 2.0, cards: 1123, card: 0.59, cols: [0xf7b6cf, 0xf1a0c1, 0xfbd2e1] },
    willow: { crown: 'weeping', h: [4.2, 5.2], tr: 0.28, spread: 1.7, cards: 1228, card: 0.48, cols: [0x9cc28a, 0x86b078, 0xb4d19a] },
    pine:   { crown: 'cone',  h: [5.6, 7.2], tr: 0.22, spread: 1.7, cards: 982, card: 0.48, cols: [0x3f6f58, 0x4b7d63, 0x35604c] },
    bush:   { crown: 'bush',  h: [0.8, 1.2], tr: 0, spread: 0.7, cards: 175, card: 0.41, cols: [0x7fae62, 0x6a9c52, 0x93bd70] },
    bushBerry: { crown: 'bush', h: [0.8, 1.2], tr: 0, spread: 0.7, cards: 175, card: 0.41, cols: [0x6f9c58, 0x5f8c4c, 0x86b068], berry: 0xd94a5a },
  };

  function mergeGeos(list) {
    let nv = 0, ni = 0;
    list.forEach((g) => { nv += g.attributes.position.count; ni += g.index.count; });
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), idx = new Uint32Array(ni);
    let ov = 0, oi = 0;
    list.forEach((g) => {
      pos.set(g.attributes.position.array, ov * 3); nor.set(g.attributes.normal.array, ov * 3);
      for (let i = 0; i < g.index.count; i++) idx[oi + i] = g.index.array[i] + ov;
      ov += g.attributes.position.count; oi += g.index.count;
    });
    const m = new THREE.BufferGeometry();
    m.setAttribute('position', new THREE.BufferAttribute(pos, 3)); m.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    m.setIndex(new THREE.BufferAttribute(idx, 1));
    return m;
  }
  const UPV = new THREE.Vector3(0, 1, 0);
  function segGeo(a, b, r0, r1) {
    const d = b.clone().sub(a), len = d.length();
    const g = new THREE.CylinderGeometry(Math.max(r1, 0.012), Math.max(r0, 0.015), len, 7, 1);
    g.translate(0, len / 2, 0);
    g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(UPV, d.normalize())));
    g.translate(a.x, a.y, a.z);
    return g;
  }

  function buildTree(key, seed, scale) {
    const sp = SPECIES[key], R = rngFrom(seed), rr = (a, b) => a + (b - a) * R();
    const group = new THREE.Group();
    const geos = [], anchors = [];     // anchors: 잎이 모이는 자리 {p, rad, hang}
    const H = rr(sp.h[0], sp.h[1]);
    let treeR = 0.3;

    if (sp.crown === 'bush') {
      const n = 6 + Math.floor(R() * 3);
      for (let i = 0; i < n; i++) {
        const a = R() * Math.PI * 2, d = rr(0, sp.spread);
        anchors.push({ p: new THREE.Vector3(Math.cos(a) * d, rr(0.25, H * 0.7), Math.sin(a) * d), rad: rr(0.35, 0.6) });
      }
      treeR = 0.5;
    } else {
      // 줄기: 살짝 휘어서 위로
      const trunkFrac = sp.crown === 'cone' ? 0.95 : sp.crown === 'weeping' ? 0.55 : 0.55;
      const n = 6, segL = (H * trunkFrac) / n, r0 = sp.tr * rr(0.9, 1.15);
      let p = new THREE.Vector3(), dir = new THREE.Vector3(rr(-0.1, 0.1), 1, rr(-0.1, 0.1)).normalize();
      const pts = [p.clone()];
      for (let i = 0; i < n; i++) {
        if (sp.crown !== 'cone') { dir.x += rr(-0.14, 0.14); dir.z += rr(-0.14, 0.14); } else { dir.x += rr(-0.03, 0.03); dir.z += rr(-0.03, 0.03); }
        dir.y = 1; dir.normalize();
        const np = p.clone().addScaledVector(dir, segL);
        geos.push(segGeo(p, np, r0 * (1 - (i / n) * (sp.crown === 'cone' ? 0.8 : 0.5)), r0 * (1 - ((i + 1) / n) * (sp.crown === 'cone' ? 0.8 : 0.5))));
        p = np; pts.push(p.clone());
      }
      treeR = r0 * 1.2;
      const top = pts[pts.length - 1];
      if (sp.crown === 'cone') {
        const L = 7;
        for (let k = 0; k < L; k++) {
          const f = k / (L - 1), y = H * (0.22 + 0.76 * f), rad = sp.spread * (1 - f * 0.88) * rr(0.85, 1.1);
          const m = 5 + Math.floor((1 - f) * 3), a0 = R() * 6.28;
          for (let j = 0; j < m; j++) {
            const a = a0 + (j / m) * Math.PI * 2 + rr(-0.2, 0.2);
            const tip = new THREE.Vector3(Math.cos(a) * rad, y - rad * 0.35, Math.sin(a) * rad);
            geos.push(segGeo(new THREE.Vector3(top.x * f, y, top.z * f), tip, 0.04, 0.012));
            anchors.push({ p: tip, rad: 0.55 * (1 - f * 0.4) });
          }
        }
        anchors.push({ p: new THREE.Vector3(0, H, 0), rad: 0.35 });
      } else if (sp.crown === 'weeping') {
        const nb = 7 + Math.floor(R() * 3);
        for (let i = 0; i < nb; i++) {
          let q = pts[Math.floor(rr(3, 6.99))].clone(), a = R() * Math.PI * 2;
          let d = new THREE.Vector3(Math.cos(a), rr(0.9, 1.5), Math.sin(a)).normalize();
          const steps = 5, sl = rr(0.5, 0.75) * sp.spread * 0.55;
          let r = 0.07;
          for (let k = 0; k < steps; k++) {
            const nq = q.clone().addScaledVector(d, sl);
            geos.push(segGeo(q, nq, r, r * 0.7)); r *= 0.7;
            d.y -= 0.32 + k * 0.08; d.normalize();
            q = nq;
            if (k >= 1) anchors.push({ p: q.clone(), rad: 0.28, hang: rr(1.0, 2.2) });
          }
        }
        treeR = 0.45;
      } else {
        // 굵은 가지 → 잔가지로 갈라짐
        const nb = 4 + Math.floor(R() * 4);
        for (let i = 0; i < nb; i++) {
          const f = rr(0.45, 1.0), q0 = pts[Math.min(pts.length - 1, Math.floor(f * (pts.length - 1)))].clone();
          const a = R() * Math.PI * 2, el = rr(0.25, 0.85);
          const d = new THREE.Vector3(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el));
          const L1 = rr(0.9, 1.5) * sp.spread * 0.6;
          const q1 = q0.clone().addScaledVector(d, L1);
          geos.push(segGeo(q0, q1, 0.11, 0.07));
          const kids = 2 + Math.floor(R() * 2);
          for (let k = 0; k < kids; k++) {
            const d2 = d.clone().add(new THREE.Vector3(rr(-0.7, 0.7), rr(-0.1, 0.5), rr(-0.7, 0.7))).normalize();
            const L2 = rr(0.7, 1.2) * sp.spread * 0.5;
            const q2 = q1.clone().addScaledVector(d2, L2);
            geos.push(segGeo(q1, q2, 0.06, 0.025));
            anchors.push({ p: q2, rad: rr(0.55, 0.95) });
          }
          anchors.push({ p: q1.clone(), rad: 0.6 });
        }
        anchors.push({ p: top.clone().add(new THREE.Vector3(0, 0.6, 0)), rad: 0.9 });
        if (sp.crown === 'oval') anchors.forEach((an) => { an.p.y = top.y + (an.p.y - top.y) * 1.3 + 0.4; an.p.x *= 0.78; an.p.z *= 0.78; });
      }
    }

    // 줄기와 가지는 한 덩어리 메쉬
    if (geos.length) {
      const trunk = new THREE.Mesh(mergeGeos(geos), barkMat);
      trunk.castShadow = true; group.add(trunk);
    }
    // 잎: 한 번에 그리는 수천 장의 잎
    const N = Math.floor(sp.cards * rr(0.85, 1.1));
    const leafG = leafGeo.clone();
    const nArr = new Float32Array(N * 3);
    leafG.setAttribute('aN', new THREE.InstancedBufferAttribute(nArr, 3));
    const inst = new THREE.InstancedMesh(leafG, leafMat, N);
    const center = new THREE.Vector3(); anchors.forEach((a) => center.add(a.p)); center.multiplyScalar(1 / Math.max(1, anchors.length));
    const nv = new THREE.Vector3();
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), pp = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
    let minY = 1e9, maxY = -1e9; anchors.forEach((a) => { minY = Math.min(minY, a.p.y); maxY = Math.max(maxY, a.p.y); });
    const pal = sp.cols.map((h) => new THREE.Color(h).convertSRGBToLinear());
    for (let i = 0; i < N; i++) {
      const an = anchors[Math.floor(R() * anchors.length)];
      const u = R() * Math.PI * 2, v = Math.acos(2 * R() - 1), rad = an.rad * Math.cbrt(R());
      pp.set(an.p.x + Math.sin(v) * Math.cos(u) * rad, an.p.y + Math.cos(v) * rad * 0.8, an.p.z + Math.sin(v) * Math.sin(u) * rad);
      let sz = sp.card * rr(0.75, 1.3);
      if (an.hang) { pp.y -= R() * an.hang; sc.set(sz * 0.7, sz * 1.4, 1); e.set(rr(-0.4, 0.4), R() * 6.28, rr(-0.3, 0.3)); }
      else { sc.set(sz, sz, 1); e.set(rr(-1.6, 1.6), R() * 6.28, rr(-1.6, 1.6)); }
      q.setFromEuler(e); m.compose(pp, q, sc); inst.setMatrixAt(i, m);
      nv.copy(pp).sub(center); nv.y += 0.35 * Math.max(0.5, (maxY - minY)); nv.normalize();      // 수관 중심에서 바깥쪽 + 살짝 위
      nArr[i * 3] = nv.x; nArr[i * 3 + 1] = nv.y; nArr[i * 3 + 2] = nv.z;
      const inside = Math.min(1, nv.length() > 0 ? Math.hypot(pp.x - center.x, pp.z - center.z) / Math.max(0.5, sp.spread * 1.2) : 1);   // 안쪽은 어둡게(그늘)
      const shade = (0.55 + 0.5 * inside) * (0.78 + 0.3 * ((pp.y - minY) / Math.max(0.5, maxY - minY))) + rr(-0.1, 0.1);
      col.copy(pal[Math.floor(R() * pal.length)]).multiplyScalar(shade);
      if (sp.berry && R() < 0.1) col.set(sp.berry).convertSRGBToLinear();
      inst.setColorAt(i, col);
    }
    inst.castShadow = false; inst.frustumCulled = true;   // 잎 그림자는 발밑 그림자 자국으로 대신(가볍게)
    group.add(inst);
    // 발밑 그림자 자국
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    const bs = (sp.spread + 0.9) * (sp.crown === 'bush' ? 1.4 : 1.9);
    blob.scale.set(bs, bs, 1); blob.rotation.x = -Math.PI / 2; blob.position.y = 0.05; group.add(blob);
    group.scale.setScalar(scale);
    return group;
  }

  // 부드러운 바위: 둥글게 울퉁불퉁하고 윗면에 이끼
  function makeRock(seed, size) {
    const R = rngFrom(seed);
    const g = new THREE.IcosahedronGeometry(0.5, 3), pos = g.attributes.position;
    const cols = new Float32Array(pos.count * 3), c = new THREE.Color(), base = new THREE.Color(0x9a93b0).convertSRGBToLinear(), moss = new THREE.Color(0x7fa070).convertSRGBToLinear();
    const sx = 0.8 + R() * 0.7, sz = 0.7 + R() * 0.6, ox = R() * 50;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const k = 1 + (fbm(x * 3 + ox, z * 3 + y * 2) - 0.5) * 0.7;
      pos.setXYZ(i, x * k * sx, Math.max(y * k * 0.7, -0.08), z * k * sz);
      c.copy(base).lerp(moss, Math.max(0, Math.min(1, (y + 0.1) * 2.2)) * 0.8);
      cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3)); g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
    mesh.scale.setScalar(size); mesh.castShadow = true; mesh.receiveShadow = true;
    return mesh;
  }

  // ---- 나무·덤불·꽃·바위·모닥불 놓기 ----
  const TREE_SP = { tree_autumn1: 'maple', tree_autumn2: 'golden', tree_autumn3: 'violet', tree_green: 'oak', tree_willow: 'willow', tree_pine: 'pine', tree_birch: 'cherry' };
  let campfire = null;
  (function placeProps() {
    const base = { flowers: 1.3, log: 1, campfire: 1 };
    MAP.props.forEach((p, idx) => {
      const y = heightAt(p.x, p.z) - 0.03;
      if (TREE_SP[p.k] || p.k === 'bush' || p.k === 'bush_berry') {
        const key = TREE_SP[p.k] || (p.k === 'bush' ? 'bush' : 'bushBerry');
        const t = buildTree(key, 1000 + idx * 7919, TREE_SP[p.k] ? p.s * 0.62 : p.s);
        t.position.set(p.x, y, p.z); t.rotation.y = p.r; scene.add(t);
        return;
      }
      if (p.k === 'rock') { const r = makeRock(500 + idx * 131, 1.1 * p.s); r.position.set(p.x, y, p.z); r.rotation.y = p.r; scene.add(r); return; }
      const src = PROPS[p.k];
      if (!src) return;
      const o = src.clone(true);
      o.position.set(p.x, y, p.z);
      o.rotation.y = p.r;
      o.scale.setScalar(p.s * (base[p.k] || 1));
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

  // ---- 촬영 모드: 주소 끝에 ?cine=1 을 붙이면 글자가 사라지고 카메라가 천천히 돌며 움직임 (인스타 영상 화면 녹화용) ----
  const CINE = /[?&]cine=1/.test(location.search);
  if (CINE) renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 3));   // 촬영 모드는 최대 화질로 그림(폰 화면 해상도 그대로)
  if (CINE) { ['hint'].forEach((id) => { const el = document.getElementById(id); if (el) el.style.display = 'none'; }); const b = document.querySelector('.back'); if (b) b.style.display = 'none'; }

  // ---- 카메라 조작: 탭은 걷기, 옆으로 밀기는 둘러보기 ----
  let camYaw = 0, camPitch = 0.42, camDist = 8;
  const camPos = new THREE.Vector3();
  let down = null;
  const ptrs = new Map();            // 화면에 닿아 있는 손가락들 (두 손가락이면 확대·축소)
  let pinchD = 0;
  const DIST_MIN = 2.6, DIST_MAX = 34;
  const zoomBy = (k) => { camDist = Math.min(DIST_MAX, Math.max(DIST_MIN, camDist * k)); };
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); zoomBy(Math.exp(e.deltaY * 0.0012)); hint.classList.add('off'); }, { passive: false });
  canvas.addEventListener('pointerdown', (e) => {
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 1) down = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, drag: false };
    else if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinchD = Math.hypot(a.x - b.x, a.y - b.y); if (down) down.drag = true; }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size >= 2) {                       // 핀치: 벌리면 가까이, 오므리면 멀리
      const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (!tp && pinchD > 0 && d > 0) zoomBy(pinchD / d);
      pinchD = d;
      return;
    }
    if (!down) return;
    if (!down.drag && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 10) down.drag = true;
    if (down.drag) {
      camYaw -= (e.clientX - down.lx) * 0.006;
      camPitch = Math.min(1.15, Math.max(0.1, camPitch + (e.clientY - down.ly) * 0.003));
      down.lx = e.clientX; down.ly = e.clientY;
    }
  });
  const endPtr = (e) => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinchD = 0; };
  canvas.addEventListener('pointercancel', (e) => { endPtr(e); if (!ptrs.size) down = null; });
  ['gesturestart', 'gesturechange', 'gestureend'].forEach((n) => document.addEventListener(n, (e) => e.preventDefault(), { passive: false }));   // 아이폰 기본 확대(튕겨 돌아옴) 막기
  // 폰 핀치: 터치 이벤트로 직접 처리 (처음 간격 대비 현재 간격으로 거리를 정함 → 중간에 이벤트가 끊겨도 튕기지 않음)
  let tp = null;
  const tdist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  canvas.addEventListener('touchstart', (e) => { if (e.touches.length === 2) { tp = { d: tdist(e.touches), z: camDist }; if (down) down.drag = true; } }, { passive: false });
  canvas.addEventListener('touchmove', (e) => {
    if (e.touches.length >= 2) {
      e.preventDefault();
      if (!tp) tp = { d: tdist(e.touches), z: camDist };
      const d = tdist(e.touches);
      if (d > 0) camDist = Math.min(DIST_MAX, Math.max(DIST_MIN, tp.z * tp.d / d));
      hint.classList.add('off');
    }
  }, { passive: false });
  const tend = (e) => { if (e.touches.length < 2) tp = null; };
  canvas.addEventListener('touchend', tend); canvas.addEventListener('touchcancel', tend);
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  canvas.addEventListener('pointerup', (e) => {
    endPtr(e);
    if (!down) return;
    const wasDrag = down.drag;
    if (ptrs.size > 0) return;      // 아직 다른 손가락이 닿아 있으면 탭으로 보지 않음
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
    uniTime.value = time; cloudDrift.value = time;
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
    if (CINE && !down) { camYaw += dt * 0.07; camDist = 5.5 + Math.sin(time * 0.1) * 2.2; camPitch = 0.3 + Math.sin(time * 0.07) * 0.08; }
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

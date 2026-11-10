// 달빛 섬 (3D, 실사 느낌): 보랏빛 풀밭 섬과 반짝이는 밤바다 위를 작은 동자승이 걸어 다닌다.
// - 땅을 누르면 그 자리에 원이 생기고, 캐릭터가 그쪽을 바라보며 걸어간다 (8방향으로 자연스럽게 보이도록 그림이 바뀜)
// - 화면을 옆으로 밀면 카메라가 캐릭터 주위를 돈다
(function () {
  if (!window.THREE) { document.getElementById('fail').style.display = 'flex'; return; }

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
  renderer.toneMappingExposure = 0.9;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const HORIZON = new THREE.Color(0xc9a9d6);
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

  // ---- 산책길 (사진 속 길처럼 멀리 이어지는 길) ----
  const PATH = [[0, 6], [1.5, -4], [-2.5, -13], [1, -22], [8, -29], [16, -32]].map(([x, z]) => new THREE.Vector2(x, z));
  function pathDist(x, z) {
    let best = 1e9;
    for (let i = 0; i < PATH.length - 1; i++) {
      const a = PATH[i], b = PATH[i + 1];
      const abx = b.x - a.x, abz = b.y - a.y;
      const t = Math.max(0, Math.min(1, ((x - a.x) * abx + (z - a.y) * abz) / (abx * abx + abz * abz)));
      const dx = x - (a.x + abx * t), dz = z - (a.y + abz * t);
      best = Math.min(best, Math.hypot(dx, dz));
    }
    return best;
  }

  // ---- 섬의 높이 ----
  function heightAt(x, z) {
    const r = Math.hypot(x, z * 0.85);
    const coast = 34 + (vnoise(x * 0.05 + 3, z * 0.05 + 7) - 0.5) * 14;
    let h = 3.2 * (1 - sstep(coast - 16, coast, r)) + (fbm(x * 0.05, z * 0.05) - 0.5) * 2.2 - 0.6;
    // 길은 조금 평평하게
    const pd = pathDist(x, z);
    if (pd < 2.2 && h > 0.3) h = h * 0.85 + 0.25 * (1 - pd / 2.2);
    return h;
  }
  const WALKABLE = 0.25;   // 이보다 낮으면 물가라서 못 들어감

  // ---- 하늘 (그라데이션 돔) ----
  const skyGeo = new THREE.SphereGeometry(900, 32, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: lin(0x16163f) }, mid: { value: lin(0x4b3f8c) }, bottom: { value: lin(0xe3b2c8) },
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
  scene.add(new THREE.HemisphereLight(0xb7b0ff, 0x3a2f55, 0.75));
  const moonLight = new THREE.DirectionalLight(0xf3e8ff, 1.0);
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
      sunColor: 0xfff0d8,
      waterColor: 0x2b3a78,
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

  // ---- 섬 지형 ----
  const SIZE = 110, SEG = 170;
  const terrainGeo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  terrainGeo.rotateX(-Math.PI / 2);
  (function shape() {
    const pos = terrainGeo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const grassA = lin(0x9d93d0), grassB = lin(0x86ada1), tip = lin(0xc9bcf3), sand = lin(0xe0cfc4), wet = lin(0x8a7fa0), path = lin(0xd8c8b8);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = heightAt(x, z);
      pos.setY(i, h);
      const n = fbm(x * 0.12 + 9, z * 0.12 - 4);
      c.copy(grassA).lerp(grassB, sstep(0.45, 0.7, n)).lerp(tip, sstep(0.6, 0.85, fbm(x * 0.4, z * 0.4)) * 0.4);
      c.lerp(sand, 1 - sstep(0.25, 0.75, h));
      c.lerp(wet, 1 - sstep(-0.3, 0.15, h));
      const pd = pathDist(x, z);
      c.lerp(path, (1 - sstep(0.9, 1.5, pd)) * sstep(0.2, 0.5, h));
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    terrainGeo.computeVertexNormals();
  })();
  const terrain = new THREE.Mesh(terrainGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
  terrain.receiveShadow = true;
  scene.add(terrain);

  // ---- 바람에 흔들리는 풀 (부드러운 풀 다발 그림을 십자로 세움) ----
  const uniTime = { value: 0 };
  (function grass() {
    // 풀 다발 그림: 아래는 어둡고 끝으로 갈수록 밝은, 살짝 휘어진 풀잎 여러 장
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const g = cv.getContext('2d');
    let seed = 7;
    const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 22; i++) {
      const bx = 34 + r() * 60, tx = bx + (r() - 0.5) * 56, ty = 12 + r() * 60;
      const cx = bx + (tx - bx) * 0.3 + (r() - 0.5) * 12, cy = 126 - (126 - ty) * 0.6;
      const w = 2.2 + r() * 2.2;
      const gr = g.createLinearGradient(0, 126, 0, ty);
      gr.addColorStop(0, 'rgb(205,205,215)'); gr.addColorStop(1, 'rgb(255,255,255)');
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(bx - w, 127);
      g.quadraticCurveTo(cx - w * 0.5, cy, tx, ty);
      g.quadraticCurveTo(cx + w * 0.5, cy, bx + w, 127);
      g.fill();
    }
    const tuftTex = new THREE.CanvasTexture(cv);
    tuftTex.encoding = THREE.sRGBEncoding;
    tuftTex.anisotropy = 4;

    const p1 = new THREE.PlaneGeometry(0.8, 0.8); p1.translate(0, 0.4, 0);
    const p2 = p1.clone(); p2.rotateY(Math.PI / 2);
    const merged = new THREE.BufferGeometry();
    const pos = new Float32Array([...p1.attributes.position.array, ...p2.attributes.position.array]);
    const uv = new Float32Array([...p1.attributes.uv.array, ...p2.attributes.uv.array]);
    const nor = new Float32Array([...p1.attributes.normal.array, ...p2.attributes.normal.array]);
    const idx = [...p1.index.array, ...Array.from(p2.index.array, (v) => v + 4)];
    merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    merged.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    merged.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    merged.setIndex(idx);

    const mat = new THREE.MeshStandardMaterial({ map: tuftTex, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 1, emissive: 0x8d84b8, emissiveMap: tuftTex, emissiveIntensity: 0.55 });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uniTime;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\n vec3 ip = vec3(instanceMatrix[3][0], 0.0, instanceMatrix[3][2]);\n' +
        ' float w = sin(uTime * 1.3 + ip.x * 0.35 + ip.z * 0.25) * 0.5 + sin(uTime * 2.1 + ip.x * 0.8) * 0.15;\n' +
        ' transformed.x += w * position.y * position.y * 0.5; transformed.z += w * position.y * position.y * 0.2;');
    };
    const COUNT = 7000;
    const mesh = new THREE.InstancedMesh(merged, mat, COUNT);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pp = new THREE.Vector3(), e = new THREE.Euler();
    const ca = lin(0xcdc2f2), cb = lin(0xa6d3c4), cc = lin(0xf0e9ff), col = new THREE.Color();
    let n = 0;
    for (let tries = 0; tries < COUNT * 5 && n < COUNT; tries++) {
      const x = (Math.random() - 0.5) * 78, z = (Math.random() - 0.5) * 78;
      const h = heightAt(x, z);
      if (h < 0.55 || pathDist(x, z) < 1.2) continue;
      pp.set(x, h - 0.03, z);
      e.set(0, Math.random() * Math.PI, 0);
      q.setFromEuler(e);
      const k = 0.55 + Math.random() * 0.8;
      sc.set(k, k * (0.7 + Math.random() * 0.6), k);
      m.compose(pp, q, sc);
      mesh.setMatrixAt(n, m);
      col.copy(ca).lerp(cb, Math.random() * 0.7).lerp(cc, Math.random() * 0.4);
      mesh.setColorAt(n, col);
      n++;
    }
    mesh.count = n;
    scene.add(mesh);
  })();

  // ---- 나무 (가을빛·보랏빛, 그림자를 드리움) ----
  const trees = [];
  (function makeTrees() {
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a463f, roughness: 1 });
    const leafCols = [0xe0b04a, 0xd99a3a, 0xb7a3f0, 0x9cc7a4, 0xf0c4d8];
    let placed = 0;
    for (let t = 0; t < 600 && placed < 26; t++) {
      const x = (Math.random() - 0.5) * 64, z = (Math.random() - 0.5) * 64;
      const h = heightAt(x, z);
      if (h < 1.0 || pathDist(x, z) < 3 || Math.hypot(x, z - 6) < 6) continue;
      if (trees.some((o) => Math.hypot(o.x - x, o.z - z) < 4.5)) continue;
      const g = new THREE.Group();
      const sc = 0.9 + Math.random() * 0.8;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.25, 2.4, 7), trunkMat);
      trunk.position.y = 1.2; trunk.castShadow = true;
      g.add(trunk);
      const lc = lin(leafCols[placed % leafCols.length]);
      const leafMat = new THREE.MeshStandardMaterial({ color: lc, roughness: 0.85 });
      for (let k = 0; k < 7; k++) {
        const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75 + Math.random() * 0.5, 2), leafMat);
        b.position.set((Math.random() - 0.5) * 1.6, 2.6 + Math.random() * 1.3, (Math.random() - 0.5) * 1.6);
        b.castShadow = true;
        g.add(b);
      }
      g.scale.setScalar(sc);
      g.position.set(x, h - 0.05, z);
      g.rotation.y = Math.random() * Math.PI * 2;
      scene.add(g);
      trees.push({ x, z, r: 0.7 * sc });
      placed++;
    }
  })();

  // ---- 길 끝의 등대 ----
  (function lighthouse() {
    const end = PATH[PATH.length - 1];
    const x = end.x + 2, z = end.y - 1, h = heightAt(x, z);
    const g = new THREE.Group();
    const white = new THREE.MeshStandardMaterial({ color: 0xf4efff, roughness: 0.8 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.85, 5, 16), white);
    body.position.y = 2.5; body.castShadow = true;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.7, 0.6, 16), new THREE.MeshStandardMaterial({ color: 0xe58aa6, roughness: 0.8 }));
    band.position.y = 3.2;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.8, 0.9, 16), new THREE.MeshStandardMaterial({ color: 0x6e63a8, roughness: 0.7 }));
    cap.position.y = 6.0;
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), new THREE.MeshBasicMaterial({ color: 0xfff1c0 }));
    lamp.position.y = 5.3;
    g.add(body, band, cap, lamp);
    const lg = glowSprite(0xffe2a0, 6, 0.8); lg.position.y = 5.3; g.add(lg);
    const pl = new THREE.PointLight(0xffd99a, 1.4, 16, 2); pl.position.y = 5.3; g.add(pl);
    g.position.set(x, h - 0.1, z);
    scene.add(g);
    trees.push({ x, z, r: 1.1 });
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

  // ---- 동자승 (8방향으로 보이는 그림) ----
  function makeKid() {
    const S = 256;
    const cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const g = cv.getContext('2d');
    const tex = new THREE.CanvasTexture(cv);
    tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = 4;
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
    const SK = ['#fff1e6', '#ffdcc4', '#f2bfa3'], RB = ['#d3d6e6', '#b3b8d0', '#8f95b4'];

    // side: -1(화면 왼쪽을 봄) ~ 1(오른쪽을 봄), back: 0(정면) ~ 1(뒷모습)
    function draw(phase, walking, side, back, blink) {
      g.clearRect(0, 0, S, S);
      const sw = walking ? Math.sin(phase) : 0;
      const bob = walking ? Math.abs(Math.sin(phase)) * 6 : Math.sin(phase * 0.5) * 1.2;
      const prof = Math.min(1, Math.abs(side) * 1.25);          // 옆모습 정도
      const dir = side >= 0 ? 1 : -1;
      const showBack = back > 0.5;
      // 발: 정면/뒷면은 위아래로, 옆모습은 앞뒤로 엇갈림
      const fx = (1 - prof) * 20, stride = sw * (8 + prof * 12);
      const lift1 = Math.max(0, -sw) * 8, lift2 = Math.max(0, sw) * 8;
      blob(128 - fx + stride * prof * dir, 241 - lift1, 18 - prof * 3, 9, '#ffffff', '#f4f1ea', '#d0c9bd');
      blob(128 + fx - stride * prof * dir, 241 - lift2, 18 - prof * 3, 9, '#ffffff', '#f4f1ea', '#d0c9bd');
      // 승복
      const by = 196 - bob * 0.6;
      const w = 1 - prof * 0.18;
      const gr = g.createLinearGradient(0, by - 50, 0, by + 48);
      gr.addColorStop(0, RB[0]); gr.addColorStop(1, RB[2]);
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(128 - 30 * w, by - 40); g.quadraticCurveTo(128, by - 54, 128 + 30 * w, by - 40);
      g.quadraticCurveTo(128 + 48 * w, by + 10, 128 + 42 * w, by + 44);
      g.quadraticCurveTo(128, by + 54, 128 - 42 * w, by + 44);
      g.quadraticCurveTo(128 - 48 * w, by + 10, 128 - 30 * w, by - 40);
      g.fill();
      if (!showBack) {
        g.strokeStyle = RB[2]; g.lineWidth = 3; g.lineCap = 'round';
        const cx = 128 + side * 18;
        g.beginPath(); g.moveTo(cx - 16 * w, by - 44); g.lineTo(cx, by - 8); g.lineTo(cx + 16 * w, by - 44); g.stroke();
      }
      g.strokeStyle = '#c9a07a'; g.lineWidth = 6;
      g.beginPath(); g.moveTo(128 - 38 * w, by + 12); g.quadraticCurveTo(128, by + 22, 128 + 38 * w, by + 12); g.stroke();
      // 팔
      if (walking) {
        if (prof > 0.6) {               // 옆모습: 앞뒤로 흔들리는 한쪽 팔
          blob(128 - sw * 16 * dir, by - 4, 12, 22, RB[0], RB[1], RB[2]);
          blob(128 - sw * 22 * dir, by + 18, 8, 8, SK[0], SK[1], SK[2]);
        } else {
          blob(128 - 38 * w - sw * 4, by - 4 + sw * 6, 12, 22, RB[0], RB[1], RB[2]);
          blob(128 + 38 * w + sw * 4, by - 4 - sw * 6, 12, 22, RB[0], RB[1], RB[2]);
          blob(128 - 40 * w - sw * 5, by + 18 + sw * 6, 8, 8, SK[0], SK[1], SK[2]);
          blob(128 + 40 * w + sw * 5, by + 18 - sw * 6, 8, 8, SK[0], SK[1], SK[2]);
        }
      } else if (!showBack) {
        blob(108 + side * 12, by - 6, 14, 22, RB[0], RB[1], RB[2]);
        blob(148 + side * 12, by - 6, 14, 22, RB[0], RB[1], RB[2]);
        blob(128 + side * 20, by - 14, 10, 12, SK[0], SK[1], SK[2]);
      } else {
        blob(92, by - 2, 12, 22, RB[0], RB[1], RB[2]);
        blob(164, by - 2, 12, 22, RB[0], RB[1], RB[2]);
      }
      // 머리와 귀
      const hy = 104 - bob;
      const earL = 62 + side * 26, earR = 194 + side * 26;
      if (showBack || side < 0.55) blob(earL, hy + 4, 11, 14, SK[0], SK[1], SK[2]);
      if (showBack || side > -0.55) blob(earR, hy + 4, 11, 14, SK[0], SK[1], SK[2]);
      blob(128, hy, 68, 64, SK[0], SK[1], SK[2]);
      g.fillStyle = 'rgba(255,255,255,0.5)';
      g.beginPath(); g.ellipse(104 - side * 10, hy - 36, 20, 9, -0.5, 0, Math.PI * 2); g.fill();
      if (showBack) {
        g.fillStyle = 'rgba(200,150,130,0.25)';
        g.beginPath(); g.ellipse(128, hy + 46, 40, 10, 0, 0, Math.PI * 2); g.fill();
        return void (tex.needsUpdate = true);
      }
      // 얼굴: 보는 방향으로 이목구비가 이동, 옆모습에서는 눈 하나만
      const ex = side * 30, ey = hy + 10;
      const eyes = prof > 0.8 ? [dir * 40] : [-24 + ex * 0.9, 24 + ex * 0.9];
      soft(128 + ex - 38 * (1 - prof), hy + 24, 16, 'rgba(255,150,170,0.7)');
      if (prof < 0.8) soft(128 + ex + 38 * (1 - prof), hy + 24, 16, 'rgba(255,150,170,0.7)');
      g.fillStyle = '#3a2a3e'; g.strokeStyle = '#3a2a3e'; g.lineWidth = 3.5;
      eyes.forEach((ox) => {
        if (blink > 0.5) { g.beginPath(); g.arc(128 + ox, ey, 7, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke(); }
        else {
          g.fillStyle = '#3a2a3e'; g.beginPath(); g.ellipse(128 + ox, ey, 6.5, 8, 0, 0, Math.PI * 2); g.fill();
          g.fillStyle = '#ffffff'; g.beginPath(); g.arc(128 + ox - 2, ey - 3, 2.2, 0, Math.PI * 2); g.fill();
        }
      });
      if (prof > 0.8) blob(128 + dir * 66, hy + 18, 6, 6, SK[0], SK[1], SK[2]);   // 옆모습 코
      g.strokeStyle = '#b4707a'; g.lineWidth = 3;
      g.beginPath(); g.arc(128 + ex * (prof > 0.8 ? 1.5 : 1), hy + 30, prof > 0.8 ? 6 : 9, 0.2 * Math.PI, 0.8 * Math.PI); g.stroke();
      tex.needsUpdate = true;
    }

    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, color: 0xe6e2ff });
    const sprite = new THREE.Sprite(mat);
    const H = 1.25;
    sprite.scale.set(H * 1.22, H * 1.22, 1);
    sprite.center.set(0.5, 8 / 256);                 // 발바닥이 기준점
    // 발밑 그림자
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.32, 24), new THREE.MeshBasicMaterial({ map: radialTex([[0, 'rgba(20,10,40,0.55)'], [1, 'rgba(20,10,40,0)']]), transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    const hit = new THREE.Mesh(new THREE.SphereGeometry(0.75, 8, 6), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    draw(0, false, 0, 0, 0);
    return { sprite, shadow, hit, draw, H };
  }
  const kid = makeKid();
  scene.add(kid.sprite, kid.shadow, kid.hit);

  const me = {
    pos: new THREE.Vector3(0, 0, 6),
    heading: 0,                     // 바라보는 방향 (0 = +z 카메라 쪽, π = -z 길 쪽)
    target: null, phase: 0, blinkT: 3, blink: 0, acc: 0, jump: 0,
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
    me.target = target;
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
        me.heading = angleLerp(me.heading, want, Math.min(1, dt * 8));
        const st = Math.min(dist, SPEED * dt);
        const nx = me.pos.x + Math.sin(me.heading) * st, nz = me.pos.z + Math.cos(me.heading) * st;
        const blocked = heightAt(nx, nz) < WALKABLE || trees.some((o) => Math.hypot(o.x - nx, o.z - nz) < o.r);
        if (blocked) me.target = null;
        else { me.pos.x = nx; me.pos.z = nz; walking = true; }
      }
    }
    me.pos.y = heightAt(me.pos.x, me.pos.z);
    me.phase += dt * (walking ? 9 : 2.2);
    if (me.jump > 0) me.jump = Math.max(0, me.jump - dt);
    const jumpY = me.jump > 0 ? Math.sin((1 - me.jump / 0.5) * Math.PI) * 0.45 : 0;
    kid.sprite.position.set(me.pos.x, me.pos.y + jumpY, me.pos.z);
    kid.shadow.position.set(me.pos.x, me.pos.y + 0.03, me.pos.z);
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
    if (me.acc > 1 / 24 || walking !== walkingPrev) {
      me.acc = 0;
      kid.draw(me.phase, walking, side, away > 0.25 ? 1 : 0, me.blink);
    }
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
})();

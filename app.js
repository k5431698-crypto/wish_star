// 밤하늘에 은은하게 반짝이는 별을 뿌린다
(function makeSky() {
  const sky = document.getElementById('sky');
  const COUNT = 70;
  for (let i = 0; i < COUNT; i++) {
    const star = document.createElement('span');
    star.className = 's';
    const size = Math.random() * 2.2 + 0.8; // 0.8 ~ 3px
    star.style.width = star.style.height = size + 'px';
    star.style.left = Math.random() * 100 + '%';
    star.style.top = Math.random() * 100 + '%';
    star.style.setProperty('--dur', (3 + Math.random() * 4).toFixed(1) + 's');
    star.style.setProperty('--delay', (Math.random() * 5).toFixed(1) + 's');
    sky.appendChild(star);
  }
})();

// 소원 입력창: 글자 수 표시, 빈 글이면 버튼 비활성화
const form = document.getElementById('wishForm');
const wishText = document.getElementById('wishText');
const wishBtn = document.getElementById('wishBtn');
const countEl = document.getElementById('count');
const toast = document.getElementById('toast');

wishText.addEventListener('input', () => {
  countEl.textContent = wishText.value.length;
  toast.textContent = ''; // 고쳐 쓰기 시작하면 이전 안내는 지운다
  wishBtn.disabled = wishText.value.trim().length === 0;
});

// 소원 저장 (이 기기의 브라우저 localStorage에만 저장)
const STORE_KEY = 'wishStar.wishes';

function loadWishes() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch (err) {
    return [];
  }
}

function saveWish(text) {
  const wish = { id: Date.now().toString(36), text, at: Date.now() };
  try {
    const list = loadWishes();
    list.unshift(wish);
    localStorage.setItem(STORE_KEY, JSON.stringify(list.slice(0, 100)));
    return true;
  } catch (err) {
    return false; // 사생활 보호 모드 등으로 저장이 막힌 경우
  }
}

function formatDate(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}

// 내 소원 보기
const mineSheet = document.getElementById('mineSheet');
const mineList = document.getElementById('mineList');
const mineEmpty = document.getElementById('mineEmpty');
const openMine = document.getElementById('openMine');

function renderMine() {
  const list = loadWishes();
  mineList.replaceChildren();
  mineEmpty.hidden = list.length > 0;
  for (const w of list) {
    const li = document.createElement('li');
    li.className = 'wish-item';
    const p = document.createElement('p');
    p.className = 'wish-text';
    p.textContent = w.text; // textContent로 넣어 입력한 글이 코드로 실행되지 않게 함
    const meta = document.createElement('span');
    meta.className = 'wish-meta';
    meta.textContent = `${formatDate(w.at)} · 아직 도착한 답글이 없어요`;
    li.append(p, meta);
    mineList.appendChild(li);
  }
  openMine.textContent = list.length ? `내 소원 보기 (${list.length})` : '내 소원 보기';
}

openMine.addEventListener('click', () => {
  renderMine();
  mineSheet.hidden = false;
  document.body.style.overflow = 'hidden';
});
document.getElementById('closeMine').addEventListener('click', () => {
  mineSheet.hidden = true;
  document.body.style.overflow = '';
});

renderMine();

// 마음이 힘들 때 도움받을 곳 안내
const helpSheet = document.getElementById('helpSheet');

function openHelpSheet() {
  helpSheet.hidden = false;
  document.body.style.overflow = 'hidden';
}
function closeHelpSheet() {
  helpSheet.hidden = true;
  document.body.style.overflow = '';
}
document.getElementById('openHelp').addEventListener('click', openHelpSheet);
document.getElementById('closeHelp').addEventListener('click', closeHelpSheet);

// 많이 힘든 마음이 담긴 말인지 살펴본다. 소원은 막지 않고, 따뜻한 안내만 건넨다.
const DISTRESS_WORDS = [
  '죽고 싶', '죽고싶', '죽을래', '죽어버리', '죽어 버리', '자살', '자해',
  '사라지고 싶', '사라지고싶', '살기 싫', '살기싫', '살고 싶지 않', '살고싶지 않',
  '목숨을 끊', '끝내고 싶', '끝내고싶', '없어지고 싶', '없어지고싶',
];

function seemsDistressed(text) {
  const t = text.replace(/\s+/g, ' ');
  return DISTRESS_WORDS.some((w) => t.includes(w));
}

// 글 걸러내기: 개인정보와 거친 말을 보내기 전에 부드럽게 알려 준다.
// (브라우저에서만 하는 1차 확인이라 완벽하지 않다. 2단계에서는 서버에서도 확인해야 한다.)
const BAD_WORDS = ['시발', '씨발', '씨바', '병신', '개새끼', '좆', '지랄', '느금', '섹스', '야동'];

function checkWish(text) {
  if (/[\w.+-]+@[\w-]+\.[\w.-]+/.test(text)) {
    return '이메일 주소가 들어 있는 것 같아요. 나를 알 수 있는 정보는 지우고 다시 적어 주세요.';
  }
  if (/(?:\d[\s.\-]*){9,}/.test(text)) {
    return '전화번호나 번호 같은 숫자가 길게 들어 있어요. 나를 알 수 있는 정보는 지우고 다시 적어 주세요.';
  }
  if (/(https?:\/\/|www\.)\S+|\b[\w-]+\.(com|net|kr|org|io|me)\b/i.test(text)) {
    return '인터넷 주소(링크)는 소원에 넣을 수 없어요. 지우고 다시 적어 주세요.';
  }
  const compact = text.replace(/[\s.\-_*]/g, '');
  if (BAD_WORDS.some((w) => compact.includes(w))) {
    return '별에게는 따뜻한 말을 건네 주세요. 거친 말은 지우고 다시 적어 주세요.';
  }
  return null;
}

const wishStar = document.getElementById('wishStar');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let sending = false;

// 소원이 별빛 알갱이가 되어 위의 별로 올라간다
function sendLight(fromRect, toRect) {
  const PARTICLES = 14;
  const startX = fromRect.left + fromRect.width / 2;
  const startY = fromRect.top + fromRect.height / 2;
  const endX = toRect.left + toRect.width / 2;
  const endY = toRect.top + toRect.height / 2;

  for (let i = 0; i < PARTICLES; i++) {
    const dot = document.createElement('span');
    dot.className = 'light';
    const size = 5 + Math.random() * 6;
    dot.style.width = dot.style.height = size + 'px';
    document.body.appendChild(dot);

    const sx = startX + (Math.random() - 0.5) * fromRect.width * 0.8;
    const sy = startY + (Math.random() - 0.5) * fromRect.height * 0.6;
    const drift = (Math.random() - 0.5) * 90;
    const midX = (sx + endX) / 2 + drift;
    const midY = (sy + endY) / 2;
    const delay = Math.random() * 500;

    dot.animate(
      [
        { transform: `translate(${sx}px, ${sy}px) scale(0.6)`, opacity: 0 },
        { transform: `translate(${sx}px, ${sy - 10}px) scale(1)`, opacity: 1, offset: 0.15 },
        { transform: `translate(${midX}px, ${midY}px) scale(1)`, opacity: 0.95, offset: 0.6 },
        { transform: `translate(${endX}px, ${endY}px) scale(0.3)`, opacity: 0 },
      ],
      { duration: 1900, delay, easing: 'ease-in-out', fill: 'both' }
    ).finished.then(() => dot.remove());
  }
}

// 별이 한 번 환하게 반응한다
function flashStar() {
  wishStar.animate(
    [
      { filter: 'drop-shadow(0 0 14px rgba(255,247,224,0.6)) brightness(1)' },
      { filter: 'drop-shadow(0 0 34px rgba(255,247,224,1)) brightness(1.5)', offset: 0.5 },
      { filter: 'drop-shadow(0 0 14px rgba(255,247,224,0.6)) brightness(1)' },
    ],
    { duration: 1600, easing: 'ease-in-out' }
  );
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = wishText.value.trim();
  if (!text || sending) return;

  const problem = checkWish(text);
  if (problem) {
    toast.textContent = problem;
    return; // 글은 그대로 두어서 고쳐 쓸 수 있게 한다
  }

  sending = true;
  wishBtn.disabled = true;
  toast.textContent = '';

  const fromRect = wishText.getBoundingClientRect();
  const toRect = wishStar.getBoundingClientRect();

  const distressed = seemsDistressed(text);
  const saved = saveWish(text);
  renderMine();
  wishText.value = '';
  countEl.textContent = '0';
  wishText.blur();

  if (!reduceMotion) {
    sendLight(fromRect, toRect);
    setTimeout(flashStar, 1500);
  }

  setTimeout(() => {
    toast.textContent = saved
      ? '소원이 별에게 닿았어요. 오늘 밤도 편안하길 바라요.'
      : '소원이 별에게 닿았어요. (이 브라우저에서는 소원을 저장하지 못했어요)';
    sending = false;
    if (distressed) openHelpSheet();
  }, reduceMotion ? 200 : 2600);
});

// 별 터치 놀이: 밤하늘 작은 별을 톡 건드리면 반짝, 10번 모으면 별똥별이 되어 날아감
const HIT_RADIUS = 26;     // 손가락으로 누를 수 있는 범위(px)
const TAPS_TO_METEOR = 10; // 별똥별이 되는 터치 횟수

function nearestSkyStar(x, y) {
  let best = null;
  let bestDist = HIT_RADIUS;
  document.querySelectorAll('#sky .s').forEach((el) => {
    if (el.style.visibility === 'hidden') return;
    const r = el.getBoundingClientRect();
    const d = Math.hypot(r.left + r.width / 2 - x, r.top + r.height / 2 - y);
    if (d < bestDist) { best = el; bestDist = d; }
  });
  return best;
}

function sparkle(el) {
  if (reduceMotion) return;
  el.animate(
    [
      { transform: 'scale(1)', opacity: 0.9 },
      { transform: 'scale(3.2)', opacity: 1, offset: 0.4 },
      { transform: 'scale(1)', opacity: 0.9 },
    ],
    { duration: 700, easing: 'ease-out' }
  );
}

function launchMeteor(el) {
  const r = el.getBoundingClientRect();
  const x = r.left + r.width / 2;
  const y = r.top + r.height / 2;
  el.style.visibility = 'hidden';
  el.dataset.taps = '0';
  if (!reduceMotion) {
    const m = document.createElement('span');
    m.className = 'meteor';
    m.style.left = x + 'px';
    m.style.top = y + 'px';
    document.body.appendChild(m);
    const dx = -(window.innerWidth * 0.7);
    const dy = window.innerHeight * 0.45;
    m.animate(
      [
        { transform: 'translate(0,0) rotate(-32deg)', opacity: 0 },
        { opacity: 1, offset: 0.15 },
        { transform: `translate(${dx}px,${dy}px) rotate(-32deg)`, opacity: 0 },
      ],
      { duration: 1400, easing: 'ease-in' }
    ).onfinish = () => m.remove();
  }
  // 잠시 뒤 새 자리에 다시 떠오름
  setTimeout(() => {
    el.style.left = Math.random() * 100 + '%';
    el.style.top = Math.random() * 100 + '%';
    el.style.visibility = '';
  }, 6000);
}

// 큰 별: 터치할수록 점점 빛나고, 가만두면 천천히 가라앉음
const MAX_GLOW = 10;
let glow = 0;
// 큰 별 색: 누를 때마다 다음 색으로 (처음 색은 원래의 따뜻한 노랑)
const STAR_COLORS = [
  { hex: '#fff7e0', rgb: '255,247,224' },
  { hex: '#ffd1e3', rgb: '255,209,227' },
  { hex: '#cfe8ff', rgb: '207,232,255' },
  { hex: '#d9ffe0', rgb: '217,255,224' },
  { hex: '#e4d4ff', rgb: '228,212,255' },
];
let colorIdx = 0;
function nextStarColor() {
  colorIdx = (colorIdx + 1) % STAR_COLORS.length;
  const c = STAR_COLORS[colorIdx].hex;
  wishStar.querySelectorAll('stop').forEach((el) => el.setAttribute('stop-color', c));
  wishStar.querySelector('polygon').setAttribute('fill', c);
}
function paintGlow() {
  const t = glow / MAX_GLOW;
  const blur = 14 + t * 36;
  const alpha = 0.6 + t * 0.4;
  wishStar.style.filter =
    `drop-shadow(0 0 ${blur}px rgba(${STAR_COLORS[colorIdx].rgb},${alpha})) brightness(${1 + t * 0.6})`;
}
setInterval(() => {
  if (glow > 0) { glow -= 1; paintGlow(); }
}, 4000);

document.addEventListener('pointerdown', (e) => {
  if (e.target.closest('button, a, textarea, input, label, dialog, [role="dialog"]')) return;
  if (e.target.closest('#wishStar')) {
    if (glow < MAX_GLOW) glow += 1;
    nextStarColor();
    paintGlow();
    return;
  }
  const el = nearestSkyStar(e.clientX, e.clientY);
  if (!el) return;
  const taps = (Number(el.dataset.taps) || 0) + 1;
  el.dataset.taps = String(taps);
  if (taps >= TAPS_TO_METEOR) launchMeteor(el);
  else sparkle(el);
});

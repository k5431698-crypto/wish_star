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
  sending = true;
  wishBtn.disabled = true;
  toast.textContent = '';

  const fromRect = wishText.getBoundingClientRect();
  const toRect = wishStar.getBoundingClientRect();

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
  }, reduceMotion ? 200 : 2600);
});

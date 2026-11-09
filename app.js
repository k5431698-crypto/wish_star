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

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = wishText.value.trim();
  if (!text) return;
  // 다음 단계에서 별빛 애니메이션과 저장이 여기에 들어간다
  toast.textContent = '소원이 별에게 닿고 있어요…';
  wishText.value = '';
  countEl.textContent = '0';
  wishBtn.disabled = true;
});

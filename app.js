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

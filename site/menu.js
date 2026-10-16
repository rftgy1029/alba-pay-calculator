// 왼쪽 메뉴(줄 세 개 버튼). <dialog>로 열어서 Esc·포커스 가두기·닫은 뒤 포커스 복귀를 브라우저에 맡긴다.
const menu = document.getElementById('site-menu');
const openButton = document.getElementById('menu-open');

openButton.addEventListener('click', () => {
  menu.showModal();
  openButton.setAttribute('aria-expanded', 'true');
});

menu.querySelector('.drawer-close').addEventListener('click', () => menu.close());

// 메뉴 바깥(어두운 배경)을 누르면 닫는다. 메뉴 안쪽은 .drawer-body가 꽉 채우고 있어서 대상이 dialog 자신일 때만 바깥이다.
menu.addEventListener('click', (event) => {
  if (event.target === menu) menu.close();
});

menu.addEventListener('close', () => {
  openButton.setAttribute('aria-expanded', 'false');
});

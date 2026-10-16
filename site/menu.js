// 왼쪽 메뉴(줄 세 개 버튼). <dialog>로 열어서 Esc·포커스 가두기·닫은 뒤 포커스 복귀를 브라우저에 맡긴다.
const menu = document.getElementById('site-menu');
const openButton = document.getElementById('menu-open');

openButton.addEventListener('click', () => {
  menu.showModal();
  openButton.setAttribute('aria-expanded', 'true');
});

menu.querySelector('.drawer-close').addEventListener('click', () => menu.close());

// 메뉴 바깥(어두운 배경)을 눌렀다가 바깥에서 뗐을 때만 닫는다.
// 메뉴 안쪽은 .drawer-body가 꽉 채우고 있어서 대상이 dialog 자신일 때만 바깥이다.
// 안에서 누르고 바깥에서 떼거나 그 반대여도 click이 dialog에 오므로, 누른 곳과 뗀 곳을 따로 확인한다.
let pressedOutside = false;
let releasedOutside = false;
menu.addEventListener('pointerdown', (event) => {
  pressedOutside = event.target === menu;
});
menu.addEventListener('pointerup', (event) => {
  releasedOutside = event.target === menu;
});
menu.addEventListener('click', (event) => {
  if (event.target === menu && pressedOutside && releasedOutside) menu.close();
});

menu.addEventListener('close', () => {
  openButton.setAttribute('aria-expanded', 'false');
});

// 메뉴 링크로 다른 페이지에 갔다가 뒤로 오면 열린 채로 되살아나지 않게(뒤로 가기 캐시), 떠날 때 닫아 둔다.
addEventListener('pagehide', () => {
  if (menu.open) menu.close();
});

// 라이트/다크 테마 전환. 처음엔 기기 설정을 따르고, 한 번 고르면 그 선택을 기억한다.
// (저장된 값은 index.html <head>의 짧은 스크립트가 화면을 그리기 전에 먼저 적용한다.)
const root = document.documentElement;
const button = document.getElementById('theme-toggle');
const systemDark = matchMedia('(prefers-color-scheme: dark)');
const themeColor = document.querySelector('meta[name="theme-color"]');

const currentTheme = () => root.dataset.theme || (systemDark.matches ? 'dark' : 'light');

function updateUi() {
  const theme = currentTheme();
  button.setAttribute('aria-label', theme === 'dark' ? '라이트 모드로 바꾸기' : '다크 모드로 바꾸기');
  themeColor.content = theme === 'dark' ? '#0f1312' : '#f5f7f6';
}

button.addEventListener('click', () => {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  root.dataset.theme = next;
  try {
    localStorage.setItem('theme', next);
  } catch {
    // 저장이 막힌 브라우저에서도 이번 화면에서는 바뀐다.
  }
  updateUi();
});

// 직접 고른 적이 없으면 기기 설정이 바뀔 때 따라간다.
systemDark.addEventListener('change', updateUi);

updateUi();

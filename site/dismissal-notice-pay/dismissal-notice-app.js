// 해고예고수당 계산기 화면: 입력을 읽어 dismissal-notice.js로 계산하고 계산 과정을 그린다.
// 입력값은 주소(?s=2027-03-02&n=2027-10-15&e=2027-10-15...)에도 반영해서 링크로 공유할 수 있게 한다.
import { YEARS, defaultYear, formatHours, formatWon } from '../calc.js';
import { LEAVE_TYPES, NOTICE_DAYS, NOTICE_PAY_DAYS, calculateDismissalNotice } from '../dismissal-notice.js';
import { formatDate, formatDateKo, formatWonDetail, parseDate } from '../severance.js';

const $ = (id) => document.getElementById(id);
const form = $('calc');

const HOURS_PATTERN = /^\d{0,2}(\.\d?)?$/;
const DAILY_PATTERN = /^\d?(\.\d{0,2})?$/;

const state = readStateFromUrl();
let lastValidHours = '';
let lastValidDaily = '';

writeStateToForm();
render();

// 저장된 선택을 먼저 그린 다음 애니메이션을 켠다 (처음 열 때 선택 표시가 미끄러지지 않도록).
void form.offsetWidth;
document.body.classList.add('js-ready');

form.addEventListener('submit', (event) => event.preventDefault());

form.addEventListener('input', (event) => {
  const target = event.target;

  if (target.id === 'start') {
    state.startDate = target.value;
  } else if (target.id === 'notice') {
    state.noticeDate = target.value;
  } else if (target.id === 'last') {
    state.lastWorkDate = target.value;
  } else if (target.id === 'hours') {
    if (!HOURS_PATTERN.test(target.value)) target.value = lastValidHours;
    lastValidHours = target.value;
    state.weeklyHours = parseHours(target.value);
  } else if (target.id === 'daily') {
    if (!DAILY_PATTERN.test(target.value)) target.value = lastValidDaily;
    lastValidDaily = target.value;
    state.dailyHours = parseDaily(target.value);
  } else if (target.id === 'wage') {
    target.value = target.value.replace(/\D/g, '').slice(0, 7);
    state.hourlyWage = Number(target.value) || 0;
  } else if (target.name === 'type') {
    state.leaveType = target.value;
  } else if (target.name === 'size') {
    state.smallBusiness = target.value === 'small';
  } else if (target.id === 'disaster') {
    state.disaster = target.checked;
  } else if (target.id === 'misconduct') {
    state.misconduct = target.checked;
  }

  syncUrl();
  render();
});

$('min-wage').addEventListener('click', () => {
  state.hourlyWage = minimumWageFor(state.lastWorkDate);
  $('wage').value = String(state.hourlyWage);
  syncUrl();
  render();
});

$('share').addEventListener('click', share);

function readStateFromUrl() {
  const params = new URLSearchParams(location.search);
  const today = new Date();
  // 기본값: 오늘 "내일부터 나오지 마"라는 말을 듣고 바로 해고된 경우로 보여 준다.
  const todayText = formatDate(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) / 86400000);
  const lastWorkDate = validDate(params.get('e')) ?? todayText;
  const wage = Number(params.get('w'));
  const type = params.get('t');

  return {
    leaveType: Object.hasOwn(LEAVE_TYPES, type) ? type : 'dismissal',
    startDate: validDate(params.get('s')) ?? `${Number(lastWorkDate.slice(0, 4)) - 1}-03-02`,
    noticeDate: validDate(params.get('n')) ?? lastWorkDate,
    lastWorkDate,
    weeklyHours: params.has('h') ? parseHours(params.get('h')) : 20,
    hourlyWage: Number.isInteger(wage) && wage > 0 && wage < 1e7 ? wage : minimumWageFor(lastWorkDate),
    dailyHours: params.has('d') ? parseDaily(params.get('d')) : null,
    smallBusiness: params.get('b') === '1',
    disaster: params.get('x') === '1',
    misconduct: params.get('m') === '1',
  };
}

function writeStateToForm() {
  $('start').value = state.startDate;
  $('notice').value = state.noticeDate;
  $('last').value = state.lastWorkDate;
  $('hours').value = formatHours(state.weeklyHours);
  $('wage').value = String(state.hourlyWage);
  $('daily').value = state.dailyHours === null ? '' : String(state.dailyHours);
  $('disaster').checked = state.disaster;
  $('misconduct').checked = state.misconduct;
  form.querySelector(`input[name="type"][value="${state.leaveType}"]`).checked = true;
  form.querySelector(`input[name="size"][value="${state.smallBusiness ? 'small' : 'large'}"]`).checked = true;
  lastValidHours = $('hours').value;
  lastValidDaily = $('daily').value;
}

function syncUrl() {
  const params = new URLSearchParams({
    s: state.startDate,
    n: state.noticeDate,
    e: state.lastWorkDate,
    h: formatHours(state.weeklyHours),
    w: state.hourlyWage,
  });
  if (state.leaveType !== 'dismissal') params.set('t', state.leaveType);
  if (state.dailyHours !== null) params.set('d', state.dailyHours);
  if (state.smallBusiness) params.set('b', '1');
  if (state.disaster) params.set('x', '1');
  if (state.misconduct) params.set('m', '1');
  history.replaceState(null, '', `${location.pathname}?${params}`);
}

function render() {
  const result = calculateDismissalNotice(state);
  const dismissal = state.leaveType === 'dismissal';

  $('type-hint').textContent = {
    dismissal: '회사가 내 뜻과 상관없이 일을 그만두게 한 경우예요. 해고라는 말을 쓰지 않아도 마찬가지예요.',
    expiry: '근로계약서에 정한 기간이 끝나서 그만두는 경우예요. 해고가 아니라 해고예고가 필요 없어요.',
    resignation: '내가 그만두겠다고 했거나, 회사의 권유에 동의해서 그만두는 경우(권고사직)예요.',
  }[state.leaveType];
  $('exceptions').hidden = !dismissal;
  $('daily-hint').textContent = result.valid
    ? `비워 두면 주 소정근로시간 ÷ 5 = ${formatDecimal(result.autoDailyHours)}시간으로 계산해요 (하루 8시간이 상한).`
    : '비워 두면 주 소정근로시간 ÷ 5로 계산해요 (하루 8시간이 상한).';

  if (!result.valid) {
    $('result-label').textContent = '해고예고수당 (세전)';
    $('result-amount').textContent = '-';
    $('result-sub').textContent = result.error;
    $('steps-body').replaceChildren();
    $('notes').replaceChildren();
    return;
  }

  $('result-label').textContent = resultLabel(result);
  $('result-amount').textContent = formatWon(result.pay);
  $('result-sub').textContent = resultSub(result);

  const rows = [
    [`근무 기간 (${formatShortYear(state.startDate)}~)`, `${result.serviceDays.toLocaleString('ko-KR')}일`],
    [`3개월 되는 날 (${formatShortYear(result.threeMonthDate)})`, result.underThreeMonths ? '못 채움' : '채움'],
    [`예고 기간 (통보 다음 날부터)`, `${result.noticeDays.toLocaleString('ko-KR')}일`],
    [`${NOTICE_DAYS}일 예고`, result.noticeKept ? '지킴' : `${result.shortBy}일 모자람`],
    [`1일 소정근로시간${result.usesCustomHours ? ' (직접 입력)' : ` (주 ${formatHours(state.weeklyHours)}시간 ÷ 5)`}`, `${formatDecimal(result.dailyHours)}시간`],
    [`1일 통상임금 (시급 × ${formatDecimal(result.dailyHours)}시간)`, formatWonDetail(result.dailyOrdinary)],
  ];
  $('steps-body').replaceChildren(
    ...rows.map((cells) => tableRow(cells)),
    tableRow([`30일분 = 1일 통상임금 × ${NOTICE_PAY_DAYS}일`, formatWon(result.payIfOwed)], 'total'),
  );

  $('notes').replaceChildren(
    ...notes(result).map((text) => {
      const li = document.createElement('li');
      li.textContent = text;
      return li;
    }),
  );
}

function resultLabel(result) {
  if (result.owed) return '받을 해고예고수당 (세전)';
  if (result.exception === 'expiry' || result.exception === 'resignation') return '해고가 아니라 대상이 아니에요';
  if (result.exception !== null) return '해고예고 예외에 해당해요';
  return '30일 전에 예고해서 수당은 없어요';
}

function resultSub(result) {
  switch (result.exception) {
    case 'expiry':
      return '계약기간이 끝나 근로관계가 자동으로 끝나는 경우는 해고예고 대상이 아니에요.';
    case 'resignation':
      return '스스로 그만두거나 권고사직에 동의한 경우는 해고가 아니에요.';
    case 'underThreeMonths':
      return `계속 근로기간이 3개월 미만이에요. ${formatDateKo(parseDate(result.threeMonthDate))}까지 일했다면 대상이에요.`;
    case 'disaster':
      return '천재·사변 등으로 사업을 계속할 수 없는 경우는 예외예요(제26조 제2호).';
    case 'misconduct':
      return '근로자의 고의로 시행규칙 별표 1의 사유에 해당하면 예외예요(제26조 제3호).';
    default:
      break;
  }
  if (result.noticeKept) {
    return `${result.noticeDays}일 전에 알렸어요. 해고일(${formatDateKo(parseDate(result.retireDate))})까지 일한 날의 임금은 따로 받아요.`;
  }
  if (result.noticeDays === 0) return '예고 없이 바로 해고돼서 30일분 통상임금을 받아요.';
  return `${result.noticeDays}일 전에 알려서 ${result.shortBy}일이 모자라요. 모자란 날만이 아니라 30일분 전부예요.`;
}

function notes(result) {
  const list = [];
  if (!result.owed && result.payIfOwed > 0 && result.exception !== 'expiry' && result.exception !== 'resignation') {
    list.push(`예외가 아니고 예고도 없었다면 ${formatWon(result.payIfOwed)}이에요. 계산 과정은 참고로 보여 드려요.`);
  }
  if (result.owed) {
    list.push(
      `30일 예고를 지키려면 회사는 늦어도 ${formatDateKo(parseDate(result.latestNoticeDate))}까지 알렸어야 해요. ` +
        '예고 기간은 통보한 날을 빼고 다음 날부터 달력 날짜로 세요(고용노동부 근기 68207-1346).',
    );
    list.push('고용노동부는 해고예고수당을 퇴직 후 14일 안이 아니라 해고와 동시에 줘야 한다고 안내해요.');
  }
  if (result.exception === 'resignation') {
    list.push('회사가 정한 날짜보다 앞당겨 일방적으로 퇴직 처리했다면 해고로 볼 수 있어요(근로기준정책과-5016).');
  }
  if (result.exception === 'expiry') {
    list.push('계약이 여러 번 갱신돼 기간이 형식에 불과했다면 계약 만료가 아니라 해고로 볼 수 있어요.');
  }
  if (result.isDismissal && result.smallBusiness) {
    list.push('5명 미만 사업장에도 해고예고는 똑같이 적용돼요. 다만 해고 사유 서면 통지와 부당해고 구제신청 규정은 적용되지 않아요.');
  }
  if (result.isDismissal && !result.smallBusiness) {
    list.push('5명 이상 사업장은 해고 사유와 시기를 서면으로 알려야 해고가 효력이 있어요(제27조). 예고수당과는 별개예요.');
  }
  if (state.hourlyWage === 0) list.push('시급을 넣으면 금액을 계산해요.');
  const minimumWage = minimumWageFor(state.lastWorkDate);
  if (state.hourlyWage > 0 && state.hourlyWage < minimumWage) {
    list.push(`해고 연도 최저시급(${formatWon(minimumWage)})보다 낮은 시급이에요.`);
  }
  if (state.noticeDate > state.lastWorkDate) {
    list.push('마지막 근무일 뒤에 통보를 받았다면 예고가 없었던 것과 같아서 0일로 계산했어요.');
  }
  list.push(`직책수당처럼 고정으로 받는 수당이 있으면 통상임금에 들어갈 수 있어서 금액이 더 커질 수 있어요.`);
  return list;
}

async function share() {
  syncUrl();
  const url = location.href;
  const text = `${$('result-label').textContent}: ${$('result-amount').textContent} (해고예고수당 계산기)`;

  if (navigator.share && matchMedia('(pointer: coarse)').matches) {
    try {
      await navigator.share({ title: document.title, text, url });
    } catch {
      // 사용자가 공유 창을 닫은 경우
    }
    return;
  }

  try {
    await navigator.clipboard.writeText(url);
    showToast('링크를 복사했어요. 친구에게 붙여 넣어 보내 보세요.');
  } catch {
    showToast('주소창의 링크를 복사해서 공유해 주세요.');
  }
}

let toastTimer;
function showToast(message) {
  const toast = $('toast');
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.hidden = true;
  }, 2500);
}

function tableRow(cells, className) {
  const tr = document.createElement('tr');
  if (className) tr.className = className;
  for (const text of cells) {
    const td = document.createElement('td');
    td.textContent = text;
    tr.append(td);
  }
  return tr;
}

/** 마지막 근무일이 속한 연도의 최저시급. 표에 없는 연도면 가장 가까운 연도. */
function minimumWageFor(dateText) {
  const year = Number(String(dateText).slice(0, 4));
  return YEARS[defaultYear(new Date(Number.isFinite(year) ? year : new Date().getFullYear(), 0, 1))].minimumWage;
}

/** '2027-10-01' → '27.10.1.' (좁은 화면에서도 한 줄에 들어가게 짧게) */
function formatShortYear(dateText) {
  const [year, month, day] = dateText.split('-').map(Number);
  return `${String(year).slice(2)}.${month}.${day}.`;
}

function validDate(text) {
  return text !== null && parseDate(text) !== null ? text : null;
}

/** 시간을 소수 둘째 자리까지 (4.8, 3.75). */
function formatDecimal(value) {
  return String(Math.round(value * 100) / 100);
}

/** 0~68시간. "20." 처럼 입력 중인 값도 20으로 읽는다. */
function parseHours(text) {
  const value = Number.parseFloat(String(text));
  return Number.isFinite(value) ? Math.min(Math.max(value, 0), 68) : 0;
}

/** 1일 소정근로시간 0~8시간. 비어 있으면 null(자동 계산). */
function parseDaily(text) {
  const value = Number.parseFloat(String(text));
  return Number.isFinite(value) && value > 0 ? Math.min(value, 8) : null;
}

// 퇴직금 계산기 화면: 입력을 읽어 severance.js로 계산하고 계산 과정을 그린다.
// 입력값은 주소(?s=2026-09-01&e=2027-12-31...)에도 반영해서 링크로 공유할 수 있게 한다.
import { YEARS, defaultYear, formatHours, formatWon } from '../calc.js';
import {
  SEVERANCE_MIN_WEEKLY_HOURS,
  calculateSeverance,
  formatDate,
  formatDateKo,
  formatWonDetail,
  parseDate,
} from '../severance.js';

const $ = (id) => document.getElementById(id);
const form = $('calc');

const HOURS_PATTERN = /^\d{0,2}(\.\d?)?$/;
const MONEY_FIELDS = { wage: 7, wages: 11, bonus: 11, leave: 11 };

const state = readStateFromUrl();
let lastValidHours = '';

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
  } else if (target.id === 'last') {
    state.lastWorkDate = target.value;
  } else if (target.id === 'hours') {
    if (!HOURS_PATTERN.test(target.value)) target.value = lastValidHours;
    lastValidHours = target.value;
    state.weeklyHours = parseHours(target.value);
  } else if (Object.hasOwn(MONEY_FIELDS, target.id)) {
    target.value = target.value.replace(/\D/g, '').slice(0, MONEY_FIELDS[target.id]);
    const amount = Number(target.value) || 0;
    if (target.id === 'wage') state.hourlyWage = amount;
    else if (target.id === 'wages') state.threeMonthWages = amount;
    else if (target.id === 'bonus') state.annualBonus = amount;
    else state.annualLeavePay = amount;
  } else if (target.name === 'mode') {
    state.wageMode = target.value;
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
  // 기본값: 오늘까지 1년 넘게 일한 경우로 보여 준다.
  const todayText = formatDate(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) / 86400000);
  const lastWorkDate = validDate(params.get('e')) ?? todayText;
  const startDate = validDate(params.get('s')) ?? `${Number(lastWorkDate.slice(0, 4)) - 2}${lastWorkDate.slice(4)}`;
  const wage = Number(params.get('w'));

  return {
    startDate: validDate(startDate) ?? `${Number(lastWorkDate.slice(0, 4)) - 2}-03-01`,
    lastWorkDate,
    weeklyHours: params.has('h') ? parseHours(params.get('h')) : 20,
    hourlyWage: isAmount(wage, 1e7) ? wage : minimumWageFor(lastWorkDate),
    wageMode: params.get('m') === 'direct' ? 'direct' : 'estimate',
    threeMonthWages: amountParam(params, 't', 1e11),
    annualBonus: amountParam(params, 'b', 1e11),
    annualLeavePay: amountParam(params, 'a', 1e11),
  };
}

function writeStateToForm() {
  $('start').value = state.startDate;
  $('last').value = state.lastWorkDate;
  $('hours').value = formatHours(state.weeklyHours);
  $('wage').value = String(state.hourlyWage);
  $('wages').value = state.threeMonthWages ? String(state.threeMonthWages) : '';
  $('bonus').value = state.annualBonus ? String(state.annualBonus) : '';
  $('leave').value = state.annualLeavePay ? String(state.annualLeavePay) : '';
  form.querySelector(`input[name="mode"][value="${state.wageMode}"]`).checked = true;
  lastValidHours = $('hours').value;
}

function syncUrl() {
  const params = new URLSearchParams({
    s: state.startDate,
    e: state.lastWorkDate,
    h: formatHours(state.weeklyHours),
    w: state.hourlyWage,
  });
  if (state.wageMode === 'direct') {
    params.set('m', 'direct');
    params.set('t', state.threeMonthWages);
  }
  if (state.annualBonus) params.set('b', state.annualBonus);
  if (state.annualLeavePay) params.set('a', state.annualLeavePay);
  history.replaceState(null, '', `${location.pathname}?${params}`);
}

function render() {
  const direct = state.wageMode === 'direct';
  $('wages-field').hidden = !direct;
  $('mode-hint').textContent = direct
    ? '급여명세서의 3개월 세전 임금을 넣어요. 시급은 1일 통상임금 비교에 써요.'
    : `시급 × 주 ${formatHours(state.weeklyHours)}시간에 주휴수당을 더한 한 주 임금으로 3개월을 추정해요.`;

  const result = calculateSeverance(state);

  if (!result.valid) {
    $('result-label').textContent = '예상 퇴직금 (세전)';
    $('result-amount').textContent = '-';
    $('result-sub').textContent = result.error;
    $('steps-body').replaceChildren();
    $('notes').replaceChildren();
    return;
  }

  $('result-label').textContent = result.eligible ? '예상 퇴직금 (세전)' : '퇴직금 대상이 아니에요';
  $('result-amount').textContent = formatWon(result.severance);
  $('result-sub').textContent = result.eligible
    ? `재직 ${result.serviceDays.toLocaleString('ko-KR')}일 · 퇴직일 ${formatDateKo(parseDate(result.retireDate))}`
    : ineligibleReason(result);

  const rows = [
    ['재직일수', `${result.serviceDays.toLocaleString('ko-KR')}일`],
    [`산정 기간 (${formatShort(result.periodStart)}~${formatShort(result.periodEnd)})`, `${result.periodDays}일`],
    [direct ? '3개월 임금' : '3개월 임금 (추정)', formatWon(result.threeMonthWages)],
  ];
  if (state.annualBonus) rows.push(['상여금 × 3/12', formatWonDetail(result.bonusAddition)]);
  if (state.annualLeavePay) rows.push(['연차수당 × 3/12', formatWonDetail(result.leaveAddition)]);
  rows.push(
    ['1일 평균임금', formatWonDetail(result.dailyAverage)],
    [`1일 통상임금 (${formatHours(result.dailyHours)}시간)`, formatWonDetail(result.dailyOrdinary)],
  );

  const applied = result.usesOrdinary ? '통상임금' : '평균임금';
  $('steps-body').replaceChildren(
    ...rows.map((cells) => tableRow(cells)),
    tableRow([`퇴직금 = ${applied} × 30 × ${result.serviceDays}/365`, formatWon(result.severanceIfEligible)], 'total'),
  );

  $('notes').replaceChildren(
    ...notes(result).map((text) => {
      const li = document.createElement('li');
      li.textContent = text;
      return li;
    }),
  );
}

function ineligibleReason(result) {
  const reasons = [];
  if (!result.enoughService) {
    reasons.push(`재직 1년이 안 돼요. ${formatDateKo(parseDate(result.oneYearDate) - 1)}까지 일하면 1년이에요`);
  }
  if (!result.enoughHours) reasons.push(`주 소정근로시간이 ${SEVERANCE_MIN_WEEKLY_HOURS}시간 미만이에요`);
  return `${reasons.join('. ')}.`;
}

function notes(result) {
  const list = [];
  if (!result.eligible) {
    list.push(`조건을 채웠다면 ${formatWon(result.severanceIfEligible)}이에요. 계산 과정은 참고로 보여 드려요.`);
  }
  if (result.eligible && result.usesOrdinary) {
    list.push(
      `1일 평균임금이 1일 통상임금보다 적어서 통상임금으로 계산했어요(근로기준법 제2조 제2항). ` +
        `평균임금으로만 계산하면 ${formatWon(result.severanceByAverage)}이에요. ` +
        '고용노동부는 통상임금으로 계산하라고 안내하지만 다르게 본 하급심 판결도 있어요.',
    );
  }
  if (state.hourlyWage === 0) {
    list.push('시급을 넣지 않아서 1일 통상임금과 비교하지 않았어요.');
  }
  const minimumWage = minimumWageFor(state.lastWorkDate);
  if (state.hourlyWage > 0 && state.hourlyWage < minimumWage) {
    list.push(`퇴직 연도 최저시급(${formatWon(minimumWage)})보다 낮은 시급이에요.`);
  }
  if (state.wageMode === 'estimate') {
    list.push('시급으로 추정한 금액이에요. 연장·야간수당이나 결근이 있었다면 3개월 임금을 직접 입력하면 더 정확해요.');
  }
  list.push('퇴직 전 3개월에 휴업, 출산휴가, 육아휴직 등 빼야 하는 기간이 있으면 금액이 달라져요.');
  return list;
}

async function share() {
  syncUrl();
  const url = location.href;
  const text = `${$('result-label').textContent}: ${$('result-amount').textContent} (퇴직금 계산기)`;

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

/** '2027-10-01' → '10.1.' (좁은 화면에서도 한 줄에 들어가게 연도는 뺀다) */
function formatShort(dateText) {
  const [, month, day] = dateText.split('-').map(Number);
  return `${month}.${day}.`;
}

function validDate(text) {
  return text !== null && parseDate(text) !== null ? text : null;
}

function isAmount(value, max) {
  return Number.isInteger(value) && value > 0 && value < max;
}

function amountParam(params, key, max) {
  const value = Number(params.get(key));
  return isAmount(value, max) ? value : 0;
}

/** 0~68시간. "20." 처럼 입력 중인 값도 20으로 읽는다. */
function parseHours(text) {
  const value = Number.parseFloat(String(text));
  return Number.isFinite(value) ? Math.min(Math.max(value, 0), 68) : 0;
}

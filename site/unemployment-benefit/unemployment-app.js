// 실업급여 계산기 화면: 입력을 읽어 unemployment.js로 계산하고 계산 과정을 그린다.
// 입력값은 주소(?s=2026-09-01&e=2027-12-31...)에도 반영해서 링크로 공유할 수 있게 한다.
import { formatHours, formatWon } from '../calc.js';
import { formatDate, formatWonDetail, parseDate } from '../severance.js';
import {
  INSURED_BRACKETS,
  MIN_UNIT_DAYS,
  SUPPORTED_UNTIL,
  UNEMPLOYMENT_RULES,
  calculateUnemployment,
} from '../unemployment.js';

const $ = (id) => document.getElementById(id);
const form = $('calc');

const HOURS_PATTERN = /^\d{0,2}(\.\d?)?$/;
const MONEY_FIELDS = { wage: 7, wages: 11, units: 4 };
const BRACKET_LABELS = ['1년 미만', '1년 이상 3년 미만', '3년 이상 5년 미만', '5년 이상 10년 미만', '10년 이상'];
const BRACKET_SHORT = ['1년 미만', '1~3년', '3~5년', '5~10년', '10년 이상'];

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
    else state.unitDays = amount;
  } else if (target.name === 'days') {
    state.workDays = Number(target.value);
  } else if (target.name === 'mode') {
    state.wageMode = target.value;
  } else if (target.name === 'unit-mode') {
    state.unitMode = target.value;
  } else if (target.name === 'period') {
    state.insuredYears = target.value === 'auto' ? null : Number(target.value);
  } else if (target.id === 'over50') {
    state.over50 = target.checked;
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
  // 기본값: 2027년 말에 1년 4개월 일하고 그만둔 경우
  const lastWorkDate = validDate(params.get('e')) ?? defaultLastWorkDate();
  const startDate = validDate(params.get('s')) ?? `${Number(lastWorkDate.slice(0, 4)) - 1}-09-01`;
  const wage = Number(params.get('w'));
  const workDays = Number(params.get('d'));
  const period = Number(params.get('p'));

  return {
    startDate,
    lastWorkDate,
    weeklyHours: params.has('h') ? parseHours(params.get('h')) : 20,
    workDays: Number.isInteger(workDays) && workDays >= 1 && workDays <= 7 ? workDays : 5,
    hourlyWage: isAmount(wage, 1e7) ? wage : minimumWageFor(lastWorkDate),
    wageMode: params.get('m') === 'direct' ? 'direct' : 'estimate',
    threeMonthWages: amountParam(params, 't', 1e11),
    unitMode: params.get('u') === 'direct' ? 'direct' : 'estimate',
    unitDays: amountParam(params, 'n', 1e4),
    insuredYears: params.has('p') && INSURED_BRACKETS.includes(period) ? period : null,
    over50: params.get('o') === '1',
  };
}

function writeStateToForm() {
  $('start').value = state.startDate;
  $('last').value = state.lastWorkDate;
  $('hours').value = formatHours(state.weeklyHours);
  $('wage').value = String(state.hourlyWage);
  $('wages').value = state.threeMonthWages ? String(state.threeMonthWages) : '';
  $('units').value = state.unitDays ? String(state.unitDays) : '';
  $('over50').checked = state.over50;
  form.querySelector(`input[name="days"][value="${state.workDays}"]`).checked = true;
  form.querySelector(`input[name="mode"][value="${state.wageMode}"]`).checked = true;
  form.querySelector(`input[name="unit-mode"][value="${state.unitMode}"]`).checked = true;
  const period = state.insuredYears === null ? 'auto' : String(state.insuredYears);
  form.querySelector(`input[name="period"][value="${period}"]`).checked = true;
  lastValidHours = $('hours').value;
}

function syncUrl() {
  const params = new URLSearchParams({
    s: state.startDate,
    e: state.lastWorkDate,
    h: formatHours(state.weeklyHours),
    d: state.workDays,
    w: state.hourlyWage,
  });
  if (state.wageMode === 'direct') {
    params.set('m', 'direct');
    params.set('t', state.threeMonthWages);
  }
  if (state.unitMode === 'direct') {
    params.set('u', 'direct');
    params.set('n', state.unitDays);
  }
  if (state.insuredYears !== null) params.set('p', state.insuredYears);
  if (state.over50) params.set('o', '1');
  history.replaceState(null, '', `${location.pathname}?${params}`);
}

function render() {
  const direct = state.wageMode === 'direct';
  $('wages-field').hidden = !direct;
  $('mode-hint').textContent = direct
    ? '급여명세서의 3개월 세전 임금을 넣어요. 시급은 1일 통상임금 비교에 써요.'
    : `시급 × 주 ${formatHours(state.weeklyHours)}시간에 주휴수당을 더한 한 주 임금으로 3개월을 추정해요.`;
  $('units-field').hidden = state.unitMode !== 'direct';

  const result = calculateUnemployment(state);

  if (!result.valid) {
    $('result-label').textContent = '예상 실업급여 총액';
    $('result-amount').textContent = '-';
    $('result-sub').textContent = result.error;
    $('unit-hint').textContent = '';
    $('steps-body').replaceChildren();
    $('notes').replaceChildren();
    return;
  }

  $('unit-hint').textContent =
    state.unitMode === 'direct'
      ? '고용24에서 조회하거나 고용센터에 물어본 일수를 넣어요.'
      : `입사일부터 근무일수로 어림하면 ${result.unitDays.toLocaleString('ko-KR')}일이에요. 정확한 일수는 고용24에서 확인할 수 있어요.`;
  // '입사일 기준'을 고르면 몇 년 칸이 되는지 함께 보여 준다.
  const auto = state.insuredYears === null ? result : calculateUnemployment({ ...state, insuredYears: null });
  $('period-hint').textContent =
    `'입사일로'를 고르면 ${auto.valid ? BRACKET_LABELS[auto.bracket] : '-'}로 봐요. ` +
    '다른 회사에서 고용보험에 가입했던 기간(공백 3년 이내, 실업급여를 받기 전 기간 제외)이 있으면 더한 기간을 골라요.';

  $('result-label').textContent = result.eligible ? '예상 실업급여 총액' : '수급 요건이 부족해요';
  $('result-amount').textContent = result.eligible ? formatWon(result.total) : '-';
  $('result-sub').textContent = result.eligible
    ? `하루 ${formatWon(result.dailyBenefit)} × ${result.benefitDays}일`
    : `피보험 단위기간이 ${result.unitDays.toLocaleString('ko-KR')}일이라 ${result.unitsNeeded.toLocaleString('ko-KR')}일이 더 필요해요.`;

  const rows = [
    [`피보험 단위기간 (${result.basisMonths}개월 안)`, `${result.unitDays.toLocaleString('ko-KR')}일 / ${MIN_UNIT_DAYS}일`],
    [`평균임금 기간 (${formatShort(result.periodStart)}~${formatShort(result.periodEnd)})`, `${result.periodDays}일`],
    [direct ? '3개월 임금' : '3개월 임금 (추정)', formatWon(result.threeMonthWages)],
    ['1일 평균임금', formatWonDetail(result.dailyAverage)],
    [`1일 통상임금 (${formatHours(result.ordinaryHours)}시간)`, formatWonDetail(result.dailyOrdinary)],
    [result.capped ? `기초일액 (상한 ${formatWon(result.baseCap)})` : '기초일액', formatWonDetail(result.appliedBase)],
    ['기초일액 × 60%', formatWon(result.byRate)],
    [`하한 (${formatHours(result.lowerHours)}시간 기준)`, formatWon(result.lowerLimit)],
    ['1일 구직급여액', formatWon(result.dailyBenefit)],
    [`소정급여일수 (${BRACKET_SHORT[result.bracket]}${state.over50 ? ', 50세 이상' : ''})`, `${result.benefitDays}일`],
  ];

  $('steps-body').replaceChildren(
    ...rows.map((cells) => tableRow(cells)),
    tableRow(['총액 (1일 금액 × 일수)', formatWon(result.total)], 'total'),
  );

  $('notes').replaceChildren(
    ...notes(result).map((text) => {
      const li = document.createElement('li');
      li.textContent = text;
      return li;
    }),
  );
}

function notes(result) {
  const list = [];
  if (!result.eligible) {
    list.push(`요건을 채웠다면 ${formatWon(result.total)}(하루 ${formatWon(result.dailyBenefit)} × ${result.benefitDays}일)이에요. 계산 과정은 참고로 보여 드려요.`);
  }
  list.push('회사 사정, 계약 만료 같은 비자발적 이직이어야 해요. 자발적 퇴사는 임금체불, 직장 내 괴롭힘처럼 정해진 정당한 사유가 있을 때만 받아요. 계산기는 이직 사유를 판단하지 않아요.');
  if (result.usesLower) {
    list.push(
      `기초일액의 60%(${formatWon(result.byRate)})가 하한보다 적어서 하한 ${formatWon(result.lowerLimit)}을 받아요. ` +
        `하한은 이직일 최저시급 ${formatWon(result.minimumWage)} × ${formatHours(result.lowerHours)}시간 × 80%예요.`,
    );
  }
  if (result.inverted) {
    list.push(
      `하한(${formatWon(result.lowerLimit)})이 상한(${formatWon(result.upperLimit)})보다 높아요. 법 제46조 제2항에 따라 하한을 받는 것으로 계산했어요. ` +
        '정부가 상한을 하한에 연동하는 개편을 추진하고 있어서 2027년 금액은 바뀔 수 있어요.',
    );
  } else if (result.capped) {
    list.push(`기초일액이 상한 ${formatWon(result.baseCap)}을 넘어서 하루 ${formatWon(result.upperLimit)}이 최대예요.`);
  }
  if (result.shortTime) {
    list.push('주 15시간 미만, 주 2일 이하로 일한 경우라 이직 전 24개월 안에서 단위기간을 셌어요. 24개월 안에 이렇게 일한 단위기간이 90일 이상이어야 해요.');
  }
  if (state.unitMode === 'estimate') {
    list.push('피보험 단위기간은 지금 회사 근무일과 주휴일만으로 어림했어요. 이직 전 18개월 안에 다른 회사에서 고용보험에 가입한 기간이 있으면 더해져요.');
  }
  if (state.wageMode === 'estimate') {
    list.push('시급으로 추정한 임금이에요. 연장·야간수당이 있었다면 3개월 임금을 직접 넣으면 더 정확해요.');
  }
  const minimumWage = minimumWageFor(state.lastWorkDate);
  if (state.hourlyWage > 0 && state.hourlyWage < minimumWage) {
    list.push(`이직 연도 최저시급(${formatWon(minimumWage)})보다 낮은 시급이에요.`);
  }
  list.push('65세 이후에 새로 고용됐다면 실업급여를 받을 수 없어요(65세 전부터 계속 일한 경우는 받아요).');
  list.push('1일 구직급여액의 원 미만은 버렸어요. 실업급여는 소득세를 떼지 않아요(소득세법 제12조).');
  return list;
}

async function share() {
  syncUrl();
  const url = location.href;
  const text = `${$('result-label').textContent}: ${$('result-amount').textContent} (실업급여 계산기)`;

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

/** 오늘이 계산할 수 있는 기간 안이면 오늘, 아니면 가장 가까운 끝 날짜. */
function defaultLastWorkDate() {
  const today = new Date();
  const todayText = formatDate(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) / 86400000);
  if (todayText > SUPPORTED_UNTIL) return SUPPORTED_UNTIL;
  if (todayText < UNEMPLOYMENT_RULES[0].from) return UNEMPLOYMENT_RULES[0].from;
  return todayText;
}

/** 이직일 당시 최저시급. 계산 기간 밖이면 가장 가까운 연도. */
function minimumWageFor(dateText) {
  const day = parseDate(dateText);
  let wage = UNEMPLOYMENT_RULES[0].minimumWage;
  for (const rule of UNEMPLOYMENT_RULES) {
    if (day !== null && day >= parseDate(rule.from)) wage = rule.minimumWage;
  }
  return wage;
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


// 계산기 화면: 입력을 읽어 calc.js로 계산하고 결과를 그린다.
// 입력값은 주소(?y=2027&w=10700...)에도 반영해서 링크로 공유할 수 있게 한다.
import {
  DEDUCTIONS,
  YEARS,
  autoDeduction,
  calculatePay,
  defaultYear,
  formatHours,
  formatWon,
} from './calc.js';

const $ = (id) => document.getElementById(id);
const form = $('calc');

const HOURS_PATTERN = /^\d{0,2}(\.\d?)?$/;

const state = readStateFromUrl();
let lastValid = { wage: '', hours: '', night: '' };

writeStateToForm();
render();

// 저장된 선택을 먼저 그린 다음 애니메이션을 켠다 (처음 열 때 선택 표시가 미끄러지지 않도록).
void form.offsetWidth;
document.body.classList.add('js-ready');

form.addEventListener('submit', (event) => event.preventDefault());

form.addEventListener('input', (event) => {
  const target = event.target;

  if (target.id === 'wage') {
    target.value = target.value.replace(/\D/g, '').slice(0, 7);
    state.hourlyWage = Number(target.value) || 0;
  } else if (target.id === 'hours' || target.id === 'night') {
    if (!HOURS_PATTERN.test(target.value)) target.value = lastValid[target.id];
    lastValid[target.id] = target.value;
    const hours = parseHours(target.value);
    if (target.id === 'hours') state.hoursPerDay = hours;
    else state.nightHoursPerDay = hours;
  } else if (target.name === 'year') {
    const previous = YEARS[state.year];
    state.year = Number(target.value);
    // 이전 연도 최저시급 그대로라면 새 연도 최저시급으로 바꿔 준다.
    if (state.hourlyWage === previous.minimumWage) {
      state.hourlyWage = YEARS[state.year].minimumWage;
      $('wage').value = String(state.hourlyWage);
    }
  } else if (target.name === 'days') {
    state.daysPerWeek = Number(target.value);
  } else if (target.id === 'five') {
    state.fiveOrMoreEmployees = target.checked;
  } else if (target.name === 'deduction') {
    state.deduction = target.value;
    state.deductionAuto = false;
  }

  if (state.deductionAuto) applyAutoDeduction();
  syncUrl();
  render();
});

$('deduction-auto').addEventListener('click', () => {
  state.deductionAuto = true;
  applyAutoDeduction();
  syncUrl();
  render();
});

$('min-wage').addEventListener('click', () => {
  state.hourlyWage = YEARS[state.year].minimumWage;
  $('wage').value = String(state.hourlyWage);
  syncUrl();
  render();
});

$('share').addEventListener('click', share);

function readStateFromUrl() {
  const params = new URLSearchParams(location.search);
  const year = YEARS[params.get('y')] ? Number(params.get('y')) : defaultYear();
  const wage = Number(params.get('w'));
  const days = Number(params.get('d'));
  // 공제를 직접 고른 링크(x=...)가 아니면 근무시간에 맞춰 자동으로 고른다.
  const deductionAuto = !Object.hasOwn(DEDUCTIONS, params.get('x'));

  const state = {
    year,
    hourlyWage: Number.isInteger(wage) && wage > 0 && wage < 1e7 ? wage : YEARS[year].minimumWage,
    hoursPerDay: params.has('h') ? parseHours(params.get('h')) : 8,
    nightHoursPerDay: params.has('n') ? parseHours(params.get('n')) : 0,
    daysPerWeek: Number.isInteger(days) && days >= 1 && days <= 7 ? days : 5,
    fiveOrMoreEmployees: params.get('f') !== '0',
    deduction: deductionAuto ? 'none' : params.get('x'),
    deductionAuto,
  };
  if (deductionAuto) state.deduction = autoDeduction(state);
  return state;
}

function applyAutoDeduction() {
  state.deduction = autoDeduction(state);
  form.querySelector(`input[name="deduction"][value="${state.deduction}"]`).checked = true;
}

function writeStateToForm() {
  $('wage').value = String(state.hourlyWage);
  $('hours').value = formatHours(state.hoursPerDay);
  $('night').value = formatHours(state.nightHoursPerDay);
  $('five').checked = state.fiveOrMoreEmployees;
  form.querySelector(`input[name="year"][value="${state.year}"]`).checked = true;
  form.querySelector(`input[name="days"][value="${state.daysPerWeek}"]`).checked = true;
  form.querySelector(`input[name="deduction"][value="${state.deduction}"]`).checked = true;
  lastValid = { wage: $('wage').value, hours: $('hours').value, night: $('night').value };
}

function syncUrl() {
  const params = new URLSearchParams({
    y: state.year,
    w: state.hourlyWage,
    h: formatHours(state.hoursPerDay),
    n: formatHours(state.nightHoursPerDay),
    d: state.daysPerWeek,
    f: state.fiveOrMoreEmployees ? '1' : '0',
  });
  // 직접 고른 공제만 주소에 남긴다. 자동이면 링크를 연 사람의 근무시간에 맞춰 다시 고른다.
  if (!state.deductionAuto) params.set('x', state.deduction);
  history.replaceState(null, '', `${location.pathname}?${params}`);
}

function render() {
  const rates = YEARS[state.year];
  const result = calculatePay(state);
  const hasDeduction = state.deduction !== 'none';

  $('year-hint').textContent = `${state.year}년 최저시급 ${formatWon(rates.minimumWage)}`;

  if (state.deductionAuto) {
    $('deduction-hint').textContent =
      state.deduction === 'insurance4'
        ? `월 ${result.monthlyContractHours}시간 근무라 4대보험 가입 대상이에요. 근무시간에 맞춰 자동으로 골랐어요.`
        : `월 ${result.monthlyContractHours}시간 근무라 4대보험 가입 대상이 아닐 수 있어서 공제 없음으로 골랐어요.`;
  } else {
    $('deduction-hint').textContent = '직접 고른 공제예요.';
  }
  $('deduction-auto').hidden = state.deductionAuto;

  $('result-label').textContent = hasDeduction ? '예상 월 실수령액' : '예상 월급 (세전)';
  $('result-amount').textContent = formatWon(hasDeduction ? result.monthlyNet : result.monthly.gross);
  $('result-sub').textContent =
    `주 ${formatHours(result.weeklyWorkHours)}시간 근무 · 주급 ${formatWon(result.weekly.gross)} (세전)`;

  const { weekly, monthly } = result;
  const rows = [
    ['기본급', weekly.basePay, monthly.basePay],
    ['주휴수당', weekly.weeklyHolidayPay, monthly.weeklyHolidayPay],
  ];
  if (weekly.overtimePay > 0) rows.push(['연장수당', weekly.overtimePay, monthly.overtimePay]);
  if (weekly.nightPay > 0) rows.push(['야간수당', weekly.nightPay, monthly.nightPay]);

  $('breakdown-body').replaceChildren(
    ...rows.map(([label, week, month]) => tableRow([label, formatWon(week), formatWon(month)])),
    tableRow(['세전 합계', formatWon(weekly.gross), formatWon(monthly.gross)], 'total'),
  );

  $('deduction-block').hidden = !hasDeduction;
  if (hasDeduction) {
    $('deduction-body').replaceChildren(
      ...result.deductions.map((item) => tableRow([item.label, `- ${formatWon(item.amount)}`])),
      tableRow(['실수령액', formatWon(result.monthlyNet)], 'total'),
    );
  }

  $('notes').replaceChildren(
    ...notes(result, rates).map((text) => {
      const li = document.createElement('li');
      li.textContent = text;
      return li;
    }),
  );
}

function notes(result, rates) {
  const weeklyHours = result.weeklyWorkHours;
  const list = [];

  if (state.hourlyWage > 0 && state.hourlyWage < rates.minimumWage) {
    list.push(
      `${state.year}년 최저시급(${formatWon(rates.minimumWage)})보다 낮아요. ` +
        '수습 기간 등 일부 예외를 빼면 최저임금 위반일 수 있어요.',
    );
  }
  if (weeklyHours > 0 && !result.hasWeeklyHolidayPay) {
    list.push('주 15시간 미만 근무라 주휴수당이 없어요.');
  }
  if (!state.fiveOrMoreEmployees && (state.hoursPerDay > 8 || state.nightHoursPerDay > 0)) {
    list.push('5인 미만 사업장은 연장·야간 가산수당(50%)이 의무가 아니라서 계산에서 뺐어요.');
  }
  if (state.fiveOrMoreEmployees && weeklyHours > 52) {
    list.push('주 52시간을 넘는 근무는 법정 근로시간 한도를 넘어요.');
  }
  if (state.deduction === 'insurance4') {
    if (result.mayBeExemptFromInsurance) {
      list.push('월 소정근로시간이 60시간 미만이면 4대보험 가입 대상이 아닐 수 있어요.');
    }
    if (rates.pending.length > 0) {
      list.push(
        `${state.year}년 ${rates.pending.join('·')} 요율은 아직 확정 전이라 ` +
          `${state.year - 1}년 요율을 적용했어요.`,
      );
    }
    list.push('근로소득세(간이세액)는 포함하지 않았어요. 급여와 부양가족 수에 따라 추가로 빠질 수 있어요.');
  }
  return list;
}

async function share() {
  syncUrl();
  const url = location.href;
  const amount = $('result-amount').textContent;
  const text = `${$('result-label').textContent}: ${amount} (알바 급여 계산기)`;

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

/** 0~24시간. "8." 처럼 입력 중인 값도 8로 읽는다. */
function parseHours(text) {
  const value = Number.parseFloat(String(text));
  return Number.isFinite(value) ? Math.min(Math.max(value, 0), 24) : 0;
}

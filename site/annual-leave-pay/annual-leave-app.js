// 연차수당 계산기 화면: 입력을 읽어 annual-leave.js로 계산하고 연도별 발생 연차와 계산 과정을 그린다.
// 입력값은 주소(?s=2026-03-02&e=2027-08-31...)에도 반영해서 링크로 공유할 수 있게 한다.
import { YEARS, defaultYear, formatHours, formatWon } from '../calc.js';
import { addYears, formatDate, formatDateKo, parseDate } from '../severance.js';
import { ANNUAL_LEAVE_MIN_WEEKLY_HOURS, calculateAnnualLeave } from '../annual-leave.js';

const $ = (id) => document.getElementById(id);
const form = $('calc');

const HOURS_PATTERN = /^\d{0,2}(\.\d?)?$/;
const USED_PATTERN = /^\d{0,3}(\.\d?)?$/;

const state = readStateFromUrl();
let lastValidHours = '';
let lastValidUsed = '';

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
  } else if (target.id === 'wage') {
    target.value = target.value.replace(/\D/g, '').slice(0, 7);
    state.hourlyWage = Number(target.value) || 0;
  } else if (target.id === 'used') {
    if (!USED_PATTERN.test(target.value)) target.value = lastValidUsed;
    lastValidUsed = target.value;
    state.usedLeave = Number.parseFloat(target.value) || 0;
  } else if (target.id === 'missed') {
    target.value = target.value.replace(/\D/g, '').slice(0, 2);
    state.firstYearMissedMonths = Math.min(Number(target.value) || 0, 11);
  } else if (target.name === 'size') {
    state.fiveOrMoreEmployees = target.value === '5plus';
  } else if (target.name === 'used-unit') {
    state.usedUnit = target.value;
  } else if (target.dataset.lowYear) {
    // 'n년차 80% 이상' 스위치: 끄면 그해는 개근한 달 수만큼만 생긴다.
    const year = Number(target.dataset.lowYear);
    if (target.checked) delete state.lowAttendanceYears[year];
    else state.lowAttendanceYears[year] = 0;
  } else if (target.dataset.monthsYear) {
    target.value = target.value.replace(/\D/g, '').slice(0, 2);
    state.lowAttendanceYears[Number(target.dataset.monthsYear)] = Math.min(Number(target.value) || 0, 11);
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
  // 기본값: 오늘까지 1년 6개월 일한 경우로 보여 준다.
  const todayNumber = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) / 86400000;
  const lastWorkDate = validDate(params.get('e')) ?? formatDate(todayNumber);
  const startDate = validDate(params.get('s')) ?? defaultStart(lastWorkDate);
  const wage = Number(params.get('w'));
  const used = Number(params.get('u'));

  return {
    startDate,
    lastWorkDate,
    weeklyHours: params.has('h') ? parseHours(params.get('h')) : 20,
    hourlyWage: Number.isInteger(wage) && wage > 0 && wage < 1e7 ? wage : minimumWageFor(lastWorkDate),
    fiveOrMoreEmployees: params.get('z') !== 'under5',
    usedLeave: Number.isFinite(used) && used > 0 && used < 1000 ? used : 0,
    usedUnit: params.get('uu') === 'days' ? 'days' : 'hours',
    firstYearMissedMonths: Math.min(Math.max(Math.floor(Number(params.get('m')) || 0), 0), 11),
    lowAttendanceYears: parseLowYears(params.get('y')),
  };
}

/** 마지막 근무일의 1년 6개월 전 다음 날. */
function defaultStart(lastWorkDate) {
  const [year, month, day] = lastWorkDate.split('-').map(Number);
  const date = new Date(Date.UTC(year - 1, month - 1 - 6, day + 1));
  return date.toISOString().slice(0, 10);
}

/** 'y=2:3,5:0' → { 2: 3, 5: 0 } (2년차 개근 3개월, 5년차 0개월) */
function parseLowYears(text) {
  const result = {};
  for (const part of String(text ?? '').split(',')) {
    const match = /^(\d{1,2}):(\d{1,2})$/.exec(part);
    if (match && Number(match[1]) >= 1) result[Number(match[1])] = Math.min(Number(match[2]), 11);
  }
  return result;
}

function writeStateToForm() {
  $('start').value = state.startDate;
  $('last').value = state.lastWorkDate;
  $('hours').value = formatHours(state.weeklyHours);
  $('wage').value = String(state.hourlyWage);
  $('used').value = state.usedLeave ? String(state.usedLeave) : '';
  $('missed').value = state.firstYearMissedMonths ? String(state.firstYearMissedMonths) : '';
  form.querySelector(`input[name="size"][value="${state.fiveOrMoreEmployees ? '5plus' : 'under5'}"]`).checked = true;
  form.querySelector(`input[name="used-unit"][value="${state.usedUnit}"]`).checked = true;
  lastValidHours = $('hours').value;
  lastValidUsed = $('used').value;
}

function syncUrl() {
  const params = new URLSearchParams({
    s: state.startDate,
    e: state.lastWorkDate,
    h: formatHours(state.weeklyHours),
    w: state.hourlyWage,
  });
  if (!state.fiveOrMoreEmployees) params.set('z', 'under5');
  if (state.usedLeave) {
    params.set('u', state.usedLeave);
    if (state.usedUnit === 'days') params.set('uu', 'days');
  }
  if (state.firstYearMissedMonths) params.set('m', state.firstYearMissedMonths);
  const low = Object.entries(state.lowAttendanceYears).map(([year, months]) => `${year}:${months}`);
  if (low.length) params.set('y', low.join(','));
  history.replaceState(null, '', `${location.pathname}?${params}`);
}

function render() {
  $('used-unit').textContent = state.usedUnit === 'days' ? '일' : '시간';

  const result = calculateAnnualLeave(state);
  renderYearSwitches(result);

  if (!result.valid) {
    $('result-label').textContent = '퇴사 때 받을 연차수당 (세전)';
    $('result-amount').textContent = '-';
    $('result-sub').textContent = result.error;
    $('used-hint').textContent = '';
    $('grants-body').replaceChildren();
    $('steps-body').replaceChildren();
    $('notes').replaceChildren();
    return;
  }

  $('used-hint').textContent =
    state.usedUnit === 'days'
      ? `연차 1일 = ${formatHours(result.hoursPerDay)}시간으로 바꿔 계산해요. 표에서 '사용 가능'인 연차 중 쓴 만큼 넣어요.`
      : `표에서 '사용 가능'인 연차 중 쓴 시간을 넣어요. 연차 1일 = ${formatHours(result.hoursPerDay)}시간이에요.`;

  $('result-label').textContent = result.eligible ? '퇴사 때 받을 연차수당 (세전)' : '연차휴가 대상이 아니에요';
  $('result-amount').textContent = formatWon(result.pay);
  $('result-sub').textContent = result.eligible
    ? `남은 연차 ${hoursText(result.remainingHours)} × 시급 ${formatWon(state.hourlyWage)}`
    : ineligibleReason(result);

  const rows = result.grants.map((grant) => grantRow(grant));
  if (result.next) rows.push(grantRow(result.next, result.daysUntilNext));
  $('grants-body').replaceChildren(...rows);

  $('steps-body').replaceChildren(
    tableRow([`사용 가능 연차 (${daysText(result.availableDays)})`, hoursText(result.availableHours)]),
    tableRow(['이미 쓴 연차', `−${hoursText(Math.min(result.usedHours, result.availableHours))}`]),
    tableRow([`남은 연차 (${daysText(round1(result.remainingDays))})`, hoursText(result.remainingHours)]),
    tableRow([`연차수당 = ${formatNumber(result.remainingHours)}시간 × ${formatWon(state.hourlyWage)}`, formatWon(result.payIfEligible)], 'total'),
  );

  $('notes').replaceChildren(
    ...notes(result).map((text) => {
      const li = document.createElement('li');
      li.textContent = text;
      return li;
    }),
  );
}

/** 연도별 발생 연차 표의 한 줄: 생긴 날 | 일수·시간 | 상태. daysUntil이 있으면 아직 생기지 않은 다음 연차. */
function grantRow(grant, daysUntil = 0) {
  const upcoming = daysUntil > 0;
  const tr = document.createElement('tr');
  if (upcoming) tr.className = 'upcoming';
  const title =
    grant.kind === 'monthly'
      ? upcoming
        ? '다음 달 개근'
        : `첫 1년 매달 (${grant.months}번)`
      : `${grant.years}년 근속${grant.lowAttendance ? ' (80% 미만)' : ''}`;
  const when =
    grant.kind === 'monthly' && !upcoming && grant.months > 1
      ? formatRange(grant.date, grant.lastDate)
      : formatShort(grant.date);
  const status = upcoming ? '아직 없음' : grant.active ? '사용 가능' : '기간 지남';
  const statusSub = upcoming ? `${daysUntil.toLocaleString('ko-KR')}일 뒤` : grant.active ? `${formatShort(grant.expires)}까지` : `${formatShort(grant.expires)} 끝`;

  tr.append(
    cell(title, when),
    cell(`${grant.days}일`, `${grant.hours}시간`),
    cell(status, statusSub),
  );
  return tr;
}

function renderYearSwitches(result) {
  // 마지막 근무일까지 채운 근속 연수만큼 'n년차 80% 이상' 스위치를 보여 준다.
  const container = $('years');
  if (!result.valid) {
    // 날짜를 고치는 중일 수 있으니 고른 값은 지우지 않고 숨기기만 한다.
    container.replaceChildren();
    return;
  }
  const years = result.grants.filter((grant) => grant.kind === 'annual').map((grant) => grant.years);
  const existing = [...container.querySelectorAll('[data-year-row]')].map((row) => Number(row.dataset.yearRow));
  if (existing.join() === years.join()) {
    // 같은 연도 구성이면 다시 만들지 않는다 (입력 중인 칸의 포커스를 지키기 위해). 보이기만 맞춘다.
    for (const year of years) {
      const low = Object.hasOwn(state.lowAttendanceYears, year);
      container.querySelector(`[data-months-row="${year}"]`).hidden = !low;
    }
    return;
  }
  // 근속 연수에 들지 않는 해의 선택은 지운다.
  for (const year of Object.keys(state.lowAttendanceYears)) {
    if (!years.includes(Number(year))) delete state.lowAttendanceYears[year];
  }

  const start = parseDate(state.startDate);
  container.replaceChildren(
    ...years.map((year) => {
      const wrapper = document.createElement('div');
      wrapper.dataset.yearRow = year;
      const low = Object.hasOwn(state.lowAttendanceYears, year);
      const yearStart = formatDate(addYears(start, year - 1));
      const yearEnd = formatDate(addYears(start, year) - 1);

      const label = document.createElement('label');
      label.className = 'switch-row';
      const text = document.createElement('span');
      const strong = document.createElement('strong');
      strong.textContent = `${year}년차 출근율 80% 이상`;
      const small = document.createElement('small');
      small.textContent = formatRange(yearStart, yearEnd);
      text.append(strong, small);
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.setAttribute('role', 'switch');
      input.checked = !low;
      input.dataset.lowYear = year;
      label.append(text, input);

      const months = document.createElement('div');
      months.className = 'field';
      months.dataset.monthsRow = year;
      months.hidden = !low;
      const monthsLabel = document.createElement('label');
      const id = `months-${year}`;
      monthsLabel.htmlFor = id;
      monthsLabel.textContent = `${year}년차에 개근한 달`;
      const row = document.createElement('div');
      row.className = 'input-row';
      const monthsInput = document.createElement('input');
      monthsInput.id = id;
      monthsInput.inputMode = 'numeric';
      monthsInput.maxLength = 2;
      monthsInput.enterKeyHint = 'done';
      monthsInput.dataset.monthsYear = year;
      monthsInput.value = low && state.lowAttendanceYears[year] ? String(state.lowAttendanceYears[year]) : '';
      const unit = document.createElement('span');
      unit.className = 'unit';
      unit.textContent = '개월';
      row.append(monthsInput, unit);
      const hint = document.createElement('p');
      hint.className = 'hint';
      hint.textContent = '80% 미만인 해에는 15일 대신 개근한 달마다 1일이 생겨요.';
      months.append(monthsLabel, row, hint);

      wrapper.append(label, months);
      return wrapper;
    }),
  );
}

function ineligibleReason(result) {
  const reasons = [];
  if (!result.enoughHours) reasons.push(`주 소정근로시간이 ${ANNUAL_LEAVE_MIN_WEEKLY_HOURS}시간 미만이에요`);
  if (!result.fiveOrMoreEmployees) reasons.push('5인 미만 사업장에는 연차휴가 규정이 적용되지 않아요');
  return `${reasons.join('. ')}.`;
}

function notes(result) {
  const list = [];
  if (!result.eligible) {
    list.push(`조건을 채웠다면 ${formatWon(result.payIfEligible)}이에요. 계산 과정은 참고로 보여 드려요.`);
  }
  if (result.exactlyOneYear) {
    list.push(
      `딱 1년만 일하고 끝나면 1년 근속 15일은 생기지 않아요. 1년 근로를 마친 다음 날(${formatDateKo(parseDate(result.oneYearDate))})에도 ` +
        '근로관계가 있어야 생겨요(대법원 2021다227100, 고용노동부 행정해석).',
    );
  } else if (result.next && result.daysUntilNext <= 31) {
    list.push(
      `${formatDateKo(parseDate(result.next.date))}에도 근로관계가 이어지면 연차 ${result.next.days}일(${result.next.hours}시간)이 더 생겨요.`,
    );
  }
  if (result.overUsed) {
    list.push('이미 쓴 연차가 사용 가능 연차보다 많아요. 남은 연차는 0으로 계산했어요.');
  }
  if (result.expiredHours > 0) {
    list.push(
      `사용 기간이 지난 연차 ${result.expiredHours}시간은 퇴사 정산에 넣지 않았어요. 쓰지 못한 만큼은 기간이 끝날 때 수당으로 받았어야 해요. ` +
        '받지 못했다면 3년 안에 청구할 수 있어요. 다만 회사가 연차 사용 촉진(제61조)을 했다면 수당이 없을 수 있어요.',
    );
  }
  if (result.eligible && state.weeklyHours < 40) {
    list.push(`주 ${formatHours(state.weeklyHours)}시간이라 연차 1일을 ${formatHours(result.hoursPerDay)}시간으로 계산했어요(통상 근로자 주 40시간 기준, 1시간 미만은 올림).`);
  }
  if (state.startDate < '2018-05-29') {
    list.push('2018년 5월 29일 전에는 첫해에 쓴 연차를 다음 해 15일에서 빼는 규정이 있었어요. 계산기는 지금 법으로 계산해요.');
  }
  if (state.hourlyWage === 0) {
    list.push('시급을 넣지 않아서 연차수당은 0원으로 나와요.');
  }
  const minimumWage = minimumWageFor(state.lastWorkDate);
  if (state.hourlyWage > 0 && state.hourlyWage < minimumWage) {
    list.push(`마지막 근무 연도 최저시급(${formatWon(minimumWage)})보다 낮은 시급이에요.`);
  }
  return list;
}

async function share() {
  syncUrl();
  const url = location.href;
  const text = `${$('result-label').textContent}: ${$('result-amount').textContent} (연차수당 계산기)`;

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

/** 큰 글씨 한 줄 + 작은 글씨 한 줄짜리 칸 */
function cell(text, sub) {
  const td = document.createElement('td');
  td.textContent = text;
  if (sub) {
    const small = document.createElement('small');
    small.textContent = sub;
    td.append(small);
  }
  return td;
}

/** 마지막 근무일이 속한 연도의 최저시급. 표에 없는 연도면 가장 가까운 연도. */
function minimumWageFor(dateText) {
  const year = Number(String(dateText).slice(0, 4));
  return YEARS[defaultYear(new Date(Number.isFinite(year) ? year : new Date().getFullYear(), 0, 1))].minimumWage;
}

/** '2027-10-01' → '27.10.1.' (좁은 화면에서도 한 줄에 들어가게 연도를 두 자리로) */
function formatShort(dateText) {
  const [year, month, day] = dateText.split('-').map(Number);
  return `${String(year).slice(2)}.${month}.${day}.`;
}

/** '2027-02-01'~'2027-12-01' → '27.2.1.~12.1.' (같은 해면 뒤쪽 연도는 뺀다) */
function formatRange(from, to) {
  const end = from.slice(0, 4) === to.slice(0, 4) ? formatShort(to).slice(3) : formatShort(to);
  // 좁은 화면에서는 '~' 뒤에서 줄이 바뀌도록 폭 없는 공백을 넣는다.
  return `${formatShort(from)}~\u200b${end}`;
}

function hoursText(hours) {
  return `${formatNumber(hours)}시간`;
}

function daysText(days) {
  return `${formatNumber(days)}일`;
}

function formatNumber(value) {
  return Number(value.toFixed(2)).toLocaleString('ko-KR');
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function validDate(text) {
  return text !== null && parseDate(text) !== null ? text : null;
}

/** 0~68시간. "20." 처럼 입력 중인 값도 20으로 읽는다. */
function parseHours(text) {
  const value = Number.parseFloat(String(text));
  return Number.isFinite(value) ? Math.min(Math.max(value, 0), 68) : 0;
}

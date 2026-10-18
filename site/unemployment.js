// 실업급여(구직급여) 계산 로직.
// 고용보험법 제40조(수급 요건)·제45조(기초일액)·제46조(구직급여일액)·제50조와 별표 1(소정급여일수),
// 시행령 제68조(기초일액 상한), 시행규칙 제91조의2(이직 전 1일 소정근로시간)를 따른다.
// 2028년 1월 1일부터는 기초일액을 이직 전 1년 보수로 구하도록 바뀌어서(법률 제21473호 부칙 제3조)
// 이 계산기는 2027년 12월 31일 이직까지만 계산한다.
import { addYears, formatDate, parseDate, subtractMonths } from './severance.js';

/** 수급 요건: 기준기간(이직일 이전 18개월) 동안의 피보험 단위기간 합계. */
export const MIN_UNIT_DAYS = 180;

/** 구직급여일액 = 기초일액 × 60%, 하한(최저구직급여일액) = 최저기초일액 × 80%. */
const BENEFIT_RATE = 60;
const LOWER_RATE = 80;

/**
 * 이직일에 따라 달라지는 기준. from 이후(같은 날 포함)에 이직하면 그 줄을 쓴다.
 * - minimumWage: 이직일 당시 최저시급 (하한 계산, 법 제45조 제4항)
 * - baseCap: 기초일액 상한 (시행령 제68조). 2026.1.1. 이후 이직은 113,500원(2025.12.23. 개정, 부칙 제4조).
 */
export const UNEMPLOYMENT_RULES = [
  { from: '2025-01-01', minimumWage: 10030, baseCap: 110000 },
  { from: '2026-01-01', minimumWage: 10320, baseCap: 113500 },
  { from: '2027-01-01', minimumWage: 10700, baseCap: 113500 },
];

/** 이 날짜부터는 기초일액 산정 방식이 바뀌어 계산하지 않는다. */
export const SUPPORTED_UNTIL = '2027-12-31';

/** 별표 1: [1년 미만, 1~3년, 3~5년, 5~10년, 10년 이상] 소정급여일수. */
const BENEFIT_DAYS = {
  under50: [120, 150, 180, 210, 240],
  over50: [120, 180, 210, 240, 270],
};

/** 가입기간 구간의 시작 연수. 화면의 선택지와 같은 순서. */
export const INSURED_BRACKETS = [0, 1, 3, 5, 10];

/** 하한을 구할 때 1일 소정근로시간의 범위 (고용노동부 안내: 4시간 이하는 4시간, 8시간 이상은 8시간). */
const LOWER_MIN_HOURS = 4;
const LOWER_MAX_HOURS = 8;

/** 주 15시간 이상이면 주휴일(유급휴일)이 있다. */
const PAID_HOLIDAY_MIN_HOURS = 15;

/**
 * 실업급여(구직급여) 계산.
 * - startDate: 지금 회사 입사일. 피보험 단위기간과 가입기간을 어림할 때 쓴다.
 * - lastWorkDate: 마지막 근무일 = 이직일.
 * - weeklyHours: 1주 소정근로시간. workDays: 1주 근무일수.
 * - hourlyWage: 시급. wageMode가 'estimate'면 시급으로 3개월 임금을 추정, 'direct'면 threeMonthWages를 쓴다.
 * - unitMode: 'estimate'면 입사일과 근무일수로 피보험 단위기간을 어림, 'direct'면 unitDays를 그대로 쓴다.
 * - insuredYears: 고용보험 가입기간(년). null이면 입사일부터 이직일까지로 본다.
 * - over50: 이직일에 50세 이상이거나 장애인이면 true.
 */
export function calculateUnemployment({
  startDate,
  lastWorkDate,
  weeklyHours,
  workDays = 5,
  hourlyWage,
  wageMode = 'estimate',
  threeMonthWages = 0,
  unitMode = 'estimate',
  unitDays = 0,
  insuredYears = null,
  over50 = false,
}) {
  const last = parseDate(lastWorkDate);
  if (last === null) return { valid: false, error: '마지막 근무일을 넣어 주세요.' };
  const rule = ruleFor(last);
  if (!rule) return { valid: false, error: `${UNEMPLOYMENT_RULES[0].from.slice(0, 4)}년 1월 1일 이후 이직만 계산할 수 있어요.` };
  if (last > parseDate(SUPPORTED_UNTIL)) {
    return { valid: false, error: '2028년 이후 이직은 계산 방식이 바뀌어서(이직 전 1년 보수 기준) 아직 계산하지 않아요.' };
  }

  const start = parseDate(startDate);
  const needsStart = unitMode === 'estimate' || insuredYears === null;
  if (needsStart && start === null) return { valid: false, error: '입사일을 넣어 주세요.' };
  if (start !== null && last < start) return { valid: false, error: '마지막 근무일이 입사일보다 빨라요.' };

  const hours = Math.max(weeklyHours, 0);
  const days = Math.min(Math.max(Math.round(workDays), 1), 7);
  const hasPaidHoliday = hours >= PAID_HOLIDAY_MIN_HOURS;
  // 주휴수당 시간: 주 40시간 기준 8시간에 비례 (주휴수당 계산과 같은 방식)
  const holidayHours = hasPaidHoliday ? (Math.min(hours, 40) / 40) * 8 : 0;

  // 기준기간: 이직일 이전 18개월. 이직 당시 주 15시간 미만이고 주 2일 이하로 일했다면 24개월(법 제40조 제2항 제2호).
  const shortTime = hours < PAID_HOLIDAY_MIN_HOURS && days <= 2;
  const basisMonths = shortTime ? 24 : 18;
  const leaveDate = last + 1; // 이직일 다음 날 (피보험자격 상실일)
  const basisStart = subtractMonths(leaveDate, basisMonths);

  // 피보험 단위기간: 보수를 받은 날(근무일 + 유급 주휴일)을 센다(법 제41조).
  let units;
  let unitFrom = null;
  if (unitMode === 'direct') {
    units = Math.max(Math.round(unitDays), 0);
  } else {
    unitFrom = Math.max(start, basisStart);
    const paidDaysPerWeek = Math.min(days + (hasPaidHoliday ? 1 : 0), 7);
    units = Math.floor(((leaveDate - unitFrom) * paidDaysPerWeek) / 7);
  }
  const eligible = units >= MIN_UNIT_DAYS;

  // 평균임금 산정 기간: 이직일 다음 날의 3개월 전 같은 날부터 이직일까지 (퇴직금 계산과 같은 기준).
  const periodStart = start === null ? subtractMonths(leaveDate, 3) : Math.max(subtractMonths(leaveDate, 3), start);
  const periodDays = leaveDate - periodStart;

  const wage = Math.max(hourlyWage, 0);
  const wages =
    wageMode === 'direct'
      ? Math.max(Math.round(threeMonthWages), 0)
      : Math.round((wage * (hours + holidayHours) * periodDays) / 7);

  // 금액은 전(1/100원) 단위 정수로 계산한다. 1일 평균임금은 전 단위에서 올림.
  const averageJeon = Math.floor((wages * 100 + periodDays - 1) / periodDays);
  // 1일 통상임금 = 시급 × (주 소정근로시간 ÷ 5, 최대 8시간)
  const ordinaryHours = Math.min(hours, 40) / 5;
  const ordinaryJeon = Math.round(wage * ordinaryHours * 100);
  // 평균임금이 통상임금보다 적으면 통상임금 (법 제45조 제2항)
  const usesOrdinary = ordinaryJeon > averageJeon;
  const baseJeon = usesOrdinary ? ordinaryJeon : averageJeon;

  // 상한 (시행령 제68조)
  const capJeon = rule.baseCap * 100;
  const capped = baseJeon > capJeon;
  const appliedBaseJeon = capped ? capJeon : baseJeon;

  // 이직 전 1일 소정근로시간 (시행규칙 제91조의2 제1항 제2호): (주 소정근로시간 + 주휴시간) ÷ 48 × 8
  const dailyHours = Math.min(((hours + holidayHours) / 48) * 8, 24);
  const lowerHours = Math.min(Math.max(dailyHours, LOWER_MIN_HOURS), LOWER_MAX_HOURS);
  // 최저기초일액 = 최저시급 × 1일 소정근로시간, 하한 = 그 80% (법 제45조 제4항, 제46조)
  const minBaseJeon = Math.round(rule.minimumWage * lowerHours * 100);
  const lowerLimit = Math.floor((minBaseJeon * LOWER_RATE) / 10000);
  const upperLimit = Math.floor((capJeon * BENEFIT_RATE) / 10000);

  // 구직급여일액: 기초일액 × 60% (원 미만 버림). 하한보다 낮으면 하한.
  const byRate = Math.floor((appliedBaseJeon * BENEFIT_RATE) / 10000);
  const usesLower = byRate < lowerLimit;
  const dailyBenefit = usesLower ? lowerLimit : byRate;

  // 소정급여일수 (별표 1)
  const years = insuredYears === null ? completedYears(start, leaveDate) : Math.max(insuredYears, 0);
  const bracket = bracketOf(years);
  const benefitDays = BENEFIT_DAYS[over50 ? 'over50' : 'under50'][bracket];
  const total = dailyBenefit * benefitDays;

  return {
    valid: true,
    eligible,
    unitDays: units,
    unitsNeeded: eligible ? 0 : MIN_UNIT_DAYS - units,
    unitFrom: unitFrom === null ? null : formatDate(unitFrom),
    basisMonths,
    basisStart: formatDate(basisStart),
    shortTime,
    minimumWage: rule.minimumWage,
    baseCap: rule.baseCap,
    periodStart: formatDate(periodStart),
    periodEnd: formatDate(last),
    periodDays,
    threeMonthWages: wages,
    dailyAverage: averageJeon / 100,
    ordinaryHours,
    dailyOrdinary: ordinaryJeon / 100,
    usesOrdinary,
    baseDaily: baseJeon / 100,
    capped,
    appliedBase: appliedBaseJeon / 100,
    byRate,
    dailyHours,
    lowerHours,
    minBase: minBaseJeon / 100,
    lowerLimit,
    upperLimit,
    // 하한이 상한보다 높아진 경우 (2027년 1일 8시간: 68,480원 > 68,100원)
    inverted: lowerLimit > upperLimit,
    usesLower,
    dailyBenefit,
    insuredYears: years,
    bracket,
    benefitDays,
    total,
  };
}

/** 피보험기간(년)에 맞는 별표 1의 칸 번호. */
export function bracketOf(years) {
  let index = 0;
  INSURED_BRACKETS.forEach((from, i) => {
    if (years >= from) index = i;
  });
  return index;
}

/** 소정급여일수 (별표 1). */
export function benefitDaysFor(years, over50) {
  return BENEFIT_DAYS[over50 ? 'over50' : 'under50'][bracketOf(years)];
}

/** 하한액(최저구직급여일액): 이직일 당시 최저시급 × 1일 소정근로시간(4~8시간) × 80%. */
export function lowerLimitFor(dateText, hours) {
  const rule = ruleFor(parseDate(dateText));
  const lowerHours = Math.min(Math.max(hours, LOWER_MIN_HOURS), LOWER_MAX_HOURS);
  return Math.floor((Math.round(rule.minimumWage * lowerHours * 100) * LOWER_RATE) / 10000);
}

/** 상한액: 기초일액 상한 × 60%. */
export function upperLimitFor(dateText) {
  return Math.floor((ruleFor(parseDate(dateText)).baseCap * 100 * BENEFIT_RATE) / 10000);
}

function ruleFor(dayNumber) {
  if (dayNumber === null) return null;
  let found = null;
  for (const rule of UNEMPLOYMENT_RULES) {
    if (dayNumber >= parseDate(rule.from)) found = rule;
  }
  return found;
}

/** 입사일부터 이직일 다음 날까지 채운 햇수. */
function completedYears(start, leaveDate) {
  let years = 0;
  while (addYears(start, years + 1) <= leaveDate) years += 1;
  return years;
}

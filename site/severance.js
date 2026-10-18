// 퇴직금 계산 로직.
// 근로자퇴직급여 보장법 제4조·제8조, 근로기준법 제2조(평균임금)를 따르고,
// 기간·반올림 방식은 고용노동부 퇴직금 계산기(moel.go.kr/retirementpayCal.do)와 맞춘다.

/** 퇴직금이 생기는 최소 주 소정근로시간 (4주 평균). */
export const SEVERANCE_MIN_WEEKLY_HOURS = 15;

/** 통상 근로자의 주 소정근로일수. 단시간근로자의 1일 소정근로시간을 구할 때 나누는 값. */
const FULL_TIME_DAYS_PER_WEEK = 5;

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * 'YYYY-MM-DD'를 날짜 번호(1970-01-01부터 센 날 수)로 바꾼다. 없는 날짜면 null.
 * 시간대에 따라 하루가 밀리지 않게 UTC로만 계산한다.
 */
export function parseDate(text) {
  const match = DATE_PATTERN.exec(String(text));
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const time = Date.UTC(year, month - 1, day);
  const date = new Date(time);
  // 2월 30일처럼 넘어간 날짜는 받지 않는다.
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return time / DAY_MS;
}

/** 날짜 번호를 'YYYY-MM-DD'로. */
export function formatDate(dayNumber) {
  return new Date(dayNumber * DAY_MS).toISOString().slice(0, 10);
}

/** 날짜 번호를 '2027.10.1.'처럼 화면용으로. */
export function formatDateKo(dayNumber) {
  const date = new Date(dayNumber * DAY_MS);
  return `${date.getUTCFullYear()}.${date.getUTCMonth() + 1}.${date.getUTCDate()}.`;
}

/**
 * 퇴직금 계산.
 * - lastWorkDate: 마지막으로 일한 날. 퇴직일은 그다음 날이다 (고용노동부 계산기와 같은 기준).
 * - weeklyHours: 4주 평균 1주 소정근로시간.
 * - hourlyWage: 시급. 1일 통상임금과, 임금을 추정할 때 쓴다.
 * - wageMode: 'estimate'면 시급·근무시간으로 3개월 임금을 추정, 'direct'면 threeMonthWages를 그대로 쓴다.
 * - annualBonus, annualLeavePay: 퇴직 전 1년 동안의 상여금·연차수당. 3/12만 3개월 임금에 더한다.
 */
export function calculateSeverance({
  startDate,
  lastWorkDate,
  weeklyHours,
  hourlyWage,
  wageMode = 'estimate',
  threeMonthWages = 0,
  annualBonus = 0,
  annualLeavePay = 0,
}) {
  const start = parseDate(startDate);
  const last = parseDate(lastWorkDate);
  if (start === null || last === null) return { valid: false, error: '입사일과 마지막 근무일을 모두 넣어 주세요.' };
  if (last < start) return { valid: false, error: '마지막 근무일이 입사일보다 빨라요.' };

  const retireDate = last + 1;
  const serviceDays = retireDate - start;

  // 계속근로기간 1년 이상: 퇴직일이 입사일의 1년 뒤 같은 날 이후여야 한다.
  // 2월 29일 입사면 다음 해 3월 1일이 1년 되는 날이다 (2월 28일까지 일하면 1년).
  const oneYearDate = addYears(start, 1);
  const enoughService = retireDate >= oneYearDate;
  const enoughHours = weeklyHours >= SEVERANCE_MIN_WEEKLY_HOURS;

  // 평균임금 산정기간: 퇴직일 전날까지 거꾸로 3개월 (퇴직일 3개월 전 같은 날부터).
  const periodStart = Math.max(subtractMonths(retireDate, 3), start);
  const periodDays = retireDate - periodStart;

  const wage = Math.max(hourlyWage, 0);
  const holidayHours = enoughHours ? (Math.min(weeklyHours, 40) / 40) * 8 : 0;
  const weeklyPay = wage * (weeklyHours + holidayHours);
  const wages =
    wageMode === 'direct' ? Math.max(Math.round(threeMonthWages), 0) : Math.round((weeklyPay * periodDays) / 7);

  // 금액은 전(1/100원) 단위 정수로 계산해서 소수 오차를 없앤다.
  const totalJeon = wages * 100 + Math.round(annualBonus * 25) + Math.round(annualLeavePay * 25);
  // 1일 평균임금: 전 단위에서 올림 (고용노동부 계산기와 같은 방식).
  const averageJeon = Math.floor((totalJeon + periodDays - 1) / periodDays);

  // 1일 통상임금 = 시급 × 1일 소정근로시간. 단시간근로자의 1일 소정근로시간은
  // 주 소정근로시간을 통상 근로자의 주 근무일수(5일)로 나눈 값이다 (하루 8시간이 상한).
  const dailyHours = Math.min(weeklyHours, 40) / FULL_TIME_DAYS_PER_WEEK;
  const ordinaryJeon = Math.round(wage * dailyHours * 100);

  // 평균임금이 통상임금보다 적으면 통상임금을 평균임금으로 한다 (근로기준법 제2조 제2항).
  const usesOrdinary = ordinaryJeon > averageJeon;
  const appliedJeon = usesOrdinary ? ordinaryJeon : averageJeon;

  const severanceOf = (dailyJeon) => Math.round((dailyJeon * 30 * serviceDays) / 36500);
  const eligible = enoughService && enoughHours;

  return {
    valid: true,
    eligible,
    enoughService,
    enoughHours,
    daysUntilEligible: enoughService ? 0 : oneYearDate - retireDate,
    retireDate: formatDate(retireDate),
    oneYearDate: formatDate(oneYearDate),
    serviceDays,
    periodStart: formatDate(periodStart),
    periodEnd: formatDate(retireDate - 1),
    periodDays,
    threeMonthWages: wages,
    bonusAddition: annualBonus / 4,
    leaveAddition: annualLeavePay / 4,
    totalWages: totalJeon / 100,
    dailyAverage: averageJeon / 100,
    dailyHours,
    dailyOrdinary: ordinaryJeon / 100,
    usesOrdinary,
    appliedDaily: appliedJeon / 100,
    severanceByAverage: severanceOf(averageJeon),
    severance: eligible ? severanceOf(appliedJeon) : 0,
    // 받을 수 없을 때도 조건을 채웠다면 얼마인지 참고로 보여 준다.
    severanceIfEligible: severanceOf(appliedJeon),
  };
}

/** 같은 월·일로 n년 뒤. 없는 날짜(2월 29일)는 다음 날로 넘어간다. */
export function addYears(dayNumber, years) {
  const date = new Date(dayNumber * DAY_MS);
  return Date.UTC(date.getUTCFullYear() + years, date.getUTCMonth(), date.getUTCDate()) / DAY_MS;
}

/**
 * n개월 전 같은 날. 그 달에 같은 날이 없으면(5월 31일의 3개월 전 = 2월 31일)
 * 그다음 달 1일부터 센다. 그래서 퇴직일이 5월 31일이면 기간은 3월 1일~5월 30일이다.
 */
export function subtractMonths(dayNumber, months) {
  const date = new Date(dayNumber * DAY_MS);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() - months;
  const day = date.getUTCDate();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const time = day <= lastDay ? Date.UTC(year, month, day) : Date.UTC(year, month + 1, 1);
  return time / DAY_MS;
}

/** 소수(전)가 있으면 둘째 자리까지, 없으면 원 단위로. */
export const formatWonDetail = (amount) =>
  `${amount.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}원`;

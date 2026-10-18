// 연차휴가·연차수당 계산 로직 (입사일 기준).
// 근로기준법 제60조(연차 유급휴가), 제18조 제3항(주 15시간 미만 제외), 시행령 별표 1(5인 미만 미적용)·별표 2(단시간근로자),
// 대법원 2021. 10. 14. 선고 2021다227100 판결, 2022. 9. 7. 선고 2022다245419 판결과
// 고용노동부 행정해석 변경(2021. 12. 16. 시행)을 따른다: 연차는 근로를 마친 '다음 날'에도 근로관계가 있어야 생긴다.

import { addYears, formatDate, parseDate } from './severance.js';

/** 연차휴가가 생기는 최소 주 소정근로시간 (4주 평균). */
export const ANNUAL_LEAVE_MIN_WEEKLY_HOURS = 15;

/** 통상 근로자의 주 소정근로시간. 단시간근로자의 연차 시간을 이 값에 대한 비율로 줄인다. */
export const FULL_TIME_WEEKLY_HOURS = 40;

/** 계속 근로 1년 미만일 때 1개월 개근마다 1일씩, 최대 11일. */
export const FIRST_YEAR_MAX_DAYS = 11;

const BASE_DAYS = 15;
const MAX_DAYS = 25;

/**
 * 근속 n년을 채운 다음 날 생기는 연차 일수 (그해 출근율 80% 이상일 때).
 * 15일에 최초 1년을 넘는 근속 매 2년마다 1일을 더하고, 25일이 한도다 (제60조 제1항·제4항).
 */
export function annualDaysFor(years) {
  return Math.min(BASE_DAYS + Math.floor((years - 1) / 2), MAX_DAYS);
}

/**
 * 연차 일수를 시간으로. 단시간근로자는 통상 근로자 연차 × (주 소정근로시간 ÷ 40) × 8시간이고,
 * 1시간 미만은 1시간으로 본다 (시행령 별표 2 제4호 나목). 주 40시간 이상이면 1일 8시간.
 */
export function leaveHoursFor(days, weeklyHours) {
  const ratio = Math.min(weeklyHours, FULL_TIME_WEEKLY_HOURS) / FULL_TIME_WEEKLY_HOURS;
  // 0.1시간 단위 입력에서 생기는 소수 오차(60.00000001 등)로 올림되지 않게 아주 작은 값을 뺀다.
  return Math.ceil(days * ratio * 8 - 1e-9);
}

/** 연차 1일이 몇 시간인지 (사용한 연차를 일로 넣었을 때 시간으로 바꾸는 값). */
export function dailyLeaveHours(weeklyHours) {
  return (Math.min(weeklyHours, FULL_TIME_WEEKLY_HOURS) / FULL_TIME_WEEKLY_HOURS) * 8;
}

/**
 * n개월 뒤 같은 날. 그 달에 같은 날이 없으면(1월 31일의 1개월 뒤) 그다음 달 1일로 넘어간다.
 * addYears(2월 29일 → 다음 해 3월 1일)와 같은 방식이다.
 */
export function addMonths(dayNumber, months) {
  const date = new Date(dayNumber * 86400000);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + months;
  const day = date.getUTCDate();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const time = day <= lastDay ? Date.UTC(year, month, day) : Date.UTC(year, month + 1, 1);
  return time / 86400000;
}

/**
 * 연차휴가와 퇴사 때 받을 연차수당 계산.
 * - lastWorkDate: 마지막 근무일(근로관계가 있는 마지막 날). 아직 다니고 있다면 계산할 날짜.
 * - weeklyHours: 4주 평균 1주 소정근로시간. hourlyWage: 시급(통상임금).
 * - fiveOrMoreEmployees: 상시 5인 이상 사업장인지.
 * - firstYearMissedMonths: 첫 1년 동안 개근하지 못한 달 수.
 * - lowAttendanceYears: { n: 개근한 달 수 } — n년차 출근율이 80% 미만이었던 해.
 *   그해에는 15일 대신 1개월 개근마다 1일이 생긴다 (제60조 제2항).
 * - usedLeave, usedUnit('hours' | 'days'): 지금 쓸 수 있는 연차 중 이미 쓴 만큼.
 */
export function calculateAnnualLeave({
  startDate,
  lastWorkDate,
  weeklyHours,
  hourlyWage,
  fiveOrMoreEmployees = true,
  firstYearMissedMonths = 0,
  lowAttendanceYears = {},
  usedLeave = 0,
  usedUnit = 'hours',
}) {
  const start = parseDate(startDate);
  const last = parseDate(lastWorkDate);
  if (start === null || last === null) return { valid: false, error: '입사일과 마지막 근무일을 모두 넣어 주세요.' };
  if (last < start) return { valid: false, error: '마지막 근무일이 입사일보다 빨라요.' };
  if (addYears(start, 50) <= last) return { valid: false, error: '50년이 넘는 기간은 계산하지 않아요.' };

  const enoughHours = weeklyHours >= ANNUAL_LEAVE_MIN_WEEKLY_HOURS;
  const eligible = enoughHours && fiveOrMoreEmployees;
  const oneYearDate = addYears(start, 1);
  const grants = [];

  // 1년 미만: 1개월 근로를 마친 다음 날(입사일의 k개월 뒤 같은 날)에 1일씩 생긴다.
  // 사용 기간은 최초 1년의 근로가 끝날 때까지다 (제60조 제7항).
  const monthDates = [];
  for (let k = 1; k <= FIRST_YEAR_MAX_DAYS; k += 1) {
    const date = addMonths(start, k);
    if (date > last) break;
    monthDates.push(date);
  }
  if (monthDates.length > 0) {
    const days = Math.max(monthDates.length - Math.max(Math.floor(firstYearMissedMonths), 0), 0);
    grants.push({
      kind: 'monthly',
      date: formatDate(monthDates[0]),
      lastDate: formatDate(monthDates[monthDates.length - 1]),
      months: monthDates.length,
      days,
      // 한 달에 1일씩 따로 생기므로 1시간 미만 올림도 달마다 한다.
      hours: days * leaveHoursFor(1, weeklyHours),
      expires: formatDate(oneYearDate - 1),
      active: last < oneYearDate,
    });
  }

  // 다음에 생길 연차: 1년 미만이면 다음 달 1일, 그 뒤로는 다음 근속 연차.
  let next = null;
  if (monthDates.length < FIRST_YEAR_MAX_DAYS) {
    next = {
      kind: 'monthly',
      date: formatDate(addMonths(start, monthDates.length + 1)),
      days: 1,
      hours: leaveHoursFor(1, weeklyHours),
    };
  }

  // 1년 이상: n년 근로를 마친 다음 날(입사 n주년)에 생기고, 그로부터 1년 동안 쓸 수 있다.
  for (let n = 1; ; n += 1) {
    const date = addYears(start, n);
    const low = Object.hasOwn(lowAttendanceYears, n);
    const days = low ? Math.min(Math.max(Math.floor(lowAttendanceYears[n]), 0), 12) : annualDaysFor(n);
    const grant = {
      kind: 'annual',
      years: n,
      date: formatDate(date),
      lowAttendance: low,
      days,
      hours: leaveHoursFor(days, weeklyHours),
      expires: formatDate(addYears(start, n + 1) - 1),
      active: last < addYears(start, n + 1),
    };
    if (date > last) {
      next ??= grant;
      break;
    }
    grants.push(grant);
  }

  const activeGrants = grants.filter((grant) => grant.active);
  const availableDays = activeGrants.reduce((sum, grant) => sum + grant.days, 0);
  const availableHours = activeGrants.reduce((sum, grant) => sum + grant.hours, 0);
  const expiredHours = grants.filter((grant) => !grant.active).reduce((sum, grant) => sum + grant.hours, 0);

  const hoursPerDay = dailyLeaveHours(weeklyHours);
  const used = Math.max(usedLeave, 0);
  const usedHours = usedUnit === 'days' ? used * hoursPerDay : used;
  const remainingHours = Math.max(availableHours - usedHours, 0);
  const wage = Math.max(hourlyWage, 0);
  const payIfEligible = Math.round(remainingHours * wage);

  return {
    valid: true,
    eligible,
    enoughHours,
    fiveOrMoreEmployees,
    serviceDays: last - start + 1,
    oneYearDate: formatDate(oneYearDate),
    // 딱 1년(마지막 근무일 = 입사 1주년 전날)만 일한 경우. 1주년 날 근로관계가 없어 15일이 생기지 않는다.
    exactlyOneYear: last === oneYearDate - 1,
    grants,
    next,
    daysUntilNext: next ? parseDate(next.date) - last : 0,
    availableDays,
    availableHours,
    expiredHours,
    hoursPerDay,
    usedHours,
    overUsed: usedHours > availableHours,
    remainingHours,
    remainingDays: hoursPerDay > 0 ? remainingHours / hoursPerDay : 0,
    pay: eligible ? payIfEligible : 0,
    payIfEligible,
  };
}

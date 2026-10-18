// 해고예고수당 계산 로직.
// 근로기준법 제26조(해고의 예고), 시행규칙 제4조·별표 1(예외 사유), 시행령 제6조·제9조 별표 2(단시간근로자 1일 통상임금)를 따르고,
// 기간 계산은 고용노동부 해석(근기 68207-1346, 2003.10.20.; 근로기준정책과-1330, 2021.5.4.)과 법제처 해석(21-0320)을 따른다.
import { formatDate, parseDate } from './severance.js';

/** 해고예고 기간(일). 이보다 하루라도 짧으면 30일분 전부를 줘야 한다. */
export const NOTICE_DAYS = 30;

/** 해고예고수당 = 1일 통상임금 × 30일분. */
export const NOTICE_PAY_DAYS = 30;

/** 통상 근로자의 주 소정근로일수. 단시간근로자의 1일 소정근로시간을 구할 때 나누는 값 (시행령 별표 2). */
const FULL_TIME_DAYS_PER_WEEK = 5;

const DAY_MS = 24 * 60 * 60 * 1000;

/** 그만두는 방식. 해고만 해고예고 대상이다. */
export const LEAVE_TYPES = {
  dismissal: '해고',
  expiry: '계약기간 만료',
  resignation: '사직·권고사직',
};

/**
 * 해고예고수당 계산.
 * - leaveType: 'dismissal'(회사가 일방적으로 끝냄), 'expiry'(계약기간 만료), 'resignation'(내가 사직하거나 권고사직에 동의).
 * - noticeDate: 해고를 알린 날. 예고 기간은 그다음 날부터 센다.
 * - lastWorkDate: 근로관계가 끝나는 마지막 날. 해고(퇴직)일은 그다음 날이다.
 * - weeklyHours, hourlyWage: 1일 통상임금 계산용. dailyHours를 주면 그 값을 1일 소정근로시간으로 쓴다.
 * - disaster: 천재·사변 등으로 사업을 계속할 수 없음 (제26조 제2호).
 * - misconduct: 근로자의 고의로 시행규칙 별표 1의 사유에 해당 (제26조 제3호).
 * - smallBusiness: 상시 5명 미만 사업장. 해고예고는 똑같이 적용돼서 금액에는 영향이 없고 안내만 달라진다.
 */
export function calculateDismissalNotice({
  leaveType = 'dismissal',
  startDate,
  noticeDate,
  lastWorkDate,
  weeklyHours,
  hourlyWage,
  dailyHours = null,
  disaster = false,
  misconduct = false,
  smallBusiness = false,
}) {
  const start = parseDate(startDate);
  const last = parseDate(lastWorkDate);
  const notice = parseDate(noticeDate);
  if (start === null || last === null || notice === null) {
    return { valid: false, error: '입사일, 해고 통보일, 마지막 근무일을 모두 넣어 주세요.' };
  }
  if (last < start) return { valid: false, error: '마지막 근무일이 입사일보다 빨라요.' };
  if (notice < start) return { valid: false, error: '해고 통보일이 입사일보다 빨라요.' };

  // 계속 근로기간 3개월: 입사일부터 역(달력)으로 3개월이 끝나는 날까지 근로관계가 이어졌으면 3개월 이상이다.
  // 1월 1일 입사면 3월 31일까지 일한 사람은 3개월 미만이 아니다 (법제처 21-0320, 근로기준정책과-1330).
  const threeMonthDate = monthsCompletedOn(start, 3);
  const underThreeMonths = last < threeMonthDate;

  // 예고 기간: 통보한 날은 빼고(민법 초일 불산입) 다음 날부터 마지막 근무일까지 역일로 센다.
  // 마지막 근무일 뒤에 통보했다면 예고가 없었던 것과 같다.
  const noticeDays = Math.max(last - notice, 0);
  const noticeKept = noticeDays >= NOTICE_DAYS;

  const isDismissal = leaveType === 'dismissal';
  let exception = null;
  if (!isDismissal) exception = leaveType;
  else if (underThreeMonths) exception = 'underThreeMonths';
  else if (disaster) exception = 'disaster';
  else if (misconduct) exception = 'misconduct';

  // 1일 통상임금 = 시급 × 1일 소정근로시간 (시행령 제6조 제3항).
  // 단시간근로자의 1일 소정근로시간 = 4주 소정근로시간 ÷ 4주 동안 통상 근로자의 소정근로일수 (시행령 별표 2).
  // 통상 근로자가 주 5일 일한다고 보고 주 소정근로시간 ÷ 5로 구한다 (하루 8시간이 상한).
  const hours = Math.max(weeklyHours, 0);
  const autoDailyHours = Math.min(hours, 40) / FULL_TIME_DAYS_PER_WEEK;
  const usesCustomHours = dailyHours !== null && dailyHours > 0;
  const appliedDailyHours = usesCustomHours ? Math.min(dailyHours, 8) : autoDailyHours;
  const wage = Math.max(hourlyWage, 0);
  // 금액은 전(1/100원) 단위 정수로 계산해서 소수 오차를 없앤다.
  const dailyJeon = Math.round(wage * appliedDailyHours * 100);
  const payIfOwed = Math.round((dailyJeon * NOTICE_PAY_DAYS) / 100);

  const owed = exception === null && !noticeKept;

  return {
    valid: true,
    leaveType,
    isDismissal,
    smallBusiness,
    serviceDays: last - start + 1,
    threeMonthDate: formatDate(threeMonthDate),
    underThreeMonths,
    noticeDays,
    noticeKept,
    shortBy: noticeKept ? 0 : NOTICE_DAYS - noticeDays,
    // 30일 예고를 지키려면 늦어도 이날까지 알려야 했다.
    latestNoticeDate: formatDate(last - NOTICE_DAYS),
    // 이 통보일로 예고를 지키려면 이날까지 근로관계가 이어져야 한다.
    earliestLastDate: formatDate(notice + NOTICE_DAYS),
    retireDate: formatDate(last + 1),
    exception,
    autoDailyHours,
    usesCustomHours,
    dailyHours: appliedDailyHours,
    dailyOrdinary: dailyJeon / 100,
    owed,
    pay: owed ? payIfOwed : 0,
    // 받을 수 없을 때도 예외가 아니었다면 얼마였는지 참고로 보여 준다.
    payIfOwed,
  };
}

/**
 * 시작일부터 n개월이 끝나는 날 (민법 제160조).
 * 마지막 달의 같은 날 전날로 끝나고, 그 달에 같은 날이 없으면 그 달 말일로 끝난다.
 * 1월 1일 → 3월 31일, 11월 30일 → 다음 해 2월 말일, 1월 31일 → 4월 30일.
 */
export function monthsCompletedOn(dayNumber, months) {
  const date = new Date(dayNumber * DAY_MS);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + months;
  const day = date.getUTCDate();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const time = day <= lastDay ? Date.UTC(year, month, day) - DAY_MS : Date.UTC(year, month, lastDay);
  return time / DAY_MS;
}

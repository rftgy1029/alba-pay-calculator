// 알바 급여 계산 로직.
// lib/pay_calculator.dart 와 같은 규칙·반올림을 쓴다 (앱과 웹의 결과가 같아야 한다).

/** 한 달 평균 주 수 (365일 / 7일 / 12개월 ≈ 4.345주). */
export const WEEKS_PER_MONTH = 365 / 7 / 12;

/** 주휴수당이 생기는 최소 주 소정근로시간. */
export const WEEKLY_HOLIDAY_MIN_HOURS = 15;

/** 4대보험 가입 대상이 되는 월 소정근로시간 기준 (이 시간 미만이면 대체로 제외). */
export const INSURANCE_MIN_MONTHLY_HOURS = 60;

/**
 * 연도별 기준값. 요율은 근로자 부담분.
 * pending: 아직 확정 발표 전이라 직전 연도 값을 쓰는 항목.
 */
export const YEARS = {
  2026: {
    minimumWage: 10320,
    pension: 0.0475,
    health: 0.03595,
    longTermCare: 0.1314, // 건강보험료 대비
    employment: 0.009,
    pending: [],
  },
  2027: {
    minimumWage: 10700,
    pension: 0.05,
    health: 0.03595,
    longTermCare: 0.1314,
    employment: 0.009,
    pending: ['장기요양보험', '고용보험'],
  },
};

export const DEDUCTIONS = {
  none: '없음',
  freelance33: '3.3%',
  insurance4: '4대보험',
};

/** 오늘 날짜에 맞는 연도. 표에 없는 연도면 가장 가까운 연도를 쓴다. */
export function defaultYear(today = new Date()) {
  const years = Object.keys(YEARS).map(Number);
  const year = today.getFullYear();
  return Math.min(Math.max(year, Math.min(...years)), Math.max(...years));
}

export function calculatePay({
  year,
  hourlyWage,
  hoursPerDay,
  daysPerWeek,
  nightHoursPerDay = 0,
  fiveOrMoreEmployees = true,
  deduction = 'none',
}) {
  const rates = YEARS[year];
  const wage = hourlyWage;
  const days = daysPerWeek;
  const nightPerDay = clamp(nightHoursPerDay, 0, hoursPerDay);

  const weeklyWorkHours = hoursPerDay * days;

  // 소정근로시간: 하루 8시간, 주 40시간을 넘는 부분은 연장근로로 본다.
  const weeklyContractHours = clamp(Math.min(hoursPerDay, 8) * days, 0, 40);

  const hasWeeklyHolidayPay = weeklyContractHours >= WEEKLY_HOLIDAY_MIN_HOURS;
  const weeklyHolidayHours = hasWeeklyHolidayPay ? (weeklyContractHours / 40) * 8 : 0;

  const weeklyOvertimeHours = fiveOrMoreEmployees ? weeklyWorkHours - weeklyContractHours : 0;
  const weeklyNightHours = fiveOrMoreEmployees ? nightPerDay * days : 0;

  const weekly = withGross({
    basePay: won(weeklyWorkHours * wage),
    weeklyHolidayPay: won(weeklyHolidayHours * wage),
    overtimePay: won(weeklyOvertimeHours * wage * 0.5),
    nightPay: won(weeklyNightHours * wage * 0.5),
  });

  // 월 환산은 시간 단위로 먼저 반올림한다 (주 40시간 → 월 209시간 관행과 일치).
  const monthly = withGross({
    basePay: toMonthlyHours(weeklyWorkHours) * wage,
    weeklyHolidayPay: toMonthlyHours(weeklyHolidayHours) * wage,
    overtimePay: won(toMonthlyHours(weeklyOvertimeHours) * wage * 0.5),
    nightPay: won(toMonthlyHours(weeklyNightHours) * wage * 0.5),
  });

  const deductions = deductionItems(deduction, monthly.gross, rates);
  const totalDeduction = deductions.reduce((sum, item) => sum + item.amount, 0);
  const monthlyContractHours = toMonthlyHours(weeklyContractHours);

  return {
    weekly,
    monthly,
    deductions,
    totalDeduction,
    monthlyNet: monthly.gross - totalDeduction,
    weeklyWorkHours,
    weeklyContractHours,
    monthlyContractHours,
    hasWeeklyHolidayPay,
    mayBeExemptFromInsurance: monthlyContractHours < INSURANCE_MIN_MONTHLY_HOURS,
  };
}

function deductionItems(deduction, monthlyGross, rates) {
  switch (deduction) {
    case 'freelance33': {
      const incomeTax = floor10(monthlyGross * 0.03);
      return [
        { label: '소득세 (3%)', amount: incomeTax },
        { label: '지방소득세 (0.3%)', amount: floor10(incomeTax * 0.1) },
      ];
    }
    case 'insurance4': {
      const health = floor10(monthlyGross * rates.health);
      return [
        { label: `국민연금 (${percent(rates.pension)})`, amount: floor10(monthlyGross * rates.pension) },
        { label: `건강보험 (${percent(rates.health)})`, amount: health },
        { label: '장기요양보험', amount: floor10(health * rates.longTermCare) },
        { label: `고용보험 (${percent(rates.employment)})`, amount: floor10(monthlyGross * rates.employment) },
      ];
    }
    default:
      return [];
  }
}

function withGross(items) {
  return {
    ...items,
    gross: items.basePay + items.weeklyHolidayPay + items.overtimePay + items.nightPay,
  };
}

const toMonthlyHours = (weeklyHours) => Math.round(weeklyHours * WEEKS_PER_MONTH);
const won = (amount) => Math.round(amount);
const floor10 = (amount) => Math.floor(amount / 10) * 10;
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const percent = (rate) => `${Number((rate * 100).toFixed(3))}%`;

export const formatWon = (amount) => `${amount.toLocaleString('ko-KR')}원`;

export const formatHours = (hours) =>
  Number.isInteger(hours) ? String(hours) : hours.toFixed(1);

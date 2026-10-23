// test/pay_calculator_test.dart 와 같은 기준값으로 웹 계산 로직을 확인한다. 퇴직금(severance.js), 실업급여(unemployment.js), 해고예고수당(dismissal-notice.js), 연차수당(annual-leave.js)은 웹에만 있다.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { YEARS, autoDeduction, calculatePay, defaultYear, formatWon } from './calc.js';
import { calculateDismissalNotice, monthsCompletedOn } from './dismissal-notice.js';
import { calculateSeverance, formatDate, parseDate } from './severance.js';
import { benefitDaysFor, calculateUnemployment, lowerLimitFor, upperLimitFor } from './unemployment.js';
import { addMonths, annualDaysFor, calculateAnnualLeave, leaveHoursFor } from './annual-leave.js';

const fullTime = { hourlyWage: 10320, hoursPerDay: 8, daysPerWeek: 5 };

test('2026년 주 40시간 최저시급이면 월급 2,156,880원 (월 209시간)', () => {
  const result = calculatePay({ year: 2026, ...fullTime });

  assert.equal(result.monthly.gross, 2156880);
  assert.equal(result.weekly.basePay, 412800);
  assert.equal(result.weekly.weeklyHolidayPay, 82560);
});

test('2027년 주 40시간 최저시급이면 월급 2,236,300원', () => {
  const result = calculatePay({ year: 2027, ...fullTime, hourlyWage: 10700 });

  assert.equal(result.monthly.gross, 2236300);
});

test('주 15시간 미만이면 주휴수당 없음', () => {
  const result = calculatePay({ year: 2026, hourlyWage: 10320, hoursPerDay: 4, daysPerWeek: 3 });

  assert.equal(result.hasWeeklyHolidayPay, false);
  assert.equal(result.weekly.weeklyHolidayPay, 0);
  assert.equal(result.mayBeExemptFromInsurance, true);
});

test('주 20시간이면 주휴수당은 4시간분', () => {
  const result = calculatePay({ year: 2026, hourlyWage: 10000, hoursPerDay: 4, daysPerWeek: 5 });

  assert.equal(result.weekly.weeklyHolidayPay, 40000);
});

test('5인 이상: 하루 10시간이면 2시간씩 연장 가산', () => {
  const result = calculatePay({ year: 2026, hourlyWage: 10000, hoursPerDay: 10, daysPerWeek: 5 });

  assert.equal(result.weeklyContractHours, 40);
  assert.equal(result.weekly.basePay, 500000);
  assert.equal(result.weekly.overtimePay, 50000);
  assert.equal(result.weekly.weeklyHolidayPay, 80000);
});

test('5인 미만: 연장·야간 가산 없음, 주휴수당은 있음', () => {
  const result = calculatePay({
    year: 2026,
    hourlyWage: 10000,
    hoursPerDay: 10,
    daysPerWeek: 5,
    nightHoursPerDay: 4,
    fiveOrMoreEmployees: false,
  });

  assert.equal(result.weekly.overtimePay, 0);
  assert.equal(result.weekly.nightPay, 0);
  assert.equal(result.weekly.weeklyHolidayPay, 80000);
});

test('야간 시간은 하루 근무시간을 넘을 수 없음', () => {
  const result = calculatePay({
    year: 2026,
    hourlyWage: 10000,
    hoursPerDay: 4,
    daysPerWeek: 5,
    nightHoursPerDay: 8,
  });

  assert.equal(result.weekly.nightPay, 100000);
});

test('야간 2시간: 월 야간수당은 월 환산 43시간 기준', () => {
  const result = calculatePay({ year: 2026, ...fullTime, nightHoursPerDay: 2 });

  assert.equal(result.weekly.nightPay, 51600);
  assert.equal(result.monthly.nightPay, 221880);
  assert.equal(result.monthly.gross, 2378760);
});

test('3.3% 공제', () => {
  const result = calculatePay({ year: 2026, ...fullTime, deduction: 'freelance33' });

  assert.equal(result.totalDeduction, 64700 + 6470);
  assert.equal(result.monthlyNet, 2156880 - 71170);
});

test('2026년 4대보험 공제', () => {
  const result = calculatePay({ year: 2026, ...fullTime, deduction: 'insurance4' });

  assert.deepEqual(result.deductions.map((d) => d.amount), [102450, 77530, 10180, 19410]);
  assert.equal(result.deductions[0].label, '국민연금 (4.75%)');
});

test('2027년 4대보험 공제: 국민연금 5%', () => {
  const result = calculatePay({ year: 2027, ...fullTime, hourlyWage: 10700, deduction: 'insurance4' });

  // 2,236,300 × 5% = 111,815 → 111,810
  assert.equal(result.deductions[0].amount, 111810);
  assert.equal(result.deductions[0].label, '국민연금 (5%)');
});

test('기본 연도는 오늘 날짜를 따르고, 표 밖이면 가까운 연도', () => {
  assert.equal(defaultYear(new Date(2026, 9, 15)), 2026);
  assert.equal(defaultYear(new Date(2027, 0, 1)), 2027);
  assert.equal(defaultYear(new Date(2030, 5, 1)), 2027);
  assert.equal(defaultYear(new Date(2020, 5, 1)), 2026);
});

test('기본 공제: 월 60시간 이상이면 4대보험, 미만이면 공제 없음', () => {
  assert.equal(autoDeduction({ hoursPerDay: 8, daysPerWeek: 5 }), 'insurance4'); // 월 174시간
  assert.equal(autoDeduction({ hoursPerDay: 4, daysPerWeek: 3 }), 'none'); // 월 52시간
  assert.equal(autoDeduction({ hoursPerDay: 3.5, daysPerWeek: 4 }), 'insurance4'); // 주 14시간 → 월 61시간
  assert.equal(autoDeduction({ hoursPerDay: 3, daysPerWeek: 4 }), 'none'); // 주 12시간 → 월 52시간
  // 연장근로는 소정근로시간에 넣지 않는다: 하루 12시간 × 1일 → 소정 8시간 → 월 35시간
  assert.equal(autoDeduction({ hoursPerDay: 12, daysPerWeek: 1 }), 'none');
});

test('금액 표시', () => {
  assert.equal(formatWon(2156880), '2,156,880원');
  assert.equal(formatWon(0), '0원');
});

// weekly-holiday-pay/index.html 금액표가 계산기 결과와 같아야 한다.
test('주휴수당 설명 글의 2027년 금액표', () => {
  const rows = [
    // [하루 근무시간, 주 근무일수, 주 주휴수당, 월 주휴수당]
    [3, 4, 0, 0],
    [3, 5, 32100, 139100],
    [4, 5, 42800, 181900],
    [5, 5, 53500, 235400],
    [6, 5, 64200, 278200],
    [8, 5, 85600, 374500],
  ];
  for (const [hoursPerDay, daysPerWeek, weekly, monthly] of rows) {
    const result = calculatePay({ year: 2027, hourlyWage: 10700, hoursPerDay, daysPerWeek });
    assert.equal(result.weekly.weeklyHolidayPay, weekly);
    assert.equal(result.monthly.weeklyHolidayPay, monthly);
  }
});

// night-shift-pay/index.html 예시와 금액표가 계산기 결과와 같아야 한다.
test('야간수당 설명 글의 2027년 예시와 금액표', () => {
  const pay = (hoursPerDay, nightHoursPerDay, daysPerWeek = 5, fiveOrMoreEmployees = true) =>
    calculatePay({ year: 2027, hourlyWage: 10700, hoursPerDay, nightHoursPerDay, daysPerWeek, fiveOrMoreEmployees });

  // 예시 1: 편의점 야간 8시간 중 야간 7시간, 주 5일
  const convenience = pay(8, 7);
  assert.equal(convenience.weekly.nightPay, 187250);
  assert.equal(convenience.weekly.gross, 700850);
  assert.equal(convenience.monthly.gross, 3049500);
  assert.equal(pay(8, 7, 5, false).monthly.gross, 2236300);

  // 예시 2: 6시간 중 야간 2시간, 주 3일
  assert.equal(pay(6, 2, 3).weekly.nightPay, 32100);

  // 연장과 겹치는 예시: 하루 10시간 중 야간 8시간 (하루치 = 주 5일 ÷ 5)
  const overlap = pay(10, 8);
  assert.equal(overlap.weekly.basePay / 5, 107000);
  assert.equal(overlap.weekly.overtimePay / 5, 10700);
  assert.equal(overlap.weekly.nightPay / 5, 42800);

  const rows = [
    // [하루 야간시간, 주 야간수당, 월 야간수당]
    [1, 26750, 117700],
    [2, 53500, 230050],
    [4, 107000, 465450],
    [6, 160500, 695500],
    [8, 214000, 930900],
  ];
  for (const [night, weekly, monthly] of rows) {
    const result = pay(8, night);
    assert.equal(result.weekly.nightPay, weekly);
    assert.equal(result.monthly.nightPay, monthly);
  }
});

// tax-33-vs-insurance/index.html 의 실수령액 비교 금액이 계산기 결과와 같아야 한다.
test('3.3% vs 4대보험 설명 글의 금액', () => {
  const pay = (year, hourlyWage, hoursPerDay, deduction) =>
    calculatePay({ year, hourlyWage, hoursPerDay, daysPerWeek: 5, deduction });

  const full33 = pay(2027, 10700, 8, 'freelance33');
  const fullIns = pay(2027, 10700, 8, 'insurance4');
  assert.equal(full33.monthly.gross, 2236300);
  assert.equal(full33.totalDeduction, 73780);
  assert.equal(full33.monthlyNet, 2162520);
  assert.equal(fullIns.totalDeduction, 222880);
  assert.equal(fullIns.monthlyNet, 2013420);
  assert.deepEqual(fullIns.deductions.map((item) => item.amount), [111810, 80390, 10560, 20120]);

  const half33 = pay(2027, 10700, 4, 'freelance33');
  const halfIns = pay(2027, 10700, 4, 'insurance4');
  assert.equal(half33.monthly.gross, 1112800);
  assert.equal(half33.monthlyNet, 1076090);
  assert.equal(halfIns.monthlyNet, 1001900);

  assert.equal(pay(2026, 10320, 8, 'freelance33').totalDeduction, 71170);
  assert.equal(pay(2026, 10320, 8, 'insurance4').totalDeduction, 209570);
});

// minimum-wage-monthly/index.html 의 월급표와 비교 금액이 계산기 결과와 같아야 한다.
test('최저시급 월급 환산 설명 글의 금액', () => {
  const pay = (year, hourlyWage, hoursPerDay, daysPerWeek = 5, deduction = 'none') =>
    calculatePay({ year, hourlyWage, hoursPerDay, daysPerWeek, deduction });
  const hoursOf = (amount) => amount / 10700;

  const rows = [
    // [하루 근무시간, 주 근무일수, 월 근무시간, 월 주휴시간, 월급]
    [3, 4, 52, 0, 556400],
    [3, 5, 65, 13, 834600],
    [4, 5, 87, 17, 1112800],
    [5, 5, 109, 22, 1401700],
    [6, 5, 130, 26, 1669200],
    [7, 5, 152, 30, 1947400],
    [8, 5, 174, 35, 2236300],
  ];
  for (const [hoursPerDay, daysPerWeek, workHours, holidayHours, monthly] of rows) {
    const result = pay(2027, 10700, hoursPerDay, daysPerWeek);
    assert.equal(hoursOf(result.monthly.basePay), workHours);
    assert.equal(hoursOf(result.monthly.weeklyHolidayPay), holidayHours);
    assert.equal(result.monthly.gross, monthly);
  }

  // 2026년과 비교: 일급·주급·월급·연봉
  const full26 = pay(2026, 10320, 8);
  const full27 = pay(2027, 10700, 8);
  assert.equal(full26.weekly.basePay / 5, 82560);
  assert.equal(full27.weekly.basePay / 5, 85600);
  assert.equal(full26.weekly.gross, 495360);
  assert.equal(full27.weekly.gross, 513600);
  assert.equal(full27.monthly.gross - full26.monthly.gross, 79420);
  assert.equal(full27.weekly.basePay / 5 - full26.weekly.basePay / 5, 3040);
  assert.equal(full27.weekly.gross - full26.weekly.gross, 18240);
  assert.equal((full27.monthly.gross - full26.monthly.gross) * 12, 953040);
  assert.equal(full26.monthly.gross * 12, 25882560);
  assert.equal(full27.monthly.gross * 12, 26835600);
  assert.equal(full27.monthly.weeklyHolidayPay, 374500);
  assert.equal(full27.monthly.basePay, 1861800);
  assert.equal(pay(2027, 10700, 4).monthly.gross - pay(2026, 10320, 4).monthly.gross, 39520);

  // 4대보험 공제 후 실수령액
  const half = pay(2027, 10700, 4, 5, 'insurance4');
  assert.equal(half.totalDeduction, 110900);
  assert.equal(half.monthlyNet, 1001900);
  const full = pay(2027, 10700, 8, 5, 'insurance4');
  assert.equal(full.totalDeduction, 222880);
  assert.equal(full.monthlyNet, 2013420);

  // 수습 감액 90%: 9,630원 × 209시간
  assert.equal(Math.round(YEARS[2027].minimumWage * 0.9), 9630);
  assert.equal(pay(2027, 9630, 8).monthly.gross, 2012670);

  // 최저임금 위반 확인 예시: 2,000,000원이면 기본급이 236,300원 모자람
  assert.equal(full27.monthly.gross - 2000000, 236300);
});

// ---------- 퇴직금 (severance.js) ----------

const severance = (input) => calculateSeverance({ hourlyWage: 10700, weeklyHours: 40, ...input });

test('퇴직금: 고용노동부 계산 예제와 같은 결과', () => {
  // moel.go.kr/retirementpayCal.do 의 예제: 2014.10.2. 입사, 퇴직일 2017.9.16.
  const result = calculateSeverance({
    startDate: '2014-10-02',
    lastWorkDate: '2017-09-15',
    weeklyHours: 40,
    hourlyWage: 0,
    wageMode: 'direct',
    threeMonthWages: 6000000 + 1080000,
    annualBonus: 4000000,
    annualLeavePay: 60000 * 5,
  });

  assert.equal(result.serviceDays, 1080);
  assert.equal(result.periodStart, '2017-06-16');
  assert.equal(result.periodDays, 92);
  assert.equal(result.bonusAddition, 1000000);
  assert.equal(result.leaveAddition, 75000);
  assert.equal(result.dailyAverage, 88641.31); // 88,641원 31전 (전 단위 올림)
  assert.equal(result.usesOrdinary, false);
  assert.equal(result.severance, 7868434);
});

test('퇴직금: 1년이 안 되거나 주 15시간 미만이면 대상 아님', () => {
  const short = severance({ startDate: '2026-03-02', lastWorkDate: '2027-02-28' });
  assert.equal(short.eligible, false);
  assert.equal(short.enoughService, false);
  assert.equal(short.daysUntilEligible, 1);
  assert.equal(short.severance, 0);

  const fewHours = severance({ startDate: '2025-01-01', lastWorkDate: '2027-12-31', weeklyHours: 14 });
  assert.equal(fewHours.eligible, false);
  assert.equal(fewHours.enoughService, true);
  assert.equal(fewHours.enoughHours, false);
  assert.equal(fewHours.severance, 0);

  assert.equal(severance({ startDate: '2025-01-01', lastWorkDate: '2027-12-31', weeklyHours: 15 }).eligible, true);
});

test('퇴직금: 1년 딱 맞는 경우 (마지막 근무일 = 입사 1년 뒤 전날)', () => {
  const result = severance({ startDate: '2026-03-02', lastWorkDate: '2027-03-01' });
  assert.equal(result.eligible, true);
  assert.equal(result.retireDate, '2027-03-02');
  assert.equal(result.serviceDays, 365);
  // 1년(365일)이면 30일분: 통상임금 85,600원 × 30
  assert.equal(result.severance, 2568000);
});

test('퇴직금: 윤년 (2월 29일 포함)', () => {
  // 재직일수에 2028년 2월 29일이 들어가 366일
  const leap = severance({ startDate: '2027-03-01', lastWorkDate: '2028-02-29' });
  assert.equal(leap.eligible, true);
  assert.equal(leap.serviceDays, 366);
  assert.equal(leap.periodStart, '2027-12-01');
  assert.equal(leap.periodDays, 91); // 31 + 31 + 29
  assert.equal(leap.severance, Math.round((85600 * 30 * 366) / 365));

  // 2월 29일 입사면 다음 해 2월 28일까지 일해야 1년
  assert.equal(severance({ startDate: '2028-02-29', lastWorkDate: '2029-02-27' }).eligible, false);
  assert.equal(severance({ startDate: '2028-02-29', lastWorkDate: '2029-02-28' }).eligible, true);

  // 퇴직일 5월 1일: 평년 89일, 윤년 90일
  assert.equal(severance({ startDate: '2025-01-01', lastWorkDate: '2027-04-30' }).periodDays, 89);
  assert.equal(severance({ startDate: '2025-01-01', lastWorkDate: '2028-04-30' }).periodDays, 90);
  // 퇴직일 5월 31일: 3개월 전 2월 31일이 없어서 3월 1일부터
  assert.equal(severance({ startDate: '2025-01-01', lastWorkDate: '2027-05-30' }).periodStart, '2027-03-01');
});

test('퇴직금: 상여금·연차수당은 3/12만 더함', () => {
  const base = { startDate: '2025-12-01', lastWorkDate: '2027-11-30', wageMode: 'direct', threeMonthWages: 9100000 };
  const without = severance(base);
  const withExtra = severance({ ...base, annualBonus: 1200000, annualLeavePay: 400000 });

  assert.equal(withExtra.bonusAddition, 300000);
  assert.equal(withExtra.leaveAddition, 100000);
  assert.equal(withExtra.totalWages, 9500000);
  assert.equal(without.dailyAverage, 100000);
  assert.equal(withExtra.dailyAverage, 104395.61); // 9,500,000 ÷ 91 = 104,395.604… → 올림
  assert.equal(withExtra.severance, Math.round((10439561 * 30 * 730) / 36500));
});

test('퇴직금: 평균임금이 통상임금보다 적으면 통상임금으로', () => {
  // 주 20시간 추정: 1일 평균임금 36,685.72원 < 1일 통상임금 42,800원
  const result = severance({ startDate: '2027-01-01', lastWorkDate: '2027-12-31', weeklyHours: 20 });
  assert.equal(result.dailyHours, 4);
  assert.equal(result.dailyOrdinary, 42800);
  assert.equal(result.usesOrdinary, true);
  assert.equal(result.appliedDaily, 42800);
  assert.equal(result.severance, 1284000);
  assert.equal(result.severanceByAverage, 1100572);

  // 시급을 넣지 않으면 비교하지 않음
  assert.equal(severance({ startDate: '2027-01-01', lastWorkDate: '2027-12-31', hourlyWage: 0, wageMode: 'direct', threeMonthWages: 3000000 }).usesOrdinary, false);
});

test('퇴직금: 날짜가 없거나 순서가 바뀌면 계산하지 않음', () => {
  assert.equal(severance({ startDate: '', lastWorkDate: '2027-12-31' }).valid, false);
  assert.equal(severance({ startDate: '2027-02-30', lastWorkDate: '2027-12-31' }).valid, false);
  assert.equal(severance({ startDate: '2027-12-31', lastWorkDate: '2027-01-01' }).valid, false);
  assert.equal(parseDate('2028-02-29') - parseDate('2028-02-28'), 1);
});

// severance-pay/index.html 의 예시가 계산기 결과와 같아야 한다.
test('퇴직금 계산기 페이지의 예시', () => {
  const store = severance({ startDate: '2026-09-01', lastWorkDate: '2027-12-31', weeklyHours: 20 });
  assert.equal(store.serviceDays, 487);
  assert.equal(store.periodStart, '2027-10-01');
  assert.equal(store.periodDays, 92);
  assert.equal(calculatePay({ year: 2027, hourlyWage: 10700, hoursPerDay: 4, daysPerWeek: 5 }).weekly.gross, 256800);
  assert.equal(store.threeMonthWages, 3375086);
  assert.equal(store.dailyAverage, 36685.72);
  assert.equal(store.severance, 1713173);
  assert.equal(store.severanceByAverage, 1468434);

  // 야간 편의점: 월급은 야간수당 설명 글의 3,049,500원
  const monthly = calculatePay({ year: 2027, hourlyWage: 10700, hoursPerDay: 8, nightHoursPerDay: 7, daysPerWeek: 5 }).monthly.gross;
  assert.equal(monthly, 3049500);
  const night = severance({ startDate: '2025-12-01', lastWorkDate: '2027-11-30', wageMode: 'direct', threeMonthWages: monthly * 3 });
  assert.equal(night.serviceDays, 730);
  assert.equal(night.periodStart, '2027-09-01');
  assert.equal(night.periodDays, 91);
  assert.equal(night.threeMonthWages, 9148500);
  assert.equal(night.dailyAverage, 100532.97);
  assert.equal(night.usesOrdinary, false);
  assert.equal(night.severance, 6031978);
});

// severance-pay-guide/index.html 의 사례와 근무시간별 표가 계산기 결과와 같아야 한다.
test('퇴직금 설명 글의 사례와 금액표', () => {
  const cafe = severance({ startDate: '2026-03-02', lastWorkDate: '2027-08-31', weeklyHours: 25, annualBonus: 400000 });
  assert.equal(cafe.eligible, true);
  assert.equal(cafe.serviceDays, 548);
  assert.equal(cafe.retireDate, '2027-09-01');
  assert.equal(cafe.periodStart, '2027-06-01');
  assert.equal(cafe.periodDays, 92);
  assert.equal(calculatePay({ year: 2027, hourlyWage: 10700, hoursPerDay: 5, daysPerWeek: 5 }).weekly.gross, 321000);
  assert.equal(cafe.threeMonthWages, 4218857);
  assert.equal(cafe.bonusAddition, 100000);
  assert.equal(cafe.totalWages, 4318857);
  assert.equal(cafe.dailyAverage, 46944.1);
  assert.equal(cafe.dailyOrdinary, 53500);
  assert.equal(cafe.severance, 2409699);
  assert.equal(cafe.severanceByAverage, 2114414);

  // 통상임금 설명의 주 20시간 1일 평균임금(약 36,686원)
  assert.equal(Math.round(256800 / 7), 36686);

  const rows = [
    // [주 소정근로시간, 1일 평균임금(반올림), 1일 통상임금, 퇴직금, 평균임금 기준 퇴직금]
    [15, 27514, 32100, 963000, 825429],
    [20, 36686, 42800, 1284000, 1100572],
    [25, 45857, 53500, 1605000, 1375715],
    [30, 55029, 64200, 1926000, 1650857],
    [40, 73371, 85600, 2568000, 2201143],
  ];
  for (const [weeklyHours, average, ordinary, amount, byAverage] of rows) {
    const result = severance({ startDate: '2027-01-01', lastWorkDate: '2027-12-31', weeklyHours });
    assert.equal(result.serviceDays, 365);
    assert.equal(Math.round(result.dailyAverage), average);
    assert.equal(result.dailyOrdinary, ordinary);
    assert.equal(result.severance, amount);
    assert.equal(result.severanceByAverage, byAverage);
  }
  assert.equal(severance({ startDate: '2027-01-01', lastWorkDate: '2027-12-31', weeklyHours: 14 }).eligible, false);
});

const unemployment = (overrides) =>
  calculateUnemployment({ weeklyHours: 20, workDays: 5, hourlyWage: 10700, ...overrides });

test('실업급여: 피보험 단위기간 180일 경계', () => {
  // 직접 입력: 179일이면 대상 아님, 180일이면 대상
  const base = { startDate: '2027-01-01', lastWorkDate: '2027-12-31', unitMode: 'direct' };
  const short = unemployment({ ...base, unitDays: 179 });
  assert.equal(short.eligible, false);
  assert.equal(short.unitsNeeded, 1);
  assert.equal(unemployment({ ...base, unitDays: 180 }).eligible, true);

  // 어림: 주 5일 + 주휴 1일 = 1주 6일. 210일 근무 → 180일
  const sevenMonths = unemployment({ startDate: '2027-03-04', lastWorkDate: '2027-09-29' });
  assert.equal(sevenMonths.unitDays, 180);
  assert.equal(sevenMonths.eligible, true);
  assert.equal(unemployment({ startDate: '2027-03-05', lastWorkDate: '2027-09-29' }).eligible, false);

  // 18개월보다 오래 일해도 기준기간 안의 날만 센다
  const long = unemployment({ startDate: '2020-01-01', lastWorkDate: '2027-12-31' });
  assert.equal(long.basisStart, '2026-07-01');
  assert.equal(long.unitDays, Math.floor((549 * 6) / 7));
});

test('실업급여: 주 15시간 미만·주 2일 이하는 기준기간 24개월', () => {
  const weekend = unemployment({ startDate: '2027-01-04', lastWorkDate: '2027-12-31', weeklyHours: 14, workDays: 2 });
  assert.equal(weekend.shortTime, true);
  assert.equal(weekend.basisMonths, 24);
  assert.equal(weekend.basisStart, '2026-01-01');
  assert.equal(weekend.unitDays, 103); // 주휴 없음: 1주 2일
  assert.equal(weekend.eligible, false);
  assert.equal(weekend.unitsNeeded, 77);

  // 주 3일 이상이면 18개월
  assert.equal(unemployment({ startDate: '2027-01-04', lastWorkDate: '2027-12-31', weeklyHours: 14, workDays: 3 }).basisMonths, 18);
});

test('실업급여: 1일 구직급여액은 기초일액의 60%, 하한은 최저시급 × 시간 × 80%', () => {
  // 2027년 하한: 1일 소정근로시간별
  assert.deepEqual([8, 7, 6, 5, 4].map((hours) => lowerLimitFor('2027-06-30', hours)), [68480, 59920, 51360, 42800, 34240]);
  // 4시간 이하는 4시간, 8시간 이상은 8시간
  assert.equal(lowerLimitFor('2027-06-30', 2), 34240);
  assert.equal(lowerLimitFor('2027-06-30', 10), 68480);
  // 2026년 하한
  assert.equal(lowerLimitFor('2026-06-30', 8), 66048);
  assert.equal(lowerLimitFor('2026-06-30', 4), 33024);

  // 시급이 높으면 60%가 하한보다 커서 60%
  const high = unemployment({ startDate: '2026-01-01', lastWorkDate: '2027-06-30', weeklyHours: 30, hourlyWage: 15000 });
  assert.equal(high.dailyHours, 6);
  assert.equal(high.baseDaily, 90000); // 통상임금 15,000 × 6
  assert.equal(high.byRate, 54000);
  assert.equal(high.usesLower, false);
  assert.equal(high.dailyBenefit, 54000);
});

test('실업급여: 상한 (2025년 66,000원, 2026년부터 68,100원)', () => {
  assert.equal(upperLimitFor('2025-12-31'), 66000);
  assert.equal(upperLimitFor('2026-01-01'), 68100);
  assert.equal(upperLimitFor('2027-12-31'), 68100);

  // 1일 6시간, 고임금: 기초일액 상한 113,500원 → 68,100원
  const capped = unemployment({ startDate: '2020-01-01', lastWorkDate: '2027-06-30', weeklyHours: 30, hourlyWage: 30000 });
  assert.equal(capped.capped, true);
  assert.equal(capped.appliedBase, 113500);
  assert.equal(capped.dailyBenefit, 68100);
  assert.equal(capped.lowerLimit, 51360);
  assert.equal(capped.inverted, false);

  // 2025년 이직: 기초일액 상한 110,000원
  const old = unemployment({ startDate: '2020-01-01', lastWorkDate: '2025-06-30', weeklyHours: 30, hourlyWage: 30000 });
  assert.equal(old.appliedBase, 110000);
  assert.equal(old.dailyBenefit, 66000);
});

test('실업급여: 2027년 1일 8시간이면 하한 68,480원이 상한 68,100원보다 높아 하한', () => {
  const highWage = unemployment({ startDate: '2020-01-01', lastWorkDate: '2027-06-30', weeklyHours: 40, hourlyWage: 30000 });
  assert.equal(highWage.capped, true);
  assert.equal(highWage.byRate, 68100);
  assert.equal(highWage.lowerLimit, 68480);
  assert.equal(highWage.inverted, true);
  assert.equal(highWage.usesLower, true);
  assert.equal(highWage.dailyBenefit, 68480);

  // 2026년 이직은 역전 없음 (하한 66,048원 < 상한 68,100원)
  const y2026 = unemployment({ startDate: '2020-01-01', lastWorkDate: '2026-06-30', weeklyHours: 40, hourlyWage: 30000 });
  assert.equal(y2026.inverted, false);
  assert.equal(y2026.dailyBenefit, 68100);
});

test('실업급여: 이직 전 1일 소정근로시간 = (주 소정근로시간 + 주휴시간) ÷ 48 × 8', () => {
  assert.equal(unemployment({ startDate: '2027-01-01', lastWorkDate: '2027-12-31', weeklyHours: 40 }).dailyHours, 8);
  assert.equal(unemployment({ startDate: '2027-01-01', lastWorkDate: '2027-12-31', weeklyHours: 25 }).dailyHours, 5);
  assert.equal(unemployment({ startDate: '2027-01-01', lastWorkDate: '2027-12-31', weeklyHours: 15 }).dailyHours, 3);
  // 주 15시간 미만은 주휴 없음: 12 ÷ 48 × 8 = 2시간, 하한은 4시간 기준
  const short = unemployment({ startDate: '2027-01-01', lastWorkDate: '2027-12-31', weeklyHours: 12 });
  assert.equal(short.dailyHours, 2);
  assert.equal(short.lowerHours, 4);
});

test('실업급여: 나이·가입기간별 소정급여일수 경계 (별표 1)', () => {
  const cases = [
    // [가입기간(년), 50세 미만, 50세 이상·장애인]
    [0, 120, 120],
    [0.99, 120, 120],
    [1, 150, 180],
    [2.99, 150, 180],
    [3, 180, 210],
    [4.99, 180, 210],
    [5, 210, 240],
    [9.99, 210, 240],
    [10, 240, 270],
    [30, 240, 270],
  ];
  for (const [years, under50, over50] of cases) {
    assert.equal(benefitDaysFor(years, false), under50, `${years}년 50세 미만`);
    assert.equal(benefitDaysFor(years, true), over50, `${years}년 50세 이상`);
  }

  // 입사일로 가입기간: 1년 딱 맞는 날(입사 1년 뒤 전날까지 근무)부터 1년 이상
  assert.equal(unemployment({ startDate: '2026-03-02', lastWorkDate: '2027-02-28' }).benefitDays, 120);
  assert.equal(unemployment({ startDate: '2026-03-02', lastWorkDate: '2027-03-01' }).benefitDays, 150);
  assert.equal(unemployment({ startDate: '2026-03-02', lastWorkDate: '2027-03-01', over50: true }).benefitDays, 180);
  // 직접 고른 가입기간이 입사일보다 우선
  assert.equal(unemployment({ startDate: '2027-01-01', lastWorkDate: '2027-12-31', insuredYears: 5 }).benefitDays, 210);
});

test('실업급여: 날짜가 없거나 계산 범위 밖이면 계산하지 않음', () => {
  assert.equal(unemployment({ startDate: '2027-01-01', lastWorkDate: '' }).valid, false);
  assert.equal(unemployment({ startDate: '', lastWorkDate: '2027-12-31' }).valid, false);
  assert.equal(unemployment({ startDate: '2027-12-31', lastWorkDate: '2027-01-01' }).valid, false);
  assert.equal(unemployment({ startDate: '2020-01-01', lastWorkDate: '2024-12-31' }).valid, false);
  assert.equal(unemployment({ startDate: '2020-01-01', lastWorkDate: '2028-01-01' }).valid, false);
  // 단위기간과 가입기간을 모두 직접 넣으면 입사일 없이도 계산
  assert.equal(unemployment({ startDate: '', lastWorkDate: '2027-12-31', unitMode: 'direct', unitDays: 200, insuredYears: 1 }).valid, true);
});

// unemployment-benefit/index.html 의 예시가 계산기 결과와 같아야 한다.
test('실업급여 계산기 페이지의 예시', () => {
  const store = unemployment({ startDate: '2026-09-01', lastWorkDate: '2027-12-31' });
  assert.equal(store.eligible, true);
  assert.equal(store.unitDays, 417);
  assert.equal(store.periodStart, '2027-10-01');
  assert.equal(store.periodDays, 92);
  assert.equal(store.threeMonthWages, 3375086);
  assert.equal(store.dailyAverage, 36685.72);
  assert.equal(store.baseDaily, 42800);
  assert.equal(store.byRate, 25680);
  assert.equal(store.lowerLimit, 34240);
  assert.equal(store.dailyBenefit, 34240);
  assert.equal(store.benefitDays, 150);
  assert.equal(store.total, 5136000);

  const monthly = calculatePay({ year: 2027, hourlyWage: 10700, hoursPerDay: 8, daysPerWeek: 5 }).monthly.gross;
  assert.equal(monthly, 2236300);
  const fullTime = unemployment({
    startDate: '2024-03-01',
    lastWorkDate: '2027-11-30',
    weeklyHours: 40,
    wageMode: 'direct',
    threeMonthWages: monthly * 3,
  });
  assert.equal(fullTime.threeMonthWages, 6708900);
  assert.equal(fullTime.periodStart, '2027-09-01');
  assert.equal(fullTime.periodDays, 91);
  assert.equal(fullTime.dailyAverage, 73724.18);
  assert.equal(fullTime.baseDaily, 85600);
  assert.equal(fullTime.byRate, 51360);
  assert.equal(fullTime.dailyBenefit, 68480);
  assert.equal(fullTime.insuredYears, 3);
  assert.equal(fullTime.benefitDays, 180);
  assert.equal(fullTime.total, 12326400);
  assert.equal(fullTime.upperLimit, 68100);
  assert.equal(fullTime.lowerLimit - fullTime.upperLimit, 380);
});

// unemployment-benefit-guide/index.html 의 사례와 하한 표가 계산기 결과와 같아야 한다.
test('실업급여 설명 글의 사례와 하한 표', () => {
  const cafe = unemployment({ startDate: '2026-03-02', lastWorkDate: '2027-08-31', weeklyHours: 25 });
  assert.equal(cafe.eligible, true);
  assert.equal(cafe.unitDays, 469);
  assert.equal(cafe.periodStart, '2027-06-01');
  assert.equal(cafe.periodDays, 92);
  assert.equal(cafe.threeMonthWages, 4218857);
  assert.equal(cafe.dailyAverage, 45857.15);
  assert.equal(cafe.dailyOrdinary, 53500);
  assert.equal(cafe.byRate, 32100);
  assert.equal(cafe.dailyHours, 5);
  assert.equal(cafe.lowerLimit, 42800);
  assert.equal(cafe.dailyBenefit, 42800);
  assert.equal(cafe.benefitDays, 150);
  assert.equal(cafe.total, 6420000);

  const weekend = unemployment({ startDate: '2027-01-04', lastWorkDate: '2027-12-31', weeklyHours: 14, workDays: 2 });
  assert.equal(weekend.unitDays, 103);
  assert.equal(weekend.unitsNeeded, 77);
  assert.equal(weekend.lowerLimit, 34240);

  // 하한 표: 주 소정근로시간 → 1일 소정근로시간 → 2027년 하한
  const rows = [
    [20, 4, 34240],
    [25, 5, 42800],
    [30, 6, 51360],
    [35, 7, 59920],
    [40, 8, 68480],
  ];
  for (const [weeklyHours, hours, lower] of rows) {
    const result = unemployment({ startDate: '2027-01-01', lastWorkDate: '2027-12-31', weeklyHours });
    assert.equal(result.dailyHours, hours);
    assert.equal(result.lowerLimit, lower);
  }
  assert.equal(unemployment({ startDate: '2027-01-01', lastWorkDate: '2027-12-31', weeklyHours: 16 }).lowerLimit, 34240);
  assert.equal(lowerLimitFor('2026-12-31', 8), 66048);
  assert.equal(upperLimitFor('2027-12-31'), 68100);
});

const dismissal = (overrides) =>
  calculateDismissalNotice({ weeklyHours: 20, hourlyWage: 10700, ...overrides });

test('해고예고: 3개월 되는 날은 민법대로 (같은 날 전날, 없으면 그 달 말일)', () => {
  const completed = (start) => formatDate(monthsCompletedOn(parseDate(start), 3));
  assert.equal(completed('2027-01-01'), '2027-03-31');
  assert.equal(completed('2027-03-02'), '2027-06-01');
  assert.equal(completed('2027-01-31'), '2027-04-30');
  assert.equal(completed('2026-11-30'), '2027-02-28');
  assert.equal(completed('2027-11-30'), '2028-02-29');
  assert.equal(completed('2027-10-15'), '2028-01-14');
});

test('해고예고: 1월 1일 입사, 3월 31일까지 일하면 3개월 미만이 아님 (법제처 21-0320)', () => {
  const march31 = dismissal({ startDate: '2027-01-01', noticeDate: '2027-03-31', lastWorkDate: '2027-03-31' });
  assert.equal(march31.underThreeMonths, false);
  assert.equal(march31.owed, true);
  assert.equal(march31.pay, 1284000);

  const march30 = dismissal({ startDate: '2027-01-01', noticeDate: '2027-03-30', lastWorkDate: '2027-03-30' });
  assert.equal(march30.underThreeMonths, true);
  assert.equal(march30.exception, 'underThreeMonths');
  assert.equal(march30.pay, 0);
  assert.equal(march30.payIfOwed, 1284000);

  // 2개월째에 예고해도 그만두는 날에 3개월이 넘으면 예외가 아님 (근로기준정책과-993)
  const later = dismissal({ startDate: '2027-01-01', noticeDate: '2027-03-01', lastWorkDate: '2027-04-10' });
  assert.equal(later.underThreeMonths, false);
  assert.equal(later.noticeDays, 40);
  assert.equal(later.pay, 0);
});

test('해고예고: 예고 기간은 통보 다음 날부터 역일로 30일 (근기 68207-1346)', () => {
  const kept = dismissal({ startDate: '2027-01-01', noticeDate: '2027-09-01', lastWorkDate: '2027-10-01' });
  assert.equal(kept.noticeDays, 30);
  assert.equal(kept.noticeKept, true);
  assert.equal(kept.pay, 0);
  assert.equal(kept.retireDate, '2027-10-02');

  // 하루라도 모자라면 모자란 날만큼이 아니라 30일분 전부
  const oneShort = dismissal({ startDate: '2027-01-01', noticeDate: '2027-09-01', lastWorkDate: '2027-09-30' });
  assert.equal(oneShort.noticeDays, 29);
  assert.equal(oneShort.shortBy, 1);
  assert.equal(oneShort.pay, 1284000);
  assert.equal(oneShort.latestNoticeDate, '2027-08-31');
  assert.equal(oneShort.earliestLastDate, '2027-10-01');

  // 마지막 근무일 뒤에 통보했으면 0일
  const after = dismissal({ startDate: '2027-01-01', noticeDate: '2027-09-05', lastWorkDate: '2027-09-01' });
  assert.equal(after.noticeDays, 0);
  assert.equal(after.pay, 1284000);
});

test('해고예고: 해고가 아니거나 예외 사유면 수당 없음, 5인 미만도 금액은 같음', () => {
  const base = { startDate: '2027-01-01', noticeDate: '2027-09-17', lastWorkDate: '2027-09-17' };
  assert.equal(dismissal({ ...base, leaveType: 'expiry' }).exception, 'expiry');
  assert.equal(dismissal({ ...base, leaveType: 'expiry' }).pay, 0);
  assert.equal(dismissal({ ...base, leaveType: 'resignation' }).pay, 0);
  assert.equal(dismissal({ ...base, disaster: true }).exception, 'disaster');
  assert.equal(dismissal({ ...base, misconduct: true }).exception, 'misconduct');
  assert.equal(dismissal({ ...base, misconduct: true }).pay, 0);
  assert.equal(dismissal({ ...base, smallBusiness: true }).pay, 1284000);
  // 주 15시간 미만도 해고예고는 적용
  assert.equal(dismissal({ ...base, weeklyHours: 14 }).pay, 898800);
});

test('해고예고: 1일 소정근로시간은 주 소정근로시간 ÷ 5, 직접 넣으면 그 값 (8시간 상한)', () => {
  const base = { startDate: '2027-01-01', noticeDate: '2027-09-17', lastWorkDate: '2027-09-17' };
  assert.equal(dismissal({ ...base, weeklyHours: 18 }).dailyHours, 3.6);
  assert.equal(dismissal({ ...base, weeklyHours: 18 }).dailyOrdinary, 38520);
  assert.equal(dismissal({ ...base, weeklyHours: 52 }).dailyHours, 8);
  const custom = dismissal({ ...base, weeklyHours: 18, dailyHours: 6 });
  assert.equal(custom.usesCustomHours, true);
  assert.equal(custom.pay, 1926000);
  assert.equal(dismissal({ ...base, dailyHours: 10 }).dailyHours, 8);
  assert.equal(dismissal({ ...base, weeklyHours: 22.5 }).pay, 1444500);
});

test('해고예고: 날짜가 없거나 순서가 바뀌면 계산하지 않음', () => {
  assert.equal(dismissal({ startDate: '', noticeDate: '2027-09-01', lastWorkDate: '2027-09-01' }).valid, false);
  assert.equal(dismissal({ startDate: '2027-09-02', noticeDate: '2027-09-01', lastWorkDate: '2027-09-03' }).valid, false);
  assert.equal(dismissal({ startDate: '2027-09-02', noticeDate: '2027-09-02', lastWorkDate: '2027-09-01' }).valid, false);
  assert.equal(dismissal({ startDate: '2027-02-30', noticeDate: '2027-09-01', lastWorkDate: '2027-09-01' }).valid, false);
});

// dismissal-notice-pay/index.html 의 예시가 계산기 결과와 같아야 한다.
test('해고예고수당 계산기 페이지의 예시', () => {
  const store = dismissal({ startDate: '2027-03-02', noticeDate: '2027-10-15', lastWorkDate: '2027-10-15' });
  assert.equal(store.threeMonthDate, '2027-06-01');
  assert.equal(store.noticeDays, 0);
  assert.equal(store.dailyHours, 4);
  assert.equal(store.dailyOrdinary, 42800);
  assert.equal(store.pay, 1284000);

  const twenty = dismissal({ startDate: '2027-01-04', noticeDate: '2027-11-10', lastWorkDate: '2027-11-30', weeklyHours: 25 });
  assert.equal(twenty.noticeDays, 20);
  assert.equal(twenty.shortBy, 10);
  assert.equal(twenty.dailyOrdinary, 53500);
  assert.equal(twenty.pay, 1605000);
  assert.equal(twenty.latestNoticeDate, '2027-10-31');

  const short = dismissal({ startDate: '2027-08-01', noticeDate: '2027-10-20', lastWorkDate: '2027-10-20' });
  assert.equal(short.threeMonthDate, '2027-10-31');
  assert.equal(short.exception, 'underThreeMonths');
  assert.equal(short.pay, 0);
});

// dismissal-notice-guide/index.html 의 사례와 금액표가 계산기 결과와 같아야 한다.
test('해고예고수당 설명 글의 사례와 금액표', () => {
  const kakao = dismissal({ startDate: '2026-12-01', noticeDate: '2027-06-10', lastWorkDate: '2027-06-13', weeklyHours: 18 });
  assert.equal(kakao.threeMonthDate, '2027-02-28');
  assert.equal(kakao.noticeDays, 3);
  assert.equal(kakao.shortBy, 27);
  assert.equal(kakao.dailyHours, 3.6);
  assert.equal(kakao.dailyOrdinary, 38520);
  assert.equal(kakao.pay, 1155600);

  const tomorrow = dismissal({ startDate: '2027-02-01', noticeDate: '2027-09-17', lastWorkDate: '2027-09-17', weeklyHours: 40 });
  assert.equal(tomorrow.noticeDays, 0);
  assert.equal(tomorrow.dailyOrdinary, 85600);
  assert.equal(tomorrow.pay, 2568000);
  assert.equal(calculatePay({ year: 2027, hourlyWage: 10700, hoursPerDay: 8, daysPerWeek: 5 }).monthly.gross, 2236300);

  const almost = dismissal({ startDate: '2027-04-15', noticeDate: '2027-07-10', lastWorkDate: '2027-07-10' });
  assert.equal(almost.threeMonthDate, '2027-07-14');
  assert.equal(almost.underThreeMonths, true);
  assert.equal(dismissal({ startDate: '2027-04-15', noticeDate: '2027-07-14', lastWorkDate: '2027-07-14' }).owed, true);

  // 예고 기간 예시: 9월 1일 통보 → 10월 1일까지, 11월 30일까지 일하게 하려면 10월 31일까지 통보
  assert.equal(dismissal({ startDate: '2027-01-01', noticeDate: '2027-09-01', lastWorkDate: '2027-09-01' }).earliestLastDate, '2027-10-01');
  assert.equal(dismissal({ startDate: '2027-01-01', noticeDate: '2027-11-30', lastWorkDate: '2027-11-30' }).latestNoticeDate, '2027-10-31');

  // 금액표: 주 소정근로시간 → 1일 통상임금 → 해고예고수당
  const rows = [
    [14, 2.8, 29960, 898800],
    [15, 3, 32100, 963000],
    [20, 4, 42800, 1284000],
    [25, 5, 53500, 1605000],
    [30, 6, 64200, 1926000],
    [35, 7, 74900, 2247000],
    [40, 8, 85600, 2568000],
  ];
  for (const [weeklyHours, hours, daily, pay] of rows) {
    const result = dismissal({ startDate: '2027-01-01', noticeDate: '2027-09-17', lastWorkDate: '2027-09-17', weeklyHours });
    assert.equal(result.dailyHours, hours);
    assert.equal(result.dailyOrdinary, daily);
    assert.equal(result.pay, pay);
  }
});

const annualLeave = (overrides) => calculateAnnualLeave({ weeklyHours: 20, hourlyWage: 10700, ...overrides });

test('연차: 1년 미만은 1개월 근로를 마친 다음 날마다 1일, 최대 11일', () => {
  // 1월 31일 입사: 2월 31일이 없어서 첫 1일은 3월 1일에 생긴다.
  assert.equal(addMonths(parseDate('2026-01-31'), 1), parseDate('2026-03-01'));
  assert.equal(annualLeave({ startDate: '2026-01-31', lastWorkDate: '2026-02-28' }).grants.length, 0);
  assert.equal(annualLeave({ startDate: '2026-01-31', lastWorkDate: '2026-03-01' }).grants[0].days, 1);

  const month = annualLeave({ startDate: '2027-01-01', lastWorkDate: '2027-01-31' });
  assert.equal(month.grants.length, 0);
  assert.equal(month.next.date, '2027-02-01');
  const sixMonths = annualLeave({ startDate: '2027-01-01', lastWorkDate: '2027-07-01' });
  assert.equal(sixMonths.grants[0].days, 6);
  assert.equal(sixMonths.availableHours, 24);

  // 개근 못 한 달은 빼고 센다.
  assert.equal(annualLeave({ startDate: '2027-01-01', lastWorkDate: '2027-12-31', firstYearMissedMonths: 2 }).grants[0].days, 9);
});

test('연차: 딱 1년(365일)이면 11일, 366일째 근로관계가 있으면 15일 추가 (대법원 2021다227100)', () => {
  const oneYear = annualLeave({ startDate: '2027-01-01', lastWorkDate: '2027-12-31' });
  assert.equal(oneYear.exactlyOneYear, true);
  assert.equal(oneYear.grants.length, 1);
  assert.equal(oneYear.availableDays, 11);
  assert.equal(oneYear.next.kind, 'annual');
  assert.equal(oneYear.next.date, '2028-01-01');

  const plusOne = annualLeave({ startDate: '2027-01-01', lastWorkDate: '2028-01-01' });
  assert.equal(plusOne.exactlyOneYear, false);
  assert.equal(plusOne.grants.map((grant) => grant.days).join(), '11,15');
  // 1년 미만 연차는 최초 1년이 끝나면 사용 기간이 지난다. 생긴 연차는 모두 26일.
  assert.equal(plusOne.grants[0].active, false);
  assert.equal(plusOne.grants.reduce((sum, grant) => sum + grant.days, 0), 26);
  assert.equal(plusOne.availableDays, 15);

  // 2년 근무(2주년 전날 퇴사)면 2년 근속 15일은 생기지 않는다 (대법원 2022다245419).
  const twoYears = annualLeave({ startDate: '2018-01-01', lastWorkDate: '2019-12-31' });
  assert.equal(twoYears.grants.length, 2);
  assert.equal(twoYears.next.date, '2020-01-01');
});

test('연차: 15일에 3년부터 2년마다 1일 가산, 최대 25일', () => {
  const days = [1, 2, 3, 4, 5, 6, 10, 11, 19, 20, 21, 22, 30].map(annualDaysFor);
  assert.deepEqual(days, [15, 15, 16, 16, 17, 17, 19, 20, 24, 24, 25, 25, 25]);
});

test('연차: 단시간근로자는 시간 단위, 1시간 미만은 1시간 (시행령 별표 2)', () => {
  assert.equal(leaveHoursFor(15, 20), 60);
  assert.equal(leaveHoursFor(15, 15), 45);
  assert.equal(leaveHoursFor(15, 40), 120);
  assert.equal(leaveHoursFor(15, 52), 120);
  assert.equal(leaveHoursFor(1, 22), 5); // 4.4시간 → 5시간
  assert.equal(leaveHoursFor(16, 22.5), 72);
  assert.equal(leaveHoursFor(1, 18), 4); // 3.6시간 → 4시간
});

test('연차: 주 15시간 미만, 5인 미만이면 대상 아님', () => {
  const few = annualLeave({ startDate: '2027-01-01', lastWorkDate: '2027-12-31', weeklyHours: 14.9 });
  assert.equal(few.eligible, false);
  assert.equal(few.pay, 0);
  assert.equal(few.payIfEligible > 0, true);
  const small = annualLeave({ startDate: '2027-01-01', lastWorkDate: '2027-12-31', fiveOrMoreEmployees: false });
  assert.equal(small.eligible, false);
  assert.equal(small.pay, 0);
});

test('연차: 80% 미만인 해는 개근한 달 수만큼, 쓴 연차는 일·시간 모두 받음', () => {
  const low = annualLeave({ startDate: '2024-03-04', lastWorkDate: '2026-08-31', lowAttendanceYears: { 2: 5 } });
  assert.equal(low.grants[2].days, 5);
  assert.equal(low.grants[2].hours, 20);
  assert.equal(low.availableHours, 20);

  const byDays = annualLeave({ startDate: '2026-03-02', lastWorkDate: '2027-08-31', usedLeave: 2.5, usedUnit: 'days' });
  assert.equal(byDays.usedHours, 10);
  assert.equal(byDays.remainingHours, 50);
  const over = annualLeave({ startDate: '2026-03-02', lastWorkDate: '2027-08-31', usedLeave: 70 });
  assert.equal(over.overUsed, true);
  assert.equal(over.remainingHours, 0);
  assert.equal(over.pay, 0);
});

test('연차: 날짜가 없거나 순서가 바뀌면 계산하지 않음', () => {
  assert.equal(annualLeave({ startDate: '', lastWorkDate: '2027-12-31' }).valid, false);
  assert.equal(annualLeave({ startDate: '2027-12-31', lastWorkDate: '2027-01-01' }).valid, false);
});

// annual-leave-pay/index.html 의 예시가 계산기 결과와 같아야 한다.
test('연차수당 계산기 페이지의 예시', () => {
  const store = annualLeave({ startDate: '2027-01-01', lastWorkDate: '2027-12-31', weeklyHours: 15 });
  assert.equal(store.grants[0].date, '2027-02-01');
  assert.equal(store.grants[0].lastDate, '2027-12-01');
  assert.equal(store.availableHours, 33);
  assert.equal(store.pay, 353100);

  const fullTime = annualLeave({ startDate: '2024-03-04', lastWorkDate: '2027-08-31', weeklyHours: 40, usedLeave: 6, usedUnit: 'days' });
  assert.deepEqual(fullTime.grants.map((grant) => [grant.date, grant.days, grant.active]), [
    ['2024-04-04', 11, false],
    ['2025-03-04', 15, false],
    ['2026-03-04', 15, false],
    ['2027-03-04', 16, true],
  ]);
  assert.equal(fullTime.availableHours, 128);
  assert.equal(fullTime.remainingHours, 80);
  assert.equal(fullTime.pay, 856000);

  // 근속연수별 일수 표
  assert.deepEqual([1, 3, 5, 11, 21].map(annualDaysFor), [15, 16, 17, 20, 25]);
});

// annual-leave-guide/index.html 의 사례와 근무시간별 표가 계산기 결과와 같아야 한다.
test('연차 설명 글의 사례와 금액표', () => {
  const cafe = { startDate: '2026-03-02', weeklyHours: 20, hourlyWage: 10700 };
  // 첫 1년: 2026.4.2.~2027.2.2. 11일 × 4시간, 2027.3.1.까지. 5일 쓰고 24시간 남음.
  const firstYear = calculateAnnualLeave({ ...cafe, lastWorkDate: '2027-03-01', usedLeave: 5, usedUnit: 'days' });
  assert.equal(firstYear.grants[0].date, '2026-04-02');
  assert.equal(firstYear.grants[0].lastDate, '2027-02-02');
  assert.equal(firstYear.grants[0].expires, '2027-03-01');
  assert.equal(firstYear.availableHours, 44);
  assert.equal(firstYear.remainingHours, 24);
  assert.equal(firstYear.pay, 256800);
  // 퇴사(2027.8.31.): 2027.3.2.에 생긴 60시간 중 4일(16시간) 사용 → 44시간
  const leaving = calculateAnnualLeave({ ...cafe, lastWorkDate: '2027-08-31', usedLeave: 4, usedUnit: 'days' });
  assert.equal(leaving.grants[1].date, '2027-03-02');
  assert.equal(leaving.grants[1].expires, '2028-03-01');
  assert.equal(leaving.availableHours, 60);
  assert.equal(leaving.remainingHours, 44);
  assert.equal(leaving.pay, 470800);
  // 같은 사례의 퇴직금
  const severanceResult = calculateSeverance({ ...cafe, lastWorkDate: '2027-08-31' });
  assert.equal(severanceResult.dailyOrdinary, 42800);
  assert.equal(severanceResult.severance, 1927759);

  // 단시간 시간 계산 예시
  assert.equal(leaveHoursFor(15, 20), 60);
  assert.equal(leaveHoursFor(15, 15), 45);
  assert.equal(leaveHoursFor(1, 22), 5);

  // 근속연수별 표
  assert.deepEqual([1, 2, 3, 4, 5, 6, 11, 12, 21].map(annualDaysFor), [15, 15, 16, 16, 17, 17, 20, 20, 25]);

  const rows = [
    // [주 소정근로시간, 연차 1일 시간, 첫 1년 시간, 금액, 1년 근속 15일 시간, 금액]
    [15, 3, 33, 353100, 45, 481500],
    [20, 4, 44, 470800, 60, 642000],
    [25, 5, 55, 588500, 75, 802500],
    [30, 6, 66, 706200, 90, 963000],
    [35, 7, 77, 823900, 105, 1123500],
    [40, 8, 88, 941600, 120, 1284000],
  ];
  for (const [weeklyHours, perDay, firstHours, firstPay, yearHours, yearPay] of rows) {
    const oneYear = annualLeave({ startDate: '2027-01-01', lastWorkDate: '2027-12-31', weeklyHours });
    assert.equal(oneYear.hoursPerDay, perDay);
    assert.equal(oneYear.availableHours, firstHours);
    assert.equal(oneYear.pay, firstPay);
    const afterYear = annualLeave({ startDate: '2027-01-01', lastWorkDate: '2028-01-01', weeklyHours });
    assert.equal(afterYear.availableHours, yearHours);
    assert.equal(afterYear.pay, yearPay);
  }
  assert.equal(annualLeave({ startDate: '2027-01-01', lastWorkDate: '2027-12-31', weeklyHours: 14 }).eligible, false);
});

// unpaid-wages-guide/index.html 의 편의점 사례(마지막 달 월급 + 퇴직금, 지연이자, 간이대지급금)가 계산기 결과와 같아야 한다.
test('임금체불 대처법 글의 사례', () => {
  const monthly = calculatePay({ year: 2027, hourlyWage: 10700, hoursPerDay: 4, daysPerWeek: 5 }).monthly;
  assert.equal(monthly.basePay, 87 * 10700);
  assert.equal(monthly.weeklyHolidayPay, 17 * 10700);
  assert.equal(monthly.gross, 1112800);

  const store = calculateSeverance({ startDate: '2026-04-01', lastWorkDate: '2027-08-31', weeklyHours: 20, hourlyWage: 10700 });
  assert.equal(store.eligible, true);
  assert.equal(store.retireDate, '2027-09-01');
  assert.equal(store.serviceDays, 518);
  assert.equal(store.dailyAverage, 36685.72);
  assert.equal(store.dailyOrdinary, 42800);
  assert.equal(store.severance, 1822225);

  const owed = monthly.gross + store.severance;
  assert.equal(owed, 2935025);

  // 지급 기한: 퇴직일(9월 1일)을 첫날로 세어 14일이 되는 날은 9월 14일. 지연이자는 그다음 날부터 지급일까지 (근로기준법 제37조).
  assert.equal(formatDate(parseDate(store.retireDate) + 13), '2027-09-14');
  const lateDays = parseDate('2027-10-31') - parseDate('2027-09-15') + 1;
  assert.equal(lateDays, 47);
  // 연 20% (시행령 제17조), 1년 365일, 원 단위 반올림
  assert.equal(Math.round((owed * 0.2 * lateDays) / 365), 75587);

  // 간이대지급금(퇴직자) 상한: 임금 700만원, 퇴직급여등 700만원, 합계 1,000만원 → 전액 대상
  const paid = Math.min(Math.min(monthly.gross, 7000000) + Math.min(store.severance, 7000000), 10000000);
  assert.equal(paid, owed);
});

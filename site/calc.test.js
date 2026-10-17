// test/pay_calculator_test.dart 와 같은 기준값으로 웹 계산 로직을 확인한다. 퇴직금(severance.js)은 웹에만 있다.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { YEARS, autoDeduction, calculatePay, defaultYear, formatWon } from './calc.js';
import { calculateSeverance, parseDate } from './severance.js';

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

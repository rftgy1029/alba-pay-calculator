// test/pay_calculator_test.dart 와 같은 기준값으로 웹 계산 로직을 확인한다.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { autoDeduction, calculatePay, defaultYear, formatWon } from './calc.js';

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

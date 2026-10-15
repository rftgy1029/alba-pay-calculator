// test/pay_calculator_test.dart 와 같은 기준값으로 웹 계산 로직을 확인한다.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { calculatePay, defaultYear, formatWon } from './calc.js';

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

test('금액 표시', () => {
  assert.equal(formatWon(2156880), '2,156,880원');
  assert.equal(formatWon(0), '0원');
});

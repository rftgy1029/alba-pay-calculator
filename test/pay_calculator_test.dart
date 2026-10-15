import 'package:alba_pay_calculator/pay_calculator.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('주 40시간 최저시급이면 월급 2,156,880원 (월 209시간)', () {
    final result = calculatePay(const PayInput(
      hourlyWage: minimumWage2026,
      hoursPerDay: 8,
      daysPerWeek: 5,
    ));

    expect(result.monthly.gross, 2156880);
    expect(result.weekly.basePay, 412800);
    expect(result.weekly.weeklyHolidayPay, 82560);
  });

  test('주 15시간 미만이면 주휴수당 없음', () {
    final result = calculatePay(const PayInput(
      hourlyWage: minimumWage2026,
      hoursPerDay: 4,
      daysPerWeek: 3,
    ));

    expect(result.hasWeeklyHolidayPay, isFalse);
    expect(result.weekly.weeklyHolidayPay, 0);
    expect(result.mayBeExemptFromInsurance, isTrue);
  });

  test('주 20시간이면 주휴수당은 4시간분', () {
    final result = calculatePay(const PayInput(
      hourlyWage: 10000,
      hoursPerDay: 4,
      daysPerWeek: 5,
    ));

    expect(result.weekly.weeklyHolidayPay, 40000);
  });

  test('5인 이상: 하루 10시간이면 2시간씩 연장 가산', () {
    final result = calculatePay(const PayInput(
      hourlyWage: 10000,
      hoursPerDay: 10,
      daysPerWeek: 5,
    ));

    expect(result.weeklyContractHours, 40);
    expect(result.weekly.basePay, 500000);
    expect(result.weekly.overtimePay, 50000); // 10시간 × 1만원 × 0.5
    expect(result.weekly.weeklyHolidayPay, 80000);
  });

  test('5인 미만: 연장·야간 가산 없음, 주휴수당은 있음', () {
    final result = calculatePay(const PayInput(
      hourlyWage: 10000,
      hoursPerDay: 10,
      daysPerWeek: 5,
      nightHoursPerDay: 4,
      fiveOrMoreEmployees: false,
    ));

    expect(result.weekly.overtimePay, 0);
    expect(result.weekly.nightPay, 0);
    expect(result.weekly.weeklyHolidayPay, 80000);
  });

  test('야간 시간은 하루 근무시간을 넘을 수 없음', () {
    final result = calculatePay(const PayInput(
      hourlyWage: 10000,
      hoursPerDay: 4,
      daysPerWeek: 5,
      nightHoursPerDay: 8,
    ));

    expect(result.weekly.nightPay, 100000); // 4시간 × 5일 × 1만원 × 0.5
  });

  test('3.3% 공제', () {
    final result = calculatePay(const PayInput(
      hourlyWage: minimumWage2026,
      hoursPerDay: 8,
      daysPerWeek: 5,
      deduction: Deduction.freelance33,
    ));

    // 2,156,880 × 3% = 64,706 → 64,700 / 지방세 6,470
    expect(result.totalDeduction, 64700 + 6470);
    expect(result.monthlyNet, 2156880 - 71170);
  });

  test('기본 공제: 월 60시간 이상이면 4대보험, 미만이면 공제 없음', () {
    expect(autoDeduction(hoursPerDay: 8, daysPerWeek: 5), Deduction.insurance4);
    expect(autoDeduction(hoursPerDay: 4, daysPerWeek: 3), Deduction.none);
    expect(autoDeduction(hoursPerDay: 3.5, daysPerWeek: 4), Deduction.insurance4);
    expect(autoDeduction(hoursPerDay: 3, daysPerWeek: 4), Deduction.none);
    expect(autoDeduction(hoursPerDay: 12, daysPerWeek: 1), Deduction.none);
  });

  test('4대보험 공제', () {
    final result = calculatePay(const PayInput(
      hourlyWage: minimumWage2026,
      hoursPerDay: 8,
      daysPerWeek: 5,
      deduction: Deduction.insurance4,
    ));

    final amounts = result.deductions.map((d) => d.amount).toList();
    expect(amounts, [102450, 77530, 10180, 19410]);
  });
}

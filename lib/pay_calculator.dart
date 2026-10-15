/// 2026년 기준 알바 급여 계산 로직.
///
/// UI와 분리해 두어 나중에 교대근무 캘린더 앱에서도 그대로 재사용한다.
library;

/// 2026년 최저시급 (원).
const int minimumWage2026 = 10320;

/// 한 달 평균 주 수 (365일 / 7일 / 12개월 ≈ 4.345주).
const double weeksPerMonth = 365 / 7 / 12;

/// 주휴수당이 생기는 최소 주 소정근로시간.
const double weeklyHolidayMinHours = 15;

/// 2026년 4대보험 근로자 부담 요율.
const double nationalPensionRate = 0.0475;
const double healthInsuranceRate = 0.03595;

/// 장기요양보험료 = 건강보험료 × 이 비율.
const double longTermCareRatio = 0.1314;
const double employmentInsuranceRate = 0.009;

/// 4대보험 가입 대상이 되는 월 소정근로시간 기준 (이 시간 미만이면 대체로 제외).
const int insuranceMinMonthlyHours = 60;

enum Deduction {
  none('없음'),
  freelance33('3.3%'),
  insurance4('4대보험');

  const Deduction(this.label);
  final String label;
}

/// 근무시간으로 정하는 기본 공제 (site/calc.js의 autoDeduction과 같은 규칙).
/// 월 소정근로시간이 60시간 이상이면 4대보험, 아니면 공제 없음.
/// 3.3%는 프리랜서(사업소득)용이라 근로자인 알바에 맞지 않아 자동으로 고르지 않는다.
Deduction autoDeduction({required double hoursPerDay, required int daysPerWeek}) {
  final monthlyHours =
      _toMonthlyHours(_weeklyContractHours(hoursPerDay, daysPerWeek));
  return monthlyHours >= insuranceMinMonthlyHours
      ? Deduction.insurance4
      : Deduction.none;
}

class PayInput {
  const PayInput({
    required this.hourlyWage,
    required this.hoursPerDay,
    required this.daysPerWeek,
    this.nightHoursPerDay = 0,
    this.fiveOrMoreEmployees = true,
    this.deduction = Deduction.none,
  });

  final int hourlyWage;
  final double hoursPerDay;
  final int daysPerWeek;

  /// 하루 근무 중 밤 10시 ~ 아침 6시에 해당하는 시간.
  final double nightHoursPerDay;

  /// 5인 이상 사업장이면 연장·야간 가산수당(50%)이 붙는다.
  final bool fiveOrMoreEmployees;
  final Deduction deduction;
}

/// 한 기간(주 또는 월)의 급여 항목.
class PayBreakdown {
  const PayBreakdown({
    required this.basePay,
    required this.weeklyHolidayPay,
    required this.overtimePay,
    required this.nightPay,
  });

  final int basePay;
  final int weeklyHolidayPay;
  final int overtimePay;
  final int nightPay;

  int get gross => basePay + weeklyHolidayPay + overtimePay + nightPay;
}

class DeductionItem {
  const DeductionItem(this.label, this.amount);

  final String label;
  final int amount;
}

class PayResult {
  const PayResult({
    required this.weekly,
    required this.monthly,
    required this.deductions,
    required this.weeklyContractHours,
    required this.monthlyContractHours,
    required this.hasWeeklyHolidayPay,
  });

  final PayBreakdown weekly;
  final PayBreakdown monthly;

  /// 월급 기준 공제 항목.
  final List<DeductionItem> deductions;
  final double weeklyContractHours;
  final int monthlyContractHours;
  final bool hasWeeklyHolidayPay;

  int get totalDeduction => deductions.fold(0, (sum, d) => sum + d.amount);
  int get monthlyNet => monthly.gross - totalDeduction;

  /// 4대보험을 골랐지만 월 60시간 미만이라 가입 대상이 아닐 수 있는 경우.
  bool get mayBeExemptFromInsurance =>
      monthlyContractHours < insuranceMinMonthlyHours;
}

PayResult calculatePay(PayInput input) {
  final wage = input.hourlyWage;
  final days = input.daysPerWeek;
  final hoursPerDay = input.hoursPerDay;
  final nightPerDay =
      input.nightHoursPerDay.clamp(0, hoursPerDay).toDouble();

  final weeklyWorkHours = hoursPerDay * days;

  final weeklyContractHours = _weeklyContractHours(hoursPerDay, days);

  final hasWeeklyHolidayPay = weeklyContractHours >= weeklyHolidayMinHours;
  final weeklyHolidayHours =
      hasWeeklyHolidayPay ? weeklyContractHours / 40 * 8 : 0.0;

  final weeklyOvertimeHours =
      input.fiveOrMoreEmployees ? weeklyWorkHours - weeklyContractHours : 0.0;
  final weeklyNightHours =
      input.fiveOrMoreEmployees ? nightPerDay * days : 0.0;

  final weekly = PayBreakdown(
    basePay: _won(weeklyWorkHours * wage),
    weeklyHolidayPay: _won(weeklyHolidayHours * wage),
    overtimePay: _won(weeklyOvertimeHours * wage * 0.5),
    nightPay: _won(weeklyNightHours * wage * 0.5),
  );

  // 월 환산은 시간 단위로 먼저 반올림한다 (주 40시간 → 월 209시간 관행과 일치).
  final monthly = PayBreakdown(
    basePay: _toMonthlyHours(weeklyWorkHours) * wage,
    weeklyHolidayPay: _toMonthlyHours(weeklyHolidayHours) * wage,
    overtimePay: _won(_toMonthlyHours(weeklyOvertimeHours) * wage * 0.5),
    nightPay: _won(_toMonthlyHours(weeklyNightHours) * wage * 0.5),
  );

  return PayResult(
    weekly: weekly,
    monthly: monthly,
    deductions: _deductions(input.deduction, monthly.gross),
    weeklyContractHours: weeklyContractHours,
    monthlyContractHours: _toMonthlyHours(weeklyContractHours),
    hasWeeklyHolidayPay: hasWeeklyHolidayPay,
  );
}

List<DeductionItem> _deductions(Deduction deduction, int monthlyGross) {
  switch (deduction) {
    case Deduction.none:
      return const [];
    case Deduction.freelance33:
      final incomeTax = _floor10(monthlyGross * 0.03);
      return [
        DeductionItem('소득세 (3%)', incomeTax),
        DeductionItem('지방소득세 (0.3%)', _floor10(incomeTax * 0.1)),
      ];
    case Deduction.insurance4:
      final health = _floor10(monthlyGross * healthInsuranceRate);
      return [
        DeductionItem('국민연금 (4.75%)', _floor10(monthlyGross * nationalPensionRate)),
        DeductionItem('건강보험 (3.595%)', health),
        DeductionItem('장기요양보험', _floor10(health * longTermCareRatio)),
        DeductionItem('고용보험 (0.9%)', _floor10(monthlyGross * employmentInsuranceRate)),
      ];
  }
}

/// 소정근로시간: 하루 8시간, 주 40시간을 넘는 부분은 연장근로로 본다.
double _weeklyContractHours(double hoursPerDay, int daysPerWeek) =>
    (_min(hoursPerDay, 8) * daysPerWeek).clamp(0, 40).toDouble();

int _toMonthlyHours(double weeklyHours) => (weeklyHours * weeksPerMonth).round();

int _won(double amount) => amount.round();

int _floor10(double amount) => (amount / 10).floor() * 10;

double _min(double a, double b) => a < b ? a : b;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'pay_calculator.dart';

void main() => runApp(const AlbaPayApp());

class AlbaPayApp extends StatelessWidget {
  const AlbaPayApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: '알바 급여 계산기',
      debugShowCheckedModeBanner: false,
      theme: _theme(Brightness.light),
      darkTheme: _theme(Brightness.dark),
      home: const CalculatorPage(),
    );
  }
}

ThemeData _theme(Brightness brightness) => ThemeData(
      colorScheme: ColorScheme.fromSeed(
        seedColor: const Color(0xFF2E7D6B),
        brightness: brightness,
      ),
      useMaterial3: true,
    );

class CalculatorPage extends StatefulWidget {
  const CalculatorPage({super.key});

  @override
  State<CalculatorPage> createState() => _CalculatorPageState();
}

class _CalculatorPageState extends State<CalculatorPage> {
  final _wage = TextEditingController(text: '$minimumWage2026');
  final _hours = TextEditingController(text: '8');
  final _night = TextEditingController(text: '0');
  int _days = 5;
  bool _fiveOrMore = true;
  Deduction _deduction = Deduction.none;

  @override
  void initState() {
    super.initState();
    for (final controller in [_wage, _hours, _night]) {
      controller.addListener(_onChanged);
    }
  }

  @override
  void dispose() {
    for (final controller in [_wage, _hours, _night]) {
      controller.dispose();
    }
    super.dispose();
  }

  void _onChanged() => setState(() {});

  PayInput get _input => PayInput(
        hourlyWage: int.tryParse(_wage.text) ?? 0,
        hoursPerDay: _parseHours(_hours.text),
        daysPerWeek: _days,
        nightHoursPerDay: _parseHours(_night.text),
        fiveOrMoreEmployees: _fiveOrMore,
        deduction: _deduction,
      );

  @override
  Widget build(BuildContext context) {
    final input = _input;
    final result = calculatePay(input);

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 560),
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                const _Header(),
                const SizedBox(height: 16),
                _buildInputCard(context),
                const SizedBox(height: 16),
                _ResultCard(input: input, result: result),
                const SizedBox(height: 16),
                Text(
                  '이 계산 결과는 참고용이며, 실제 급여는 근로계약과 사업장 상황에 따라 '
                  '달라질 수 있어요. 2026년 최저임금·4대보험 요율 기준입니다.',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Theme.of(context).colorScheme.outline,
                      ),
                ),
                const SizedBox(height: 24),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildInputCard(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            TextField(
              controller: _wage,
              keyboardType: TextInputType.number,
              inputFormatters: [
                FilteringTextInputFormatter.digitsOnly,
                LengthLimitingTextInputFormatter(7),
              ],
              decoration: InputDecoration(
                labelText: '시급',
                suffixText: '원',
                border: const OutlineInputBorder(),
                suffixIcon: TextButton(
                  onPressed: () => _wage.text = '$minimumWage2026',
                  child: const Text('최저시급'),
                ),
              ),
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: _HoursField(
                    controller: _hours,
                    label: '하루 근무시간',
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _HoursField(
                    controller: _night,
                    label: '그중 야간 (22~06시)',
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Text('주 근무일수', style: textTheme.labelLarge),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (var day = 1; day <= 7; day++)
                  ChoiceChip(
                    label: Text('$day일'),
                    selected: _days == day,
                    onSelected: (_) => setState(() => _days = day),
                  ),
              ],
            ),
            const SizedBox(height: 8),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('5인 이상 사업장'),
              subtitle: const Text('연장·야간 근무에 50% 가산수당이 붙어요'),
              value: _fiveOrMore,
              onChanged: (value) => setState(() => _fiveOrMore = value),
            ),
            const SizedBox(height: 8),
            Text('공제', style: textTheme.labelLarge),
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              child: SegmentedButton<Deduction>(
                showSelectedIcon: false,
                segments: [
                  for (final deduction in Deduction.values)
                    ButtonSegment(value: deduction, label: Text(deduction.label)),
                ],
                selected: {_deduction},
                onSelectionChanged: (selection) =>
                    setState(() => _deduction = selection.first),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header();

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          '알바 급여 계산기',
          style: textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 4),
        Text(
          '주휴수당·야간수당·연장수당까지 한 번에 · 2026년 최저시급 ${formatWon(minimumWage2026)}',
          style: textTheme.bodyMedium,
        ),
      ],
    );
  }
}

class _HoursField extends StatelessWidget {
  const _HoursField({required this.controller, required this.label});

  final TextEditingController controller;
  final String label;

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      keyboardType: const TextInputType.numberWithOptions(decimal: true),
      inputFormatters: [_hoursFormatter],
      decoration: InputDecoration(
        labelText: label,
        suffixText: '시간',
        border: const OutlineInputBorder(),
      ),
    );
  }
}

class _ResultCard extends StatelessWidget {
  const _ResultCard({required this.input, required this.result});

  final PayInput input;
  final PayResult result;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = theme.colorScheme;
    final textTheme = theme.textTheme;
    final hasDeduction = input.deduction != Deduction.none;
    final weekly = result.weekly;
    final monthly = result.monthly;

    final rows = <(String, int, int)>[
      ('기본급', weekly.basePay, monthly.basePay),
      ('주휴수당', weekly.weeklyHolidayPay, monthly.weeklyHolidayPay),
      if (weekly.overtimePay > 0)
        ('연장수당', weekly.overtimePay, monthly.overtimePay),
      if (weekly.nightPay > 0) ('야간수당', weekly.nightPay, monthly.nightPay),
    ];

    return Card(
      color: colors.primaryContainer,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              hasDeduction ? '예상 월 실수령액' : '예상 월급 (세전)',
              style: textTheme.titleMedium,
            ),
            const SizedBox(height: 4),
            Text(
              formatWon(hasDeduction ? result.monthlyNet : monthly.gross),
              style: textTheme.headlineLarge?.copyWith(
                fontWeight: FontWeight.bold,
                color: colors.onPrimaryContainer,
              ),
            ),
            Text(
              '주 ${formatHours(input.hoursPerDay * input.daysPerWeek)}시간 근무 · '
              '주급 ${formatWon(weekly.gross)} (세전)',
              style: textTheme.bodyMedium,
            ),
            const Divider(height: 32),
            Table(
              columnWidths: const {
                0: FlexColumnWidth(1.2),
                1: FlexColumnWidth(),
                2: FlexColumnWidth(),
              },
              children: [
                _tableRow(['', '주급', '월급'], textTheme.labelMedium),
                for (final (label, week, month) in rows)
                  _tableRow([label, formatWon(week), formatWon(month)],
                      textTheme.bodyMedium),
                _tableRow(
                  ['세전 합계', formatWon(weekly.gross), formatWon(monthly.gross)],
                  textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.bold),
                ),
              ],
            ),
            if (hasDeduction) ...[
              const Divider(height: 32),
              Text('월 공제', style: textTheme.labelMedium),
              const SizedBox(height: 4),
              for (final item in result.deductions)
                _amountLine(item.label, '- ${formatWon(item.amount)}',
                    textTheme.bodyMedium),
              _amountLine(
                '실수령액',
                formatWon(result.monthlyNet),
                textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.bold),
              ),
            ],
            for (final note in _notes()) ...[
              const SizedBox(height: 12),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(Icons.info_outline, size: 18, color: colors.primary),
                  const SizedBox(width: 6),
                  Expanded(child: Text(note, style: textTheme.bodySmall)),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }

  List<String> _notes() {
    final weeklyHours = input.hoursPerDay * input.daysPerWeek;
    return [
      if (input.hourlyWage > 0 && input.hourlyWage < minimumWage2026)
        '2026년 최저시급(${formatWon(minimumWage2026)})보다 낮아요. '
            '수습 기간 등 일부 예외를 빼면 최저임금 위반일 수 있어요.',
      if (weeklyHours > 0 && !result.hasWeeklyHolidayPay)
        '주 15시간 미만 근무라 주휴수당이 없어요.',
      if (!input.fiveOrMoreEmployees &&
          (input.hoursPerDay > 8 || input.nightHoursPerDay > 0))
        '5인 미만 사업장은 연장·야간 가산수당(50%)이 의무가 아니라서 계산에서 뺐어요.',
      if (input.fiveOrMoreEmployees && weeklyHours > 52)
        '주 52시간을 넘는 근무는 법정 근로시간 한도를 넘어요.',
      if (input.deduction == Deduction.insurance4 &&
          result.mayBeExemptFromInsurance)
        '월 소정근로시간이 60시간 미만이면 4대보험 가입 대상이 아닐 수 있어요.',
      if (input.deduction == Deduction.insurance4)
        '근로소득세(간이세액)는 포함하지 않았어요. 급여와 부양가족 수에 따라 추가로 빠질 수 있어요.',
    ];
  }

  static TableRow _tableRow(List<String> cells, TextStyle? style) {
    return TableRow(
      children: [
        for (var i = 0; i < cells.length; i++)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: Text(
              cells[i],
              style: style,
              textAlign: i == 0 ? TextAlign.start : TextAlign.end,
            ),
          ),
      ],
    );
  }

  static Widget _amountLine(String label, String amount, TextStyle? style) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Expanded(child: Text(label, style: style)),
          Text(amount, style: style),
        ],
      ),
    );
  }
}

/// 0~24시간, 소수점 한 자리까지만 입력받는다 (예: 4.5).
final _hoursFormatter = TextInputFormatter.withFunction(
  (oldValue, newValue) =>
      RegExp(r'^\d{0,2}(\.\d?)?$').hasMatch(newValue.text) ? newValue : oldValue,
);

double _parseHours(String text) {
  final trimmed = text.endsWith('.') ? text.substring(0, text.length - 1) : text;
  return (double.tryParse(trimmed) ?? 0).clamp(0, 24).toDouble();
}

String formatWon(int amount) {
  final digits = amount.abs().toString();
  final buffer = StringBuffer(amount < 0 ? '-' : '');
  for (var i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 == 0) buffer.write(',');
    buffer.write(digits[i]);
  }
  return '$buffer원';
}

String formatHours(double hours) =>
    hours == hours.roundToDouble() ? hours.toInt().toString() : hours.toStringAsFixed(1);

import 'package:alba_pay_calculator/main.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  // 결과 카드까지 한 화면에 보이도록 세로로 긴 휴대폰 크기로 설정한다.
  setUp(() {
    final view = TestWidgetsFlutterBinding.instance.platformDispatcher.views.first;
    view.physicalSize = const Size(420, 1600);
    view.devicePixelRatio = 1;
  });

  testWidgets('기본값(최저시급, 주 40시간)으로 월급을 보여준다', (tester) async {
    await tester.pumpWidget(const AlbaPayApp());

    expect(find.text('2,156,880원'), findsWidgets);
  });

  testWidgets('3.3% 공제를 고르면 실수령액으로 바뀐다', (tester) async {
    await tester.pumpWidget(const AlbaPayApp());

    await tester.tap(find.text('3.3%'));
    await tester.pump();

    expect(find.text('예상 월 실수령액'), findsOneWidget);
    expect(find.text('2,085,710원'), findsWidgets);
  });
}

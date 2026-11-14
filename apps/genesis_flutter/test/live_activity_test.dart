import 'package:flutter_test/flutter_test.dart';
import 'package:arkom_genesis/live_activity.dart';
import 'package:arkom_genesis/visuals.dart';
import 'package:material_ui/material_ui.dart';

Map<String, dynamic> event(int sequence, String agent) => {
  'sequence': sequence,
  'agent': agent,
  'kind': 'file.written',
  'summary': 'Arquivo criado',
};
void main() {
  testWidgets('every ecosystem agent renders and expires on the canvas', (
    tester,
  ) async {
    final activity = LiveActivity()..seed('all-agents', []);
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(body: ActivityOnCanvas(activity: activity)),
      ),
    );
    for (var i = 0; i < agentIds.length; i++) {
      activity.sync('all-agents', [event(i + 1, agentIds[i])]);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 700));
      expect(find.text(agentNames[i]), findsOneWidget);
      expect(tester.takeException(), isNull);
    }
    await tester.pump(const Duration(seconds: 8));
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.byType(WorkingGopher), findsNothing);
    await tester.pumpWidget(const SizedBox());
    activity.dispose();
  });
  testWidgets('reconnect snapshots never replay historical work as live', (
    tester,
  ) async {
    final activity = LiveActivity();
    activity.seed('a', []);
    activity.sync('a', [event(1, 'interface')], replay: true);
    expect(activity.visible, isEmpty);
    activity.sync('a', [event(1, 'interface'), event(2, 'backend')]);
    expect(activity.visible.single['sequence'], 2);
    await tester.pump(const Duration(seconds: 8));
    expect(activity.visible, isEmpty);
    activity.sync('a', [event(2, 'backend')]);
    expect(activity.visible, isEmpty);
    activity.dispose();
  });
  testWidgets(
    'bounded activity expires independently and clears on project switch',
    (tester) async {
      final activity = LiveActivity()..seed('a', []);
      activity.sync('a', [
        event(1, 'interface'),
        event(2, 'backend'),
        event(3, 'reviewer'),
      ]);
      expect(activity.visible.length, 2);
      await tester.pump(const Duration(seconds: 4));
      activity.sync('a', [event(4, 'reviewer')]);
      await tester.pump(const Duration(seconds: 4));
      expect(activity.visible.single['sequence'], 4);
      activity.sync('b', [event(1, 'architect')]);
      expect(activity.visible, isEmpty);
      activity.dispose();
    },
  );
}

import 'package:material_ui/material_ui.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:arkom_genesis/main.dart';
import 'package:arkom_genesis/studio_controller.dart';

class RevisionController extends StudioController {
  final calls = <Map<String, dynamic>>[];
  @override
  Future<Map<String, dynamic>> call(
    String action, [
    Map<String, dynamic> data = const {},
  ]) async {
    calls.add({'action': action, ...data});
    return action == 'start' ? {'id': 'child', 'status': 'running'} : {};
  }
}

void main() {
  for (final width in [390.0, 1440.0]) {
    testWidgets('explicit interface revision preserves scope at $width', (
      tester,
    ) async {
      tester.view.physicalSize = Size(width, 1100);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final c = RevisionController()
        ..authenticated = true
        ..role = 'admin';
      c.accept({
        'type': 'snapshot',
        'build': {
          'id': 'parent',
          'status': 'ready',
          'goal': 'Aplicativo pronto',
          'steps': [
            {
              'id': 'interface',
              'title': 'Interface',
              'acceptance': 'Compilação',
              'status': 'completed',
              'trace_count': 0,
            },
          ],
          'next_step_id': '',
          'sequence': 1,
        },
        'files': <String, String>{},
        'traces': <dynamic>[],
      });
      await tester.pumpWidget(GenesisApp(controller: c));
      await tester.pump();
      if (width == 390) {
        await tester.tap(find.byTooltip('Conversar com o Genesis'));
        await tester.pump();
      }
      final checkbox = find.byKey(const ValueKey('interface-revision'));
      await tester.ensureVisible(checkbox);
      await tester.tap(checkbox);
      await tester.pump();
      await tester.enterText(
        find.byType(TextField),
        'Melhorar o espaçamento dos cartões existentes',
      );
      await tester.pump();
      await tester.tap(find.byTooltip('Enviar melhoria'));
      await tester.pump();
      final start = c.calls.firstWhere((v) => v['action'] == 'start');
      expect(start['parent_id'], 'parent');
      expect(start['revision_scope'], 'interface');
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
      c.dispose();
    });
  }
}

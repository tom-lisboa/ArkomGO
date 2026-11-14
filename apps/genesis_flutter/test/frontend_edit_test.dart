import 'package:material_ui/material_ui.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:arkom_genesis/main.dart';
import 'package:arkom_genesis/solution_preview.dart';
import 'package:arkom_genesis/studio_controller.dart';

class DraftController extends StudioController {
  @override
  Future<Map<String, dynamic>> call(
    String action, [
    Map<String, dynamic> data = const {},
  ]) async {
    throw Exception('Salve seu rascunho');
  }
}

class SnapshotController extends StudioController {
  @override
  Future<Map<String, dynamic>> call(
    String action, [
    Map<String, dynamic> data = const {},
  ]) async {
    accept({
      'type': 'snapshot',
      'build': {'id': data['id'], 'status': 'running', 'sequence': 1},
      'files': {'frontend/index.html': '<h1>Primeira prévia</h1>'},
      'traces': <dynamic>[],
    });
    return {};
  }
}

StudioController page() {
  final c = StudioController()
    ..authenticated = true
    ..role = 'admin';
  c.accept({
    'type': 'snapshot',
    'build': {
      'id': 'page',
      'goal': 'Página do cliente',
      'status': 'ready',
      'sequence': 1,
      'has_frontend': true,
      'contract_status': 'validated',
      'runtime_compatible': false,
    },
    'files': {
      'frontend/svelte.json': '{}',
      'frontend/index.html': '<h1>Minha página</h1>',
      'frontend/src/App.svelte': '<h1>Minha página</h1>',
    },
    'traces': [],
  });
  return c;
}

void main() {
  test(
    'a rejected project switch preserves the current files and editor identity',
    () async {
      final c = DraftController()
        ..build = {'id': 'old'}
        ..projects = [
          {'id': 'new'},
        ];
      c.files['frontend/src/App.svelte'] = 'rascunho';
      await c.select('new');
      expect(c.id, 'old');
      expect(c.files.values.single, 'rascunho');
      c.dispose();
    },
  );
  test(
    'selection preserves a snapshot received before the command returns',
    () async {
      final c = SnapshotController()
        ..build = {'id': 'old'}
        ..projects = [
          {'id': 'new'},
        ];
      await c.select('new');
      expect(c.id, 'new');
      expect(c.files['frontend/index.html'], '<h1>Primeira prévia</h1>');
      c.dispose();
    },
  );
  testWidgets(
    'the studio enables Svelte editing while the tool view remains read-only',
    (tester) async {
      tester.view.physicalSize = const Size(1440, 1000);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final c = page();
      await tester.pumpWidget(GenesisApp(controller: c));
      await tester.pump();
      expect(
        tester.widget<SolutionPreview>(find.byType(SolutionPreview)).editable,
        isTrue,
      );
      await tester.pumpWidget(
        MaterialApp(home: Studio(controller: c, toolMode: true)),
      );
      await tester.pump();
      expect(
        tester.widget<SolutionPreview>(find.byType(SolutionPreview)).editable,
        isFalse,
      );
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
      c.dispose();
    },
  );
}

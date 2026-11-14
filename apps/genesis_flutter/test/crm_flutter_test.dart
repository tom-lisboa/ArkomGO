import 'package:material_ui/material_ui.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:arkom_genesis/platform_workspaces.dart';

void main() {
  testWidgets(
    'contact form sends the authenticated CRM contract and reports saved result',
    (tester) async {
      final writes = <Map<String, dynamic>>[];
      Future<dynamic> api(String path, [Map<String, dynamic>? body]) async {
        if (path.endsWith('pipelines.list'))
          return {
            'data': [
              {
                'id': 'pipeline',
                'name': 'Vendas',
                'stagesBreakdown': [
                  {'stageId': 'stage', 'stageName': 'Novo'},
                ],
              },
            ],
          };
        if (path.endsWith('contacts.create')) {
          writes.add(body!);
          return {'leadId': 'lead', 'conversationId': 'conversation'};
        }
        if (path.endsWith('contacts.list') || path.endsWith('cards.list'))
          return {'data': []};
        throw StateError('Unexpected route');
      }

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Padding(
              padding: const EdgeInsets.all(20),
              child: CRMWorkspace(api: api, role: 'admin'),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Contatos'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Novo contato'));
      await tester.pumpAndSettle();
      final dialog = find.byType(AlertDialog);
      await tester.enterText(
        find.descendant(of: dialog, matching: find.byType(TextField)).at(0),
        'Cliente de teste',
      );
      await tester.enterText(
        find.descendant(of: dialog, matching: find.byType(TextField)).at(1),
        'cliente@example.test',
      );
      await tester.tap(find.text('Salvar'));
      await tester.pumpAndSettle();
      expect(writes, [
        {'name': 'Cliente de teste', 'email': 'cliente@example.test'},
      ]);
      expect(tester.takeException(), isNull);
      expect(find.text('Contato cadastrado.'), findsOneWidget);
    },
  );
  testWidgets(
    'SDR history stays chronological when the API sends newest first',
    (tester) async {
      Future<dynamic> api(String path, [Map<String, dynamic>? body]) async {
        if (path.endsWith('/conversations'))
          return {
            'items': [
              {
                'id': 'conversation',
                'label': 'Contato',
                'channel': 'fake_whatsapp',
              },
            ],
          };
        if (path.endsWith('/messages'))
          return {
            'items': [
              {
                'sequence': 2,
                'author': 'assistant',
                'text': 'Segunda mensagem',
              },
              {'sequence': 1, 'author': 'lead', 'text': 'Primeira mensagem'},
            ],
          };
        return {
          'id': 'conversation',
          'label': 'Contato',
          'channel': 'fake_whatsapp',
          'revision': 1,
        };
      }

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SDRWorkspace(api: api, role: 'viewer'),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(
        tester.getTopLeft(find.text('Primeira mensagem')).dy,
        lessThan(tester.getTopLeft(find.text('Segunda mensagem')).dy),
      );
      await tester.pumpWidget(const SizedBox());
      expect(tester.takeException(), isNull);
    },
  );
}

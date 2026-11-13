import 'dart:convert';

import 'package:material_ui/material_ui.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:arkom_genesis/design_brief.dart';
import 'package:arkom_genesis/main.dart';
import 'package:arkom_genesis/studio_controller.dart';

void main() {
  for (final width in [390.0, 1440.0]) {
    testWidgets('UX artifact opens from persisted step at width $width', (
      tester,
    ) async {
      tester.view.physicalSize = Size(width, 1000);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final c = StudioController()
        ..authenticated = true
        ..role = 'admin';
      c.accept({
        'type': 'snapshot',
        'build': {
          'id': 'ux',
          'goal': 'Calcular valores',
          'status': 'awaiting_step',
          'steps_version': 2,
          'sequence': 3,
          'next_step_id': 'designer',
          'steps': [
            for (final id in [
              'architect',
              'ux',
              'designer',
              'backend',
              'interface',
              'reviewer',
            ])
              {
                'id': id,
                'title': id == 'ux' ? 'Definir experiência' : id,
                'acceptance': 'Critério da etapa',
                'status': ['architect', 'ux'].contains(id)
                    ? 'completed'
                    : 'pending',
                'trace_count': id == 'ux' ? 3 : 0,
                'first_sequence': id == 'ux' ? 1 : 0,
                'last_sequence': id == 'ux' ? 3 : 0,
              },
          ],
        },
        'files': {
          'design/ux.json': jsonEncode({
            'audience': 'Pessoas que somam no celular',
            'journey': ['Informar valores e consultar resultado'],
          }),
        },
        'traces': [
          {
            'sequence': 1,
            'step_id': 'ux',
            'agent': 'ux',
            'kind': 'agent.started',
            'summary': 'Iniciou UX',
          },
          {
            'sequence': 2,
            'step_id': 'ux',
            'agent': 'ux',
            'kind': 'design.validated',
            'summary': 'Estrutura validada',
          },
          {
            'sequence': 3,
            'step_id': 'ux',
            'agent': 'system',
            'kind': 'step.completed',
            'summary': 'UX concluída',
          },
        ],
      });
      await tester.pumpWidget(GenesisApp(controller: c));
      await tester.pump();
      if (width == 390) {
        await tester.tap(find.byTooltip('Conversar com o Genesis'));
        await tester.pump();
      }
      await tester.ensureVisible(find.byKey(const ValueKey('brief-ux')));
      await tester.tap(find.byKey(const ValueKey('brief-ux')));
      await tester.pump();
      expect(find.byType(DesignBrief), findsOneWidget);
      expect(find.text('Público e contexto'), findsOneWidget);
      expect(find.text('Pessoas que somam no celular'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
      c.dispose();
    });
  }
}

import 'dart:io';

import 'package:flutter/services.dart';

import 'package:material_ui/material_ui.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:arkom_genesis/platform.dart';

Future<dynamic> api(String path, [Map<String, dynamic>? body]) async {
  if (path.endsWith('/ecosystem'))
    return {
      'solutions': [
        {
          'id': 'sdr',
          'name': 'BIA SDR',
          'area': 'Vendas',
          'description': 'Conversas e atendimento.',
          'implemented': true,
          'configured': true,
        },
        {
          'id': 'crm',
          'name': 'CRM Arkom',
          'area': 'Vendas',
          'description': 'Contatos e oportunidades.',
          'implemented': true,
          'configured': true,
        },
        {
          'id': 'genesis',
          'name': 'Genesis',
          'area': 'Produto',
          'description': 'Crie com seu time.',
          'implemented': true,
          'configured': true,
        },
        {
          'id': 'clips',
          'name': 'CLIPS',
          'area': 'Marketing',
          'description': 'Cortes verticais.',
          'implemented': true,
          'configured': true,
        },
        {
          'id': 'financeai',
          'name': 'FinanceAI',
          'area': 'Back Office',
          'description': 'Gestão financeira.',
          'implemented': false,
          'configured': false,
        },
      ],
    };
  if (path.endsWith('/construction')) return {'builds': []};
  if (path.endsWith('/conversations')) return {'items': []};
  if (path.endsWith('/pipelines.list') || path.endsWith('/contacts.list'))
    return {'data': []};
  if (path.endsWith('/jobs')) return {'jobs': []};
  return {};
}

void main() {
  setUpAll(() async {
    final font = FontLoader('ArkomSans')
      ..addFont(rootBundle.load('assets/fonts/Roboto-Regular.ttf'));
    await font.load();
    final defaults = FontLoader('Roboto')
      ..addFont(rootBundle.load('assets/fonts/Roboto-Regular.ttf'));
    await defaults.load();
    final icons = FontLoader('MaterialIcons')
      ..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'));
    await icons.load();
  });
  for (final width in [1440.0, 390.0]) {
    for (final view in ['home', 'systems', 'map', 'sdr', 'crm', 'clips']) {
      testWidgets('Flutter platform $view at $width', (tester) async {
        tester.view.physicalSize = Size(width, 900);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final navigated = <String>[];
        await tester.pumpWidget(
          ArkomPlatform(initialView: view, api: api, onNavigate: navigated.add),
        );
        await tester.pump(const Duration(milliseconds: 500));
        expect(tester.takeException(), isNull);
        if (Platform.isMacOS && ['home', 'systems', 'map'].contains(view))
          await expectLater(
            find.byType(ArkomPlatform),
            matchesGoldenFile('goldens/platform-$view-${width.toInt()}.png'),
          );
        if (view == 'systems') {
          await tester.enterText(find.byType(TextField).first, 'Finance');
          await tester.pump();
          expect(find.text('FinanceAI'), findsOneWidget);
          await tester.tap(find.text('FinanceAI'));
          await tester.pump();
          expect(navigated, isEmpty);
          await tester.enterText(find.byType(TextField).first, 'BIA');
          await tester.pump();
          await tester.tap(find.text('BIA SDR'));
          expect(navigated, ['sdr']);
        }
        await tester.pumpWidget(const SizedBox());
      });
    }
  }
}

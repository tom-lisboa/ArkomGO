import 'dart:io';

import 'package:flutter/services.dart';

import 'package:material_ui/material_ui.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:arkom_genesis/genesis_tools.dart';
import 'package:arkom_genesis/platform.dart';
import 'package:arkom_genesis/workspace_team.dart';

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
          'kind': 'Agentes',
          'guide': [
            {
              'title': 'Comece por aqui',
              'description': 'Abra o sistema e acompanhe seu trabalho.',
            },
          ],
          'requirements': [
            {'name': 'Conta Arkom', 'status': 'Incluído'},
          ],
          'rating': {'mine': 0, 'count': 0, 'average': null},
        },
        {
          'id': 'crm',
          'name': 'CRM Arkom',
          'area': 'Vendas',
          'description': 'Contatos e oportunidades.',
          'implemented': true,
          'configured': true,
          'kind': 'Agentes',
          'guide': [
            {
              'title': 'Comece por aqui',
              'description': 'Abra o sistema e acompanhe seu trabalho.',
            },
          ],
          'requirements': [
            {'name': 'Conta Arkom', 'status': 'Incluído'},
          ],
          'rating': {'mine': 0, 'count': 0, 'average': null},
        },
        {
          'id': 'genesis',
          'name': 'Genesis',
          'area': 'Produto',
          'description': 'Crie com seu time.',
          'implemented': true,
          'configured': true,
          'kind': 'Agentes',
          'guide': [
            {
              'title': 'Comece por aqui',
              'description': 'Abra o sistema e acompanhe seu trabalho.',
            },
          ],
          'requirements': [
            {'name': 'Conta Arkom', 'status': 'Incluído'},
          ],
          'rating': {'mine': 0, 'count': 0, 'average': null},
        },
        {
          'id': 'clips',
          'name': 'Luma',
          'area': 'Marketing',
          'description': 'Cortes verticais.',
          'implemented': true,
          'configured': true,
          'kind': 'Agentes',
          'guide': [
            {
              'title': 'Comece por aqui',
              'description': 'Abra o sistema e acompanhe seu trabalho.',
            },
          ],
          'requirements': [
            {'name': 'Conta Arkom', 'status': 'Incluído'},
          ],
          'rating': {'mine': 0, 'count': 0, 'average': null},
        },
        {
          'id': 'financeai',
          'name': 'FinanceAI',
          'area': 'Back Office',
          'description': 'Gestão financeira.',
          'implemented': true,
          'configured': true,
        },
      ],
    };
  if (path.endsWith('/rating'))
    return {'mine': body!['rating'], 'count': 1, 'average': body['rating']};
  if (path.endsWith('/construction')) {
    return {
      'builds': [
        {
          'id': 'build_draft',
          'application_id': 'app_calc',
          'name': 'Calculadora em alteração',
          'status': 'running',
          'has_frontend': true,
          'revision': 3,
        },
        {
          'id': 'build_calc',
          'application_id': 'app_calc',
          'name': 'Calculadora',
          'status': 'ready',
          'has_frontend': true,
          'revision': 2,
        },
        {
          'id': 'build_prev',
          'application_id': 'app_calc',
          'name': 'Calculadora antiga',
          'status': 'ready',
          'has_frontend': true,
          'revision': 1,
        },
        {
          'id': 'build_backend',
          'name': 'Sem interface',
          'status': 'ready',
          'has_frontend': false,
        },
      ],
    };
  }
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
    for (final view in [
      'home',
      'tools',
      'team',
      'map',
      'systems/sdr',
      'sdr',
      'crm',
      'clips',
    ]) {
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
        if (Platform.isMacOS &&
            ['home', 'tools', 'team', 'map', 'systems/sdr'].contains(view))
          await expectLater(
            find.byType(ArkomPlatform),
            matchesGoldenFile(
              'goldens/platform-${view.replaceAll('/', '-')}-${width.toInt()}.png',
            ),
          );
        if (view == 'systems/sdr') {
          expect(navigated, isEmpty);
          expect(find.text('Acessar sistema'), findsOneWidget);
          await tester.ensureVisible(find.byTooltip('Avaliar com 3 estrelas'));
          await tester.pumpAndSettle();
          await tester.tap(find.byTooltip('Avaliar com 3 estrelas'));
          await tester.pumpAndSettle();
          expect(find.textContaining('3,0 · 1'), findsOneWidget);
          await tester.ensureVisible(find.text('Acessar sistema'));
          await tester.pumpAndSettle();
          await tester.tap(find.text('Acessar sistema'));
          expect(navigated, ['sdr']);
        }
        if (view == 'tools') {
          expect(find.text('Calculadora'), findsOneWidget);
          expect(find.text('Calculadora antiga'), findsNothing);
          expect(find.text('Calculadora em alteração'), findsNothing);
          expect(find.text('Sem interface'), findsNothing);
          expect(
            find.descendant(
              of: find.byType(GenesisTools),
              matching: find.text('FinanceAI'),
            ),
            findsNothing,
          );
          await tester.tap(find.text('Calculadora'));
          expect(navigated, ['tools/build_calc']);
          await tester.tap(find.byTooltip('Editar Calculadora no Genesis'));
          expect(navigated.last, 'genesis/build_calc');
          await tester.tap(find.text('Criar ferramenta'));
          expect(navigated.last, 'genesis/new');
        }
        if (view == 'team') {
          for (final name in [
            'Vendas',
            'Conteúdo',
            'Financeiro',
            'Operações',
          ]) {
            final heading = find.text(name);
            await tester.ensureVisible(heading);
            expect(heading, findsOneWidget);
          }
          final bia = find.descendant(
            of: find.byType(WorkspaceTeam),
            matching: find.text('BIA SDR'),
          );
          final clips = find.descendant(
            of: find.byType(WorkspaceTeam),
            matching: find.text('Luma'),
          );
          await tester.ensureVisible(bia);
          await tester.tap(bia);
          await tester.ensureVisible(clips);
          await tester.tap(clips);
          expect(navigated, ['sdr', 'clips']);
          final maia = find.descendant(
            of: find.byType(WorkspaceTeam),
            matching: find.text('Maia'),
          );
          await tester.ensureVisible(maia);
          expect(maia, findsOneWidget);
          await tester.tap(maia, warnIfMissed: false);
          expect(navigated, ['sdr', 'clips']);
          expect(find.text('Indisponível para esta conta.'), findsOneWidget);
          final finance = find.descendant(
            of: find.byType(WorkspaceTeam),
            matching: find.text('FinanceAI'),
          );
          await tester.ensureVisible(finance);
          await tester.tap(finance);
          expect(navigated.last, 'financeai');
          expect(find.text('Calculadora'), findsNothing);
        }
        await tester.pumpWidget(const SizedBox());
      });
    }
  }
}

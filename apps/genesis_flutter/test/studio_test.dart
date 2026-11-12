import 'package:material_ui/material_ui.dart';
import 'package:flutter/services.dart';

import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:arkom_genesis/main.dart';
import 'package:arkom_genesis/studio_controller.dart';

StudioController fixture() {
  final c = StudioController()
    ..authenticated = true
    ..role = 'admin'
    ..connection = 'live';
  c.accept({
    'type': 'snapshot',
    'build': {
      'id': 'demo',
      'goal': 'Organizar oportunidades de leilão',
      'status': 'running',
      'sequence': 5,
    },
    'files': {
      'DESIGN.md':
          '# Oportunidades de leilão\n\nDomínio com isolamento por empresa.',
      'backend/lots.go': 'package auction\n\n// Cada empresa acompanha seus próprios lotes.\ntype Lot struct {\n    ID string\n    OrganizationID string\n    Title string\n}\n',
    },
    'traces': [
      {
        'sequence': 1,
        'kind': 'agent.started',
        'agent': 'architect',
        'summary': 'Organizando sua ideia em um plano de construção.',
        'at': '2026-11-11T21:18:00Z',
      },
      {
        'sequence': 2,
        'kind': 'file.read',
        'agent': 'architect',
        'summary': 'Consultou os contratos do ecossistema Arkom.',
        'path': 'reference/catalog.json',
        'at': '2026-11-11T21:18:02Z',
      },
      {
        'sequence': 3,
        'kind': 'agent.finished',
        'agent': 'architect',
        'summary': 'Arquitetura pronta para o time construir.',
        'at': '2026-11-11T21:18:07Z',
      },
      {
        'sequence': 4,
        'kind': 'agent.started',
        'agent': 'backend',
        'summary': 'Construindo o cadastro de lotes em Go.',
        'at': '2026-11-11T21:18:09Z',
      },
      {
        'sequence': 5,
        'kind': 'file.written',
        'agent': 'backend',
        'summary': 'Criou o modelo de lotes com isolamento por empresa.',
        'path': 'backend/lots.go',
        'after': 'package auction\n\ntype Lot struct {\n    ID string\n    OrganizationID string\n    Title string\n}\n',
        'at': '2026-11-11T21:18:15Z',
      },
    ],
  });
  return c;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    final font = FontLoader('ArkomSans');
    for (final name in ['Regular', 'Light', 'Medium', 'Bold']) {
      font.addFont(rootBundle.load('assets/fonts/Roboto-$name.ttf'));
    }
    await font.load();
    final defaults = FontLoader('Roboto')
      ..addFont(rootBundle.load('assets/fonts/Roboto-Regular.ttf'));
    await defaults.load();
    final mono = FontLoader('ArkomMono')
      ..addFont(rootBundle.load('assets/fonts/RobotoMono-Regular.ttf'));
    await mono.load();
    final icons = FontLoader('MaterialIcons')
      ..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'));
    await icons.load();
  });
  test('delta and reconnect keep a single ordered event history', () {
    final c = fixture();
    final update = {
      'type': 'update',
      'build': c.build,
      'traces': [
        {
          'sequence': 6,
          'kind': 'file.written',
          'path': 'backend/lots.go',
          'after': 'package revised',
        },
      ],
    };
    c.accept(update);
    c.accept(update);
    expect(c.traces.length, 6);
    expect(c.files['backend/lots.go'], 'package revised');
  });
  for (final width in [1280.0, 900.0, 390.0]) {
    testWidgets('workspace switches solution/code/history at width $width', (
      tester,
    ) async {
      tester.view.physicalSize = Size(width, 900);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final c = fixture();
      c.accept({
        'type': 'snapshot',
        'build': {...c.build!, 'status': 'ready'},
        'files': {...c.files, 'frontend/index.html': '<h1>Leilões</h1>'},
        'traces': [],
      });
      await tester.pumpWidget(GenesisApp(controller: c));
      await tester.pump(const Duration(milliseconds: 400));
      expect(tester.takeException(), isNull);
      expect(find.text('Prévia interativa da solução'), findsOneWidget);
      final preview = tester.element(find.text('Prévia interativa da solução'));
      if (Platform.isMacOS && width != 900) {
        await expectLater(
          find.byType(GenesisApp),
          matchesGoldenFile(
            'goldens/studio-${width == 1280 ? 'desktop' : 'mobile'}.png',
          ),
        );
      }
      await tester.tap(find.byTooltip('Código'));
      await tester.pump(const Duration(milliseconds: 400));
      expect(find.text('Prévia interativa da solução'), findsNothing);
      expect(find.textContaining('package auction'), findsOneWidget);
      await tester.tap(find.byTooltip('Solução'));
      await tester.pump();
      expect(
        tester.element(find.text('Prévia interativa da solução')),
        same(preview),
      );
      if (width == 390) {
        await tester.tap(find.byTooltip('Conversar com o Genesis'));
        await tester.pump();
        expect(find.byType(TextField), findsOneWidget);
        await tester.tap(find.byTooltip('Solução'));
        await tester.pump();
        expect(
          tester.element(find.text('Prévia interativa da solução')),
          same(preview),
        );
      }
      await tester.tap(find.byTooltip('Histórico de ações'));
      await tester.pump();
      expect(find.text('Histórico de ações'), findsOneWidget);
      expect(
        find.text('Criou o modelo de lotes com isolamento por empresa.'),
        findsOneWidget,
      );
      await tester.tap(
        find.text('Criou o modelo de lotes com isolamento por empresa.'),
      );
      await tester.pump();
      expect(find.text('ANTES'), findsOneWidget);
      expect(find.text('DEPOIS'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
      c.dispose();
    });
  }

  testWidgets('live agent appears then leaves canvas; history persists', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1280, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final c = fixture();
    await tester.pumpWidget(GenesisApp(controller: c));
    await tester.pump();
    expect(
      find.text('Criou o modelo de lotes com isolamento por empresa.'),
      findsNothing,
    );
    c.accept({
      'type': 'update',
      'build': {...c.build!, 'sequence': 6},
      'traces': [
        {
          'sequence': 6,
          'kind': 'file.written',
          'path': 'frontend/index.html',
          'after': '<h1>Leilões</h1>',
          'agent': 'interface',
          'summary': 'Organizou a página de oportunidades.',
        },
      ],
    });
    await tester.pump(const Duration(seconds: 1));
    expect(find.text('Organizou a página de oportunidades.'), findsOneWidget);
    expect(find.text('Prévia interativa da solução'), findsOneWidget);
    await tester.pump(const Duration(milliseconds: 400));
    if (Platform.isMacOS) {
      await expectLater(
        find.byType(GenesisApp),
        matchesGoldenFile('goldens/studio-live.png'),
      );
    }
    await tester.pump(const Duration(seconds: 7));
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.text('Organizou a página de oportunidades.'), findsNothing);
    await tester.tap(find.byTooltip('Histórico de ações'));
    await tester.pump();
    expect(find.text('Organizou a página de oportunidades.'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
    c.dispose();
  });
  testWidgets(
    'replay is labeled and can be stopped without changing stored traces',
    (tester) async {
      tester.view.physicalSize = const Size(1280, 900);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final c = fixture();
      c.accept({
        'type': 'snapshot',
        'build': {...c.build!, 'status': 'ready'},
        'traces': [],
      });
      final count = c.traces.length;
      await tester.pumpWidget(GenesisApp(controller: c));
      await tester.pump();
      await tester.tap(find.byTooltip('Mais opções'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Rever ações dos Gophers'));
      await tester.pump(const Duration(milliseconds: 500));
      expect(find.text('Reprodução das ações · prévia atual'), findsOneWidget);
      await tester.pump(const Duration(seconds: 3));
      expect(c.traces.length, count);
      await tester.tap(find.byTooltip('Encerrar reprodução'));
      await tester.pump(const Duration(milliseconds: 500));
      expect(find.text('Reprodução das ações · prévia atual'), findsNothing);
      expect(c.traces.length, count);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
      c.dispose();
    },
  );
}

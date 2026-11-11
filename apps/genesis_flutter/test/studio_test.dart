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
      'backend/lots.go':
          'package auction\n\n// Cada empresa acompanha seus próprios lotes.\ntype Lot struct {\n    ID string\n    OrganizationID string\n    Title string\n}\n',
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
        'after':
            'package auction\n\ntype Lot struct {\n    ID string\n    OrganizationID string\n    Title string\n}\n',
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
    testWidgets('studio at width $width renders and updates live', (
      tester,
    ) async {
      tester.view.physicalSize = Size(width, 1100);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final c = fixture();
      await tester.pumpWidget(GenesisApp(controller: c));
      await tester.pump(const Duration(milliseconds: 300));
      expect(tester.takeException(), isNull);
      if (width == 1280 && Platform.isMacOS) {
        await expectLater(
          find.byType(GenesisApp),
          matchesGoldenFile('goldens/studio-desktop.png'),
        );
      }
      if (width == 390 && Platform.isMacOS) {
        await expectLater(
          find.byType(GenesisApp),
          matchesGoldenFile('goldens/studio-mobile.png'),
        );
      }
      c.accept({
        'type': 'update',
        'build': c.build,
        'traces': [
          {
            'sequence': 6,
            'kind': 'test.passed',
            'agent': 'backend',
            'summary': 'Testes aprovados em isolamento.',
            'output': 'PASS',
            'at': '2026-11-11T21:18:20Z',
          },
        ],
      });
      await tester.pump(const Duration(milliseconds: 300));
      expect(tester.takeException(), isNull);
      expect(c.traces.length, 6);
      await tester.pumpWidget(const SizedBox());
      c.dispose();
    });
  }
}

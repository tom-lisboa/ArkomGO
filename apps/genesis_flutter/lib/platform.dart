import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;

import 'package:material_ui/material_ui.dart';

import 'clips_workspace.dart';
import 'main.dart' show Studio;
import 'platform_workspaces.dart';
import 'solution_catalog.dart';
import 'solution_detail.dart';
import 'transport.dart' as transport;
import 'visuals.dart';

typedef PlatformCall = Future<dynamic> Function(
  String path, [
  Map<String, dynamic>? body,
]);

class ArkomPlatform extends StatefulWidget {
  final String initialView;
  final PlatformCall? api;
  final void Function(String)? onNavigate;
  const ArkomPlatform({
    super.key,
    required this.initialView,
    this.api,
    this.onNavigate,
  });
  @override
  State<ArkomPlatform> createState() => _ArkomPlatformState();
}

class _ArkomPlatformState extends State<ArkomPlatform> {
  String view = '', error = '', filter = 'Todos', query = '', role = 'viewer';
  bool connected = false;
  List<Map<String, dynamic>> solutions = [];
  int projectCount = 0, loadVersion = 0;
  String company = 'Alfa';
  String get section => view.startsWith('systems/') ? 'systems' : view;
  static const navigation = [
    ('home', 'Início', Icons.home_outlined),
    ('map', 'Mapa', Icons.map_outlined),
    ('systems', 'Sistemas', Icons.grid_view_outlined),
    ('genesis', 'Genesis', Icons.auto_awesome_outlined),
    ('business', 'Minha empresa', Icons.business_outlined),
  ];
  @override
  void initState() {
    super.initState();
    view = widget.initialView;
    if (widget.api != null) {
      connected = true;
      role = 'admin';
      unawaited(load());
    } else if (view != 'genesis') {
      transport.connect((raw) {
        if (!mounted) return;
        final e = jsonDecode(raw);
        if (e['type'] == 'session') {
          setState(() {
            connected = true;
            role = e['identity']['role'];
            company = e['identity']['organization_id'] == 'org_demo_alfa'
                ? 'Alfa'
                : e['identity']['organization_id'] == 'org_demo_beta'
                ? 'Beta'
                : 'Minha empresa';
            solutions = [];
            projectCount = 0;
          });
          unawaited(load());
        }
      });
    }
  }

  Future<dynamic> api(String path, [Map<String, dynamic>? body]) async {
    if (widget.api != null) return widget.api!(path, body);
    final raw = await transport.invoke(
      'platform',
      jsonEncode({'path': path, if (body != null) 'body': body}),
    );
    return jsonDecode(raw);
  }

  Future<void> load() async {
    final version = ++loadVersion;
    try {
      final data = await api('/v1/sdr/genesis-demo/ecosystem');
      final projects = await api('/v1/sdr/genesis-demo/construction');
      if (mounted && version == loadVersion)
        setState(() {
          solutions = List<Map<String, dynamic>>.from(
            (data['solutions'] as List).map(
              (v) => Map<String, dynamic>.from(v),
            ),
          );
          projectCount = (projects['builds'] as List).length;
          error = '';
        });
    } catch (e) {
      if (mounted)
        setState(
          () => error = 'Não foi possível carregar os sistemas. Confira se os serviços locais estão em execução.',
        );
    }
  }

  void go(String value) {
    if (widget.onNavigate != null) {
      widget.onNavigate!(value);
      return;
    }
    unawaited(transport.invoke('navigate', jsonEncode({'view': value})));
  }

  @override
  void dispose() {
    if (view != 'genesis' && widget.api == null) transport.disconnect();
    super.dispose();
  }

  Widget text(
    String value, {
    double size = 14,
    Color color = const Color(0xffe5e5e3),
    FontWeight weight = FontWeight.w400,
  }) => Text(
    value,
    style: TextStyle(fontSize: size, color: color, fontWeight: weight),
  );
  Widget sidebar(bool small) => Container(
    width: small ? 92 : 244,
    margin: const EdgeInsets.all(14),
    padding: EdgeInsets.symmetric(horizontal: small ? 6 : 14, vertical: 22),
    decoration: BoxDecoration(
      color: const Color(0xff101112),
      borderRadius: BorderRadius.circular(23),
      border: Border.all(color: line),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: EdgeInsets.only(left: small ? 6 : 12, bottom: 28),
          child: ArkomWordmark(compact: small),
        ),
        if (!small)
          Padding(
            padding: const EdgeInsets.only(left: 12, bottom: 12),
            child: text('ESPAÇO DE TRABALHO', size: 10, color: muted),
          ),
        ...navigation.map(
          (n) => Padding(
            padding: const EdgeInsets.only(bottom: 5),
            child: Tooltip(
              message: n.$2,
              child: Material(
                color: Colors.transparent,
                child: InkWell(
                  borderRadius: BorderRadius.circular(24),
                  onTap: () => go(n.$1),
                  child: Container(
                    height: 43,
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    decoration: BoxDecoration(
                      color: section == n.$1
                          ? const Color(0xff222220)
                          : Colors.transparent,
                      borderRadius: BorderRadius.circular(24),
                      border: Border.all(
                        color: section == n.$1
                            ? const Color(0xff6e6047)
                            : Colors.transparent,
                      ),
                    ),
                    child: Row(
                      children: [
                        Icon(
                          n.$3,
                          size: 18,
                          color: section == n.$1
                              ? const Color(0xffefeee8)
                              : muted,
                        ),
                        if (!small) ...[
                          const SizedBox(width: 12),
                          Expanded(
                            child: text(
                              n.$2,
                              size: 13,
                              color: section == n.$1
                                  ? const Color(0xffefeee8)
                                  : muted,
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
        if (!small) ...[
          const SizedBox(height: 12),
          ...['Gestor IA', 'Mentorias', 'Universidade IA'].map(
            (n) => Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
              child: Row(
                children: [
                  const Icon(
                    Icons.lock_outline,
                    size: 15,
                    color: Color(0xff52545a),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: text(n, size: 12, color: const Color(0xff62656a)),
                  ),
                ],
              ),
            ),
          ),
        ],
        const Spacer(),
        if (!small) ...[
          Container(
            padding: const EdgeInsets.symmetric(vertical: 6),
            alignment: Alignment.center,
            decoration: BoxDecoration(
              border: Border.all(color: line),
              borderRadius: BorderRadius.circular(20),
            ),
            child: text('IDIOMA   EN / PT', size: 10, color: muted),
          ),
          const SizedBox(height: 20),
          Row(
            children: [
              const CircleAvatar(
                radius: 15,
                backgroundColor: Color(0xff282927),
                child: Text('AL', style: TextStyle(fontSize: 10, color: gold)),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    text(
                      company == 'Minha empresa'
                          ? company
                          : '$company Demonstração',
                      size: 11,
                    ),
                    text('Ambiente local', size: 10, color: muted),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),
          text('Modo escuro', size: 11, color: muted),
        ],
      ],
    ),
  );
  @override
  Widget build(BuildContext context) => MaterialApp(
    debugShowCheckedModeBanner: false,
    title: 'Arkom',
    theme: ThemeData(
      brightness: Brightness.dark,
      scaffoldBackgroundColor: ink,
      fontFamily: 'ArkomSans',
      colorScheme: ColorScheme.fromSeed(
        seedColor: gold,
        brightness: Brightness.dark,
        surface: panel,
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: panel,
        border: OutlineInputBorder(
          borderSide: const BorderSide(color: line),
          borderRadius: BorderRadius.circular(12),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(foregroundColor: gold),
      ),
    ),
    home: Scaffold(
      body: LayoutBuilder(
        builder: (context, c) => Row(
          children: [
            if (view != 'clips' || c.maxWidth >= 650) sidebar(c.maxWidth < 850),
            Expanded(
              child: Padding(
                padding: EdgeInsets.fromLTRB(
                  c.maxWidth < 650 ? (view == 'clips' ? 14 : 8) : 22,
                  22,
                  view == 'clips' && c.maxWidth < 650 ? 14 : 22,
                  16,
                ),
                child: view == 'genesis'
                    ? const Studio()
                    : !connected
                    ? const Center(
                        child: CircularProgressIndicator(color: gold),
                      )
                    : Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Row(
                            children: [
                              Expanded(
                                child: text(
                                  'ARKOM  /  ${title()}',
                                  size: 10,
                                  color: muted,
                                ),
                              ),
                              const Icon(
                                Icons.circle,
                                size: 6,
                                color: Color(0xff8ac6ac),
                              ),
                              const SizedBox(width: 7),
                              text('ESPAÇO LOCAL', size: 9, color: muted),
                            ],
                          ),
                          const SizedBox(height: 20),
                          if (error.isNotEmpty)
                            Padding(
                              padding: const EdgeInsets.only(bottom: 12),
                              child: Row(
                                children: [
                                  Expanded(
                                    child: text(
                                      error,
                                      size: 12,
                                      color: const Color(0xfff0b4a2),
                                    ),
                                  ),
                                  TextButton(
                                    onPressed: load,
                                    child: const Text('Tentar novamente'),
                                  ),
                                ],
                              ),
                            ),
                          Expanded(child: content()),
                        ],
                      ),
              ),
            ),
          ],
        ),
      ),
    ),
  );
  String title() =>
      ({
        'home': 'Início',
        'map': 'Mapa',
        'systems': 'Sistemas',
        'sdr': 'BIA SDR',
        'crm': 'CRM Arkom',
        'clips': 'CLIPS',
        'business': 'Minha empresa',
      })[section] ??
      'Sistemas';
  Widget content() {
    if (view.startsWith('systems/')) {
      final id = view.split('/').last;
      final s = solutions.where((s) => s['id'] == id).firstOrNull;
      return s == null
          ? const Center(child: Text('Sistema não encontrado.'))
          : SolutionDetail(
              key: ValueKey(id),
              solution: s,
              role: role,
              api: api,
              onBack: () => go('systems'),
              onOpen: () => go(id),
            );
    }
    switch (view) {
      case 'home':
        return home();
      case 'map':
        return ecosystemMap();
      case 'sdr':
        return SDRWorkspace(api: api, role: role);
      case 'crm':
        return CRMWorkspace(api: api, role: role);
      case 'clips':
        return ClipsWorkspace(
          api: api,
          role: role,
          onBack: () => go('systems/clips'),
        );
      case 'business':
        return BusinessWorkspace(api: api);
      default:
        return systems();
    }
  }

  Widget card(Widget child, {EdgeInsets padding = const EdgeInsets.all(24)}) =>
      Container(
        padding: padding,
        decoration: BoxDecoration(
          color: panel,
          border: Border.all(color: line),
          borderRadius: BorderRadius.circular(22),
        ),
        child: child,
      );
  Widget home() => SingleChildScrollView(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 25),
        text('SUA EMPRESA, CONECTADA', size: 10, color: muted),
        const SizedBox(height: 15),
        Text.rich(
          TextSpan(
            text: 'Boas-vindas, ',
            children: [
              TextSpan(
                text: '$company.',
                style: TextStyle(color: gold),
              ),
            ],
          ),
          style: TextStyle(
            fontSize: 44,
            fontWeight: FontWeight.w300,
            letterSpacing: -1.8,
          ),
        ),
        const SizedBox(height: 15),
        text(
          'Seu trabalho continua aqui. Abra uma solução ou crie o próximo passo com o Genesis.',
          size: 14,
          color: muted,
        ),
        const SizedBox(height: 30),
        LayoutBuilder(
          builder: (context, c) => Wrap(
            spacing: 14,
            runSpacing: 14,
            children: [
              stat(
                '${solutions.where((s) => s['implemented'] == true).length}',
                'soluções na estrutura',
                c.maxWidth,
              ),
              stat('$projectCount', 'projetos no Genesis', c.maxWidth),
              stat('6', 'especialistas de construção', c.maxWidth),
            ],
          ),
        ),
        const SizedBox(height: 22),
        card(
          Row(
            children: [
              const Gopher(index: 0, size: 80),
              const SizedBox(width: 24),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    text('GENESIS', size: 10, color: gold),
                    const SizedBox(height: 10),
                    text(
                      'O que vamos construir?',
                      size: 26,
                      weight: FontWeight.w300,
                    ),
                    const SizedBox(height: 10),
                    text(
                      'Descreva sua ideia e acompanhe o time trabalhando com a estrutura da Arkom.',
                      size: 13,
                      color: muted,
                    ),
                    const SizedBox(height: 18),
                    FilledButton(
                      onPressed: () => go('genesis'),
                      style: FilledButton.styleFrom(
                        backgroundColor: gold,
                        foregroundColor: ink,
                      ),
                      child: const Text('Criar minha solução'),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 30),
        Row(
          children: [
            Expanded(
              child: text('Suas soluções', size: 21, weight: FontWeight.w300),
            ),
            TextButton(
              onPressed: () => go('systems'),
              child: const Text('Ver sistemas'),
            ),
          ],
        ),
        const SizedBox(height: 16),
        solutionGrid(solutions.where((s) => s['implemented'] == true).toList()),
        const SizedBox(height: 25),
        InkWell(
          onTap: () => go('business'),
          child: card(
            Row(
              children: [
                const Icon(Icons.hub_outlined, color: gold, size: 30),
                const SizedBox(width: 18),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      text(
                        'Um só contexto para sua empresa.',
                        size: 20,
                        weight: FontWeight.w300,
                      ),
                      const SizedBox(height: 8),
                      text(
                        'Informações do negócio que orientam o trabalho dos seus agentes.',
                        size: 12,
                        color: muted,
                      ),
                    ],
                  ),
                ),
                const Icon(Icons.arrow_forward, color: gold),
              ],
            ),
          ),
        ),
      ],
    ),
  );
  Widget stat(String value, String label, double width) => SizedBox(
    width: width < 500 ? (width - 14) / 2 : 180,
    child: card(
      Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          text(value, size: 28, weight: FontWeight.w300),
          const SizedBox(height: 7),
          text(label, size: 10, color: muted),
        ],
      ),
      padding: const EdgeInsets.all(18),
    ),
  );
  Widget systems() => SolutionCatalog(
    solutions: solutions,
    onSelect: (id) => go('systems/$id'),
  );
  Widget solutionGrid(List<Map<String, dynamic>> values) =>
      SolutionCards(solutions: values, onSelect: (id) => go('systems/$id'));
  IconData icon(String id) =>
      ({
        'sdr': Icons.forum_outlined,
        'crm': Icons.people_outline,
        'genesis': Icons.auto_awesome_outlined,
        'clips': Icons.movie_outlined,
        'financeai': Icons.account_balance_outlined,
      })[id] ??
      Icons.widgets_outlined;
  Widget ecosystemMap() => LayoutBuilder(
    builder: (context, c) => Stack(
      children: [
        Positioned.fill(child: CustomPaint(painter: ArkomMapPainter())),
        Align(
          alignment: Alignment.topCenter,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 7),
            decoration: BoxDecoration(
              color: const Color(0xffeae5d5),
              borderRadius: BorderRadius.circular(7),
            ),
            child: const Text(
              'M A P A',
              style: TextStyle(color: ink, fontSize: 11),
            ),
          ),
        ),
        Align(
          alignment: Alignment.center,
          child: InkWell(
            onTap: () => go('business'),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.hub_outlined, size: 52, color: gold),
                const SizedBox(height: 20),
                text('C O N T E X T O', size: 12),
                text('Sua empresa', size: 10, color: muted),
              ],
            ),
          ),
        ),
        mapNode(
          'MARKETING',
          'CLIPS',
          'clips',
          const Alignment(0, -.78),
          const Color(0xff73c9d8),
        ),
        mapNode(
          'VENDAS',
          'BIA SDR · CRM',
          'sdr',
          const Alignment(.85, -.15),
          const Color(0xffd88a7c),
        ),
        mapNode(
          'PRODUTO',
          'Genesis',
          'genesis',
          const Alignment(-.85, -.15),
          const Color(0xffb29cdd),
        ),
        mapNode(
          'CLIENTES',
          'Em integração',
          null,
          const Alignment(-.7, .7),
          muted,
        ),
        mapNode(
          'INTELIGÊNCIA',
          'Em integração',
          null,
          const Alignment(.7, .7),
          muted,
        ),
        Align(
          alignment: Alignment.bottomCenter,
          child: TextButton(
            onPressed: () => go('systems'),
            child: const Text('Explorar todos os sistemas'),
          ),
        ),
      ],
    ),
  );
  Widget mapNode(
    String name,
    String desc,
    String? route,
    Alignment alignment,
    Color color,
  ) => Align(
    alignment: alignment,
    child: InkWell(
      onTap: route == null ? null : () => go(route),
      child: Padding(
        padding: const EdgeInsets.all(8),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              name,
              style: TextStyle(
                fontSize: 16,
                letterSpacing: 4,
                color: route == null ? muted : const Color(0xffe5e2d9),
                fontWeight: FontWeight.w300,
              ),
            ),
            const SizedBox(height: 10),
            Icon(
              route == null ? Icons.lock_outline : icon(route),
              color: color,
              size: 25,
            ),
            const SizedBox(height: 9),
            text(desc, size: 11, color: color),
          ],
        ),
      ),
    ),
  );
}

class ArkomMapPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size s) {
    final random = math.Random(7), p = Paint();
    for (var i = 0; i < 160; i++) {
      p.color = const Color(0xffd8d3c6)
          .withValues(alpha: .12 + random.nextDouble() * .25);
      canvas.drawCircle(
        Offset(random.nextDouble() * s.width, random.nextDouble() * s.height),
        random.nextDouble() * .8 + .2,
        p,
      );
    }
    final center = Offset(s.width / 2, s.height / 2);
    for (var i = 0; i < 6; i++) {
      final angle = i * math.pi / 3 - math.pi / 2;
      var from = center;
      for (var j = 1; j <= 5; j++) {
        final to =
            center +
            Offset(
              math.cos(angle) * s.width * .35 * j / 5,
              math.sin(angle) * s.height * .36 * j / 5,
            );
        p
          ..color = const Color(0xff776e59)
          ..strokeWidth = .65;
        canvas.drawLine(from, to, p);
        p.color = j == 5 ? gold : const Color(0xffcbc8bb);
        canvas.drawCircle(to, j == 5 ? 4 : 2.3, p);
        from = to;
      }
    }
    for (var i = 0; i < 7; i++) {
      p
        ..color = const Color(0xff7499a4).withValues(alpha: .16)
        ..style = PaintingStyle.stroke;
      canvas.drawOval(
        Rect.fromCenter(
          center: center,
          width: 45 + i * 11,
          height: 100 - i * 7,
        ),
        p,
      );
    }
    p.style = PaintingStyle.fill;
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class ArkomWordmark extends StatelessWidget {
  final bool compact;
  const ArkomWordmark({super.key, this.compact = false});
  @override
  Widget build(BuildContext context) => Semantics(
    label: 'Arkom',
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (!compact)
          const Text(
            'ARK',
            style: TextStyle(
              fontSize: 23,
              letterSpacing: 4,
              fontWeight: FontWeight.w300,
              color: Color(0xffefeee8),
            ),
          ),
        CustomPaint(
          size: Size(compact ? 25 : 21, 25),
          painter: _WordmarkSpiral(),
        ),
        if (!compact)
          const Text(
            'M',
            style: TextStyle(
              fontSize: 23,
              letterSpacing: 4,
              fontWeight: FontWeight.w300,
              color: Color(0xffefeee8),
            ),
          ),
      ],
    ),
  );
}

class _WordmarkSpiral extends CustomPainter {
  @override
  void paint(Canvas c, Size s) {
    c.translate(s.width / 2, s.height / 2);
    final radius = s.width * .43;
    final p = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.4
      ..color = gold;
    c.drawCircle(Offset.zero, radius, p);
    p.color = const Color(0xffefeee8);
    c.drawArc(
      Rect.fromCircle(center: Offset.zero, radius: radius * .69),
      -math.pi / 2,
      math.pi,
      false,
      p,
    );
    c.drawArc(
      Rect.fromCircle(center: Offset(0, -radius * .16), radius: radius * .49),
      math.pi / 2,
      -math.pi,
      false,
      p,
    );
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

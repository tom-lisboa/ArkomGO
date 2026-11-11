import 'dart:math' as math;

import 'package:material_ui/material_ui.dart';
import 'package:flutter/services.dart';

import 'studio_controller.dart';
import 'visuals.dart';
import 'solution_preview.dart';

void main() => runApp(const GenesisApp());

class GenesisApp extends StatelessWidget {
  final StudioController? controller;
  const GenesisApp({super.key, this.controller});
  @override
  Widget build(BuildContext context) => MaterialApp(
    debugShowCheckedModeBanner: false,
    title: 'Genesis · Arkom',
    theme: ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      scaffoldBackgroundColor: ink,
      colorScheme: ColorScheme.fromSeed(
        seedColor: gold,
        brightness: Brightness.dark,
        surface: panel,
      ),
      fontFamily: 'ArkomSans',
      textTheme: const TextTheme(
        bodyMedium: TextStyle(
          fontFamily: 'ArkomSans',
          color: Color(0xffe5e7eb),
          fontSize: 13,
        ),
      ),
      tooltipTheme: const TooltipThemeData(
        waitDuration: Duration(milliseconds: 400),
      ),
    ),
    home: Studio(controller: controller),
  );
}

class Studio extends StatefulWidget {
  final StudioController? controller;
  const Studio({super.key, this.controller});
  @override
  State<Studio> createState() => _StudioState();
}

class _StudioState extends State<Studio> with SingleTickerProviderStateMixin {
  late StudioController model;
  late AnimationController motion;
  final goal = TextEditingController();
  final feedScroll = ScrollController();
  int view = 0;
  bool follow = true;
  bool showSolution = true;
  int previewRevision = 0;
  Map<String, dynamic>? selectedEvent;
  int lastCount = 0;
  String lastBuild = "";
  @override
  void initState() {
    super.initState();
    model = widget.controller ?? StudioController();
    model.addListener(changed);
    motion = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 18),
    );
    if (widget.controller == null) model.attach();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MediaQuery.disableAnimationsOf(context)) {
      motion.stop();
    } else {
      motion.repeat();
    }
  }

  void changed() {
    if (!mounted) return;
    if (lastBuild != model.id) {
      lastBuild = model.id;
      showSolution = true;
      selectedEvent = null;
      view = 0;
    }
    setState(() {});
    if (follow && lastCount != model.traces.length) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (feedScroll.hasClients)
          feedScroll.animateTo(
            feedScroll.position.maxScrollExtent,
            duration: const Duration(milliseconds: 260),
            curve: Curves.easeOut,
          );
      });
    }
    lastCount = model.traces.length;
  }

  @override
  void dispose() {
    model.removeListener(changed);
    if (widget.controller == null) model.dispose();
    motion.dispose();
    goal.dispose();
    feedScroll.dispose();
    super.dispose();
  }

  String get status => switch (model.build?['status']) {
    'running' => 'Seu time está construindo',
    'ready' => 'Uma nova ideia ganhou forma',
    'failed' => 'Vamos retomar de onde parou',
    'cancelled' || 'interrupted' => 'Seu projeto está preservado',
    _ => 'Grandes ideias começam aqui',
  };
  Widget text(
    String s, {
    double size = 13,
    Color color = const Color(0xffe6e8ed),
    FontWeight weight = FontWeight.w400,
    double? spacing,
  }) => Text(
    s,
    style: TextStyle(
      fontFamily: 'ArkomSans',
      fontSize: size,
      color: color,
      fontWeight: weight,
      letterSpacing: spacing,
    ),
  );
  Widget tag(String s, {Color color = gold, IconData? icon}) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
    decoration: BoxDecoration(
      color: color.withValues(alpha: .07),
      border: Border.all(color: color.withValues(alpha: .18)),
      borderRadius: BorderRadius.circular(20),
    ),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (icon != null) ...[
          Icon(icon, size: 12, color: color),
          const SizedBox(width: 6),
        ],
        text(s, size: 10, color: color, weight: FontWeight.w500),
      ],
    ),
  );
  Widget box(
    Widget child, {
    EdgeInsets padding = const EdgeInsets.all(20),
    Color color = panel,
  }) => Container(
    padding: padding,
    decoration: BoxDecoration(
      color: color,
      border: Border.all(color: line),
      borderRadius: BorderRadius.circular(18),
    ),
    child: child,
  );
  Widget button(
    String s,
    IconData icon,
    VoidCallback? click, {
    bool primary = false,
  }) => primary
      ? FilledButton.icon(
          onPressed: click,
          icon: Icon(icon, size: 16),
          label: Text(s),
          style: FilledButton.styleFrom(
            backgroundColor: gold,
            foregroundColor: ink,
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 20),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(10),
            ),
            textStyle: const TextStyle(
              fontFamily: 'ArkomSans',
              fontSize: 12,
              fontWeight: FontWeight.w600,
            ),
          ),
        )
      : OutlinedButton.icon(
          onPressed: click,
          icon: Icon(icon, size: 15),
          label: Text(s),
          style: OutlinedButton.styleFrom(
            foregroundColor: const Color(0xffbdc3cf),
            side: const BorderSide(color: line),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 16),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(9),
            ),
            textStyle: const TextStyle(fontFamily: 'ArkomSans', fontSize: 11),
          ),
        );
  @override
  Widget build(BuildContext context) => Scaffold(
    body: LayoutBuilder(
      builder: (context, limits) {
        final compact = limits.maxWidth < 840;
        return SingleChildScrollView(
          child: Padding(
            padding: EdgeInsets.all(compact ? 16 : 28),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                topbar(compact),
                const SizedBox(height: 32),
                hero(compact),
                const SizedBox(height: 26),
                if (model.files.containsKey('frontend/index.html')) ...[
                  solution(compact),
                  const SizedBox(height: 24),
                ],
                if (model.error.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 16),
                    child: box(
                      Row(
                        children: [
                          const Icon(
                            Icons.error_outline,
                            color: Color(0xffef9c8d),
                            size: 18,
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: text(
                              model.error,
                              color: const Color(0xffefb9ae),
                            ),
                          ),
                        ],
                      ),
                      color: const Color(0xff24191a),
                    ),
                  ),
                if (compact) ...[
                  composer(),
                  const SizedBox(height: 18),
                  stage(),
                  const SizedBox(height: 18),
                  activity(380),
                ] else
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      SizedBox(width: 275, child: composer()),
                      const SizedBox(width: 18),
                      Expanded(
                        child: Column(
                          children: [
                            stage(),
                            const SizedBox(height: 18),
                            ecosystem(),
                          ],
                        ),
                      ),
                      const SizedBox(width: 18),
                      SizedBox(
                        width: math.min(300, limits.maxWidth * .25),
                        child: activity(558),
                      ),
                    ],
                  ),
                const SizedBox(height: 24),
                workbench(compact),
                const SizedBox(height: 20),
                footer(compact),
              ],
            ),
          ),
        );
      },
    ),
  );
  Widget solution(bool compact) => box(
    Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Wrap(
          spacing: 16,
          runSpacing: 12,
          alignment: WrapAlignment.spaceBetween,
          children: [
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                text('SUA SOLUÇÃO', size: 9, color: gold, spacing: 2),
                const SizedBox(height: 7),
                text(
                  'Veja e experimente o que você criou.',
                  size: compact ? 19 : 23,
                ),
                const SizedBox(height: 6),
                text(
                  model.running
                      ? 'Prévia em construção. Atualize para ver novos arquivos.'
                      : 'A interface está pronta para você experimentar.',
                  size: 11,
                  color: muted,
                ),
              ],
            ),
            Wrap(
              spacing: 8,
              children: [
                button(
                  showSolution ? 'Recolher prévia' : 'Abrir minha solução',
                  showSolution ? Icons.expand_less : Icons.play_arrow,
                  () => setState(() => showSolution = !showSolution),
                  primary: !showSolution,
                ),
                if (showSolution)
                  button(
                    'Atualizar prévia',
                    Icons.refresh,
                    () => setState(() => previewRevision++),
                  ),
              ],
            ),
          ],
        ),
        if (showSolution) ...[
          const SizedBox(height: 18),
          ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: SizedBox(
              height: compact ? 620 : 660,
              width: double.infinity,
              child: SolutionPreview(
                key: ValueKey(
                  '${model.id}-$previewRevision-${model.build?['status']}',
                ),
                files: Map.of(model.files),
              ),
            ),
          ),
          const SizedBox(height: 12),
          text(
            'Prévia interativa local. Serviços do backend e integrações externas ainda não estão conectados aqui.',
            size: 10,
            color: muted,
          ),
        ],
      ],
    ),
  );

  Widget topbar(bool compact) => Row(
    children: [
      Container(
        width: 34,
        height: 34,
        decoration: BoxDecoration(
          border: Border.all(color: gold.withValues(alpha: .5)),
          borderRadius: BorderRadius.circular(11),
        ),
        child: const Icon(Icons.auto_awesome, color: gold, size: 18),
      ),
      const SizedBox(width: 11),
      text('GENESIS', size: 14, spacing: 3, weight: FontWeight.w500),
      if (!compact) ...[
        const SizedBox(width: 16),
        Container(height: 18, width: 1, color: line),
        const SizedBox(width: 16),
        text('ESTÚDIO DE CRIAÇÃO', size: 9, color: muted, spacing: 2),
      ],
      const Spacer(),
      connectionTag(),
    ],
  );
  Widget connectionTag() {
    final label = switch (model.connection) {
      'live' => 'AO VIVO',
      'complete' => 'HISTÓRICO SINCRONIZADO',
      'reconnecting' => 'RECONECTANDO',
      'connecting' => 'CONECTANDO',
      'expired' => 'SESSÃO ENCERRADA',
      'unavailable' => 'INDISPONÍVEL',
      _ => 'PRONTO PARA CRIAR',
    };
    return tag(
      label,
      color: model.connection == 'live' ? const Color(0xff8ac6ac) : gold,
      icon: model.connection == 'live' ? Icons.sensors : Icons.circle_outlined,
    );
  }

  Widget hero(bool compact) => Row(
    crossAxisAlignment: CrossAxisAlignment.end,
    children: [
      Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            text(
              'SUA VISÃO. NOSSA INTELIGÊNCIA.',
              size: 9,
              color: gold,
              spacing: 2.6,
            ),
            const SizedBox(height: 12),
            Text.rich(
              TextSpan(
                children: [
                  const TextSpan(text: 'Imagine o próximo.\n'),
                  TextSpan(
                    text: 'Seu time constrói.',
                    style: TextStyle(fontFamily: 'ArkomSans', color: gold),
                  ),
                ],
              ),
              style: TextStyle(
                fontFamily: 'ArkomSans',
                fontSize: compact ? 32 : 42,
                fontWeight: FontWeight.w300,
                height: 1.14,
                letterSpacing: -1.7,
              ),
            ),
            const SizedBox(height: 12),
            text(
              'Uma conversa vira código. Cada passo, na sua frente.',
              color: muted,
              size: 12,
            ),
          ],
        ),
      ),
      if (!compact)
        Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            text(
              'ARKOM × deepH',
              size: 11,
              color: const Color(0xffbab3a3),
              spacing: 1.5,
            ),
            const SizedBox(height: 7),
            text(
              'Inteligência conectada ao seu ecossistema',
              size: 10,
              color: muted,
            ),
          ],
        ),
    ],
  );
  Widget composer() => box(
    Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            text('01', size: 10, color: gold),
            const SizedBox(width: 9),
            text('A ideia é sua.', size: 16, weight: FontWeight.w500),
          ],
        ),
        const SizedBox(height: 8),
        text(
          'Conte o que facilitaria seu dia.\nO time cuida da construção.',
          color: muted,
          size: 11,
        ),
        const SizedBox(height: 20),
        TextField(
          controller: goal,
          minLines: 5,
          maxLines: 8,
          maxLength: 4000,
          onChanged: (_) => setState(() {}),
          style: const TextStyle(
            fontFamily: 'ArkomSans',
            fontSize: 13,
            height: 1.7,
          ),
          decoration: InputDecoration(
            hintText: 'Ex.: preciso organizar lotes de leilão e acompanhar os interessados…',
            hintStyle: const TextStyle(
              fontFamily: 'ArkomSans',
              color: Color(0xff69717e),
              height: 1.7,
            ),
            counterText: '',
            filled: true,
            fillColor: ink,
            contentPadding: const EdgeInsets.all(14),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: line),
            ),
          ),
        ),
        const SizedBox(height: 12),
        Wrap(
          spacing: 6,
          runSpacing: 6,
          children: [
            suggestion(
              'Leilões',
              Icons.gavel,
              'Crie uma ferramenta para cadastrar lotes de leilão, filtrar por categoria e acompanhar interessados, aproveitando os contratos da Arkom.',
            ),
            suggestion(
              'Vendas',
              Icons.trending_up,
              'Crie uma ferramenta para acompanhar metas de vendas e oportunidades, com backend Go e contratos de integração ao CRM da Arkom.',
            ),
          ],
        ),
        const SizedBox(height: 22),
        SizedBox(
          width: double.infinity,
          child: button(
            model.busy ? 'Preparando…' : 'Construir minha ideia',
            Icons.north_east,
            model.canEdit &&
                    !model.anyRunning &&
                    !model.busy &&
                    goal.text.trim().length >= 15
                ? () => model.start(goal.text)
                : null,
            primary: true,
          ),
        ),
        if (model.id.isNotEmpty && !model.running) ...[
          const SizedBox(height: 8),
          SizedBox(
            width: double.infinity,
            child: button(
              'Melhorar este projeto',
              Icons.fork_right,
              model.canEdit &&
                      !model.anyRunning &&
                      !model.busy &&
                      goal.text.trim().length >= 15
                  ? () => model.start(goal.text, continueProject: true)
                  : null,
            ),
          ),
        ],
        const SizedBox(height: 18),
        const Divider(color: line),
        const SizedBox(height: 12),
        Row(
          children: [
            const Icon(Icons.shield_outlined, size: 14, color: muted),
            const SizedBox(width: 7),
            Expanded(
              child: text(
                'Seu ambiente. Suas decisões.',
                color: muted,
                size: 10,
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        text(
          'Código novo em um ambiente separado.\nSua operação continua como está.',
          color: const Color(0xff636c7b),
          size: 10,
        ),
      ],
    ),
  );
  Widget suggestion(String label, IconData icon, String value) => ActionChip(
    label: Text(
      label,
      style: const TextStyle(
        fontFamily: 'ArkomSans',
        fontSize: 10,
        color: muted,
      ),
    ),
    avatar: Icon(icon, size: 12, color: muted),
    onPressed: () {
      goal.text = value;
      setState(() {});
    },
    backgroundColor: Colors.transparent,
    side: const BorderSide(color: line),
    visualDensity: VisualDensity.compact,
  );
  Widget stage() {
    final done = agentIds
        .where(
          (a) => model.traces.any(
            (e) => e['agent'] == a && e['kind'] == 'agent.finished',
          ),
        )
        .length;
    return box(
      Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              text('02', size: 10, color: gold),
              const SizedBox(width: 9),
              text('Seu time, em ação.', size: 16, weight: FontWeight.w500),
              const Spacer(),
              text('$done / 4', size: 11, color: muted),
            ],
          ),
          const SizedBox(height: 7),
          text(status, color: muted, size: 10),
          const SizedBox(height: 12),
          AnimatedBuilder(
            animation: motion,
            builder: (context, _) => CustomPaint(
              painter: Constellation(motion.value, model.running),
              child: LayoutBuilder(
                builder: (context, c) {
                  final w = (c.maxWidth - 12) / 2;
                  return Wrap(
                    spacing: 12,
                    runSpacing: 12,
                    children: List.generate(
                      4,
                      (i) =>
                          SizedBox(width: w, child: agentCard(i, motion.value)),
                    ),
                  );
                },
              ),
            ),
          ),
          const SizedBox(height: 16),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: done / 4,
              minHeight: 3,
              color: gold,
              backgroundColor: line,
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              const Icon(Icons.hub_outlined, size: 13, color: gold),
              const SizedBox(width: 6),
              Expanded(
                child: text('Coordenados pelo deepH', size: 10, color: muted),
              ),
              tag('GO', color: const Color(0xff73c9d8)),
            ],
          ),
        ],
      ),
      padding: const EdgeInsets.all(18),
    );
  }

  Widget agentCard(int i, double phase) {
    final id = agentIds[i];
    final started = model.traces.any(
      (e) => e['agent'] == id && e['kind'] == 'agent.started',
    );
    final done = model.traces.any(
      (e) => e['agent'] == id && e['kind'] == 'agent.finished',
    );
    final active = model.running && started && !done;
    final color = agentColors[i];
    return AnimatedContainer(
      duration: const Duration(milliseconds: 350),
      padding: const EdgeInsets.symmetric(vertical: 9, horizontal: 8),
      decoration: BoxDecoration(
        gradient: RadialGradient(
          colors: [
            color.withValues(alpha: active ? .15 : .055),
            const Color(0xff11151b).withValues(alpha: .8),
          ],
          radius: .95,
        ),
        border: Border.all(
          color: active
              ? color.withValues(alpha: .6)
              : line.withValues(alpha: .8),
        ),
        borderRadius: BorderRadius.circular(13),
        boxShadow: active
            ? [BoxShadow(color: color.withValues(alpha: .06), blurRadius: 20)]
            : [],
      ),
      child: Column(
        children: [
          Row(
            children: [
              Container(
                width: 5,
                height: 5,
                decoration: BoxDecoration(
                  color: active
                      ? color
                      : done
                      ? const Color(0xff8ac6ac)
                      : const Color(0xff414955),
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: 5),
              Flexible(
                child: text(
                  active
                      ? 'TRABALHANDO'
                      : done
                      ? 'CONCLUÍDO'
                      : started
                      ? 'PAUSADO'
                      : 'DISPONÍVEL',
                  size: 7,
                  color: active ? color : muted,
                  spacing: .8,
                ),
              ),
            ],
          ),
          Transform.translate(
            offset: Offset(0, active ? math.sin(phase * math.pi * 8) * 3 : 0),
            child: Gopher(index: i, active: active, size: 88),
          ),
          text(agentNames[i], size: 13, weight: FontWeight.w600),
          const SizedBox(height: 3),
          text(agentJobs[i], size: 9, color: muted),
        ],
      ),
    );
  }

  Widget ecosystem() => box(
    Row(
      children: [
        const Icon(Icons.blur_on, size: 22, color: gold),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              text('Constrói com a Arkom.', size: 12, weight: FontWeight.w500),
              const SizedBox(height: 5),
              text(
                'Catálogo + contratos + contexto técnico',
                size: 9,
                color: muted,
              ),
            ],
          ),
        ),
        Tooltip(
          message: 'Referências consultadas pelos agentes. As conexões de produção são uma próxima etapa.',
          child: const Icon(Icons.info_outline, size: 15, color: muted),
        ),
      ],
    ),
    padding: const EdgeInsets.all(16),
  );
  Widget activity(double height) => box(
    SizedBox(
      height: height - 40,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              text('03', size: 10, color: gold),
              const SizedBox(width: 9),
              text('Acontecendo agora', size: 13, weight: FontWeight.w500),
              const Spacer(),
              const Icon(Icons.graphic_eq, color: gold, size: 16),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              text(
                '${model.traces.length} eventos reais',
                size: 9,
                color: muted,
              ),
              const Spacer(),
              Tooltip(
                message: follow
                    ? 'Pausar rolagem automática'
                    : 'Acompanhar últimos eventos',
                child: InkWell(
                  onTap: () => setState(() => follow = !follow),
                  child: text(
                    follow ? 'Seguindo ↓' : 'Acompanhar ↓',
                    size: 9,
                    color: gold,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          const Divider(height: 1, color: line),
          Expanded(
            child: model.traces.isEmpty
                ? Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(
                          Icons.radar,
                          size: 38,
                          color: Color(0xff4a4438),
                        ),
                        const SizedBox(height: 14),
                        text(
                          'Tudo começa com sua ideia.',
                          size: 11,
                          color: muted,
                        ),
                        const SizedBox(height: 7),
                        text(
                          'As ações do time aparecerão aqui.',
                          size: 9,
                          color: const Color(0xff626c7b),
                        ),
                      ],
                    ),
                  )
                : ListView.builder(
                    controller: feedScroll,
                    padding: const EdgeInsets.only(top: 10),
                    itemCount: model.traces.length,
                    itemBuilder: (context, index) =>
                        traceTile(model.traces[index]),
                  ),
          ),
          if (model.running)
            Padding(
              padding: const EdgeInsets.only(top: 10),
              child: Row(
                children: [
                  SizedBox(
                    width: 10,
                    height: 10,
                    child: CircularProgressIndicator(
                      strokeWidth: 1.5,
                      color: gold,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: text(
                      'Recebendo ações do time…',
                      size: 10,
                      color: gold,
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    ),
    padding: const EdgeInsets.all(20),
  );
  Widget traceTile(Map<String, dynamic> e) {
    final kind = e['kind'] as String;
    final color = kind.contains('failed')
        ? const Color(0xffef9c8d)
        : agentColor(e['agent']);
    final date = DateTime.tryParse(e['at'] ?? '')?.toLocal();
    final clock = date == null
        ? ''
        : '${date.hour.toString().padLeft(2, '0')}:${date.minute.toString().padLeft(2, '0')}:${date.second.toString().padLeft(2, '0')}';
    final icon = kind == 'file.written'
        ? Icons.code
        : kind == 'test.passed'
        ? Icons.check
        : kind == 'file.read'
        ? Icons.menu_book_outlined
        : kind.contains('failed')
        ? Icons.priority_high
        : Icons.bolt;
    return InkWell(
      onTap: () {
        setState(() {
          selectedEvent = e;
          if (kind == 'file.written') {
            view = 1;
            model.selectedFile = e['path'];
          } else if (kind.startsWith('test.')) {
            view = 2;
          } else {
            view = 3;
          }
        });
      },
      borderRadius: BorderRadius.circular(8),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 11),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 25,
              height: 25,
              decoration: BoxDecoration(
                color: color.withValues(alpha: .08),
                borderRadius: BorderRadius.circular(7),
                border: Border.all(color: color.withValues(alpha: .2)),
              ),
              child: Icon(icon, size: 13, color: color),
            ),
            const SizedBox(width: 9),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      text(
                        agentName(e['agent']),
                        size: 10,
                        color: color,
                        weight: FontWeight.w600,
                      ),
                      const Spacer(),
                      text(clock, size: 8, color: const Color(0xff67717d)),
                    ],
                  ),
                  const SizedBox(height: 5),
                  Text(
                    e['summary'] ?? '',
                    style: const TextStyle(
                      fontFamily: 'ArkomSans',
                      fontSize: 10,
                      height: 1.6,
                      color: Color(0xffadb4bf),
                    ),
                  ),
                  if (e['path'] != null) ...[
                    const SizedBox(height: 5),
                    Text(
                      e['path'],
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontFamily: 'ArkomMono',
                        fontSize: 8,
                        color: Color(0xff748291),
                      ),
                    ),
                  ],
                  if (kind == 'agent.update')
                    text(
                      'Resumo do agente',
                      size: 8,
                      color: const Color(0xff626c79),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget workbench(bool compact) {
    final entries = model.files.keys.toList()..sort();
    final tests = model.traces
        .where((e) => e['kind'] == 'test.passed' || e['kind'] == 'test.failed')
        .toList();
    return box(
      Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            alignment: WrapAlignment.spaceBetween,
            runSpacing: 12,
            spacing: 20,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  text('DO PLANO À ENTREGA', size: 8, color: gold, spacing: 2),
                  const SizedBox(height: 7),
                  text(
                    'Seu projeto, por dentro.',
                    size: 21,
                    weight: FontWeight.w400,
                  ),
                ],
              ),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  if (model.projects.isNotEmpty)
                    SizedBox(
                      width: compact ? 200 : 260,
                      child: DropdownButtonFormField<String>(
                        initialValue: model.id.isEmpty ? null : model.id,
                        key: ValueKey(model.id),
                        isExpanded: true,
                        decoration: const InputDecoration(
                          isDense: true,
                          border: OutlineInputBorder(
                            borderSide: BorderSide(color: line),
                          ),
                          contentPadding: EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 10,
                          ),
                        ),
                        style: const TextStyle(
                          fontFamily: 'ArkomSans',
                          fontSize: 10,
                        ),
                        items: model.projects
                            .map(
                              (p) => DropdownMenuItem<String>(
                                value: p['id'],
                                child: Text(
                                  p['goal'],
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                            )
                            .toList(),
                        onChanged: (value) {
                          if (value != null) {
                            selectedEvent = null;
                            model.select(value);
                          }
                        },
                      ),
                    ),
                  if (model.id.isNotEmpty)
                    button(
                      'Baixar código',
                      Icons.download_outlined,
                      () => model.action('export'),
                    ),
                  if (model.running)
                    button(
                      'Interromper',
                      Icons.stop_circle_outlined,
                      model.canEdit && !model.busy
                          ? () => model.action('cancel')
                          : null,
                    ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 20),
          Wrap(
            spacing: 6,
            children: [
              tab('Arquivos', Icons.folder_outlined, 0, '${entries.length}'),
              tab('Alterações', Icons.difference_outlined, 1, ''),
              tab('Testes', Icons.terminal, 2, '${tests.length}'),
              tab('Evento', Icons.receipt_long_outlined, 3, ''),
            ],
          ),
          const SizedBox(height: 12),
          Container(
            height: compact ? 350 : 330,
            decoration: BoxDecoration(
              color: const Color(0xff0b0e13),
              border: Border.all(color: line),
              borderRadius: BorderRadius.circular(12),
            ),
            clipBehavior: Clip.antiAlias,
            child: Row(
              children: [
                if (!compact && view < 2)
                  Container(
                    width: 190,
                    decoration: const BoxDecoration(
                      border: Border(right: BorderSide(color: line)),
                    ),
                    child: Material(
                      color: Colors.transparent,
                      child: ListView(
                        children: entries
                            .map(
                              (f) => ListTile(
                                dense: true,
                                selected: model.selectedFile == f,
                                selectedTileColor: gold.withValues(alpha: .06),
                                leading: Icon(
                                  f.endsWith('.go')
                                      ? Icons.data_object
                                      : Icons.description_outlined,
                                  size: 13,
                                  color: f.endsWith('.go')
                                      ? const Color(0xff73c9d8)
                                      : muted,
                                ),
                                title: Text(
                                  f,
                                  style: TextStyle(
                                    fontFamily: 'ArkomSans',
                                    fontSize: 9,
                                    color: model.selectedFile == f
                                        ? gold
                                        : muted,
                                  ),
                                ),
                                onTap: () => model.chooseFile(f),
                              ),
                            )
                            .toList(),
                      ),
                    ),
                  ),
                Expanded(
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.all(18),
                    child: content(tests, compact, entries),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          Wrap(
            spacing: 14,
            runSpacing: 8,
            children: [
              tag(
                'Backend Go',
                icon: Icons.code,
                color: const Color(0xff73c9d8),
              ),
              tag(
                'Ambiente isolado',
                icon: Icons.shield_outlined,
                color: muted,
              ),
              text(
                model.build?['status'] == 'ready'
                    ? 'Código validado. Integração e publicação são as próximas etapas.'
                    : 'Arquivos e histórico preservados na Arkom.',
                size: 10,
                color: muted,
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget tab(String label, IconData icon, int index, String count) =>
      TextButton.icon(
        onPressed: () => setState(() => view = index),
        icon: Icon(icon, size: 14),
        label: Text('$label${count.isNotEmpty ? '  $count' : ''}'),
        style: TextButton.styleFrom(
          foregroundColor: view == index ? gold : muted,
          backgroundColor: view == index
              ? gold.withValues(alpha: .08)
              : Colors.transparent,
          textStyle: const TextStyle(fontFamily: 'ArkomSans', fontSize: 11),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
        ),
      );
  Widget content(
    List<Map<String, dynamic>> tests,
    bool compact,
    List<String> entries,
  ) {
    if (view == 0)
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (compact && entries.isNotEmpty)
            DropdownButton<String>(
              value: model.selectedFile,
              isExpanded: true,
              items: entries
                  .map(
                    (f) => DropdownMenuItem(value: f, child: text(f, size: 10)),
                  )
                  .toList(),
              onChanged: (v) {
                if (v != null) model.chooseFile(v);
              },
            ),
          Row(
            children: [
              Expanded(
                child: text(
                  model.selectedFile.isEmpty
                      ? 'A construção vai ganhar forma aqui.'
                      : model.selectedFile,
                  size: 10,
                  color: gold,
                ),
              ),
              if (model.selectedFile.isNotEmpty)
                IconButton(
                  tooltip: 'Copiar código',
                  onPressed: () => Clipboard.setData(
                    ClipboardData(text: model.files[model.selectedFile] ?? ''),
                  ),
                  icon: const Icon(Icons.copy, size: 13, color: muted),
                ),
            ],
          ),
          const SizedBox(height: 10),
          SelectableText(
            model.files[model.selectedFile] ?? 'Os arquivos aparecem conforme o time os escreve.\nVocê não precisa entender código para criar.',
            style: const TextStyle(
              fontFamily: 'ArkomMono',
              fontSize: 11,
              height: 1.7,
              color: Color(0xffb6c6d6),
            ),
          ),
        ],
      );
    if (view == 1) {
      final writes = model.traces
          .where(
            (e) =>
                e['kind'] == 'file.written' && e['path'] == model.selectedFile,
          )
          .toList();
      final e = selectedEvent?['kind'] == 'file.written'
          ? selectedEvent
          : writes.lastOrNull;
      if (e == null)
        return text(
          'Clique em uma escrita no histórico para ver o antes e depois.',
          color: muted,
        );
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          text('${e['path']} · evento ${e['sequence']}', color: gold, size: 11),
          const SizedBox(height: 16),
          text('ANTES', size: 9, color: const Color(0xffd89b91)),
          const SizedBox(height: 8),
          code(e['before'] ?? 'Arquivo novo'),
          const SizedBox(height: 20),
          text('DEPOIS', size: 9, color: const Color(0xff8ac6ac)),
          const SizedBox(height: 8),
          code(e['after'] ?? ''),
        ],
      );
    }
    if (view == 2) {
      if (tests.isEmpty)
        return text(
          'Os resultados reais dos testes aparecerão aqui.',
          color: muted,
        );
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: tests.reversed
            .map(
              (e) => Padding(
                padding: const EdgeInsets.only(bottom: 20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    tag(
                      '${e['kind'] == 'test.passed' ? 'PASSOU' : 'PRECISA DE CORREÇÃO'} · ${agentName(e['agent'])}',
                      color: e['kind'] == 'test.passed'
                          ? const Color(0xff8ac6ac)
                          : const Color(0xffef9c8d),
                    ),
                    const SizedBox(height: 10),
                    code(e['output'] ?? ''),
                  ],
                ),
              ),
            )
            .toList(),
      );
    }
    final e = selectedEvent;
    if (e == null)
      return text('Selecione um evento na atividade do time.', color: muted);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        text('${agentName(e['agent'])} · ${e['kind']}', color: gold),
        const SizedBox(height: 15),
        text(e['summary'] ?? ''),
        const SizedBox(height: 12),
        text(e['at'] ?? '', size: 10, color: muted),
        if (e['output'] != null) code(e['output']),
      ],
    );
  }

  Widget code(String s) => SelectableText(
    s,
    style: const TextStyle(
      fontFamily: 'ArkomMono',
      fontSize: 10,
      height: 1.7,
      color: Color(0xffadbaca),
    ),
  );
  Widget footer(bool compact) => Wrap(
    alignment: WrapAlignment.spaceBetween,
    spacing: 20,
    runSpacing: 10,
    children: [
      text(
        'ARKOM  /  GENESIS     ·     Sua ideia encontra um time.',
        size: 9,
        color: const Color(0xff626b78),
        spacing: .5,
      ),
      TextButton(
        onPressed: () => model.call('qualification'),
        child: const Text(
          'Ajustes de qualificação SDR/CRM ↗',
          style: TextStyle(fontFamily: 'ArkomSans', fontSize: 10, color: muted),
        ),
      ),
    ],
  );
}

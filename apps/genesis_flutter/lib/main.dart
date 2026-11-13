import 'dart:async';
import 'dart:math' as math;

import 'package:material_ui/material_ui.dart';
import 'package:flutter/services.dart';

import 'code_workspace.dart';
import 'live_activity.dart';
import 'solution_preview.dart';
import 'studio_controller.dart';
import 'visuals.dart';

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
        waitDuration: Duration(milliseconds: 350),
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

class _StudioState extends State<Studio> {
  late final StudioController model;
  final activity = LiveActivity();
  final goal = TextEditingController();
  final inputFocus = FocusNode();
  Timer? previewDebounce, replayTimer;
  bool replaying = false;
  int replayStep = 0, replayTotal = 0;
  int mode = 0, previewRevision = 0, lastSequence = 0;
  bool mobilePreview = false,
      showChat = true,
      mobileChat = false,
      newIdea = false;
  String lastBuild = '', lastStatus = '', historyStep = '';
  List<Map<String, dynamic>> get historyTraces => model.traces
      .where((e) => historyStep.isEmpty || e['step_id'] == historyStep)
      .toList();
  String get historyTitle => historyStep.isEmpty
      ? 'Histórico de ações'
      : 'Traces · ${model.steps.where((s) => s['id'] == historyStep).firstOrNull?['title'] ?? historyStep}';
  Map<String, dynamic>? selectedEvent;
  List<Map<String, dynamic>> get tests => model.traces
      .where((e) => e['kind'] == 'test.passed' || e['kind'] == 'test.failed')
      .toList();
  List<Map<String, dynamic>> get frontendBuilds => model.traces
      .where(
        (e) =>
            e['kind'] == 'frontend.build.passed' ||
            e['kind'] == 'frontend.build.failed',
      )
      .toList();
  bool get hasPreview =>
      !newIdea && (model.files['frontend/index.html'] ?? '').trim().isNotEmpty;
  bool get canSend =>
      model.canEdit &&
      !model.busy &&
      !model.anyRunning &&
      goal.text.trim().length >= 15;

  @override
  void initState() {
    super.initState();
    model = widget.controller ?? StudioController();
    lastBuild = model.id;
    lastStatus = model.build?['status'] ?? '';
    lastSequence = model.build?['sequence'] ?? 0;
    activity.seed(model.id, model.traces);
    model.addListener(changed);
    if (widget.controller == null) model.attach();
  }

  void changed() {
    if (!mounted) return;
    if (replaying &&
        (model.lastDelivery == 'snapshot' ||
            model.lastDelivery == 'update' ||
            model.lastDelivery == 'session'))
      stopReplay();
    final switched = lastBuild != model.id;
    if (switched) {
      interfaceRevision = false;
      previewDebounce?.cancel();
      lastBuild = model.id;
      lastSequence = 0;
      selectedEvent = null;
      historyStep = '';
      mode = 0;
      newIdea = false;
    }
    activity.sync(
      model.id,
      model.traces,
      replay: model.lastDelivery == 'snapshot',
    );
    final frontendChanged = model.traces.any(
      (e) =>
          (e['sequence'] as int) > lastSequence &&
          e['kind'] == 'file.written' &&
          (e['path'] ?? '').startsWith('frontend/'),
    );
    lastSequence = model.build?['sequence'] ?? lastSequence;
    final status = model.build?['status'] ?? '';
    if (frontendChanged || status != lastStatus) {
      previewDebounce?.cancel();
      previewDebounce = Timer(
        status == 'running' ? const Duration(milliseconds: 900) : Duration.zero,
        () {
          if (mounted) setState(() => previewRevision++);
        },
      );
    }
    lastStatus = status;
    setState(() {});
  }

  @override
  void dispose() {
    previewDebounce?.cancel();
    replayTimer?.cancel();
    activity.dispose();
    model.removeListener(changed);
    if (widget.controller == null) model.dispose();
    goal.dispose();
    inputFocus.dispose();
    super.dispose();
  }

  bool interfaceRevision = false;

  Future<void> send() async {
    if (!canSend) return;
    final old = model.id;
    await model.start(
      goal.text.trim(),
      continueProject: !newIdea && model.id.isNotEmpty,
      revisionScope:
          !newIdea && model.build?['status'] == 'ready' && interfaceRevision
          ? 'interface'
          : '',
    );
    if (mounted && old != model.id) {
      setState(() {
        goal.clear();
        newIdea = false;
        mobileChat = false;
        mode = 0;
      });
    }
  }

  void startReplay() {
    if (model.running || model.traces.isEmpty) return;
    final events = model.traces
        .where(
          (e) =>
              agentIndex(e['agent']) >= 0 &&
              [
                'agent.started',
                'file.written',
                'test.passed',
                'test.failed',
                'frontend.build.passed',
                'frontend.build.failed',
                'design.validated',
                'design.rejected',
                'navigation.validated',
                'navigation.rejected',
                'navigation.built',
                'agent.finished',
              ].contains(e['kind']),
        )
        .toList();
    if (events.isEmpty) return;
    replayTimer?.cancel();
    activity.seed(model.id, []);
    setState(() {
      replaying = true;
      replayStep = 1;
      replayTotal = events.length;
      mode = 0;
      mobileChat = false;
    });
    activity.sync(model.id, [events.first]);
    replayTimer = Timer.periodic(const Duration(milliseconds: 2200), (timer) {
      if (!mounted) {
        timer.cancel();
        return;
      }
      if (replayStep >= events.length) {
        stopReplay();
        return;
      }
      activity.sync(model.id, [events[replayStep]]);
      setState(() => replayStep++);
    });
  }

  void stopReplay() {
    replayTimer?.cancel();
    activity.sync(model.id, model.traces, replay: true);
    if (mounted) setState(() => replaying = false);
  }

  Widget label(
    String value, {
    double size = 12,
    Color color = const Color(0xffe4e5e8),
    FontWeight weight = FontWeight.w400,
    int? lines,
    double? spacing,
  }) => Text(
    value,
    maxLines: lines,
    overflow: lines == null ? null : TextOverflow.ellipsis,
    style: TextStyle(
      fontSize: size,
      color: color,
      fontWeight: weight,
      height: 1.5,
      letterSpacing: spacing,
    ),
  );
  Widget iconAction(
    String tooltip,
    IconData icon,
    VoidCallback? action, {
    bool active = false,
  }) => IconButton(
    tooltip: tooltip,
    onPressed: action,
    isSelected: active,
    style: IconButton.styleFrom(
      foregroundColor: active ? gold : muted,
      backgroundColor: active
          ? gold.withValues(alpha: .10)
          : Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
    ),
    icon: Icon(icon, size: 18),
    constraints: const BoxConstraints(minWidth: 40, minHeight: 40),
  );

  @override
  Widget build(BuildContext context) => Scaffold(
    body: LayoutBuilder(
      builder: (context, c) {
        final narrow = c.maxWidth < 760;
        return Column(
          children: [
            header(narrow),
            if (model.error.isNotEmpty)
              Container(
                width: double.infinity,
                color: const Color(0xff30201e),
                padding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 9,
                ),
                child: label(
                  model.error,
                  color: const Color(0xfff0b0a0),
                  size: 11,
                  lines: 3,
                ),
              ),
            Expanded(
              child: Row(
                children: [
                  if (!narrow && showChat)
                    SizedBox(
                      width: c.maxWidth < 1050 ? 280 : 316,
                      child: conversation(),
                    ),
                  if (!narrow && showChat)
                    const VerticalDivider(width: 1, color: line),
                  Expanded(
                    child: Column(
                      children: [
                        toolbar(narrow),
                        Expanded(
                          child: IndexedStack(
                            index: narrow && mobileChat ? 1 : 0,
                            children: [workspace(), if (narrow) conversation()],
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],
        );
      },
    ),
  );

  Widget header(bool narrow) => Container(
    height: 62,
    padding: EdgeInsets.symmetric(horizontal: narrow ? 12 : 20),
    decoration: const BoxDecoration(
      color: Color(0xff111214),
      border: Border(bottom: BorderSide(color: line)),
    ),
    child: Row(
      children: [
        Container(
          width: 30,
          height: 30,
          decoration: BoxDecoration(
            border: Border.all(color: gold.withValues(alpha: .35)),
            borderRadius: BorderRadius.circular(9),
          ),
          child: const Icon(Icons.auto_awesome, size: 16, color: gold),
        ),
        const SizedBox(width: 10),
        label('GENESIS', size: 11, weight: FontWeight.w600, spacing: 2.1),
        const SizedBox(width: 18),
        const SizedBox(
          height: 18,
          child: VerticalDivider(width: 1, color: line),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: model.projects.isEmpty || newIdea
              ? label('Nova ideia', size: 12, color: muted)
              : DropdownButtonHideUnderline(
                  child: DropdownButton<String>(
                    key: ValueKey(model.id),
                    value: model.id.isEmpty ? null : model.id,
                    isExpanded: true,
                    icon: const Icon(
                      Icons.keyboard_arrow_down,
                      size: 16,
                      color: muted,
                    ),
                    dropdownColor: panel,
                    style: const TextStyle(
                      fontFamily: 'ArkomSans',
                      fontSize: 12,
                      color: Color(0xffe4e5e8),
                    ),
                    items: model.projects
                        .map(
                          (p) => DropdownMenuItem<String>(
                            value: p['id'],
                            child: Text(
                              p['goal'].toString().trim(),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        )
                        .toList(),
                    onChanged: (v) {
                      if (v != null) {
                        newIdea = false;
                        model.select(v);
                      }
                    },
                  ),
                ),
        ),
        const SizedBox(width: 8),
        iconAction('Nova solução', Icons.add, () {
          setState(() {
            newIdea = true;
            goal.clear();
            mobileChat = true;
            showChat = true;
          });
          inputFocus.requestFocus();
        }),
        if (!narrow) ...[
          const SizedBox(width: 12),
          Tooltip(
            message: connectionLabel,
            child: Row(
              children: [
                Container(
                  width: 6,
                  height: 6,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: model.connection == 'live' ? agentColors[3] : muted,
                  ),
                ),
                const SizedBox(width: 7),
                label(connectionLabel, size: 10, color: muted),
              ],
            ),
          ),
        ],
      ],
    ),
  );

  String get connectionLabel => switch (model.connection) {
    'live' => 'Ao vivo',
    'complete' => 'Salvo na Arkom',
    'reconnecting' => 'Reconectando',
    'connecting' => 'Conectando',
    'expired' => 'Sessão encerrada',
    'unavailable' => 'Indisponível',
    _ => 'Aguardando sessão',
  };

  Widget toolbar(bool narrow) => Container(
    height: 54,
    padding: const EdgeInsets.symmetric(horizontal: 10),
    decoration: const BoxDecoration(
      border: Border(bottom: BorderSide(color: line)),
    ),
    child: Row(
      children: [
        iconAction(
          narrow
              ? 'Conversar com o Genesis'
              : showChat
              ? 'Recolher conversa'
              : 'Mostrar conversa',
          Icons.chat_bubble_outline,
          () => setState(() {
            if (narrow) {
              mobileChat = !mobileChat;
            } else {
              showChat = !showChat;
            }
          }),
          active: narrow && mobileChat,
        ),
        const SizedBox(width: 6),
        Container(
          padding: const EdgeInsets.all(3),
          decoration: BoxDecoration(
            color: const Color(0xff181a1d),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Row(
            children: [
              modeButton('Solução', Icons.web_asset_outlined, 0, narrow),
              modeButton('Código', Icons.code, 1, narrow),
            ],
          ),
        ),
        const Spacer(),
        if (!narrow && mode == 0) ...[
          iconAction(
            'Visualizar em desktop',
            Icons.desktop_windows_outlined,
            () => setState(() => mobilePreview = false),
            active: !mobilePreview,
          ),
          iconAction(
            'Visualizar em celular',
            Icons.smartphone_outlined,
            () => setState(() => mobilePreview = true),
            active: mobilePreview,
          ),
          const SizedBox(width: 7),
          const SizedBox(
            height: 18,
            child: VerticalDivider(width: 1, color: line),
          ),
          const SizedBox(width: 7),
        ],
        if (mode == 0)
          iconAction(
            'Atualizar prévia',
            Icons.refresh,
            hasPreview ? () => setState(() => previewRevision++) : null,
          ),
        iconAction(
          'Histórico de ações',
          Icons.history,
          () => setState(() {
            historyStep = '';
            selectedEvent = null;
            mode = mode == 2 ? 0 : 2;
            mobileChat = false;
          }),
          active: mode == 2,
        ),
        PopupMenuButton<String>(
          tooltip: 'Mais opções',
          icon: const Icon(Icons.more_horiz, size: 19, color: muted),
          onSelected: (v) {
            if (v == 'runtime_start' || v == 'runtime_stop') model.action(v);
            if (v == 'replay') startReplay();
            if (v == 'export') model.action('export');
            if (v == 'qualification') model.call('qualification');
            if (v == 'cancel') model.action('cancel');
          },
          itemBuilder: (_) => [
            if (model.build?['contract_status'] == 'validated')
              PopupMenuItem(
                value: ['running', 'starting'].contains(model.runtimeStatus)
                    ? 'runtime_stop'
                    : 'runtime_start',
                enabled: model.canEdit && !model.busy,
                child: Text(
                  ['running', 'starting'].contains(model.runtimeStatus)
                      ? 'Encerrar backend da prévia'
                      : 'Iniciar backend da prévia',
                  style: const TextStyle(fontSize: 12),
                ),
              ),
            PopupMenuItem(
              value: 'replay',
              enabled: !model.running && model.traces.isNotEmpty,
              child: const Text(
                'Rever ações dos Gophers',
                style: TextStyle(fontSize: 12),
              ),
            ),
            PopupMenuItem(
              value: 'export',
              enabled: model.id.isNotEmpty,
              child: const Text(
                'Baixar código',
                style: TextStyle(fontSize: 12),
              ),
            ),
            if (model.running)
              PopupMenuItem(
                value: 'cancel',
                enabled: model.canEdit && !model.busy,
                child: const Text(
                  'Interromper construção',
                  style: TextStyle(fontSize: 12),
                ),
              ),
            const PopupMenuItem(
              value: 'qualification',
              child: Text(
                'Qualificação SDR/CRM',
                style: TextStyle(fontSize: 12),
              ),
            ),
          ],
        ),
      ],
    ),
  );

  Widget modeButton(String name, IconData icon, int index, bool narrow) =>
      Semantics(
        selected: mode == index && !mobileChat,
        child: Tooltip(
          message: name,
          child: TextButton(
            onPressed: () => setState(() {
              mode = index;
              mobileChat = false;
            }),
            style: TextButton.styleFrom(
              minimumSize: Size(narrow ? 40 : 94, 34),
              padding: EdgeInsets.symmetric(horizontal: narrow ? 10 : 13),
              foregroundColor: mode == index && !mobileChat ? gold : muted,
              backgroundColor: mode == index && !mobileChat
                  ? const Color(0xff30302c)
                  : Colors.transparent,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(7),
              ),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(icon, size: 17),
                if (!narrow) ...[
                  const SizedBox(width: 8),
                  Text(
                    name,
                    style: const TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      );

  Widget conversation() => Container(
    color: const Color(0xff111214),
    child: Column(
      children: [
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(22, 25, 22, 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                label(
                  'UM TIME PARA A SUA IDEIA',
                  size: 9,
                  color: gold,
                  spacing: 1.5,
                ),
                const SizedBox(height: 12),
                label(
                  newIdea || model.id.isEmpty
                      ? 'O que vamos\ncriar hoje?'
                      : 'Sua ideia,\nganhando forma.',
                  size: 27,
                  weight: FontWeight.w300,
                ),
                const SizedBox(height: 12),
                label(
                  newIdea || model.id.isEmpty
                      ? 'Conte o que você precisa. Primeiro planejamos; depois construímos uma etapa por vez.'
                      : 'Peça uma mudança aqui e acompanhe a solução ao lado.',
                  color: muted,
                  size: 12,
                ),
                if (!newIdea && model.build != null) ...[
                  const SizedBox(height: 24),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: gold.withValues(alpha: .06),
                      border: Border.all(color: gold.withValues(alpha: .14)),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        label('VOCÊ PEDIU', size: 8, color: gold, spacing: 1.4),
                        const SizedBox(height: 8),
                        label(
                          model.build!['goal'].toString().trim(),
                          size: 12,
                          lines: 5,
                        ),
                      ],
                    ),
                  ),
                ],
                if (!newIdea && model.steps.isNotEmpty) ...[
                  const SizedBox(height: 22),
                  constructionSteps(),
                ],
                const SizedBox(height: 26),
                Row(
                  children: [
                    label('Seu time', size: 12, weight: FontWeight.w500),
                    const Spacer(),
                    label('deepH', size: 10, color: muted),
                  ],
                ),
                const SizedBox(height: 14),
                teamRoster(),
                const SizedBox(height: 22),
                if (!newIdea && model.build != null) resultSummary(),
                const SizedBox(height: 20),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    border: Border.all(color: line),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.hub_outlined, size: 18, color: gold),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            label('Construído com a Arkom', size: 11),
                            label(
                              'Contexto, catálogo e ferramentas',
                              size: 10,
                              color: muted,
                            ),
                          ],
                        ),
                      ),
                      Tooltip(
                        message: 'O time consulta os contratos do ecossistema. As integrações operacionais ainda precisam ser conectadas.',
                        child: const Icon(
                          Icons.info_outline,
                          size: 13,
                          color: muted,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
        composer(),
      ],
    ),
  );

  Widget constructionSteps() => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      label('PASSO A PASSO', size: 9, color: gold, spacing: 1.4),
      const SizedBox(height: 5),
      label('Cada etapa acompanha os traces salvos.', size: 10, color: muted),
      const SizedBox(height: 10),
      for (final s in model.steps)
        Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: InkWell(
            key: ValueKey('step-${s['id']}'),
            onTap: (s['trace_count'] ?? 0) == 0
                ? null
                : () => setState(() {
                    historyStep = s['id'];
                    selectedEvent = null;
                    mode = 2;
                    mobileChat = false;
                  }),
            borderRadius: BorderRadius.circular(10),
            child: Container(
              padding: const EdgeInsets.all(11),
              decoration: BoxDecoration(
                border: Border.all(
                  color: s['status'] == 'running'
                      ? gold.withValues(alpha: .5)
                      : line,
                ),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(
                    ['completed', 'reused'].contains(s['status'])
                        ? Icons.check_circle_outline
                        : s['status'] == 'running'
                        ? Icons.play_circle_outline
                        : [
                            'failed',
                            'cancelled',
                            'interrupted',
                          ].contains(s['status'])
                        ? Icons.pause_circle_outline
                        : Icons.radio_button_unchecked,
                    size: 17,
                    color: ['completed', 'reused'].contains(s['status'])
                        ? agentColors[3]
                        : s['status'] == 'pending'
                        ? muted
                        : gold,
                  ),
                  const SizedBox(width: 9),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        label(s['title'], size: 11, weight: FontWeight.w500),
                        const SizedBox(height: 4),
                        label(s['acceptance'], size: 10, color: muted),
                        if (s['id'] == 'ux' &&
                            model.files.containsKey('design/navigation.json'))
                          TextButton(
                            key: const ValueKey('brief-navigation'),
                            onPressed: () {
                              model.chooseFile('design/navigation.json');
                              setState(() {
                                mode = 1;
                                mobileChat = false;
                              });
                            },
                            child: const Text('Ler mapa de telas'),
                          ),
                        if (['ux', 'designer'].contains(s['id']) &&
                            model.files.containsKey(
                              s['id'] == 'ux'
                                  ? 'design/ux.json'
                                  : 'design/ui.json',
                            ))
                          TextButton(
                            key: ValueKey('brief-${s['id']}'),
                            onPressed: () {
                              model.chooseFile(
                                s['id'] == 'ux'
                                    ? 'design/ux.json'
                                    : 'design/ui.json',
                              );
                              setState(() {
                                mode = 1;
                                mobileChat = false;
                              });
                            },
                            child: Text(
                              s['id'] == 'ux'
                                  ? 'Ler experiência'
                                  : 'Ler design visual',
                            ),
                          ),
                        const SizedBox(height: 4),
                        label(
                          {
                                'pending': 'Aguardando',
                                'running': 'Em execução',
                                'completed': 'Concluída',
                                'reused': 'Reaproveitada',
                                'failed': 'Precisa de correção',
                                'cancelled': 'Interrompida',
                                'interrupted': 'Aguardando retomada',
                              }[s['status']] ??
                              s['status'],
                          size: 9,
                          color: muted,
                        ),
                        if ((s['trace_count'] ?? 0) > 0) ...[
                          const SizedBox(height: 4),
                          label(
                            '${s['trace_count']} traces · #${s['first_sequence']}–#${s['last_sequence']}',
                            size: 9,
                            color: gold,
                          ),
                        ],
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      if (model.build?['next_step_id'] != '' && !model.running) ...[
        const SizedBox(height: 4),
        SizedBox(
          width: double.infinity,
          child: FilledButton.icon(
            onPressed: model.canAdvance ? model.advanceStep : null,
            icon: const Icon(Icons.play_arrow, size: 16),
            label: Text(
              model.build?['status'] == 'awaiting_step'
                  ? 'Iniciar próxima etapa'
                  : 'Retomar esta etapa',
              style: const TextStyle(fontSize: 11),
            ),
          ),
        ),
      ],
    ],
  );

  Widget teamRoster() {
    final indices = newIdea || model.build == null
        ? [0, 4, 5, 1, 2, 3]
        : model.steps.isEmpty
        ? [0, 1, 2, 3]
        : model.steps
              .map((s) => agentIndex(s['id']))
              .where((i) => i >= 0)
              .toList();
    final members = indices.map(teamMember).toList();
    if (indices.length <= 4)
      return Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: members,
      );
    return Wrap(spacing: 18, runSpacing: 14, children: members);
  }

  Widget teamMember(int i) {
    final latest = model.traces
        .where((e) => e['agent'] == agentIds[i])
        .lastOrNull;
    final started = model.traces.any(
      (e) => e['agent'] == agentIds[i] && e['kind'] == 'agent.started',
    );
    final step = model.steps.where((s) => s['id'] == agentIds[i]).firstOrNull;
    final done = step != null
        ? ['completed', 'reused'].contains(step['status'])
        : model.traces.any(
            (e) => e['agent'] == agentIds[i] && e['kind'] == 'agent.finished',
          );
    final active =
        !newIdea &&
        model.running &&
        (step != null ? step['status'] == 'running' : started && !done);
    return Tooltip(
      message:
          '${agentJobs[i]} · ${active ? (latest?['summary'] ?? 'Trabalhando') : (done && !newIdea ? 'Concluído' : 'Disponível')}',
      child: Column(
        children: [
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              color: active
                  ? agentColors[i].withValues(alpha: .09)
                  : const Color(0xff191b1e),
              shape: BoxShape.circle,
              border: Border.all(
                color: active ? agentColors[i].withValues(alpha: .65) : line,
              ),
            ),
            child: Gopher(index: i, size: 46, active: active),
          ),
          const SizedBox(height: 7),
          label(
            agentNames[i],
            size: 10,
            color: active ? agentColors[i] : muted,
          ),
          const SizedBox(height: 5),
          Container(
            width: 4,
            height: 4,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: active
                  ? agentColors[i]
                  : done && !newIdea
                  ? agentColors[3].withValues(alpha: .5)
                  : line,
            ),
          ),
        ],
      ),
    );
  }

  Widget resultSummary() {
    final state = model.build?['status'];
    final ready = state == 'ready';
    final failed = state == 'failed';
    final waiting = state == 'awaiting_step';
    final title = waiting
        ? 'Etapa concluída'
        : ready
        ? 'Pronta para experimentar'
        : model.running
        ? 'Seu time está construindo'
        : failed
        ? 'Vamos ajustar o que faltou'
        : 'Construção interrompida';
    final detail = waiting
        ? 'Revise os traces e inicie a próxima etapa quando estiver pronto.'
        : ready
        ? 'Use a prévia. A próxima melhoria começa com uma mensagem.'
        : model.running
        ? 'Os Gophers mostram as ações na área da solução. O histórico guarda cada passo.'
        : 'Seu código foi preservado. Você pode pedir uma nova versão.';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(
              ready
                  ? Icons.check_circle_outline
                  : model.running
                  ? Icons.auto_awesome
                  : Icons.info_outline,
              size: 17,
              color: ready ? agentColors[3] : gold,
            ),
            const SizedBox(width: 8),
            Expanded(child: label(title, size: 12, weight: FontWeight.w500)),
          ],
        ),
        const SizedBox(height: 9),
        label(detail, size: 11, color: muted),
        const SizedBox(height: 12),
        Wrap(
          spacing: 8,
          runSpacing: 6,
          children: [
            smallTag(
              '${model.files.length} arquivos',
              Icons.description_outlined,
            ),
            if (model.build?['frontend_framework'] == 'svelte')
              smallTag('Svelte', Icons.widgets_outlined),
            if (frontendBuilds.isNotEmpty)
              smallTag(
                '${frontendBuilds.where((e) => e['kind'] == 'frontend.build.passed').length}/${frontendBuilds.length} compilações Svelte',
                Icons.code,
              ),
            if (tests.isNotEmpty)
              smallTag(
                '${tests.where((e) => e['kind'] == 'test.passed').length}/${tests.length} testes',
                Icons.task_alt,
              ),
          ],
        ),
      ],
    );
  }

  Widget smallTag(String text, IconData icon) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      Icon(icon, size: 12, color: muted),
      const SizedBox(width: 5),
      label(text, size: 10, color: muted),
    ],
  );

  Widget composer() => Padding(
    padding: const EdgeInsets.fromLTRB(14, 8, 14, 14),
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (!newIdea &&
            model.build?['status'] == 'ready' &&
            model.steps.isNotEmpty)
          Material(
            color: Colors.transparent,
            child: CheckboxListTile(
              key: const ValueKey('interface-revision'),
              value: interfaceRevision,
              onChanged: model.busy
                  ? null
                  : (value) =>
                        setState(() => interfaceRevision = value ?? false),
              title: const Text(
                'Alterar somente a interface',
                style: TextStyle(fontSize: 12),
              ),
              subtitle: const Text(
                'Reaproveita plano, rotas e backend. Mantém a revisão final.',
                style: TextStyle(fontSize: 10),
              ),
              controlAffinity: ListTileControlAffinity.leading,
              contentPadding: EdgeInsets.zero,
            ),
          ),
        Container(
          padding: const EdgeInsets.fromLTRB(14, 4, 10, 9),
          decoration: BoxDecoration(
            color: const Color(0xff1b1d20),
            border: Border.all(
              color: inputFocus.hasFocus
                  ? gold.withValues(alpha: .5)
                  : const Color(0xff35373a),
            ),
            borderRadius: BorderRadius.circular(15),
          ),
          child: Column(
            children: [
              CallbackShortcuts(
                bindings: {
                  const SingleActivator(LogicalKeyboardKey.enter, meta: true):
                      send,
                  const SingleActivator(
                    LogicalKeyboardKey.enter,
                    control: true,
                  ): send,
                },
                child: TextField(
                  controller: goal,
                  focusNode: inputFocus,
                  minLines: 2,
                  maxLines: 4,
                  maxLength: 4000,
                  onChanged: (_) => setState(() {}),
                  style: const TextStyle(
                    fontFamily: 'ArkomSans',
                    fontSize: 12,
                    height: 1.6,
                  ),
                  decoration: InputDecoration(
                    hintText: newIdea || model.id.isEmpty
                        ? 'Descreva sua ideia…'
                        : 'O que você quer mudar?',
                    hintStyle: const TextStyle(color: muted, fontSize: 12),
                    counterText: '',
                    border: InputBorder.none,
                    enabledBorder: InputBorder.none,
                    focusedBorder: InputBorder.none,
                  ),
                ),
              ),
              Row(
                children: [
                  const Icon(Icons.auto_awesome, size: 13, color: gold),
                  const SizedBox(width: 6),
                  Expanded(
                    child: label(
                      model.busy
                          ? 'Preparando…'
                          : model.running
                          ? 'Time trabalhando'
                          : newIdea || model.id.isEmpty
                          ? 'Criar com o Genesis'
                          : 'Melhorar esta solução',
                      size: 10,
                      color: muted,
                    ),
                  ),
                  Tooltip(
                    message: newIdea || model.id.isEmpty
                        ? 'Planejar minha ideia'
                        : 'Enviar melhoria',
                    child: IconButton.filled(
                      onPressed: canSend ? send : null,
                      style: IconButton.styleFrom(
                        backgroundColor: gold,
                        foregroundColor: ink,
                        minimumSize: const Size(34, 34),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(9),
                        ),
                      ),
                      icon: const Icon(Icons.arrow_upward, size: 18),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 9),
        label(
          'Você descreve. Seu time constrói.',
          size: 9,
          color: const Color(0xff71757e),
        ),
      ],
    ),
  );

  Widget workspace() => Column(
    children: [
      if (replaying)
        Container(
          color: const Color(0xff28251d),
          padding: const EdgeInsets.fromLTRB(12, 2, 4, 2),
          child: Row(
            children: [
              const Icon(Icons.replay, size: 14, color: gold),
              const SizedBox(width: 8),
              Expanded(
                child: label(
                  'Reprodução das ações · prévia atual',
                  size: 10,
                  color: gold,
                  lines: 1,
                ),
              ),
              label('$replayStep/$replayTotal', size: 10, color: gold),
              iconAction('Encerrar reprodução', Icons.close, stopReplay),
            ],
          ),
        ),
      Expanded(
        child: IndexedStack(
          index: mode,
          children: [
            previewCanvas(),
            CodeWorkspace(model: model),
            history(),
          ],
        ),
      ),
      Container(
        height: 30,
        padding: const EdgeInsets.symmetric(horizontal: 14),
        decoration: const BoxDecoration(
          border: Border(top: BorderSide(color: line)),
        ),
        child: Row(
          children: [
            const Icon(Icons.lock_outline, size: 10, color: muted),
            const SizedBox(width: 6),
            Expanded(
              child: label(
                mode == 0
                    ? (model.runtimeStatus == 'running'
                          ? 'Backend Go conectado'
                          : model.runtimeStatus == 'starting'
                          ? 'Preparando backend Go…'
                          : 'Prévia local · integrações ainda não conectadas')
                    : 'Seu projeto e histórico ficam salvos na Arkom',
                size: 9,
                color: muted,
                lines: 1,
              ),
            ),
            if (mode == 0 && hasPreview)
              label('INTERATIVA', size: 8, color: agentColors[3], spacing: 1),
          ],
        ),
      ),
    ],
  );

  Widget previewCanvas() => LayoutBuilder(
    builder: (context, c) {
      final compact = c.maxWidth < 500;
      return Container(
        color: const Color(0xff0b0c0e),
        padding: EdgeInsets.all(compact ? 10 : 22),
        child: Center(
          child: AnimatedContainer(
            duration: MediaQuery.disableAnimationsOf(context)
                ? Duration.zero
                : const Duration(milliseconds: 300),
            width: mobilePreview ? math.min(390, c.maxWidth) : c.maxWidth,
            decoration: BoxDecoration(
              color: const Color(0xff101113),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: const Color(0xff303237)),
              boxShadow: const [
                BoxShadow(
                  color: Color(0x33000000),
                  blurRadius: 30,
                  offset: Offset(0, 8),
                ),
              ],
            ),
            clipBehavior: Clip.antiAlias,
            child: Stack(
              fit: StackFit.expand,
              children: [
                if (hasPreview)
                  SolutionPreview(
                    key: ValueKey('${model.id}-$previewRevision'),
                    files: Map.of(model.files),
                  )
                else
                  emptyCanvas(),
                if (!newIdea) ActivityOnCanvas(activity: activity),
              ],
            ),
          ),
        ),
      );
    },
  );

  Widget emptyCanvas() => Center(
    child: SingleChildScrollView(
      padding: const EdgeInsets.all(28),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: List.generate(
              4,
              (i) => Padding(
                padding: const EdgeInsets.symmetric(horizontal: 3),
                child: Gopher(index: i, size: 47),
              ),
            ),
          ),
          const SizedBox(height: 26),
          label(
            model.running && !newIdea
                ? 'Sua ideia está ganhando forma.'
                : 'Um espaço para a sua próxima ideia.',
            size: 22,
            weight: FontWeight.w300,
          ),
          const SizedBox(height: 12),
          ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 330),
            child: Text(
              model.running && !newIdea
                  ? 'A interface aparece aqui assim que o time criar os primeiros arquivos.'
                  : 'Comece com uma conversa. Acompanhe o time construir e experimente tudo por aqui.',
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 12, height: 1.7, color: muted),
            ),
          ),
          const SizedBox(height: 22),
          smallTag('GENESIS  /  ARKOM', Icons.auto_awesome),
        ],
      ),
    ),
  );

  Widget history() => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(22, 18, 22, 14),
        child: Row(
          children: [
            const Icon(Icons.history, size: 18, color: gold),
            const SizedBox(width: 10),
            Expanded(
              child: label(historyTitle, size: 15, weight: FontWeight.w500),
            ),
            if (historyStep.isNotEmpty)
              IconButton(
                tooltip: 'Ver todos os traces',
                onPressed: () => setState(() {
                  historyStep = '';
                  selectedEvent = null;
                }),
                icon: const Icon(
                  Icons.filter_alt_off_outlined,
                  size: 16,
                  color: muted,
                ),
              ),
            label('${historyTraces.length} eventos', color: muted, size: 10),
          ],
        ),
      ),
      const Divider(height: 1, color: line),
      Expanded(
        child: selectedEvent != null
            ? eventDetail()
            : historyTraces.isEmpty
            ? Center(
                child: label(
                  'As ações do time serão registradas aqui.',
                  color: muted,
                ),
              )
            : ListView.builder(
                padding: const EdgeInsets.symmetric(
                  horizontal: 22,
                  vertical: 12,
                ),
                itemCount: historyTraces.length,
                itemBuilder: (context, n) {
                  final e = historyTraces[historyTraces.length - 1 - n];
                  final i = agentIndex(e['agent']);
                  return InkWell(
                    onTap: () => setState(() => selectedEvent = e),
                    borderRadius: BorderRadius.circular(10),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          if (i >= 0)
                            Gopher(index: i, size: 38)
                          else
                            const SizedBox(
                              width: 38,
                              child: Icon(
                                Icons.auto_awesome,
                                color: gold,
                                size: 18,
                              ),
                            ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    label(
                                      agentName(e['agent']),
                                      size: 11,
                                      color: agentColor(e['agent']),
                                      weight: FontWeight.w500,
                                    ),
                                    const SizedBox(width: 10),
                                    label(
                                      '#${e['sequence']}',
                                      size: 9,
                                      color: muted,
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 4),
                                label(e['summary'] ?? '', size: 12),
                                if (e['path'] != null)
                                  Padding(
                                    padding: const EdgeInsets.only(top: 5),
                                    child: label(
                                      e['path'],
                                      size: 10,
                                      color: muted,
                                      lines: 1,
                                    ),
                                  ),
                              ],
                            ),
                          ),
                          const SizedBox(width: 10),
                          const Icon(
                            Icons.chevron_right,
                            size: 15,
                            color: muted,
                          ),
                        ],
                      ),
                    ),
                  );
                },
              ),
      ),
    ],
  );

  Widget eventDetail() {
    final e = selectedEvent!;
    return SingleChildScrollView(
      padding: const EdgeInsets.all(22),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          TextButton.icon(
            onPressed: () => setState(() => selectedEvent = null),
            icon: const Icon(Icons.arrow_back, size: 16),
            label: const Text('Voltar ao histórico'),
          ),
          const SizedBox(height: 20),
          label(
            '${agentName(e['agent'])} · ${e['kind']}',
            size: 12,
            color: agentColor(e['agent']),
          ),
          const SizedBox(height: 12),
          label(e['summary'] ?? '', size: 16),
          const SizedBox(height: 8),
          label(e['at'] ?? '', size: 10, color: muted),
          if (e['path'] != null)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 14),
              child: label(e['path'], color: gold),
            ),
          if (e['kind'] == 'file.written') ...[
            label('ANTES', size: 9, color: muted),
            const SizedBox(height: 8),
            code(e['before'] ?? 'Arquivo novo'),
            const SizedBox(height: 20),
            label('DEPOIS', size: 9, color: agentColors[3]),
            const SizedBox(height: 8),
            code(e['after'] ?? ''),
          ],
          if (e['output'] != null)
            Padding(
              padding: const EdgeInsets.only(top: 16),
              child: code(e['output']),
            ),
        ],
      ),
    );
  }

  Widget code(String value) => SelectableText(
    value,
    style: const TextStyle(
      fontFamily: 'ArkomMono',
      fontSize: 11,
      height: 1.8,
      color: Color(0xffb9c9d7),
    ),
  );
}

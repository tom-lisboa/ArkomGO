import 'dart:async';

import 'package:material_ui/material_ui.dart';

import 'platform.dart' show PlatformCall;
import 'visuals.dart';

abstract class WorkspaceState<T extends StatefulWidget> extends State<T> {
  String error = '', notice = '';
  bool busy = false, loading = true;
  int generation = 0;
  Future<void> run(Future<void> Function() action) async {
    if (busy) return;
    setState(() {
      busy = true;
      error = '';
      notice = '';
    });
    try {
      await action();
    } catch (e) {
      if (mounted)
        setState(() => error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Widget heading(String name, String description, {VoidCallback? refresh}) =>
      Padding(
        padding: const EdgeInsets.only(bottom: 22),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    name,
                    style: const TextStyle(
                      fontSize: 30,
                      fontWeight: FontWeight.w300,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    description,
                    style: const TextStyle(fontSize: 12, color: muted),
                  ),
                ],
              ),
            ),
            if (refresh != null)
              IconButton(
                onPressed: busy ? null : refresh,
                tooltip: 'Atualizar',
                icon: const Icon(Icons.refresh, size: 20),
              ),
          ],
        ),
      );
  Widget notices() => Column(
    children: [
      if (error.isNotEmpty)
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(14),
          margin: const EdgeInsets.only(bottom: 12),
          decoration: BoxDecoration(
            color: const Color(0xff2a1e1d),
            borderRadius: BorderRadius.circular(12),
          ),
          child: SelectableText(
            error,
            style: const TextStyle(color: Color(0xfff0b4a2), fontSize: 12),
          ),
        ),
      if (notice.isNotEmpty)
        Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: Text(
            notice,
            style: const TextStyle(color: gold, fontSize: 12),
          ),
        ),
    ],
  );
  Widget box(Widget child) => Container(
    padding: const EdgeInsets.all(18),
    decoration: BoxDecoration(
      color: panel,
      borderRadius: BorderRadius.circular(17),
      border: Border.all(color: line),
    ),
    child: Material(color: Colors.transparent, child: child),
  );
  @override
  void dispose() {
    generation++;
    super.dispose();
  }
}

class SDRWorkspace extends StatefulWidget {
  final PlatformCall api;
  final String role;
  const SDRWorkspace({super.key, required this.api, required this.role});
  @override
  State<SDRWorkspace> createState() => _SDRWorkspaceState();
}

class _SDRWorkspaceState extends WorkspaceState<SDRWorkspace> {
  List<dynamic> conversations = [], messages = [];
  Map<String, dynamic>? conversation;
  String selected = '';
  final message = TextEditingController();
  Timer? timer;
  bool reading = false;
  @override
  void initState() {
    super.initState();
    unawaited(load());
    timer = Timer.periodic(const Duration(seconds: 3), (_) => load());
  }

  Future<void> load() async {
    if (reading) return;
    reading = true;
    final epoch = ++generation;
    try {
      final list = await widget.api('/v1/sdr/conversations');
      final items = list['items'] as List;
      final id = selected.isNotEmpty
          ? selected
          : items.isEmpty
          ? ''
          : items.first['id'];
      dynamic history, fresh;
      if (id != '') {
        history = await widget.api('/v1/sdr/conversations/$id/messages');
        fresh = await widget.api('/v1/sdr/conversations/$id');
      }
      if (mounted && epoch == generation)
        setState(() {
          conversations = items;
          selected = id;
          conversation = fresh;
          messages = List.of(history?['items'] ?? [])
            ..sort(
              (a, b) => (a['sequence'] as num).compareTo(b['sequence'] as num),
            );
          loading = false;
        });
    } catch (e) {
      if (mounted && epoch == generation)
        setState(() {
          error = 'Não foi possível carregar as conversas. Tente atualizar.';
          loading = false;
        });
    } finally {
      reading = false;
    }
  }

  Future<void> action(String kind) => run(() async {
    await widget.api('/v1/sdr/conversations/$selected/actions', {
      'kind': kind,
      'reason': 'Solicitado pela equipe na plataforma Arkom',
      'expected_revision': conversation!['revision'],
    });
    await load();
  });
  @override
  void dispose() {
    timer?.cancel();
    message.dispose();
    super.dispose();
  }

  Widget thread(double width) => box(
    Column(
      children: [
        if (conversation != null)
          Row(
            children: [
              Expanded(child: Text(conversation!['label'] ?? 'Conversa')),
              PopupMenuButton<String>(
                enabled: widget.role != 'viewer' && !busy,
                onSelected: action,
                itemBuilder: (_) => const [
                  PopupMenuItem(
                    value: 'takeover',
                    child: Text('Assumir atendimento'),
                  ),
                  PopupMenuItem(value: 'pause', child: Text('Pausar Bia')),
                  PopupMenuItem(value: 'resume', child: Text('Retomar Bia')),
                ],
              ),
            ],
          ),
        const Divider(color: line),
        Expanded(
          child: loading
              ? const Center(child: CircularProgressIndicator(color: gold))
              : ListView(
                  children: messages
                      .map(
                        (m) => Align(
                          alignment: m['author'] == 'lead'
                              ? Alignment.centerLeft
                              : Alignment.centerRight,
                          child: Container(
                            constraints: BoxConstraints(maxWidth: width * .8),
                            margin: const EdgeInsets.only(bottom: 12),
                            padding: const EdgeInsets.all(14),
                            decoration: BoxDecoration(
                              color: m['author'] == 'lead'
                                  ? const Color(0xff252629)
                                  : const Color(0xff29261e),
                              borderRadius: BorderRadius.circular(14),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  m['author'] == 'lead'
                                      ? 'Contato'
                                      : m['author'] == 'assistant'
                                      ? 'Bia'
                                      : 'Equipe',
                                  style: const TextStyle(
                                    fontSize: 10,
                                    color: gold,
                                  ),
                                ),
                                const SizedBox(height: 6),
                                SelectableText(
                                  m['text'] ?? '',
                                  style: const TextStyle(
                                    fontSize: 13,
                                    height: 1.6,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      )
                      .toList(),
                ),
        ),
        if (conversation != null) ...[
          if (conversation!['channel'] != 'whatsapp')
            const Padding(
              padding: EdgeInsets.only(bottom: 8),
              child: Text(
                'Entrada de teste · conversa fictícia',
                style: TextStyle(fontSize: 10, color: muted),
              ),
            ),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: message,
                  maxLines: 2,
                  minLines: 1,
                  decoration: InputDecoration(
                    hintText: conversation!['channel'] == 'whatsapp'
                        ? 'Resposta da equipe'
                        : 'Escreva como um interessado…',
                  ),
                ),
              ),
              const SizedBox(width: 8),
              IconButton.filled(
                tooltip: 'Enviar mensagem',
                onPressed: busy || widget.role == 'viewer'
                    ? null
                    : () => run(() async {
                        if (message.text.trim().isEmpty) return;
                        final test = conversation!['channel'] != 'whatsapp';
                        await widget.api(
                          test
                              ? '/__test/ui/inbound'
                              : '/v1/sdr/conversations/$selected/messages',
                          test
                              ? {
                                  'provider_event_id':
                                      'flutter-${DateTime.now().microsecondsSinceEpoch}',
                                  'conversation_id': selected,
                                  'text': message.text.trim(),
                                }
                              : {
                                  'text': message.text.trim(),
                                  'expected_revision':
                                      conversation!['revision'],
                                },
                        );
                        message.clear();
                        await load();
                      }),
                icon: const Icon(Icons.arrow_upward),
              ),
            ],
          ),
        ],
      ],
    ),
  );
  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      heading(
        'BIA SDR',
        'Atendimento e equipe, trabalhando juntos.',
        refresh: load,
      ),
      notices(),
      Expanded(
        child: LayoutBuilder(
          builder: (context, c) {
            final list = box(
              Column(
                children: [
                  Row(
                    children: [
                      const Expanded(
                        child: Text(
                          'Conversas',
                          style: TextStyle(fontSize: 16),
                        ),
                      ),
                      IconButton(
                        tooltip: 'Nova conversa de teste',
                        onPressed: busy || widget.role == 'viewer'
                            ? null
                            : () => run(() async {
                                await widget.api('/__test/ui/conversations', {
                                  'label': 'Contato de teste',
                                });
                                await load();
                              }),
                        icon: const Icon(Icons.add, size: 19),
                      ),
                    ],
                  ),
                  Expanded(
                    child: ListView(
                      children: conversations
                          .map(
                            (v) => ListTile(
                              selected: selected == v['id'],
                              selectedTileColor: const Color(0xff28251e),
                              leading: const CircleAvatar(
                                backgroundColor: Color(0xff252628),
                                child: Icon(Icons.person_outline, color: gold),
                              ),
                              title: Text(
                                v['label'] ?? 'Contato',
                                style: const TextStyle(fontSize: 12),
                              ),
                              subtitle: Text(
                                v['channel'] == 'whatsapp'
                                    ? 'WhatsApp'
                                    : 'Conversa de teste',
                                style: const TextStyle(
                                  fontSize: 10,
                                  color: muted,
                                ),
                              ),
                              onTap: () {
                                setState(() {
                                  selected = v['id'];
                                  conversation = null;
                                  messages = [];
                                  generation++;
                                });
                                unawaited(load());
                              },
                            ),
                          )
                          .toList(),
                    ),
                  ),
                ],
              ),
            );
            return c.maxWidth < 650
                ? Column(
                    children: [
                      SizedBox(height: 160, child: list),
                      const SizedBox(height: 12),
                      Expanded(child: thread(c.maxWidth)),
                    ],
                  )
                : Row(
                    children: [
                      SizedBox(width: 250, child: list),
                      const SizedBox(width: 16),
                      Expanded(child: thread(c.maxWidth - 270)),
                    ],
                  );
          },
        ),
      ),
    ],
  );
}

class CRMWorkspace extends StatefulWidget {
  final PlatformCall api;
  final String role;
  const CRMWorkspace({super.key, required this.api, required this.role});
  @override
  State<CRMWorkspace> createState() => _CRMWorkspaceState();
}

class _CRMWorkspaceState extends WorkspaceState<CRMWorkspace> {
  List<dynamic> pipelines = [], cards = [], contacts = [];
  String pipeline = '', section = 'board';
  final search = TextEditingController();
  @override
  void initState() {
    super.initState();
    unawaited(load());
  }

  Future<void> load() async {
    final epoch = ++generation;
    try {
      final p = await widget.api('/v1/sdr/crm/pipelines.list', {});
      final list = p['data'] as List;
      final id = pipeline.isNotEmpty
          ? pipeline
          : list.isEmpty
          ? ''
          : list.first['id'];
      final result = id.isEmpty
          ? {'data': []}
          : await widget.api('/v1/sdr/crm/cards.list', {
              'pipeline_id': id,
              'status': '',
              'loss_reason': '',
              'page': 1,
            });
      final people = await widget.api('/v1/sdr/crm/contacts.list', {
        'query': search.text,
        'search_by': 'name',
        'page': 1,
      });
      if (mounted && epoch == generation)
        setState(() {
          pipelines = list;
          pipeline = id;
          cards = result['data'] ?? [];
          contacts = people['data'] ?? [];
          loading = false;
          error = '';
        });
    } catch (e) {
      if (mounted && epoch == generation)
        setState(() {
          loading = false;
          error = 'O CRM precisa estar conectado ao serviço Go e ao workspace de desenvolvimento. Atualize após iniciar os serviços.';
        });
    }
  }

  @override
  void dispose() {
    search.dispose();
    super.dispose();
  }

  Future<void> create(bool person) => run(() async {
    final stages =
        (pipelines
                    .where((p) => p['id'] == pipeline)
                    .firstOrNull?['stagesBreakdown'] ??
                [])
            as List;
    final result = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (_) => CRMEntryDialog(
        person: person,
        contacts: contacts,
        stages: stages,
        pipeline: pipeline,
      ),
    );
    if (result == null || !mounted) return;
    await widget.api(
      '/v1/sdr/crm/${person ? 'contacts.create' : 'cards.create'}',
      result,
    );
    if (mounted)
      setState(
        () => notice = person ? 'Contato cadastrado.' : 'Oportunidade criada.',
      );
    await load();
  });
  Widget opportunity(dynamic v, List stages) => Card(
    color: ink,
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            v['title'] ?? 'Oportunidade',
            style: const TextStyle(fontSize: 13),
          ),
          const SizedBox(height: 8),
          Text(
            'R\$ ${((v['value'] as num? ?? 0) / 100).toStringAsFixed(2).replaceAll('.', ',')}',
            style: const TextStyle(color: muted, fontSize: 11),
          ),
          if (widget.role != 'viewer')
            PopupMenuButton<String>(
              tooltip: 'Mover oportunidade',
              onSelected: (id) => run(() async {
                await widget.api('/v1/sdr/crm/cards.move', {
                  'pipeline_id': pipeline,
                  'card_id': v['id'],
                  'stage_id': id,
                });
                await load();
              }),
              itemBuilder: (_) => stages
                  .map<PopupMenuEntry<String>>(
                    (stage) => PopupMenuItem<String>(
                      value: stage['stageId'],
                      child: Text(stage['stageName']),
                    ),
                  )
                  .toList(),
              child: const Padding(
                padding: EdgeInsets.only(top: 12),
                child: Text(
                  'Mover →',
                  style: TextStyle(color: gold, fontSize: 11),
                ),
              ),
            ),
        ],
      ),
    ),
  );
  Widget board(List stages) {
    if (stages.isEmpty)
      return const Center(
        child: Text(
          'Os funis aparecerão aqui quando o CRM estiver conectado.',
          style: TextStyle(color: muted),
        ),
      );
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: stages.map<Widget>((stage) {
          final items = cards.where((v) => v['stageId'] == stage['stageId']);
          return Container(
            width: 260,
            margin: const EdgeInsets.only(right: 14),
            child: box(
              Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    '${stage['stageName']}  ·  ${items.length}',
                    style: const TextStyle(fontSize: 13, color: gold),
                  ),
                  const SizedBox(height: 18),
                  Expanded(
                    child: ListView(
                      children: items
                          .map<Widget>((v) => opportunity(v, stages))
                          .toList(),
                    ),
                  ),
                ],
              ),
            ),
          );
        }).toList(),
      ),
    );
  }

  Widget people() => ListView(
    children: contacts
        .map<Widget>(
          (p) => Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: box(
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.person_outline, color: gold),
                title: Text(p['name'] ?? 'Contato'),
                subtitle: Text(
                  p['email'] ?? p['telephone'] ?? '',
                  style: const TextStyle(fontSize: 11, color: muted),
                ),
              ),
            ),
          ),
        )
        .toList(),
  );
  @override
  Widget build(BuildContext context) {
    final selected = pipelines.where((p) => p['id'] == pipeline).firstOrNull;
    final stages = (selected?['stagesBreakdown'] ?? []) as List;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        heading(
          'CRM Arkom',
          'Cada relacionamento, acompanhado de perto.',
          refresh: load,
        ),
        notices(),
        Wrap(
          spacing: 12,
          children: [
            ChoiceChip(
              label: const Text('Oportunidades'),
              selected: section == 'board',
              onSelected: (_) => setState(() => section = 'board'),
            ),
            ChoiceChip(
              label: const Text('Contatos'),
              selected: section == 'contacts',
              onSelected: (_) => setState(() => section = 'contacts'),
            ),
          ],
        ),
        const SizedBox(height: 18),
        if (widget.role != 'viewer')
          Align(
            alignment: Alignment.centerRight,
            child: TextButton.icon(
              onPressed: busy || pipelines.isEmpty
                  ? null
                  : () => create(section == 'contacts'),
              icon: const Icon(Icons.add, size: 18),
              label: Text(
                section == 'contacts' ? 'Novo contato' : 'Nova oportunidade',
              ),
            ),
          ),
        if (section == 'board' && pipelines.isNotEmpty)
          DropdownButtonFormField<String>(
            initialValue: pipeline,
            decoration: const InputDecoration(labelText: 'Funil'),
            items: pipelines
                .map(
                  (p) => DropdownMenuItem(
                    value: p['id'] as String,
                    child: Text(p['name']),
                  ),
                )
                .toList(),
            onChanged: (v) {
              pipeline = v!;
              unawaited(load());
            },
          ),
        if (section == 'contacts')
          TextField(
            controller: search,
            onSubmitted: (_) => load(),
            decoration: InputDecoration(
              hintText: 'Buscar contato pelo nome',
              suffixIcon: IconButton(
                onPressed: load,
                icon: const Icon(Icons.search),
              ),
            ),
          ),
        const SizedBox(height: 18),
        Expanded(
          child: loading
              ? const Center(child: CircularProgressIndicator(color: gold))
              : section == 'contacts'
              ? people()
              : board(stages),
        ),
      ],
    );
  }
}

class BusinessWorkspace extends StatefulWidget {
  final PlatformCall api;
  const BusinessWorkspace({super.key, required this.api});
  @override
  State<BusinessWorkspace> createState() => _BusinessWorkspaceState();
}

class _BusinessWorkspaceState extends WorkspaceState<BusinessWorkspace> {
  Map<String, dynamic>? business;
  @override
  void initState() {
    super.initState();
    unawaited(load());
  }

  Future<void> load() async {
    try {
      final data = await widget.api('/v1/core/business');
      if (mounted)
        setState(() {
          business = Map<String, dynamic>.from(data);
          loading = false;
        });
    } catch (e) {
      if (mounted)
        setState(() {
          error = 'Não foi possível carregar o contexto da sua empresa.';
          loading = false;
        });
    }
  }

  @override
  Widget build(BuildContext context) {
    final published = business?['published']?['profile'];
    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          heading(
            'Minha empresa',
            'O contexto que conecta todas as suas soluções.',
            refresh: load,
          ),
          notices(),
          if (loading)
            const Center(child: CircularProgressIndicator(color: gold)),
          if (published != null)
            box(
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    published['name'] ?? '',
                    style: const TextStyle(
                      fontSize: 28,
                      fontWeight: FontWeight.w300,
                    ),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    published['description'] ?? '',
                    style: const TextStyle(height: 1.7, color: muted),
                  ),
                  const SizedBox(height: 20),
                  Text('Público: ${published['audience'] ?? ''}'),
                  const SizedBox(height: 12),
                  Text('Região: ${published['region'] ?? ''}'),
                  const SizedBox(height: 24),
                  const Text(
                    'Ofertas publicadas',
                    style: TextStyle(color: gold),
                  ),
                  ...((published['offers'] ?? []) as List).map(
                    (o) => ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(o['name']),
                      subtitle: Text(
                        o['conditions'] ?? '',
                        style: const TextStyle(fontSize: 12, color: muted),
                      ),
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class CRMEntryDialog extends StatefulWidget {
  final bool person;
  final List contacts, stages;
  final String pipeline;
  const CRMEntryDialog({
    super.key,
    required this.person,
    required this.contacts,
    required this.stages,
    required this.pipeline,
  });
  @override
  State<CRMEntryDialog> createState() => _CRMEntryDialogState();
}

class _CRMEntryDialogState extends State<CRMEntryDialog> {
  final title = TextEditingController(), email = TextEditingController();
  String? lead, stage;
  String error = '';
  @override
  void initState() {
    super.initState();
    lead = widget.contacts.firstOrNull?['id'];
    stage = widget.stages.firstOrNull?['stageId'];
  }

  @override
  void dispose() {
    title.dispose();
    email.dispose();
    super.dispose();
  }

  void save() {
    if (title.text.trim().isEmpty ||
        (!widget.person && (lead == null || stage == null))) {
      setState(() => error = 'Preencha os dados para continuar.');
      return;
    }
    Navigator.pop(
      context,
      widget.person
          ? {'name': title.text.trim(), 'email': email.text.trim()}
          : {
              'title': title.text.trim(),
              'lead_id': lead,
              'stage_id': stage,
              'pipeline_id': widget.pipeline,
            },
    );
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: Text(widget.person ? 'Novo contato' : 'Nova oportunidade'),
    content: SizedBox(
      width: 360,
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: title,
              decoration: InputDecoration(
                labelText: widget.person ? 'Nome' : 'Título',
              ),
            ),
            const SizedBox(height: 16),
            if (widget.person)
              TextField(
                controller: email,
                decoration: const InputDecoration(labelText: 'E-mail'),
              ),
            if (!widget.person) ...[
              DropdownButtonFormField<String>(
                initialValue: lead,
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'Contato'),
                items: widget.contacts
                    .map(
                      (v) => DropdownMenuItem<String>(
                        value: v['id'],
                        child: Text(
                          v['name'] ?? 'Contato',
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    )
                    .toList(),
                onChanged: (v) => setState(() => lead = v),
              ),
              const SizedBox(height: 16),
              DropdownButtonFormField<String>(
                initialValue: stage,
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'Etapa'),
                items: widget.stages
                    .map(
                      (v) => DropdownMenuItem<String>(
                        value: v['stageId'],
                        child: Text(
                          v['stageName'],
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    )
                    .toList(),
                onChanged: (v) => setState(() => stage = v),
              ),
            ],
            if (error.isNotEmpty)
              Text(
                error,
                style: const TextStyle(color: Color(0xfff0b4a2), fontSize: 12),
              ),
          ],
        ),
      ),
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.pop(context),
        child: const Text('Cancelar'),
      ),
      FilledButton(onPressed: save, child: const Text('Salvar')),
    ],
  );
}

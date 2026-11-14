part of 'clips_workspace.dart';

const _gifEndpoint = '/v1/sdr/genesis-demo/ecosystem/clips/gifs';

class _ClipsGIFs extends StatefulWidget {
  const _ClipsGIFs({
    required this.api,
    required this.canEdit,
    required this.wide,
    required this.panel,
    required this.copy,
    required this.heading,
  });

  final PlatformCall api;
  final bool canEdit, wide;
  final Widget Function(Widget child, {Color background}) panel;
  final Widget Function(String) copy;
  final Widget Function(String, double) heading;

  @override
  State<_ClipsGIFs> createState() => _ClipsGIFsState();
}

class _ClipsGIFsState extends State<_ClipsGIFs> {
  final _prompt = TextEditingController();
  Map<String, dynamic>? _pending;
  List<Map<String, dynamic>> _jobs = [];
  Timer? _timer;
  bool _loaded = false, _reading = false, _busy = false, _hasKey = false;
  int _credits = 0, _loadVersion = 0;
  String _error = '', _readError = '', _preview = '', _previewID = '';

  bool get _queueBusy =>
      _jobs.any((job) => ['queued', 'running'].contains(job['status']));

  @override
  void initState() {
    super.initState();
    unawaited(_load());
    _timer = Timer.periodic(const Duration(seconds: 3), (_) {
      if (_queueBusy || !_loaded || _readError.isNotEmpty) unawaited(_load());
    });
  }

  Future<void> _load({bool force = false}) async {
    if (_reading && !force) return;
    _reading = true;
    final version = ++_loadVersion;
    try {
      final data = await widget.api(_gifEndpoint);
      if (!mounted || version != _loadVersion) return;
      setState(() {
        _jobs = List<Map<String, dynamic>>.from(data['jobs'] as List? ?? []);
        _hasKey = data['has_key'] == true;
        _credits = (data['gift_remaining'] as num?)?.toInt() ?? 0;
        _loaded = true;
        _readError = '';
      });
    } catch (_) {
      if (mounted && version == _loadVersion) {
        setState(
          () => _readError =
              'Não foi possível consultar o estúdio. Tente atualizar.',
        );
      }
    } finally {
      if (version == _loadVersion) _reading = false;
    }
  }

  Future<Map<String, dynamic>> _call(
    String action,
    Map<String, dynamic> data,
  ) async => Map<String, dynamic>.from(
    jsonDecode(await transport.invoke('clips_gif_$action', jsonEncode(data)))
        as Map,
  );

  Future<void> _run(Future<void> Function() action) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = '';
    });
    try {
      await action();
    } catch (_) {
      if (mounted)
        setState(
          () => _error = 'Não foi possível concluir. Confira o histórico e tente novamente.',
        );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _release(String url) {
    if (url.isNotEmpty)
      unawaited(
        transport
            .invoke('clips_release', jsonEncode({'url': url}))
            .catchError((Object _) => '{}'),
      );
  }

  Future<void> _submit(bool gift) => _run(() async {
    if (_pending == null && _prompt.text.trim().isEmpty) {
      setState(() => _error = 'Descreva o GIF para continuar.');
      return;
    }
    _pending ??= {
      'prompt': _prompt.text.trim(),
      'gift': gift,
      'key': 'gif-${DateTime.now().microsecondsSinceEpoch}',
    };
    final result = await _call('submit', _pending!);
    if (!mounted) return;
    if (result['id'] != null) {
      _pending = null;
      _prompt.clear();
    } else if (result['uncertain'] == true) {
      setState(
        () => _error = 'O envio ainda não foi confirmado. Use Conferir pedido para recuperar a mesma solicitação.',
      );
    } else {
      _pending = null;
      setState(
        () => _error =
            const {
              'gif_already_pending': 'Aguarde o GIF que está em processamento.',
              'gif_credential_unavailable':
                  'Confira o crédito ou a chave da sua conta.',
              'gif_capacity':
                  'A fila está cheia. Tente novamente em instantes.',
              'invalid_gif_prompt':
                  'A descrição é muito longa ou tem um caractere inválido.',
              'gif_request_conflict':
                  'A solicitação já está associada a outro pedido.',
            }[result['code']] ??
            'O pedido não foi aceito. Confira a conexão e tente novamente.',
      );
    }
    await _load(force: true);
  });

  Future<void> _credential({bool remove = false}) async {
    String? key;
    if (!remove) {
      key = await showDialog<String>(
        context: context,
        builder: (context) => const _ClipsGIFKeyDialog(),
      );
      if (key == null || !mounted) return;
    } else {
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Remover chave?'),
          content: const Text(
            'Novos GIFs com sua chave ficarão indisponíveis até você cadastrar outra.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancelar'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Remover'),
            ),
          ],
        ),
      );
      if (confirmed != true || !mounted) return;
    }
    await _run(() async {
      await widget.api(
        remove ? '$_gifEndpoint/key/remove' : '$_gifEndpoint/key',
        remove ? {} : {'key': key},
      );
      await _load(force: true);
    });
  }

  Future<void> _show(Map<String, dynamic> job, {bool download = false}) =>
      _run(() async {
        final data = await _call('media', {
          'id': job['id'],
          'download': download,
        });
        if (download) return;
        final url = data['url'] as String;
        if (!mounted) {
          _release(url);
          return;
        }
        _release(_preview);
        setState(() {
          _preview = url;
          _previewID = job['id'] as String;
        });
      });

  @override
  void dispose() {
    _timer?.cancel();
    _release(_preview);
    _prompt.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final locked = !_loaded || _busy || _queueBusy || !widget.canEdit;
    final form = widget.panel(
      Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          widget.heading('Nova animação', 25),
          const SizedBox(height: 16),
          TextField(
            controller: _prompt,
            enabled: !locked && _pending == null,
            maxLines: 4,
            maxLength: 1500,
            decoration: const InputDecoration(
              labelText: 'Descreva seu GIF',
              alignLabelWithHint: true,
            ),
          ),
          widget.copy('GIF quadrado de 512 × 512, com 9 quadros.'),
          const SizedBox(height: 16),
          if (_pending != null)
            FilledButton(
              onPressed: _busy
                  ? null
                  : () => _submit(_pending!['gift'] == true),
              child: const Text('Conferir pedido'),
            )
          else
            Wrap(
              spacing: 10,
              runSpacing: 10,
              children: [
                if (_credits > 0)
                  FilledButton.icon(
                    onPressed: locked ? null : () => _submit(true),
                    icon: const Icon(Icons.auto_awesome_outlined, size: 17),
                    label: const Text('Gerar com brinde'),
                  ),
                if (_hasKey)
                  OutlinedButton(
                    onPressed: locked ? null : () => _submit(false),
                    child: const Text('Gerar com minha chave'),
                  ),
              ],
            ),
          if (_credits > 0) ...[
            const SizedBox(height: 10),
            widget.copy(
              _credits == 1
                  ? '1 crédito Arkom disponível.'
                  : '$_credits créditos Arkom disponíveis.',
            ),
          ],
          if (_loaded && _credits == 0 && !_hasKey && widget.canEdit)
            widget.copy('Cadastre sua chave OpenAI para começar.'),
          if (_queueBusy)
            widget.copy(
              'Seu GIF está na fila. Você pode acompanhar o status abaixo.',
            ),
        ],
      ),
    );
    final credentials = widget.panel(
      Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          widget.heading('Chave OpenAI', 25),
          const SizedBox(height: 12),
          widget.copy(
            _hasKey
                ? 'Sua chave está salva e protegida.'
                : 'Configure uma chave própria para gerar GIFs nesta conta.',
          ),
          if (widget.canEdit) ...[
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 6,
              children: [
                OutlinedButton(
                  onPressed: _loaded && !_busy && !_queueBusy
                      ? () => _credential()
                      : null,
                  child: Text(_hasKey ? 'Trocar chave' : 'Cadastrar chave'),
                ),
                if (_hasKey)
                  TextButton(
                    onPressed: _busy || _queueBusy
                        ? null
                        : () => _credential(remove: true),
                    child: const Text('Remover chave'),
                  ),
              ],
            ),
          ],
        ],
      ),
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (_readError.isNotEmpty) ...[
          widget.copy(_readError),
          const SizedBox(height: 8),
        ],
        if (_error.isNotEmpty) ...[
          widget.copy(_error),
          const SizedBox(height: 8),
        ],
        if (widget.wide)
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(flex: 3, child: form),
              const SizedBox(width: 16),
              Expanded(flex: 2, child: credentials),
            ],
          )
        else ...[
          form,
          const SizedBox(height: 14),
          credentials,
        ],
        const SizedBox(height: 24),
        Row(
          children: [
            Expanded(child: widget.heading('Meus GIFs', 27)),
            IconButton(
              onPressed: _load,
              tooltip: 'Atualizar GIFs',
              icon: const Icon(Icons.refresh),
            ),
          ],
        ),
        const SizedBox(height: 10),
        if (_loaded && _jobs.isEmpty)
          widget.copy('Suas animações aparecem aqui.'),
        for (final job in _jobs) ...[
          widget.panel(
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  job['prompt'] as String? ?? 'Animação',
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 6),
                widget.copy(
                  const {
                        'queued': 'Na fila',
                        'running': 'Gerando animação',
                        'done': 'Pronto',
                        'failed': 'A geração falhou. Confira a chave ou tente um novo pedido.',
                      }[job['status']] ??
                      'Aguardando',
                ),
                if (job['status'] == 'done')
                  Wrap(
                    spacing: 8,
                    runSpacing: 6,
                    children: [
                      TextButton(
                        onPressed: _busy ? null : () => _show(job),
                        child: const Text('Ver GIF'),
                      ),
                      TextButton(
                        onPressed: _busy
                            ? null
                            : () => _show(job, download: true),
                        child: const Text('Baixar GIF'),
                      ),
                    ],
                  ),
                if (_preview.isNotEmpty && _previewID == job['id'])
                  Align(
                    alignment: Alignment.centerLeft,
                    child: Image.network(
                      _preview,
                      width: 256,
                      height: 256,
                      fit: BoxFit.contain,
                      semanticLabel: 'Prévia do GIF',
                      errorBuilder: (_, _, _) =>
                          const Text('Não foi possível abrir a animação.'),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 10),
        ],
      ],
    );
  }
}

class _ClipsGIFKeyDialog extends StatefulWidget {
  const _ClipsGIFKeyDialog();

  @override
  State<_ClipsGIFKeyDialog> createState() => _ClipsGIFKeyDialogState();
}

class _ClipsGIFKeyDialogState extends State<_ClipsGIFKeyDialog> {
  final _key = TextEditingController();
  bool _valid = false;

  @override
  void dispose() {
    _key.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: const Text('Cadastrar chave para GIFs'),
    content: TextField(
      controller: _key,
      obscureText: true,
      autocorrect: false,
      enableSuggestions: false,
      decoration: const InputDecoration(labelText: 'Chave OpenAI'),
      onChanged: (value) => setState(() {
        final key = value.trim();
        _valid =
            key.startsWith('sk-') &&
            key.length >= 20 &&
            key.length <= 1024 &&
            !RegExp(r'\s').hasMatch(key);
      }),
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.pop(context),
        child: const Text('Cancelar'),
      ),
      FilledButton(
        onPressed: _valid
            ? () => Navigator.pop(context, _key.text.trim())
            : null,
        child: const Text('Salvar chave'),
      ),
    ],
  );
}

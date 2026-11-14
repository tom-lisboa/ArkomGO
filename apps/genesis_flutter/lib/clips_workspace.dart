import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;

import 'package:material_ui/material_ui.dart';

import 'clips_player.dart';
import 'platform.dart' show PlatformCall;
import 'transport.dart' as transport;
import 'visuals.dart' show Gopher;

part 'clips_gifs.dart';

const _endpoint = '/v1/sdr/genesis-demo/ecosystem/clips/jobs';
const _paper = Color(0xfff9f5ed);
const _sheet = Color(0xfffffdf8);
const _ink = Color(0xff242722);
const _muted = Color(0xff625b50);
const _line = Color(0xffd9cfbf);
const _copper = Color(0xff785438);
const _green = Color(0xff293b31);

class ClipsWorkspace extends StatefulWidget {
  final PlatformCall api;
  final String role;
  final VoidCallback onBack;

  const ClipsWorkspace({
    super.key,
    required this.api,
    required this.role,
    required this.onBack,
  });

  @override
  State<ClipsWorkspace> createState() => _ClipsWorkspaceState();
}

class _ClipsWorkspaceState extends State<ClipsWorkspace> {
  final _title = TextEditingController();
  final _start = TextEditingController(text: '0');
  final _end = TextEditingController();
  final _scroll = ScrollController();
  final _previewAnchor = GlobalKey();
  List<Map<String, dynamic>> _projects = [];
  bool _editor = false, _loading = true, _reading = false, _busy = false;
  bool _refreshAgain = false;
  bool _gifs = false;
  String _error = '',
      _listError = '',
      _notice = '',
      _file = '',
      _source = '',
      _preview = '';
  String? _selected;
  double _length = 0;
  Map<String, dynamic>? _pending;
  Timer? _timer;

  bool get _canEdit => widget.role != 'viewer';
  Map<String, dynamic>? get _project =>
      _projects.where((project) => project['id'] == _selected).firstOrNull;
  bool _processing(Map<String, dynamic> project) =>
      const ['queued', 'running'].contains(project['status']);

  Future<Map<String, dynamic>> _media(
    String action, [
    Map<String, dynamic> data = const {},
  ]) async {
    final result = await transport.invoke('clips_$action', jsonEncode(data));
    return Map<String, dynamic>.from(jsonDecode(result) as Map);
  }

  @override
  void initState() {
    super.initState();
    unawaited(_load());
    _timer = Timer.periodic(const Duration(seconds: 3), (_) {
      if (_projects.any(_processing) || _listError.isNotEmpty)
        unawaited(_load());
    });
  }

  Future<void> _load() async {
    if (_reading) {
      _refreshAgain = true;
      return;
    }
    _reading = true;
    try {
      final result = await widget.api(_endpoint);
      if (!mounted) return;
      setState(() {
        _projects = List<Map<String, dynamic>>.from(result['jobs']);
        _listError = '';
        _loading = false;
      });
    } catch (_) {
      if (mounted)
        setState(() {
          _loading = false;
          _listError =
              'Não foi possível atualizar seus vídeos. Tente novamente.';
        });
    } finally {
      _reading = false;
      if (_refreshAgain && mounted) {
        _refreshAgain = false;
        unawaited(_load());
      }
    }
  }

  Future<void> _run(Future<void> Function() action) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = '';
    });
    try {
      await action();
    } catch (error) {
      if (mounted)
        setState(
          () => _error = error.toString().replaceFirst('Exception: ', ''),
        );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _release(String url) {
    if (url.isNotEmpty)
      unawaited(
        _media('release', {
          'url': url,
        }).catchError((Object _) => <String, dynamic>{}),
      );
  }

  String _seconds(double value) =>
      value.toStringAsFixed(2).replaceFirst(RegExp(r'\.?0+$'), '');

  Future<void> _pick() => _run(() async {
    final picked = await _media('pick');
    final name = picked['name'] as String?;
    if (name == null) return;
    if (!mounted) {
      _release(picked['url'] as String);
      return;
    }
    _release(_source);
    setState(() {
      _file = name;
      _source = picked['url'] as String;
      _length = (picked['duration'] as num).toDouble();
      _title.text = name.replaceFirst(RegExp(r'\.[^.]+$'), '');
      _start.text = '0';
      _end.text = _seconds(math.min(30, (_length * 100).floor() / 100));
    });
  });

  Future<void> _submit() => _run(() async {
    if (_pending == null) {
      final start = double.tryParse(_start.text.replaceAll(',', '.'));
      final end = double.tryParse(_end.text.replaceAll(',', '.'));
      if (_title.text.trim().isEmpty)
        throw Exception('Dê um nome ao seu vídeo.');
      if (start == null ||
          end == null ||
          !start.isFinite ||
          !end.isFinite ||
          start < 0 ||
          start > 3600 ||
          end > _length + .001 ||
          end - start < 1 - 1e-9 ||
          end - start > 30 + 1e-9) {
        throw Exception(
          'Escolha entre 1 e 30 segundos dentro da duração do vídeo.',
        );
      }
      _pending = {
        'key': 'clips-${DateTime.now().microsecondsSinceEpoch}',
        'title': _title.text.trim(),
        'start': start,
        'duration': (end - start).clamp(1.0, 30.0),
      };
    }
    final result = await _media('upload', _pending!);
    if (!mounted) return;
    if (result['id'] == null) {
      if (result['uncertain'] != true) _pending = null;
      throw Exception(result['message'] ?? 'Não foi possível enviar o vídeo.');
    }
    _release(_source);
    setState(() {
      _pending = null;
      _source = '';
      _file = '';
      _editor = false;
      _selected = result['id'] as String;
      _notice = 'Vídeo recebido. Você pode acompanhar o processamento aqui.';
    });
    await _load();
  });

  Future<void> _showPreview(Map<String, dynamic> project) => _run(() async {
    final result = await _media('preview', {'id': project['id']});
    final url = result['url'] as String;
    if (!mounted) {
      _release(url);
      return;
    }
    _release(_preview);
    setState(() {
      _selected = project['id'];
      _preview = url;
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final target = _previewAnchor.currentContext;
      if (mounted && target != null) {
        unawaited(
          Scrollable.ensureVisible(
            target,
            duration: const Duration(milliseconds: 260),
          ),
        );
      }
    });
  });

  Future<void> _delete(Map<String, dynamic> project) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Excluir vídeo?'),
        content: Text(
          'O projeto “${project['title']}” e o corte serão removidos.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Excluir vídeo'),
          ),
        ],
      ),
    );
    if (!mounted || confirmed != true) return;
    await _run(() async {
      await widget.api('$_endpoint/${project['id']}/delete', {});
      if (!mounted) return;
      if (_selected == project['id']) {
        _release(_preview);
        _preview = '';
        _selected = null;
      }
      setState(() {
        _projects.removeWhere((item) => item['id'] == project['id']);
        _notice = 'Vídeo excluído.';
      });
      await _load();
    });
  }

  void _go(bool editor) {
    if (!_gifs && _editor == editor) return;
    if (_source.isNotEmpty && !editor) {
      unawaited(
        _media('pause', {
          'url': _source,
        }).catchError((Object _) => <String, dynamic>{}),
      );
    }
    _release(_preview);
    setState(() {
      _editor = editor;
      _gifs = false;
      _selected = null;
      _preview = '';
      _error = '';
      _notice = '';
    });
    if (_scroll.hasClients) _scroll.jumpTo(0);
  }

  void _openGIFs() {
    if (_gifs) return;
    _release(_preview);
    if (_source.isNotEmpty) {
      unawaited(
        _media('pause', {
          'url': _source,
        }).catchError((Object _) => <String, dynamic>{}),
      );
    }
    setState(() {
      _gifs = true;
      _editor = false;
      _preview = '';
      _error = '';
      _notice = '';
    });
    if (_scroll.hasClients) _scroll.jumpTo(0);
  }

  @override
  void dispose() {
    _timer?.cancel();
    _release(_source);
    _release(_preview);
    _title.dispose();
    _start.dispose();
    _end.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Text _label(String value) => Text(
    value,
    style: const TextStyle(
      color: _copper,
      fontSize: 10,
      fontWeight: FontWeight.w700,
      letterSpacing: 2,
    ),
  );

  Text _heading(String value, double size) => Text(
    value,
    style: TextStyle(
      fontFamily: 'ArkomEditorial',
      fontSize: size,
      height: 1.08,
      letterSpacing: -.8,
      color: _ink,
    ),
  );

  Text _copy(String value) => Text(
    value,
    style: const TextStyle(color: _muted, fontSize: 14, height: 1.55),
  );

  Widget _panel(Widget child, {Color background = _sheet}) => Container(
    padding: const EdgeInsets.all(20),
    decoration: BoxDecoration(
      color: background,
      border: Border.all(color: _line),
      borderRadius: BorderRadius.circular(13),
    ),
    child: child,
  );

  Widget _message(String value, {bool error = false}) => _panel(
    Row(
      children: [
        Icon(
          error ? Icons.info_outline : Icons.check_circle_outline,
          size: 18,
          color: error ? _copper : _green,
        ),
        const SizedBox(width: 10),
        Expanded(child: _copy(value)),
      ],
    ),
    background: error ? const Color(0xfff2e8d8) : const Color(0xffebeee3),
  );

  Widget _navigation() => Wrap(
    runSpacing: 8,
    spacing: 8,
    crossAxisAlignment: WrapCrossAlignment.center,
    children: [
      _navButton(
        'Meus vídeos',
        Icons.video_library_outlined,
        !_editor && !_gifs,
        () => _go(false),
      ),
      _navButton(
        'Novo vídeo',
        Icons.add,
        _editor,
        _canEdit ? () => _go(true) : null,
      ),
      _navButton('Gerar GIFs', Icons.gif_box_outlined, _gifs, _openGIFs),
    ],
  );

  Widget _navButton(
    String label,
    IconData icon,
    bool selected,
    VoidCallback? action,
  ) => TextButton.icon(
    onPressed: _busy ? null : action,
    style: selected
        ? TextButton.styleFrom(
            backgroundColor: _green,
            foregroundColor: Colors.white,
          )
        : null,
    icon: Icon(icon, size: 17),
    label: Text(label),
  );

  @override
  Widget build(BuildContext context) {
    final light = ThemeData(
      colorScheme: const ColorScheme.light(
        primary: _green,
        surface: _paper,
        onSurface: _ink,
        outline: _line,
      ),
      fontFamily: 'ArkomSans',
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          padding: const EdgeInsets.symmetric(horizontal: 17, vertical: 15),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          side: const BorderSide(color: _line),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: _paper,
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: const BorderSide(color: _line),
        ),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
      ),
    );
    return Theme(
      data: light,
      child: LayoutBuilder(
        builder: (context, bounds) {
          final wide = bounds.maxWidth >= 730;
          return SingleChildScrollView(
            controller: _scroll,
            child: Material(
              color: _paper,
              borderRadius: BorderRadius.circular(19),
              clipBehavior: Clip.antiAlias,
              child: Padding(
                padding: EdgeInsets.all(wide ? 34 : 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Align(
                      alignment: Alignment.centerLeft,
                      child: TextButton.icon(
                        onPressed: widget.onBack,
                        icon: const Icon(Icons.arrow_back, size: 16),
                        label: const Text('Voltar ao time'),
                      ),
                    ),
                    const SizedBox(height: 13),
                    Row(
                      children: [
                        const ExcludeSemantics(
                          child: Gopher(index: 2, size: 47),
                        ),
                        const SizedBox(width: 10),
                        const Expanded(
                          child: Text(
                            'Luma',
                            style: TextStyle(
                              fontSize: 26,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),
                    _navigation(),
                    const Divider(color: _line, height: 28),
                    const SizedBox(height: 10),
                    _label(
                      _gifs
                          ? 'ESTÚDIO DE ANIMAÇÃO'
                          : _editor
                          ? 'ESTÚDIO DE CORTE'
                          : 'BIBLIOTECA DE VÍDEOS',
                    ),
                    const SizedBox(height: 12),
                    _heading(
                      _gifs
                          ? 'Gerar GIFs'
                          : _editor
                          ? 'Escolha o seu trecho.'
                          : 'Meus vídeos',
                      wide ? 49 : 34,
                    ),
                    const SizedBox(height: 12),
                    _copy(
                      _gifs
                          ? 'Descreva a cena e o movimento. Acompanhe o pedido e baixe a animação quando estiver pronta.'
                          : _editor
                          ? 'Envie um MP4 ou M4V de até 7 MB e escolha de 1 a 30 segundos para o corte vertical.'
                          : 'Crie cortes verticais e acompanhe seus projetos no espaço da sua empresa.',
                    ),
                    if (_error.isNotEmpty) ...[
                      const SizedBox(height: 16),
                      _message(_error, error: true),
                    ],
                    if (_notice.isNotEmpty) ...[
                      const SizedBox(height: 16),
                      _message(_notice),
                    ],
                    const SizedBox(height: 22),
                    if (_gifs)
                      _ClipsGIFs(
                        api: widget.api,
                        canEdit: _canEdit,
                        wide: wide,
                        panel: _panel,
                        copy: _copy,
                        heading: _heading,
                      )
                    else if (_editor)
                      _buildEditor(wide)
                    else
                      _buildLibrary(wide),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildEditor(bool wide) {
    final locked = _busy || _pending != null;
    final source = _panel(
      Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _heading('Vídeo de origem', 24),
          const SizedBox(height: 14),
          if (_source.isNotEmpty)
            AspectRatio(
              aspectRatio: 16 / 9,
              child: ClipsPlayer(url: _source),
            )
          else
            Container(
              height: 145,
              decoration: BoxDecoration(
                color: const Color(0xffeee7da),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(
                Icons.movie_creation_outlined,
                size: 42,
                color: _copper,
              ),
            ),
          const SizedBox(height: 14),
          if (_file.isNotEmpty) ...[_copy(_file), const SizedBox(height: 10)],
          OutlinedButton.icon(
            onPressed: locked ? null : _pick,
            icon: const Icon(Icons.upload_file_outlined, size: 18),
            label: Text(_file.isEmpty ? 'Escolher vídeo' : 'Trocar vídeo'),
          ),
          const SizedBox(height: 12),
          _copy('YouTube e Google Drive indisponíveis neste ambiente.'),
        ],
      ),
    );
    final fields = _panel(
      Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _heading('Trecho e formato', 24),
          const SizedBox(height: 16),
          TextField(
            controller: _title,
            enabled: !locked,
            maxLength: 200,
            decoration: const InputDecoration(labelText: 'Nome do vídeo'),
          ),
          Row(
            children: [
              Expanded(child: _timeField(_start, 'Início (s)', locked)),
              const SizedBox(width: 10),
              Expanded(child: _timeField(_end, 'Fim (s)', locked)),
            ],
          ),
          const SizedBox(height: 13),
          _copy(
            _length > 0
                ? 'Duração do original: ${_seconds(_length)} s'
                : 'Escolha um arquivo para conferir a duração.',
          ),
          const SizedBox(height: 14),
          _label('VERTICAL · 720 × 1280'),
          const SizedBox(height: 17),
          FilledButton.icon(
            onPressed: _busy || _file.isEmpty ? null : _submit,
            icon: const Icon(Icons.content_cut, size: 17),
            label: Text(
              _busy
                  ? 'Aguarde…'
                  : _pending != null
                  ? 'Conferir o mesmo pedido'
                  : 'Gerar corte vertical',
            ),
          ),
        ],
      ),
    );
    return wide
        ? Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(child: source),
              const SizedBox(width: 18),
              Expanded(child: fields),
            ],
          )
        : Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [source, const SizedBox(height: 14), fields],
          );
  }

  Widget _timeField(
    TextEditingController controller,
    String label,
    bool locked,
  ) => TextField(
    controller: controller,
    enabled: !locked,
    keyboardType: const TextInputType.numberWithOptions(decimal: true),
    decoration: InputDecoration(labelText: label),
  );

  Widget _buildLibrary(bool wide) {
    final selected = _project;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (_listError.isNotEmpty) ...[
          _message(_listError, error: true),
          const SizedBox(height: 14),
        ],
        Align(
          alignment: Alignment.centerRight,
          child: TextButton.icon(
            onPressed: _load,
            icon: const Icon(Icons.refresh, size: 16),
            label: const Text('Atualizar lista'),
          ),
        ),
        const SizedBox(height: 8),
        if (_loading)
          const Center(child: CircularProgressIndicator())
        else if (_projects.isEmpty && _listError.isEmpty)
          _panel(
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _heading('Seu primeiro corte', 25),
                const SizedBox(height: 10),
                _copy(
                  'Escolha um vídeo e marque o trecho que quer transformar em corte vertical.',
                ),
                if (_canEdit) ...[
                  const SizedBox(height: 16),
                  FilledButton.icon(
                    onPressed: () => _go(true),
                    icon: const Icon(Icons.add),
                    label: const Text('Criar primeiro vídeo'),
                  ),
                ],
              ],
            ),
          )
        else
          LayoutBuilder(
            builder: (context, bounds) {
              final columns = bounds.maxWidth >= 960
                  ? 3
                  : wide
                  ? 2
                  : 1;
              return Wrap(
                spacing: 14,
                runSpacing: 14,
                children: [
                  for (final project in _projects)
                    SizedBox(
                      width: (bounds.maxWidth - 14 * (columns - 1)) / columns,
                      child: _projectCard(project),
                    ),
                ],
              );
            },
          ),
        if (selected != null && _preview.isNotEmpty) ...[
          const SizedBox(height: 20),
          SizedBox(key: _previewAnchor),
          _panel(
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _heading(selected['title'] as String, 26),
                const SizedBox(height: 14),
                Center(
                  child: SizedBox(
                    width: wide ? 240 : 170,
                    child: AspectRatio(
                      aspectRatio: 9 / 16,
                      child: ClipsPlayer(url: _preview),
                    ),
                  ),
                ),
                const SizedBox(height: 14),
                TextButton.icon(
                  onPressed: () {
                    _release(_preview);
                    setState(() => _preview = '');
                  },
                  icon: const Icon(Icons.close, size: 16),
                  label: const Text('Fechar prévia'),
                ),
              ],
            ),
          ),
        ],
      ],
    );
  }

  Widget _projectCard(Map<String, dynamic> project) {
    final status = project['status'] as String;
    final duration = (project['duration_seconds'] as num?)?.toDouble() ?? 0;
    final start = (project['start_seconds'] as num?)?.toDouble() ?? 0;
    final ready = status == 'succeeded';
    return _panel(
      Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                ready ? Icons.play_circle_outline : Icons.movie_outlined,
                size: 23,
                color: _copper,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _label(
                  const {
                        'queued': 'NA FILA',
                        'running': 'PROCESSANDO',
                        'failed': 'FALHA NA EXPORTAÇÃO',
                        'succeeded': 'CORTE PRONTO',
                      }[status] ??
                      'VÍDEO',
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          _heading(project['title'] as String? ?? 'Corte vertical', 24),
          const SizedBox(height: 8),
          _copy(
            duration > 0
                ? '${_seconds(start)}–${_seconds(start + duration)} s · Vertical 9:16'
                : 'Vertical 9:16',
          ),
          if (status == 'failed')
            _copy('Confira o vídeo de origem e tente criar um novo corte.'),
          const SizedBox(height: 12),
          Wrap(
            spacing: 6,
            runSpacing: 5,
            children: [
              if (ready) ...[
                TextButton(
                  onPressed: _busy ? null : () => _showPreview(project),
                  child: const Text('Ver corte'),
                ),
                TextButton(
                  onPressed: _busy
                      ? null
                      : () => _run(() async {
                          await _media('download', {
                            'id': project['id'],
                            'title': project['title'],
                          });
                        }),
                  child: const Text('Baixar MP4'),
                ),
              ],
              if (_canEdit && !_processing(project))
                IconButton(
                  onPressed: _busy ? null : () => _delete(project),
                  tooltip: 'Excluir ${project['title']}',
                  icon: const Icon(Icons.delete_outline, size: 19),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

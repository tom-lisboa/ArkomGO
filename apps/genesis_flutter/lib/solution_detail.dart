import 'package:material_ui/material_ui.dart';

import 'platform.dart' show PlatformCall;
import 'solution_art.dart';
import 'visuals.dart';

class SolutionDetail extends StatefulWidget {
  final Map<String, dynamic> solution;
  final String role;
  final PlatformCall api;
  final VoidCallback onBack, onOpen;
  const SolutionDetail({
    super.key,
    required this.solution,
    required this.role,
    required this.api,
    required this.onBack,
    required this.onOpen,
  });
  @override
  State<SolutionDetail> createState() => _SolutionDetailState();
}

class _SolutionDetailState extends State<SolutionDetail> {
  final guideKey = GlobalKey();
  Map<String, dynamic>? savedRating;
  bool saving = false;
  String error = '';
  Map<String, dynamic> get rating =>
      savedRating ?? Map<String, dynamic>.from(widget.solution['rating'] ?? {});
  Future<void> rate(int value) async {
    if (saving || widget.role == 'viewer') return;
    setState(() {
      saving = true;
      error = '';
    });
    try {
      final result = await widget.api(
        '/v1/sdr/genesis-demo/ecosystem/${widget.solution['id']}/rating',
        {'rating': value},
      );
      if (mounted)
        setState(() => savedRating = Map<String, dynamic>.from(result));
    } catch (e) {
      if (mounted)
        setState(
          () =>
              error = 'Não foi possível salvar sua avaliação. Tente novamente.',
        );
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  Widget infoPanel(Widget child) => Container(
    padding: const EdgeInsets.all(23),
    decoration: BoxDecoration(
      borderRadius: BorderRadius.circular(20),
      border: Border.all(color: const Color(0xff3b3e42)),
      gradient: const LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [Color(0xff222528), Color(0xff16191c)],
      ),
    ),
    child: child,
  );
  void showGuide() {
    final target = guideKey.currentContext;
    if (target != null)
      Scrollable.ensureVisible(
        target,
        duration: const Duration(milliseconds: 350),
        alignment: .06,
      );
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.solution,
        available = s['implemented'] == true && s['configured'] == true;
    final guide = (s['guide'] ?? []) as List,
        requirements = (s['requirements'] ?? []) as List;
    final features = (s['features'] ?? []) as List;
    return Stack(
      children: [
        const Positioned.fill(child: CosmicBackground()),
        SingleChildScrollView(
          key: PageStorageKey('solution-${s['id']}'),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton.icon(
                  onPressed: widget.onBack,
                  icon: const Icon(Icons.arrow_back, size: 16),
                  label: const Text('Voltar para Sistemas'),
                ),
              ),
              const SizedBox(height: 14),
              LayoutBuilder(
                builder: (context, c) => Container(
                  clipBehavior: Clip.antiAlias,
                  decoration: BoxDecoration(
                    color: const Color(0xff06090e),
                    borderRadius: BorderRadius.circular(24),
                    border: Border.all(color: line),
                  ),
                  child: Stack(
                    children: [
                      if (c.maxWidth > 700)
                        Positioned(
                          top: 0,
                          bottom: 0,
                          right: 0,
                          width: c.maxWidth * .46,
                          child: ShaderMask(
                            shaderCallback: (bounds) => const LinearGradient(
                              colors: [Colors.transparent, Colors.white],
                              stops: [0, .48],
                            ).createShader(bounds),
                            blendMode: BlendMode.dstIn,
                            child: SolutionArtwork(id: s['id']),
                          ),
                        ),
                      Padding(
                        padding: EdgeInsets.all(c.maxWidth < 600 ? 24 : 34),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              '${s['area']} · ${s['kind'] ?? 'Sistemas'}'
                                  .toUpperCase(),
                              style: const TextStyle(
                                fontSize: 11,
                                letterSpacing: 2,
                                color: muted,
                              ),
                            ),
                            const SizedBox(height: 20),
                            ConstrainedBox(
                              constraints: BoxConstraints(
                                maxWidth: c.maxWidth > 700
                                    ? c.maxWidth * .62
                                    : double.infinity,
                              ),
                              child: Text(
                                s['name'],
                                style: TextStyle(
                                  fontSize: c.maxWidth < 600 ? 32 : 46,
                                  fontWeight: FontWeight.w400,
                                  letterSpacing: -1.2,
                                ),
                              ),
                            ),
                            const SizedBox(height: 28),
                            Wrap(
                              spacing: 12,
                              runSpacing: 12,
                              children: [
                                _PrimaryAction(
                                  enabled: available,
                                  onTap: widget.onOpen,
                                  label: available
                                      ? 'Acessar sistema'
                                      : 'Sistema em integração',
                                ),
                                OutlinedButton.icon(
                                  onPressed: guide.isEmpty ? null : showGuide,
                                  style: OutlinedButton.styleFrom(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 15,
                                      vertical: 19,
                                    ),
                                    foregroundColor: const Color(0xffe5e4df),
                                    side: const BorderSide(
                                      color: Color(0xff4a4b49),
                                    ),
                                    shape: const StadiumBorder(),
                                  ),
                                  icon: const Icon(
                                    Icons.menu_book_outlined,
                                    size: 19,
                                  ),
                                  label: const Text(
                                    'Ver o tutorial completo',
                                    style: TextStyle(fontSize: 13),
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 25),
                            Wrap(
                              spacing: 12,
                              runSpacing: 12,
                              children: [
                                _Metric(
                                  value: '${guide.length}',
                                  label: 'passos no guia de uso',
                                ),
                                _Metric(
                                  value: '${requirements.length}',
                                  label: 'recursos para utilizar',
                                ),
                                _Metric(
                                  value: rating['average'] == null
                                      ? '—'
                                      : (rating['average'] as num)
                                            .toStringAsFixed(1)
                                            .replaceAll('.', ','),
                                  label:
                                      rating['count'] == null ||
                                          rating['count'] == 0
                                      ? 'sem avaliações neste espaço'
                                      : 'média neste espaço',
                                ),
                              ],
                            ),
                            if (!available)
                              Padding(
                                padding: const EdgeInsets.only(top: 18),
                                child: Text(
                                  s['reason'] ??
                                      'Esta solução ainda não está disponível.',
                                  style: const TextStyle(
                                    color: muted,
                                    fontSize: 12,
                                    height: 1.6,
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 24),
              LayoutBuilder(
                builder: (context, c) {
                  final main = Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Container(
                        key: guideKey,
                        clipBehavior: Clip.antiAlias,
                        decoration: BoxDecoration(
                          color: panel,
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(color: line),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            AspectRatio(
                              aspectRatio: 16 / 8,
                              child: Stack(
                                children: [
                                  Positioned.fill(
                                    child: SolutionArtwork(id: s['id']),
                                  ),
                                  Center(
                                    child: Container(
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 20,
                                        vertical: 15,
                                      ),
                                      decoration: BoxDecoration(
                                        color: ink.withValues(alpha: .88),
                                        borderRadius: BorderRadius.circular(15),
                                        border: Border.all(color: line),
                                      ),
                                      child: const Row(
                                        mainAxisSize: MainAxisSize.min,
                                        children: [
                                          Icon(
                                            Icons.ondemand_video_outlined,
                                            color: gold,
                                            size: 24,
                                          ),
                                          SizedBox(width: 12),
                                          Flexible(
                                            child: Text(
                                              'Tutorial em vídeo\nem preparação',
                                              textAlign: TextAlign.left,
                                              style: TextStyle(
                                                fontSize: 13,
                                                height: 1.5,
                                              ),
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            Padding(
                              padding: const EdgeInsets.all(24),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  const Text(
                                    'Como usar este sistema',
                                    style: TextStyle(
                                      fontSize: 23,
                                      fontWeight: FontWeight.w300,
                                    ),
                                  ),
                                  const SizedBox(height: 8),
                                  const Text(
                                    'Comece pelo guia abaixo.',
                                    style: TextStyle(
                                      fontSize: 12,
                                      color: muted,
                                    ),
                                  ),
                                  const SizedBox(height: 20),
                                  ...guide.asMap().entries.map(
                                    (entry) => Padding(
                                      padding: const EdgeInsets.only(
                                        bottom: 19,
                                      ),
                                      child: Row(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                          Container(
                                            width: 28,
                                            height: 28,
                                            alignment: Alignment.center,
                                            decoration: BoxDecoration(
                                              color: const Color(0xff30291d),
                                              borderRadius:
                                                  BorderRadius.circular(8),
                                            ),
                                            child: Text(
                                              '${entry.key + 1}',
                                              style: const TextStyle(
                                                color: gold,
                                                fontSize: 12,
                                              ),
                                            ),
                                          ),
                                          const SizedBox(width: 13),
                                          Expanded(
                                            child: Column(
                                              crossAxisAlignment:
                                                  CrossAxisAlignment.start,
                                              children: [
                                                Text(
                                                  entry.value['title'],
                                                  style: const TextStyle(
                                                    fontSize: 14,
                                                  ),
                                                ),
                                                const SizedBox(height: 6),
                                                Text(
                                                  entry.value['description'],
                                                  style: const TextStyle(
                                                    color: muted,
                                                    fontSize: 12,
                                                    height: 1.7,
                                                  ),
                                                ),
                                              ],
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 24),
                      infoPanel(
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'Sobre este sistema',
                              style: TextStyle(
                                fontSize: 22,
                                fontWeight: FontWeight.w300,
                              ),
                            ),
                            const SizedBox(height: 15),
                            Text(
                              s['description'],
                              style: const TextStyle(
                                fontSize: 13,
                                color: muted,
                                height: 1.8,
                              ),
                            ),
                            const SizedBox(height: 16),
                            ...features.map(
                              (f) => Padding(
                                padding: const EdgeInsets.only(bottom: 10),
                                child: Row(
                                  children: [
                                    const Icon(
                                      Icons.check_circle_outline,
                                      color: gold,
                                      size: 16,
                                    ),
                                    const SizedBox(width: 9),
                                    Expanded(
                                      child: Text(
                                        f,
                                        style: const TextStyle(
                                          fontSize: 12,
                                          color: muted,
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  );
                  final side = Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      infoPanel(
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'Sua avaliação',
                              style: TextStyle(fontSize: 16),
                            ),
                            const SizedBox(height: 16),
                            LayoutBuilder(
                              builder: (context, c) => Row(
                                children: List.generate(
                                  5,
                                  (i) => SizedBox(
                                    width: (c.maxWidth / 5).clamp(0, 46),
                                    child: IconButton(
                                      padding: EdgeInsets.zero,
                                      tooltip: 'Avaliar com ${i + 1} estrelas',
                                      onPressed:
                                          widget.role == 'viewer' ||
                                              saving ||
                                              !available
                                          ? null
                                          : () => rate(i + 1),
                                      icon: Icon(
                                        i < (rating['mine'] ?? 0)
                                            ? Icons.star
                                            : Icons.star_border,
                                        color: gold,
                                        size: 30,
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(height: 13),
                            Text(
                              saving
                                  ? 'Salvando…'
                                  : widget.role == 'viewer'
                                  ? 'Seu perfil permite apenas consulta.'
                                  : 'Toque nas estrelas para avaliar este sistema.',
                              style: const TextStyle(
                                color: muted,
                                fontSize: 11,
                                height: 1.6,
                              ),
                            ),
                            const SizedBox(height: 16),
                            Text(
                              (rating['count'] ?? 0) == 0
                                  ? 'Ainda não há avaliações neste espaço.'
                                  : '${(rating['average'] as num).toStringAsFixed(1).replaceAll('.', ',')} · ${rating['count']} avaliação(ões) neste espaço',
                              style: const TextStyle(
                                color: muted,
                                fontSize: 11,
                              ),
                            ),
                            if (error.isNotEmpty)
                              Padding(
                                padding: const EdgeInsets.only(top: 10),
                                child: Text(
                                  error,
                                  style: const TextStyle(
                                    color: Color(0xfff0b4a2),
                                    fontSize: 11,
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 18),
                      infoPanel(
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Row(
                              children: [
                                Icon(
                                  Icons.key_outlined,
                                  size: 19,
                                  color: muted,
                                ),
                                SizedBox(width: 10),
                                Expanded(
                                  child: Text(
                                    'Para usar este sistema',
                                    style: TextStyle(fontSize: 16),
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 10),
                            const Text(
                              'Preparado pela Arkom para sua empresa.',
                              style: TextStyle(
                                fontSize: 11,
                                color: muted,
                                height: 1.6,
                              ),
                            ),
                            const SizedBox(height: 16),
                            ...requirements.map(
                              (r) => Padding(
                                padding: const EdgeInsets.symmetric(
                                  vertical: 10,
                                ),
                                child: Wrap(
                                  spacing: 10,
                                  runSpacing: 8,
                                  children: [
                                    Text(
                                      r['name'],
                                      style: const TextStyle(fontSize: 12),
                                    ),
                                    Container(
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 9,
                                        vertical: 4,
                                      ),
                                      decoration: BoxDecoration(
                                        border: Border.all(
                                          color: const Color(0xff5f5134),
                                        ),
                                        borderRadius: BorderRadius.circular(15),
                                      ),
                                      child: Text(
                                        r['status'],
                                        style: const TextStyle(
                                          fontSize: 9,
                                          color: gold,
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 18),
                      infoPanel(
                        const Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Personalize do seu jeito',
                              style: TextStyle(fontSize: 16),
                            ),
                            SizedBox(height: 12),
                            Text(
                              'O Remix no Lovable será disponibilizado quando a conexão de personalização estiver pronta.',
                              style: TextStyle(
                                fontSize: 12,
                                color: muted,
                                height: 1.7,
                              ),
                            ),
                            SizedBox(height: 16),
                            OutlinedButton(
                              onPressed: null,
                              child: Text('Remix no Lovable'),
                            ),
                          ],
                        ),
                      ),
                    ],
                  );
                  if (c.maxWidth < 900)
                    return Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [main, const SizedBox(height: 22), side],
                    );
                  return Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(child: main),
                      const SizedBox(width: 22),
                      SizedBox(width: 290, child: side),
                    ],
                  );
                },
              ),
              const SizedBox(height: 35),
            ],
          ),
        ),
      ],
    );
  }
}

class _Metric extends StatelessWidget {
  final String value, label;
  const _Metric({required this.value, required this.label});
  @override
  Widget build(BuildContext context) => Container(
    width: 164,
    padding: const EdgeInsets.symmetric(horizontal: 19, vertical: 15),
    decoration: BoxDecoration(
      borderRadius: BorderRadius.circular(16),
      border: Border.all(color: const Color(0xff333638)),
      gradient: const LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [Color(0xff242729), Color(0xff0e1012)],
      ),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          value,
          style: const TextStyle(fontSize: 29, fontWeight: FontWeight.w300),
        ),
        const SizedBox(height: 6),
        Text(label, style: const TextStyle(fontSize: 10, color: muted)),
      ],
    ),
  );
}

class _PrimaryAction extends StatelessWidget {
  final bool enabled;
  final VoidCallback onTap;
  final String label;
  const _PrimaryAction({
    required this.enabled,
    required this.onTap,
    required this.label,
  });
  @override
  Widget build(BuildContext context) => Material(
    color: Colors.transparent,
    child: InkWell(
      onTap: enabled ? onTap : null,
      borderRadius: BorderRadius.circular(40),
      child: Container(
        padding: const EdgeInsets.fromLTRB(7, 6, 23, 6),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(40),
          border: Border.all(color: enabled ? const Color(0xff77786e) : line),
          gradient: const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xff414440), Color(0xff121416)],
          ),
          boxShadow: enabled
              ? [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: .25),
                    blurRadius: 9,
                    offset: const Offset(0, 3),
                  ),
                ]
              : null,
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.all(11),
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: const Color(0xff454742),
                border: Border.all(color: const Color(0xff686960)),
              ),
              child: Icon(
                enabled ? Icons.arrow_forward : Icons.lock_outline,
                color: enabled ? gold : muted,
                size: 18,
              ),
            ),
            const SizedBox(width: 13),
            Flexible(
              child: Text(
                label,
                style: TextStyle(
                  fontSize: 14,
                  color: enabled ? const Color(0xfff0eee7) : muted,
                ),
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

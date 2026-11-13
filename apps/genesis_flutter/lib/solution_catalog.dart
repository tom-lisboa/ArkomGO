import 'package:material_ui/material_ui.dart';

import 'solution_art.dart';
import 'visuals.dart';

class SolutionCatalog extends StatefulWidget {
  final List<Map<String, dynamic>> solutions;
  final void Function(String) onSelect;
  const SolutionCatalog({
    super.key,
    required this.solutions,
    required this.onSelect,
  });
  @override
  State<SolutionCatalog> createState() => _SolutionCatalogState();
}

class _SolutionCatalogState extends State<SolutionCatalog> {
  String area = 'Todos', query = '';
  @override
  Widget build(BuildContext context) {
    final areas = [
      'Todos',
      ...widget.solutions.map((s) => s['area'] as String).toSet(),
    ];
    final values = widget.solutions
        .where(
          (s) =>
              (area == 'Todos' || s['area'] == area) &&
              s['name'].toString().toLowerCase().contains(query),
        )
        .toList();
    return Stack(
      children: [
        const Positioned.fill(child: CosmicBackground()),
        SingleChildScrollView(
          key: const PageStorageKey('systems-catalog'),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SizedBox(height: 16),
              const Text(
                'S I S T E M A S  P R O N T O S',
                style: TextStyle(fontSize: 11, color: muted),
              ),
              const SizedBox(height: 22),
              const Text(
                'Os sistemas da sua empresa, prontos para rodar.',
                style: TextStyle(
                  fontSize: 38,
                  fontWeight: FontWeight.w300,
                  letterSpacing: -1.1,
                  height: 1.18,
                ),
              ),
              const SizedBox(height: 22),
              Wrap(
                spacing: 30,
                runSpacing: 18,
                crossAxisAlignment: WrapCrossAlignment.end,
                children: [
                  const SizedBox(
                    width: 610,
                    child: Text(
                      'Ferramentas, automações e soluções para acelerar o seu negócio.',
                      style: TextStyle(
                        fontSize: 15,
                        color: muted,
                        height: 1.65,
                      ),
                    ),
                  ),
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        '${widget.solutions.where((s) => s['implemented'] == true).length}',
                        style: const TextStyle(
                          fontSize: 38,
                          fontWeight: FontWeight.w300,
                        ),
                      ),
                      const SizedBox(width: 10),
                      const Text(
                        'integrados neste espaço',
                        style: TextStyle(fontSize: 12, color: muted),
                      ),
                    ],
                  ),
                ],
              ),
              const SizedBox(height: 30),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: areas.map((value) {
                  final count = value == 'Todos'
                      ? widget.solutions.length
                      : widget.solutions
                            .where((s) => s['area'] == value)
                            .length;
                  return _SectorPill(
                    label: '$value  $count',
                    selected: value == area,
                    onTap: () => setState(() => area = value),
                  );
                }).toList(),
              ),
              const SizedBox(height: 14),
              ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 330),
                child: TextField(
                  onChanged: (v) => setState(() => query = v.toLowerCase()),
                  decoration: InputDecoration(
                    hintText: 'Buscar sistema',
                    prefixIcon: const Icon(Icons.search, size: 20),
                    isDense: true,
                    filled: true,
                    fillColor: const Color(0xff191c22).withValues(alpha: .8),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(28),
                      borderSide: const BorderSide(color: line),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(28),
                      borderSide: const BorderSide(color: gold),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 24),
              SolutionCards(solutions: values, onSelect: widget.onSelect),
              const SizedBox(height: 30),
            ],
          ),
        ),
      ],
    );
  }
}

class _SectorPill extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;
  const _SectorPill({
    required this.label,
    required this.selected,
    required this.onTap,
  });
  @override
  Widget build(BuildContext context) => Material(
    color: Colors.transparent,
    child: InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(24),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 17, vertical: 10),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(24),
          border: Border.all(color: selected ? const Color(0xff8c7650) : line),
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: selected
                ? [const Color(0xff353631), const Color(0xff1a1b1b)]
                : [
                    const Color(0xff1b1f25).withValues(alpha: .75),
                    const Color(0xff111318).withValues(alpha: .75),
                  ],
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 12,
            color: selected ? const Color(0xffece9e1) : muted,
          ),
        ),
      ),
    ),
  );
}

class SolutionCards extends StatelessWidget {
  final List<Map<String, dynamic>> solutions;
  final void Function(String) onSelect;
  const SolutionCards({
    super.key,
    required this.solutions,
    required this.onSelect,
  });
  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, c) {
      final columns = c.maxWidth < 590
          ? 1
          : c.maxWidth < 1000
          ? 2
          : 3;
      if (solutions.isEmpty)
        return const Padding(
          padding: EdgeInsets.all(30),
          child: Text(
            'Nenhum sistema encontrado.',
            style: TextStyle(color: muted),
          ),
        );
      return Wrap(
        spacing: 18,
        runSpacing: 18,
        children: solutions
            .map(
              (s) => SizedBox(
                width: (c.maxWidth - 18 * (columns - 1)) / columns,
                child: _SolutionCard(
                  solution: s,
                  onSelect: () => onSelect(s['id']),
                ),
              ),
            )
            .toList(),
      );
    },
  );
}

class _SolutionCard extends StatefulWidget {
  final Map<String, dynamic> solution;
  final VoidCallback onSelect;
  const _SolutionCard({required this.solution, required this.onSelect});
  @override
  State<_SolutionCard> createState() => _SolutionCardState();
}

class _SolutionCardState extends State<_SolutionCard> {
  bool hovered = false;
  @override
  Widget build(BuildContext context) {
    final s = widget.solution, enabled = s['implemented'] == true;
    return Semantics(
      button: true,
      enabled: enabled,
      label: '${s['name']}${enabled ? '' : ' · bloqueada'}',
      child: MouseRegion(
        onEnter: (_) => setState(() => hovered = true),
        onExit: (_) => setState(() => hovered = false),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 150),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(22),
            border: Border.all(
              color: enabled && hovered ? gold : const Color(0xff373b42),
            ),
            boxShadow: hovered && enabled
                ? [
                    BoxShadow(
                      color: gold.withValues(alpha: .07),
                      blurRadius: 24,
                    ),
                  ]
                : null,
          ),
          child: Material(
            color: const Color(0xff14171b).withValues(alpha: .94),
            borderRadius: BorderRadius.circular(22),
            clipBehavior: Clip.antiAlias,
            child: InkWell(
              onTap: enabled ? widget.onSelect : null,
              child: Opacity(
                opacity: enabled ? 1 : .46,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    AspectRatio(
                      aspectRatio: 1.83,
                      child: Stack(
                        children: [
                          Positioned.fill(child: SolutionArtwork(id: s['id'])),
                          Positioned(
                            top: 14,
                            left: 14,
                            child: Container(
                              padding: const EdgeInsets.all(10),
                              decoration: BoxDecoration(
                                color: const Color(0xff0c1119),
                                border: Border.all(color: line),
                                borderRadius: BorderRadius.circular(14),
                              ),
                              child: Icon(
                                enabled
                                    ? Icons.hub_outlined
                                    : Icons.lock_outline,
                                size: 20,
                                color: enabled
                                    ? const Color(0xffd9e1e6)
                                    : muted,
                              ),
                            ),
                          ),
                          Positioned(
                            top: 14,
                            right: 14,
                            child: Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 13,
                                vertical: 8,
                              ),
                              decoration: BoxDecoration(
                                color: ink.withValues(alpha: .8),
                                border: Border.all(color: line),
                                borderRadius: BorderRadius.circular(22),
                              ),
                              child: Text(
                                s['kind'] ?? 'Sistemas',
                                style: const TextStyle(
                                  fontSize: 10,
                                  letterSpacing: .8,
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.all(20),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            s['area'].toString().toUpperCase(),
                            style: const TextStyle(
                              color: gold,
                              fontSize: 10,
                              letterSpacing: 1,
                            ),
                          ),
                          const SizedBox(height: 10),
                          Text(
                            s['name'],
                            style: const TextStyle(
                              fontSize: 22,
                              fontWeight: FontWeight.w400,
                              letterSpacing: -.3,
                            ),
                          ),
                          const SizedBox(height: 12),
                          SizedBox(
                            height: 46,
                            child: Text(
                              s['description'],
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontSize: 13,
                                height: 1.7,
                                color: muted,
                              ),
                            ),
                          ),
                          const SizedBox(height: 25),
                          Row(
                            children: [
                              Text(
                                enabled
                                    ? 'Ver detalhes'
                                    : 'Disponível após integração',
                                style: TextStyle(
                                  fontSize: 13,
                                  color: enabled && hovered
                                      ? gold
                                      : const Color(0xffc4c7cb),
                                ),
                              ),
                              const SizedBox(width: 10),
                              Icon(
                                enabled
                                    ? Icons.arrow_forward
                                    : Icons.lock_outline,
                                size: 17,
                                color: enabled ? gold : muted,
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

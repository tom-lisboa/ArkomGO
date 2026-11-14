import 'package:material_ui/material_ui.dart';

import 'visuals.dart';

bool hasGenesisTool(Map<String, dynamic> build) =>
    build['status'] == 'ready' && build['has_frontend'] == true;

List<Map<String, dynamic>> genesisTools(List<Map<String, dynamic>> builds) {
  final byId = {for (final build in builds) build['id']: build};
  final selected = <Object, Map<String, dynamic>>{};
  for (final build in builds.where(hasGenesisTool)) {
    final application = build['application_id'] as String?;
    Object lineage = build['id'] as String;
    if (application == null || application.isEmpty) {
      final seen = {lineage};
      var parent = build['parent_id'];
      while (parent is String && parent.isNotEmpty && seen.add(parent)) {
        lineage = parent;
        parent = byId[parent]?['parent_id'];
      }
    } else {
      lineage = application;
    }
    final previous = selected[lineage];
    if (previous == null ||
        (build['revision'] as int? ?? 0) >
            (previous['revision'] as int? ?? 0)) {
      selected[lineage] = build;
    }
  }
  return selected.values.toList();
}

String genesisToolName(Map<String, dynamic> build) {
  final name = build['name'] as String? ?? '';
  return name.trim().isEmpty ? (build['goal'] as String).trim() : name.trim();
}

class GenesisTools extends StatelessWidget {
  final List<Map<String, dynamic>> tools;
  final bool loading, canCreate;
  final String error;
  final VoidCallback onCreate;
  final ValueChanged<String> onOpen, onEdit;

  const GenesisTools({
    super.key,
    required this.tools,
    required this.loading,
    required this.canCreate,
    required this.error,
    required this.onCreate,
    required this.onOpen,
    required this.onEdit,
  });

  @override
  Widget build(BuildContext context) => Align(
    alignment: Alignment.topLeft,
    child: ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 980),
      child: ListView(
        padding: const EdgeInsets.only(bottom: 18),
        children: [
          const Text(
            'Ferramentas',
            style: TextStyle(
              fontSize: 36,
              fontWeight: FontWeight.w300,
              letterSpacing: -1,
            ),
          ),
          const SizedBox(height: 8),
          const Text(
            'Abra as ferramentas que seu time criou no Genesis.',
            style: TextStyle(color: muted, fontSize: 14, height: 1.5),
          ),
          const SizedBox(height: 18),
          if (canCreate)
            Align(
              alignment: Alignment.centerLeft,
              child: FilledButton.icon(
                onPressed: onCreate,
                icon: const Icon(Icons.add, size: 18),
                label: const Text('Criar ferramenta'),
                style: FilledButton.styleFrom(
                  backgroundColor: gold,
                  foregroundColor: ink,
                ),
              ),
            ),
          const SizedBox(height: 22),
          if (loading)
            const Center(child: CircularProgressIndicator(color: gold))
          else if (error.isEmpty && tools.isEmpty)
            Container(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                color: panel,
                border: Border.all(color: line),
                borderRadius: BorderRadius.circular(18),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Icon(Icons.widgets_outlined, color: gold),
                  const SizedBox(height: 14),
                  const Text(
                    'Você ainda não tem ferramentas prontas.',
                    style: TextStyle(fontSize: 17),
                  ),
                  if (canCreate) ...[
                    const SizedBox(height: 8),
                    const Text(
                      'Conte sua primeira ideia ao Genesis ou continue uma construção por lá.',
                      style: TextStyle(color: muted, height: 1.5),
                    ),
                  ],
                ],
              ),
            ),
          for (final tool in tools)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: toolCard(tool),
            ),
        ],
      ),
    ),
  );

  Widget toolCard(Map<String, dynamic> tool) {
    final id = tool['id'] as String;
    final title = genesisToolName(tool);
    return Container(
      decoration: BoxDecoration(
        color: panel,
        border: Border.all(color: line),
        borderRadius: BorderRadius.circular(16),
      ),
      clipBehavior: Clip.antiAlias,
      child: Row(
        children: [
          Expanded(
            child: Semantics(
              button: true,
              label: title,
              excludeSemantics: true,
              onTap: () => onOpen(id),
              child: Material(
                color: Colors.transparent,
                child: InkWell(
                  onTap: () => onOpen(id),
                  child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: Row(
                      children: [
                        const Icon(
                          Icons.web_asset_outlined,
                          color: gold,
                          size: 22,
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            title,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ),
                        const SizedBox(width: 6),
                        const Icon(Icons.arrow_forward, size: 17, color: gold),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
          if (canCreate)
            IconButton(
              tooltip: 'Editar $title no Genesis',
              onPressed: () => onEdit(id),
              icon: const Icon(Icons.edit_outlined, size: 18, color: muted),
            ),
          const SizedBox(width: 5),
        ],
      ),
    );
  }
}

import 'package:material_ui/material_ui.dart';
import 'package:flutter/services.dart';

import 'studio_controller.dart';
import 'visuals.dart';
import 'design_brief.dart';

class CodeWorkspace extends StatelessWidget {
  final StudioController model;
  const CodeWorkspace({super.key, required this.model});
  @override
  Widget build(BuildContext context) {
    final files = model.files.keys.toList()..sort();
    final selected = files.contains(model.selectedFile)
        ? model.selectedFile
        : files.firstOrNull;
    return LayoutBuilder(
      builder: (context, c) {
        final narrow = c.maxWidth < 600;
        return Column(
          children: [
            Container(
              height: 46,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              decoration: const BoxDecoration(
                border: Border(bottom: BorderSide(color: line)),
              ),
              child: Row(
                children: [
                  const Icon(Icons.description_outlined, size: 15, color: gold),
                  const SizedBox(width: 10),
                  Expanded(
                    child: narrow && files.isNotEmpty
                        ? DropdownButtonHideUnderline(
                            child: DropdownButton<String>(
                              value: selected,
                              isExpanded: true,
                              style: const TextStyle(
                                fontSize: 11,
                                fontFamily: 'ArkomMono',
                                color: gold,
                              ),
                              items: files
                                  .map(
                                    (f) => DropdownMenuItem(
                                      value: f,
                                      child: Text(
                                        f,
                                        overflow: TextOverflow.ellipsis,
                                      ),
                                    ),
                                  )
                                  .toList(),
                              onChanged: (v) {
                                if (v != null) model.chooseFile(v);
                              },
                            ),
                          )
                        : Text(
                            selected ?? 'Arquivos do projeto',
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 11,
                              fontFamily: 'ArkomMono',
                              color: gold,
                            ),
                          ),
                  ),
                  IconButton(
                    tooltip: 'Copiar código',
                    onPressed: selected == null
                        ? null
                        : () => Clipboard.setData(
                            ClipboardData(text: model.files[selected] ?? ''),
                          ),
                    icon: const Icon(Icons.copy_outlined, size: 15),
                  ),
                ],
              ),
            ),
            Expanded(
              child: Row(
                children: [
                  if (!narrow)
                    Container(
                      width: 190,
                      decoration: const BoxDecoration(
                        color: Color(0xff101214),
                        border: Border(right: BorderSide(color: line)),
                      ),
                      child: Material(
                        color: Colors.transparent,
                        child: ListView(
                          padding: const EdgeInsets.symmetric(vertical: 12),
                          children: [
                            const Padding(
                              padding: EdgeInsets.fromLTRB(16, 4, 16, 14),
                              child: Text(
                                'EXPLORADOR',
                                style: TextStyle(
                                  fontSize: 9,
                                  letterSpacing: 1.6,
                                  color: muted,
                                ),
                              ),
                            ),
                            for (final f in files)
                              ListTile(
                                dense: true,
                                selected: f == selected,
                                selectedTileColor: gold.withValues(alpha: .08),
                                contentPadding: const EdgeInsets.symmetric(
                                  horizontal: 14,
                                ),
                                minLeadingWidth: 14,
                                leading: Icon(
                                  f.endsWith('.go')
                                      ? Icons.data_object
                                      : f.endsWith('.css')
                                      ? Icons.palette_outlined
                                      : Icons.description_outlined,
                                  size: 14,
                                  color: f.endsWith('.go')
                                      ? agentColors[1]
                                      : muted,
                                ),
                                title: Text(
                                  f,
                                  style: TextStyle(
                                    fontSize: 10,
                                    fontFamily: 'ArkomMono',
                                    color: f == selected ? gold : muted,
                                  ),
                                ),
                                onTap: () => model.chooseFile(f),
                              ),
                          ],
                        ),
                      ),
                    ),
                  Expanded(
                    child: Container(
                      color: const Color(0xff0d0f12),
                      alignment: Alignment.topLeft,
                      child: SingleChildScrollView(
                        padding: const EdgeInsets.all(22),
                        child:
                            [
                              'design/ux.json',
                              'design/ui.json',
                              'design/navigation.json',
                            ].contains(selected)
                            ? DesignBrief(source: model.files[selected] ?? '')
                            : SelectableText(
                                model.files[selected] ?? 'Os arquivos aparecem aqui durante a construção.',
                                style: const TextStyle(
                                  fontFamily: 'ArkomMono',
                                  fontSize: 12,
                                  height: 1.85,
                                  color: Color(0xffb9c9d7),
                                ),
                              ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        );
      },
    );
  }
}

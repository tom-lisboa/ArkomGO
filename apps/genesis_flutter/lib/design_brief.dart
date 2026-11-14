import 'dart:convert';

import 'package:material_ui/material_ui.dart';

import 'visuals.dart';

/// A readable view of the saved specification; never invents missing content.
class DesignBrief extends StatelessWidget {
  final String source;
  const DesignBrief({super.key, required this.source});
  static const labels = {
    'schema': 'Formato',
    'home': 'Página inicial',
    'routes': 'Telas e rotas',
    'path': 'Endereço',
    'title': 'Título',
    'component': 'Componente',
    'menu': 'Mostrar no menu',
    'audience': 'Público e contexto',
    'primary_task': 'Tarefa principal',
    'journey': 'Jornada',
    'screens': 'Telas e hierarquia',
    'states': 'Estados da interface',
    'loading': 'Carregando',
    'empty': 'Vazio',
    'error': 'Erro',
    'success': 'Sucesso',
    'accessibility': 'Acessibilidade',
    'acceptance': 'Critérios de comportamento',
    'direction': 'Direção visual',
    'colors': 'Paleta',
    'background': 'Fundo',
    'surface': 'Superfície',
    'text': 'Texto',
    'primary': 'Cor principal',
    'focus': 'Foco',
    'typography': 'Tipografia',
    'spacing': 'Espaçamento',
    'components': 'Componentes',
    'responsive': 'Celular e desktop',
  };
  Widget value(dynamic data) {
    if (data is Map) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (final e in data.entries)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    labels[e.key] ?? e.key.toString(),
                    style: const TextStyle(color: gold, fontSize: 12),
                  ),
                  const SizedBox(height: 5),
                  value(e.value),
                ],
              ),
            ),
        ],
      );
    }
    if (data is List) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (var i = 0; i < data.length; i++)
            Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: data[i] is Map
                  ? value(data[i])
                  : SelectableText(
                      '${i + 1}. ${data[i]}',
                      style: const TextStyle(
                        color: Color(0xffd4d9e0),
                        height: 1.5,
                      ),
                    ),
            ),
        ],
      );
    }
    return SelectableText(
      data.toString(),
      style: const TextStyle(color: Color(0xffd4d9e0), height: 1.5),
    );
  }

  @override
  Widget build(BuildContext context) {
    dynamic data;
    try {
      data = jsonDecode(source);
    } catch (_) {
      return SelectableText(source);
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Especificação do projeto',
          style: TextStyle(color: gold, fontSize: 20),
        ),
        const SizedBox(height: 8),
        const Text(
          'Decisões propostas pelos agentes. A validação da estrutura não substitui a revisão visual e de usabilidade.',
          style: TextStyle(color: muted, height: 1.5),
        ),
        const SizedBox(height: 24),
        value(data),
      ],
    );
  }
}

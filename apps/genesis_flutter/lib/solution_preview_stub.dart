import 'package:flutter/widgets.dart';

class SolutionPreview extends StatelessWidget {
  final Map<String, String> files;
  final bool editable, running, agentic;
  final List<Map<String, dynamic>> actions;
  final String activeAgent;
  final int sequence;
  const SolutionPreview({
    super.key,
    required this.files,
    this.editable = false,
    this.running = false,
    this.sequence = 0,
    this.agentic = false,
    this.actions = const [],
    this.activeAgent = '',
  });
  @override
  Widget build(BuildContext context) =>
      const Center(child: Text('Prévia interativa da solução'));
}

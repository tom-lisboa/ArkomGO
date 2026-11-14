import 'dart:async';
import 'dart:convert';

import 'package:material_ui/material_ui.dart';

import 'transport.dart' as transport;
import 'visuals.dart';

/// Keeps the agent's own UI alive while Flutter owns the platform and navigation.
class AgentWorkspace extends StatefulWidget {
  final String id, status, message;
  const AgentWorkspace({
    super.key,
    required this.id,
    this.status = 'loading',
    this.message = '',
  });

  @override
  State<AgentWorkspace> createState() => _AgentWorkspaceState();
}

class _AgentWorkspaceState extends State<AgentWorkspace> {
  static int serial = 0;
  late final String lease;
  String localError = '';
  final surface = GlobalKey();
  String lastBounds = '';

  Future<void> call(
    String action, [
    Map<String, dynamic> extra = const {},
  ]) async {
    try {
      await transport.invoke(
        action,
        jsonEncode({'id': widget.id, 'lease': lease, ...extra}),
      );
    } catch (_) {
      if (mounted)
        setState(() => localError = 'Não foi possível abrir este agente.');
    }
  }

  @override
  void initState() {
    super.initState();
    lease = '${++serial}';
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        unawaited(call('agent_open'));
        bounds();
      }
    });
  }

  void bounds() {
    if (!mounted) return;
    final box = surface.currentContext?.findRenderObject();
    if (box is! RenderBox || !box.hasSize) return;
    final point = box.localToGlobal(Offset.zero);
    final values = {
      'left': point.dx,
      'top': point.dy,
      'width': box.size.width,
      'height': box.size.height,
    };
    final signature = jsonEncode(values);
    if (signature == lastBounds) return;
    lastBounds = signature;
    unawaited(call('agent_bounds', values));
  }

  @override
  void dispose() {
    // A lease prevents a disappearing transition from closing a newer surface.
    unawaited(
      transport.invoke(
        'agent_close',
        jsonEncode({'id': widget.id, 'lease': lease}),
      ),
    );
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      WidgetsBinding.instance.addPostFrameCallback((_) => bounds());
      final failed = widget.status == 'unavailable' || localError.isNotEmpty;
      return Container(
        key: surface,
        width: double.infinity,
        height: double.infinity,
        decoration: BoxDecoration(
          color: panel,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: line),
        ),
        child: widget.status == 'open' && !failed
            ? const SizedBox.expand()
            : Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (!failed) const CircularProgressIndicator(color: gold),
                    const SizedBox(height: 18),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 24),
                      child: Text(
                        failed
                            ? (localError.isNotEmpty
                                  ? localError
                                  : widget.message)
                            : 'Abrindo seu agente…',
                        textAlign: TextAlign.center,
                        style: const TextStyle(color: muted, fontSize: 13),
                      ),
                    ),
                    if (failed)
                      TextButton(
                        onPressed: () {
                          setState(() => localError = '');
                          lastBounds = '';
                          unawaited(call('agent_retry'));
                        },
                        child: const Text('Tentar novamente'),
                      ),
                  ],
                ),
              ),
      );
    },
  );
}

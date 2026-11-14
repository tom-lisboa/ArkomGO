import 'dart:convert';
import 'dart:js_interop';
import 'dart:ui_web' as ui_web;

import 'package:flutter/widgets.dart';

@JS('genesisBridge.createPreview')
external JSObject _create(JSString files, JSString options);
@JS('genesisBridge.updatePreview')
external void _update(JSNumber id, JSString files, JSString options);
@JS('genesisBridge.disposePreview')
external void _release(JSNumber id);
bool _registered = false;

class SolutionPreview extends StatefulWidget {
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
  State<SolutionPreview> createState() => _SolutionPreviewState();
}

class _SolutionPreviewState extends State<SolutionPreview> {
  int? viewId;
  Map<String, dynamic> get options => {
    'editable': widget.editable,
    'running': widget.running,
    'sequence': widget.sequence,
    'agentic': widget.agentic,
    'actions': widget.actions,
    'activeAgent': widget.activeAgent,
  };
  @override
  void didUpdateWidget(covariant SolutionPreview oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (viewId != null)
      _update(
        viewId!.toJS,
        jsonEncode(widget.files).toJS,
        jsonEncode(options).toJS,
      );
  }

  @override
  void dispose() {
    if (viewId != null) _release(viewId!.toJS);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!_registered) {
      ui_web.platformViewRegistry.registerViewFactory(
        'genesis-solution-preview',
        (int id, {Object? params}) {
          final data = jsonDecode(params as String) as Map<String, dynamic>;
          return _create(
            jsonEncode(data['files']).toJS,
            jsonEncode({...data['options'], 'viewId': id}).toJS,
          );
        },
      );
      _registered = true;
    }
    return HtmlElementView(
      viewType: 'genesis-solution-preview',
      creationParams: jsonEncode({'files': widget.files, 'options': options}),
      onPlatformViewCreated: (id) => viewId = id,
    );
  }
}

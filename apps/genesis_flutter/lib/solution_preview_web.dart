import 'dart:convert';
import 'dart:js_interop';
import 'dart:ui_web' as ui_web;

import 'package:flutter/widgets.dart';

@JS('genesisBridge.createPreview')
external JSObject _create(JSString files);
bool _registered = false;

class SolutionPreview extends StatelessWidget {
  final Map<String, String> files;
  const SolutionPreview({super.key, required this.files});
  @override
  Widget build(BuildContext context) {
    if (!_registered) {
      ui_web.platformViewRegistry.registerViewFactory(
        'genesis-solution-preview',
        (int id, {Object? params}) => _create((params as String).toJS),
      );
      _registered = true;
    }
    return HtmlElementView(
      viewType: 'genesis-solution-preview',
      creationParams: jsonEncode(files),
    );
  }
}

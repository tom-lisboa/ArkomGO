import 'dart:js_interop';
import 'dart:ui_web' as ui_web;

import 'package:flutter/widgets.dart';

@JS('genesisBridge.createClipsPlayer')
external JSObject _create(JSString url);

bool _registered = false;

class ClipsPlayer extends StatelessWidget {
  final String url;
  const ClipsPlayer({super.key, required this.url});

  @override
  Widget build(BuildContext context) {
    if (!_registered) {
      ui_web.platformViewRegistry.registerViewFactory(
        'arkom-clips-player',
        (int id, {Object? params}) => _create((params as String).toJS),
      );
      _registered = true;
    }
    return HtmlElementView(
      key: ValueKey(url),
      viewType: 'arkom-clips-player',
      creationParams: url,
    );
  }
}

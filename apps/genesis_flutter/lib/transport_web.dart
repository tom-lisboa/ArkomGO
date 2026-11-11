import 'dart:js_interop';

@JS('genesisBridge.connect')
external void _connect(JSFunction callback);
@JS('genesisBridge.invoke')
external JSPromise<JSString> _invoke(JSString action, JSString payload);
@JS('genesisBridge.disconnect')
external void disconnect();
void connect(void Function(String) onEvent) =>
    _connect(((JSString event) => onEvent(event.toDart)).toJS);
Future<String> invoke(String action, String payload) async =>
    (await _invoke(action.toJS, payload.toJS).toDart).toDart;

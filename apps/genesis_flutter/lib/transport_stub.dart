void connect(void Function(String) onEvent) {}
Future<String> invoke(String action, String payload) async => '{}';
void disconnect() {}

void connectPlatform(void Function(String) onEvent) {}
void disconnectPlatform() {}

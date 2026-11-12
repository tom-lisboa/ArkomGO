import 'dart:convert';

import 'package:flutter/foundation.dart';

import 'transport.dart' as transport;

class StudioController extends ChangeNotifier {
  List<Map<String, dynamic>> projects = [];
  Map<String, dynamic>? build;
  final Map<String, String> files = {};
  final List<Map<String, dynamic>> traces = [];
  String lastDelivery = '';
  String runtimeStatus = 'stopped';
  String role = 'viewer', connection = 'waiting', error = '', selectedFile = '';
  bool busy = false, authenticated = false, _disposed = false;
  int _refresh = 0;
  List<Map<String, dynamic>> get steps => ((build?['steps'] ?? []) as List)
      .map((s) => Map<String, dynamic>.from(s))
      .toList();
  bool get canAdvance =>
      canEdit &&
      !busy &&
      !anyRunning &&
      (build?['next_step_id'] ?? '') != '' &&
      [
        'awaiting_step',
        'failed',
        'cancelled',
        'interrupted',
      ].contains(build?['status']);
  bool get running => build?['status'] == 'running';
  bool get anyRunning => projects.any((b) => b['status'] == 'running');
  bool get canEdit => authenticated && role != 'viewer';
  String get id => build?['id'] ?? '';
  void attach() => transport.connect((raw) {
    if (!_disposed) accept(jsonDecode(raw));
  });
  void accept(Map<String, dynamic> data) {
    lastDelivery = data['type'] ?? '';
    switch (data['type']) {
      case 'runtime':
        runtimeStatus = data['status'];
        if ((data['message'] ?? '').isNotEmpty) error = data['message'];
      case 'session':
        runtimeStatus = 'stopped';
        build = null;
        projects.clear();
        files.clear();
        traces.clear();
        selectedFile = '';
        error = '';
        role = data['identity']['role'];
        authenticated = true;
        refresh();
      case 'connection':
        connection = data['status'];
        if (connection == 'expired') authenticated = false;
      case 'error':
        error = data['message'];
      case 'snapshot':
      case 'update':
        build = Map<String, dynamic>.from(data['build']);
        if (data['files'] != null) {
          files
            ..clear()
            ..addAll(Map<String, String>.from(data['files']));
        }
        final seen = traces.map((e) => e['sequence']).toSet();
        for (final raw in (data['traces'] ?? []) as List) {
          final e = Map<String, dynamic>.from(raw);
          if (!seen.add(e['sequence'])) continue;
          traces.add(e);
          if (e['kind'] == 'file.written') files[e['path']] = e['after'] ?? '';
        }
        traces.sort(
          (a, b) => (a['sequence'] as int).compareTo(b['sequence'] as int),
        );
        if (selectedFile.isEmpty && files.isNotEmpty) {
          selectedFile = files.keys.firstWhere(
            (p) => p.endsWith('.go') && !p.contains('/platform/'),
            orElse: () => files.keys.first,
          );
        }
        final index = projects.indexWhere((p) => p['id'] == id);
        if (index >= 0) {
          projects[index] = build!;
        } else {
          projects.insert(0, build!);
        }
    }
    if (!_disposed) notifyListeners();
  }

  Future<Map<String, dynamic>> call(
    String action, [
    Map<String, dynamic> data = const {},
  ]) async => Map<String, dynamic>.from(
    jsonDecode(await transport.invoke(action, jsonEncode(data))),
  );
  Future<void> refresh() async {
    final n = ++_refresh;
    try {
      final data = await call('list');
      if (_disposed || n != _refresh) return;
      projects = (data['builds'] as List)
          .map((e) => Map<String, dynamic>.from(e))
          .toList();
      if (build == null && projects.isNotEmpty) {
        await select(projects.first['id']);
      }
      notifyListeners();
    } catch (e) {
      failure(e);
    }
  }

  Future<void> select(String id) async {
    runtimeStatus = 'stopped';
    build = projects.firstWhere((p) => p['id'] == id);
    files.clear();
    traces.clear();
    selectedFile = '';
    connection = 'connecting';
    error = '';
    notifyListeners();
    try {
      await call('select', {'id': id});
    } catch (e) {
      failure(e);
    }
  }

  Future<void> start(String goal, {bool continueProject = false}) async {
    if (busy || !canEdit || anyRunning) return;
    busy = true;
    error = '';
    notifyListeners();
    try {
      final result = await call('start', {
        'goal': goal,
        'parent_id': continueProject ? id : '',
      });
      projects.insert(0, result);
      await select(result['id']);
    } catch (e) {
      failure(e);
    } finally {
      busy = false;
      if (!_disposed) notifyListeners();
    }
  }

  Future<void> advanceStep() async {
    if (!canAdvance) return;
    final requested = id;
    busy = true;
    error = '';
    notifyListeners();
    try {
      final result = await call('advance_step', {
        'id': requested,
        'step_id': build!['next_step_id'],
        'sequence': build!['sequence'],
      });
      if (_disposed || id != requested) return;
      final index = projects.indexWhere((p) => p['id'] == requested);
      if (index >= 0) projects[index] = result;
      await select(requested);
    } catch (e) {
      failure(e);
    } finally {
      busy = false;
      if (!_disposed) notifyListeners();
    }
  }

  Future<void> action(String action) async {
    busy = true;
    error = '';
    notifyListeners();
    try {
      await call(action, {'id': id});
    } catch (e) {
      failure(e);
    } finally {
      busy = false;
      if (!_disposed) notifyListeners();
    }
  }

  void failure(Object e) {
    if (_disposed) return;
    error = e.toString().replaceFirst('Exception: ', '');
    notifyListeners();
  }

  void chooseFile(String value) {
    selectedFile = value;
    notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    transport.disconnect();
    super.dispose();
  }
}

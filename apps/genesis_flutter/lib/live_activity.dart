import 'dart:async';

import 'package:material_ui/material_ui.dart';

import 'visuals.dart';

/// Ephemeral presentation of persisted events. Replays never become live activity.
class LiveActivity extends ChangeNotifier {
  String project = '';
  int sequence = 0;
  final List<Map<String, dynamic>> visible = [];
  final Map<int, Timer> _expiry = {};
  static const lifetime = Duration(seconds: 7);

  void seed(String id, List<Map<String, dynamic>> events) {
    clear();
    project = id;
    sequence = events.fold(
      0,
      (n, e) => (e['sequence'] as int) > n ? e['sequence'] as int : n,
    );
  }

  void sync(
    String id,
    List<Map<String, dynamic>> events, {
    bool replay = false,
  }) {
    if (project != id || replay) {
      seed(id, events);
      notifyListeners();
      return;
    }
    for (final e in events) {
      final next = e['sequence'] as int;
      if (next <= sequence) continue;
      sequence = next;
      if (agentIndex(e['agent']) < 0) continue;
      visible.removeWhere((old) => old['agent'] == e['agent']);
      visible.add(e);
      while (visible.length > 2) {
        visible.removeAt(0);
      }
      _expiry[next] = Timer(lifetime, () {
        _expiry.remove(next);
        visible.removeWhere((item) => item['sequence'] == next);
        notifyListeners();
      });
    }
    notifyListeners();
  }

  void clear() {
    for (final timer in _expiry.values) {
      timer.cancel();
    }
    _expiry.clear();
    visible.clear();
  }

  @override
  void dispose() {
    clear();
    super.dispose();
  }
}

/// Choreography represents an agent's real action on an artifact, not a simulated
/// click or a claim that a particular element has been browser-tested.
class ActivityOnCanvas extends StatelessWidget {
  final LiveActivity activity;
  const ActivityOnCanvas({super.key, required this.activity});
  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: activity,
    builder: (context, _) {
      final e = activity.visible.lastOrNull;
      final i = agentIndex(e?['agent']);
      final path = (e?['path'] ?? '') as String;
      final alignment = i == 2
          ? (path.endsWith('.css')
                ? const Alignment(.85, -.65)
                : const Alignment(-.85, -.65))
          : i == 3
          ? const Alignment(.8, .65)
          : i == 1
          ? const Alignment(-.85, .6)
          : const Alignment(-.8, -.7);
      final reduced = MediaQuery.disableAnimationsOf(context);
      return IgnorePointer(
        child: Stack(
          children: [
            AnimatedContainer(
              duration: reduced
                  ? Duration.zero
                  : const Duration(milliseconds: 400),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: e == null
                      ? Colors.transparent
                      : agentColor(e['agent']).withValues(alpha: .65),
                  width: 2,
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(14),
              child: AnimatedAlign(
                alignment: alignment,
                duration: reduced
                    ? Duration.zero
                    : const Duration(milliseconds: 650),
                curve: Curves.easeInOutCubic,
                child: AnimatedSwitcher(
                  duration: reduced
                      ? Duration.zero
                      : const Duration(milliseconds: 350),
                  child: e == null
                      ? const SizedBox.shrink()
                      : Semantics(
                          key: ValueKey(e['sequence']),
                          liveRegion: true,
                          child: Container(
                            key: ValueKey(e['sequence']),
                            constraints: const BoxConstraints(maxWidth: 290),
                            padding: const EdgeInsets.fromLTRB(8, 10, 14, 10),
                            decoration: BoxDecoration(
                              color: const Color(0xff17191d)
                                  .withValues(alpha: .97),
                              border: Border.all(
                                color: agentColor(e['agent'])
                                    .withValues(alpha: .45),
                              ),
                              borderRadius: BorderRadius.circular(16),
                              boxShadow: const [
                                BoxShadow(
                                  color: Color(0x55000000),
                                  blurRadius: 24,
                                  offset: Offset(0, 8),
                                ),
                              ],
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                WorkingGopher(index: i),
                                const SizedBox(width: 6),
                                Flexible(
                                  child: Column(
                                    mainAxisSize: MainAxisSize.min,
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        agentName(e['agent']),
                                        style: TextStyle(
                                          color: agentColor(e['agent']),
                                          fontSize: 11,
                                          fontWeight: FontWeight.w600,
                                        ),
                                      ),
                                      const SizedBox(height: 4),
                                      Text(
                                        e['summary'] ?? '',
                                        maxLines: 2,
                                        overflow: TextOverflow.ellipsis,
                                        style: const TextStyle(
                                          fontSize: 11,
                                          height: 1.4,
                                          color: Color(0xffd5d7dc),
                                        ),
                                      ),
                                      if (path.isNotEmpty) ...[
                                        const SizedBox(height: 5),
                                        Text(
                                          path,
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                          style: const TextStyle(
                                            fontFamily: 'ArkomMono',
                                            fontSize: 9,
                                            color: muted,
                                          ),
                                        ),
                                      ],
                                    ],
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                ),
              ),
            ),
          ],
        ),
      );
    },
  );
}

class WorkingGopher extends StatefulWidget {
  final int index;
  const WorkingGopher({super.key, required this.index});
  @override
  State<WorkingGopher> createState() => _WorkingGopherState();
}

class _WorkingGopherState extends State<WorkingGopher>
    with SingleTickerProviderStateMixin {
  late final AnimationController motion = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1500),
  );
  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MediaQuery.disableAnimationsOf(context)) {
      motion.stop();
    } else {
      motion.repeat();
    }
  }

  @override
  void dispose() {
    motion.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: motion,
    builder: (context, _) => SizedBox(
      width: 66,
      height: 66,
      child: Stack(
        children: [
          Gopher(
            index: widget.index,
            active: true,
            size: 62,
            workPhase: motion.value,
          ),
          Positioned(
            right: 0,
            bottom: 0,
            child: Container(
              width: 22,
              height: 22,
              decoration: BoxDecoration(
                color: panel,
                shape: BoxShape.circle,
                border: Border.all(
                  color: agentColors[widget.index].withValues(alpha: .4),
                ),
              ),
              child: Icon(
                [
                  Icons.schema_outlined,
                  Icons.terminal,
                  Icons.brush_outlined,
                  Icons.task_alt,
                ][widget.index],
                size: 12,
                color: agentColors[widget.index],
              ),
            ),
          ),
        ],
      ),
    ),
  );
}

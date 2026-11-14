import 'package:material_ui/material_ui.dart';

import 'studio_controller.dart';
import 'visuals.dart';

class FrontendPlanning extends StatelessWidget {
  final StudioController model;
  const FrontendPlanning({super.key, required this.model});
  @override
  Widget build(BuildContext context) {
    final step = model.steps.where((s) => s['status'] == 'running').firstOrNull;
    final i = agentIndex(step?['id']);
    return Container(
      color: const Color(0xfff6f5f1),
      child: LayoutBuilder(
        builder: (context, c) => Stack(
          children: [
            Positioned.fill(child: CustomPaint(painter: _Grid())),
            Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(34),
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 460),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        model.running ? 'CRIANDO COM VOCÊ' : 'GENESIS',
                        style: const TextStyle(
                          fontSize: 10,
                          letterSpacing: 2,
                          color: Color(0xff82725c),
                        ),
                      ),
                      const SizedBox(height: 18),
                      Text(
                        model.running
                            ? (step?['title'] ??
                                  'Sua ideia está ganhando forma.')
                            : 'O que você quer criar?',
                        style: const TextStyle(
                          fontSize: 34,
                          fontWeight: FontWeight.w400,
                          height: 1.2,
                          color: Color(0xff26332c),
                        ),
                      ),
                      const SizedBox(height: 15),
                      Text(
                        model.running
                            ? 'A página aparece aqui conforme os agentes constroem. O visual e a estrutura seguem o que você pediu.'
                            : 'Conte a ideia na conversa. Eu cuido da criação e você vai dizendo o que quer mudar.',
                        style: const TextStyle(
                          fontSize: 14,
                          height: 1.7,
                          color: Color(0xff717a72),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
            if (model.running && i >= 0)
              AnimatedAlign(
                alignment: Alignment(
                  .6 - (model.build?['sequence'] as int? ?? 0) % 3 * .2,
                  -.65 + (i % 3) * .15,
                ),
                duration: MediaQuery.disableAnimationsOf(context)
                    ? Duration.zero
                    : const Duration(milliseconds: 700),
                curve: Curves.easeInOutCubic,
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.near_me, size: 29, color: agentColors[i]),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 6,
                      ),
                      decoration: BoxDecoration(
                        color: agentColors[i],
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        agentNames[i],
                        style: const TextStyle(
                          color: Color(0xff1b2524),
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _Grid extends CustomPainter {
  @override
  void paint(Canvas c, Size s) {
    final p = Paint()..color = const Color(0xffe3e2db);
    for (double x = 18; x < s.width; x += 24)
      for (double y = 18; y < s.height; y += 24)
        c.drawCircle(Offset(x, y), .7, p);
  }

  @override
  bool shouldRepaint(covariant _Grid oldDelegate) => false;
}

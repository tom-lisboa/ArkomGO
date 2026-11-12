import 'dart:math' as math;

import 'package:material_ui/material_ui.dart';

const gold = Color(0xffd4b477),
    ink = Color(0xff0b0c0e),
    panel = Color(0xff121315),
    muted = Color(0xff8b929f),
    line = Color(0xff292b30);
const agentColors = [
  gold,
  Color(0xff73c9d8),
  Color(0xffb29cdd),
  Color(0xff8ac6ac),
];
const agentIds = ['architect', 'backend', 'interface', 'reviewer'];
const agentNames = ['Atlas', 'Nilo', 'Íris', 'Vega'];
const agentJobs = ['Arquitetura', 'Backend Go', 'Interface', 'Qualidade'];
int agentIndex(String? id) => agentIds.indexOf(id ?? '');
String agentName(String? id) {
  final i = agentIndex(id);
  return i < 0 ? 'Genesis' : agentNames[i];
}

Color agentColor(String? id) {
  final i = agentIndex(id);
  return i < 0 ? gold : agentColors[i];
}

class Gopher extends StatelessWidget {
  final int index;
  final bool active;
  final double size;
  final double workPhase;
  const Gopher({
    super.key,
    required this.index,
    this.active = false,
    this.size = 110,
    this.workPhase = 0,
  });
  @override
  Widget build(BuildContext context) => Semantics(
    label: '${agentNames[index]}, ${agentJobs[index]}',
    child: SizedBox(
      width: size,
      height: size,
      child: CustomPaint(
        painter: GopherPainter(agentColors[index], index, active, workPhase),
      ),
    ),
  );
}

class GopherPainter extends CustomPainter {
  final Color color;
  final int role;
  final bool active;
  final double workPhase;
  GopherPainter(this.color, this.role, this.active, this.workPhase);
  @override
  void paint(Canvas c, Size s) {
    c.scale(s.width / 120, s.height / 120);
    final p = Paint();
    void ellipse(Rect r, Color col) {
      p.color = col;
      c.drawOval(r, p);
    }

    void circle(Offset o, double r, Color col) {
      p.color = col;
      c.drawCircle(o, r, p);
    }

    ellipse(
      const Rect.fromLTWH(18, 105, 84, 9),
      Colors.black.withValues(alpha: .35),
    );
    circle(const Offset(28, 31), 12, color);
    circle(const Offset(92, 31), 12, color);
    circle(const Offset(28, 31), 6, const Color(0xff30424a));
    circle(const Offset(92, 31), 6, const Color(0xff30424a));
    final body = RRect.fromRectAndRadius(
      const Rect.fromLTWH(25, 24, 70, 84),
      const Radius.circular(30),
    );
    p.shader = LinearGradient(
      begin: Alignment.topLeft,
      end: Alignment.bottomRight,
      colors: [
        Color.lerp(color, Colors.white, .2)!,
        color,
        Color.lerp(color, Colors.black, .25)!,
      ],
    ).createShader(body.outerRect);
    c.drawRRect(body, p);
    p.shader = null;
    ellipse(
      const Rect.fromLTWH(35, 72, 50, 31),
      Colors.white.withValues(alpha: .12),
    );
    ellipse(const Rect.fromLTWH(29, 34, 31, 36), const Color(0xfff9f4e8));
    ellipse(const Rect.fromLTWH(60, 34, 31, 36), const Color(0xfff9f4e8));
    circle(const Offset(48, 52), 7, const Color(0xff151d25));
    circle(const Offset(72, 52), 7, const Color(0xff151d25));
    circle(const Offset(50, 49), 2, Colors.white);
    circle(const Offset(74, 49), 2, Colors.white);
    ellipse(const Rect.fromLTWH(51, 65, 18, 11), const Color(0xff26323a));
    p.color = const Color(0xfffff9ea);
    c.drawRRect(
      RRect.fromRectAndRadius(
        const Rect.fromLTWH(52, 76, 8, 11),
        const Radius.circular(2),
      ),
      p,
    );
    c.drawRRect(
      RRect.fromRectAndRadius(
        const Rect.fromLTWH(61, 76, 8, 11),
        const Radius.circular(2),
      ),
      p,
    );
    p
      ..color = color
      ..strokeWidth = 8
      ..strokeCap = StrokeCap.round;
    c.drawLine(const Offset(25, 80), const Offset(16, 89), p);
    c.drawLine(
      const Offset(95, 80),
      active
          ? Offset(107, 67 + math.sin(workPhase * math.pi * 2) * 7)
          : const Offset(104, 89),
      p,
    );
    c.drawLine(const Offset(42, 106), const Offset(36, 110), p);
    c.drawLine(const Offset(78, 106), const Offset(84, 110), p);
    if (role == 0) {
      p
        ..color = const Color(0xffe9c98a)
        ..strokeWidth = 2;
      c.drawLine(const Offset(32, 27), const Offset(88, 27), p);
      c.drawLine(const Offset(60, 18), const Offset(60, 25), p);
    }
    if (role == 1) {
      p
        ..color = const Color(0xff17262c)
        ..strokeWidth = 3;
      c.drawArc(
        const Rect.fromLTWH(22, 25, 76, 64),
        math.pi,
        math.pi,
        false,
        p..style = PaintingStyle.stroke,
      );
      p.style = PaintingStyle.fill;
      c.drawRRect(
        RRect.fromRectAndRadius(
          const Rect.fromLTWH(18, 48, 9, 22),
          const Radius.circular(4),
        ),
        p,
      );
      c.drawRRect(
        RRect.fromRectAndRadius(
          const Rect.fromLTWH(93, 48, 9, 22),
          const Radius.circular(4),
        ),
        p,
      );
    }
    if (role == 2) {
      p.color = const Color(0xff57416c);
      c.drawOval(const Rect.fromLTWH(31, 16, 61, 17), p);
      circle(const Offset(60, 17), 3, color);
    }
    if (role == 3) {
      p
        ..color = const Color(0xff344c43)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2;
      c.drawRRect(
        RRect.fromRectAndRadius(
          const Rect.fromLTWH(28, 37, 32, 28),
          const Radius.circular(9),
        ),
        p,
      );
      c.drawRRect(
        RRect.fromRectAndRadius(
          const Rect.fromLTWH(60, 37, 32, 28),
          const Radius.circular(9),
        ),
        p,
      );
      p.style = PaintingStyle.fill;
    }
  }

  @override
  bool shouldRepaint(GopherPainter old) =>
      old.color != color || old.active != active || old.workPhase != workPhase;
}

class Constellation extends CustomPainter {
  final double phase;
  final bool moving;
  Constellation(this.phase, this.moving);
  @override
  void paint(Canvas c, Size s) {
    final p = Paint();
    final rand = math.Random(27);
    for (int i = 0; i < 100; i++) {
      final x = rand.nextDouble() * s.width, y = rand.nextDouble() * s.height;
      p.color = gold.withValues(alpha: .06 + rand.nextDouble() * .22);
      c.drawCircle(Offset(x, y), i % 9 == 0 ? 1.3 : .7, p);
    }
    final center = Offset(s.width / 2, s.height * .46);
    for (int ring = 0; ring < 3; ring++) {
      p
        ..style = PaintingStyle.stroke
        ..strokeWidth = .7
        ..color = gold.withValues(alpha: .08);
      c.drawOval(
        Rect.fromCenter(
          center: center,
          width: s.width * (.28 + ring * .24),
          height: s.height * (.3 + ring * .21),
        ),
        p,
      );
    }
    p.style = PaintingStyle.fill;
    if (moving) {
      for (int i = 0; i < 4; i++) {
        double a = phase * math.pi * 2 + i * math.pi / 2;
        final o =
            center +
            Offset(math.cos(a) * s.width * .35, math.sin(a) * s.height * .3);
        p.color = agentColors[i].withValues(alpha: .8);
        c.drawCircle(o, 2.5, p);
      }
    }
  }

  @override
  bool shouldRepaint(Constellation old) =>
      phase != old.phase || moving != old.moving;
}

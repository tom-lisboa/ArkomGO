import 'dart:math' as math;

import 'package:material_ui/material_ui.dart';

import 'visuals.dart';

// Native artwork fills the media slot until the original private cover is linked.
class SolutionArtwork extends StatelessWidget {
  final String id;
  final double? height;
  const SolutionArtwork({super.key, required this.id, this.height});
  @override
  Widget build(BuildContext context) => ExcludeSemantics(
    child: SizedBox(
      height: height,
      child: CustomPaint(
        painter: _SolutionPainter(id),
        child: const SizedBox.expand(),
      ),
    ),
  );
}

class CosmicBackground extends StatelessWidget {
  const CosmicBackground({super.key});
  @override
  Widget build(BuildContext context) => const IgnorePointer(
    child: CustomPaint(painter: _CosmicPainter(), child: SizedBox.expand()),
  );
}

class _CosmicPainter extends CustomPainter {
  const _CosmicPainter();
  @override
  void paint(Canvas c, Size s) {
    final p = Paint()
      ..shader =
          RadialGradient(
            colors: [
              const Color(0xff122235).withValues(alpha: .7),
              ink.withValues(alpha: 0),
            ],
          ).createShader(
            Rect.fromCircle(
              center: Offset(s.width * .76, s.height * .18),
              radius: s.width * .65,
            ),
          );
    c.drawRect(Offset.zero & s, p);
    final random = math.Random(73);
    p.shader = null;
    for (var i = 0; i < 190; i++) {
      p.color = const Color(0xffc5d5db)
          .withValues(alpha: .08 + random.nextDouble() * .3);
      final x = s.width * .35 + random.nextDouble() * s.width * .65;
      final y = random.nextDouble() * s.height;
      final r = random.nextDouble() * 1.1 + .2;
      c.drawCircle(Offset(x, y), r, p);
    }
    p
      ..style = PaintingStyle.stroke
      ..color = const Color(0xff82909d).withValues(alpha: .07)
      ..strokeWidth = .7;
    for (var i = 1; i < 7; i++)
      c.drawOval(
        Rect.fromCenter(
          center: Offset(s.width * .77, s.height * .32),
          width: s.width * .3 * i,
          height: s.height * .6 * i,
        ),
        p,
      );
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class _SolutionPainter extends CustomPainter {
  final String id;
  _SolutionPainter(this.id);
  @override
  void paint(Canvas c, Size s) {
    c.drawRect(
      Offset.zero & s,
      Paint()
        ..shader = const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xff182c48), Color(0xff091420), Color(0xff080b10)],
        ).createShader(Offset.zero & s),
    );
    final rng = math.Random(id.codeUnits.fold<int>(0, (a, b) => a + b));
    for (var i = 0; i < 45; i++)
      c.drawCircle(
        Offset(rng.nextDouble() * s.width, rng.nextDouble() * s.height),
        rng.nextDouble() * .8 + .25,
        Paint()..color = gold.withValues(alpha: rng.nextDouble() * .28),
      );
    final center = Offset(s.width * .54, s.height * .51),
        scale = math.min(s.width / 360, s.height / 200);
    c.save();
    c.translate(center.dx, center.dy);
    c.scale(scale);
    final nodes = [
      const Offset(-114, -29),
      const Offset(-75, 53),
      const Offset(106, -55),
      const Offset(124, 34),
      const Offset(18, -77),
      const Offset(37, 80),
    ];
    final linePaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = .9
      ..color = gold.withValues(alpha: .45);
    for (final node in nodes) {
      final path = Path()
        ..moveTo(0, 0)
        ..lineTo(node.dx, 0)
        ..lineTo(node.dx, node.dy);
      c.drawPath(path, linePaint);
      tile(c, node, 13 + rng.nextDouble() * 6, 5);
    }
    // Halo, plinth and raised system panel.
    c.drawOval(
      Rect.fromCenter(center: const Offset(0, 35), width: 175, height: 65),
      Paint()
        ..color = gold.withValues(alpha: .08)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 17),
    );
    for (var i = 0; i < 3; i++)
      c.drawOval(
        Rect.fromCenter(
          center: Offset(0, 34 + i * 5),
          width: 150 + i * 9,
          height: 42 + i * 4,
        ),
        Paint()
          ..style = PaintingStyle.stroke
          ..color = gold.withValues(alpha: .18)
          ..strokeWidth = .7,
      );
    final board = RRect.fromRectAndRadius(
      const Rect.fromLTWH(-68, -54, 136, 99),
      const Radius.circular(10),
    );
    c.drawRRect(
      board,
      Paint()
        ..shader = const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xff33445b), Color(0xff0c1724)],
        ).createShader(board.outerRect),
    );
    c.drawRRect(
      board,
      Paint()
        ..style = PaintingStyle.stroke
        ..color = gold.withValues(alpha: .78)
        ..strokeWidth = 1.2,
    );
    final accent = Paint()..color = gold;
    final faint = Paint()
      ..color = const Color(0xff8199ad).withValues(alpha: .6);
    c.drawRRect(
      RRect.fromRectAndRadius(
        const Rect.fromLTWH(-55, -42, 83, 3),
        const Radius.circular(2),
      ),
      accent,
    );
    if (id == 'clips') {
      for (var i = 0; i < 4; i++) {
        final rect = Rect.fromLTWH(-54 + i * 28, -24, 24, 39);
        c.drawRRect(
          RRect.fromRectAndRadius(rect, const Radius.circular(3)),
          faint,
        );
        c.drawLine(
          rect.topLeft + const Offset(3, 5),
          rect.topRight + const Offset(-3, 5),
          accent,
        );
      }
      final play = Path()
        ..moveTo(-8, -10)
        ..lineTo(8, 0)
        ..lineTo(-8, 10)
        ..close();
      c.drawPath(play, accent);
    } else if (id == 'crm') {
      for (var col = 0; col < 3; col++) {
        c.drawRRect(
          RRect.fromRectAndRadius(
            Rect.fromLTWH(-54 + col * 37, -27, 30, 57),
            const Radius.circular(4),
          ),
          Paint()..color = const Color(0xff07121e),
        );
        for (var row = 0; row < 3 - col; row++)
          c.drawRRect(
            RRect.fromRectAndRadius(
              Rect.fromLTWH(-50 + col * 37, -22 + row * 16, 22, 11),
              const Radius.circular(2),
            ),
            row == 0 ? accent : faint,
          );
      }
    } else if (id == 'sdr' || id == 'atendimento') {
      for (var i = 0; i < 3; i++) {
        final x = i.isEven ? -52.0 : -23.0;
        c.drawRRect(
          RRect.fromRectAndRadius(
            Rect.fromLTWH(x, -24 + i * 19, 73, 13),
            const Radius.circular(5),
          ),
          i == 1 ? accent : faint,
        );
      }
    } else if (id == 'genesis') {
      for (var i = 0; i < 6; i++) {
        final a = i * math.pi / 3;
        final pos = Offset(math.cos(a) * 34, math.sin(a) * 25 + 2);
        c.drawLine(Offset.zero, pos, linePaint);
        c.drawCircle(pos, 7, i.isEven ? accent : faint);
      }
      c.drawCircle(Offset.zero, 9, accent);
    } else {
      for (var i = 0; i < 6; i++) {
        final h = 12 + rng.nextDouble() * 39;
        c.drawRRect(
          RRect.fromRectAndRadius(
            Rect.fromLTWH(-50 + i * 17, 30 - h, 10, h),
            const Radius.circular(2),
          ),
          i.isEven ? accent : faint,
        );
      }
    }
    c.restore();
  }

  void tile(Canvas c, Offset o, double radius, double depth) {
    final path = Path()
      ..moveTo(o.dx, o.dy - radius * .5)
      ..lineTo(o.dx + radius, o.dy)
      ..lineTo(o.dx, o.dy + radius * .5)
      ..lineTo(o.dx - radius, o.dy)
      ..close();
    c.drawPath(
      path,
      Paint()
        ..shader = const LinearGradient(
          colors: [Color(0xffe5c98c), Color(0xff65583e)],
        ).createShader(path.getBounds()),
    );
    final side = Path()
      ..moveTo(o.dx - radius, o.dy)
      ..lineTo(o.dx, o.dy + radius * .5)
      ..lineTo(o.dx + radius, o.dy)
      ..lineTo(o.dx + radius, o.dy + depth)
      ..lineTo(o.dx, o.dy + radius * .5 + depth)
      ..lineTo(o.dx - radius, o.dy + depth)
      ..close();
    c.drawPath(side, Paint()..color = const Color(0xff716047));
  }

  @override
  bool shouldRepaint(covariant _SolutionPainter oldDelegate) =>
      oldDelegate.id != id;
}

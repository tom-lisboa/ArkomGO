import 'package:flutter/widgets.dart';

class ClipsPlayer extends StatelessWidget {
  final String url;
  const ClipsPlayer({super.key, required this.url});

  @override
  Widget build(BuildContext context) =>
      const Center(child: Text('Prévia do vídeo'));
}

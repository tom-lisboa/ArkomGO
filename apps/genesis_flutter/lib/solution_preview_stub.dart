import 'package:flutter/widgets.dart';

class SolutionPreview extends StatelessWidget {
  final Map<String, String> files;
  const SolutionPreview({super.key, required this.files});
  @override
  Widget build(BuildContext context) =>
      const Center(child: Text('Prévia interativa da solução'));
}

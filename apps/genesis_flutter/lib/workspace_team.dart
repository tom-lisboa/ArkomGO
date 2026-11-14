import 'package:material_ui/material_ui.dart';

import 'visuals.dart';

typedef TeamMember = ({
  String id,
  String name,
  String role,
  IconData icon,
  int? gopher,
});

const workspaceSquads = [
  (
    name: 'Vendas',
    description: 'Acompanhe conversas, qualifique interessados e organize oportunidades.',
    icon: Icons.forum_outlined,
    color: Color(0xffd7b678),
    members: <TeamMember>[
      (
        id: 'sdr',
        name: 'BIA SDR',
        role: 'Atendimento e qualificação',
        icon: Icons.headset_mic_outlined,
        gopher: 1,
      ),
      (
        id: 'crm',
        name: 'CRM Arkom',
        role: 'Contatos e oportunidades',
        icon: Icons.people_outline,
        gopher: null,
      ),
    ],
  ),
  (
    name: 'Conteúdo',
    description: 'Transforme vídeos em cortes verticais e crie GIFs.',
    icon: Icons.movie_outlined,
    color: Color(0xffb29cdd),
    members: <TeamMember>[
      (
        id: 'clips',
        name: 'Luma',
        role: 'Produção de cortes e GIFs',
        icon: Icons.movie_outlined,
        gopher: 2,
      ),
    ],
  ),
  (
    name: 'Operações',
    description: 'Acompanhe empreendimentos, cotistas, contratos e recebíveis.',
    icon: Icons.apartment_outlined,
    color: Color(0xff8ac6ac),
    members: <TeamMember>[
      (
        id: 'multipropriedades',
        name: 'Maia',
        role: 'Gestão de empreendimentos e cotas',
        icon: Icons.apartment_outlined,
        gopher: 3,
      ),
    ],
  ),
];

bool workspaceMemberAvailable(Map<String, dynamic>? solution) =>
    solution?['implemented'] == true && solution?['configured'] == true;

class TeamAvatar extends StatelessWidget {
  final TeamMember member;
  final Color color;
  final double size;

  const TeamAvatar({
    super.key,
    required this.member,
    required this.color,
    required this.size,
  });

  @override
  Widget build(BuildContext context) => Container(
    width: size,
    height: size,
    decoration: BoxDecoration(
      color: color.withValues(alpha: .09),
      border: Border.all(color: color.withValues(alpha: .2)),
      shape: BoxShape.circle,
    ),
    child: member.gopher == null
        ? Icon(member.icon, size: size * .46, color: color)
        : ExcludeSemantics(
            child: Gopher(index: member.gopher!, size: size),
          ),
  );
}

class WorkspaceTeam extends StatelessWidget {
  final List<Map<String, dynamic>> solutions;
  final ValueChanged<String> onOpen;

  const WorkspaceTeam({
    super.key,
    required this.solutions,
    required this.onOpen,
  });

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      for (final squad in workspaceSquads)
        Container(
          margin: const EdgeInsets.only(bottom: 14),
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: panel,
            border: Border.all(color: line),
            borderRadius: BorderRadius.circular(18),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Icon(squad.icon, color: squad.color, size: 20),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      squad.name,
                      style: const TextStyle(
                        fontSize: 19,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 7),
              Text(
                squad.description,
                style: const TextStyle(fontSize: 13, height: 1.5, color: muted),
              ),
              const SizedBox(height: 14),
              for (final member in squad.members)
                Padding(
                  padding: const EdgeInsets.only(bottom: 5),
                  child: memberTile(member, squad.color),
                ),
            ],
          ),
        ),
    ],
  );

  Widget memberTile(TeamMember member, Color color) {
    final solution = solutions.where((s) => s['id'] == member.id).firstOrNull;
    final available = workspaceMemberAvailable(solution);
    return Material(
      color: const Color(0xff191b1e),
      borderRadius: BorderRadius.circular(12),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: available ? () => onOpen(member.id) : null,
        child: Padding(
          padding: const EdgeInsets.all(11),
          child: Row(
            children: [
              TeamAvatar(member: member, color: color, size: 38),
              const SizedBox(width: 11),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      member.name,
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      available
                          ? member.role
                          : (solution?['reason'] as String? ??
                                'Indisponível para esta conta.'),
                      style: const TextStyle(fontSize: 12, color: muted),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 10),
              Icon(
                available ? Icons.arrow_forward : Icons.lock_outline,
                color: available ? color : muted,
                size: 17,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

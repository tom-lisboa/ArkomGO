# Clínica — confirmação de consultas

Se a empresa também quiser adaptar a Bia no atendimento por texto, consulte `GET /v1/core/business`. Mostre a opção apenas se `bia_presets` incluir `clinica-v1`. Se o administrador escolher este perfil, use a configuração existente em Conhecimento do negócio. Salve o perfil completo no rascunho com `bia_preset: "clinica-v1"` e peça ao administrador que confira e publique. A escolha vem do cadastro publicado da empresa.

Combine esta ficha com `ligacao-ia.md`. Monte a tela quando a clínica pedir. Esta aplicação trata da rotina administrativa de recepção.

## Pergunte à clínica

- Como a recepção se apresenta e quem cuida das remarcações.
- Onde está a fonte de horários confirmados, qual é o fuso e como a equipe recebe os retornos.
- Se o painel precisa de ligação de teste, histórico de ligações e atalho para a equipe assumir.

## Campos e fluxo sugeridos

1. Deixe o administrador escolher nome do assistente e saudação. Exemplo: “Olá, sou a assistente virtual da recepção. Posso falar com você sobre seu horário?”
2. Mostre, quando a integração autorizada retornar, apenas primeiro nome, data, hora e situação do agendamento. Confirme quem atendeu antes de mencionar o horário. Se a agenda não estiver disponível, indique “Recepção precisa confirmar o horário”.
3. Use o teste e o histórico da skill com o mesmo backend. Mostre separadamente o estado técnico da ligação e a confirmação da consulta. Em caso de pedido de remarcação, mantenha a ação na recepção, a menos que exista um contrato de agenda ativo que execute a alteração e devolva a confirmação.
4. Nas instruções da IA, mantenha a conversa em logística. Encaminhe dúvidas de saúde à equipe responsável. Não solicite sintomas, exames, diagnósticos, documentos ou detalhes de tratamento como parte da confirmação. Use só dados fictícios nos exemplos.
5. O SDR pode aproveitar mensagens recentes ao ligar a partir de uma conversa. Se a conversa contém dados clínicos desnecessários para a ligação, mantenha esse caso no atendimento humano.

Verifique a disponibilidade da agenda no ambiente antes de exibir qualquer ação de consulta ou reserva. A voz do piloto não altera agendamentos por si só.

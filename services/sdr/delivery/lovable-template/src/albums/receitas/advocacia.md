# Advocacia — primeiro contato com o escritório

Se a empresa também quiser adaptar a Bia no atendimento por texto, consulte `GET /v1/core/business`. Mostre a opção apenas se `bia_presets` incluir `advocacia-v1`. Se o administrador escolher este perfil, use a configuração existente em Conhecimento do negócio. Salve o perfil completo no rascunho com `bia_preset: "advocacia-v1"` e peça ao administrador que confira e publique. A escolha vem do cadastro publicado da empresa.

Combine esta ficha com `ligacao-ia.md`. Monte a tela quando o escritório pedir. O fluxo serve para organizar retornos e confirmar conversas.

## Pergunte ao escritório

- Como o assistente deve se apresentar, qual equipe recebe os retornos e em que momento ela assume.
- Quais categorias administrativas o escritório usa, por exemplo primeiro atendimento ou retorno.
- Se já há uma agenda autorizada e quais controles o escritório quer acompanhar no painel.

## Campos e fluxo sugeridos

1. Deixe o administrador escolher nome, saudação e orientações da chamada. Exemplo: “Olá, sou a assistente virtual do escritório. É um bom momento para confirmar sua conversa com a equipe?”
2. Use primeiro nome e tipo de retorno, se já estiverem em contexto autorizado. Mostre data e hora apenas quando vierem da agenda autorizada. Sem essa informação, direcione o contato à equipe.
3. Use as mesmas APIs para teste e histórico. Inclua acesso ao controle humano da conversa. Exiba ligação concluída separadamente de reunião confirmada e de qualquer decisão sobre o caso.
4. Oriente a IA a encaminhar prazos, estratégias, dúvidas jurídicas e pedidos de envio de documentos a uma pessoa. Restrinja o fluxo inicial à logística, sem solicitar CPF, número de processo, detalhes do caso ou documentos.
5. O SDR pode aproveitar mensagens recentes ao ligar a partir de uma conversa. Quando houver informações confidenciais do caso no histórico, mantenha o contato no atendimento humano.

O histórico de voz do piloto registra o estado da chamada. Se o escritório quiser registrar o resultado administrativo, use um fluxo já suportado pela API ou mantenha o registro com a equipe.

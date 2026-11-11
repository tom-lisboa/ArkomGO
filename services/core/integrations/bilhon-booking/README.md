# Formulário de agendamento da Bilhon

Correção para a página `diagnostico.bilhon.com/agendar-reuniao`. A faixa de horários usava Brasília mesmo após trocar o fuso no calendário. Além disso, o SDK limpava o horário selecionado quando o fuso mudava com o formulário aberto e ignorava o próximo envio.

- A faixa mostra os horários no fuso do calendário. O horário continua identificado pelo mesmo instante do ClickMax.
- Para trocar o fuso na ficha, use **Alterar horário ou fuso**. O calendário volta e o SDK preserva os dados preenchidos.
- A ficha pede nome, e-mail e celular. A opção de WhatsApp começa desmarcada; quando marcada, envia `SIM` no mesmo campo do ClickMax. A mudança só é aplicada quando o resumo da agenda confirma o campo de consentimento esperado. Nenhum disparo, webhook ou regra de consentimento no servidor é alterado.

Para aplicar no projeto que publica a página:

```sh
python3 integrations/bilhon-booking/apply.py caminho/agendar-reuniao.html /tmp/agendar-reuniao-corrigido.html
```

O script interrompe se a estrutura esperada tiver mudado. Revise o diff no projeto de origem e publique uma prévia. Valide o caminho em um celular e no desktop, trocando de Cuiabá para Lisboa, voltando da ficha para trocar novamente e enviando com a opção de WhatsApp marcada e desmarcada em uma agenda de teste. Compare a hora da faixa, do calendário e da reserva.

O teste local `verify.cjs` usa o SDK público com respostas simuladas; não cria agendamentos reais. O diretório de teste deve conter `booking.html` (original), `booking-fixed.html` (saída do script) e `sdk.js` (SDK do ClickMax). Instale `jsdom@26` em um diretório de teste e execute `node verify.cjs <diretório>` com o `NODE_PATH` apontando para os módulos desse diretório.

## Formulário antes do agendamento

A primeira etapa pertence ao fluxo de diagnóstico. O navegador usa o Worker `funil-aplicacao-porta` para salvar e classificar as respostas. Remover perguntas dessa tela exige revisar também as regras do Worker para que a pessoa ainda chegue à agenda correta.

Proposta: nome, WhatsApp e e-mail para contato; empresa, faixa de faturamento e objetivo apenas onde forem usados para qualificar ou preparar a reunião. Remover site e tamanho da equipe da parte obrigatória após conferir a classificação. Levar o nome, o e-mail e o celular já informados para a ficha do ClickMax, com opção de editar. Quando houver reserva, a Bia usa data e duração da agenda e aproveita os dados já coletados, sem repetir a triagem.

Separar a mensagem de campo inválido, a falha de conexão e o horário que acabou de ser ocupado. Usar o fuso selecionado na reserva também na confirmação: o SDK envia `tz`, mas o fluxo atual que entrega a reserva à Bia precisa disponibilizar esse valor para preencher `timezone` no webhook.

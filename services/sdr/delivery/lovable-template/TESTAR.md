# Primeiro teste do SDR Next

Abra https://24.199.100.186/sdr-next/ . O mesmo backend atende a interface personalizada no Lovable.

## 1. Entre com a empresa fictícia

Escolha Alfa e o perfil Administrador. Use o código entregue separadamente no arquivo privado de acessos do piloto. Não envie esse arquivo ao Lovable ou ao repositório. Ao terminar, Trocar empresa encerra a sessão da interface.

## 2. Confira o que o cliente controla

Em Conhecimento do negócio, confira as fontes, regras e ofertas fictícias. Os dados publicados alimentam o atendimento. Salvar rascunho não altera a base usada pela IA; Publicar aplica a nova versão e invalida trabalhos pendentes que dependiam da anterior. Para esse primeiro teste, pode consultar sem publicar nada.

Em Conversas, clique em Nova conversa de teste. Envie:

> Olá! Sou Marina, da Oficina Horizonte. Temos dois vendedores e usamos planilhas. Qual o preço do plano Essencial e da implantação?

Espere alguns segundos para o agrupamento das mensagens e o processamento. Na base inicial da Alfa, o plano custa R$ 490 por mês e a implantação custa R$ 990. Se você editar e publicar a oferta, o valor esperado passa a ser o publicado.

Confira os dados conhecidos do contato. Depois envie:

> Correção: meu nome é Beatriz, não Marina. A empresa continua sendo Oficina Horizonte.

Confira a atualização do nome. Pause a Bia e envie outra mensagem de teste: a mensagem deve ser registrada sem uma nova resposta automática. Retome somente quando quiser testar mais uma entrada.

## 3. Confira pedidos e aprovações

Em Execuções, escolha Preparar proposta e Testar sem alterar dados. Informe um nome fictício e inicie o teste. Acompanhe as etapas e os preços da oferta publicada; a proposta não é enviada.

Depois escolha Pausar e registrar motivo. Teste primeiro sem efeitos. Para conferir a aplicação, use uma conversa recém-criada e escolha Aplicar no piloto. O pedido deve aguardar aprovação; confira o motivo e aprove como administrador. A conversa será pausada, e a nota interna aparecerá no resultado. Exportar baixa o registro do pedido.

O operador pode solicitar os fluxos autorizados, mas a pausa inicial exige aprovação do administrador. O perfil Consulta não executa. Cancelar ou pausar uma execução interrompe etapas pendentes; não desfaz etapas concluídas.

## 4. Confira a separação entre empresas

Troque para Beta, com o código próprio. Crie outra conversa e pergunte o preço das aulas em grupo. Na base inicial, a escola fictícia cobra R$ 280 por mês. O histórico e os dados conhecidos da Alfa não devem aparecer. Os gatilhos automáticos vêm desligados; só os habilite se quiser testar esse comportamento.

## 5. Teste no Lovable

Envie à pessoa responsável apenas `sdr-next-remix.zip`. Leia o README e LOVABLE.md dentro dele. Após importar, repita o login e os testes acima pelo preview do Lovable. Pode personalizar as telas preservando o cliente da API. Confira também um Remix limpo: ele começa sem sessão e usa a empresa autorizada pelo código informado. Não cria uma empresa nova automaticamente.

O teste dentro de um projeto real Lovable continua pendente até essa importação. Um problema de login/origem deve ser corrigido na integração, sem remover as permissões do servidor.

## O que já funciona e o que falta

IA real, memória do atendimento, negócio versionado, pedidos processados em Go, aprovações e auditoria estão ativos no piloto. A conexão QR/código é real e exige confirmação do responsável no celular. O atendimento WhatsApp real de texto depende de ativar os contatos autorizados após parear. Veja o roteiro WHATSAPP.md: parear sozinho mantém as respostas automáticas desligadas. A homologação automática não envia mensagens reais.

Use somente dados e conversas fictícios. O piloto tem limite de 40 conversas de teste e 200 execuções por empresa. Criar compradores/novas empresas, autenticação comercial e áudio/anexos no WhatsApp são etapas pendentes.

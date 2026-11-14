# SDR Arkom: produto existente e migração Flutter

O produto de referência é o SDR Next de `services/sdr`, com cliente em
`services/sdr/delivery/lovable-template`. Ele mantém os dados, a IA, as permissões
e os workers no Go da Arkom. O Lovable personaliza a interface consumindo esses
contratos. A Bia interna de `services/core` é outra instalação e não é utilizada
por essa entrada do catálogo.

## Acesso local corrigido

`/demo/systems` → `/demo/systems/sdr` → **Acessar sistema** → `/demo/sdr`.
O último endereço abre `SDRProduct`, reutilizando o cliente existente em
`apps/agents/bia/src/runtime/LabApp.tsx`. A entrada é a aba WhatsApp,
como no template Lovable. As abas permanecem dentro do produto, sem redirecionar
para superfícies reduzidas da plataforma.

Ficam acessíveis WhatsApp, Conhecimento do negócio, Conversas, Automações,
Execuções, CRM, Agendas, Meus dados (administrador), Auditoria (administrador) e
Álbuns. Os álbuns preservam Skills e Profissões, capturas e os pedidos para o
Lovable. O painel padrão de voz fica oculto nesse modo, como no template; a ficha
Ligação por IA continua no álbum. Visitar uma ficha não habilita uma capacidade.

O cliente usa `demoSession()` e `/api/demo/backend`, mantendo a sessão em memória
e as credenciais no servidor. Não aponta para a instalação comercial hospedada.
O fluxo local simplificado de entrada não implementa cadastro comercial nem SSO
com o Lovable.

## Migração e disponibilidade

A tela anterior `SDRWorkspace` em Flutter era um recorte de conversas, sem
paridade com o produto. Ela não é mais o destino de `/demo/sdr`. Catálogo e
detalhes continuam em Flutter. O módulo SDR preserva temporariamente seu cliente
React: sua migração precisa incluir todas as jornadas existentes e os controles
de permissões, revisão, idempotência e confirmação de resultado.

Exibir as telas não ativa serviços. O WhatsApp local ainda depende de configurar
o transporte; Google OAuth e demais capacidades dependem das flags e conexões do
ambiente. O catálogo autenticado informa `product_capabilities` para CRM,
Agendas e Meus dados. As abas não habilitadas ficam desativadas com cadeado;
essa informação não substitui a autorização do servidor. Esta
correção não pareia números, envia mensagens, habilita voz ou publica fluxos.

O Remix automático ainda não está conectado. O template e as receitas existentes
continuam sendo a base da interface destinada ao Lovable. Não se deve confundir
o pedido de personalização de uma ficha com a criação automática de um projeto.

## Referência visual: os álbuns

O módulo SDR aplica o papel claro, a tinta escura, os títulos serifados, as ações
em verde e as bordas dos álbuns às telas operacionais. `SDRNavigation` apresenta
WhatsApp, Conversas, Meu negócio e Álbuns antes das configurações avançadas. O
menu rola dentro do próprio espaço em telas estreitas. A navegação externa da
Arkom continua sendo o hospedeiro do produto.

Essa etapa cobre o SDR existente, incluindo negócio, automações, execuções, CRM,
conversas e auditoria. Não representa a conclusão da migração visual de todos os
módulos Flutter da plataforma. O componente e os estilos ficam em `SDRProduct`,
`SDRNavigation` e `sdr-product.css`.

## Verificar localmente

Com a demo iniciada pelo launcher padrão:

```sh
(cd apps/agents/bia && npm run build)
```

O teste percorre catálogo, detalhes, entrada no produto, álbuns e suas fichas,
leitura do CRM DEV, abas operacionais e layouts de 1440 e 390 pixels. Confere que
Agendas e Meus dados ficam bloqueados no launcher padrão, que não inicializam e
que navegar não executa escritas comerciais. A sessão de teste fica em memória;
as capturas ficam em `.local/ui-review`, fora do Git. O teste não envia mensagens
nem solicita geração por IA.

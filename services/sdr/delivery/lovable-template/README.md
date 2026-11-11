# Versão candidata 0.13 · Agendas e Google preparado

Esta candidata inclui agendas próprias, comparação de várias agendas, permissões por agente, aprovação, reserva/remarcação/cancelamento e o conector Google preparado. **Ainda não foi implantada no piloto online. O Google depende de domínio HTTPS e projeto OAuth a configurar.**

Leia `AGENDAS.md`. Preserve `src/calendar-api.ts` e `src/CalendarConsole.tsx`. O backend e os tokens permanecem na nossa plataforma; no Lovable, o cliente configura suas regras e personaliza as telas. Nenhum segredo Google deve ser incluído no projeto ou no chat. O novo processo de agenda é interno à nossa infraestrutura.

O pacote é `SDR-Next-Lovable-v0.13.0-candidato.zip`; o ZIP 0.11.1 já entregue aos testadores permanece válido para a versão online anterior. As notas das versões anteriores abaixo explicam as capacidades herdadas.

---

# Versão candidata 0.12 · Meus dados e GraphQL

Esta cópia contém a etapa de dados por cliente. **Ela ainda depende de implantação e ativação do backend novo; o piloto online e o ZIP 0.11.1 distribuído não foram alterados.** Não encaminhe esta candidata como atualização já ativa para os testadores.

A nova tela Meus dados permite ao administrador solicitar e baixar uma exportação privada da empresa. Leia `DADOS-DO-CLIENTE.md` e `customer-schema.graphql`. Preserve `src/customer-api.ts`, o login externo e os controles por empresa. Personalização continua no Lovable; conhecimento, memória, processamento e arquivos continuam na plataforma Go.

Para importar esta candidata em um teste técnico: use `SDR-Next-Lovable-v0.12.0-candidato.zip`, preservando o backend externo em https://sdk.arkom.ai/sdr-next . A função Meus dados informa indisponibilidade até a atualização do backend. As instruções anteriores abaixo descrevem a base 0.11 e suas funções já entregues.

---

# Interface Lovable · WhatsApp e mídias 0.11.0

Esta é a versão 0.11.0 da interface do SDR Next, com entrada direta na tela WhatsApp após o login. O fluxo usa conexão por QR ou código pelo número, contatos autorizados e acompanhamento no painel. API, workers Go, armazenamento e chaves ficam no servidor da empresa. Há duas empresas fictícias e acesso por código entregue separadamente.

## Importar e testar

1. Use SDR-Next-Lovable-v0.11.0.zip. Importe como novo projeto de teste no Lovable e confira a compilação/preview. Ao atualizar uma cópia anterior, use o src/main.tsx deste pacote como entrada da aplicação e siga ATUALIZAR-FRONT.md.
2. Leia LOVABLE.md e preserve src/api.ts e src/platform-api.ts. A API já aponta para https://sdk.arkom.ai/sdr-next .
3. Entre com empresa, perfil e código no formulário do aplicativo. Nenhum código faz parte do pacote.
4. Siga TESTAR.md para o chat, configuração do negócio, execuções e aprovações. Para o WhatsApp real de texto, siga WHATSAPP.md.
5. Só depois de validar o preview, configure o compartilhamento/Remix no Lovable e teste uma cópia limpa, sem sessão anterior.

O primeiro teste em um projeto real Lovable ainda depende dessa importação. Remix copia a interface: não cria uma nova empresa nem copia sessão ou chaves. Autenticação comercial e cadastro automático de compradores são etapas pendentes.

## WhatsApp de texto

A conexão por QR/código continua na mesma tela. O administrador pode ativar atendimento real para até três outros números de teste autorizados. Vem desligado. Conversas fictícias continuam separadas; a entrada de mensagem simulada não funciona em conversa real. Grupos, histórico anterior, áudio e anexos não são processados. Estados reais de envio mostram fila, em envio, enviado, cancelado ou não confirmado. Uma mensagem já em envio pode concluir depois de uma pausa; não confirmadas não são reenviadas automaticamente.

## Desenvolvimento

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run dev
npm run build
```

Use as capacidades e allowed_actions retornadas pela API. Preserve Idempotency-Key ao confirmar uma requisição incerta e as revisões esperadas. Não substituir dados por mocks/localStorage, não criar Supabase/Edge Functions nem incluir chave OpenAI/WhatsApp. As origens Lovable aprovadas são autorizadas pelo backend, junto com sessão e perfil.

Importação: https://lovable.dev/free-import . APIs externas: https://docs.lovable.dev/integrations/any-api .

## Mídias

Leia MIDIAS.md. O administrador permite mídias na tela WhatsApp. Áudios, imagens e PDF entram no mesmo contexto dos textos; arquivos enviados pela equipe são preparados antes do envio. Preserve MediaComposer.tsx, MediaAttachment.tsx e media-api.ts, as permissões e a confirmação com a mesma chave em uploads incertos. Não substitua os downloads autenticados por URLs de provedor.

Fluxos criados pelo cliente: use `src/media-flows.ts` e `FLUXOS-DE-MIDIA.md`. `media.send` permite envio imediato ou agendado sem tela fixa. Não substituir configuração existente nem enviar ao importar um componente. A etapa concluída confirma fila; acompanhar entrega pelo message_id. Preparar arquivo reutilizável em `/v1/sdr/media` não exige assumir conversa. Anexos da rota de conversa continuam restritos àquela conversa.

Pacote 0.11: consulte NOVIDADES-0.11.md. A coleta de uso dos workers é interna da plataforma, não exige Edge Function nem acesso do Remix ao painel global. Não adicionar chaves internas ao cliente.

## Álbuns em cada Remix

A aba **Álbuns** reúne **Ligação por IA**, **Agendamento**, **Follow-up** e **Atendimento no WhatsApp** em Skills e os playbooks **Clínica** e **Advocacia** em Profissões. As capturas do SDR são de demonstração, e o exemplo de autorização no WhatsApp vem da Twilio. As receitas acompanham o código em `src/albums/receitas/`.

Quando a empresa decidir construir, ela pode pedir no chat do Lovable: “Leia a seção Álbuns de Skills e Profissões do LOVABLE.md e use a ficha Ligação por IA com o playbook Clínica para desenhar minha tela.” O backend Go da Arkom continua executando e validando as ações.

# Incidentes de acesso no CLIPS e geração de imagens no SOCIAL

06/11/2026. Investigação de código e reprodução local. Os dois produtos usam identidade e organizações do projeto central, mas os sintomas aparecem em etapas diferentes.

| Produto | Etapa observada | Evidência | O que falta confirmar |
|---|---|---|---|
| CLIPS | Login no preview de um remix criado pelo sistema | O código do app valida a senha antes de resolver a organização. A conta oficial existe e está confirmada no central. O [PR #10](https://github.com/Bilhon-OS/arkom-clips/pull/10) documenta um caso anterior em que um remix com Lovable Cloud autenticava no projeto errado. A correção foi mesclada em 27/10. | Qual Supabase recebeu a tentativa do preview atual. A dificuldade relatada pela Inova ainda precisa ser classificada pela mensagem e pela etapa da falha. |
| SOCIAL | Geração de imagem depois de autenticar | O código publicado de `social_openai-image` e `social_creative-image` ordena as associações por `created_at` e usa a primeira. A escolha ignora `x-org-id` e não verifica se aquela associação corresponde ao SOCIAL antes da reserva de cota. | Identificar a função, o horário e o texto exato de um caso real. O código da reserva de cota e os vínculos do cliente ainda precisam ser correlacionados com o caso. |

## Reprodução do SOCIAL

Os dois handlers publicados foram executados localmente com Auth, consultas e cota simulados. Um usuário fictício tinha vínculo antigo com uma organização de outra solução e vínculo novo com a organização do SOCIAL. Mesmo com a organização SOCIAL informada na requisição, ambos selecionaram a organização antiga. Quando a reserva simulada rejeitou essa organização com `42501`, as duas funções retornaram HTTP 403 com **“Sua organização não possui acesso ativo ao Social.”**

Em cada handler também foram verificados dois controles. Sem associação, a função retornou outro 403, **“Sua conta não está vinculada a nenhuma organização.”** Com a organização correta e a cota simulada esgotada, retornou 429 com `quota_exceeded`. Os seis casos passaram e nenhum chamou o provedor de imagem.

## Escopo da correção a homologar

- **CLIPS.** Conferir qual build o sistema usa como origem dos remixes novos e qual hostname o preview chama em `/auth/v1/token`. Se o preview apontar ao backend errado, aplicar a correção no template que o sistema realmente usa e verificar um remix isolado com conta fictícia. Para remixes existentes, confirmar como atualizar a conexão preservando o projeto. Um novo remix em produção exige decisão do responsável, pois pode afetar a entrega do cliente. Seguir o [roteiro de login](clips-triagem-login-e-piloto.md).
- **SOCIAL.** Nas duas funções de imagem, resolver a organização do workspace escolhido pelo usuário. Validar a associação e o direito ao SOCIAL no servidor antes de usar a organização para cotas ou arquivos. Se o cliente do app enviar `x-org-id`, atualizar também a lista de cabeçalhos aceitos no preflight. Quando não houver contexto explícito, a alternativa precisa resolver uma única organização elegível para o SOCIAL. Uma escolha ambígua deve retornar um erro próprio, sem selecionar a associação mais antiga. Preservar a verificação de cota existente.
- **Aceite em homologação.** Testar usuário com uma organização, usuário com vários vínculos, organização de outra solução, organização fora da associação, falta de vínculo, acesso SOCIAL ausente e cota esgotada. A organização correta deve ser usada para geração e contabilidade de cota. Nenhum caso deve exigir alteração de identidade ou permissão compartilhada de outro produto.

O repositório do SOCIAL não estava visível à conta GitHub conectada. A análise usou as duas funções publicadas em leitura. Para implementar a mudança sem divergir da fonte, localizar o repositório do SOCIAL ou o workspace que publica essas funções. Nenhum ajuste foi aplicado em produção.

# CLIPS Go — cadastro individual e ponte de autenticação

## Escopo da etapa 2

O cadastro autorizado é localizado pelo e-mail oficial no Supabase `solutions`, usando uma consulta somente de leitura. A consulta retorna o identificador do usuário, nome, confirmação do e-mail, bloqueio e o vínculo ativo de CLIPS. Não consulta senha, hash de senha, refresh token nem sessões existentes.

Na homologação do CLIPS Go, o cadastro tem um identificador próprio e um espaço de trabalho próprio. O vínculo guarda o projeto de origem, UUID do usuário, organização e instância CLIPS exatos. O provisionamento é transacional e repetível: não duplica o cadastro nem troca automaticamente um vínculo divergente. Nenhuma associação de outra solução é modificada. Não são enviados e-mails ou convites.

Essa etapa preparou a identidade no backend. A [etapa seguinte conectou e publicou a interface oficial em homologação](clips-go-interface-homologacao.md). O histórico de vídeos ainda não foi transferido e o desaparecimento do erro original de login ainda depende da tentativa interativa do cliente.

## Resultado em 06/11/2026

A conta oficial do cliente foi encontrada com e-mail confirmado, sem bloqueio e com uma instância ativa do CLIPS. O cadastro individual e o workspace foram gravados na homologação, no release `r-1a83d4806563`. A verificação confirmou o vínculo exato com a origem. Nenhuma sessão do cliente foi extraída ou criada para o operador.

O HTTPS recusou acesso anônimo, cookie fabricado, token com assinatura falsa e origem indevida. A limitação de tentativas respondeu como esperado. O fluxo técnico de exportação continuou gerando um MP4 real após a atualização. O container do Postgres e os 25 containers das outras soluções foram preservados.

O cadastro foi incluído no backup da homologação e na verificação de restauração em banco temporário, junto do MP4 de teste. As evidências privadas ficam em `.local/clips-identity` e `.local/clips-deployment`; não integram o repositório. O login interativo desse cliente ainda não foi testado.

## Como preservar o login existente

O navegador deve autenticar no Supabase central correto e entregar o access token a `POST /auth/session` no mesmo domínio da interface nova. O Go verifica esse token com o servidor Auth de origem, usando somente a chave pública. Essa verificação faz uma requisição ao Auth e permite basear a autorização na identidade retornada, conforme a [documentação oficial de getUser](https://supabase.com/docs/reference/javascript/auth-getuser).

Somente um UUID e e-mail já cadastrados e habilitados podem abrir sessão local. Um e-mail informado, um token adulterado ou uma conta válida de outra pessoa não concedem acesso. A organização do cliente não é escolhida por cabeçalho nem pela primeira associação encontrada.

Após essa validação, o Go emite um cookie próprio, `Secure`, `HttpOnly`, `SameSite=Strict`, restrito ao hostname. A sessão dura uma hora; o banco guarda somente o hash do segredo aleatório. Logout invalida a sessão daquele navegador. Outros dispositivos continuam ativos, até o limite de dez sessões. Desabilitar o cadastro local corta o acesso imediatamente. Mudanças no usuário de origem são verificadas na próxima troca de sessão; a sessão local existente pode permanecer válida por até uma hora.

A troca pública é limitada a uma tentativa a cada seis segundos, com somente uma consulta em andamento. Rotas da equipe continuam exigindo seu token técnico. O cookie técnico do piloto não autentica clientes. Projetos novos ficam ligados ao identificador estável da conta, mantendo a propriedade após sair e entrar novamente.

**Dependência temporária:** o Supabase continua sendo o provedor de identidade. A senha não foi migrada e a autenticação ainda não é independente. Essa ponte evita uma troca de senha, mas não corrige uma senha realmente incorreta nem substitui a investigação do incidente original.

## Contrato para integrar a interface oficial

Preservar telas, componentes, estilos e design system do repositório `Bilhon-OS/arkom-clips`. Publicar a interface no mesmo domínio do backend ou configurar um proxy de mesma origem. Não habilitar CORS genérico nem enviar o token técnico da equipe ao navegador.

1. Autenticar pelo Supabase central com a jornada existente.
2. Enviar `POST /auth/session`, com `Content-Type: application/json` e `Authorization: Bearer <access token>`.
3. Usar `GET /auth/me` para obter a conta e o workspace local. O backend trata a identidade; parâmetros fornecidos pelo cliente não substituem esse vínculo.
4. Enviar projetos novos por `POST /studio/jobs`; consultar o estado e o download pelas rotas existentes, com cookie de sessão.
5. Sair com `POST /auth/logout`. Ao expirar a sessão, repetir a troca usando uma sessão de origem ainda válida.

A tela pública de login agora está no hostname de homologação, no modo `clips-go`. O modo anterior `clips-homolog` e seu adaptador local continuam sendo testes separados; não são usados nessa publicação. A interface publicada acessa os dados locais pela sessão Go, com um contrato restrito de compatibilidade com o SDK; o envio de projetos usa `/app/projects` e a fila já existente.

## Verificação e operação

O teste `pilots/clips/verify-identity-local.py` cria Postgres e Supabase Auth GoTrue descartáveis. Ele testa senha e token reais de uma conta fictícia, troca por sessão Go, recusa de assinatura adulterada, cadastro repetido, conflitos de vínculo, contas não habilitadas, expiração, logout, bloqueio local, origem indevida e isolamento de projetos. O teste nunca usa a senha do cliente.

A atualização de homologação usa `pilots/clips/deploy/update.py`. Ela exige fila vazia, faz backup, aplica apenas schema adicional e atualiza somente API e worker do CLIPS Go. Preserva o Postgres e compara os IDs dos demais containers. Conserva o release anterior para retorno.

`pilots/clips/deploy/provision-customer.py --email <email-oficial>` consome a evidência privada em `.local/clips-identity/source-account.json`, verifica o e-mail esperado e cria o vínculo no banco próprio. O resultado fica em `provisioned.json`, com acesso restrito neste Mac. `verify-customer.py` confere o vínculo publicado e a recusa de credenciais fabricadas. Ele não se passa pelo cliente nem cria uma sessão de acesso para o operador.

Após provisionar, gerar backup e executar `offsite-backup.py` e `verify-restore.py`. A restauração temporária verifica tanto o MP4 de teste quanto a presença do vínculo cadastrado. As limitações de capacidade e do backup externo permanecem descritas no [guia da instalação](../pilots/clips/deploy/README.md).

## Pendências para entregar o endereço ao cliente

- Interface oficial conectada e publicada, conforme o [registro da homologação](clips-go-interface-homologacao.md).
- Validar o fluxo completo com uma conta real de homologação e um remix gerado pelo sistema.
- Validar o login interativo do cliente sem solicitar que compartilhe sua senha.
- Migrar e conferir os dados e arquivos que ele precisa, antes de apresentar o ambiente como substituição completa.

O endereço já permite testar o novo ambiente com a conta habilitada. Até concluir as verificações restantes, ele não equivale à substituição completa da operação atual.

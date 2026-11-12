# Persistência mínima de dados da aplicação

Esta entrega permite salvar e recuperar **um documento JSON de até 16 KiB** por
empresa e aplicação. O documento permanece após encerrar a prévia e reiniciar o
serviço, usando o SQLite já existente da Arkom. Uma gravação substitui o documento
anterior; não há tabelas escolhidas pelo código gerado, consultas livres ou acesso
ao arquivo do banco.

## Uso pelo backend gerado

Novas construções recebem `backend/platform/data.go`, controlado pelo host:

```go
value, found, err := platform.LoadData(r.Context())
// found=false significa que esta aplicação ainda não salvou um documento.

err = platform.SaveData(r.Context(), json.RawMessage(`{"text":"Minha anotação"}`))
```

Use essas funções dentro de handlers e trate seus erros. Os testes de domínio podem
injetar `platform.DataStore` com `platform.WithDataStore`. `SaveData` prepara a
escrita da requisição; a confirmação durável acontece no host antes de devolver a
resposta ao navegador. O frontend precisa verificar o status recebido e tratar
falhas. Não inicie gravações em goroutines depois de retornar o handler.

A [anotação de referência](../packages/deeph/pkg/construction/testdata/note)
implementa salvar/recuperar pelo backend Go e mostra mensagens de erro na interface.
É uma fixture de verificação, não um projeto inserido automaticamente no estúdio.

## Identidade, versão e confirmação

O servidor escolhe o namespace a partir da sessão e do contrato selado:
`organização → application_id`. O código gerado recebe somente o documento daquela
aplicação e não fornece IDs de destino. Campos como `organization_id` ou
`application_id` dentro do JSON são apenas conteúdo, sem efeito sobre o isolamento.
Revisões da mesma aplicação compartilham o documento; aplicações diferentes não.
O formato do documento deve continuar compatível quando o código for revisado.
Não há migração automática do formato nesta entrega.

A cada chamada, o host envia uma cópia do documento pelo canal stdin/stdout já
isolado. O handler pode preparar uma alteração nesse snapshot. Apenas respostas
2xx podem produzir uma gravação. Erros, panic, timeout, prévia encerrada, contrato
divergente ou tentativa antiga não confirmam alterações.

Antes de gravar, o host verifica novamente o processo ativo, a identidade, a
integridade do contrato, o JSON e seu tamanho. Compara a versão lida com a atual
para impedir sobrescrita por uma chamada atrasada. O documento e o registro
`preview.data_saved` são persistidos na mesma transação. Se o commit falhar, os dados
anteriores são restaurados e o navegador recebe erro. Sem banco aberto, não há
confirmação de persistência. A prévia é encerrada em falhas de gravação para não
continuar usando memória que suponha uma escrita bem-sucedida.

O registro de auditoria identifica empresa, usuário, aplicação e versão do dado.
O conteúdo não é copiado para os traces de construção, referências dos agentes,
ZIP do código ou envelope HTTP do runtime. O handler ainda pode devolver os dados
da própria aplicação nas suas rotas, conforme necessário para a interface.

## Compatibilidade e limites

O manifesto v1 e a assinatura `NewHandler(platform.Tenant)` permanecem iguais.
A persistência do documento é uma função básica do host; não conecta capacidades
externas do catálogo. A execução continua sem rede, credenciais ou acesso direto
ao banco.

Revisões seladas anteriores, sem `platform/data.go`, continuam executando com o
adaptador anterior. Ao continuar ou retomar uma construção, os contratos do host
são atualizados nos arquivos usados e testados. Atualizações em um checkpoint
existente geram traces `file.written` atribuídos ao sistema, ligados à etapa atual.
Nenhuma revisão pronta antiga é modificada silenciosamente.

Variáveis comuns em memória continuam temporárias. A aplicação precisa usar
`LoadData`/`SaveData` para conservar um dado. Não há conversão automática do estado
em memória de aplicações anteriores. A persistência depende do arquivo SQLite da
demo; remover esse arquivo remove os dados junto com o restante do laboratório.

## Verificação

Os testes de API exercitam salvar/recuperar, reinício do serviço, empresas e
aplicações distintas, compartilhamento entre revisões, perfil de visualização,
JSON interno forjado, limites, falha de commit, ausência de banco, erro do handler,
processos encerrados e conflito de versão. Também verificam que dados não entram
nos arquivos/traces e que a auditoria só confirma gravações persistidas.

O job `runtime` do GitHub Actions compila e inicia a anotação Go de verdade em
Docker, salva o texto, encerra o processo e o serviço, reabre o mesmo SQLite,
inicia um novo processo e recupera o texto. O teste da calculadora continua
verificando execução de uma revisão sem o novo contrato de dados e o isolamento
de arquivos, rede e variáveis do host.

```sh
cd services/sdr
ARKOM_RUNTIME_INTEGRATION=true go test -run TestRuntimeIntegration -count=1 -timeout=7m .
```

Os testes usam código controlado e não chamam modelos pagos. O sandbox macOS do
chat não permite iniciar outro `sandbox-exec`; a execução real ocorre no Linux do
CI. Esta mudança não publica aplicações nem adiciona persistência de múltiplos
registros, filtros, migrações ou adaptadores comerciais.

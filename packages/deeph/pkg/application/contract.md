# Contrato de aplicação Arkom v1

Escreva application.json na raiz do projeto, junto de DESIGN.md. Exemplo:

```json
{
  "schema_version": "arkom.application.v1",
  "catalog_version": "arkom-capabilities-v1",
  "name": "Calculadora",
  "backend": "go",
  "entrypoint": "frontend/index.html",
  "routes": [{"method": "POST", "path": "/api/calculate", "operation_id": "calculate"}],
  "capabilities": []
}
```

Todos os campos são obrigatórios. Campos desconhecidos, nulos em coleções,
chaves duplicadas e versões desconhecidas são recusados. Nome: 1–100 caracteres.
Backend Go com módulo arkom.local/solution; entrada web frontend/index.html.
Até 32 rotas com método explícito GET/POST/PUT/PATCH/DELETE/HEAD/OPTIONS e caminho
sob /api/. Segmentos literais usam letras ASCII, dígitos, hífen ou sublinhado.
Parâmetros de um segmento usam {id}; identificadores e operation_id usam
[a-z][a-z0-9_]{0,63}. Sem barras finais, curingas, query strings, URLs externas,
segmentos vazios, escape percentual ou caminhos relativos. operation_id é único;
rotas conflitantes segundo net/http.ServeMux são recusadas.

capabilities é uma lista de até 16 IDs únicos do catálogo fornecido. Use [] quando
a aplicação não precisar de serviços Arkom. Declare somente as dependências reais.
Uma capacidade declarada é um requisito, não uma autorização ou integração ativa.
Não escreva identidade da empresa, credenciais, application_id ou revision neste
arquivo. O host atribui ID estável e revisão crescente à linhagem da aplicação.

O arquiteto declara o contrato. Backend, interface e revisor mantêm rotas e código
coerentes. O revisor precisa entregar um contrato válido e a entrada web existente.
A validação do manifesto não prova que um handler atende a rota: implementação e
comportamento devem ter testes Go. Para a prévia executável, use package solution
e func NewHandler(tenant platform.Tenant) http.Handler em backend/*.go. O host
cria o processo e fornece a empresa; a interface chama fetch nas rotas /api/
declaradas. Não abra portas nem crie main. Memória comum dura somente durante a
prévia. Para conservar um documento JSON de até 16 KiB, use platform.LoadData e
platform.SaveData com o contexto do handler; consulte reference/platform-data.go.
Para uma coleção de anotações/registros, use platform.CreateRecord e
platform.ListRecords; consulte reference/platform-records.go. Uma coleção por
empresa/aplicação, até 20 registros de 2 KiB de JSON canônico cada, um novo registro
por requisição. ID e data vêm do host; a listagem preserva a ordem de criação.
O documento anterior permanece separado. A confirmação depende do commit no host. Adaptadores de capacidades externas
ainda não estão disponíveis.

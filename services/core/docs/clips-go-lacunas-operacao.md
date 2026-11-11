# CLIPS Go — o que falta para substituir a operação

Verificação realizada em 06/11/2026. O endereço publicado é uma homologação funcional de login, upload pequeno e corte manual. Ainda faltam os recursos abaixo para apresentá-lo como substituição completa do CLIPS.

## Verificação do cliente na origem

A consulta somente de leitura confirmou a identidade já cadastrada e restringiu o levantamento à organização e à instância CLIPS exatas. Não leu senhas, sessões, chaves de fornecedores ou conteúdo de projetos de outras contas.

| Item no Supabase central `solutions` | Resultado |
|---|---:|
| Projetos do cliente no escopo verificado | 0 |
| Cortes desses projetos | 0 |
| Transcrições desses projetos | 0 |
| Outros projetos na mesma organização | 0 |
| Originais referenciados pelos projetos consultados | 0 |
| Transcrição sinalizada como configurada | Não |
| Registro de segredo de transcrição no Vault da organização | Não |
| URL de worker configurada para essa organização | Não |

Esses resultados descrevem o projeto central e o vínculo consultados. Não demonstram ausência de dados em outro projeto Supabase, Lovable Cloud ou remix. Também não comprovam a validade de uma chave legada nem o funcionamento de fornecedores. O levantamento não chamou APIs pagas nem copiou credenciais.

O inventário pode ser repetido por `python3 pilots/clips/deploy/inventory-customer.py`. Ele usa o vínculo de identidade já verificado, confere o Project Ref e falha se o vínculo não for único e ativo. A consulta e o resultado completos ficam em `.local/clips-parity`, fora do repositório.

## Ordem das entregas

| Prioridade | Entrega | Critério de conclusão |
|---|---|---|
| 1 | Vídeos de tamanho e duração compatíveis com o uso do cliente | Upload com retomada, armazenamento de arquivos separado dos registros do Postgres, fila limitada, progresso real, limites de capacidade explícitos e recuperação dos arquivos por backup |
| 2 | Transcrição e legendas | Extrair áudio, transcrever com tempos de fala/palavra, persistir o resultado por projeto, reaproveitar em novas análises e gerar legendas conferidas com o áudio |
| 3 | Análise por IA e vários cortes | Analisar a transcrição, validar tempos dentro do vídeo, persistir vários cortes por projeto, aplicar limites de custo e tentativas e exportar cada corte sem duplicação |
| 4 | Histórico e arquivos anteriores | Confirmar a origem dos remixes em uso; se houver histórico fora do escopo central consultado, copiar apenas o autorizado e comparar contagens, referências, hashes e acesso antes da troca |
| 5 | Demais funções do CLIPS atual | Homologar importação por links, reanálise, estilos de legenda, tracking, formatos e pacote de edição conforme o uso efetivo do cliente |
| 6 | Uso operacional | Login interativo do cliente validado, podcast representativo processado do início ao fim, resultados conferidos, capacidade e retorno ao ambiente anterior ensaiados |

## Por que não basta aumentar os limites

Há limites em camadas diferentes: o proxy aceita 8 MB por pedido; a interface e a API de projetos aceitam 7 MiB; o schema atual armazena o original no Postgres e limita o corte a 30 segundos; o MP4 de saída tem limite de 10 MiB. A API, o worker e o banco compartilham um servidor de 1 CPU e aproximadamente 2 GB de RAM com outras soluções. A inspeção mostrou cerca de 944 MB de memória disponível e 35 GB de disco livre naquele momento; são uma fotografia, não uma garantia de capacidade.

Aumentar apenas um número pode transferir a falha para memória, tempo de processamento ou tamanho do backup. A próxima implementação precisa transmitir arquivos em partes, manter os vídeos fora das linhas do banco, controlar concorrência e incluir os arquivos na recuperação. O backup atual foi validado para o modelo em que tudo está no Postgres; um armazenamento separado exige ampliar e testar esse procedimento.

## Alterações necessárias no pipeline

Hoje cada projeto do modo Go corresponde a um trabalho de corte manual. Para o fluxo completo, separar projeto, arquivo original, transcrição, cortes e trabalhos de exportação. Cada entidade deve carregar o vínculo com a conta, e cada etapa precisa registrar seu estado e poder retomar sem repetir cobrança ou perder um resultado anterior.

O código original usa transcrição por organização e análise por uma chave de sistema. A homologação Go ainda não tem esses provedores configurados. A implementação deve receber credenciais próprias do ambiente pelo servidor, verificar configuração antes de aceitar processamento automático e manter limites de consumo. As credenciais das outras soluções não devem virar uma dependência implícita.

O desaparecimento do erro original de login continua sendo uma verificação separada. As etapas de transcrição e IA não corrigem senha incorreta nem comprovam que a tentativa do cliente chegou ao backend esperado.

## Estado desta verificação

Foi entregue o inventário e definida a sequência de implementação. Nenhum limite foi aumentado, nenhum dado histórico foi importado e nenhum fornecedor foi ativado nesta verificação. O ambiente publicado e as demais soluções permaneceram como estavam.

# SDR Next · pacote Lovable 0.11

Esta versão mantém o Remix, o controle do cliente e a integração com o backend Go da plataforma.

- Conexão WhatsApp por QR ou código pelo número.
- Conhecimento do negócio, conversas, pausa humana e execuções configuráveis.
- Leitura de áudio, imagem e PDF recebidos pelo worker de mídia.
- Preparação e envio de arquivos, incluindo vídeo MP4.
- `media.send` para criar botões, regras e fluxos próprios no Lovable, com envio imediato ou agendamento no backend.
- Monitoramento central do uso dos workers, operado pela plataforma. A coleta usa metadados de execução; o conteúdo das conversas e as credenciais não vão para esse monitor.

O monitor global e seu acesso são internos à nossa operação e não acompanham este pacote. O ZIP contém a interface e os contratos públicos. Chaves de provedores, código dos workers e bancos permanecem na plataforma.

Leia `LOVABLE.md` e `FLUXOS-DE-MIDIA.md`. Códigos de acesso ao piloto são fornecidos separadamente. Esta instalação continua sendo o piloto com duas empresas e contatos de teste autorizados; importar o projeto não ativa automaticamente o canal real nem publica fluxos novos.

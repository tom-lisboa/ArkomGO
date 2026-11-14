# BIA · Agente Arkom

Frontend próprio da BIA, separado da plataforma Flutter. Usa React/Vite e preserva WhatsApp, álbuns, contexto, automações e acompanhamento do atendimento.

```sh
npm ci --ignore-scripts
npm run build
```

O servidor Go serve `dist` em `/agents/bia/`. O Flutter incorpora o agente em `/demo/sdr`. A BIA solicita a sessão à janela pai com nonce e valida a origem exata; não cria um login Alfa por conta própria. Token somente em memória. Chamadas usam o proxy Go da mesma origem. Abra pelo Flutter, não diretamente pelo arquivo HTML.

Maia e FinanceAI mantêm seus próprios frontends nos checkouts locais configurados. A navegação, os squads e o Genesis pertencem ao Flutter.

Com a demo iniciada, `npm run test:local` verifica a navegação Flutter, a preservação dos álbuns da BIA, Genesis, Maia, FinanceAI e as dimensões no celular, sem criar dados de negócio. Instale o navegador de teste com `npx playwright install chromium` se necessário.

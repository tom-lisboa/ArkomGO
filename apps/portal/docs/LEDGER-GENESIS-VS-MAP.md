# Ledger de/para — `/genesis` → linguagem visual do `/map`

> Objetivo: aproximar a **apresentação e a execução** do Genesis (geração de soluções)
> da experiência do **Mapa** — componentes, movimento e "sensação de espaço" — para que
> gerar uma solução pareça a mesma plataforma, não duas telas de DNA diferente.
>
> Este é um documento de **planejamento** (de→para). Nada de código foi alterado por ele.
> Fonte: leitura de `src/app/(aluno)/map/*`, `map.css`, `src/components/map/*`,
> `src/app/(aluno)/genesis/*` e `genesis.css` (2026-07-12).

---

## 1. Resumo executivo

O `/map` tem um **vocabulário visual coeso de "espaço"**: fundo com starfield + haze radial,
uma **câmera** (pan/zoom/dive/slide por rAF-lerp), tecido conectivo em SVG que **se desenha**
(linhas, nós que "pop-am", stagger por `--d`), painéis em **glass** (backdrop-blur), tipografia
de display **Marcellus**, e uma coreografia de hover (`:has()` que escurece o resto). Tudo
escopado em `.mapview`, paleta cobre/ivory.

O `/genesis` hoje é **plano e linear**: hero de logo estático → composer comum → wizard de
perguntas em tela cheia com barra de progresso → resultado num **trilho 01→08** com um painel
chapado de texto rolável. O único ponto que já "fala a língua do mapa" é o **`GenesisMark`**
(o loader SVG radial com núcleo pulsante + satélites + linhas tracejadas fluindo). Ele é a
ponte — a ideia é **expandir esse dialeto** para o resto do Genesis.

**Tese central:** a geração de uma solução deveria ser vivida como um **grafo que se constrói**
(nós desenhando-se, conectando-se, orbitando), não como um stepper de formulário. O `/map` já
tem toda a gramática pronta para isso — grande parte é **reuso**, não invenção.

---

## 2. Inventário — o que o `/map` tem que o `/genesis` não tem

| Camada | `/map` (tem) | Onde vive |
|---|---|---|
| **Fundo** | Starfield animado (`twinkle`) + haze radial de "espaço" | `StarField.tsx`, `.mapview` bg em `map.css` |
| **Câmera** | Pan/zoom/pinch/dive/slide por rAF-lerp (follow suave) | `MapView.tsx` (loop `tick`), `geometry.ts` |
| **Tecido conectivo** | Arcos/edges SVG que **se desenham** (`drawline`), fndots que "pop-am" (`popdot`) | `FanLayer.tsx`, `map.css` |
| **Nós** | `badgepop`/`nodepop` (escala elástica), glyphs por depto, anel duplo no selecionado | `FanLayer.tsx`, `RadialGraph.tsx`, `map.css` |
| **Stagger** | Revelação cadenciada via `--d` (cada elemento entra com delay próprio) | `--d` em quase todos os keyframes |
| **Painéis** | Drawer em **glass** (`backdrop-filter: blur`), `drawerIn`, reader `.rpanel` | `JobDrawer.tsx`, `RPanelReader`, `map.css` |
| **Órbita** | Satélites de skill orbitando o nó focado (`SkillSatellites`) | `SkillSatellites.tsx` |
| **Hover coreografado** | `:has(.dept-group:hover)` escurece/desfoca o resto, acende o alvo | `map.css` `@media (hover)` |
| **Tipografia** | Display **Marcellus** (`--st-font-display`) nos rótulos/nomes | `.ml-nm`, `.fan-dname`, `.tl-name` |
| **Navegação** | Chevrons que "cutucam" (`chevnudge`), edge-dept vertical | `map.css`, `BottomDeptNav`, `ZoomControls` |

### O que o `/genesis` tem hoje

| Estado | Componente | Sensação atual |
|---|---|---|
| Hero | logo PNG estático + `reveal` (fade-up único) | Estático; só 1 animação de entrada |
| Composer | textarea + mic + chips de sugestão | Formulário comum, sem "espaço" |
| Loading | **`GenesisMark`** (radial SVG: núcleo respira, satélites, linhas fluindo) | ✅ **já fala a língua do mapa** |
| Perguntas | overlay tela cheia, 1 por vez, barra + dots de paginação | Wizard limpo, porém "form" — sem grafo/câmera |
| Ready | card "Pronto para gerar?" com 2 opções | Cartões chapados |
| Resultado | **trilho linear 01→08** + painel único rolável (`StepContent`) | Stepper plano; sem construção viva, sem glass, sem stagger |

---

## 3. Ledger de/para (por área)

> Legenda de esforço: **P** pequeno (reuso quase direto) · **M** médio (adaptar) · **G** grande (novo comportamento).
> "Reuso" = de onde tirar o código/token já pronto no `/map`.

### 3.1 Fundo & contêiner
| # | DE (genesis hoje) | PARA (linguagem do mapa) | Reuso | Esforço |
|---|---|---|---|---|
| A1 | `bg-canvas` chapado no overlay/scope | Starfield + haze radial de espaço atrás do Genesis | `StarField.tsx`, bg `.mapview` | **P** |
| A2 | `genesis-scope` recolore vars base | Escopo próprio `.genesisview` espelhando `.mapview` (cobre/ivory, glass tokens) | `map.css` tokens `--map-*` | **M** |

### 3.2 Loader / análise (já é a ponte)
| # | DE | PARA | Reuso | Esforço |
|---|---|---|---|---|
| B1 | `GenesisMark` só no estado `loading` | Promover `GenesisMark` a **marca-assinatura** recorrente (hero, transições, cantos) | já existe no `builder-wizard.tsx` | **P** |
| B2 | título + subtítulo estáticos | Texto do passo entra com **stagger** (`--d`/`popfade`) e as linhas do mark "fluem" pro núcleo enquanto pensa | keyframes `gxFlow`, `popfade` | **P** |

### 3.3 Perguntas (wizard)
| # | DE | PARA | Reuso | Esforço |
|---|---|---|---|---|
| C1 | barra de progresso linear + dots | **Constelação de perguntas**: cada pergunta é um nó; respondê-la "acende"/preenche o nó, e a linha desenha até a próxima | `drawline`, `nodepop`, `--d` | **G** |
| C2 | troca de pergunta = swap instantâneo | Transição com **câmera** (desliza/foca a próxima, estilo `slideToDept`) | padrão `fan-layer` enter/exit | **M** |
| C3 | número `01` chapado + badge | Nó com glyph + anel duplo no ativo (mesma anatomia do nó do mapa) | `.fan-node.active::before/after` | **P** |

### 3.4 Resultado / execução (o coração do pedido)
| # | DE | PARA | Reuso | Esforço |
|---|---|---|---|---|
| D1 | **trilho linear 01→08** (dashed + barra accent) | **Grafo radial das 8 etapas**: núcleo = a solução, 8 nós orbitando; ao concluir, o nó "pop-a" e a linha até o núcleo **se desenha** | `RadialGraph`/`FanLayer` geometria + `drawline`/`nodepop` | **G** |
| D2 | geração paralela sem feedback espacial | Cada etapa **em geração** = nó pulsando (`gx-sat`); **concluída** = nó sólido + edge desenhada; **erro** = nó em outline | `gxSat`, `badgepop`, estados `.fan-node.deployed/dev/plan` | **M** |
| D3 | painel único chapado (`bg-surface`) | Painel da etapa em **glass drawer** com `drawerIn` (mesma casca do `JobDrawer`) | `.drawer-in`, `--map-drawer-*` | **M** |
| D4 | conteúdo aparece "seco" | Blocos do `StepContent` entram com **stagger** (`popfade` + `--d`) | keyframes já existentes | **P** |
| D5 | ferramentas listadas em cartões | Ferramentas como **satélites orbitando** a etapa "Ferramentas" (reforça "tecnologias mapeadas") | `SkillSatellites.tsx` | **G** |

### 3.5 Navegação & microinterações
| # | DE | PARA | Reuso | Esforço |
|---|---|---|---|---|
| E1 | botões "Próxima/Voltar" comuns | Chevrons com `chevnudge` + foco de câmera ao trocar de etapa | `chevnudge`, edge-dept | **P** |
| E2 | histórico em grid de cards planos | Cards com a física de elevação do DS (`cap-elev`: bevel + lift no hover) | `trainings.css` `.cap-elev` | **P** |
| E3 | tipografia sans nos títulos | Display **Marcellus** nos nomes de etapa/solução (como `.fan-dname`) | `--st-font-display` | **P** |

---

## 4. Plano de ação sugerido (ondas)

**Onda 1 — "sensação de espaço" (baixo risco, alto impacto visual) · ~P/M**
- A1 starfield + haze atrás do Genesis · A2 escopo `.genesisview` · B1/B2 promover o `GenesisMark` · D3 painel em glass · D4/E3 stagger + Marcellus.
- Resultado: mesmo "ar" do mapa **sem** reescrever a lógica do wizard/geração.

**Onda 2 — execução como grafo vivo (o coração) · ~M/G**
- D1 trocar o trilho linear pelo **grafo radial 01→08** · D2 estados de nó (gerando/pronto/erro) mapeados aos estados que já existem no `SolutionView` · E1 câmera/chevrons.
- Reaproveita `geometry.ts`/`FanLayer` — a lógica de geração paralela (`gerarTudo`, épocas de tools/savings) **não muda**, só a camada de apresentação.

> ### 🌱 Refinamento (direção do dono, 2026-07-12): "a solução VIRA um mapa que cresce"
> Em vez de um grafo estático 01→08, a **geração é uma árvore que brota** a partir do
> **mesmo núcleo/hub central do `/map`** (o "cérebro" do node-zero — só o visual, **sem** o
> texto de base de conhecimento). Cada uma das 8 etapas é um **galho que cresce** — a linha
> se desenha do núcleo até o nó, o nó "pop-a" quando a etapa conclui — até formar um
> **novo mapa** (o mapa *daquela* solução).
>
> **Como casa com o que já existe (quase tudo é reuso):**
> - **Núcleo** = `buildBrain()` + `.brain-spin/.brain-nucleus/.brain-drift` do `RadialGraph`/`map.css`
>   (o cérebro que gira e pulsa). É literalmente "o item do centro do mapa".
> - **Galhos crescendo** = `FanLayer` + `computeFan`/`geometry.ts`: cada etapa é um ramo cujo
>   edge usa `drawline` (a linha se desenha) e o nó usa `nodepop`/`badgepop` (brota com escala elástica).
> - **Cadência da geração** = o `--d` (delay por elemento) amarrado ao **estado real** de cada etapa
>   no `SolutionView`: `gerando` → nó pulsa (`gxSat`), `completed` → galho desenhado + nó sólido
>   (`.fan-node.deployed`), `error` → nó em outline (`.fan-node.plan`).
> - **Sub-galhos** = dentro de cada etapa, os itens (ferramentas, pilares, sprints) viram folhas/
>   satélites (`SkillSatellites`/`.leaf`) — a árvore ganha profundidade conforme o conteúdo chega.
> - **Ao terminar** = vira um mapa navegável da solução: clicar num galho abre o painel glass (D3)
>   com o conteúdo daquela etapa (o texto denso continua legível — o mapa é a navegação).
>
> **Esforço:** G (é o maior item do ledger), mas **baixo risco de lógica** — o motor de geração
> (`gerarTudo`, dedupe, épocas) não muda; troca-se só a camada de apresentação do `SolutionView`.
> **Decisão a tomar:** extrair `brain`+`FanLayer` para um componente compartilhável (`<SolutionMap>`)
> reutilizável entre `/map` e Genesis, em vez de forkar. Recomendado.

**Onda 3 — perguntas como constelação + órbitas · ~G**
- C1/C2/C3 wizard em constelação · D5 ferramentas em satélites.
- Maior esforço; fazer só depois que Ondas 1–2 provarem o padrão.

---

## 5. Riscos & decisões a tomar

1. **Reuso vs. duplicação** — o ideal é **extrair** o motor de grafo do `/map` (`FanLayer`+`geometry`)
   para um componente compartilhável, senão o Genesis vira um fork divergente. Decisão: extrair agora
   (custa mais na Onda 2) ou copiar e unificar depois?
2. **Câmera é pesada** — o loop rAF do `MapView` é acoplado ao estado do mapa. Para o Genesis
   provavelmente basta um **subconjunto** (foco/slide entre nós), não pan/zoom/pinch completos.
3. **Motion & acessibilidade** — todo keyframe do mapa respeita `prefers-reduced-motion`; manter isso
   ao portar (o `genesis.css` já tem o padrão para o `reveal`).
4. **Densidade de conteúdo** — o resultado do Genesis é **texto denso** (8 etapas, markdown). O grafo
   é a *navegação*; o **conteúdo** ainda precisa de um painel legível (glass drawer, D3) — não dá para
   "tudo virar nó".
5. **Escopo de tema** — o mapa tem paleta própria dark+light muito calibrada. Reusar os tokens `--map-*`
   evita recalibrar; herdar em vez de reinventar.

---

## 6. Ponteiros de código (para agir)

- Mapa: `src/app/(aluno)/map/MapView.tsx` (câmera/estados) · `map.css` (todo o motion) ·
  `src/components/map/{FanLayer,RadialGraph,SkillSatellites,StarField,geometry}.tsx`
- Genesis: `src/app/(aluno)/genesis/builder-wizard.tsx` (wizard + `GenesisMark`) ·
  `solution/[id]/solution-view.tsx` (trilho 01→08 + geração) · `step-content.tsx`/`step-renderers.tsx` (conteúdo) · `genesis.css`
- Tokens/física de elevação: `globals.css` (`--st-*`, `--st-elev-*`, `--st-haze`) · `trainings.css` (`.cap-elev`)

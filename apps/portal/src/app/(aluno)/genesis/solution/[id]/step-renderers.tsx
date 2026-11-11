"use client";

// Renderizadores DEDICADOS por etapa (theme-aware, DS ARKOM). Cada um lê a forma
// esperada (com fallbacks tolerantes p/ variantes de chave) e monta um layout próprio,
// espelhando o VdI adaptado — nada de dump genérico rótulo/valor.

import { useState } from "react";
import { ArrowRight, Check, ChevronDown, Copy, TrendingDown } from "lucide-react";
import { Badge } from "@/components/ui";
import { cn } from "@/lib/utils";

// ---------- helpers ----------
export type Obj = Record<string, unknown>;
export const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
export function pick(o: Obj | undefined, ...keys: string[]): unknown {
  if (!o) return undefined;
  for (const k of keys) if (o[k] !== undefined && o[k] !== null && o[k] !== "") return o[k];
  return undefined;
}
const str = (v: unknown, d = ""): string => (v === undefined || v === null ? d : String(v));
export const arr = (v: unknown): Obj[] => (Array.isArray(v) ? v.filter(isObj) : []);
const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x)) : []);

// derivações leves de texto (estilo VdI: derivar no cliente)
const AI_FAMILIES = ["Claude", "GPT", "Gemini", "Llama", "Mistral", "Grok", "DeepSeek", "Command"];
function deriveModel(text: string): string | null {
  const m = text.match(new RegExp(`\\b(${AI_FAMILIES.join("|")})[\\w.\\-\\s]*?(?:Sonnet|Opus|Haiku|Pro|Flash|Mini|Turbo|[0-9.]+)?`, "i"));
  return m ? m[0].trim().replace(/\s+/g, " ").slice(0, 24) : null;
}
function deriveCost(text: string): string | null {
  const m = text.match(/(?:US\$|R\$|\$)\s?[\d.,]+(?:\s?\/\s?(?:m[êe]s|Mtok|mês))?/i);
  return m ? m[0].replace(/\s+/g, "") : null;
}

// ---------- copy ----------
function Copiavel({ text, small }: { text: string; small?: boolean }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setOk(true);
          setTimeout(() => setOk(false), 1500);
        } catch {}
      }}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-border font-mono uppercase tracking-widest text-tertiary transition-colors hover:bg-surface-hover hover:text-secondary",
        small ? "px-1.5 py-0.5 text-3xs" : "px-2 py-1 text-3xs"
      )}
    >
      {ok ? <Check className="h-3 w-3 text-accent" /> : <Copy className="h-3 w-3" />}
      {ok ? "Copiado" : "Copiar"}
    </button>
  );
}

// eyebrow de seção reutilizável
function SecHead({ label, count }: { label: string; count?: string }) {
  return (
    <div className="mb-3 flex items-center gap-2.5">
      <span className="h-1.5 w-1.5 rounded-full bg-accent" />
      <span className="font-mono text-3xs font-medium uppercase tracking-widest text-tertiary">{label}</span>
      {count && <Badge variant="neutral">{count}</Badge>}
    </div>
  );
}

// ============================================================
// KNOWLEDGE BASE — insights (cards) + Q&A obrigatórias/bônus
// ============================================================
function InsightCard({ label, value }: { label: string; value: string }) {
  const [open, setOpen] = useState(false);
  const [key, ...rest] = label.split(":");
  const title = rest.join(":").trim() || label.trim();
  const eyebrow = rest.length ? key.trim() : "";
  const body = value.replace(/^Resposta\s*\d+\s*(?:\([^)]*\))?\s*/i, "").trim();
  const model = deriveModel(value);
  const cost = deriveCost(value);
  const longo = body.length > 150;
  return (
    <div className="flex h-full flex-col gap-2.5 rounded-card border border-border bg-surface p-4 transition-colors hover:border-border-strong">
      <div className="flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-accent" />
        {eyebrow && <span className="font-mono text-3xs uppercase tracking-widest text-accent">{eyebrow}</span>}
      </div>
      <p className="font-display text-[0.9rem] font-semibold leading-snug text-primary">{title}</p>
      <div className="h-px bg-border" />
      <p className={cn("text-[0.8125rem] leading-relaxed text-secondary", !open && longo && "line-clamp-3")}>{body}</p>
      {longo && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="inline-flex items-center gap-1 self-start font-mono text-3xs text-tertiary transition-colors hover:text-accent"
        >
          {open ? "menos" : "porquê"} <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
        </button>
      )}
      {(model || cost) && (
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
          {model && <Badge variant="gold-dim">{model}</Badge>}
          {cost && <span className="font-mono text-2xs tabular-nums text-secondary">≈ {cost}</span>}
        </div>
      )}
    </div>
  );
}
function QA({ item, bonus }: { item: Obj; bonus?: boolean }) {
  const cat = str(pick(item, "category", "categoria"));
  return (
    <div
      className={cn(
        "rounded-lg border border-border p-4",
        bonus ? "bg-canvas" : "bg-surface transition-colors hover:border-border-strong"
      )}
    >
      {cat && (
        <p className={cn("mb-1.5 font-mono text-3xs uppercase tracking-widest", bonus ? "text-tertiary" : "text-accent")}>
          {bonus ? "Bônus · " : ""}
          {cat}
        </p>
      )}
      <p className="text-[0.9375rem] font-medium leading-snug text-primary">{str(pick(item, "question", "pergunta"))}</p>
      <div className="my-2.5 h-px bg-border" />
      <p className="max-w-[62ch] text-[0.8125rem] leading-relaxed text-secondary">{str(pick(item, "answer", "resposta"))}</p>
    </div>
  );
}
export function KnowledgeBase({ c }: { c: Obj }) {
  const insights = arr(pick(c, "insights"));
  const mandatory = arr(pick(c, "mandatory_qa", "perguntas_obrigatorias", "obrigatorias"));
  const bonus = arr(pick(c, "bonus_qa", "perguntas_bonus", "bonus"));
  return (
    <div className="flex flex-col gap-8">
      {insights.length > 0 && (
        <section>
          <SecHead label="Resumo extraído pela IA" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {insights.map((it, i) => (
              <InsightCard key={i} label={str(pick(it, "label", "titulo"))} value={str(pick(it, "value", "valor"))} />
            ))}
          </div>
        </section>
      )}
      {mandatory.length > 0 && (
        <section>
          <SecHead label="Obrigatórias" count={`${mandatory.length}/${mandatory.length}`} />
          <div className="flex flex-col gap-3">
            {mandatory.map((it, i) => (
              <QA key={i} item={it} />
            ))}
          </div>
        </section>
      )}
      {bonus.length > 0 && (
        <section>
          <SecHead label="Complementares" count={`${bonus.length} respondidas`} />
          <div className="flex flex-col gap-3">
            {bonus.map((it, i) => (
              <QA key={i} item={it} bonus />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ============================================================
// FRAMEWORK — 5 pilares (cards)
// ============================================================
const PILARES: { key: string; label: string }[] = [
  { key: "data", label: "Dados" },
  { key: "prompt", label: "Prompt / Lógica" },
  { key: "models", label: "Modelos de IA" },
  { key: "automation", label: "Automação" },
  { key: "interface", label: "Interface" },
];
export function Framework({ c }: { c: Obj }) {
  const pilares = PILARES.map((p) => ({ ...p, val: c[p.key] })).filter((p) => p.val !== undefined);
  const items = pilares.length ? pilares : Object.entries(c).map(([k, v]) => ({ key: k, label: k, val: v }));
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {items.map((p, i) => (
        <div key={p.key} className="rounded-card border border-border bg-surface p-4">
          <div className="mb-2 flex items-center gap-2.5">
            <span className="font-mono text-3xs tabular-nums text-accent">{String(i + 1).padStart(2, "0")}</span>
            <span className="font-display text-sm font-semibold text-primary">{humanize(p.label)}</span>
          </div>
          <Pilar val={p.val} />
        </div>
      ))}
    </div>
  );
}
function Pilar({ val }: { val: unknown }) {
  if (isObj(val)) {
    const desc = str(pick(val, "description", "descricao", "database_description", "why", "porque"));
    const feats = arr(pick(val, "features", "itens", "items"));
    const badge = str(pick(val, "database_badge", "badge", "recommended", "recomendado"));
    return (
      <div className="flex flex-col gap-2">
        {badge && <Badge variant="gold-dim">{badge}</Badge>}
        {desc && <p className="text-[0.8125rem] leading-relaxed text-secondary">{desc}</p>}
        {feats.length > 0 && (
          <ul className="mt-1 space-y-1.5">
            {feats.map((f, i) => (
              <li key={i} className="flex gap-2 text-[0.8125rem] text-secondary">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
                <span>
                  <b className="font-medium text-primary">{str(pick(f, "label", "titulo", "name"))}</b>
                  {pick(f, "description", "descricao") ? ` — ${str(pick(f, "description", "descricao"))}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }
  if (Array.isArray(val)) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {val.map((m, i) => (
          <Badge key={i} variant="neutral">
            {isObj(m) ? str(pick(m, "name", "nome", "model")) : String(m)}
          </Badge>
        ))}
      </div>
    );
  }
  return <p className="text-[0.8125rem] leading-relaxed text-secondary">{str(val)}</p>;
}

// ============================================================
// ARCHITECTURE — fluxo principal (etapas numeradas) + alternativos
// ============================================================
export function Architecture({ c }: { c: Obj }) {
  const main = arr(pick(c, "main_flow", "fluxo_principal", "fluxo"));
  const alt = arr(pick(c, "alt_flows", "fluxos_alternativos", "alternativos"));
  return (
    <div className="flex flex-col gap-8">
      {main.length > 0 && (
        <section>
          <SecHead label="Fluxo principal" count={`${main.length} etapas`} />
          <ol className="flex flex-col gap-2.5">
            {main.map((s, i) => (
              <li key={i} className="flex gap-3 rounded-lg border border-border bg-surface p-4">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-accent bg-gold-50 font-mono text-2xs font-semibold text-gold-700">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-primary">{str(pick(s, "label", "titulo", "descricao"))}</p>
                  {!!pick(s, "description", "descricao") && str(pick(s, "label")) !== str(pick(s, "description")) && (
                    <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-secondary">{str(pick(s, "description", "descricao"))}</p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {strArr(pick(s, "tools", "ferramentas")).slice(0, 4).map((t) => (
                      <Badge key={t} variant="neutral">{t}</Badge>
                    ))}
                    {!!pick(s, "metrics", "metrica", "metrica_sucesso") && (
                      <span className="font-mono text-2xs text-tertiary">↳ {str(pick(s, "metrics", "metrica", "metrica_sucesso"))}</span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}
      {alt.length > 0 && (
        <section>
          <SecHead label="Fluxos alternativos" count={String(alt.length)} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {alt.map((a, i) => (
              <div key={i} className="rounded-lg border border-border bg-canvas p-3.5">
                <p className="font-mono text-3xs uppercase tracking-widest text-accent">{str(pick(a, "type", "tipo", "label", "titulo"), "Alternativo")}</p>
                <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-secondary">{str(pick(a, "description", "descricao", "detalhe"))}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ============================================================
// ACTION PLAN — sprints com tarefas (kanban leve)
// ============================================================
const PRIO: Record<string, "danger" | "warning" | "neutral"> = { high: "danger", alta: "danger", medium: "warning", media: "warning", low: "neutral", baixa: "neutral" };
export function ActionPlan({ c }: { c: Obj }) {
  const sprints = arr(pick(c, "sprints"));
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
      {sprints.map((s, i) => {
        const tasks = arr(pick(s, "tasks", "tarefas"));
        return (
          <div key={i} className="flex flex-col rounded-card border border-border bg-canvas p-3.5">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-md border border-accent bg-gold-50 font-mono text-3xs font-bold text-gold-700">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-primary">{str(pick(s, "name", "nome", "short_name", "shortName"), `Sprint ${i + 1}`)}</p>
                {!!pick(s, "duration", "duracao") && <p className="font-mono text-3xs text-tertiary">{str(pick(s, "duration", "duracao"))}</p>}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              {tasks.map((t, j) => {
                const prio = str(pick(t, "priority", "prioridade")).toLowerCase();
                return (
                  <div key={j} className="rounded-lg border border-border bg-surface p-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[0.8125rem] font-medium leading-snug text-primary">{str(pick(t, "title", "titulo", "task", "tarefa"))}</p>
                      {prio && <Badge variant={PRIO[prio] ?? "neutral"}>{prio}</Badge>}
                    </div>
                    {!!pick(t, "estimate", "estimativa", "duration") && (
                      <p className="mt-1 font-mono text-3xs text-tertiary">⏱ {str(pick(t, "estimate", "estimativa", "duration"))}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// CONTENT — conteúdos agrupados por sprint
// ============================================================
const DIFF: Record<string, "success" | "warning" | "danger"> = { iniciante: "success", intermediario: "warning", "intermediário": "warning", avancado: "danger", "avançado": "danger" };
export function Content({ c }: { c: Obj }) {
  const contents = arr(pick(c, "contents", "conteudos", "conteúdos"));
  const bySprint = new Map<string, Obj[]>();
  for (const it of contents) {
    const s = str(pick(it, "sprint"), "—");
    if (!bySprint.has(s)) bySprint.set(s, []);
    bySprint.get(s)!.push(it);
  }
  return (
    <div className="flex flex-col gap-6">
      {[...bySprint.entries()].map(([sprint, items]) => (
        <section key={sprint}>
          <SecHead label={sprint === "—" ? "Conteúdos" : `Sprint ${sprint}`} count={`${items.length} aulas`} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {items.map((it, i) => {
              const diff = str(pick(it, "difficulty", "dificuldade")).toLowerCase();
              return (
                <div key={i} className="rounded-lg border border-border bg-surface p-3.5">
                  <p className="text-sm font-semibold leading-snug text-primary">{str(pick(it, "title", "titulo"))}</p>
                  {!!pick(it, "reason", "razao", "razão", "razão_para_estudar") && (
                    <p className="mt-1 text-xs leading-relaxed text-secondary">{str(pick(it, "reason", "razao", "razão", "razão_para_estudar"))}</p>
                  )}
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    {!!pick(it, "module", "modulo", "módulo") && <Badge variant="neutral">{str(pick(it, "module", "modulo", "módulo"))}</Badge>}
                    {diff && <Badge variant={DIFF[diff] ?? "neutral"}>{diff}</Badge>}
                    {!!pick(it, "duration", "duracao", "duração") && (
                      <span className="font-mono text-2xs text-tertiary">{str(pick(it, "duration", "duracao", "duração"))}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

// ============================================================
// SAVINGS — hero de comparação + profissionais
// ============================================================
const brl = (n: number) => "R$ " + n.toLocaleString("pt-BR");
export function Savings({ c }: { c: Obj }) {
  const sem = Number(pick(c, "total_without_builder", "total_traditional") ?? 0);
  const com = Number(pick(c, "total_with_builder") ?? 0);
  const pctRaw = pick(c, "savings_pct", "percentual", "economia_pct");
  // preserva o decimal ("94.31" ou 94.31 → 94; "94%" → 94) — nunca remover o ponto
  const pctNum = pctRaw !== undefined ? Number(String(pctRaw).replace(/[^\d.]/g, "")) : NaN;
  const pct = Number.isFinite(pctNum) ? Math.round(pctNum) : sem > 0 ? Math.round(((sem - com) / sem) * 100) : 0;
  const profs = arr(pick(c, "professionals", "profissionais"));
  const prazoSem = str(pick(c, "traditional_time", "prazo_tradicional"));
  const prazoCom = str(pick(c, "builder_time", "prazo_builder"));
  const metodo = str(pick(c, "methodology", "metodologia"));
  return (
    <div className="flex flex-col gap-6">
      {/* hero de comparação */}
      <div className="grid grid-cols-1 items-stretch gap-3 sm:grid-cols-[1fr_auto_1fr]">
        <div className="rounded-xl border border-border bg-canvas p-4 text-center">
          <p className="font-mono text-3xs uppercase tracking-widest text-tertiary">Equipe tradicional</p>
          <p className="mt-1 font-display text-2xl font-bold tabular-nums text-primary">{brl(sem)}</p>
          {prazoSem && <p className="mt-0.5 font-mono text-3xs text-tertiary">⏱ {prazoSem}</p>}
        </div>
        <div className="flex items-center justify-center">
          <ArrowRight className="h-5 w-5 text-tertiary sm:block" />
        </div>
        <div className="rounded-xl border border-accent bg-gold-50 p-4 text-center">
          <p className="font-mono text-3xs uppercase tracking-widest text-gold-700">Com o Genesis</p>
          <p className="mt-1 font-display text-2xl font-bold tabular-nums text-gold-700">{com === 0 ? "R$ 0" : brl(com)}</p>
          {prazoCom && <p className="mt-0.5 font-mono text-3xs text-gold-700">⏱ {prazoCom}</p>}
        </div>
      </div>
      {pct > 0 && (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-accent bg-gold-50 py-4">
          <TrendingDown className="h-6 w-6 text-gold-700" />
          <span className="font-display text-3xl font-extrabold tabular-nums text-gold-700">{pct}%</span>
          <span className="font-mono text-3xs uppercase tracking-widest text-tertiary">de economia</span>
        </div>
      )}
      {profs.length > 0 && (
        <section>
          <SecHead label="Equipe que você substitui" count={`${profs.length} profissionais`} />
          <div className="flex flex-col gap-2">
            {profs.map((p, i) => {
              const rate = str(pick(p, "rate", "taxa", "hourly", "valor_hora"));
              const hours = str(pick(p, "hours", "horas"));
              return (
                <div key={i} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-primary">{str(pick(p, "role", "cargo", "name", "nome"))}</p>
                    {(rate || hours) && (
                      <p className="font-mono text-3xs text-tertiary">{[rate, hours].filter(Boolean).join(" · ")}</p>
                    )}
                  </div>
                  {pick(p, "total", "custo", "cost") !== undefined && (
                    <span className="font-mono text-sm tabular-nums text-secondary">{brl(Number(pick(p, "total", "custo", "cost")) || 0)}</span>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
      {metodo && <p className="text-xs leading-relaxed text-tertiary">{metodo}</p>}
    </div>
  );
}

// ============================================================
// PROMPT LOVABLE — cards numerados copiáveis
// ============================================================
export function PromptLovable({ c }: { c: Obj }) {
  const prompts = arr(pick(c, "prompts"));
  return (
    <div className="flex flex-col gap-3">
      {prompts.map((p, i) => {
        const content = str(pick(p, "content", "conteudo", "conteúdo", "description"));
        return (
          <div key={i} className="overflow-hidden rounded-lg border border-border bg-canvas">
            <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
              <span className="flex items-center gap-2 text-sm font-semibold text-primary">
                <span className="flex h-5 w-5 items-center justify-center rounded-full border border-accent bg-gold-50 font-mono text-3xs text-gold-700">
                  {i + 1}
                </span>
                {str(pick(p, "title", "titulo"), `Prompt ${i + 1}`)}
              </span>
              <Copiavel text={content} small />
            </div>
            <pre className="max-h-[280px] overflow-auto whitespace-pre-wrap px-3 py-2 font-mono text-xs leading-relaxed text-secondary">{content}</pre>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// TOOLS — essenciais / opcionais, cards com custo, plano e alternativas
// ============================================================
const PLAN_TAG: Record<string, "success" | "gold-dim" | "neutral"> = { free: "success", paid: "gold-dim", freemium: "neutral" };
function ToolCard({ t }: { t: Obj }) {
  const [openAlt, setOpenAlt] = useState(false);
  const alt = arr(pick(t, "alternatives", "alternativas"));
  const planTag = str(pick(t, "plan_tag", "planTag")).toLowerCase();
  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-primary">{str(pick(t, "name", "nome"), "Ferramenta")}</span>
        {planTag && <Badge variant={PLAN_TAG[planTag] ?? "neutral"}>{planTag}</Badge>}
      </div>
      {!!pick(t, "category", "categoria") && (
        <p className="font-mono text-3xs uppercase tracking-widest text-tertiary">{str(pick(t, "category", "categoria"))}</p>
      )}
      {!!pick(t, "how_used", "howUsed", "description", "descricao") && (
        <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-secondary">
          {str(pick(t, "how_used", "howUsed", "description", "descricao"))}
        </p>
      )}
      <div className="mt-2.5 flex items-center justify-between gap-2">
        {!!pick(t, "cost", "custo") && <span className="font-mono text-xs font-medium tabular-nums text-gold-700">{str(pick(t, "cost", "custo"))}</span>}
        {alt.length > 0 && (
          <button
            type="button"
            onClick={() => setOpenAlt((o) => !o)}
            className="inline-flex items-center gap-1 font-mono text-3xs text-tertiary transition-colors hover:text-accent"
          >
            {alt.length} alternativa{alt.length > 1 ? "s" : ""} <ChevronDown className={cn("h-3 w-3 transition-transform", openAlt && "rotate-180")} />
          </button>
        )}
      </div>
      {openAlt && alt.length > 0 && (
        <div className="mt-3 space-y-2 border-t border-border pt-3">
          {alt.map((a, i) => (
            <div key={i} className="text-xs">
              <p className="font-medium text-primary">{str(pick(a, "name", "nome"))}</p>
              {!!pick(a, "pros", "pro") && <p className="text-secondary">+ {str(pick(a, "pros", "pro"))}</p>}
              {!!pick(a, "cons", "contra") && <p className="text-tertiary">− {str(pick(a, "cons", "contra"))}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
export function Tools({ c }: { c: Obj }) {
  const tools = arr(pick(c, "tools", "ferramentas"));
  const ess = tools.filter((t) => pick(t, "essential", "essencial") === true);
  const opt = tools.filter((t) => pick(t, "essential", "essencial") !== true);
  return (
    <div className="flex flex-col gap-8">
      {(ess.length > 0 ? ess : tools).length > 0 && (
        <section>
          <SecHead label="Essenciais" count={String((ess.length > 0 ? ess : tools).length)} />
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {(ess.length > 0 ? ess : tools).map((t, i) => (
              <ToolCard key={i} t={t} />
            ))}
          </div>
        </section>
      )}
      {ess.length > 0 && opt.length > 0 && (
        <section>
          <SecHead label="Opcionais" count={String(opt.length)} />
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {opt.map((t, i) => (
              <ToolCard key={i} t={t} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ---------- util ----------
function humanize(key: string): string {
  const s = key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}


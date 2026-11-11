"use client";

// Render genérico (fallback) — quando a forma da etapa não bate com um renderizador
// dedicado. Seções/cards/listas recursivas, THEME-AWARE. Código vira bloco copiável.

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

function humanize(key: string): string {
  const s = key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
function looksLikeCode(s: string): boolean {
  return s.includes("\n") && /(create\s+table|select\s|insert\s+into|function\s|const\s|import\s|=>|supabase\.|deno\.|<[a-z]+>|def\s|class\s|curl\s|npm\s)/i.test(s);
}

function CopyBtn({ text }: { text: string }) {
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
      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 font-mono text-3xs uppercase tracking-widest text-tertiary transition-colors hover:bg-surface-hover"
    >
      {ok ? <Check className="h-3 w-3 text-accent" /> : <Copy className="h-3 w-3" />}
      {ok ? "Copiado" : "Copiar"}
    </button>
  );
}
function CodeBlock({ code }: { code: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-canvas">
      <div className="flex items-center justify-end border-b border-border px-2 py-1">
        <CopyBtn text={code} />
      </div>
      <pre className="max-h-[300px] overflow-auto whitespace-pre-wrap p-3 font-mono text-xs leading-relaxed text-secondary">{code}</pre>
    </div>
  );
}

export function GenericValue({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === "") return <span className="text-tertiary">—</span>;
  if (typeof value === "string") {
    if (looksLikeCode(value)) return <CodeBlock code={value} />;
    return <p className="whitespace-pre-wrap text-sm leading-relaxed text-secondary">{value}</p>;
  }
  if (typeof value === "number" || typeof value === "boolean") return <span className="text-sm text-primary">{String(value)}</span>;
  if (Array.isArray(value)) {
    const allObjects = value.length > 0 && value.every(isObj);
    if (allObjects) {
      return (
        <div className="flex flex-col gap-3">
          {value.map((v, i) => (
            <div key={i} className="rounded-lg border border-border bg-canvas p-3">
              <GenericValue value={v} />
            </div>
          ))}
        </div>
      );
    }
    return (
      <ul className="ml-4 list-disc space-y-1 text-sm text-secondary marker:text-accent/60">
        {value.map((v, i) => (
          <li key={i}>{isObj(v) || Array.isArray(v) ? <GenericValue value={v} /> : String(v)}</li>
        ))}
      </ul>
    );
  }
  if (isObj(value)) {
    return (
      <div className="flex flex-col gap-3">
        {Object.entries(value).map(([k, v]) => (
          <div key={k}>
            <p className={cn("mb-1 font-mono text-3xs uppercase tracking-widest text-gold-700")}>{humanize(k)}</p>
            <GenericValue value={v} />
          </div>
        ))}
      </div>
    );
  }
  return null;
}

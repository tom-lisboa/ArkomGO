// Select nativo estilizado — uso:
// <Select name="status" defaultValue="published"><option value="draft">Rascunho</option>…</Select>
//
// Mantemos o <select> NATIVO (acessível, sem JS extra) alinhado à anatomia ARKOM
// (snippet 06 §03): px-[14px], chevron em text-tertiary a 14px da direita, foco
// halo dourado, disabled sunken. Um dropdown custom (role=listbox + opção ativa
// bg-table-highlight/text-gold-700) é OPCIONAL — só vale se precisarmos de
// estilização de painel/opções; o nativo já cobre o trigger com fidelidade.

import type { SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-[42px] w-full appearance-none rounded-input border border-input-border bg-input-bg px-[14px] pr-[38px] font-sans text-sm text-primary",
        "cursor-pointer transition-all duration-200",
        // chevron 16px em text-tertiary (#92928F), ancorado a 14px da borda direita
        "bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2392928F%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-[position:right_14px_center] bg-no-repeat",
        "hover:border-border-strong",
        // FOCO = halo dourado (decisão do dono): borda accent + anel ouro, não o anel azul
        "focus:border-accent focus:outline-none focus:shadow-ring-gold",
        // disabled AFUNDA (sunken), sem opacity
        "disabled:cursor-not-allowed disabled:border-border-subtle disabled:bg-surface-sunken disabled:text-disabled",
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
}

// Input — uso: <Input name="email" type="email" placeholder="voce@email.com" />

import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-[42px] w-full rounded-input border border-input-border bg-input-bg px-[14px] font-sans text-sm text-primary",
        "placeholder:text-tertiary transition-all duration-200",
        "hover:border-border-strong",
        // FOCO = halo dourado (decisão do dono): borda accent + anel ouro, não o anel azul
        "focus:border-accent focus:outline-none focus:shadow-ring-gold aria-invalid:border-danger",
        // disabled AFUNDA (sunken), sem opacity
        "disabled:cursor-not-allowed disabled:border-border-subtle disabled:bg-surface-sunken disabled:text-disabled",
        className
      )}
      {...props}
    />
  );
}

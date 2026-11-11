"use client";

// Textarea — uso: <Textarea name="description" rows={4} maxLength={500} />
// Anatomia ARKOM (snippet 06 §02): wrapper bordado + textarea transparente + contador
// mono no canto quando há maxLength. Foco = halo dourado via focus-within.

import { useState, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Textarea({
  className,
  maxLength,
  value,
  defaultValue,
  onChange,
  disabled,
  "aria-invalid": ariaInvalid,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const initial = String(value ?? defaultValue ?? "").length;
  const [innerCount, setInnerCount] = useState(initial);
  const count = value != null ? String(value).length : innerCount;
  const invalid = ariaInvalid === true || ariaInvalid === "true";

  return (
    <div
      className={cn(
        "flex min-h-[96px] w-full flex-col justify-between rounded-input border px-[14px] py-3 transition-all duration-200",
        disabled
          ? // disabled AFUNDA (sunken)
            "border-border-subtle bg-surface-sunken"
          : invalid
            ? "border-danger bg-input-bg"
            : // FOCO = halo dourado (decisão do dono) no wrapper via focus-within
              "border-input-border bg-input-bg focus-within:border-accent focus-within:shadow-ring-gold",
        className
      )}
    >
      <textarea
        maxLength={maxLength}
        value={value}
        defaultValue={defaultValue}
        disabled={disabled}
        aria-invalid={ariaInvalid}
        onChange={(e) => {
          if (value == null) setInnerCount(e.target.value.length);
          onChange?.(e);
        }}
        className="w-full grow resize-none bg-transparent font-sans text-sm leading-normal text-primary placeholder:text-tertiary focus:outline-none disabled:cursor-not-allowed disabled:text-disabled"
        {...props}
      />
      {maxLength != null && (
        <span className="mt-2 self-end font-mono text-xs text-tertiary">
          {count}/{maxLength}
        </span>
      )}
    </div>
  );
}

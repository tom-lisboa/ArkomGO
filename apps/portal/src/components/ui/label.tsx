// Label — uso: <Label htmlFor="email">E-mail</Label>

import type { LabelHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Label({
  className,
  ...props
}: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn(
        "mb-2 block font-sans text-[13px] font-medium tracking-normal text-primary",
        className
      )}
      {...props}
    />
  );
}

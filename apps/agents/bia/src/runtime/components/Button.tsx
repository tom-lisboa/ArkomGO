import React from 'react';
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "",
  {
    variants: {
      variant: {
        primary: "btn-bilhon",
        secondary: "btn-bilhon-outline",
        outline: "btn-bilhon-outline",
        ghost: "btn-bilhon-ghost",
        danger: "btn-bilhon-outline text-destructive",
        default: "btn-bilhon-outline",
      },
      size: {
        sm: "btn-bilhon-sm",
        md: "",
        lg: "btn-bilhon-lg",
        icon: "w-14 px-0",
        default: "",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  className?: string;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ children, variant, size, className = '', ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';

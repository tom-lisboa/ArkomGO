import type { ButtonHTMLAttributes } from 'react';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'outline';
  size?: 'sm';
};

export function Button({ variant, size, ...props }: ButtonProps) {
  return <button data-variant={variant} data-size={size} {...props}/>;
}

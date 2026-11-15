import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./cn";

/*
 * Poloměr je polovina výšky, ne `rounded-full`: z 9999 px na 12 px by
 * stisk (`.press-morph`) celou dobu vypadal kulatě a na konci cvakl.
 */
export const buttonVariants = cva(
  "state-layer press-morph inline-flex select-none items-center justify-center gap-2 whitespace-nowrap text-label-lg disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-5 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        filled: "bg-primary text-on-primary",
        tonal: "bg-primary-container text-on-primary-container",
        outline: "border border-outline text-primary",
        text: "text-primary",
        ghost: "text-on-surface-variant",
        destructive: "bg-error text-on-error",
        highlight: "bg-highlight text-on-highlight",
        // Staré názvy, ať nepřepsaná volání dál fungují.
        default: "bg-primary text-on-primary",
        secondary: "bg-primary-container text-on-primary-container",
        mark: "bg-highlight text-on-highlight",
      },
      size: {
        sm: "h-9 rounded-[18px] px-3",
        default: "h-10 rounded-[20px] px-5",
        lg: "h-12 rounded-[24px] px-6",
        icon: "size-10 rounded-[20px]",
        "icon-sm": "size-8 rounded-[16px] [&_svg]:size-4",
        "icon-lg": "size-12 rounded-[24px] [&_svg]:size-6",
      },
    },
    defaultVariants: { variant: "filled", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  ),
);
Button.displayName = "Button";

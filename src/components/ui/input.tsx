import * as React from "react";
import { cn } from "./cn";

/*
 * Vyplněná pole M3: tónový podklad bez rámečku, fokus kreslí zelená linka
 * uvnitř, ať pole při psaní neposkočí.
 */
const field =
  "w-full rounded-md bg-surface-high px-4 text-body-lg text-on-surface outline-none transition-shadow duration-200 placeholder:text-on-surface-variant/70 focus-visible:outline-none focus:shadow-[inset_0_0_0_2px_var(--primary)] disabled:cursor-not-allowed disabled:opacity-40 aria-[invalid=true]:shadow-[inset_0_0_0_2px_var(--error)]";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(field, "h-12", className)} {...props} />
  ),
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(field, "min-h-24 py-3", className)} {...props} />
));
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, ...props }, ref) => (
  <select ref={ref} className={cn(field, "h-12 cursor-pointer", className)} {...props} />
));
Select.displayName = "Select";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-label-lg text-on-surface-variant", className)} {...props} />;
}

export function Field({
  label,
  hint,
  children,
  htmlFor,
  className,
}: {
  label: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
  htmlFor?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor} className="px-1">
        {label}
      </Label>
      {children}
      {hint ? <p className="px-1 text-body-sm text-on-surface-variant">{hint}</p> : null}
    </div>
  );
}

import type { ComponentPropsWithRef, ReactNode } from "react";

const INPUT = "box-border min-h-11 w-full border border-dim bg-void px-3 text-sm text-text focus:border-magenta focus:outline-none";

interface FieldProps {
  label: string;
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** A cyan caps label wrapping its control, with an optional italic hint below. */
export function Field({ label, hint, className = "", children }: FieldProps) {
  return (
    <label className={`flex flex-col gap-1 text-xs font-bold text-cyan ${className}`}>
      {label}
      {children}
      {hint && <span className="font-normal italic text-violet">{hint}</span>}
    </label>
  );
}

export function Input({ className = "", ...rest }: ComponentPropsWithRef<"input">) {
  return <input className={`${INPUT} ${className}`} {...rest} />;
}

export function Textarea({ className = "", ...rest }: ComponentPropsWithRef<"textarea">) {
  return <textarea className={`${INPUT} py-3 text-[13px] ${className}`} {...rest} />;
}

import type { ButtonHTMLAttributes } from "react";

const TONES = {
  magenta: "bg-magenta text-void",
  lime: "bg-lime text-void",
  red: "bg-red text-void",
  amber: "bg-amber text-void",
  cyan: "border border-cyan text-cyan",
  redOutline: "border border-red text-red",
  ghost: "border border-dim text-violet",
} as const;

export type Tone = keyof typeof TONES;

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: Tone;
  small?: boolean;
}

export function Button({ tone = "cyan", small, className = "", type = "button", ...rest }: Props) {
  return (
    <button
      type={type}
      className={`inline-flex min-h-11 cursor-pointer items-center justify-center font-bold disabled:cursor-not-allowed disabled:border disabled:border-dim disabled:bg-transparent disabled:text-dim ${
        small ? "px-3 text-xs" : "px-4 text-sm"
      } ${TONES[tone]} ${className}`}
      {...rest}
    />
  );
}

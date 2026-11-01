"use client";

import { useId, useState } from "react";

interface Props<T extends string> {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}

/** A themed single-choice list: native <select> menus cannot be styled. */
export function Select<T extends string>({ label, value, options, onChange }: Props<T>) {
  const [open, setOpen] = useState(false);
  const labelId = useId();
  const current = options.find((o) => o.value === value);

  return (
    <div
      className="relative flex flex-col gap-1 text-xs font-bold text-cyan"
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setOpen(false)}
      onKeyDown={(e) => e.key === "Escape" && open && (e.stopPropagation(), setOpen(false))}
    >
      <span id={labelId}>{label}</span>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={labelId}
        onClick={() => setOpen(!open)}
        className={`box-border flex min-h-11 w-full cursor-pointer items-center gap-3 border bg-void px-3 text-left text-sm font-normal text-text hover:border-magenta ${open ? "border-magenta" : "border-dim"}`}
      >
        <span className="flex-auto">{current?.label}</span>
        <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden className={`flex-none ${open ? "rotate-180" : ""}`}>
          <path d="M2 4 L6 8 L10 4" fill="none" stroke="var(--color-cyan)" strokeWidth="1.5" strokeLinecap="square" />
        </svg>
      </button>
      {open && (
        <div
          role="listbox"
          aria-labelledby={labelId}
          className="absolute left-0 right-0 top-full z-10 mt-1 box-border flex flex-col gap-0.5 border border-magenta bg-void p-1 shadow-[0_0_0_4px_var(--color-panel)]"
        >
          {options.map((o) => {
            const on = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className={`box-border flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-panel hover:shadow-[inset_0_0_0_1px_var(--color-dim)] ${on ? "bg-panel font-bold text-cyan" : "font-normal text-text"}`}
              >
                <span aria-hidden className="w-3 text-magenta">
                  {on ? "◆" : ""}
                </span>
                {o.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

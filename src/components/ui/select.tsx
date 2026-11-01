"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

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
  const valueId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value);

  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };

  // Opening moves focus to the chosen option, so the arrow keys work from there.
  useEffect(() => {
    if (open) list.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
  }, [open]);

  const moveFocus = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="option"]'));
    const at = items.indexOf(document.activeElement as HTMLElement);
    const to = { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: items.length - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    items[(to + items.length) % items.length]?.focus();
  };

  return (
    <div
      className="relative flex flex-col gap-1 text-xs font-bold text-cyan"
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setOpen(false)}
      onKeyDown={(e) => e.key === "Escape" && open && (e.stopPropagation(), close())}
    >
      <span id={labelId}>{label}</span>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={`${labelId} ${valueId}`}
        onClick={() => setOpen(!open)}
        className={`box-border flex min-h-11 w-full cursor-pointer items-center gap-3 border bg-void px-3 text-left text-sm font-normal text-text hover:border-magenta ${open ? "border-magenta" : "border-dim"}`}
      >
        <span id={valueId} className="flex-auto">{current?.label}</span>
        <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden className={`flex-none ${open ? "rotate-180" : ""}`}>
          <path d="M2 4 L6 8 L10 4" fill="none" stroke="var(--color-cyan)" strokeWidth="1.5" strokeLinecap="square" />
        </svg>
      </button>
      {open && (
        <div
          ref={list}
          role="listbox"
          aria-labelledby={labelId}
          onKeyDown={moveFocus}
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
                  close();
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

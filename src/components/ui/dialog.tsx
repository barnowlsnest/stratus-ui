"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

const LINE = { magenta: "border-magenta", lime: "border-lime", red: "border-red", amber: "border-amber" } as const;
const TEXT = { magenta: "text-cyan", lime: "text-lime", red: "text-red", amber: "text-amber" } as const;
const RULE = { magenta: "bg-dim", lime: "bg-lime", red: "bg-red", amber: "bg-amber" } as const;

interface Props {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  tone?: keyof typeof LINE;
  maxWidth?: number;
  /** Extra header content between the title and the close button. */
  meta?: ReactNode;
  alert?: boolean;
  children: ReactNode;
}

/** A modal on the native <dialog>: focus trap, Escape and the backdrop come from the browser. */
export function Dialog({ open, onClose, title, tone = "magenta", maxWidth = 560, meta, alert, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      role={alert ? "alertdialog" : "dialog"}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === ref.current && onClose()}
      style={{ maxWidth }}
      className={`m-auto box-border w-full border bg-void p-0 text-text shadow-[0_0_0_4px_var(--color-panel)] ${LINE[tone]}`}
    >
      {open && (
        <div className="flex flex-col gap-3 px-4 pb-4 pt-2">
          <div className="flex flex-wrap items-center gap-3">
            <span id={titleId} className={`font-bold ${TEXT[tone]}`}>
              ▛ {title}
            </span>
            {meta}
            <span aria-hidden className={`h-px min-w-5 flex-1 ${RULE[tone]}`} />
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="min-h-11 w-11 cursor-pointer border border-dim text-base text-text"
            >
              ✕
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

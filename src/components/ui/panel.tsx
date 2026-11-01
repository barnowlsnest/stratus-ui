import type { ReactNode } from "react";

const BORDER = { magenta: "border-magenta", dim: "border-dim", red: "border-red" } as const;
const TITLE = { cyan: "text-cyan", violet: "text-violet", red: "text-red" } as const;
const RULE = { magenta: "bg-dim", dim: "bg-dim", red: "bg-red" } as const;

interface PanelProps {
  title: ReactNode;
  /** Colour of the frame: magenta marks the focused panel. */
  border?: keyof typeof BORDER;
  titleTone?: keyof typeof TITLE;
  /** Controls placed after the rule, on the right of the header. */
  actions?: ReactNode;
  /** Content placed between the title and the rule. */
  meta?: ReactNode;
  className?: string;
  children?: ReactNode;
}

/** A squared panel with the CLI's `▛ TITLE ───` header. */
export function Panel({ title, border = "dim", titleTone = "violet", actions, meta, className = "", children }: PanelProps) {
  return (
    <section className={`box-border min-w-0 border px-3 pb-4 pt-2 ${BORDER[border]} ${className}`}>
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <span className={`font-bold ${TITLE[titleTone]}`}>▛ {title}</span>
        {meta}
        <span aria-hidden className={`h-px min-w-5 flex-1 ${RULE[border]}`} />
        {actions}
      </div>
      {children}
    </section>
  );
}

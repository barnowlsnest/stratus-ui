interface Props {
  label: string;
  on: boolean;
  onChange: (on: boolean) => void;
}

export function Toggle({ label, on, onChange }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={`inline-flex min-h-11 cursor-pointer items-center gap-2 text-xs font-bold ${on ? "text-text" : "text-violet"}`}
    >
      <span aria-hidden className={`relative h-[18px] w-9 border ${on ? "border-magenta bg-panel" : "border-dim"}`}>
        <span className={`absolute top-0.5 size-3 ${on ? "left-5 bg-magenta" : "left-0.5 bg-dim"}`} />
      </span>
      {label}
    </button>
  );
}

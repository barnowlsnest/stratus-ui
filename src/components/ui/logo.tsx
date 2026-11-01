import Link from "next/link";

// Letters fade magenta -> violet -> cyan, like the CLI banner.
const LETTERS = [
  ["S", "#ff2bd6"],
  ["T", "#df40e4"],
  ["R", "#c056f1"],
  ["A", "#a06bff"],
  ["T", "#6b97ff"],
  ["U", "#35c4ff"],
  ["S", "#00f0ff"],
] as const;

export function Logo() {
  return (
    <Link href="/" aria-label="Stratus" className="inline-flex min-h-11 items-center gap-3 text-base font-bold">
      <span aria-hidden className="size-[26px] bg-magenta [clip-path:polygon(0_0,100%_0,100%_40%,40%_40%,40%_100%,0_100%)]" />
      <span aria-hidden className="flex gap-2.5">
        {LETTERS.map(([ch, color], i) => (
          <span key={i} style={{ color }}>
            {ch}
          </span>
        ))}
      </span>
      <span aria-hidden className="size-[26px] bg-magenta [clip-path:polygon(100%_100%,0_100%,0_60%,60%_60%,60%_0,100%_0)]" />
    </Link>
  );
}

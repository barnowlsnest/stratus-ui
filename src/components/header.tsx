"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/ui/logo";
import { useStratus, type Status } from "@/components/stratus-provider";

const NAV = [
  { href: "/connections", label: "CONNECTIONS" },
  { href: "/", label: "RECORDS" },
  { href: "/operations", label: "OPERATIONS" },
];

const STATUS: Record<Status, { text: string; tone: string }> = {
  online: { text: "▶ ONLINE", tone: "text-lime" },
  connecting: { text: "▷ CONNECTING", tone: "text-amber" },
  offline: { text: "▷ OFFLINE", tone: "text-red" },
  none: { text: "▷ NOT CONNECTED", tone: "text-violet" },
};

export function Header() {
  const path = usePathname();
  const { conn, status } = useStratus();
  const s = STATUS[status];

  return (
    <header className="flex flex-wrap items-center gap-4">
      <nav aria-label="Sections" className="flex flex-wrap gap-1">
        {NAV.map((n) => {
          const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active ? "page" : undefined}
              className={`inline-flex min-h-11 items-center px-3 text-cyan hover:text-magenta ${active ? "bg-magenta font-bold text-void hover:text-void" : ""}`}
            >
              {n.label}
            </Link>
          );
        })}
      </nav>
      <span aria-hidden className="h-px min-w-10 flex-1 bg-dim" />
      {path !== "/connections" && (
        <>
          <span role="status" className={`font-bold ${s.tone}`}>
            {s.text}
          </span>
          {conn && (
            <span className="text-violet">
              {conn.name} · {conn.address}
            </span>
          )}
        </>
      )}
      <Logo />
    </header>
  );
}

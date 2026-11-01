"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useStratus } from "@/components/stratus-provider";
import { Panel } from "@/components/ui/panel";

/** Renders its page only when a server is selected; otherwise points to Connections. */
export function RequireConnection({ children }: { children: ReactNode }) {
  const { status } = useStratus();
  if (status !== "none") return <>{children}</>;
  return (
    <main className="flex flex-1 items-start">
      <Panel title="NOT CONNECTED" border="magenta" titleTone="cyan" className="w-full">
        <p className="mb-3 mt-2 text-violet">No server is selected. Add one, or open a saved one, to see its stream.</p>
        <Link href="/connections" className="inline-flex min-h-11 items-center bg-magenta px-4 text-sm font-bold text-void">
          GO TO CONNECTIONS
        </Link>
      </Panel>
    </main>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, post } from "@/lib/client/api";
import { TRANSPORTS, type ConnectionView, type StreamInfo, type Transport } from "@/lib/types";
import { useStratus } from "@/components/stratus-provider";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";

type Health = { state: "checking" } | { state: "online" | "slow"; ms: number } | { state: "offline"; error: string };

/** Slower than this counts as degraded. */
const SLOW_MS = 400;

const HEALTH = {
  checking: { text: "CHECKING…", color: "text-violet", mark: "◇" },
  online: { text: "ONLINE", color: "text-lime", mark: "◆" },
  slow: { text: "SLOW", color: "text-amber", mark: "◆" },
  offline: { text: "OFFLINE", color: "text-red", mark: "◇" },
} as const;

const transportLabel = (t: Transport) => TRANSPORTS.find((x) => x.value === t)?.label.replace(/ \(.*\)/, "") ?? t;

interface Draft {
  name: string;
  address: string;
  transport: Transport;
  caFile: string;
  token: string;
}
const EMPTY: Draft = { name: "", address: "", transport: "plaintext", caFile: "", token: "" };

export function ConnectionsView() {
  const router = useRouter();
  const { conn: active, reloadConn } = useStratus();
  const [list, setList] = useState<ConnectionView[]>([]);
  const [health, setHealth] = useState<Record<string, Health>>({});
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [pending, setPending] = useState<Draft | null>(null);
  const [failure, setFailure] = useState<{ message: string; mode: "test" | "save" } | null>(null);
  const [reachable, setReachable] = useState<StreamInfo | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const nameInput = useRef<HTMLInputElement>(null);

  const probe = useCallback(async (c: ConnectionView) => {
    setHealth((h) => ({ ...h, [c.id]: { state: "checking" } }));
    const t0 = performance.now();
    try {
      await post<StreamInfo>("/api/connections/test", { id: c.id });
      const ms = Math.round(performance.now() - t0);
      setHealth((h) => ({ ...h, [c.id]: { state: ms > SLOW_MS ? "slow" : "online", ms } }));
    } catch (e) {
      setHealth((h) => ({ ...h, [c.id]: { state: "offline", error: e instanceof Error ? e.message : String(e) } }));
    }
  }, []);

  const load = useCallback(async () => {
    const res = await api<{ connections: ConnectionView[] }>("/api/connections");
    setList(res.connections);
    res.connections.forEach(probe);
  }, [probe]);

  useEffect(() => {
    load().catch((e: unknown) => setFormError(e instanceof Error ? e.message : String(e)));
  }, [load]);

  const report = (e: unknown) => setFormError(e instanceof Error ? e.message : String(e));

  // One switch at a time: overlapping ones could finish in any order and leave the wrong server active.
  const open = async (c: ConnectionView) => {
    setOpening(true);
    setFormError(null);
    try {
      await api(`/api/connections/${c.id}`, { method: "PUT" });
      await reloadConn();
      router.push("/");
    } catch (e) {
      report(e);
    } finally {
      setOpening(false);
    }
  };

  const remove = async (c: ConnectionView) => {
    if (!window.confirm(`Remove "${c.name}" (${c.address})? The saved address and token are deleted.`)) return;
    setFormError(null);
    try {
      await api(`/api/connections/${c.id}`, { method: "DELETE" });
      // Removing the active server selects the first one left, or none if that was the last.
      if (c.id === active?.id) await reloadConn();
      await load();
    } catch (e) {
      report(e);
    }
  };

  const run = async (mode: "test" | "save") => {
    setFormError(null);
    setReachable(null);
    setFailure(null);
    const d = draft;
    const body = { name: d.name, address: d.address, transport: d.transport, caFile: d.caFile, token: d.token };
    setPending({ ...d, name: d.name.trim() || d.address.trim() });
    try {
      const info = await post<StreamInfo>("/api/connections/test", body);
      if (mode === "save") {
        await post("/api/connections", body);
        setDraft(EMPTY);
        await load();
      } else {
        setReachable(info);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      // A malformed form is the user's to fix; an unreachable server gets the failure dialog.
      if (/^(Address|Unknown|A CA)/.test(message)) setFormError(message);
      else setFailure({ message, mode });
    } finally {
      setPending(null);
    }
  };

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  return (
    <main className="flex flex-1 flex-wrap items-stretch gap-4">
      <Panel
        title="SERVERS"
        border="magenta"
        titleTone="cyan"
        className="min-w-[min(100%,520px)] flex-[999_1_520px] self-stretch"
      >
        <ul className="m-0 flex list-none flex-col p-0">
          {list.map((c) => {
            const h = health[c.id] ?? { state: "checking" as const };
            const v = HEALTH[h.state];
            const isActive = c.id === active?.id;
            return (
              <li
                key={c.id}
                className={`flex flex-wrap items-center gap-3 rounded-md p-2 hover:bg-panel hover:shadow-[inset_0_0_0_1px_var(--color-dim)] ${isActive ? "bg-panel" : ""}`}
              >
                <span aria-hidden className={`flex-none font-bold ${v.color}`}>
                  {v.mark}
                </span>
                <div className="min-w-0 flex-[1_1_220px]">
                  <div className="font-bold">{c.name}</div>
                  <div className="text-xs text-violet [overflow-wrap:anywhere]">
                    {c.address} · {transportLabel(c.transport)} · {c.hasToken ? "token" : "no auth"}
                  </div>
                  {h.state === "offline" && <div className="text-xs text-red [overflow-wrap:anywhere]">{h.error}</div>}
                </div>
                <span className={`text-xs font-bold ${v.color}`}>{v.text}</span>
                <Button disabled={opening} onClick={() => open(c)}>OPEN</Button>
                <Button
                  tone="redOutline"
                  aria-label={`Remove ${c.name}`}
                  onClick={() => remove(c)}
                >
                  REMOVE
                </Button>
              </li>
            );
          })}
          {pending && (
            <li aria-busy className="flex flex-wrap items-center gap-3 rounded-md bg-panel p-2 shadow-[inset_0_0_0_1px_var(--color-dim)]">
              <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden className="flex-none animate-spin">
                <circle cx="10" cy="10" r="8" fill="none" stroke="var(--color-dim)" strokeWidth="2" />
                <path d="M10 2 A8 8 0 0 1 18 10" fill="none" stroke="var(--color-cyan)" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <div className="flex min-w-0 flex-[1_1_220px] flex-col gap-1">
                <div className="font-bold">{pending.name}</div>
                <div className="text-xs text-violet [overflow-wrap:anywhere]">
                  {pending.address} · {transportLabel(pending.transport)}
                </div>
                <div className="h-0.5 overflow-hidden bg-void">
                  <div className="h-0.5 w-2/5 bg-cyan" />
                </div>
              </div>
              <span role="status" className="text-xs font-bold text-cyan">
                CONNECTING…
              </span>
              <Button disabled>OPEN</Button>
            </li>
          )}
        </ul>
      </Panel>

      <Panel title="NEW LINK" className="min-w-[min(100%,340px)] flex-[1_1_340px] self-stretch px-4">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            run("save");
          }}
        >
          <Field label="NAME">
            <Input ref={nameInput} placeholder="local" value={draft.name} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <Field label="ADDRESS (HOST:PORT)" hint="gRPC endpoint, called from the Next.js server">
            <Input placeholder="localhost:8000" value={draft.address} onChange={(e) => set("address", e.target.value)} />
          </Field>
          <Select label="TRANSPORT" value={draft.transport} options={TRANSPORTS} onChange={(v) => set("transport", v)} />
          {draft.transport === "tls-ca" && (
            <Field label="CA FILE" hint="path on the Next.js server, PEM">
              <Input placeholder="/etc/stratus/ca.pem" value={draft.caFile} onChange={(e) => set("caFile", e.target.value)} />
            </Field>
          )}
          <Field label="AUTH TOKEN (OPTIONAL)" hint="kept on the Next.js server, never in the browser">
            <Input type="password" autoComplete="off" placeholder="bearer token" value={draft.token} onChange={(e) => set("token", e.target.value)} />
          </Field>
          {formError && (
            <p role="alert" className="m-0 bg-panel px-3 py-2 text-[13px] text-red">
              ▲ {formError}
            </p>
          )}
          {reachable && (
            <p role="status" className="m-0 bg-panel px-3 py-2 text-[13px] text-lime">
              ◆ reachable · stream #{reachable.range.start} → #{reachable.range.end}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button className="flex-[1_1_120px]" disabled={!!pending} onClick={() => run("test")}>
              TEST
            </Button>
            <Button type="submit" tone="magenta" className="flex-[1_1_120px]" disabled={!!pending}>
              SAVE
            </Button>
          </div>
        </form>
      </Panel>

      <Dialog open={!!failure} onClose={() => setFailure(null)} title="CONNECTION FAILED" tone="red" maxWidth={460} alert>
        <p className="m-0">
          Could not reach <strong className="text-cyan">{draft.address || "the server"}</strong> over {transportLabel(draft.transport)}. Check that the
          server is running and the address and transport are right.
        </p>
        <pre className="m-0 whitespace-pre-wrap bg-panel p-2 text-xs text-violet [overflow-wrap:anywhere]">{failure?.message}</pre>
        <div className="flex flex-wrap gap-2">
          <Button tone="ghost" className="flex-[1_1_120px]" onClick={() => setFailure(null)}>
            DISMISS
          </Button>
          <Button
            className="flex-[1_1_120px]"
            onClick={() => {
              setFailure(null);
              nameInput.current?.focus();
            }}
          >
            EDIT LINK
          </Button>
          <Button
            tone="red"
            className="flex-[1_1_120px]"
            onClick={() => {
              const mode = failure?.mode ?? "test";
              setFailure(null);
              run(mode);
            }}
          >
            RETRY
          </Button>
        </div>
      </Dialog>
    </main>
  );
}

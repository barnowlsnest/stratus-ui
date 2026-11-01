"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "@/lib/client/api";
import type { ConnectionView, StreamInfo } from "@/lib/types";

export type Status = "connecting" | "online" | "offline" | "none";

interface StratusState {
  conn: ConnectionView | null;
  info: StreamInfo | null;
  status: Status;
  error: string | null;
  /** When the stream info was last fetched (ms since epoch). */
  syncedAt: number | null;
  autoRefresh: boolean;
  setAutoRefresh: (on: boolean) => void;
  refresh: () => Promise<void>;
  /** Re-reads which server is active, after the user picks another. */
  reloadConn: () => Promise<void>;
}

const Ctx = createContext<StratusState | null>(null);

const POLL_MS = 3000;

export function StratusProvider({ children }: { children: ReactNode }) {
  const [conn, setConn] = useState<ConnectionView | null>(null);
  const [info, setInfo] = useState<StreamInfo | null>(null);
  const [status, setStatus] = useState<Status>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [syncedAt, setSyncedAt] = useState<number | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const seq = useRef(0);
  const reloads = useRef(0);

  const refresh = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const next = await api<StreamInfo>("/api/info");
      if (mine !== seq.current) return;
      setInfo(next);
      setStatus("online");
      setError(null);
      setSyncedAt(Date.now());
    } catch (e) {
      if (mine !== seq.current) return;
      setStatus("offline");
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const reloadConn = useCallback(async () => {
    const mine = ++reloads.current;
    try {
      const { connections, active } = await api<{ connections: ConnectionView[]; active: string | null }>("/api/connections");
      if (mine !== reloads.current) return; // a newer reload was started while this one was in flight
      const next = connections.find((c) => c.id === active) ?? null;
      seq.current++; // an in-flight refresh belongs to the previous server
      setInfo(null);
      setSyncedAt(null);
      setError(null);
      setStatus(next ? "connecting" : "none");
      setConn(next);
      // The poll only restarts when the server changes; reopening the same one still needs fresh info.
      if (next) void refresh();
    } catch (e) {
      if (mine !== reloads.current) return; // only the latest reload speaks for the current state
      // The active server may have just changed on the server, so showing the old one would be a lie.
      seq.current++;
      setConn(null);
      setInfo(null);
      setSyncedAt(null);
      setStatus("offline");
      setError(e instanceof Error ? e.message : String(e));
      throw e;
    }
  }, [refresh]);

  useEffect(() => {
    reloadConn().catch(() => setStatus("offline"));
  }, [reloadConn]);

  const connId = conn?.id;
  useEffect(() => {
    if (!connId) return;
    refresh();
    if (!autoRefresh) return;
    const t = setInterval(refresh, POLL_MS);
    return () => clearInterval(t);
  }, [connId, autoRefresh, refresh]);

  const value = useMemo(
    () => ({ conn, info, status, error, syncedAt, autoRefresh, setAutoRefresh, refresh, reloadConn }),
    [conn, info, status, error, syncedAt, autoRefresh, refresh, reloadConn],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStratus(): StratusState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStratus must be used inside <StratusProvider>");
  return v;
}

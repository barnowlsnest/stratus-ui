"use client";

import { useRef, useState, type ReactNode } from "react";
import { post } from "@/lib/client/api";
import { bytesToB64 } from "@/lib/client/bytes";
import type { AddResult, DeleteResult, StreamRange } from "@/lib/types";
import { useStratus } from "@/components/stratus-provider";
import { Button, type Tone } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";

interface FormProps {
  /** Called after the server accepted the command. */
  onDone?: () => void;
  /** Present in a dialog: shows a CANCEL button. */
  onCancel?: () => void;
  /** Dialog buttons are solid, page buttons follow the Operations screen. */
  dialog?: boolean;
}

const range = (r: StreamRange) => `#${r.start} → #${r.end}`;

function Result({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <div role={ok ? "status" : "alert"} className={`bg-panel px-3 py-2 text-[13px] ${ok ? "text-lime" : "text-red"}`}>
      {ok ? "◆ " : "▲ "}
      {children}
    </div>
  );
}

function Actions({ onCancel, children }: { onCancel?: () => void; children: ReactNode }) {
  return (
    <div className="flex flex-wrap justify-end gap-2">
      {onCancel && (
        <Button tone="ghost" onClick={onCancel}>
          CANCEL
        </Button>
      )}
      {children}
    </div>
  );
}

const Desc = ({ children }: { children: ReactNode }) => <p className="m-0 text-violet">{children}</p>;

function useCommand<T>(run: () => Promise<T>, onDone?: () => void) {
  const { refresh } = useStratus();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<T | null>(null);
  const exec = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await run());
      await refresh();
      onDone?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, result, exec };
}

export function AppendForm({ onDone, onCancel, dialog }: FormProps) {
  const [key, setKey] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState<{ name: string; bytes: Uint8Array } | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const cmd = useCommand<AddResult>(() => {
    const bytes = file ? file.bytes : new TextEncoder().encode(text);
    return post<AddResult>("/api/ops", { op: "append", dedupKey: key, data: bytesToB64(bytes) });
  }, onDone);

  return (
    <>
      <Desc>
        Push a record onto the stream. A dedup key seen within the server&apos;s dedup window (default 1m) is dropped and counted as a duplicate.
      </Desc>
      <Field label="DEDUP KEY" hint="non-zero number, required">
        <Input inputMode="numeric" placeholder="1" value={key} onChange={(e) => setKey(e.target.value)} className="max-w-60" />
      </Field>
      <Field label="DATA" hint="just under 4 MiB on a default server">
        {file ? (
          <div className="flex items-center gap-3 border border-dim px-3 py-2 font-normal text-text">
            <span className="min-w-0 flex-1 truncate">
              {file.name} · {file.bytes.length} B
            </span>
            <button type="button" onClick={() => setFile(null)} className="min-h-11 cursor-pointer px-2 font-bold text-cyan">
              REMOVE
            </button>
          </div>
        ) : (
          <Textarea rows={dialog ? 6 : 4} placeholder="record payload" value={text} onChange={(e) => setText(e.target.value)} />
        )}
      </Field>
      <input
        ref={picker}
        type="file"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) setFile({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) });
          e.target.value = "";
        }}
      />
      {cmd.result && (
        <Result ok>
          added {range(cmd.result.added)} · stream {range(cmd.result.stream)} · {cmd.result.duplicates} duplicates
        </Result>
      )}
      {cmd.error && <Result ok={false}>{cmd.error}</Result>}
      <Actions onCancel={onCancel}>
        <Button tone="cyan" onClick={() => picker.current?.click()}>
          UPLOAD FILE
        </Button>
        <Button tone={dialog ? "lime" : "magenta"} disabled={cmd.busy} onClick={cmd.exec}>
          ▶ APPEND
        </Button>
      </Actions>
    </>
  );
}

export function DeleteForm({ onDone, onCancel, dialog }: FormProps) {
  const { info } = useStratus();
  const [id, setId] = useState("");
  const cmd = useCommand<DeleteResult>(() => post<DeleteResult>("/api/ops", { op: "delete", endId: id }), onDone);

  return (
    <>
      <Desc>Delete every record up to and including an ID. The record with that ID is removed. This cannot be undone.</Desc>
      <Field label="DELETE THROUGH ID">
        <Input inputMode="numeric" placeholder="1000" value={id} onChange={(e) => setId(e.target.value)} className="max-w-52" />
      </Field>
      <Result ok={false}>
        {info ? `stream is ${range(info.range)} · ` : ""}records before this id are gone for good
      </Result>
      {cmd.result && (
        <Result ok>
          deleted {range(cmd.result.deleted)} · stream now {range(cmd.result.stream)}
        </Result>
      )}
      {cmd.error && <Result ok={false}>{cmd.error}</Result>}
      <Actions onCancel={onCancel}>
        <Button tone={dialog ? "red" : "redOutline"} disabled={cmd.busy || id.trim() === ""} onClick={cmd.exec}>
          DELETE RECORDS
        </Button>
      </Actions>
    </>
  );
}

export function ReconcileForm({ onDone, onCancel, dialog }: FormProps) {
  const { info, syncedAt } = useStratus();
  const cmd = useCommand<{ range: StreamRange }>(() => post("/api/ops", { op: "reconcile" }), onDone);
  const tone: Tone = dialog ? "amber" : "cyan";

  return (
    <>
      <Desc>Rebuild the in-memory cache from the WAL. Useful after a delete, or when cold reads have churned the cache.</Desc>
      {info && (
        <div className="bg-panel px-3 py-2 text-[13px]">
          cache {info.cached} · disk {info.disk}
          {syncedAt ? ` · last sync ${new Date(syncedAt).toLocaleTimeString([], { hour12: false })}` : ""}
        </div>
      )}
      {cmd.result && <Result ok>cache rebuilt over {range(cmd.result.range)}</Result>}
      {cmd.error && <Result ok={false}>{cmd.error}</Result>}
      <Actions onCancel={onCancel}>
        <Button tone={tone} disabled={cmd.busy} onClick={cmd.exec}>
          RECONCILE CACHE
        </Button>
      </Actions>
    </>
  );
}

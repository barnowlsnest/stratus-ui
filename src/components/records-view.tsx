"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/client/api";
import { b64ToBytes, clock, clockMs, download, preview, prettyJson, sizeLabel, toHex, toText } from "@/lib/client/bytes";
import type { StreamRecord } from "@/lib/types";
import { AppendForm, DeleteForm, ReconcileForm } from "@/components/op-forms";
import { useStratus } from "@/components/stratus-provider";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";
import { Toggle } from "@/components/ui/toggle";

/** The CLI keeps the same many records in its live buffer. */
const BUFFER = 5000;
/** The most records one range read returns (see /api/records); the default window ends at the stream's last ID. */
const WINDOW = 500;
const HOVER = "rounded-md hover:bg-panel";

interface Rec {
  id: number;
  bytes: Uint8Array;
  text: string;
  /** When this browser received the record: the server stores none. */
  time: Date;
}

const toRec = (r: StreamRecord, time: Date): Rec => {
  const bytes = b64ToBytes(r.data);
  return { id: r.id, bytes, text: toText(bytes), time };
};

type Op = "append" | "delete" | "reconcile";
const OPS: { op: Op; name: string; desc: string; tone: "lime" | "red" | "amber"; text: string; hover: string }[] = [
  { op: "append", name: "APPEND", desc: "push a record onto the stream", tone: "lime", text: "text-lime", hover: "hover:shadow-[inset_0_0_0_1px_var(--color-lime)]" },
  { op: "delete", name: "DELETE", desc: "truncate the stream up to an id", tone: "red", text: "text-red", hover: "hover:shadow-[inset_0_0_0_1px_var(--color-red)]" },
  { op: "reconcile", name: "RECONCILE", desc: "rebuild the in-memory cache", tone: "amber", text: "text-amber", hover: "hover:shadow-[inset_0_0_0_1px_var(--color-amber)]" },
];

const VIEWS = ["pretty", "text", "hex"] as const;
type View = (typeof VIEWS)[number];

/** "30s", "30" or "2m" as seconds. */
function seconds(raw: string): number {
  const m = /^(\d+)\s*(s|m|h)?$/i.exec(raw.trim());
  if (!m) return 30;
  return Number(m[1]) * ({ s: 1, m: 60, h: 3600 }[(m[2] ?? "s").toLowerCase() as "s" | "m" | "h"]);
}

export function RecordsView() {
  const { conn, info, status, syncedAt, autoRefresh, setAutoRefresh } = useStratus();
  const [mode, setMode] = useState<"range" | "tail">("range");
  const [startId, setStartId] = useState("0");
  const [endId, setEndId] = useState("0");
  const [tailStart, setTailStart] = useState("1");
  const [tailMax, setTailMax] = useState("100");
  const [tailTimeout, setTailTimeout] = useState("30s");
  const [records, setRecords] = useState<Rec[]>([]);
  const [picked, setPicked] = useState<number | null>(null);
  const [showTime, setShowTime] = useState(true);
  const [wrap, setWrap] = useState(false);
  const [rx, setRx] = useState(0);
  const [rate, setRate] = useState(0);
  const [following, setFollowing] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [full, setFull] = useState(false);
  const [view, setView] = useState<View>("pretty");
  const [op, setOp] = useState<Op | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const source = useRef<EventSource | null>(null);
  // Inputs the user has typed in keep their value; the others follow the stream.
  const touched = useRef({ start: false, end: false, tail: false });
  const arrivals = useRef<number[]>([]);
  // Only the latest range request may update the view; older responses are dropped.
  const rangeRequest = useRef(0);

  const stopTail = useCallback(() => {
    source.current?.close();
    source.current = null;
    setFollowing(false);
  }, []);

  const loadRange = useCallback(async () => {
    const mine = ++rangeRequest.current;
    setLoading(true);
    setError(null);
    try {
      const res = await api<{ records: StreamRecord[]; truncated: boolean }>(
        `/api/records?start=${encodeURIComponent(startId)}&end=${encodeURIComponent(endId)}`,
      );
      if (mine !== rangeRequest.current) return;
      const at = new Date();
      setRecords(res.records.map((r) => toRec(r, at)));
      setNote(res.truncated ? "showing 500 records, narrow the range to see others" : null);
      setPicked((p) => (res.records.some((r) => r.id === p) ? p : (res.records.at(-1)?.id ?? null)));
    } catch (e) {
      if (mine === rangeRequest.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (mine === rangeRequest.current) setLoading(false);
    }
  }, [startId, endId]);

  const startTail = useCallback(() => {
    stopTail();
    setError(null);
    setRecords([]);
    setRx(0);
    setPicked(null);
    arrivals.current = [];
    const from = Number(tailStart) > 0 ? tailStart : "1";
    setNote(`live tail from #${from}`);
    const es = new EventSource(`/api/tail?start=${from}&max=${encodeURIComponent(tailMax)}&timeout=${seconds(tailTimeout)}`);
    source.current = es;
    setFollowing(true);
    es.addEventListener("records", (ev) => {
      const at = new Date();
      const batch = (JSON.parse((ev as MessageEvent<string>).data) as StreamRecord[]).map((r) => toRec(r, at));
      arrivals.current.push(...batch.map(() => at.getTime()));
      setRx((n) => n + batch.length);
      setRecords((prev) => [...prev, ...batch].slice(-BUFFER));
      setPicked((p) => p ?? batch[0]?.id ?? null);
    });
    es.addEventListener("end", () => {
      setNote("tail ended: max records or timeout reached");
      stopTail();
    });
    es.addEventListener("error", (ev) => {
      const data = (ev as MessageEvent<string | undefined>).data;
      if (data) setError((JSON.parse(data) as { error: string }).error);
      else if (es.readyState === EventSource.CLOSED) setError("lost connection to the Next.js server");
      stopTail();
    });
  }, [stopTail, tailStart, tailMax, tailTimeout]);

  // Range mode shows the stream as soon as a server is selected; changing server starts over.
  const connId = conn?.id;
  useEffect(() => {
    stopTail();
    if (!connId) return;
    setRecords([]);
    setPicked(null);
    setRx(0);
    setNote(null);
    if (mode === "range") loadRange();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload on server or mode change only, not on every keystroke
  }, [connId, mode]);

  useEffect(() => stopTail, [stopTail]);

  // A new server starts with untouched inputs.
  useEffect(() => {
    touched.current = { start: false, end: false, tail: false };
    setStartId("0");
    setEndId("0");
    setTailStart("1");
  }, [connId]);

  // Prefill the ID inputs from the stream's real first and last ID.
  useEffect(() => {
    if (!info || info.disk === 0 || info.range.end === 0) return;
    const { start, end } = info.range;
    if (!touched.current.start) setStartId(String(Math.max(start, end - WINDOW + 1)));
    if (!touched.current.end) setEndId(String(end));
    if (!touched.current.tail) setTailStart(String(start));
  }, [info]);

  // Clock for SYNC age and the rec/s window.
  useEffect(() => {
    const t = setInterval(() => {
      const cutoff = Date.now() - 5000;
      arrivals.current = arrivals.current.filter((x) => x > cutoff);
      setRate(arrivals.current.length / 5);
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const sel = useMemo(() => records.find((r) => r.id === picked) ?? null, [records, picked]);
  const split = info && info.disk > 0 ? Math.min(100, Math.round((info.cached / info.disk) * 100)) : 0;
  const age = syncedAt ? Math.max(0, Math.round((now - syncedAt) / 1000)) : null;

  const infoRows: [string, string][] = [
    ["RANGE", info ? `#${info.range.start} → #${info.range.end}` : "—"],
    ["HELD", String(records.length)],
    ["CACHE", info ? String(info.cached) : "—"],
    ["DISK", info ? String(info.disk) : "—"],
    ["FLUX", `${rate.toFixed(1)} rec/s`],
    ["SYNC", syncedAt && age !== null ? `${clock(new Date(syncedAt))} · ${age}s` : "—"],
  ];

  const body = sel ? (view === "hex" ? toHex(sel.bytes) : view === "text" ? sel.text : prettyJson(sel.text)) : "";
  const tabClass = (on: boolean) =>
    `min-h-11 cursor-pointer border px-3 text-sm font-bold ${on ? "border-magenta bg-magenta text-void" : "border-magenta text-text hover:bg-panel"}`;

  return (
    <div className="flex flex-1 flex-wrap items-stretch gap-4">
      <Panel
        title="STREAM"
        border="magenta"
        titleTone="cyan"
        className="flex min-h-[700px] min-w-[min(100%,520px)] flex-[999_1_520px] flex-col gap-2"
        meta={
          <>
            <span aria-hidden className="text-dim">│</span>
            <div role="tablist" aria-label="Read mode" className="flex">
              <button role="tab" aria-selected={mode === "range"} onClick={() => setMode("range")} className={tabClass(mode === "range")}>
                RANGE
              </button>
              <button role="tab" aria-selected={mode === "tail"} onClick={() => setMode("tail")} className={tabClass(mode === "tail")}>
                LIVE
              </button>
            </div>
            <span className="text-violet">rx {rx}</span>
            <span aria-hidden className="text-dim">│</span>
            <span className="font-bold text-cyan">{rate.toFixed(1)} rec/s</span>
          </>
        }
        actions={
          <>
            <Toggle label="TIMESTAMPS" on={showTime} onChange={setShowTime} />
            <Toggle label="WRAP LINES" on={wrap} onChange={setWrap} />
            <Button
              small
              onClick={() => {
                setRecords([]);
                setPicked(null);
                setRx(0);
              }}
            >
              CLEAR
            </Button>
          </>
        }
      >
        <div className="flex flex-wrap items-end gap-3 pb-3 pt-2">
          {mode === "range" ? (
            <>
              <Field label="START ID">
                <Input inputMode="numeric" value={startId} onChange={(e) => {
                    touched.current.start = true;
                    setStartId(e.target.value);
                  }} className="w-[120px]" />
              </Field>
              <Field label="END ID">
                <Input inputMode="numeric" value={endId} onChange={(e) => {
                    touched.current.end = true;
                    setEndId(e.target.value);
                  }} className="w-[120px]" />
              </Field>
              <Button tone="magenta" disabled={loading} onClick={loadRange}>
                READ RANGE
              </Button>
              <span className="self-center text-xs text-violet">0 = first / last ID</span>
            </>
          ) : (
            <>
              <Field label="START ID">
                <Input inputMode="numeric" value={tailStart} onChange={(e) => {
                    touched.current.tail = true;
                    setTailStart(e.target.value);
                  }} className="w-[120px]" />
              </Field>
              <Field label="MAX RECORDS">
                <Input inputMode="numeric" value={tailMax} onChange={(e) => setTailMax(e.target.value)} className="w-[120px]" />
              </Field>
              <Field label="TIMEOUT">
                <Input value={tailTimeout} onChange={(e) => setTailTimeout(e.target.value)} className="w-[100px]" />
              </Field>
              {following ? (
                <Button tone="ghost" onClick={stopTail}>
                  STOP
                </Button>
              ) : (
                <Button tone="magenta" onClick={startTail}>
                  FOLLOW
                </Button>
              )}
              {following && <span className="self-center text-xs text-lime">◆ {note}</span>}
            </>
          )}
        </div>

        {error && (
          <p role="alert" className="m-0 bg-panel px-3 py-2 text-[13px] text-red">
            ▲ {error}
          </p>
        )}
        {note && !(mode === "tail" && following) && <p className="m-0 px-2 text-xs text-violet">{note}</p>}

        <ul className="m-0 flex list-none flex-col p-0">
          {records.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                aria-haspopup="dialog"
                onClick={() => {
                  setPicked(r.id);
                  setFull(true);
                }}
                className={`flex min-h-11 w-full cursor-pointer flex-wrap items-center gap-3 px-2 py-1 text-left text-[13px] text-text hover:shadow-[inset_0_0_0_1px_var(--color-dim)] ${HOVER} ${r.id === picked ? "bg-panel" : ""}`}
              >
                {showTime && <span className="text-violet">{clockMs(r.time)}</span>}
                <span className="min-w-14 font-bold text-magenta">#{r.id}</span>
                <span aria-hidden className="text-cyan">▪</span>
                <span className={`min-w-0 flex-[1_1_200px] overflow-hidden text-ellipsis [overflow-wrap:anywhere] ${wrap ? "whitespace-normal" : "whitespace-nowrap"}`}>
                  {preview(r.text)}
                </span>
                <span className="text-xs text-violet">{sizeLabel(r.bytes.length)}</span>
              </button>
            </li>
          ))}
        </ul>
        {records.length === 0 && !loading && !error && (
          <p className="m-0 px-2 text-violet">{mode === "range" ? "no records in this stream yet" : "press FOLLOW to tail the stream"}</p>
        )}
      </Panel>

      <div className="flex min-w-[min(100%,340px)] flex-[1_1_340px] flex-col gap-4 self-stretch">
        <Panel
          title="INFO"
          className="flex-1"
          meta={
            <>
              <span aria-hidden className="text-dim">│</span>
              <span className={`font-bold ${status === "online" ? "text-cyan" : "text-red"}`}>{status === "online" ? "LIVE" : "OFFLINE"}</span>
            </>
          }
        >
          {infoRows.map(([label, value]) => (
            <div key={label} className="flex min-h-7 items-center gap-4">
              <span className="w-[72px] text-violet">{label}</span>
              <span className="font-bold">{value}</span>
            </div>
          ))}
          <div className="flex min-h-7 items-center gap-4">
            <span className="w-[72px] text-violet">SPLIT</span>
            <span className="h-2 flex-1 bg-panel">
              <span className="block h-2 bg-magenta" style={{ width: `${split}%` }} />
            </span>
            <span className="font-bold">{split}%</span>
          </div>
          <Toggle label="AUTO-REFRESH" on={autoRefresh} onChange={setAutoRefresh} />

          <div className="mb-2 mt-4 flex items-center gap-3">
            <span className="font-bold text-violet">▛ COMMANDS</span>
            <span aria-hidden className="h-px min-w-5 flex-1 bg-dim" />
          </div>
          <div className="flex flex-col">
            {OPS.map((o) => (
              <button
                key={o.op}
                type="button"
                aria-haspopup="dialog"
                onClick={() => setOp(o.op)}
                className={`flex min-h-11 w-full cursor-pointer flex-col items-start px-2 py-1.5 text-left text-sm text-text ${HOVER} ${o.hover}`}
              >
                <span className={`font-bold ${o.text}`}>▶ {o.name}</span>
                <span className="text-xs text-violet">{o.desc}</span>
              </button>
            ))}
          </div>
        </Panel>
      </div>

      <Dialog
        open={full && !!sel}
        onClose={() => setFull(false)}
        title={`RECORD #${sel?.id ?? ""}`}
        maxWidth={980}
        meta={<span className="text-xs text-violet">{sel ? `${clockMs(sel.time)} · ${sel.bytes.length} bytes` : ""}</span>}
      >
        <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Payload view">
          {VIEWS.map((v) => (
            <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)} className={tabClass(view === v)}>
              {v.toUpperCase()}
            </button>
          ))}
        </div>
        <pre className="m-0 max-h-[520px] min-h-[360px] overflow-auto whitespace-pre-wrap bg-panel p-3 text-xs leading-[1.6] [overflow-wrap:anywhere]">{body}</pre>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button onClick={() => navigator.clipboard.writeText(body)}>COPY</Button>
          <Button title="Save the payload as a UTF-8 .txt file" onClick={() => sel && download(`record-${sel.id}.txt`, sel.text, "text/plain;charset=utf-8")}>
            DOWNLOAD TEXT
          </Button>
          <Button title="Save the payload as raw bytes (.bin), unchanged" onClick={() => sel && download(`record-${sel.id}.bin`, sel.bytes as BlobPart, "application/octet-stream")}>
            DOWNLOAD BYTES
          </Button>
          <Button tone="magenta" onClick={() => setFull(false)}>
            CLOSE
          </Button>
        </div>
      </Dialog>

      {OPS.map((o) => (
        <Dialog key={o.op} open={op === o.op} onClose={() => setOp(null)} title={o.name} tone={o.tone}>
          {o.op === "append" && <AppendForm dialog onCancel={() => setOp(null)} onDone={() => mode === "range" && loadRange()} />}
          {o.op === "delete" && <DeleteForm dialog onCancel={() => setOp(null)} onDone={() => mode === "range" && loadRange()} />}
          {o.op === "reconcile" && <ReconcileForm dialog onCancel={() => setOp(null)} />}
        </Dialog>
      ))}
    </div>
  );
}

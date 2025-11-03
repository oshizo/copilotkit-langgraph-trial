import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { HttpAgent } from "@ag-ui/client";
import type { Subscription } from "rxjs";
import type { AnalysisResult, AgentStatus, ApprovalPrompt, StepProgress } from "../types";

/**
 * 本番寄りの設定:
 * - DEBUG=false（必要時に true に）
 * - approval の開閉は CUSTOM(on_interrupt) でのみ制御
 * - STATE_SNAPSHOT では approval を触らない
 * - resume 実行時のみダイアログを閉じる
 */
const DEBUG = false;

type VM = {
  status: AgentStatus;
  steps: StepProgress[];
  result: AnalysisResult | null;
  error: string | null;
};

type Ctx = {
  state: VM & { approval: ApprovalPrompt | null; approvalOpen: boolean };
  actions: { start(): void; approve(): void; decline(): void; reset(): void };
};

const C = createContext<Ctx | null>(null);

export function useAgent() {
  const v = useContext(C);
  if (!v) throw new Error("useAgent must be used within <AguiProvider>");
  return v;
}

type AnyRecord = Record<string, unknown>;

function normalizeApproval(raw: AnyRecord): ApprovalPrompt {
  const chunkCount = Number(raw.chunkCount ?? raw.chunk_count ?? 0) || 0;
  const totalCharacters = Number(raw.totalCharacters ?? raw.total_characters ?? 0) || 0;
  const files = Array.isArray(raw.files) ? (raw.files as string[]) : [];
  return { chunkCount, totalCharacters, files };
}

export function AguiProvider({
  apiUrl,
  children,
}: {
  apiUrl: string;
  children: React.ReactNode;
}) {
  const [vm, setVm] = useState<VM>({
    status: "idle",
    steps: [],
    result: null,
    error: null,
  });
  const [approval, setApproval] = useState<ApprovalPrompt | null>(null);
  const [approvalOpen, setApprovalOpen] = useState(false);

  const agentRef = useRef<HttpAgent>();
  const subRef = useRef<Subscription | null>(null);
  const threadIdRef = useRef<string | null>(null);

  // ---- 計測（必要に応じて）----
  const traceRef = useRef<{ t: string; type: string; note?: string }[]>([]);
  const lastStatusNoteRef = useRef<string>("");

  const ensure = useCallback(() => (agentRef.current ??= new HttpAgent({ url: apiUrl })), [apiUrl]);

  const cleanup = useCallback(() => {
    subRef.current?.unsubscribe();
    subRef.current = null;
  }, []);

  function recordTrace(type: string, note?: string) {
    if (!DEBUG) return;
    // 連続同一 note のスパムを抑制
    if (type.startsWith("STATE_SNAPSHOT")) {
      if (note && lastStatusNoteRef.current === note) return;
      lastStatusNoteRef.current = note ?? "";
    }
    const stamp = new Date().toISOString();
    const entry = { t: stamp, type, note };
    traceRef.current.push(entry);
    if (traceRef.current.length > 40) traceRef.current.shift();
    // eslint-disable-next-line no-console
    console.log(`[TRACE] ${stamp} ${type}${note ? " :: " + note : ""}`);
  }

  const onEvent = useCallback((e: any) => {
    if (e?.type === "STATE_SNAPSHOT") {
      const snap = e.snapshot ?? {};
      const next = (snap.vm ?? snap) as AnyRecord;

      // まず UI に反映（status は存在すれば採用、なければ現状維持）
      setVm((prev) => ({
        status: (next.status as AgentStatus) ?? prev.status ?? "idle",
        steps: Array.isArray(next.steps) ? (next.steps as StepProgress[]) : prev.steps ?? [],
        result: (next.result as AnalysisResult | null) ?? prev.result ?? null,
        error: typeof next.error === "string" ? next.error : prev.error ?? null,
      }));

      // 計測用 note は "実際に UI に反映された status" を使う
      const statusNote: string =
        (typeof next.status === "string" ? String(next.status) : "") || String(vm.status || "idle");
      recordTrace("STATE_SNAPSHOT", `status=${statusNote}`);
    } else if (e?.type === "CUSTOM" && e?.name === "on_interrupt") {
      const raw = typeof e.value === "string" ? safeParse(e.value) : e.value;
      if (raw && typeof raw === "object") {
        const ap = normalizeApproval(raw as AnyRecord);
        setApproval(ap);
        setApprovalOpen(true);
        if (DEBUG) {
          // eslint-disable-next-line no-console
          console.debug("[Dialog] open with approval:", ap);
        }
      }
      recordTrace("CUSTOM:on_interrupt", typeof e.value === "string" ? "string payload" : "object payload");
    } else if (e?.type === "RUN_ERROR") {
      setVm((s) => ({ ...s, status: "error", error: String(e.message ?? "unknown error") }));
      setApprovalOpen(false);
      setApproval(null);
      recordTrace("RUN_ERROR", String(e?.message ?? "unknown"));
    }
  }, [vm.status]);

  const subscribe = useCallback(
    (opts: any) => {
      cleanup();
      const obs = ensure().run(opts);
      subRef.current = obs.subscribe({
        next: onEvent,
        error: (err: any) => {
          setVm((s) => ({ ...s, status: "error", error: String(err) }));
          setApprovalOpen(false);
          recordTrace("STREAM_ERROR", String(err));
        },
      });
    },
    [cleanup, ensure, onEvent]
  );

  const start = useCallback(() => {
    recordTrace("ACTION:start");
    setVm({ status: "running", steps: [], result: null, error: null });
    setApproval(null);
    setApprovalOpen(false);

    const threadId = crypto.randomUUID();
    threadIdRef.current = threadId;

    subscribe({
      threadId,
      runId: crypto.randomUUID(),
      state: {},
      messages: [],
      tools: [],
      context: [],
      forwardedProps: {},
    });
  }, [subscribe]);

  const resume = useCallback(
    (approved: boolean) => {
      recordTrace("ACTION:resume", approved ? "approved=true" : "approved=false");
      if (!threadIdRef.current) return;
      // ダイアログはここで閉じる（状態は STATE に任せる）
      setApprovalOpen(false);

      subscribe({
        threadId: threadIdRef.current,
        runId: crypto.randomUUID(),
        state: {},
        messages: [],
        tools: [],
        context: [],
        forwardedProps: { command: { resume: { approved } } },
      });
    },
    [subscribe]
  );

  const actions = useMemo(
    () => ({
      start,
      approve: () => resume(true),
      decline: () => resume(false),
      reset: () => {
        recordTrace("ACTION:reset");
        cleanup();
        threadIdRef.current = null;
        setVm({ status: "idle", steps: [], result: null, error: null });
        setApproval(null);
        setApprovalOpen(false);
      },
    }),
    [cleanup, resume, start]
  );

  return (
    <C.Provider value={{ state: { ...vm, approval, approvalOpen }, actions }}>
      {children}
    </C.Provider>
  );
}

function safeParse(s: string) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

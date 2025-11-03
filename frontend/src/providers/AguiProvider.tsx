import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { HttpAgent } from "@ag-ui/client";
import type { Subscription } from "rxjs";
import type { AnalysisResult, AgentStatus, ApprovalPrompt, StepProgress } from "../types";

type VM = {
  status: AgentStatus;
  steps: StepProgress[];
  result: AnalysisResult | null;
  approval: ApprovalPrompt | null;
  error: string | null;
};

type Ctx = {
  state: VM;
  actions: { start(): void; approve(): void; decline(): void; reset(): void };
};

const C = createContext<Ctx | null>(null);

export function useAgent() {
  const v = useContext(C);
  if (!v) throw new Error("useAgent must be used within <AguiProvider>");
  return v;
}

export function AguiProvider({
  apiUrl,
  children,
}: {
  apiUrl: string;
  children: React.ReactNode;
}) {
  const [state, setState] = useState<VM>({
    status: "idle",
    steps: [],
    result: null,
    approval: null,
    error: null,
  });

  const agentRef = useRef<HttpAgent>();
  const subRef = useRef<Subscription | null>(null);
  const threadIdRef = useRef<string | null>(null);

  const ensure = useCallback(
    () => (agentRef.current ??= new HttpAgent({ url: apiUrl })),
    [apiUrl]
  );

  const cleanup = useCallback(() => {
    subRef.current?.unsubscribe();
    subRef.current = null;
  }, []);

  // ---- helpers ----
  function isValidApproval(x: unknown): x is ApprovalPrompt {
    if (!x || typeof x !== "object") return false;
    const a = x as any;
    return Number.isFinite(a.chunkCount ?? a.chunk_count) &&
           Number.isFinite(a.totalCharacters ?? a.total_characters) &&
           Array.isArray(a.files);
  }

  function normalizeApproval(x: any): ApprovalPrompt {
    return {
      chunkCount: Number(x.chunkCount ?? x.chunk_count ?? 0),
      totalCharacters: Number(x.totalCharacters ?? x.total_characters ?? 0),
      files: Array.isArray(x.files) ? (x.files as string[]) : [],
    };
  }

  const onEvent = useCallback((e: any) => {
    if (e?.type === "STATE_SNAPSHOT") {
      const snap = e.snapshot ?? {};
      const vm = (snap.vm ?? snap) as any;

      setState((prev) => {
        // status / steps / result / error は素直に反映
        const nextStatus: AgentStatus = (vm?.status as AgentStatus) ?? prev.status;
        const nextSteps: StepProgress[] = Array.isArray(vm?.steps) ? (vm.steps as StepProgress[]) : prev.steps;
        const nextResult: AnalysisResult | null =
          (vm?.result as AnalysisResult | null) ?? prev.result;
        const nextError: string | null =
          typeof vm?.error === "string" ? vm.error : prev.error;

        // approval は「有効な形のときだけ」上書き。それ以外は prev を保持。
        let nextApproval = prev.approval;
        if (isValidApproval(vm?.approval)) {
          nextApproval = normalizeApproval(vm.approval);
        }
        // 完了・エラー時は明示的にクリア（ダイアログ閉じ）
        if (nextStatus === "completed" || nextStatus === "error") {
          nextApproval = null;
        }

        return {
          status: nextStatus,
          steps: nextSteps,
          result: nextResult,
          approval: nextApproval,
          error: nextError,
        };
      });
    } else if (e?.type === "CUSTOM" && e?.name === "on_interrupt") {
      // 一次情報。ここでは常に上書き（承認待ちトリガー）
      const raw = e.value;
      const parsed = typeof raw === "string" ? safeParse(raw) : raw;
      if (parsed && typeof parsed === "object") {
        setState((s) => ({
          ...s,
          status: "awaiting-approval",
          approval: normalizeApproval(parsed as any),
        }));
      }
    } else if (e?.type === "RUN_ERROR") {
      setState((s) => ({
        ...s,
        status: "error",
        error: String(e.message ?? "unknown error"),
        // エラー時は承認を確実に閉じる
        approval: null,
      }));
    }
  }, []);

  const subscribe = useCallback(
    (opts: any) => {
      cleanup();
      const obs = ensure().run(opts);
      subRef.current = obs.subscribe({
        next: onEvent,
        error: (err: any) =>
          setState((s) => ({ ...s, status: "error", error: String(err), approval: null })),
      });
    },
    [cleanup, ensure, onEvent]
  );

  const start = useCallback(() => {
    setState({ status: "running", steps: [], result: null, approval: null, error: null });
    const threadId = crypto.randomUUID();
    threadIdRef.current = threadId;
    subscribe({
      threadId,
      runId: crypto.randomUUID(),
      messages: [],
      forwardedProps: {},
      state: {},
      tools: [],
      context: [],
    });
  }, [subscribe]);

  const resume = useCallback(
    (approved: boolean) => {
      if (!threadIdRef.current) return;
      // ローカルで即座に閉じる（サーバのスナップショット待ちで誤上書きされないように）
      setState((s) => ({ ...s, status: "running", approval: null }));
      subscribe({
        threadId: threadIdRef.current,
        runId: crypto.randomUUID(),
        forwardedProps: { command: { resume: { approved } } },
        messages: [],
        state: {},
        tools: [],
        context: [],
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
        cleanup();
        threadIdRef.current = null;
        setState({ status: "idle", steps: [], result: null, approval: null, error: null });
      },
    }),
    [cleanup, resume, start]
  );

  return <C.Provider value={{ state, actions }}>{children}</C.Provider>;
}

function safeParse(s: string) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

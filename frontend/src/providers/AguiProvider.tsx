import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { HttpAgent } from "@ag-ui/client";
import {
  BaseEvent,
  CustomEvent,
  EventType,
  RunErrorEvent,
  RunStartedEvent,
  StateSnapshotEvent,
  StepFinishedEvent,
  StepStartedEvent,
} from "@ag-ui/core";
import type { Subscription } from "rxjs";
import type { AnalysisResult, AgentStatus, ApprovalPrompt, StepProgress } from "../types";

type AgentViewModel = {
  status: AgentStatus;
  steps: StepProgress[];
  result: AnalysisResult | null;
  approval: ApprovalPrompt | null;
  error: string | null;
};

type AgentActions = {
  start(): void;
  approve(): void;
  decline(): void;
  reset(): void;
};

type AgentContextValue = {
  state: AgentViewModel;
  actions: AgentActions;
};

const INITIAL_VM: AgentViewModel = {
  status: "idle",
  steps: [],
  result: null,
  approval: null,
  error: null,
};

const AgentContext = createContext<AgentContextValue | null>(null);

export function useAgent(): AgentContextValue {
  const ctx = useContext(AgentContext);
  if (!ctx) throw new Error("useAgent must be used inside <AguiProvider>");
  return ctx;
}

type Props = {
  apiUrl: string;
  children: React.ReactNode;
};

export function AguiProvider({ apiUrl, children }: Props) {
  const [vm, setVM] = useState<AgentViewModel>(INITIAL_VM);

  // 内部状態
  const agentRef = useRef<HttpAgent | null>(null);
  const subscriptionRef = useRef<Subscription | null>(null);
  const threadIdRef = useRef<string | null>(null);
  const stepsMapRef = useRef<Map<string, StepProgress>>(new Map());

  const ensureAgent = useCallback(() => {
    if (!agentRef.current) {
      agentRef.current = new HttpAgent({ url: apiUrl });
    }
    return agentRef.current;
  }, [apiUrl]);

  const setStatus = useCallback((status: AgentStatus, error?: string | null) => {
    setVM((prev) => ({ ...prev, status, error: error ?? null }));
  }, []);

  const setApproval = useCallback((approval: ApprovalPrompt | null) => {
    setVM((prev) => ({ ...prev, approval }));
  }, []);

  // NOTE: generated_at / output_path は undefined を使う（null は使わない）
  const setResult = useCallback((partial: Partial<AnalysisResult> | null) => {
    setVM((prev) => {
      if (partial === null) return { ...prev, result: null };
      const prevRes: AnalysisResult =
        prev.result ?? { characters: [], scenes: [], generated_at: undefined, output_path: undefined };
      const merged: AnalysisResult = {
        characters: partial.characters ?? prevRes.characters,
        scenes: partial.scenes ?? prevRes.scenes,
        generated_at:
          (partial as any)?.generated_at !== undefined
            ? ((partial as any).generated_at as string | undefined)
            : prevRes.generated_at,
        output_path:
          (partial as any)?.output_path !== undefined
            ? ((partial as any).output_path as string | undefined)
            : prevRes.output_path,
      };
      return { ...prev, result: merged };
    });
  }, []);

  const updateStep = useCallback((name: string, status: StepProgress["status"]) => {
    stepsMapRef.current.set(name, { name, status });
    setVM((prev) => ({ ...prev, steps: Array.from(stepsMapRef.current.values()) }));
  }, []);

  const cleanup = useCallback(() => {
    subscriptionRef.current?.unsubscribe();
    subscriptionRef.current = null;
  }, []);

  // --- Event handlers ---

  const handleStateSnapshot = useCallback((event: StateSnapshotEvent) => {
    const snapshot = (event.snapshot as Record<string, unknown>) ?? {};
    const characters = Array.isArray(snapshot.characters)
      ? (snapshot.characters as AnalysisResult["characters"])
      : [];
    const scenes = Array.isArray(snapshot.scenes)
      ? (snapshot.scenes as AnalysisResult["scenes"])
      : [];

    const aggregated =
      snapshot.aggregated && typeof snapshot.aggregated === "object"
        ? (snapshot.aggregated as Record<string, unknown>)
        : undefined;

    // ← ここを undefined 正規化
    const generated_at =
      typeof aggregated?.generated_at === "string" ? (aggregated.generated_at as string) : undefined;
    const output_path =
      typeof snapshot.output_path === "string" ? (snapshot.output_path as string) : undefined;

    // バックエンドが steps を載せてくれたら反映
    if (Array.isArray((snapshot as any).steps)) {
      try {
        const steps = ((snapshot as any).steps as any[]).filter(
          (s) => s && typeof s.name === "string" && (s.status === "running" || s.status === "completed")
        );
        for (const s of steps) updateStep(s.name, s.status);
      } catch {
        // no-op
      }
    }

    setResult({ characters, scenes, generated_at, output_path });
  }, [setResult, updateStep]);

  const handleApprovalEvent = useCallback((event: CustomEvent) => {
    if (event.name !== "on_interrupt") return;

    const raw = event.value;
    let obj: any = raw;
    if (typeof raw === "string") {
      try {
        obj = JSON.parse(raw);
      } catch {
        obj = raw;
      }
    }
    if (!obj || typeof obj !== "object") return;

    const files =
      Array.isArray(obj.files) && obj.files.every((v: unknown) => typeof v === "string")
        ? (obj.files as string[])
        : [];

    const approval: ApprovalPrompt = {
      chunkCount: Number(obj.chunkCount ?? obj.chunk_count ?? 0),
      totalCharacters: Number(obj.totalCharacters ?? obj.total_characters ?? 0),
      files,
    };
    setApproval(approval);
    setStatus("awaiting-approval");
  }, [setApproval, setStatus]);

  const handleEvent = useCallback(
    (event: BaseEvent) => {
      switch (event.type) {
        case EventType.RUN_STARTED: {
          const _e = event as RunStartedEvent;
          setStatus("running");
          break;
        }
        case EventType.STEP_STARTED: {
          const e = event as StepStartedEvent;
          updateStep(normalizeStepName(e.stepName), "running");
          break;
        }
        case EventType.STEP_FINISHED: {
          const e = event as StepFinishedEvent;
          updateStep(normalizeStepName(e.stepName), "completed");
          break;
        }
        case EventType.STATE_SNAPSHOT: {
          handleStateSnapshot(event as StateSnapshotEvent);
          break;
        }
        case EventType.CUSTOM: {
          handleApprovalEvent(event as CustomEvent);
          break;
        }
        case EventType.RUN_FINISHED: {
          setVM((prev) => {
            const keepAwaiting = prev.status === "awaiting-approval" && prev.approval !== null;
            return { ...prev, status: keepAwaiting ? "awaiting-approval" : "completed" };
          });
          cleanup();
          break;
        }
        case EventType.RUN_ERROR: {
          const e = event as RunErrorEvent;
          setStatus("error", e.message);
          cleanup();
          break;
        }
        default:
          break;
      }
    },
    [cleanup, handleApprovalEvent, handleStateSnapshot, setStatus, updateStep]
  );

  const subscribeToRun = useCallback(
    (runOptions: Parameters<HttpAgent["run"]>[0]) => {
      cleanup();
      const agent = ensureAgent();
      const obs = agent.run(runOptions);
      subscriptionRef.current = obs.subscribe({
        next: handleEvent,
        error: (err) => setStatus("error", String(err)),
      });
    },
    [cleanup, ensureAgent, handleEvent, setStatus]
  );

  // --- Actions ---

  const start = useCallback(() => {
    stepsMapRef.current.clear();
    setResult(null);
    setApproval(null);
    setStatus("running");

    const threadId = crypto.randomUUID();
    const runId = crypto.randomUUID();
    threadIdRef.current = threadId;

    const runOptions = {
      threadId,
      runId,
      messages: [],
      forwardedProps: {},
      state: {},
      tools: [],
      context: [],
    };
    subscribeToRun(runOptions);
  }, [setApproval, setResult, setStatus, subscribeToRun]);

  const resume = useCallback(
    (approved: boolean) => {
      if (!threadIdRef.current) return;
      setStatus("running");
      setApproval(null);

      const runOptions = {
        threadId: threadIdRef.current,
        runId: crypto.randomUUID(),
        forwardedProps: { command: { resume: { approved } } },
        messages: [],
        state: {},
        tools: [],
        context: [],
      };
      subscribeToRun(runOptions);
    },
    [setApproval, setStatus, subscribeToRun]
  );

  const approve = useCallback(() => resume(true), [resume]);
  const decline = useCallback(() => resume(false), [resume]);

  const reset = useCallback(() => {
    stepsMapRef.current.clear();
    setVM(INITIAL_VM);
    cleanup();
  }, [cleanup]);

  const value = useMemo<AgentContextValue>(
    () => ({
      state: vm,
      actions: { start, approve, decline, reset },
    }),
    [vm, approve, decline, reset, start]
  );

  return <AgentContext.Provider value={value}>{children}</AgentContext.Provider>;
}

function normalizeStepName(name: string): string {
  switch (name) {
    case "load_files":
      return "load_files";
    case "dispatch_chunks":
    case "analyze_chunk":
      return "analyze_chunks";
    case "aggregate_results":
      return "aggregate";
    case "persist":
      return "persist";
    default:
      return name;
  }
}

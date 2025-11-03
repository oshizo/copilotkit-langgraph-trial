import { useCallback, useRef, useState } from "react";
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

import type {
  AnalysisResult,
  AgentStatus,
  ApprovalPrompt,
  StepProgress,
} from "../types";

/**
 * AG-UI（REST/SSE）専用の極薄フック。
 * - 生のSSEイベント → 画面で使う最小の状態（status/steps/result/approval）にだけ正規化
 * - メッセージ断片処理や詳細ログなどは省く
 */

type AgentRunOptions = Parameters<HttpAgent["run"]>[0];

interface UseAgentRunnerProps {
  apiUrl: string;
}

interface AgentRunnerState {
  status: AgentStatus;
  steps: StepProgress[];
  result: AnalysisResult | null;
  approval: ApprovalPrompt | null;
  error: string | null;
  threadId: string | null;
  runId: string | null;
}

const INITIAL_STATE: AgentRunnerState = {
  status: "idle",
  steps: [],
  result: null,
  approval: null,
  error: null,
  threadId: null,
  runId: null,
};

export function useAgentRunner({ apiUrl }: UseAgentRunnerProps) {
  const [state, setState] = useState<AgentRunnerState>(INITIAL_STATE);

  const agentRef = useRef<HttpAgent | null>(null);
  const subscriptionRef = useRef<Subscription | null>(null);

  // 進捗を手早く参照・更新するためのMap（レンダー回数を抑制）
  const stepsMapRef = useRef<Map<string, StepProgress>>(new Map());

  const ensureAgent = useCallback(() => {
    if (!agentRef.current) {
      agentRef.current = new HttpAgent({ url: apiUrl });
    }
    return agentRef.current;
  }, [apiUrl]);

  const cleanup = useCallback(() => {
    subscriptionRef.current?.unsubscribe();
    subscriptionRef.current = null;
  }, []);

  const setStatus = useCallback((status: AgentStatus, error?: string) => {
    setState((prev) => ({ ...prev, status, error: error ?? null }));
  }, []);

  const setApproval = useCallback((approval: ApprovalPrompt | null) => {
    setState((prev) => ({ ...prev, approval }));
  }, []);

  const setResult = useCallback((partial: Partial<AnalysisResult>) => {
    setState((prev) => {
      const prevResult = prev.result ?? {
        characters: [],
        scenes: [],
        generated_at: undefined,
        output_path: undefined,
      };
      const merged: AnalysisResult = {
        characters: partial.characters ?? prevResult.characters,
        scenes: partial.scenes ?? prevResult.scenes,
        generated_at:
          (partial as any)?.generated_at ?? (prevResult as any)?.generated_at,
        output_path:
          (partial as any)?.output_path ?? (prevResult as any)?.output_path,
      };
      return { ...prev, result: merged };
    });
  }, []);

  const updateStep = useCallback((name: string, status: StepProgress["status"]) => {
    const m = stepsMapRef.current;
    m.set(name, { name, status });
    setState((prev) => ({ ...prev, steps: Array.from(m.values()) }));
  }, []);

  // --- Event Handlers ---

  const handleStateSnapshot = useCallback((event: StateSnapshotEvent) => {
    const snapshot = (event.snapshot as Record<string, unknown>) ?? {};
    const characters = Array.isArray(snapshot.characters)
      ? (snapshot.characters as AnalysisResult["characters"])
      : undefined;
    const scenes = Array.isArray(snapshot.scenes)
      ? (snapshot.scenes as AnalysisResult["scenes"])
      : undefined;

    const aggregated =
      snapshot.aggregated && typeof snapshot.aggregated === "object"
        ? (snapshot.aggregated as Record<string, unknown>)
        : undefined;

    setResult({
      characters,
      scenes,
      generated_at:
        typeof aggregated?.generated_at === "string"
          ? (aggregated.generated_at as string)
          : undefined,
      output_path:
        typeof snapshot.output_path === "string"
          ? (snapshot.output_path as string)
          : undefined,
    });
  }, [setResult]);

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
      chunkCount: Number(obj.chunk_count ?? obj.chunkCount ?? 0),
      totalCharacters: Number(obj.total_characters ?? obj.totalCharacters ?? 0),
      files,
    };
    setApproval(approval);
    setStatus("awaiting-approval");
  }, [setApproval, setStatus]);

  const handleEvent = useCallback(
    (event: BaseEvent) => {
      switch (event.type) {
        case EventType.RUN_STARTED: {
          const e = event as RunStartedEvent;
          setState((prev) => ({ ...prev, runId: e.runId, status: "running" }));
          break;
        }
        case EventType.STEP_STARTED: {
          const e = event as StepStartedEvent;
          updateStep(e.stepName, "running");
          break;
        }
        case EventType.STEP_FINISHED: {
          const e = event as StepFinishedEvent;
          updateStep(e.stepName, "completed");
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
          setState((prev) => {
            // 承認ダイアログを開いている場合は completed にしない（UI都合）
            const keepAwaiting =
              prev.status === "awaiting-approval" && prev.approval !== null;
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

  const subscribeTo = useCallback(
    (runOptions: AgentRunOptions) => {
      cleanup();
      const agent = ensureAgent();
      const observable = agent.run(runOptions);
      subscriptionRef.current = observable.subscribe({
        next: handleEvent,
        error: (err: unknown) => {
          setStatus("error", String(err));
        },
      });
    },
    [cleanup, ensureAgent, handleEvent, setStatus]
  );

  // --- Public API ---

  const start = useCallback(() => {
    const threadId = crypto.randomUUID();
    const runId = crypto.randomUUID();
    stepsMapRef.current.clear();
    setState((_) => ({
      ...INITIAL_STATE,
      status: "running",
      threadId,
      runId,
    }));

    const runOptions: AgentRunOptions = {
      threadId,
      runId,
      messages: [],
      forwardedProps: {},
      state: {},
      tools: [],
      context: [],
    };
    subscribeTo(runOptions);
  }, [subscribeTo]);

  const resume = useCallback(
    (approved: boolean) => {
      if (!state.threadId) return;
      const runId = crypto.randomUUID();
      setState((prev) => ({
        ...prev,
        status: "running",
        approval: null,
        runId,
      }));
      const runOptions: AgentRunOptions = {
        threadId: state.threadId,
        runId,
        forwardedProps: {
          command: { resume: { approved } },
        },
        messages: [],
        state: {},
        tools: [],
        context: [],
      };
      subscribeTo(runOptions);
    },
    [state.threadId, subscribeTo]
  );

  return { state, start, resume };
}

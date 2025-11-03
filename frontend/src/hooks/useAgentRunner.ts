import { useCallback, useRef, useState } from "react";
import { HttpAgent } from "@ag-ui/client";
import {
  BaseEvent,
  CustomEvent,
  EventType,
  MessagesSnapshotEvent,
  RunErrorEvent,
  RunStartedEvent,
  StateSnapshotEvent,
  StepFinishedEvent,
  StepStartedEvent,
  TextMessageContentEvent,
  TextMessageStartEvent,
} from "@ag-ui/core";
import type { Observable, Subscription } from "rxjs";

import type {
  AnalysisResult,
  AgentStatus,
  ApprovalPrompt,
  StepProgress,
} from "../types";

type AgentRunOptions = Parameters<HttpAgent["run"]>[0];

interface UseAgentRunnerProps {
  apiUrl: string;
}

interface AgentRunnerState {
  status: AgentStatus;
  steps: StepProgress[];
  messages: string[];
  result: AnalysisResult | null;
  approval: ApprovalPrompt | null;
  error: string | null;
  threadId: string | null;
  runId: string | null;
}

const INITIAL_STATE: AgentRunnerState = {
  status: "idle",
  steps: [],
  messages: [],
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
  const currentMessageRef = useRef<{ id: string; content: string }>({
    id: "",
    content: "",
  });

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

  const resetForRun = useCallback((threadId: string, runId: string) => {
    setState((prev) => ({
      ...prev,
      status: "running",
      steps: [],
      messages: [],
      result: null,
      approval: null,
      error: null,
      threadId,
      runId,
    }));
    currentMessageRef.current = { id: "", content: "" };
  }, []);

  const appendMessageChunk = useCallback((id: string, delta: string) => {
    setState((prev) => {
      const messages = [...prev.messages];
      if (currentMessageRef.current.id !== id) {
        currentMessageRef.current = { id, content: "" };
        messages.push("");
      }
      currentMessageRef.current.content += delta;
      messages[messages.length - 1] = currentMessageRef.current.content;
      return { ...prev, messages };
    });
  }, []);

  const markMessageEnd = useCallback(() => {
    currentMessageRef.current = { id: "", content: "" };
  }, []);

  const updateSteps = useCallback(
    (stepName: string, status: StepProgress["status"]) => {
      setState((prev) => {
        const existingIndex = prev.steps.findIndex(
          (step) => step.name === stepName
        );
        const steps = [...prev.steps];
        if (existingIndex >= 0) {
          steps[existingIndex] = { name: stepName, status };
        } else {
          steps.push({ name: stepName, status });
        }
        return { ...prev, steps };
      });
    },
    []
  );

  const handleStateSnapshot = useCallback((event: StateSnapshotEvent) => {
    const snapshot = event.snapshot as Record<string, unknown> | null;
    if (!snapshot) return;

    setState((prev) => {
      const characters = Array.isArray(snapshot.characters)
        ? (snapshot.characters as AnalysisResult["characters"])
        : (prev.result?.characters ?? []);
      const scenes = Array.isArray(snapshot.scenes)
        ? (snapshot.scenes as AnalysisResult["scenes"])
        : (prev.result?.scenes ?? []);
      const aggregated = snapshot.aggregated as
        | Record<string, unknown>
        | undefined;
      const result: AnalysisResult = {
        characters,
        scenes,
        generated_at:
          typeof aggregated?.generated_at === "string"
            ? aggregated.generated_at
            : prev.result?.generated_at,
        output_path:
          typeof snapshot.output_path === "string"
            ? snapshot.output_path
            : prev.result?.output_path,
      };
      return { ...prev, result };
    });
  }, []);

  const handleApprovalEvent = useCallback((event: CustomEvent) => {
    if (event.name !== "on_interrupt") return;
    const rawValue = event.value;
    let parsed: unknown = rawValue;
    if (typeof rawValue === "string") {
      try {
        parsed = JSON.parse(rawValue);
      } catch {
        parsed = rawValue;
      }
    }
    if (!parsed) return;
    const data = parsed as Record<string, unknown>;
    const files = Array.isArray(data.files)
      ? (data.files.filter(
          (value): value is string => typeof value === "string"
        ) as string[])
      : [];
    const approval: ApprovalPrompt = {
      chunkCount: Number(data.chunk_count ?? data.chunkCount ?? 0),
      totalCharacters: Number(
        data.total_characters ?? data.totalCharacters ?? 0
      ),
      files,
    };
    setState((prev) => ({ ...prev, approval, status: "awaiting-approval" }));
  }, []);

  const handleEvent = useCallback(
    (event: BaseEvent) => {
      switch (event.type) {
        case EventType.RUN_STARTED: {
          const runEvent = event as RunStartedEvent;
          setState((prev) => ({
            ...prev,
            runId: runEvent.runId,
            status: "running",
          }));
          break;
        }
        case EventType.STEP_STARTED: {
          const stepEvent = event as StepStartedEvent;
          updateSteps(stepEvent.stepName, "running");
          break;
        }
        case EventType.STEP_FINISHED: {
          const stepEvent = event as StepFinishedEvent;
          updateSteps(stepEvent.stepName, "completed");
          break;
        }
        case EventType.TEXT_MESSAGE_START: {
          const msgEvent = event as TextMessageStartEvent;
          currentMessageRef.current = { id: msgEvent.messageId, content: "" };
          break;
        }
        case EventType.TEXT_MESSAGE_CONTENT: {
          const msgEvent = event as TextMessageContentEvent;
          appendMessageChunk(msgEvent.messageId, msgEvent.delta ?? "");
          break;
        }
        case EventType.TEXT_MESSAGE_END: {
          markMessageEnd();
          break;
        }
        case EventType.MESSAGES_SNAPSHOT: {
          const snapshotEvent = event as MessagesSnapshotEvent;
          const assistantMessages =
            snapshotEvent.messages
              ?.filter((msg) => msg.role === "assistant")
              .map((msg) => msg.content ?? "") ?? [];
          setState((prev) => ({ ...prev, messages: assistantMessages }));
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
          setState((prev) => ({ ...prev, status: "completed" }));
          cleanup();
          break;
        }
        case EventType.RUN_ERROR: {
          const errorEvent = event as RunErrorEvent;
          setState((prev) => ({
            ...prev,
            status: "error",
            error: errorEvent.message,
          }));
          cleanup();
          break;
        }
        default:
          break;
      }
    },
    [
      appendMessageChunk,
      cleanup,
      handleApprovalEvent,
      handleStateSnapshot,
      markMessageEnd,
      updateSteps,
    ]
  );

  const subscribeToEvents = useCallback(
    (observable: Observable<BaseEvent>) => {
      cleanup();
      subscriptionRef.current = observable.subscribe({
        next: handleEvent,
        error: (error) => {
          console.error("Agent stream error", error);
          setState((prev) => ({
            ...prev,
            status: "error",
            error: String(error),
          }));
        },
      });
    },
    [cleanup, handleEvent]
  );

  const start = useCallback(() => {
    const agent = ensureAgent();
    const threadId = crypto.randomUUID();
    const runId = crypto.randomUUID();
    resetForRun(threadId, runId);
    const runOptions: AgentRunOptions = {
      threadId,
      runId,
      messages: [],
      forwardedProps: {},
      state: {},
      tools: [],
      context: [],
    };
    const observable = agent.run(runOptions);
    subscribeToEvents(observable);
  }, [ensureAgent, resetForRun, subscribeToEvents]);

  const resume = useCallback(
    (approvalAccepted: boolean) => {
      if (!state.threadId) return;
      const agent = ensureAgent();
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
          command: {
            resume: {
              approved: approvalAccepted,
            },
          },
        },
        messages: [],
        state: {},
        tools: [],
        context: [],
      };
      const observable = agent.run(runOptions);
      subscribeToEvents(observable);
    },
    [ensureAgent, state.threadId, subscribeToEvents]
  );

  return {
    state,
    start,
    resume,
  };
}

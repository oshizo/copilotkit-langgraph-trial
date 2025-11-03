import { useEffect, useMemo, useState } from "react";

import { AnalysisApprovalDialog } from "./components/analysis/AnalysisApprovalDialog";
import { AnalysisHeader } from "./components/analysis/AnalysisHeader";
import { CharactersSection } from "./components/analysis/CharactersSection";
import { MessagesPanel } from "./components/analysis/MessagesPanel";
import { ProgressPanel } from "./components/analysis/ProgressPanel";
import { ScenesSection } from "./components/analysis/ScenesSection";
import { useAgentRunner } from "./hooks/useAgentRunner";
import { getAgentStatusMessage, isAgentBusy } from "./lib/status";

const DEFAULT_API_URL = "http://localhost:8000/api/analyze";

export default function App() {
  const apiUrl = useMemo(
    () => import.meta.env.VITE_BACKEND_URL ?? DEFAULT_API_URL,
    []
  );
  const { state, start, resume } = useAgentRunner({ apiUrl });
  const [approvalOpen, setApprovalOpen] = useState(false);

  useEffect(() => {
    setApprovalOpen(Boolean(state.approval));
  }, [state.approval]);

  const handleStart = () => {
    start();
  };

  const handleApprovalDecision = (approved: boolean) => {
    setApprovalOpen(false);
    resume(approved);
  };

  const statusMessage = getAgentStatusMessage(state.status, state.error);
  const busy = isAgentBusy(state.status);

  return (
    <div className="min-h-screen bg-muted/40">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10">
        <AnalysisHeader
          status={state.status}
          statusMessage={statusMessage}
          onStart={handleStart}
          disabled={busy}
        />

        <section className="grid gap-6 md:grid-cols-2">
          <ProgressPanel steps={state.steps} />
          <MessagesPanel messages={state.messages} />
        </section>

        <section className="space-y-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">
              キャラクター
            </h2>
          </div>
          <CharactersSection result={state.result} />
        </section>

        <section className="space-y-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">シーン</h2>
          </div>
          <ScenesSection result={state.result} />
        </section>
      </main>

      <AnalysisApprovalDialog
        approval={state.approval}
        open={approvalOpen}
        onOpenChange={setApprovalOpen}
        onDecision={handleApprovalDecision}
      />
    </div>
  );
}

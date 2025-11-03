import { useMemo } from "react";

import { AnalysisApprovalDialog } from "./components/analysis/AnalysisApprovalDialog";
import { AnalysisHeader } from "./components/analysis/AnalysisHeader";
import { CharactersSection } from "./components/analysis/CharactersSection";
import { ProgressPanel } from "./components/analysis/ProgressPanel";
import { ScenesSection } from "./components/analysis/ScenesSection";
import { getAgentStatusMessage, isAgentBusy } from "./lib/status";
import { useAgent } from "./providers/AguiProvider";

export default function App() {
  const { state, actions } = useAgent();

  const statusMessage = useMemo(
    () => getAgentStatusMessage(state.status, state.error),
    [state.status, state.error]
  );
  const busy = isAgentBusy(state.status);
  const approvalOpen = Boolean(state.approval);

  return (
    <div className="min-h-screen bg-muted/40">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10">
        <AnalysisHeader
          status={state.status}
          statusMessage={statusMessage}
          onStart={actions.start}
          disabled={busy}
        />

        {/* 1行プログレス */}
        <section>
          <ProgressPanel steps={state.steps} />
        </section>

        <section className="space-y-4">
          <div><h2 className="text-2xl font-semibold tracking-tight">キャラクター</h2></div>
          <CharactersSection result={state.result} />
        </section>

        <section className="space-y-4">
          <div><h2 className="text-2xl font-semibold tracking-tight">シーン</h2></div>
          <ScenesSection result={state.result} />
        </section>
      </main>

      <AnalysisApprovalDialog
        approval={state.approval}
        open={approvalOpen}
        onOpenChange={() => {}}
        onDecision={(approved) => (approved ? actions.approve() : actions.decline())}
      />
    </div>
  );
}

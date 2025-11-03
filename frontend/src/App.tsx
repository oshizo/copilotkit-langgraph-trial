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

  // ★ ダイアログの開閉は Provider 管理の approvalOpen を使う
  const approvalOpen = state.approvalOpen;

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
        onOpenChange={(open) => {
          // Provider 側でのみ制御するので、ここでは no-op か、
          // 将来的に「×ボタンで閉じる」を許可するなら actions.decline() などへ委譲。
          // 今回は何もしない（サーバの意図を尊重）
        }}
        onDecision={(approved) => (approved ? actions.approve() : actions.decline())}
      />
    </div>
  );
}

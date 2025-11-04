import { Button } from "../ui/button";
import type { AgentStatus } from "../../types";

interface AnalysisHeaderProps {
  status: AgentStatus;
  statusMessage: string;
  onStart: () => void;
  disabled?: boolean;
}

export function AnalysisHeader({
  status,
  statusMessage,
  onStart,
  disabled,
}: AnalysisHeaderProps) {
  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          小説分析Agent
        </h1>
        <p className="text-sm text-muted-foreground">
          プロジェクトフォルダ内のテキストを読み込み、キャラクターとシーンを抽出します。
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={onStart} disabled={disabled} aria-label="分析開始">
          分析開始
        </Button>
        <span
          className="text-sm text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          {status === "idle" ? "" : statusMessage}
        </span>
      </div>
    </section>
  );
}

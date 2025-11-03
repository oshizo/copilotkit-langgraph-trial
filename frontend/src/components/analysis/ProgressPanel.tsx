import type { StepProgress } from "../../types";

interface Props {
  steps: StepProgress[];
}

const ORDER: Array<StepProgress["name"]> = ["load_files", "analyze", "aggregate"];

export function ProgressPanel({ steps }: Props) {
  // 3固定で完了数だけ数える
  const done = ORDER.reduce((acc, name) => acc + (steps.find((s) => s.name === name && s.status === "completed") ? 1 : 0), 0);
  const pct = Math.round((done / ORDER.length) * 100);

  return (
    <div className="flex items-center gap-3 rounded-md border border-border bg-background px-4 py-3">
      <progress value={pct} max={100} className="h-2 w-48" aria-label="進捗" />
      <span className="text-sm text-muted-foreground">
        進捗 {pct}%（{done}/{ORDER.length}）
      </span>
    </div>
  );
}

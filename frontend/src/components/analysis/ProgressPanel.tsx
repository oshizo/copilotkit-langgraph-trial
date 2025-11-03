import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { ScrollArea } from "../ui/scroll-area";
import type { StepProgress } from "../../types";

interface ProgressPanelProps {
  steps: StepProgress[];
}

export function ProgressPanel({ steps }: ProgressPanelProps) {
  return (
    <Card className="h-[320px]">
      <CardHeader>
        <CardTitle className="text-lg">進捗</CardTitle>
      </CardHeader>
      <CardContent className="h-[220px]">
        <ScrollArea className="h-full">
          <div className="space-y-3 pr-2 text-sm">
            {steps.length === 0 ? (
              <p className="text-muted-foreground">
                まだステップは開始されていません。
              </p>
            ) : (
              steps.map((step) => (
                <div
                  key={step.name}
                  className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2"
                >
                  <span>{step.name}</span>
                  <span
                    className={
                      step.status === "completed"
                        ? "text-xs font-medium text-emerald-600"
                        : "text-xs font-medium text-amber-600"
                    }
                  >
                    {step.status === "completed" ? "完了" : "実行中"}
                  </span>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

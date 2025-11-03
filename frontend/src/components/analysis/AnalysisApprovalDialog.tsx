import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import type { ApprovalPrompt } from "../../types";
import { formatNumber } from "../../lib/format";

interface AnalysisApprovalDialogProps {
  approval: ApprovalPrompt | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDecision: (approved: boolean) => void;
}

export function AnalysisApprovalDialog({
  approval,
  open,
  onOpenChange,
  onDecision,
}: AnalysisApprovalDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            分析を開始する前に確認してください
          </AlertDialogTitle>
          <AlertDialogDescription>
            指定されたテキストを {formatNumber(approval?.chunkCount ?? 0)}{" "}
            個のチャンクに分割します。 合計文字数は約{" "}
            {formatNumber(approval?.totalCharacters ?? 0)} 文字です。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2 rounded-md bg-muted/60 p-3 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">対象ファイル</p>
          <ul className="list-inside list-disc space-y-1">
            {(approval?.files ?? []).map((file) => (
              <li key={file}>{file}</li>
            ))}
          </ul>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => onDecision(false)}>
            中止する
          </AlertDialogCancel>
          <AlertDialogAction onClick={() => onDecision(true)}>
            分析を続行
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

import type { AgentStatus } from "../types";

export function getAgentStatusMessage(
  status: AgentStatus,
  error?: string | null
) {
  switch (status) {
    case "running":
      return "分析を実行中です…";
    case "awaiting-approval":
      return "ユーザー承認待ちです";
    case "completed":
      return "最新の分析が完了しました";
    case "error":
      return `エラー: ${error ?? "不明な問題が発生しました"}`;
    default:
      return "準備ができました";
  }
}

export function isAgentBusy(status: AgentStatus) {
  return status === "running" || status === "awaiting-approval";
}

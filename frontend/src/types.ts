export interface CharacterProfile {
  name: string;
  description: string;
}

export interface SceneSummary {
  title: string;
  summary: string;
}

export interface AnalysisResult {
  characters: CharacterProfile[];
  scenes: SceneSummary[];
  // VM最小化のため null も許容（Providerでの正規化を不要に）
  generated_at?: string | null;
  output_path?: string | null;
}

export interface ApprovalPrompt {
  chunkCount: number;
  totalCharacters: number;
  files: string[];
}

export type AgentStatus =
  | "idle"
  | "running"
  | "awaiting-approval"
  | "completed"
  | "error";

export interface StepProgress {
  name: string; // "load_files" | "analyze" | "aggregate"
  status: "running" | "completed";
}

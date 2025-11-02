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
  generated_at?: string;
  output_path?: string;
}

export interface ApprovalPrompt {
  chunkCount: number;
  totalCharacters: number;
  files: string[];
}

export type AgentStatus = "idle" | "running" | "awaiting-approval" | "completed" | "error";

export interface StepProgress {
  name: string;
  status: "running" | "completed";
}

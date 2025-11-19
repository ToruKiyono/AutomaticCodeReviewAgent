export type ModelKind = 'online' | 'offline';

export interface ChatModel {
  id: string;
  name: string;
  kind: ModelKind;
  endpoint?: string;
  apiKey?: string;
  executablePath?: string;
  promptTemplate?: string;
}

export interface ReviewPromptConfig {
  id: string;
  name: string;
  description?: string;
  systemPrompt: string;
  userPrompt: string;
}

export interface AgentConfig {
  activeModelId: string | null;
  activePromptId: string | null;
  models: ChatModel[];
  prompts: ReviewPromptConfig[];
  additionalContextGlobs: string[];
}

export interface DiffChunk {
  filePath: string;
  hunks: string[];
}

export interface ReviewContext {
  repoRoot: string;
  commitRange: string;
  diff: DiffChunk[];
  supplementaryFiles: Record<string, string>;
}

export interface ReviewResult {
  summary: string;
  findings: Array<{
    title: string;
    severity: 'info' | 'warning' | 'error';
    details: string;
    filePath?: string;
    line?: number;
    suggestions?: string[];
  }>;
}

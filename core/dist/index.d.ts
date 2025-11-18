export type ModelKind = 'online' | 'offline';

export interface ChatModel {
  id: string;
  name: string;
  kind: ModelKind;
  endpoint?: string;
  method?: string;
  bodyTemplate?: string;
  responsePath?: string;
  headers?: Record<string, string>;
  command?: string;
  args?: string[];
  promptMode?: 'stdin' | 'argument';
  promptArgIndex?: number;
  promptTemplate?: string;
  env?: Record<string, string>;
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

export interface ModelTemplate {
  id: string;
  label: string;
  description: string;
  defaults: Partial<ChatModel>;
}

export interface ConfigUiServerHandle {
  server: import('node:http').Server;
  port: number;
  url: string;
  close(): Promise<void>;
}

export interface DiffChunk {
  filePath: string;
  hunks: string[];
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

export class ConfigManager {
  constructor(workspaceRoot: string);
  load(): Promise<AgentConfig>;
  save(config: AgentConfig): Promise<AgentConfig>;
  upsertModel(model: ChatModel): Promise<AgentConfig>;
  removeModel(modelId: string): Promise<AgentConfig>;
  setActiveModel(modelId: string): Promise<AgentConfig>;
  upsertPrompt(prompt: ReviewPromptConfig): Promise<AgentConfig>;
  removePrompt(promptId: string): Promise<AgentConfig>;
  setActivePrompt(promptId: string): Promise<AgentConfig>;
}

export interface ReviewOptions {
  commitRange: string;
  overridePrompt?: string;
  staged?: boolean;
  modelId?: string;
}

export class ReviewService {
  constructor(configManager: ConfigManager, repoRoot: string);
  review(options: ReviewOptions): Promise<ReviewResult>;
}

export function collectContext(
  repoRoot: string,
  config: AgentConfig,
  diffFiles: string[]
): Promise<Record<string, string>>;

export function renderReviewContext(context: {
  repoRoot: string;
  commitRange: string;
  diff: DiffChunk[];
  supplementaryFiles: Record<string, string>;
}): string;

export function runModel(model: ChatModel, prompt: string): Promise<string>;

export function getDiffChunks(options: { commitRange: string; staged?: boolean }): DiffChunk[];

export function getFileContent(repoRoot: string, relativePath: string): string | null;

export const MODEL_TEMPLATES: ModelTemplate[];

export function findModelTemplate(id: string): ModelTemplate | undefined;

export function startConfigUiServer(
  manager: ConfigManager,
  options?: { host?: string; port?: number }
): Promise<ConfigUiServerHandle>;

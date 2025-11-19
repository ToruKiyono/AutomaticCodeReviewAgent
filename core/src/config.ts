import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { readJSON, writeJSON } from 'fs-extra';
import { AgentConfig, ChatModel, ReviewPromptConfig } from './types.js';

const DEFAULT_CONFIG: AgentConfig = {
  activeModelId: null,
  activePromptId: null,
  models: [],
  prompts: [],
  additionalContextGlobs: ['**/*.go', '**/*.ts', '**/*.tsx', '**/*.py']
};

export class ConfigManager {
  constructor(private readonly workspaceRoot: string) {}

  private get configPath(): string {
    return join(this.workspaceRoot, '.acr-agent.config.json');
  }

  async load(): Promise<AgentConfig> {
    if (!existsSync(this.configPath)) {
      await this.save(DEFAULT_CONFIG);
      return DEFAULT_CONFIG;
    }

    const config = (await readJSON(this.configPath)) as AgentConfig;
    return {
      ...DEFAULT_CONFIG,
      ...config,
      models: config.models ?? [],
      prompts: config.prompts ?? [],
      additionalContextGlobs: config.additionalContextGlobs ?? DEFAULT_CONFIG.additionalContextGlobs
    };
  }

  async save(config: AgentConfig): Promise<void> {
    await writeJSON(this.configPath, config, { spaces: 2 });
  }

  async upsertModel(model: ChatModel): Promise<AgentConfig> {
    const config = await this.load();
    const existingIndex = config.models.findIndex((m) => m.id === model.id);
    if (existingIndex >= 0) {
      config.models[existingIndex] = model;
    } else {
      config.models.push(model);
    }
    if (!config.activeModelId) {
      config.activeModelId = model.id;
    }
    await this.save(config);
    return config;
  }

  async removeModel(modelId: string): Promise<AgentConfig> {
    const config = await this.load();
    config.models = config.models.filter((model) => model.id !== modelId);
    if (config.activeModelId === modelId) {
      config.activeModelId = config.models[0]?.id ?? null;
    }
    await this.save(config);
    return config;
  }

  async upsertPrompt(prompt: ReviewPromptConfig): Promise<AgentConfig> {
    const config = await this.load();
    const index = config.prompts.findIndex((p) => p.id === prompt.id);
    if (index >= 0) {
      config.prompts[index] = prompt;
    } else {
      config.prompts.push(prompt);
    }
    if (!config.activePromptId) {
      config.activePromptId = prompt.id;
    }
    await this.save(config);
    return config;
  }
}

import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { dirname, join } from 'node:path';

const clone = globalThis.structuredClone
  ? (value) => globalThis.structuredClone(value)
  : (value) => JSON.parse(JSON.stringify(value));

const DEFAULT_CONFIG = {
  activeModelId: null,
  activePromptId: null,
  models: [],
  prompts: [],
  additionalContextGlobs: ['**/*.go', '**/*.ts', '**/*.tsx', '**/*.py', '**/*.java']
};

async function fileExists(path) {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function ensureDirectory(filePath) {
  await mkdir(dirname(filePath), { recursive: true });
}

export class ConfigManager {
  constructor(workspaceRoot) {
    this.workspaceRoot = workspaceRoot;
    this.configDir = join(workspaceRoot, '.acr-agent');
    this.configPath = join(this.configDir, 'config.json');
    this.legacyConfigPath = join(workspaceRoot, '.acr-agent.config.json');
  }

  async load() {
    if (await fileExists(this.configPath)) {
      return this.#normalise(JSON.parse(await readFile(this.configPath, 'utf8')));
    }

    if (await fileExists(this.legacyConfigPath)) {
      const legacy = JSON.parse(await readFile(this.legacyConfigPath, 'utf8'));
      await ensureDirectory(this.configPath);
      await writeFile(this.configPath, JSON.stringify(legacy, null, 2));
      try {
        await rename(this.legacyConfigPath, this.legacyConfigPath + '.bak');
      } catch {
        // ignore inability to rename legacy config
      }
      return this.#normalise(legacy);
    }

    await this.save(DEFAULT_CONFIG);
    return clone(DEFAULT_CONFIG);
  }

  async save(config) {
    const merged = this.#normalise(config);
    await ensureDirectory(this.configPath);
    await writeFile(this.configPath, JSON.stringify(merged, null, 2));
    return merged;
  }

  async upsertModel(model) {
    const config = await this.load();
    const existingIndex = config.models.findIndex((item) => item.id === model.id);
    if (existingIndex >= 0) {
      config.models[existingIndex] = { ...config.models[existingIndex], ...model };
    } else {
      config.models.push(model);
    }
    if (!config.activeModelId) {
      config.activeModelId = model.id;
    }
    await this.save(config);
    return config;
  }

  async removeModel(modelId) {
    const config = await this.load();
    config.models = config.models.filter((model) => model.id !== modelId);
    if (config.activeModelId === modelId) {
      config.activeModelId = config.models[0]?.id ?? null;
    }
    await this.save(config);
    return config;
  }

  async setActiveModel(modelId) {
    const config = await this.load();
    if (!config.models.some((model) => model.id === modelId)) {
      throw new Error(`Model ${modelId} does not exist.`);
    }
    config.activeModelId = modelId;
    await this.save(config);
    return config;
  }

  async upsertPrompt(prompt) {
    const config = await this.load();
    const index = config.prompts.findIndex((item) => item.id === prompt.id);
    if (index >= 0) {
      config.prompts[index] = { ...config.prompts[index], ...prompt };
    } else {
      config.prompts.push(prompt);
    }
    if (!config.activePromptId) {
      config.activePromptId = prompt.id;
    }
    await this.save(config);
    return config;
  }

  async removePrompt(promptId) {
    const config = await this.load();
    config.prompts = config.prompts.filter((prompt) => prompt.id !== promptId);
    if (config.activePromptId === promptId) {
      config.activePromptId = config.prompts[0]?.id ?? null;
    }
    await this.save(config);
    return config;
  }

  async setActivePrompt(promptId) {
    const config = await this.load();
    if (!config.prompts.some((prompt) => prompt.id === promptId)) {
      throw new Error(`Prompt ${promptId} does not exist.`);
    }
    config.activePromptId = promptId;
    await this.save(config);
    return config;
  }

  #normalise(config) {
    const merged = {
      ...clone(DEFAULT_CONFIG),
      ...config
    };
    merged.models = Array.isArray(merged.models) ? merged.models : [];
    merged.prompts = Array.isArray(merged.prompts) ? merged.prompts : [];
    merged.additionalContextGlobs =
      Array.isArray(merged.additionalContextGlobs) && merged.additionalContextGlobs.length > 0
        ? merged.additionalContextGlobs
        : clone(DEFAULT_CONFIG.additionalContextGlobs);
    return merged;
  }
}

import { collectContext, renderReviewContext } from './contextResolver.js';
import { getDiffChunks } from './git.js';
import { runModel } from './modelRunner.js';

function parseFindings(output) {
  if (!output) {
    return { summary: '', findings: [] };
  }

  if (output.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(output);
      if (parsed.summary && Array.isArray(parsed.findings)) {
        return parsed;
      }
    } catch {
      // fall back to markdown parsing
    }
  }

  const sections = output.split(/\n## /).map((section, index) => (index === 0 ? section : `## ${section}`));
  const summary = sections[0]?.trim() ?? '';
  const findings = [];

  for (const section of sections.slice(1)) {
    const [titleLine, ...rest] = section.split('\n');
    const title = titleLine.replace(/^##\s*/, '').trim() || 'Issue';
    const details = rest.join('\n').trim();
    findings.push({ title, details, severity: 'warning' });
  }

  if (findings.length === 0 && summary) {
    findings.push({ title: 'General Feedback', details: summary, severity: 'info' });
  }

  return { summary, findings };
}

export function buildPromptFromConfig(config, context, overridePrompt) {
  const promptConfig =
    config.prompts.find((prompt) => prompt.id === config.activePromptId) ?? config.prompts[0];

  const renderedContext = renderReviewContext(context);
  const userPrompt = overridePrompt ?? promptConfig?.userPrompt ?? 'Review the provided diff.';
  const systemPrompt =
    promptConfig?.systemPrompt ?? 'You are an expert code reviewer. Identify issues and improvements.';

  return `System: ${systemPrompt}\n\nUser: ${userPrompt}\n\nContext:\n${renderedContext}`;
}

export class ReviewService {
  constructor(configManager, repoRoot) {
    this.configManager = configManager;
    this.repoRoot = repoRoot;
  }

  async review({ commitRange, overridePrompt, staged = false, modelId }) {
    const config = await this.configManager.load();
    const diff = getDiffChunks({ commitRange, staged, repoRoot: this.repoRoot });
    const supplementaryFiles = await collectContext(
      this.repoRoot,
      config,
      diff.map((chunk) => chunk.filePath)
    );

    const context = {
      repoRoot: this.repoRoot,
      commitRange,
      diff,
      supplementaryFiles
    };

    const prompt = buildPromptFromConfig(config, context, overridePrompt);
    const effectiveModelId = modelId ?? process.env.ACR_AGENT_MODEL ?? config.activeModelId;
    const model = config.models.find((item) => item.id === effectiveModelId) ?? config.models[0];
    if (!model) {
      throw new Error('No model configured. Run "acr-agent configure" to add one.');
    }

    const output = await runModel(model, prompt);
    return parseFindings(output);
  }
}

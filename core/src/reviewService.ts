import { ConfigManager } from './config.js';
import { collectContext, renderReviewContext } from './contextResolver.js';
import { getDiffChunks } from './git.js';
import { runModel } from './modelRunner.js';
import { AgentConfig, ReviewContext, ReviewResult } from './types.js';

export interface ReviewOptions {
  commitRange: string;
  overridePrompt?: string;
  staged?: boolean;
}

export class ReviewService {
  constructor(private readonly configManager: ConfigManager, private readonly repoRoot: string) {}

  async review(options: ReviewOptions): Promise<ReviewResult> {
    const config = await this.configManager.load();
    const diff = getDiffChunks({
      commitRange: options.commitRange,
      staged: options.staged ?? false
    });
    const supplementaryFiles = await collectContext(
      this.repoRoot,
      config,
      diff.map((chunk) => chunk.filePath)
    );

    const context: ReviewContext = {
      repoRoot: this.repoRoot,
      commitRange: options.commitRange,
      diff,
      supplementaryFiles
    };

    const prompt = await this.buildPrompt(config, context, options.overridePrompt);
    const envModelId = process.env.ACR_AGENT_MODEL ?? undefined;
    const modelId = envModelId || config.activeModelId;
    const model = config.models.find((m) => m.id === modelId);
    if (!model) {
      throw new Error('No active model configured.');
    }

    const output = await runModel(model, prompt);

    return this.parseReview(output);
  }

  private async buildPrompt(
    config: AgentConfig,
    context: ReviewContext,
    overridePrompt?: string
  ): Promise<string> {
    const promptConfig =
      config.prompts.find((prompt) => prompt.id === config.activePromptId) ?? config.prompts[0];
    const renderedContext = renderReviewContext(context);

    const userPrompt = overridePrompt ?? promptConfig?.userPrompt ?? 'Review the provided diff.';
    const systemPrompt = promptConfig?.systemPrompt ??
      'You are an expert code reviewer. Identify issues and suggest improvements.';

    return `System: ${systemPrompt}\n\nUser: ${userPrompt}\n\nContext:\n${renderedContext}`;
  }

  private parseReview(output: string): ReviewResult {
    const sections = output.split(/\n## /).map((section, index) => (index === 0 ? section : `## ${section}`));
    const summary = sections[0]?.trim() ?? '';
    const findings: ReviewResult['findings'] = [];

    for (const section of sections.slice(1)) {
      const [titleLine, ...rest] = section.split('\n');
      const title = titleLine.replace(/^##\s*/, '').trim();
      const details = rest.join('\n').trim();
      findings.push({ title, details, severity: 'warning' });
    }

    if (findings.length === 0 && summary) {
      findings.push({ title: 'General Feedback', details: summary, severity: 'info' });
    }

    return { summary, findings };
  }
}

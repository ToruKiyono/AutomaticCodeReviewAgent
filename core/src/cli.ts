#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { ConfigManager } from './config.js';
import { ReviewService } from './reviewService.js';
import { ChatModel, ReviewPromptConfig } from './types.js';

const program = new Command();

const cwd = process.cwd();
const configManager = new ConfigManager(cwd);
const reviewService = new ReviewService(configManager, cwd);

program
  .name('acr-agent')
  .description('Automatic code review agent for Git repositories');

program
  .command('add-model')
  .description('Add or update a chat model configuration')
  .requiredOption('--id <id>', 'Unique model id')
  .requiredOption('--name <name>', 'Model display name')
  .requiredOption('--kind <kind>', 'Model kind: online|offline')
  .option('--endpoint <endpoint>', 'Online endpoint URL')
  .option('--api-key <key>', 'API key for online model')
  .option('--executable <path>', 'Executable path for offline model')
  .action(async (opts) => {
    const model: ChatModel = {
      id: opts.id,
      name: opts.name,
      kind: opts.kind,
      endpoint: opts.endpoint,
      apiKey: opts.apiKey,
      executablePath: opts.executable
    };

    await configManager.upsertModel(model);
    console.log(chalk.green(`Model ${model.name} saved.`));
  });

program
  .command('add-prompt')
  .description('Add or update a review prompt preset')
  .requiredOption('--id <id>', 'Prompt id')
  .requiredOption('--name <name>', 'Prompt name')
  .requiredOption('--system <prompt>', 'System prompt')
  .requiredOption('--user <prompt>', 'User prompt template')
  .action(async (opts) => {
    const prompt: ReviewPromptConfig = {
      id: opts.id,
      name: opts.name,
      systemPrompt: opts.system,
      userPrompt: opts.user
    };
    await configManager.upsertPrompt(prompt);
    console.log(chalk.green(`Prompt ${prompt.name} saved.`));
  });

program
  .command('review')
  .description('Run a review for a commit range')
  .requiredOption('--range <commitRange>', 'Commit range to review (e.g., HEAD~1..HEAD). Use HEAD for staged diff.')
  .option('--staged', 'Review staged changes instead of committed diff', false)
  .option('--prompt <prompt>', 'Override user prompt')
  .action(async (opts) => {
    try {
      const result = await reviewService.review({
        commitRange: opts.range,
        overridePrompt: opts.prompt,
        staged: opts.staged
      });
      console.log(chalk.bold('Summary:'));
      console.log(result.summary);
      console.log();
      if (result.findings.length > 0) {
        console.log(chalk.bold('Findings:'));
        for (const finding of result.findings) {
          console.log(`- [${finding.severity.toUpperCase()}] ${finding.title}`);
          console.log(finding.details);
          if (finding.suggestions?.length) {
            console.log('  Suggestions:');
            for (const suggestion of finding.suggestions) {
              console.log(`    • ${suggestion}`);
            }
          }
          console.log();
        }
      }
    } catch (error) {
      console.error(chalk.red((error as Error).message));
      process.exit(1);
    }
  });

program.parseAsync(process.argv);

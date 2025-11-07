import * as vscode from 'vscode';

type CoreModule = typeof import('acr-agent-core/dist/index.js');

async function loadCore(): Promise<CoreModule> {
  return import('acr-agent-core/dist/index.js');
}

interface ModelTemplate {
  id: string;
  label: string;
  description: string;
  defaults: Record<string, unknown>;
}

const MODEL_TEMPLATES: ModelTemplate[] = [
  {
    id: 'openai-chat',
    label: 'OpenAI Chat Completions',
    description: 'HTTPS JSON request with bearer auth and chat-style payload',
    defaults: {
      kind: 'online',
      name: 'OpenAI Chat (gpt-4o-mini)',
      endpoint: 'https://api.openai.com/v1/chat/completions',
      method: 'POST',
      bodyTemplate: '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"{{prompt}}"}]}',
      responsePath: 'choices.0.message.content',
      headers: {
        Authorization: 'Bearer {{env:OPENAI_API_KEY}}'
      }
    }
  },
  {
    id: 'generic-http',
    label: 'Generic HTTP JSON',
    description: 'Minimal JSON POST with prompt interpolation',
    defaults: {
      kind: 'online',
      method: 'POST',
      bodyTemplate: '{"input":"{{prompt}}"}',
      responsePath: 'output'
    }
  },
  {
    id: 'local-stdin',
    label: 'Local CLI (stdin)',
    description: 'Runs a local executable and streams the prompt to stdin',
    defaults: {
      kind: 'offline',
      command: './review.sh',
      promptMode: 'stdin',
      promptTemplate: '{{prompt}}'
    }
  },
  {
    id: 'local-argument',
    label: 'Local CLI (argument)',
    description: 'Runs a local executable and injects the prompt as an argument',
    defaults: {
      kind: 'offline',
      command: './review.sh',
      promptMode: 'argument',
      promptTemplate: '{{prompt}}'
    }
  }
];

async function ensureWorkspaceFolder() {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    throw new Error('ACR Agent requires an open workspace.');
  }
  return workspaceFolder;
}

async function ensureConfigManager() {
  const core = await loadCore();
  const workspaceFolder = await ensureWorkspaceFolder();
  return new core.ConfigManager(workspaceFolder.uri.fsPath);
}

async function ensureReviewService() {
  const core = await loadCore();
  const manager = await ensureConfigManager();
  const workspaceFolder = await ensureWorkspaceFolder();
  return new core.ReviewService(manager, workspaceFolder.uri.fsPath);
}

function splitInput(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  return value
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function activate(context: vscode.ExtensionContext) {
  const configureDisposable = vscode.commands.registerCommand(
    'acrAgent.configureModels',
    async () => {
      try {
        const core = await loadCore();
        const manager = await ensureConfigManager();
        const config = await manager.load();
        const id = await vscode.window.showInputBox({ prompt: 'Model id', placeHolder: 'gpt-4' });
        if (!id) return;
        const existing = config.models.find((model) => model.id === id);
        let templateDefaults: Record<string, unknown> = {};
        if (!existing) {
          const templatePick = await vscode.window.showQuickPick(
            [
              ...MODEL_TEMPLATES.map((template) => ({
                label: template.label,
                description: template.description,
                template
              })),
              { label: 'Custom setup', description: 'Start from a blank configuration' }
            ],
            {
              placeHolder: 'Choose a model template',
              ignoreFocusOut: true
            }
          );
          if (!templatePick) return;
          if ('template' in templatePick && templatePick.template) {
            templateDefaults = { ...templatePick.template.defaults };
          }
        }

        const model: Record<string, unknown> = existing ? { ...existing } : { ...templateDefaults };
        model.id = id;

        const name = await vscode.window.showInputBox({
          prompt: 'Model name',
          placeHolder: 'OpenAI GPT-4',
          value: typeof model.name === 'string' ? (model.name as string) : ''
        });
        if (!name) return;
        model.name = name;

        const currentKind =
          typeof model.kind === 'string' && (model.kind === 'online' || model.kind === 'offline')
            ? (model.kind as string)
            : 'online';
        const kind = await vscode.window.showQuickPick(['online', 'offline'], {
          placeHolder: `Model kind (current: ${currentKind})`
        });
        if (!kind) return;
        model.kind = kind;

        if (kind === 'online') {
          const endpoint = await vscode.window.showInputBox({
            prompt: 'Endpoint URL',
            value: typeof model.endpoint === 'string' ? (model.endpoint as string) : ''
          });
          if (!endpoint) return;
          model.endpoint = endpoint;
          const method = await vscode.window.showInputBox({
            prompt: 'HTTP method',
            value: typeof model.method === 'string' ? (model.method as string) : 'POST'
          });
          model.method = method || undefined;
          const bodyTemplate = await vscode.window.showInputBox({
            prompt: 'Request body template (use {{prompt}})',
            value:
              typeof model.bodyTemplate === 'string'
                ? (model.bodyTemplate as string)
                : '{"input":"{{prompt}}"}'
          });
          model.bodyTemplate = bodyTemplate || undefined;
          const responsePath = await vscode.window.showInputBox({
            prompt: 'Response JSON path (e.g. choices.0.message.content)',
            value:
              typeof model.responsePath === 'string' ? (model.responsePath as string) : 'output'
          });
          model.responsePath = responsePath || undefined;

          const startingHeaders =
            typeof model.headers === 'object' && model.headers
              ? (model.headers as Record<string, string>)
              : {};
          const headers: Record<string, string> = { ...startingHeaders };
          for (const [key, value] of Object.entries(headers)) {
            const decision = await vscode.window.showQuickPick(['Keep', 'Remove'], {
              placeHolder: `Existing header ${key}=${value}`
            });
            if (!decision) return;
            if (decision === 'Remove') {
              delete headers[key];
            }
          }
          while (true) {
            const header = await vscode.window.showInputBox({
              prompt: 'Header (key=value, leave empty to finish)',
              placeHolder: 'Authorization=Bearer {{env:OPENAI_API_KEY}}'
            });
            if (!header) break;
            const [key, ...rest] = header.split('=');
            if (!key) continue;
            headers[key.trim()] = rest.join('=').trim();
          }
          if (Object.keys(headers).length > 0) {
            model.headers = headers;
          } else if (Object.keys(startingHeaders).length > 0) {
            model.headers = {};
          }
        } else {
          const command = await vscode.window.showInputBox({
            prompt: 'Command or executable path',
            value: typeof model.command === 'string' ? (model.command as string) : ''
          });
          if (!command) return;
          model.command = command;
          const existingArgs = Array.isArray(model.args) ? (model.args as string[]) : undefined;
          const argsInput = await vscode.window.showInputBox({
            prompt: 'Arguments (space separated, optional)',
            value: existingArgs ? existingArgs.join(' ') : ''
          });
          const args = splitInput(argsInput);
          if (args?.length) {
            model.args = args;
          } else if (existingArgs?.length) {
            model.args = [];
          }
          const promptMode = await vscode.window.showQuickPick(['stdin', 'argument'], {
            placeHolder: `Prompt delivery (current: ${model.promptMode ?? 'stdin'})`
          });
          if (!promptMode) return;
          model.promptMode = promptMode;
          if (promptMode === 'argument') {
            const promptArgIndex = await vscode.window.showInputBox({
              prompt: 'Argument index for the prompt (0-based, optional)',
              value:
                typeof model.promptArgIndex === 'number'
                  ? (model.promptArgIndex as number).toString()
                  : ''
            });
            if (promptArgIndex) {
              const parsed = Number.parseInt(promptArgIndex, 10);
              if (!Number.isNaN(parsed)) {
                model.promptArgIndex = parsed;
              } else if (typeof model.promptArgIndex === 'number') {
                model.promptArgIndex = undefined;
              }
            } else if (typeof model.promptArgIndex === 'number') {
              model.promptArgIndex = undefined;
            }
          } else if (typeof model.promptArgIndex === 'number') {
            model.promptArgIndex = undefined;
          }
          const promptTemplate = await vscode.window.showInputBox({
            prompt: 'Prompt template (use {{prompt}})',
            value:
              typeof model.promptTemplate === 'string'
                ? (model.promptTemplate as string)
                : '{{prompt}}'
          });
          model.promptTemplate = promptTemplate || undefined;
          const baseEnv =
            typeof model.env === 'object' && model.env ? (model.env as Record<string, string>) : {};
          const envVars: Record<string, string> = { ...baseEnv };
          for (const [key, value] of Object.entries(envVars)) {
            const decision = await vscode.window.showQuickPick(['Keep', 'Remove'], {
              placeHolder: `Existing env ${key}=${value}`
            });
            if (!decision) return;
            if (decision === 'Remove') {
              delete envVars[key];
            }
          }
          while (true) {
            const entry = await vscode.window.showInputBox({
              prompt: 'Environment variable (KEY=VALUE, leave empty to finish)',
              placeHolder: 'LLM_API_KEY={{env:OPENAI_API_KEY}}'
            });
            if (!entry) break;
            const [key, ...rest] = entry.split('=');
            if (!key) continue;
            envVars[key.trim()] = rest.join('=').trim();
          }
          if (Object.keys(envVars).length > 0) {
            model.env = envVars;
          } else if (Object.keys(baseEnv).length > 0) {
            model.env = {};
          }
        }

        await manager.upsertModel(model);
        vscode.window.showInformationMessage(`Model ${name} saved.`);
      } catch (error) {
        vscode.window.showErrorMessage((error as Error).message);
      }
    }
  );

  const reviewDisposable = vscode.commands.registerCommand('acrAgent.runReview', async () => {
    try {
      const service = await ensureReviewService();
      const promptOverride = await vscode.window.showInputBox({
        prompt: 'Override review prompt (optional)',
        value: vscode.workspace.getConfiguration().get<string>('acrAgent.defaultPrompt')
      });

      const result = await service.review({ commitRange: 'HEAD~1..HEAD', overridePrompt: promptOverride });
      vscode.window.showInformationMessage('ACR Agent review completed. Check the output panel for details.');
      const panel = vscode.window.createOutputChannel('ACR Agent Review');
      panel.clear();
      panel.appendLine('Summary');
      panel.appendLine(result.summary);
      panel.appendLine('');
      if (result.findings.length) {
        panel.appendLine('Findings:');
        for (const finding of result.findings) {
          panel.appendLine(`- [${finding.severity}] ${finding.title}`);
          panel.appendLine(`  ${finding.details}`);
          panel.appendLine('');
        }
      }
      panel.show(true);
    } catch (error) {
      vscode.window.showErrorMessage((error as Error).message);
    }
  });

  context.subscriptions.push(configureDisposable, reviewDisposable);
}

export function deactivate() {}

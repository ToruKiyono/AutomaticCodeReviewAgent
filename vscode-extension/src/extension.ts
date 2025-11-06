import * as vscode from 'vscode';

type CoreModule = typeof import('acr-agent-core/dist/index.js');

async function loadCore(): Promise<CoreModule> {
  return import('acr-agent-core/dist/index.js');
}

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
        const name = await vscode.window.showInputBox({
          prompt: 'Model name',
          placeHolder: 'OpenAI GPT-4',
          value: existing?.name ?? ''
        });
        if (!name) return;
        const kind = await vscode.window.showQuickPick(['online', 'offline'], {
          placeHolder: `Model kind (current: ${existing?.kind ?? 'online'})`
        });
        if (!kind) return;

        const model: Record<string, unknown> = {
          id,
          name,
          kind: kind as 'online' | 'offline'
        };

        if (kind === 'online') {
          const endpoint = await vscode.window.showInputBox({
            prompt: 'Endpoint URL',
            value: typeof existing?.endpoint === 'string' ? existing.endpoint : ''
          });
          if (!endpoint) return;
          model.endpoint = endpoint;
          const method = await vscode.window.showInputBox({
            prompt: 'HTTP method',
            value: typeof existing?.method === 'string' ? existing.method : 'POST'
          });
          model.method = method || undefined;
          const bodyTemplate = await vscode.window.showInputBox({
            prompt: 'Request body template (use {{prompt}})',
            value: typeof existing?.bodyTemplate === 'string' ? existing.bodyTemplate : '{"input":"{{prompt}}"}'
          });
          model.bodyTemplate = bodyTemplate || undefined;
          const responsePath = await vscode.window.showInputBox({
            prompt: 'Response JSON path (e.g. choices.0.message.content)',
            value: typeof existing?.responsePath === 'string' ? existing.responsePath : 'output'
          });
          model.responsePath = responsePath || undefined;

          const headers: Record<string, string> = { ...(existing?.headers ?? {}) };
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
          } else if (existing?.headers && Object.keys(existing.headers).length > 0) {
            model.headers = {};
          }
        } else {
          const command = await vscode.window.showInputBox({
            prompt: 'Command or executable path',
            value: typeof existing?.command === 'string' ? existing.command : ''
          });
          if (!command) return;
          model.command = command;
          const existingArgs = Array.isArray(existing?.args) ? existing?.args ?? [] : undefined;
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
            placeHolder: `Prompt delivery (current: ${existing?.promptMode ?? 'stdin'})`
          });
          if (!promptMode) return;
          model.promptMode = promptMode;
          if (promptMode === 'argument') {
            const promptArgIndex = await vscode.window.showInputBox({
              prompt: 'Argument index for the prompt (0-based, optional)',
              value:
                typeof existing?.promptArgIndex === 'number'
                  ? existing.promptArgIndex.toString()
                  : ''
            });
            if (promptArgIndex) {
              const parsed = Number.parseInt(promptArgIndex, 10);
              if (!Number.isNaN(parsed)) {
                model.promptArgIndex = parsed;
              } else if (typeof existing?.promptArgIndex === 'number') {
                model.promptArgIndex = undefined;
              }
            } else if (typeof existing?.promptArgIndex === 'number') {
              model.promptArgIndex = undefined;
            }
          } else if (typeof existing?.promptArgIndex === 'number') {
            model.promptArgIndex = undefined;
          }
          const promptTemplate = await vscode.window.showInputBox({
            prompt: 'Prompt template (use {{prompt}})',
            value: typeof existing?.promptTemplate === 'string' ? existing.promptTemplate : '{{prompt}}'
          });
          model.promptTemplate = promptTemplate || undefined;
          const envVars: Record<string, string> = { ...(existing?.env ?? {}) };
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
          } else if (existing?.env && Object.keys(existing.env).length > 0) {
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

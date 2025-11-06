import * as vscode from 'vscode';

type CoreModule = typeof import('acr-agent-core/dist/index.js');

async function loadCore(): Promise<CoreModule> {
  return import('acr-agent-core/dist/index.js');
}

async function ensureConfigManager() {
  const core = await loadCore();
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    throw new Error('ACR Agent requires an open workspace.');
  }
  return new core.ConfigManager(workspaceFolder.uri.fsPath);
}

async function ensureReviewService() {
  const core = await loadCore();
  const manager = await ensureConfigManager();
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  return new core.ReviewService(manager, workspaceFolder!.uri.fsPath);
}

export function activate(context: vscode.ExtensionContext) {
  const configureDisposable = vscode.commands.registerCommand(
    'acrAgent.configureModels',
    async () => {
      try {
        const core = await loadCore();
        const manager = await ensureConfigManager();
        const id = await vscode.window.showInputBox({ prompt: 'Model id', placeHolder: 'gpt-4' });
        if (!id) return;
        const name = await vscode.window.showInputBox({ prompt: 'Model name', placeHolder: 'OpenAI GPT-4' });
        if (!name) return;
        const kind = await vscode.window.showQuickPick(['online', 'offline'], { placeHolder: 'Model kind' });
        if (!kind) return;

        const model: any = {
          id,
          name,
          kind: kind as 'online' | 'offline'
        };
        if (kind === 'online') {
          model.endpoint = await vscode.window.showInputBox({ prompt: 'Endpoint URL' });
          model.apiKey = await vscode.window.showInputBox({ prompt: 'API key (optional)', password: true });
        } else {
          model.executablePath = await vscode.window.showInputBox({ prompt: 'Executable path' });
        }

        await manager.upsertModel(model);
        vscode.window.showInformationMessage(`Model ${model.name} saved.`);
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

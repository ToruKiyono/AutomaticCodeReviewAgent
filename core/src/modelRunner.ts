import { spawn } from 'node:child_process';
import { ChatModel } from './types.js';

export async function runModel(model: ChatModel, prompt: string): Promise<string> {
  if (model.kind === 'online') {
    if (!model.endpoint) {
      throw new Error(`Model ${model.name} missing endpoint`);
    }

    const response = await fetch(model.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(model.apiKey ? { Authorization: `Bearer ${model.apiKey}` } : {})
      },
      body: JSON.stringify({ input: prompt })
    });

    if (!response.ok) {
      throw new Error(`Model request failed: ${response.statusText}`);
    }

    const payload = (await response.json()) as { output: string };
    return payload.output;
  }

  if (!model.executablePath) {
    throw new Error(`Offline model ${model.name} missing executable path`);
  }

  const output = await new Promise<string>((resolve, reject) => {
    const child = spawn(model.executablePath!, [], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);

    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`Model exited with code ${code}: ${stderr}`));
      }
    });

    child.stdin.write(prompt);
    child.stdin.end();
  });

  return output;
}

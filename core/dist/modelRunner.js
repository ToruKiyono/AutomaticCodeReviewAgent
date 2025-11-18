import { spawn } from 'node:child_process';
import { EOL } from 'node:os';

function renderTemplate(template, prompt) {
  if (!template) return prompt;
  return template.replace(/{{\s*prompt\s*}}/gi, prompt).replace(/{{\s*env:([A-Z0-9_]+)\s*}}/gi, (_, name) => {
    return process.env[name] ?? '';
  });
}

function extractByPath(payload, pathExpression) {
  if (!pathExpression) {
    return payload;
  }
  const segments = pathExpression.split('.');
  let current = payload;
  for (const segment of segments) {
    if (segment === '') continue;
    if (Array.isArray(current)) {
      const index = Number.parseInt(segment, 10);
      current = Number.isNaN(index) ? undefined : current[index];
    } else if (current && typeof current === 'object') {
      current = current[segment];
    } else {
      current = undefined;
    }
    if (current === undefined || current === null) {
      break;
    }
  }
  return current;
}

async function runOnlineModel(model, prompt) {
  if (!model.endpoint) {
    throw new Error(`Online model ${model.name} is missing an endpoint.`);
  }

  const method = model.method ?? 'POST';
  const headers = Object.entries(model.headers ?? {}).reduce((acc, [key, value]) => {
    acc[key] = renderTemplate(String(value), prompt);
    return acc;
  }, {});

  let body = undefined;
  if (model.bodyTemplate ?? true) {
    const template = model.bodyTemplate ?? '{"input":"{{prompt}}"}';
    const rendered = renderTemplate(template, prompt);
    try {
      body = JSON.stringify(JSON.parse(rendered));
    } catch {
      body = rendered;
    }
    headers['Content-Type'] ??= 'application/json';
  }

  const response = await fetch(model.endpoint, { method, headers, body });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Model request failed (${response.status}): ${text}`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const payload = await response.json();
    const extracted = extractByPath(payload, model.responsePath ?? 'output');
    if (typeof extracted === 'string') {
      return extracted;
    }
    return JSON.stringify(extracted, null, 2);
  }

  return await response.text();
}

async function runOfflineModel(model, prompt) {
  if (!model.command) {
    throw new Error(`Offline model ${model.name} is missing a command.`);
  }

  const args = Array.isArray(model.args) ? [...model.args] : [];
  const promptMode = model.promptMode ?? 'stdin';
  const renderedPrompt = renderTemplate(model.promptTemplate ?? '{{prompt}}', prompt);

  if (promptMode === 'argument') {
    const index = typeof model.promptArgIndex === 'number' ? model.promptArgIndex : args.length;
    args.splice(index, 0, renderedPrompt);
  }

  const env = Object.entries(model.env ?? {}).reduce((acc, [key, value]) => {
    acc[key] = renderTemplate(String(value), prompt);
    return acc;
  }, {});

  return await new Promise((resolve, reject) => {
    const child = spawn(model.command, args, {
      env: { ...process.env, ...env },
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

    if (promptMode === 'stdin') {
      child.stdin.write(renderedPrompt + EOL);
    }
    child.stdin.end();
  });
}

export async function runModel(model, prompt) {
  if (model.kind === 'online') {
    return runOnlineModel(model, prompt);
  }
  return runOfflineModel(model, prompt);
}

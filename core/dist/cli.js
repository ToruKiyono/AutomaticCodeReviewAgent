#!/usr/bin/env node
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { ConfigManager } from './config.js';
import { ReviewService } from './reviewService.js';

const cwd = process.cwd();
const manager = new ConfigManager(cwd);
const reviewService = new ReviewService(manager, cwd);

const MODEL_TEMPLATES = [
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
      args: [],
      promptMode: 'argument',
      promptTemplate: '{{prompt}}'
    }
  }
];

function findModelTemplate(id) {
  return MODEL_TEMPLATES.find((template) => template.id === id);
}

async function chooseModelTemplate(initialId) {
  console.log('\nModel templates:');
  for (const template of MODEL_TEMPLATES) {
    console.log(` - ${template.id}: ${template.label} (${template.description})`);
  }
  console.log(' - custom: Start from a blank configuration');
  const choice = await prompt('Template id (press enter for custom)', {
    defaultValue: initialId ?? '',
    allowEmpty: true
  });
  const trimmed = choice.trim();
  if (!trimmed) {
    return null;
  }
  const template = findModelTemplate(trimmed);
  if (!template) {
    console.log(`Unknown template ${trimmed}. Falling back to custom setup.`);
  }
  return template ?? null;
}

function parseArgs(argv) {
  const result = { _: [] };
  const args = [...argv];
  while (args.length > 0) {
    const token = args.shift();
    if (!token.startsWith('--')) {
      result._.push(token);
      continue;
    }
    const [rawKey, inlineValue] = token.slice(2).split('=');
    const key = rawKey.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    if (inlineValue !== undefined) {
      assignFlag(result, key, inlineValue);
      continue;
    }
    if (args[0]?.startsWith('--') || args.length === 0) {
      assignFlag(result, key, true);
    } else {
      assignFlag(result, key, args.shift());
    }
  }
  return result;
}

function assignFlag(target, key, value) {
  if (key in target) {
    if (Array.isArray(target[key])) {
      target[key].push(value);
    } else {
      target[key] = [target[key], value];
    }
  } else {
    target[key] = value;
  }
}

async function prompt(question, { defaultValue, allowEmpty = false } = {}) {
  const rl = createInterface({ input, output });
  const suffix = defaultValue ? ` (${defaultValue})` : '';
  const answer = await rl.question(`${question}${suffix}: `);
  rl.close();
  if (!answer && defaultValue !== undefined) {
    return defaultValue;
  }
  if (!answer && !allowEmpty) {
    return prompt(question, { defaultValue, allowEmpty });
  }
  return answer;
}

async function promptYesNo(question, defaultValue = true) {
  const choice = (await prompt(`${question} [${defaultValue ? 'Y/n' : 'y/N'}]`, { defaultValue: '' }))
    .trim()
    .toLowerCase();
  if (!choice) return defaultValue;
  return choice.startsWith('y');
}

async function interactiveModelEditor(existing, presetId) {
  const base = { ...(existing ?? {}) };
  const shouldOfferTemplate = Boolean(presetId) || !base.kind;
  if (shouldOfferTemplate) {
    const template =
      typeof presetId === 'string' && presetId
        ? findModelTemplate(presetId) ?? (await chooseModelTemplate(presetId))
        : await chooseModelTemplate();
    if (template) {
      console.log(`Using template: ${template.label}`);
      Object.assign(base, template.defaults);
    }
  }
  if (!base.kind) {
    base.kind = 'online';
  }
  const id = await prompt('Model id', { defaultValue: base.id });
  const name = await prompt('Model display name', { defaultValue: base.name });
  let kind = base.kind ?? 'online';
  const kindAnswer = await prompt('Model kind (online/offline)', { defaultValue: kind });
  kind = kindAnswer.toLowerCase() === 'offline' ? 'offline' : 'online';

  if (kind === 'online') {
    const endpoint = await prompt('Endpoint URL', { defaultValue: base.endpoint });
    const method = await prompt('HTTP method', { defaultValue: base.method ?? 'POST' });
    const bodyTemplate = await prompt('Request body template (use {{prompt}})', {
      defaultValue: base.bodyTemplate ?? '{"input":"{{prompt}}"}'
    });
    const responsePath = await prompt('Response JSON path (e.g. choices.0.message.content or output)', {
      defaultValue: base.responsePath ?? 'output'
    });

    const headers = {};
    const existingHeaders = base.headers ?? {};
    for (const [key, value] of Object.entries(existingHeaders)) {
      const shouldKeep = await promptYesNo(`Keep header ${key}=${value}?`, true);
      if (shouldKeep) {
        headers[key] = value;
      }
    }

    while (await promptYesNo('Add or update a header?', false)) {
      const key = await prompt('  Header name', { allowEmpty: false });
      const value = await prompt('  Header value (use {{env:VAR}} for environment variables)', { allowEmpty: false });
      headers[key] = value;
    }

    return {
      id,
      name,
      kind,
      endpoint,
      method,
      bodyTemplate,
      responsePath,
      headers
    };
  }

  const command = await prompt('Command or executable path', { defaultValue: base.command });
  const argsRaw = await prompt('Arguments (space separated, leave blank for none)', {
    defaultValue: Array.isArray(base.args) ? base.args.join(' ') : ''
  });
  const promptModeAnswer = await prompt('Prompt delivery (stdin/argument)', {
    defaultValue: base.promptMode ?? 'stdin'
  });
  const promptMode = promptModeAnswer.toLowerCase() === 'argument' ? 'argument' : 'stdin';
  let promptArgIndex = base.promptArgIndex;
  if (promptMode === 'argument') {
    const argIndexRaw = await prompt('Argument index for prompt (0-based, leave blank to append)', {
      defaultValue: base.promptArgIndex !== undefined ? String(base.promptArgIndex) : ''
    });
    promptArgIndex = argIndexRaw === '' ? undefined : Number.parseInt(argIndexRaw, 10);
  }
  const promptTemplate = await prompt('Prompt template (use {{prompt}})', {
    defaultValue: base.promptTemplate ?? '{{prompt}}'
  });

  const env = { ...(base.env ?? {}) };
  for (const [key, value] of Object.entries(env)) {
    const keep = await promptYesNo(`Keep env ${key}=${value}?`, true);
    if (!keep) {
      delete env[key];
    }
  }
  while (await promptYesNo('Add or update an environment variable?', false)) {
    const key = await prompt('  Env name', { allowEmpty: false });
    const value = await prompt('  Env value (use {{prompt}} to inject prompt if needed)', { allowEmpty: false });
    env[key] = value;
  }

  const args = argsRaw.trim() ? argsRaw.trim().split(/\s+/) : [];
  return {
    id,
    name,
    kind,
    command,
    args,
    promptMode,
    promptArgIndex,
    promptTemplate,
    env
  };
}

async function interactivePromptEditor(existing) {
  const base = existing ?? {};
  const id = await prompt('Prompt id', { defaultValue: base.id });
  const name = await prompt('Prompt name', { defaultValue: base.name });
  const description = await prompt('Description (optional)', { defaultValue: base.description ?? '', allowEmpty: true });
  const systemPrompt = await prompt('System prompt', {
    defaultValue:
      base.systemPrompt ?? 'You are an expert reviewer. Highlight bugs, risks, and suggest actionable fixes.'
  });
  const userPrompt = await prompt('User prompt template', {
    defaultValue:
      base.userPrompt ??
      'Review the diff and point out defects, regressions, missing tests, and risky assumptions. Use the supplied context as needed.'
  });
  return { id, name, description, systemPrompt, userPrompt };
}

async function handleConfigure() {
  const config = await manager.load();
  let exit = false;
  while (!exit) {
    console.log('\nCurrent models:');
    for (const model of config.models) {
      const marker = config.activeModelId === model.id ? '*' : ' ';
      console.log(` ${marker} ${model.id} (${model.kind}) - ${model.name}`);
    }
    if (config.models.length === 0) {
      console.log('   No models configured yet.');
    }

    console.log('\nCurrent prompts:');
    for (const promptConfig of config.prompts) {
      const marker = config.activePromptId === promptConfig.id ? '*' : ' ';
      console.log(` ${marker} ${promptConfig.id} - ${promptConfig.name}`);
    }
    if (config.prompts.length === 0) {
      console.log('   No prompts configured yet.');
    }

    console.log('\nMenu');
    console.log(' 1) Add or edit model');
    console.log(' 2) Remove model');
    console.log(' 3) Set active model');
    console.log(' 4) Add or edit prompt');
    console.log(' 5) Remove prompt');
    console.log(' 6) Set active prompt');
    console.log(' 7) Update context globs');
    console.log(' 0) Exit');

    const choice = await prompt('Choose an option', { defaultValue: '0', allowEmpty: true });
    switch (choice.trim()) {
      case '1': {
        const modelId = await prompt('Enter existing model id to edit or provide a new one', {
          allowEmpty: false
        });
        const existing = config.models.find((m) => m.id === modelId);
        const model = await interactiveModelEditor(existing ?? { id: modelId });
        await manager.upsertModel(model);
        Object.assign(config, await manager.load());
        console.log(`Saved model ${model.id}.`);
        break;
      }
      case '2': {
        if (config.models.length === 0) {
          console.log('No models to remove.');
          break;
        }
        const modelId = await prompt('Model id to remove', { allowEmpty: false });
        await manager.removeModel(modelId);
        Object.assign(config, await manager.load());
        console.log(`Removed model ${modelId}.`);
        break;
      }
      case '3': {
        const modelId = await prompt('Model id to activate', { allowEmpty: false });
        await manager.setActiveModel(modelId);
        Object.assign(config, await manager.load());
        console.log(`Activated model ${modelId}.`);
        break;
      }
      case '4': {
        const promptId = await prompt('Enter prompt id to edit or create', { allowEmpty: false });
        const existingPrompt = config.prompts.find((p) => p.id === promptId);
        const promptConfig = await interactivePromptEditor(existingPrompt ?? { id: promptId });
        await manager.upsertPrompt(promptConfig);
        Object.assign(config, await manager.load());
        console.log(`Saved prompt ${promptConfig.id}.`);
        break;
      }
      case '5': {
        if (config.prompts.length === 0) {
          console.log('No prompts to remove.');
          break;
        }
        const promptId = await prompt('Prompt id to remove', { allowEmpty: false });
        await manager.removePrompt(promptId);
        Object.assign(config, await manager.load());
        console.log(`Removed prompt ${promptId}.`);
        break;
      }
      case '6': {
        const promptId = await prompt('Prompt id to activate', { allowEmpty: false });
        await manager.setActivePrompt(promptId);
        Object.assign(config, await manager.load());
        console.log(`Activated prompt ${promptId}.`);
        break;
      }
      case '7': {
        const globsRaw = await prompt('Comma separated glob patterns', {
          defaultValue: config.additionalContextGlobs.join(', '),
          allowEmpty: false
        });
        const globs = globsRaw
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean);
        config.additionalContextGlobs = globs;
        await manager.save(config);
        Object.assign(config, await manager.load());
        console.log('Updated context globs.');
        break;
      }
      case '0':
      default:
        exit = true;
        break;
    }
  }
}

async function handleAddModel(flags) {
  const presetId = typeof flags.preset === 'string' ? flags.preset : undefined;
  const preset = presetId ? findModelTemplate(presetId) : undefined;
  const hasRequiredFlags = Boolean(flags.id && flags.name && (flags.kind || preset?.defaults?.kind));

  if (!hasRequiredFlags) {
    console.log('Missing required flags. Launching interactive editor.');
    const model = await interactiveModelEditor(
      {
        id: flags.id,
        name: flags.name,
        kind: flags.kind ?? preset?.defaults?.kind
      },
      presetId
    );
    await manager.upsertModel(model);
    console.log(`Saved model ${model.id}.`);
    return;
  }

  const kind = String(flags.kind ?? preset?.defaults?.kind ?? 'online').toLowerCase() === 'offline' ? 'offline' : 'online';
  const model = {
    ...(preset?.defaults ?? {}),
    id: flags.id,
    name: flags.name,
    kind
  };

  if (kind === 'online') {
    model.endpoint = flags.endpoint ?? model.endpoint;
    model.method = flags.method ?? model.method;
    model.bodyTemplate = flags.bodyTemplate ?? model.bodyTemplate;
    model.responsePath = flags.responsePath ?? model.responsePath;
    const headers = {};
    const headerFlags = Array.isArray(flags.header) ? flags.header : flags.header ? [flags.header] : [];
    const existingHeaders = typeof model.headers === 'object' && model.headers ? { ...model.headers } : {};
    for (const [key, value] of Object.entries(existingHeaders)) {
      headers[key] = value;
    }
    for (const header of headerFlags) {
      const [key, ...rest] = header.split('=');
      if (key) {
        headers[key] = rest.join('=');
      }
    }
    if (Object.keys(headers).length > 0) {
      model.headers = headers;
    }
  } else {
    model.command = flags.command ?? model.command;
    const args = Array.isArray(flags.args)
      ? flags.args
      : typeof flags.args === 'string'
      ? flags.args
          .split(/[,\s]+/)
          .map((part) => part.trim())
          .filter(Boolean)
      : Array.isArray(model.args)
      ? model.args
      : [];
    if (args.length > 0) {
      model.args = args;
    }
    model.promptMode = flags.promptMode ?? model.promptMode;
    if (flags.promptArgIndex !== undefined) {
      model.promptArgIndex = Number.parseInt(flags.promptArgIndex, 10);
    }
    model.promptTemplate = flags.promptTemplate ?? model.promptTemplate;
    const env = {};
    const envFlags = Array.isArray(flags.env) ? flags.env : flags.env ? [flags.env] : [];
    const existingEnv = typeof model.env === 'object' && model.env ? { ...model.env } : {};
    for (const [key, value] of Object.entries(existingEnv)) {
      env[key] = value;
    }
    for (const entry of envFlags) {
      const [key, ...rest] = entry.split('=');
      if (key) {
        env[key] = rest.join('=');
      }
    }
    if (Object.keys(env).length > 0) {
      model.env = env;
    }
  }

  await manager.upsertModel(model);
  console.log(`Saved model ${model.id}.`);
}

async function handleReview(flags) {
  const commitRange = flags.range ?? 'HEAD~1..HEAD';
  const staged = Boolean(flags.staged);
  const overridePrompt = flags.prompt;
  const modelId = flags.model;
  const format = (flags.format ?? 'human').toLowerCase();

  const result = await reviewService.review({ commitRange, overridePrompt, staged, modelId });

  if (format === 'json') {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log('Summary');
  console.log(result.summary || '(no summary returned)');
  console.log('');
  if (result.findings.length === 0) {
    console.log('No findings reported.');
    return;
  }
  console.log('Findings');
  for (const finding of result.findings) {
    console.log(`- [${finding.severity ?? 'info'}] ${finding.title}`);
    if (finding.details) {
      console.log(`  ${finding.details}`);
    }
    if (finding.suggestions) {
      for (const suggestion of finding.suggestions) {
        console.log(`    • ${suggestion}`);
      }
    }
  }
}

async function handleList(type) {
  const config = await manager.load();
  if (type === 'models') {
    console.log('Configured models');
    for (const model of config.models) {
      const marker = config.activeModelId === model.id ? '*' : ' ';
      console.log(` ${marker} ${model.id} (${model.kind}) - ${model.name}`);
    }
    if (config.models.length === 0) {
      console.log('  (none)');
    }
    return;
  }

  console.log('Configured prompts');
  for (const promptConfig of config.prompts) {
    const marker = config.activePromptId === promptConfig.id ? '*' : ' ';
    console.log(` ${marker} ${promptConfig.id} - ${promptConfig.name}`);
  }
  if (config.prompts.length === 0) {
    console.log('  (none)');
  }
}

async function handleRemove(type, id) {
  if (!id) {
    throw new Error(`Missing ${type.slice(0, -1)} id.`);
  }
  if (type === 'models') {
    await manager.removeModel(id);
    console.log(`Removed model ${id}.`);
  } else {
    await manager.removePrompt(id);
    console.log(`Removed prompt ${id}.`);
  }
}

async function handleSetActive(type, id) {
  if (!id) {
    throw new Error(`Missing ${type.slice(0, -1)} id.`);
  }
  if (type === 'models') {
    await manager.setActiveModel(id);
    console.log(`Activated model ${id}.`);
  } else {
    await manager.setActivePrompt(id);
    console.log(`Activated prompt ${id}.`);
  }
}

function printHelp() {
  console.log(`Usage: acr-agent <command> [options]\n\nCommands:\n  configure                 Interactive configuration wizard\n  add-model [flags]         Add or update a model configuration (--preset for templates)\n  list-models               Show configured models\n  remove-model <id>         Delete a model\n  set-model <id>            Make a model active\n  add-prompt [flags]        Add or update a prompt\n  list-prompts              Show configured prompts\n  remove-prompt <id>        Delete a prompt\n  set-prompt <id>           Make a prompt active\n  review [flags]            Run a review for a commit range\n\nTemplates:\n  openai-chat, generic-http, local-stdin, local-argument\n\nExamples:\n  acr-agent configure\n  acr-agent add-model --preset local-stdin --id local --name "Local reviewer" --command ./review.sh\n  acr-agent review --range HEAD --staged --format json\n`);
}

async function main() {
  const argv = process.argv.slice(2);
  const command = argv.shift();
  const flags = parseArgs(argv);

  try {
    switch (command) {
      case 'configure':
        await handleConfigure();
        break;
      case 'add-model':
        await handleAddModel({ ...flags });
        break;
      case 'list-models':
        await handleList('models');
        break;
      case 'remove-model':
        await handleRemove('models', flags._[0]);
        break;
      case 'set-model':
        await handleSetActive('models', flags._[0]);
        break;
      case 'add-prompt': {
        if (!flags.id || !flags.name || !flags.systemPrompt || !flags.userPrompt) {
          console.log('Missing required flags. Launching interactive editor.');
          const promptConfig = await interactivePromptEditor({
            id: flags.id,
            name: flags.name
          });
          await manager.upsertPrompt(promptConfig);
          console.log(`Saved prompt ${promptConfig.id}.`);
        } else {
          await manager.upsertPrompt({
            id: flags.id,
            name: flags.name,
            description: flags.description,
            systemPrompt: flags.systemPrompt,
            userPrompt: flags.userPrompt
          });
          console.log(`Saved prompt ${flags.id}.`);
        }
        break;
      }
      case 'list-prompts':
        await handleList('prompts');
        break;
      case 'remove-prompt':
        await handleRemove('prompts', flags._[0]);
        break;
      case 'set-prompt':
        await handleSetActive('prompts', flags._[0]);
        break;
      case 'review':
        await handleReview({ ...flags });
        break;
      case 'help':
      case undefined:
        printHelp();
        break;
      default:
        console.log(`Unknown command: ${command}`);
        printHelp();
        process.exitCode = 1;
        break;
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

main();

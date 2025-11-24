import { createServer } from 'node:http';
import { MODEL_TEMPLATES } from './templates.js';
import { buildPromptFromConfig } from './reviewService.js';
import { runModel } from './modelRunner.js';

const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>ACR Agent Visual Configurator</title>
<style>
  :root {
    font-family: "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
    color: #111827;
    background: #f9fafb;
  }
  body {
    margin: 0;
    padding: 0;
    background: #f3f4f6;
  }
  header {
    background: #111827;
    color: #fff;
    padding: 1rem 2rem;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 1rem;
    box-shadow: 0 2px 6px rgba(0,0,0,0.2);
  }
  header h1 {
    font-size: 1.25rem;
    margin: 0;
    flex: 1 1 auto;
  }
  header button {
    background: #10b981;
    border: none;
    color: #fff;
    padding: 0.5rem 1.25rem;
    border-radius: 999px;
    cursor: pointer;
    font-weight: 600;
  }
  main {
    padding: 2rem;
    display: grid;
    gap: 2rem;
  }
  @media (min-width: 960px) {
    main {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  section {
    background: #fff;
    border-radius: 1rem;
    padding: 1.5rem;
    box-shadow: 0 8px 30px rgba(15,23,42,0.08);
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  h2 {
    margin: 0;
    font-size: 1.1rem;
  }
  .card-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .card {
    border: 1px solid #e5e7eb;
    border-radius: 0.75rem;
    padding: 1rem;
    background: #f9fafb;
  }
  .card header {
    background: transparent;
    color: inherit;
    padding: 0;
    box-shadow: none;
    gap: 0.5rem;
  }
  .card header h3 {
    margin: 0;
    font-size: 1rem;
  }
  .badge {
    display: inline-flex;
    align-items: center;
    padding: 0.15rem 0.5rem;
    border-radius: 999px;
    font-size: 0.75rem;
    font-weight: 600;
    background: #e0f2fe;
    color: #0369a1;
    margin-left: 0.5rem;
  }
  .active {
    background: #dcfce7;
    color: #15803d;
  }
  form {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 0.75rem 1rem;
  }
  label {
    display: flex;
    flex-direction: column;
    font-size: 0.85rem;
    color: #374151;
    gap: 0.25rem;
  }
  input, select, textarea {
    border-radius: 0.5rem;
    border: 1px solid #d1d5db;
    padding: 0.45rem 0.6rem;
    font-size: 0.9rem;
    font-family: inherit;
    width: 100%;
    box-sizing: border-box;
  }
  textarea {
    min-height: 70px;
  }
  .actions {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.5rem;
    flex-wrap: wrap;
  }
  .actions button {
    border: none;
    border-radius: 0.5rem;
    padding: 0.5rem 0.9rem;
    cursor: pointer;
    font-weight: 600;
  }
  .primary {
    background: #2563eb;
    color: #fff;
  }
  .secondary {
    background: #f3f4f6;
    color: #111827;
  }
  .danger {
    background: #fee2e2;
    color: #b91c1c;
  }
  .status-line {
    font-size: 0.85rem;
    color: #6b7280;
  }
  details {
    border: 1px dashed #cbd5f5;
    border-radius: 0.75rem;
    padding: 0.75rem 1rem;
    background: #f8fafc;
  }
  details summary {
    cursor: pointer;
    font-weight: 600;
  }
  .toast {
    position: fixed;
    bottom: 1.5rem;
    right: 1.5rem;
    background: #111827;
    color: #fff;
    padding: 0.75rem 1rem;
    border-radius: 0.75rem;
    box-shadow: 0 10px 25px rgba(0,0,0,0.2);
    opacity: 0;
    transform: translateY(20px);
    transition: opacity 0.2s ease, transform 0.2s ease;
  }
  .toast.visible {
    opacity: 1;
    transform: translateY(0);
  }
  .toast.error {
    background: #b91c1c;
  }
  .field-group {
    border-top: 1px dashed #e5e7eb;
    padding-top: 0.75rem;
    margin-top: 0.25rem;
  }
  .full-span {
    grid-column: 1 / -1;
  }
  pre {
    background: #0f172a;
    color: #e2e8f0;
    padding: 1rem;
    border-radius: 0.75rem;
    overflow: auto;
    font-size: 0.85rem;
  }
</style>
</head>
<body>
  <header>
    <h1>ACR Agent Visual Configurator</h1>
    <div class="status-line" id="workspaceLine">Workspace: loading…</div>
    <div class="status-line" id="statusLine">Loading configuration…</div>
    <button type="button" id="refreshBtn">Refresh</button>
  </header>
  <main>
    <section>
      <h2>Models</h2>
      <p>Configure HTTP or local reviewer models. Apply a template, tweak parameters, and activate your preferred reviewer.</p>
      <div class="card-list" id="modelList"></div>
      <details open>
        <summary>Add a model</summary>
        <form id="newModelForm" class="field-group">
          <label>Template
            <select name="template" id="templateSelect">
              <option value="">Custom</option>
            </select>
          </label>
          <label>Model id
            <input name="id" placeholder="my-model" required />
          </label>
          <label>Display name
            <input name="name" placeholder="LLM reviewer" required />
          </label>
          <label>Kind
            <select name="kind">
              <option value="online">Online (HTTP)</option>
              <option value="offline">Offline (local CLI)</option>
            </select>
          </label>
          <label data-online>Endpoint URL
            <input name="endpoint" placeholder="https://" />
          </label>
          <label data-online>HTTP method
            <input name="method" placeholder="POST" />
          </label>
          <label data-online>Body template
            <textarea name="bodyTemplate" placeholder='{"input":"{{prompt}}"}'></textarea>
          </label>
          <label data-online>Response JSON path
            <input name="responsePath" placeholder="choices.0.message.content" />
          </label>
          <label data-online>Headers (JSON)
            <textarea name="headers" placeholder='{"Authorization":"Bearer {{env:KEY}}"}'></textarea>
          </label>
          <label data-offline>Command
            <input name="command" placeholder="./review.sh" />
          </label>
          <label data-offline>Arguments (space separated)
            <input name="args" placeholder="--temperature 0" />
          </label>
          <label data-offline>Prompt delivery
            <select name="promptMode">
              <option value="stdin">stdin</option>
              <option value="argument">argument</option>
            </select>
          </label>
          <label data-offline>Prompt argument index
            <input name="promptArgIndex" type="number" min="0" />
          </label>
          <label data-offline>Prompt template
            <textarea name="promptTemplate" placeholder="{{prompt}}"></textarea>
          </label>
          <label data-offline>Env vars (JSON)
            <textarea name="env" placeholder='{"LLM_KEY":"value"}'></textarea>
          </label>
          <div class="actions">
            <button type="submit" class="primary">Save model</button>
            <button type="reset" class="secondary">Reset</button>
          </div>
        </form>
      </details>
    </section>
    <section>
      <h2>Prompts</h2>
      <p>Manage review personas. Each prompt includes system and user roles rendered with your diff.</p>
      <div class="card-list" id="promptList"></div>
      <details>
        <summary>Add a prompt</summary>
        <form id="newPromptForm" class="field-group">
          <label>Prompt id
            <input name="id" placeholder="secure" required />
          </label>
          <label>Name
            <input name="name" placeholder="Security review" required />
          </label>
          <label>Description
            <input name="description" placeholder="Optional summary" />
          </label>
          <label>System prompt
            <textarea name="systemPrompt" placeholder="You are a rigorous reviewer."></textarea>
          </label>
          <label>User prompt
            <textarea name="userPrompt" placeholder="Summarise defects and fixes."></textarea>
          </label>
          <div class="actions">
            <button type="submit" class="primary">Save prompt</button>
            <button type="reset" class="secondary">Reset</button>
          </div>
        </form>
      </details>
    </section>
    <section>
      <h2>Context Globs</h2>
      <p>Specify file globs to pull additional structs, interfaces, or helper functions while rendering prompts.</p>
      <textarea id="globEditor" rows="6"></textarea>
      <div class="actions">
        <button type="button" id="saveGlobs" class="primary">Save globs</button>
      </div>
    </section>
    <section class="full-span">
      <h2>Model Test Console</h2>
      <p>Paste a diff snippet or plain text to verify your model configuration before running real reviews.</p>
      <form id="testForm" class="field-group">
        <label>Model
          <select id="testModelSelect" name="modelId"></select>
        </label>
        <label>Prompt override (optional)
          <textarea id="testPromptInput" name="prompt" placeholder="Leave blank to reuse the active prompt"></textarea>
        </label>
        <label>Sample diff / context
          <textarea id="testDiffInput" name="diff" rows="6" placeholder="@@ diff @@\n+fmt.Println(\"hello\")"></textarea>
        </label>
        <div class="actions">
          <button type="submit" class="primary">Run test</button>
          <span id="testStatus" class="status-line">Ready</span>
        </div>
      </form>
      <details id="testOutputWrapper">
        <summary>Latest response</summary>
        <pre id="testOutput">No tests run yet.</pre>
      </details>
    </section>
  </main>
  <div class="toast" id="toast"></div>
<script>
(function() {
  const templates = ${JSON.stringify(MODEL_TEMPLATES)};
  const state = { config: null, meta: null };
  const statusLine = document.getElementById('statusLine');
  const workspaceLine = document.getElementById('workspaceLine');
  const modelList = document.getElementById('modelList');
  const promptList = document.getElementById('promptList');
  const newModelForm = document.getElementById('newModelForm');
  const newPromptForm = document.getElementById('newPromptForm');
  const templateSelect = document.getElementById('templateSelect');
  const globEditor = document.getElementById('globEditor');
  const toast = document.getElementById('toast');
  const testForm = document.getElementById('testForm');
  const testModelSelect = document.getElementById('testModelSelect');
  const testPromptInput = document.getElementById('testPromptInput');
  const testDiffInput = document.getElementById('testDiffInput');
  const testStatus = document.getElementById('testStatus');
  const testOutput = document.getElementById('testOutput');
  const testOutputWrapper = document.getElementById('testOutputWrapper');

  for (const template of templates) {
    const option = document.createElement('option');
    option.value = template.id;
    option.textContent = template.label + ' (' + template.id + ')';
    templateSelect.appendChild(option);
  }

  function showToast(message, isError) {
    toast.textContent = message;
    toast.classList.toggle('error', Boolean(isError));
    toast.classList.add('visible');
    setTimeout(() => toast.classList.remove('visible'), 3000);
  }

  async function api(path, options = {}) {
    const opts = { ...options };
    if (opts.body && typeof opts.body !== 'string') {
      opts.body = JSON.stringify(opts.body);
    }
    if (opts.body) {
      opts.headers = { ...(opts.headers || {}), 'Content-Type': 'application/json' };
    }
    const response = await fetch(path, opts);
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || 'Request failed');
    }
    if (response.status === 204) {
      return null;
    }
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return response.json();
    }
    return response.text();
  }

  async function loadMeta() {
    try {
      const meta = await api('/api/meta');
      state.meta = meta;
      const label = meta && meta.workspaceRoot ? meta.workspaceRoot : '(unknown)';
      workspaceLine.textContent = 'Workspace: ' + label;
    } catch (error) {
      workspaceLine.textContent = 'Workspace: unavailable';
      showToast(error.message || 'Failed to load workspace details', true);
    }
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function serialiseJson(value) {
    if (!value || typeof value !== 'object' || Object.keys(value).length === 0) return '';
    return JSON.stringify(value, null, 2);
  }

  function parseJsonField(value, fieldName) {
    const trimmed = (value || '').trim();
    if (!trimmed) return undefined;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object') {
        return parsed;
      }
    } catch (error) {
      throw new Error('Invalid JSON in ' + fieldName);
    }
    throw new Error('Invalid JSON in ' + fieldName);
  }

  function parseArgs(value) {
    if (!value) return undefined;
    const parts = value
      .split(/\s+/)
      .map((part) => part.trim())
      .filter(Boolean);
    return parts.length ? parts : undefined;
  }

  function toggleModelSections(form) {
    const kind = form.querySelector('[name="kind"]').value;
    for (const el of form.querySelectorAll('[data-online]')) {
      el.style.display = kind === 'online' ? 'flex' : 'none';
    }
    for (const el of form.querySelectorAll('[data-offline]')) {
      el.style.display = kind === 'offline' ? 'flex' : 'none';
    }
  }

  function fillModelForm(form, model) {
    form.querySelector('[name="id"]').value = model.id ?? '';
    form.querySelector('[name="name"]').value = model.name ?? '';
    form.querySelector('[name="kind"]').value = model.kind ?? 'online';
    form.querySelector('[name="endpoint"]').value = model.endpoint ?? '';
    form.querySelector('[name="method"]').value = model.method ?? '';
    form.querySelector('[name="bodyTemplate"]').value = model.bodyTemplate ?? '';
    form.querySelector('[name="responsePath"]').value = model.responsePath ?? '';
    form.querySelector('[name="headers"]').value = serialiseJson(model.headers);
    form.querySelector('[name="command"]').value = model.command ?? '';
    form.querySelector('[name="args"]').value = Array.isArray(model.args) ? model.args.join(' ') : '';
    form.querySelector('[name="promptMode"]').value = model.promptMode ?? 'stdin';
    form.querySelector('[name="promptArgIndex"]').value =
      typeof model.promptArgIndex === 'number' ? model.promptArgIndex : '';
    form.querySelector('[name="promptTemplate"]').value = model.promptTemplate ?? '';
    form.querySelector('[name="env"]').value = serialiseJson(model.env);
    toggleModelSections(form);
  }

  function readModelForm(form) {
    const data = new FormData(form);
    const id = (data.get('id') || '').toString().trim();
    if (!id) throw new Error('Model id is required');
    const payload = {
      id,
      name: (data.get('name') || '').toString().trim(),
      kind: (data.get('kind') || 'online').toString()
    };
    const endpoint = (data.get('endpoint') || '').toString().trim();
    if (endpoint) payload.endpoint = endpoint;
    const method = (data.get('method') || '').toString().trim();
    if (method) payload.method = method;
    const bodyTemplate = (data.get('bodyTemplate') || '').toString();
    if (bodyTemplate.trim()) payload.bodyTemplate = bodyTemplate;
    const responsePath = (data.get('responsePath') || '').toString().trim();
    if (responsePath) payload.responsePath = responsePath;
    const headers = (data.get('headers') || '').toString();
    if (headers.trim()) payload.headers = parseJsonField(headers, 'headers');
    const command = (data.get('command') || '').toString().trim();
    if (command) payload.command = command;
    const args = parseArgs((data.get('args') || '').toString());
    if (args) payload.args = args;
    const promptMode = (data.get('promptMode') || '').toString();
    if (promptMode) payload.promptMode = promptMode;
    const promptArgIndex = (data.get('promptArgIndex') || '').toString();
    if (promptArgIndex) payload.promptArgIndex = Number.parseInt(promptArgIndex, 10);
    const promptTemplate = (data.get('promptTemplate') || '').toString();
    if (promptTemplate.trim()) payload.promptTemplate = promptTemplate;
    const env = (data.get('env') || '').toString();
    if (env.trim()) payload.env = parseJsonField(env, 'env');
    return payload;
  }

  function createModelCard(model) {
    const wrapper = document.createElement('div');
    wrapper.className = 'card';
    const header = document.createElement('header');
    const title = document.createElement('h3');
    const summary =
      escapeHtml(model.name || model.id) +
      ' <span class="badge">' +
      escapeHtml(model.kind) +
      '</span>';
    title.innerHTML = summary;
    if (state.config?.activeModelId === model.id) {
      const badge = document.createElement('span');
      badge.className = 'badge active';
      badge.textContent = 'Active';
      title.appendChild(badge);
    }
    header.appendChild(title);
    wrapper.appendChild(header);

    const form = document.createElement('form');
    form.innerHTML = newModelForm.innerHTML;
    const templateField = form.querySelector('[name="template"]');
    if (templateField?.parentElement) {
      templateField.parentElement.remove();
    }
    const inheritedActions = form.querySelector('.actions');
    if (inheritedActions) {
      inheritedActions.remove();
    }
    fillModelForm(form, model);
    form.addEventListener('change', (event) => {
      if (event.target.name === 'kind') {
        toggleModelSections(form);
      }
    });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        const payload = readModelForm(form);
        await api('/api/models', { method: 'POST', body: payload });
        showToast('Saved model ' + payload.id);
        await refresh();
      } catch (error) {
        showToast(error.message || 'Unable to save model', true);
      }
    });
    wrapper.appendChild(form);

    const actions = document.createElement('div');
    actions.className = 'actions';
    const saveButton = document.createElement('button');
    saveButton.type = 'submit';
    saveButton.className = 'primary';
    saveButton.textContent = 'Save';
    form.appendChild(actions);

    const activateButton = document.createElement('button');
    activateButton.type = 'button';
    activateButton.className = 'secondary';
    activateButton.textContent = 'Set active';
    activateButton.addEventListener('click', async () => {
      try {
        await api('/api/models/' + encodeURIComponent(model.id) + '/activate', { method: 'POST' });
        showToast('Activated ' + model.id);
        await refresh();
      } catch (error) {
        showToast(error.message || 'Failed to activate model', true);
      }
    });

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'danger';
    deleteButton.textContent = 'Delete';
    deleteButton.addEventListener('click', async () => {
      if (!confirm('Delete model ' + model.id + '?')) return;
      try {
        await api('/api/models/' + encodeURIComponent(model.id), { method: 'DELETE' });
        showToast('Deleted ' + model.id);
        await refresh();
      } catch (error) {
        showToast(error.message || 'Failed to delete model', true);
      }
    });

    actions.appendChild(saveButton);
    actions.appendChild(activateButton);
    actions.appendChild(deleteButton);

    return wrapper;
  }

  function createPromptCard(prompt) {
    const wrapper = document.createElement('div');
    wrapper.className = 'card';
    const header = document.createElement('header');
    const title = document.createElement('h3');
    title.textContent = prompt.name || prompt.id;
    if (state.config?.activePromptId === prompt.id) {
      const badge = document.createElement('span');
      badge.className = 'badge active';
      badge.textContent = 'Active';
      title.appendChild(badge);
    }
    header.appendChild(title);
    wrapper.appendChild(header);

    const form = document.createElement('form');
    form.innerHTML = newPromptForm.innerHTML;
    const inheritedActions = form.querySelector('.actions');
    if (inheritedActions) {
      inheritedActions.remove();
    }
    form.querySelector('[name="id"]').value = prompt.id ?? '';
    form.querySelector('[name="name"]').value = prompt.name ?? '';
    form.querySelector('[name="description"]').value = prompt.description ?? '';
    form.querySelector('[name="systemPrompt"]').value = prompt.systemPrompt ?? '';
    form.querySelector('[name="userPrompt"]').value = prompt.userPrompt ?? '';
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const payload = {
        id: data.get('id').toString().trim(),
        name: data.get('name').toString().trim(),
        description: data.get('description').toString().trim() || undefined,
        systemPrompt: data.get('systemPrompt').toString(),
        userPrompt: data.get('userPrompt').toString()
      };
      try {
        await api('/api/prompts', { method: 'POST', body: payload });
        showToast('Saved prompt ' + payload.id);
        await refresh();
      } catch (error) {
        showToast(error.message || 'Failed to save prompt', true);
      }
    });
    wrapper.appendChild(form);

    const actions = document.createElement('div');
    actions.className = 'actions';
    const activateButton = document.createElement('button');
    activateButton.type = 'button';
    activateButton.className = 'secondary';
    activateButton.textContent = 'Set active';
    activateButton.addEventListener('click', async () => {
      try {
        await api('/api/prompts/' + encodeURIComponent(prompt.id) + '/activate', { method: 'POST' });
        showToast('Activated ' + prompt.id);
        await refresh();
      } catch (error) {
        showToast(error.message || 'Failed to activate prompt', true);
      }
    });

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'danger';
    deleteButton.textContent = 'Delete';
    deleteButton.addEventListener('click', async () => {
      if (!confirm('Delete prompt ' + prompt.id + '?')) return;
      try {
        await api('/api/prompts/' + encodeURIComponent(prompt.id), { method: 'DELETE' });
        showToast('Deleted ' + prompt.id);
        await refresh();
      } catch (error) {
        showToast(error.message || 'Failed to delete prompt', true);
      }
    });
    actions.appendChild(activateButton);
    actions.appendChild(deleteButton);
    wrapper.appendChild(actions);

    return wrapper;
  }

  async function refresh() {
    statusLine.textContent = 'Refreshing…';
    try {
      const config = await api('/api/config');
      state.config = config;
      render();
      statusLine.textContent =
        'Active model: ' +
        (config.activeModelId || '—') +
        ' | Active prompt: ' +
        (config.activePromptId || '—');
    } catch (error) {
      statusLine.textContent = 'Failed to load configuration';
      showToast(error.message || 'Failed to load configuration', true);
    }
  }

  function render() {
    modelList.innerHTML = '';
    for (const model of state.config.models) {
      modelList.appendChild(createModelCard(model));
    }
    if (state.config.models.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'status-line';
      empty.textContent = 'No models configured yet.';
      modelList.appendChild(empty);
    }

    promptList.innerHTML = '';
    for (const prompt of state.config.prompts) {
      promptList.appendChild(createPromptCard(prompt));
    }
    if (state.config.prompts.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'status-line';
      empty.textContent = 'No prompts configured yet.';
      promptList.appendChild(empty);
    }

    globEditor.value = (state.config.additionalContextGlobs || []).join('\n');

    testModelSelect.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = state.config.activeModelId
      ? 'Use active model (' + state.config.activeModelId + ')'
      : 'No active model selected';
    testModelSelect.appendChild(placeholder);
    for (const model of state.config.models) {
      const option = document.createElement('option');
      option.value = model.id;
      option.textContent = (model.name || model.id) + ' (' + model.id + ')';
      if (state.config.activeModelId === model.id) {
        option.textContent += ' • active';
      }
      testModelSelect.appendChild(option);
    }

    const disableTest = state.config.models.length === 0;
    for (const control of testForm.querySelectorAll('input, textarea, select, button')) {
      control.disabled = disableTest;
    }
    testStatus.textContent = disableTest
      ? 'Add a model to enable testing.'
      : 'Provide context and run a test.';
  }

  newModelForm.addEventListener('change', (event) => {
    if (event.target.name === 'kind') {
      toggleModelSections(newModelForm);
    }
    if (event.target === templateSelect) {
      const template = templates.find((tpl) => tpl.id === templateSelect.value);
      if (template) {
        fillModelForm(newModelForm, { ...template.defaults, id: newModelForm.querySelector('[name="id"]').value });
      }
    }
  });

  newModelForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const payload = readModelForm(newModelForm);
      await api('/api/models', { method: 'POST', body: payload });
      showToast('Saved model ' + payload.id);
      newModelForm.reset();
      toggleModelSections(newModelForm);
      await refresh();
    } catch (error) {
      showToast(error.message || 'Failed to save model', true);
    }
  });

  newPromptForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(newPromptForm);
    const payload = {
      id: data.get('id').toString().trim(),
      name: data.get('name').toString().trim(),
      description: data.get('description').toString().trim() || undefined,
      systemPrompt: data.get('systemPrompt').toString(),
      userPrompt: data.get('userPrompt').toString()
    };
    try {
      await api('/api/prompts', { method: 'POST', body: payload });
      showToast('Saved prompt ' + payload.id);
      newPromptForm.reset();
      await refresh();
    } catch (error) {
      showToast(error.message || 'Failed to save prompt', true);
    }
  });

  document.getElementById('refreshBtn').addEventListener('click', refresh);

  document.getElementById('saveGlobs').addEventListener('click', async () => {
    const globs = globEditor.value
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
    try {
      await api('/api/context-globs', { method: 'POST', body: { globs } });
      showToast('Saved glob patterns');
      await refresh();
    } catch (error) {
      showToast(error.message || 'Failed to save glob patterns', true);
    }
  });

  testForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    testStatus.textContent = 'Running test…';
    try {
      const payload = {
        modelId: testModelSelect.value || undefined,
        prompt: testPromptInput.value,
        diff: testDiffInput.value
      };
      const result = await api('/api/test-model', { method: 'POST', body: payload });
      testStatus.textContent = 'Response received at ' + new Date().toLocaleTimeString();
      testOutput.textContent =
        'Prompt:\n' +
        result.prompt +
        '\n\nResponse:\n' +
        (result.output || '(empty response)');
      testOutputWrapper.open = true;
      showToast('Model responded successfully.');
    } catch (error) {
      testStatus.textContent = 'Test failed.';
      showToast(error.message || 'Failed to run model test', true);
    }
  });

  toggleModelSections(newModelForm);
  loadMeta();
  refresh();
})();
</script>
</body>
</html>`;

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function sendHtml(res, html) {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

export async function startConfigUiServer(manager, options = {}) {
  const host = options.host ?? '127.0.0.1';
  const desiredPort = options.port ?? 4173;
  const workspaceRoot = options.workspaceRoot ?? manager.workspaceRoot;

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://' + (req.headers.host ?? 'localhost'));
    try {
      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
        sendHtml(res, DASHBOARD_HTML);
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/meta') {
        sendJson(res, 200, { workspaceRoot });
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/config') {
        const config = await manager.load();
        sendJson(res, 200, config);
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/templates') {
        sendJson(res, 200, MODEL_TEMPLATES);
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/models') {
        const body = JSON.parse((await readRequestBody(req)) || '{}');
        if (!body.id) {
          sendJson(res, 400, { message: 'Model id is required.' });
          return;
        }
        const config = await manager.upsertModel(body);
        sendJson(res, 200, config);
        return;
      }

      if (req.method === 'DELETE' && url.pathname.startsWith('/api/models/')) {
        const id = decodeURIComponent(url.pathname.split('/')[3] ?? '');
        if (!id) {
          sendJson(res, 400, { message: 'Model id is required.' });
          return;
        }
        const config = await manager.removeModel(id);
        sendJson(res, 200, config);
        return;
      }

      if (req.method === 'POST' && url.pathname.startsWith('/api/models/') && url.pathname.endsWith('/activate')) {
        const id = decodeURIComponent(url.pathname.split('/')[3] ?? '');
        if (!id) {
          sendJson(res, 400, { message: 'Model id is required.' });
          return;
        }
        const config = await manager.setActiveModel(id);
        sendJson(res, 200, config);
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/prompts') {
        const body = JSON.parse((await readRequestBody(req)) || '{}');
        if (!body.id || !body.name) {
          sendJson(res, 400, { message: 'Prompt id and name are required.' });
          return;
        }
        const config = await manager.upsertPrompt(body);
        sendJson(res, 200, config);
        return;
      }

      if (req.method === 'DELETE' && url.pathname.startsWith('/api/prompts/')) {
        const id = decodeURIComponent(url.pathname.split('/')[3] ?? '');
        if (!id) {
          sendJson(res, 400, { message: 'Prompt id is required.' });
          return;
        }
        const config = await manager.removePrompt(id);
        sendJson(res, 200, config);
        return;
      }

      if (req.method === 'POST' && url.pathname.startsWith('/api/prompts/') && url.pathname.endsWith('/activate')) {
        const id = decodeURIComponent(url.pathname.split('/')[3] ?? '');
        if (!id) {
          sendJson(res, 400, { message: 'Prompt id is required.' });
          return;
        }
        const config = await manager.setActivePrompt(id);
        sendJson(res, 200, config);
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/context-globs') {
        const body = JSON.parse((await readRequestBody(req)) || '{}');
        const globs = Array.isArray(body.globs) ? body.globs.filter((glob) => typeof glob === 'string') : [];
        const config = await manager.load();
        config.additionalContextGlobs = globs.length ? globs : [];
        const updated = await manager.save(config);
        sendJson(res, 200, updated);
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/test-model') {
        const body = JSON.parse((await readRequestBody(req)) || '{}');
        const config = await manager.load();
        const requestedId = typeof body.modelId === 'string' && body.modelId.trim() ? body.modelId.trim() : null;
        const model =
          config.models.find((item) => item.id === requestedId) ??
          config.models.find((item) => item.id === config.activeModelId) ??
          config.models[0];
        if (!model) {
          sendJson(res, 400, { message: 'No model configured.' });
          return;
        }
        const diffText = typeof body.diff === 'string' ? body.diff : '';
        const diffLines = diffText.trim()
          ? diffText.split(/\r?\n/)
          : ['@@ sample @@', '+function example() {', '+  return 42;', '+}'];
        const diff = [
          {
            filePath: 'sample.patch',
            hunks: diffLines
          }
        ];
        const overridePrompt = typeof body.prompt === 'string' && body.prompt.trim() ? body.prompt : undefined;
        const context = {
          repoRoot: manager.workspaceRoot,
          commitRange: 'TEST-RANGE',
          diff,
          supplementaryFiles: {}
        };
        const prompt = buildPromptFromConfig(config, context, overridePrompt);
        const output = await runModel(model, prompt);
        sendJson(res, 200, { prompt, output });
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Not found' }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: error.message || 'Internal error' }));
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(desiredPort, host, () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address();
  const actualPort = typeof address === 'object' && address ? address.port : desiredPort;
  const displayHost = host === '0.0.0.0' ? 'localhost' : host;
  const url = 'http://' + displayHost + ':' + actualPort;

  return {
    server,
    port: actualPort,
    url,
    close() {
      return new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
    }
  };
}

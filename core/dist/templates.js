export const MODEL_TEMPLATES = [
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

export function findModelTemplate(id) {
  return MODEL_TEMPLATES.find((template) => template.id === id);
}

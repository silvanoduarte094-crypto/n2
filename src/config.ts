import type { Provider, Settings } from './types';

export const APP_NAME = 'N2';
export const APP_TAGLINE = 'Núcleo de Inteligência';
export const APP_VERSION = '0.1.1';
export const DB_NAME = 'n2-db';
export const SCHEMA_VERSION = 1;

export const REPO_URL = 'https://github.com/silvanoduarte094-crypto/n2';
export const RELEASES_URL = `${REPO_URL}/releases/latest`;
export const CODESPACES_URL = `https://codespaces.new/silvanoduarte094-crypto/n2`;

/** Shown when GitHub Models is asked to answer without a bridge (no CORS upstream). */
export const GITHUB_DIRECT_HINT =
  'GitHub Models não permite chamadas diretas do navegador (sem CORS). Use o app completo com bridge local, o bridge gratuito via Codespaces ou troque para OpenAI, Anthropic, Gemini ou Ollama — esses aceitam chamadas diretas.';

export const DEFAULT_SYSTEM_PROMPT = `Você é o N2, um núcleo de inteligência pessoal, direto e útil.

Princípios:
- Responda no idioma do usuário. Seja claro, específico e honesto sobre incertezas.
- Use ferramentas quando elas melhorarem a resposta; nunca invente resultados de ferramentas.
- Para tarefas complexas, decomponha o problema, execute e mostre o que foi feito.
- Proteja dados sensíveis e não exponha chaves, tokens ou informações privadas.
- Quando não souber algo, diga o que falta e proponha o próximo passo.
- Prefira soluções simples, seguras e verificáveis.`;

const githubModels = [
  'openai/gpt-4.1',
  'openai/gpt-4.1-mini',
  'openai/gpt-4o',
  'openai/gpt-4o-mini',
  'meta/Llama-4-Maverick-17B-128E-Instruct-FP8',
  'mistral-ai/Mistral-Large-2411',
  'deepseek/DeepSeek-V3-0324',
  'cohere/Cohere-command-r-plus-08-2024',
];

export const DEFAULT_PROVIDERS: Provider[] = [
  {
    id: 'github',
    name: 'GitHub Models',
    kind: 'openai',
    baseUrl: 'https://models.github.ai/inference',
    apiKey: '',
    model: 'openai/gpt-4.1',
    models: githubModels,
    enabled: true,
    direct: false,
    notes: 'Use um token pessoal do GitHub com permissão models:read. No navegador exige bridge (local ou Codespaces).',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    kind: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4o-mini',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1', 'gpt-4.1-mini'],
    enabled: true,
    direct: true,
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    kind: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    apiKey: '',
    model: 'claude-sonnet-4-5',
    models: ['claude-sonnet-4-5', 'claude-opus-4-1', 'claude-haiku-4-5'],
    enabled: true,
    direct: true,
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    kind: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com',
    apiKey: '',
    model: 'gemini-2.5-flash',
    models: ['gemini-2.5-flash', 'gemini-2.5-pro'],
    enabled: true,
    direct: true,
  },
  {
    id: 'ollama',
    name: 'Ollama (local)',
    kind: 'ollama',
    baseUrl: 'http://127.0.0.1:11434/v1',
    apiKey: 'ollama',
    model: 'llama3.2',
    models: ['llama3.2', 'qwen2.5', 'mistral', 'gemma3'],
    enabled: true,
    direct: true,
    notes: 'Rode `ollama serve` e baixe um modelo com `ollama pull llama3.2`. Direto no navegador, permita a origem com OLLAMA_ORIGINS.',
  },
];

export const DEFAULT_SETTINGS: Settings = {
  schemaVersion: SCHEMA_VERSION,
  theme: 'dark',
  accent: 'violet',
  locale: 'pt-BR',
  userName: '',
  providers: DEFAULT_PROVIDERS,
  activeProviderId: 'github',
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  temperature: 0.7,
  maxTokens: 4096,
  agentMode: true,
  memoryEnabled: true,
  autoTitle: true,
  sendOnEnter: true,
  voiceOutput: false,
  reduceMotion: false,
  fontSize: 'md',
  proxyUrl: '',
  proxyToken: '',
  connectionMode: 'auto',
  connectors: [],
  onboardingComplete: false,
};

export const ACCENTS: Record<string, { label: string; hsl: string }> = {
  violet: { label: 'Violeta', hsl: '265 85% 66%' },
  cyan: { label: 'Ciano', hsl: '188 90% 55%' },
  emerald: { label: 'Esmeralda', hsl: '158 75% 48%' },
  amber: { label: 'Âmbar', hsl: '38 95% 58%' },
  rose: { label: 'Rosa', hsl: '342 85% 63%' },
};

export const STARTER_PROMPTS = [
  {
    title: 'Planejar um produto',
    text: 'Me ajude a transformar uma ideia em um plano de produto executável, com MVP, riscos e próximos passos.',
  },
  {
    title: 'Analisar um código',
    text: 'Vou colar um trecho de código. Explique o que ele faz, aponte riscos e proponha uma versão melhor.',
  },
  {
    title: 'Pesquisar e sintetizar',
    text: 'Pesquise um tema atual, compare fontes e produza um resumo com evidências e limitações.',
  },
  {
    title: 'Criar uma automação',
    text: 'Desenhe uma automação para o meu fluxo de trabalho e escreva os passos e o código necessário.',
  },
];

export function getProvider(settings: Settings, id?: string): Provider {
  return (
    settings.providers.find((p) => p.id === (id || settings.activeProviderId)) ||
    settings.providers[0]
  );
}

export function needsSetup(settings: Settings): boolean {
  const provider = getProvider(settings);
  if (provider.kind === 'ollama') return false;
  return !provider.apiKey.trim();
}

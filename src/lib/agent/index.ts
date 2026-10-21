import type {
  Memory,
  Message,
  Provider,
  ProviderMessage,
  Settings,
  ToolCall,
  Usage,
} from '../../types';
import { streamChat } from '../providers';
import { buildMemoryContextHybrid } from '../memory';
import { collectMcpTools } from '../mcp';
import { executeTool, TOOL_DEFINITIONS, type ToolContext } from '../tools';

export interface AgentCallbacks {
  onText: (text: string) => void;
  onReasoning: (text: string) => void;
  onToolCalls: (calls: ToolCall[]) => void;
  onToolUpdate: (call: ToolCall) => void;
  onUsage: (usage: Usage) => void;
  onStatus: (status: string) => void;
  /** Fired when the primary provider failed and a fallback took over. */
  onProviderChange?: (provider: Provider) => void;
}

export interface RunAgentParams {
  settings: Settings;
  provider: Provider;
  messages: Message[];
  memories: Memory[];
  signal: AbortSignal;
  callbacks: AgentCallbacks;
  addMemory: (text: string, tags?: string[], source?: string) => Promise<Memory>;
}

const MAX_STEPS = 8;
const MCP_DISCOVERY_TIMEOUT = 8_000;

/** Replaces `{{variables}}` in the system prompt template. */
export function renderPromptTemplate(
  template: string,
  variables: Record<string, string>,
): string {
  return template.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (match, key: string) => {
    const value = variables[key.toLowerCase()];
    return value === undefined ? match : value;
  });
}

export function promptVariableValues(
  settings: Settings,
  provider: Provider,
  toolNames: string[],
): Record<string, string> {
  const now = new Date();
  return {
    user: settings.userName.trim() || 'usuário',
    name: settings.userName.trim() || 'usuário',
    date: new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full' }).format(now),
    time: new Intl.DateTimeFormat('pt-BR', { timeStyle: 'short' }).format(now),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    datetime: new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full', timeStyle: 'short' }).format(now),
    model: provider.model,
    provider: provider.name,
    tools: toolNames.length ? toolNames.join(', ') : 'nenhuma',
  };
}

export async function buildSystemPrompt(
  settings: Settings,
  memories: Memory[],
  query: string,
  provider: Provider,
  toolNames: string[],
  signal?: AbortSignal,
  mcpErrors: string[] = [],
): Promise<string> {
  const parts: string[] = [];
  const variables = promptVariableValues(settings, provider, toolNames);
  const memoryContext = await buildMemoryContextHybrid(
    memories,
    query,
    settings.memoryEnabled,
    settings,
    signal,
  );
  const template = settings.systemPrompt.trim();
  const rendered = renderPromptTemplate(template, {
    ...variables,
    memories: memoryContext.trim() || 'Nenhuma memória relevante.',
  });
  parts.push(rendered || variables.model);

  if (!/\{\{\s*memories\s*\}\}/i.test(template) && memoryContext) parts.push(memoryContext);

  parts.push(
    `Contexto de execução: ${new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'full',
      timeStyle: 'short',
    }).format(new Date())} (${Intl.DateTimeFormat().resolvedOptions().timeZone}).`,
  );
  if (settings.userName.trim()) {
    parts.push(`O nome do usuário é ${settings.userName.trim()}.`);
  }
  if (settings.agentMode) {
    parts.push(
      `Você tem ferramentas disponíveis. Use-as quando ajudarem a obter fatos, calcular, pesquisar, ler arquivos públicos do GitHub, acessar a memória, chamar conectores autorizados ou executar ferramentas MCP.
Regras das ferramentas:
- Nunca invente o resultado de uma ferramenta.
- Cite URLs quando usar web_search ou web_fetch.
- Não chame conectores externos sem intenção clara do usuário.
- Ferramentas MCP aparecem com o prefixo mcp_ e pertencem a um conector; respeite os argumentos exigidos pelo schema.
- Se uma ferramenta falhar, explique a falha e tente uma alternativa segura.`,
    );
    if (settings.connectors.length) {
      parts.push(
        `Conectores externos configurados: ${settings.connectors
          .map((connector) => `${connector.name} (${connector.type})`)
          .join(', ')}.`,
      );
    }
    if (mcpErrors.length) {
      parts.push(
        `Conectores MCP indisponíveis nesta execução: ${mcpErrors.slice(0, 4).join('; ')}.`,
      );
    }
  }
  parts.push('Responda em Markdown quando isso melhorar a legibilidade. Seja conciso por padrão.');
  return parts.filter(Boolean).join('\n\n');
}

function toProviderMessages(system: string, messages: Message[]): ProviderMessage[] {
  const output: ProviderMessage[] = [{ role: 'system', content: system }];
  for (const message of messages) {
    if (message.role === 'system') continue;
    if (message.role === 'user') {
      if (!message.content.trim() && !message.attachments?.length) continue;
      output.push({
        role: 'user',
        content: message.content,
        attachments: message.attachments,
      });
      continue;
    }
    if (message.role === 'assistant') {
      const calls = (message.toolCalls || []).map((call) => ({
        id: call.id,
        name: call.name,
        arguments: call.arguments,
      }));
      if (!message.content.trim() && !calls.length) continue;
      output.push({
        role: 'assistant',
        content: message.content,
        toolCalls: calls.length ? calls : undefined,
      });
      for (const call of message.toolCalls || []) {
        output.push({
          role: 'tool',
          content: call.result ?? 'Sem resultado.',
          toolCallId: call.id,
          name: call.name,
        });
      }
      continue;
    }
    if (message.role === 'tool') {
      output.push({
        role: 'tool',
        content: message.content,
        toolCallId: message.toolCallId,
        name: message.name,
      });
    }
  }
  return output;
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise
      .then((value) => resolve(value))
      .catch(() => resolve(fallback))
      .finally(() => clearTimeout(timer));
  });
}

export async function runAgent(params: RunAgentParams): Promise<void> {
  const { settings, provider, messages, signal, callbacks, addMemory } = params;
  const memories = [...params.memories];
  const lastUser = [...messages].reverse().find((message) => message.role === 'user');
  const query = `${lastUser?.content || ''} ${(lastUser?.attachments || [])
    .map((attachment) => attachment.name)
    .join(' ')}`;

  const mcp = settings.agentMode
    ? await withTimeout(collectMcpTools(settings, signal), MCP_DISCOVERY_TIMEOUT, {
        tools: [],
        errors: ['descoberta de ferramentas MCP demorou demais'],
      })
    : { tools: [], errors: [] as string[] };

  const toolDefinitions = settings.agentMode
    ? [...TOOL_DEFINITIONS, ...mcp.tools.map((tool) => tool.definition)]
    : [];

  const system = await buildSystemPrompt(
    settings,
    memories,
    query,
    provider,
    toolDefinitions.map((tool) => tool.name),
    signal,
    mcp.errors,
  );
  const conversation = toProviderMessages(system, messages);

  const toolContext: ToolContext = {
    settings,
    memories,
    runtimeTools: mcp.tools,
    addMemory: async (text, tags, source) => {
      const memory = await addMemory(text, tags, source);
      memories.unshift(memory);
      return memory;
    },
    signal,
  };

  const fallbackProviders = settings.fallbackProviderIds
    .map((id) => settings.providers.find((item) => item.id === id))
    .filter(
      (item): item is Provider =>
        !!item &&
        item.enabled &&
        item.id !== provider.id &&
        (item.kind === 'ollama' || !!item.apiKey.trim()),
    );
  const candidates = [provider, ...fallbackProviders];

  let activeProvider = provider;
  let accumulatedText = '';
  let totalUsage: Usage = {};
  const addUsage = (usage: Usage) => {
    totalUsage = {
      promptTokens: (totalUsage.promptTokens || 0) + (usage.promptTokens || 0) || undefined,
      completionTokens: (totalUsage.completionTokens || 0) + (usage.completionTokens || 0) || undefined,
      totalTokens: (totalUsage.totalTokens || 0) + (usage.totalTokens || 0) || undefined,
    };
    callbacks.onUsage(totalUsage);
  };

  for (let step = 0; step < MAX_STEPS; step += 1) {
    if (signal.aborted) throw new DOMException('Execução cancelada.', 'AbortError');
    callbacks.onStatus(step === 0 ? 'Pensando…' : `Executando etapa ${step + 1}…`);

    const calls: { id: string; name: string; arguments: string }[] = [];
    let stepText = '';
    let streamed = false;
    let lastError: unknown;

    const stepCandidates = step === 0 ? candidates : [activeProvider];
    for (const candidate of stepCandidates) {
      if (signal.aborted) throw new DOMException('Execução cancelada.', 'AbortError');
      if (candidate.id !== activeProvider.id) {
        activeProvider = candidate;
        callbacks.onProviderChange?.(candidate);
        callbacks.onStatus(`Tentando ${candidate.name}…`);
      }
      calls.length = 0;
      stepText = '';
      streamed = false;
      try {
        const stream = streamChat(candidate, conversation, {
          settings,
          temperature: settings.temperature,
          maxTokens: settings.maxTokens,
          tools: settings.agentMode ? toolDefinitions : undefined,
          signal,
        });

        for await (const event of stream) {
          if (event.type === 'text') {
            streamed = true;
            stepText += event.text;
            accumulatedText += event.text;
            callbacks.onText(event.text);
          } else if (event.type === 'reasoning') {
            callbacks.onReasoning(event.text);
          } else if (event.type === 'tool_call') {
            streamed = true;
            calls.push(event.call);
          } else if (event.type === 'usage') {
            addUsage(event.usage);
          } else if (event.type === 'error') {
            throw new Error(event.message);
          }
        }
        lastError = undefined;
        break;
      } catch (error) {
        const aborted = error instanceof DOMException && error.name === 'AbortError';
        if (aborted) throw error;
        lastError = error;
        if (streamed) throw error;
      }
    }

    if (lastError) throw lastError;

    if (!calls.length) {
      callbacks.onStatus('');
      return;
    }

    const uiCalls: ToolCall[] = calls.map((call) => ({
      ...call,
      status: 'pending' as const,
    }));
    callbacks.onToolCalls(uiCalls);
    conversation.push({
      role: 'assistant',
      content: stepText,
      toolCalls: calls,
    });

    for (const call of calls) {
      if (signal.aborted) throw new DOMException('Execução cancelada.', 'AbortError');
      callbacks.onStatus(`Executando ${call.name}…`);
      const started = performance.now();
      const result = await executeTool(call.name, call.arguments, toolContext);
      const failed = /^\s*\{\s*"error"/.test(result);
      callbacks.onToolUpdate({
        ...call,
        result,
        status: failed ? 'error' : 'done',
        durationMs: Math.round(performance.now() - started),
      });
      conversation.push({
        role: 'tool',
        content: result,
        toolCallId: call.id,
        name: call.name,
      });
    }
  }

  callbacks.onStatus('Limite de etapas de ferramentas atingido.');
  callbacks.onText(
    '\n\n> Limite de 8 etapas de ferramentas atingido. Peça para continuar se precisar de mais trabalho.',
  );
}

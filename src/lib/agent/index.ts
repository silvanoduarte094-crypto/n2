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
import { buildMemoryContext } from '../memory';
import { executeTool, TOOL_DEFINITIONS, type ToolContext } from '../tools';

export interface AgentCallbacks {
  onText: (text: string) => void;
  onReasoning: (text: string) => void;
  onToolCalls: (calls: ToolCall[]) => void;
  onToolUpdate: (call: ToolCall) => void;
  onUsage: (usage: Usage) => void;
  onStatus: (status: string) => void;
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

export function buildSystemPrompt(
  settings: Settings,
  memories: Memory[],
  query: string,
): string {
  const parts: string[] = [settings.systemPrompt.trim()];
  const now = new Date();
  parts.push(
    `Contexto de execução: ${new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'full',
      timeStyle: 'short',
    }).format(now)} (${Intl.DateTimeFormat().resolvedOptions().timeZone}).`,
  );
  if (settings.userName.trim()) {
    parts.push(`O nome do usuário é ${settings.userName.trim()}.`);
  }
  if (settings.agentMode) {
    parts.push(
      `Você tem ferramentas disponíveis. Use-as quando ajudarem a obter fatos, calcular, pesquisar, ler arquivos públicos do GitHub, acessar a memória ou chamar conectores autorizados.
Regras das ferramentas:
- Nunca invente o resultado de uma ferramenta.
- Cite URLs quando usar web_search ou web_fetch.
- Não chame conectores externos sem intenção clara do usuário.
- Se uma ferramenta falhar, explique a falha e tente uma alternativa segura.`,
    );
    if (settings.connectors.length) {
      parts.push(
        `Conectores externos configurados: ${settings.connectors
          .map((connector) => `${connector.name} (${connector.type})`)
          .join(', ')}.`,
      );
    }
  }
  parts.push(buildMemoryContext(memories, query, settings.memoryEnabled));
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

export async function runAgent(params: RunAgentParams): Promise<void> {
  const { settings, provider, messages, signal, callbacks, addMemory } = params;
  const memories = [...params.memories];
  const lastUser = [...messages].reverse().find((message) => message.role === 'user');
  const query = `${lastUser?.content || ''} ${(lastUser?.attachments || [])
    .map((attachment) => attachment.name)
    .join(' ')}`;
  const system = buildSystemPrompt(settings, memories, query);
  const conversation = toProviderMessages(system, messages);

  const toolContext: ToolContext = {
    settings,
    memories,
    addMemory: async (text, tags, source) => {
      const memory = await addMemory(text, tags, source);
      memories.unshift(memory);
      return memory;
    },
    signal,
  };

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

    const stream = streamChat(provider, conversation, {
      settings,
      temperature: settings.temperature,
      maxTokens: settings.maxTokens,
      tools: settings.agentMode ? TOOL_DEFINITIONS : undefined,
      signal,
    });

    for await (const event of stream) {
      if (event.type === 'text') {
        stepText += event.text;
        accumulatedText += event.text;
        callbacks.onText(event.text);
      } else if (event.type === 'reasoning') {
        callbacks.onReasoning(event.text);
      } else if (event.type === 'tool_call') {
        calls.push(event.call);
      } else if (event.type === 'usage') {
        addUsage(event.usage);
      } else if (event.type === 'error') {
        throw new Error(event.message);
      }
    }

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

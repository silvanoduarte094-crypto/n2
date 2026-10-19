export type ProviderKind = 'openai' | 'anthropic' | 'gemini' | 'ollama';

/** How model traffic leaves the app: auto picks bridge or direct browser calls. */
export type ConnectionMode = 'auto' | 'bridge' | 'direct';

export interface Provider {
  id: string;
  name: string;
  kind: ProviderKind;
  baseUrl: string;
  apiKey: string;
  model: string;
  models: string[];
  headers?: Record<string, string>;
  enabled: boolean;
  notes?: string;
  /** `false` blocks direct browser calls (provider without CORS, e.g. GitHub Models). */
  direct?: boolean;
}

export interface Attachment {
  id: string;
  name: string;
  mime: string;
  size: number;
  dataUrl?: string;
  text?: string;
}

export interface Usage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
  result?: string;
  status: 'pending' | 'running' | 'done' | 'error';
  durationMs?: number;
}

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: number;
  attachments?: Attachment[];
  toolCalls?: ToolCall[];
  toolCallId?: string;
  name?: string;
  model?: string;
  error?: boolean;
  durationMs?: number;
  usage?: Usage;
  reasoning?: string;
}

export interface Session {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  pinned: boolean;
  messages: Message[];
  providerId?: string;
  model?: string;
  systemPrompt?: string;
}

export interface Memory {
  id: string;
  text: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  source?: string;
}

export type ConnectorType = 'webhook' | 'rest' | 'mcp';

export interface Connector {
  id: string;
  name: string;
  type: ConnectorType;
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  authHeader?: string;
  description?: string;
  headers?: Record<string, string>;
  enabled: boolean;
}

export type ThemeMode = 'dark' | 'light' | 'system';

export interface Settings {
  schemaVersion: number;
  theme: ThemeMode;
  accent: string;
  locale: string;
  userName: string;
  providers: Provider[];
  activeProviderId: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  agentMode: boolean;
  memoryEnabled: boolean;
  autoTitle: boolean;
  sendOnEnter: boolean;
  voiceOutput: boolean;
  reduceMotion: boolean;
  fontSize: 'sm' | 'md' | 'lg';
  proxyUrl: string;
  proxyToken: string;
  connectionMode: ConnectionMode;
  connectors: Connector[];
  onboardingComplete: boolean;
  hasGithubToken?: boolean;
}

export interface JSONSchema {
  type: 'object';
  properties: Record<
    string,
    {
      type: 'string' | 'number' | 'boolean' | 'array' | 'object';
      description?: string;
      enum?: string[];
      items?: { type: string };
      default?: unknown;
    }
  >;
  required?: string[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: JSONSchema;
  dangerous?: boolean;
}

export interface ProviderMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  attachments?: Attachment[];
  toolCallId?: string;
  name?: string;
  toolCalls?: { id: string; name: string; arguments: string }[];
}

export type StreamEvent =
  | { type: 'text'; text: string }
  | { type: 'reasoning'; text: string }
  | { type: 'tool_call'; call: { id: string; name: string; arguments: string } }
  | { type: 'usage'; usage: Usage }
  | { type: 'done' }
  | { type: 'error'; message: string };

export interface ExportBundle {
  app: 'n2';
  version: number;
  exportedAt: string;
  sessions: Session[];
  memories: Memory[];
  settings: Settings;
}

import { create } from 'zustand';
import type {
  Attachment,
  Connector,
  ExportBundle,
  Memory,
  Message,
  Provider,
  Routine,
  Session,
  Settings,
  ToolCall,
  Usage,
  UsageRecord,
} from '../types';
import { DEFAULT_SETTINGS, getProvider } from '../config';
import {
  clearAllData,
  clearUsage,
  deleteMemoryRecord,
  deleteSessionRecord,
  exportBundle,
  importBundle,
  loadMemories,
  loadSessions,
  loadSettings,
  loadUsage,
  saveMemoryRecord,
  saveSession,
  saveSettings,
  saveUsageRecord,
} from '../lib/db';
import { runAgent } from '../lib/agent';
import { embedMemory, reindexMemories } from '../lib/memory';
import { now, titleFromText, truncate, uid } from '../lib/utils';

export type Toast = { id: string; message: string; type: 'success' | 'error' | 'info' };
export type SettingsTab =
  | 'general'
  | 'providers'
  | 'agent'
  | 'routines'
  | 'usage'
  | 'connectors'
  | 'data'
  | 'about';

const runningRoutines = new Set<string>();

interface StoreState {
  hydrated: boolean;
  sessions: Session[];
  memories: Memory[];
  usage: UsageRecord[];
  reindexProgress: { done: number; total: number } | null;
  settings: Settings;
  activeSessionId: string | null;
  streaming: boolean;
  status: string;
  abortController: AbortController | null;
  sidebarOpen: boolean;
  settingsOpen: boolean;
  settingsTab: SettingsTab;
  memoryOpen: boolean;
  commandOpen: boolean;
  toast: Toast | null;

  init: () => Promise<void>;
  newSession: () => string;
  selectSession: (id: string) => void;
  deleteSession: (id: string) => Promise<void>;
  renameSession: (id: string, title: string) => void;
  togglePin: (id: string) => void;
  sendMessage: (text: string, attachments?: Attachment[]) => Promise<void>;
  runCompletion: (sessionId: string, messages: Message[]) => Promise<void>;
  regenerate: () => Promise<void>;
  stop: () => void;
  deleteMessage: (sessionId: string, messageId: string) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  updateProvider: (id: string, patch: Partial<Provider>) => void;
  setActiveProvider: (id: string) => void;
  addMemory: (text: string, tags?: string[], source?: string) => Promise<Memory>;
  removeMemory: (id: string) => Promise<void>;
  reindexEmbeddings: () => Promise<void>;
  saveRoutine: (routine: Routine) => void;
  removeRoutine: (id: string) => void;
  runRoutine: (id: string) => Promise<void>;
  clearUsage: () => Promise<void>;
  upsertConnector: (connector: Connector) => void;
  removeConnector: (id: string) => void;
  exportData: () => Promise<void>;
  importData: (bundle: ExportBundle) => Promise<void>;
  resetAll: () => Promise<void>;
  setSidebarOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setSettingsTab: (tab: SettingsTab) => void;
  setMemoryOpen: (open: boolean) => void;
  setCommandOpen: (open: boolean) => void;
  showToast: (message: string, type?: Toast['type']) => void;
  clearToast: () => void;
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export const useStore = create<StoreState>((set, get) => ({
  hydrated: false,
  sessions: [],
  memories: [],
  usage: [],
  reindexProgress: null,
  settings: structuredClone(DEFAULT_SETTINGS),
  activeSessionId: null,
  streaming: false,
  status: '',
  abortController: null,
  sidebarOpen: false,
  settingsOpen: false,
  settingsTab: 'general',
  memoryOpen: false,
  commandOpen: false,
  toast: null,

  init: async () => {
    const [sessions, memories, settings, usage] = await Promise.all([
      loadSessions(),
      loadMemories(),
      loadSettings(),
      loadUsage(),
    ]);
    const activeSessionId = sessions[0]?.id || null;
    set({ sessions, memories, settings, usage, activeSessionId, hydrated: true });
  },

  newSession: () => {
    const session: Session = {
      id: uid('s_'),
      title: 'Novo chat',
      createdAt: now(),
      updatedAt: now(),
      pinned: false,
      messages: [],
    };
    set((state) => ({
      sessions: [session, ...state.sessions],
      activeSessionId: session.id,
      sidebarOpen: false,
    }));
    void saveSession(session);
    return session.id;
  },

  selectSession: (id) => set({ activeSessionId: id, sidebarOpen: false }),

  deleteSession: async (id) => {
    const state = get();
    const remaining = state.sessions.filter((session) => session.id !== id);
    const activeSessionId =
      state.activeSessionId === id ? remaining[0]?.id || null : state.activeSessionId;
    set({ sessions: remaining, activeSessionId });
    await deleteSessionRecord(id);
  },

  renameSession: (id, title) => {
    const clean = title.trim() || 'Novo chat';
    set((state) => {
      const sessions = state.sessions.map((session) =>
        session.id === id ? { ...session, title: clean, updatedAt: now() } : session,
      );
      const session = sessions.find((item) => item.id === id);
      if (session) void saveSession(session);
      return { sessions };
    });
  },

  togglePin: (id) => {
    set((state) => {
      const sessions = state.sessions.map((session) =>
        session.id === id ? { ...session, pinned: !session.pinned } : session,
      );
      const session = sessions.find((item) => item.id === id);
      if (session) void saveSession(session);
      return { sessions };
    });
  },

  sendMessage: async (text, attachments = []) => {
    const state = get();
    if (state.streaming) return;
    const clean = text.trim();
    if (!clean && !attachments.length) return;

    const settings = state.settings;
    const provider = getProvider(settings);
    if (provider.kind !== 'ollama' && !provider.apiKey.trim()) {
      set({ settingsOpen: true });
      get().showToast('Configure uma API key para começar.', 'error');
      return;
    }

    let sessionId = state.activeSessionId;
    if (!sessionId) sessionId = get().newSession();
    const session = get().sessions.find((item) => item.id === sessionId);
    if (!session) return;

    const userMessage: Message = {
      id: uid('m_'),
      role: 'user',
      content: clean,
      createdAt: now(),
      attachments: attachments.length ? attachments : undefined,
    };
    const isFirst = session.messages.length === 0;
    const messages = [...session.messages, userMessage];
    const updatedSession: Session = {
      ...session,
      title:
        isFirst && settings.autoTitle && !session.title.startsWith('Rotina:')
          ? titleFromText(clean || attachments[0]?.name || 'Novo chat')
          : session.title,
      messages,
      updatedAt: now(),
      providerId: provider.id,
      model: provider.model,
    };
    set((current) => ({
      sessions: current.sessions.map((item) => (item.id === sessionId ? updatedSession : item)),
    }));
    await saveSession(updatedSession);
    await get().runCompletion(sessionId, messages);
  },

  runCompletion: async (sessionId, messages) => {
    const state = get();
    const session = state.sessions.find((item) => item.id === sessionId);
    if (!session) return;
    const settings = state.settings;
    const provider = getProvider(settings);
    if (provider.kind !== 'ollama' && !provider.apiKey.trim()) {
      set({ settingsOpen: true });
      get().showToast('Configure uma API key para começar.', 'error');
      return;
    }

    const assistantMessage: Message = {
      id: uid('m_'),
      role: 'assistant',
      content: '',
      createdAt: now(),
      model: provider.model,
      toolCalls: [],
    };
    const withAssistant = [...messages, assistantMessage];
    const controller = new AbortController();
    const startedAt = performance.now();
    let usedProvider = provider;
    let failed = false;

    set((current) => ({
      streaming: true,
      status: 'Pensando…',
      abortController: controller,
      sessions: current.sessions.map((item) =>
        item.id === sessionId
          ? {
              ...item,
              messages: withAssistant,
              updatedAt: now(),
              providerId: provider.id,
              model: provider.model,
            }
          : item,
      ),
    }));

    const patchAssistant = (updater: (message: Message) => Message) => {
      set((current) => ({
        sessions: current.sessions.map((item) =>
          item.id === sessionId
            ? {
                ...item,
                messages: item.messages.map((message) =>
                  message.id === assistantMessage.id ? updater(message) : message,
                ),
                updatedAt: now(),
              }
            : item,
        ),
      }));
    };

    try {
      await runAgent({
        settings,
        provider,
        messages: withAssistant,
        memories: get().memories,
        signal: controller.signal,
        addMemory: get().addMemory,
        callbacks: {
          onText: (text) => {
            patchAssistant((message) => ({ ...message, content: message.content + text }));
          },
          onReasoning: (text) => {
            patchAssistant((message) => ({
              ...message,
              reasoning: `${message.reasoning || ''}${text}`,
            }));
          },
          onToolCalls: (calls) => {
            patchAssistant((message) => ({ ...message, toolCalls: calls }));
          },
          onToolUpdate: (call: ToolCall) => {
            patchAssistant((message) => ({
              ...message,
              toolCalls: (message.toolCalls || []).map((item) =>
                item.id === call.id ? call : item,
              ),
            }));
          },
          onUsage: (usage: Usage) => {
            patchAssistant((message) => ({ ...message, usage }));
          },
          onStatus: (status) => set({ status }),
          onProviderChange: (next) => {
            usedProvider = next;
            patchAssistant((message) => ({ ...message, model: next.model }));
            set((current) => ({
              sessions: current.sessions.map((item) =>
                item.id === sessionId
                  ? { ...item, providerId: next.id, model: next.model }
                  : item,
              ),
            }));
            get().showToast(`Provedor indisponível. Continuando com ${next.name}.`, 'info');
          },
        },
      });
    } catch (error) {
      failed = true;
      const aborted = error instanceof DOMException && error.name === 'AbortError';
      const message = error instanceof Error ? error.message : String(error);
      if (aborted) {
        patchAssistant((item) => ({
          ...item,
          content: item.content || '_Execução interrompida._',
        }));
      } else {
        patchAssistant((item) => ({
          ...item,
          error: true,
          content: item.content
            ? `${item.content}\n\n> **Erro:** ${message}`
            : `Não consegui concluir a resposta.\n\n> **Erro:** ${message}`,
        }));
        get().showToast(truncate(message, 160), 'error');
      }
    } finally {
      const finalSession = get().sessions.find((item) => item.id === sessionId);
      if (finalSession) await saveSession(finalSession);
      const finalMessage = finalSession?.messages.find(
        (message) => message.id === assistantMessage.id,
      );
      const usage = finalMessage?.usage;
      const hasPrices =
        usedProvider.inputPrice !== undefined || usedProvider.outputPrice !== undefined;
      const costUsd = hasPrices
        ? ((usage?.promptTokens || 0) / 1_000_000) * (usedProvider.inputPrice || 0) +
          ((usage?.completionTokens || 0) / 1_000_000) * (usedProvider.outputPrice || 0)
        : undefined;
      const record: UsageRecord = {
        id: uid('u_'),
        at: Date.now(),
        providerId: usedProvider.id,
        providerName: usedProvider.name,
        model: usedProvider.model,
        promptTokens: usage?.promptTokens,
        completionTokens: usage?.completionTokens,
        totalTokens: usage?.totalTokens,
        durationMs: Math.round(performance.now() - startedAt),
        ok: !failed,
        sessionId,
        costUsd,
      };
      set((current) => ({ usage: [record, ...current.usage].slice(0, 5000) }));
      void saveUsageRecord(record);
      set({ streaming: false, status: '', abortController: null });
    }
  },

  regenerate: async () => {
    const state = get();
    const session = state.sessions.find((item) => item.id === state.activeSessionId);
    if (!session || state.streaming) return;
    const lastAssistant = [...session.messages].reverse().find((message) => message.role === 'assistant');
    if (!lastAssistant) return;
    const messages = session.messages.filter((message) => message.id !== lastAssistant.id);
    const updated = { ...session, messages, updatedAt: now() };
    set((current) => ({
      sessions: current.sessions.map((item) => (item.id === session.id ? updated : item)),
    }));
    await saveSession(updated);
    await get().runCompletion(session.id, messages);
  },

  stop: () => {
    get().abortController?.abort();
    set({ status: 'Interrompendo…' });
  },

  deleteMessage: (sessionId, messageId) => {
    set((state) => {
      const sessions = state.sessions.map((session) =>
        session.id === sessionId
          ? {
              ...session,
              messages: session.messages.filter((message) => message.id !== messageId),
              updatedAt: now(),
            }
          : session,
      );
      const session = sessions.find((item) => item.id === sessionId);
      if (session) void saveSession(session);
      return { sessions };
    });
  },

  updateSettings: (patch) => {
    set((state) => {
      const settings = { ...state.settings, ...patch };
      void saveSettings(settings);
      return { settings };
    });
  },

  updateProvider: (id, patch) => {
    set((state) => {
      const providers = state.settings.providers.map((provider) =>
        provider.id === id ? { ...provider, ...patch } : provider,
      );
      const settings = { ...state.settings, providers };
      void saveSettings(settings);
      return { settings };
    });
  },

  setActiveProvider: (id) => {
    set((state) => {
      const settings = { ...state.settings, activeProviderId: id };
      void saveSettings(settings);
      return { settings };
    });
  },

  addMemory: async (text, tags = [], source) => {
    let memory: Memory = {
      id: uid('mem_'),
      text: text.trim(),
      tags,
      createdAt: now(),
      updatedAt: now(),
      source,
    };
    memory = await embedMemory(memory, get().settings);
    set((state) => ({ memories: [memory, ...state.memories] }));
    await saveMemoryRecord(memory);
    return memory;
  },

  removeMemory: async (id) => {
    set((state) => ({ memories: state.memories.filter((memory) => memory.id !== id) }));
    await deleteMemoryRecord(id);
  },

  reindexEmbeddings: async () => {
    const state = get();
    if (!state.settings.ragEnabled) {
      get().showToast('Ative a busca semântica nas configurações do agente.', 'info');
      return;
    }
    set({ reindexProgress: { done: 0, total: state.memories.length } });
    try {
      const result = await reindexMemories(state.memories, state.settings, (done, total) =>
        set({ reindexProgress: { done, total } }),
      );
      for (const memory of result.updated) await saveMemoryRecord(memory);
      const updatedById = new Map(result.updated.map((memory) => [memory.id, memory]));
      set((current) => ({
        memories: current.memories.map((memory) => updatedById.get(memory.id) || memory),
      }));
      if (result.indexed) {
        get().showToast(`${result.indexed} memória(s) indexada(s).`, 'success');
      }
      if (result.failed) {
        get().showToast(
          `${result.failed} memória(s) falharam. ${result.error || ''}`.trim(),
          'error',
        );
      }
    } catch (error) {
      get().showToast(error instanceof Error ? error.message : String(error), 'error');
    } finally {
      set({ reindexProgress: null });
    }
  },

  saveRoutine: (routine) => {
    set((state) => {
      const exists = state.settings.routines.some((item) => item.id === routine.id);
      const routines = exists
        ? state.settings.routines.map((item) => (item.id === routine.id ? routine : item))
        : [...state.settings.routines, routine];
      const settings = { ...state.settings, routines };
      void saveSettings(settings);
      return { settings };
    });
  },

  removeRoutine: (id) => {
    set((state) => {
      const settings = {
        ...state.settings,
        routines: state.settings.routines.filter((routine) => routine.id !== id),
      };
      void saveSettings(settings);
      return { settings };
    });
  },

  runRoutine: async (id) => {
    const state = get();
    const routine = state.settings.routines.find((item) => item.id === id);
    if (!routine || !routine.enabled || runningRoutines.has(id)) return;
    if (state.streaming) {
      get().showToast('Aguarde a resposta atual terminar para executar a rotina.', 'info');
      return;
    }
    const provider = getProvider(state.settings);
    if (provider.kind !== 'ollama' && !provider.apiKey.trim()) {
      get().showToast('Configure uma API key para executar rotinas.', 'error');
      return;
    }
    runningRoutines.add(id);
    try {
      const sessionId = get().newSession();
      get().renameSession(sessionId, `Rotina: ${routine.name}`);
      await get().sendMessage(routine.prompt);
      const result = get().sessions.find((item) => item.id === sessionId);
      const assistant = [...(result?.messages || [])]
        .reverse()
        .find((message) => message.role === 'assistant');
      if (!assistant || assistant.error) {
        throw new Error('A rotina terminou com erro. Veja a conversa para os detalhes.');
      }
      get().saveRoutine({ ...routine, lastRunAt: Date.now() });
      if (
        routine.notify &&
        typeof Notification !== 'undefined' &&
        Notification.permission === 'granted'
      ) {
        new Notification(`N2 · ${routine.name}`, { body: 'Rotina concluída.' });
      }
    } catch (error) {
      get().showToast(error instanceof Error ? error.message : String(error), 'error');
    } finally {
      runningRoutines.delete(id);
    }
  },

  clearUsage: async () => {
    await clearUsage();
    set({ usage: [] });
    get().showToast('Histórico de uso apagado.', 'info');
  },

  upsertConnector: (connector) => {
    set((state) => {
      const exists = state.settings.connectors.some((item) => item.id === connector.id);
      const connectors = exists
        ? state.settings.connectors.map((item) => (item.id === connector.id ? connector : item))
        : [...state.settings.connectors, connector];
      const settings = { ...state.settings, connectors };
      void saveSettings(settings);
      return { settings };
    });
  },

  removeConnector: (id) => {
    set((state) => {
      const settings = {
        ...state.settings,
        connectors: state.settings.connectors.filter((connector) => connector.id !== id),
      };
      void saveSettings(settings);
      return { settings };
    });
  },

  exportData: async () => {
    const state = get();
    const bundle = await exportBundle(state.sessions, state.memories, state.settings, state.usage);
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `n2-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    get().showToast('Backup exportado.', 'success');
  },

  importData: async (bundle) => {
    const imported = await importBundle(bundle);
    set({
      sessions: imported.sessions.sort((a, b) => b.updatedAt - a.updatedAt),
      memories: imported.memories.sort((a, b) => b.updatedAt - a.updatedAt),
      usage: imported.usage,
      settings: {
        ...DEFAULT_SETTINGS,
        ...imported.settings,
        fallbackProviderIds: Array.isArray(imported.settings.fallbackProviderIds)
          ? imported.settings.fallbackProviderIds
          : [],
        routines: Array.isArray(imported.settings.routines) ? imported.settings.routines : [],
        ragEnabled: !!imported.settings.ragEnabled,
      },
      activeSessionId: imported.sessions[0]?.id || null,
    });
    get().showToast('Backup importado.', 'success');
  },

  resetAll: async () => {
    await clearAllData();
    set({
      sessions: [],
      memories: [],
      usage: [],
      reindexProgress: null,
      settings: structuredClone(DEFAULT_SETTINGS),
      activeSessionId: null,
      streaming: false,
      status: '',
    });
    get().showToast('Dados apagados.', 'info');
  },

  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setSettingsTab: (tab) => set({ settingsTab: tab }),
  setMemoryOpen: (open) => set({ memoryOpen: open }),
  setCommandOpen: (open) => set({ commandOpen: open }),

  showToast: (message, type = 'info') => {
    if (toastTimer) clearTimeout(toastTimer);
    const toast: Toast = { id: uid('t_'), message, type };
    set({ toast });
    toastTimer = setTimeout(() => set({ toast: null }), 4200);
  },

  clearToast: () => {
    if (toastTimer) clearTimeout(toastTimer);
    set({ toast: null });
  },
}));

import { create } from 'zustand';
import type {
  Attachment,
  Connector,
  ExportBundle,
  Memory,
  Message,
  Provider,
  Session,
  Settings,
  ToolCall,
  Usage,
} from '../types';
import { DEFAULT_SETTINGS, getProvider } from '../config';
import {
  clearAllData,
  deleteMemoryRecord,
  deleteSessionRecord,
  exportBundle,
  importBundle,
  loadMemories,
  loadSessions,
  loadSettings,
  saveMemoryRecord,
  saveSession,
  saveSettings,
} from '../lib/db';
import { runAgent } from '../lib/agent';
import { now, titleFromText, truncate, uid } from '../lib/utils';

export type Toast = { id: string; message: string; type: 'success' | 'error' | 'info' };
export type SettingsTab = 'general' | 'providers' | 'agent' | 'connectors' | 'data' | 'about';

interface StoreState {
  hydrated: boolean;
  sessions: Session[];
  memories: Memory[];
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
    const [sessions, memories, settings] = await Promise.all([
      loadSessions(),
      loadMemories(),
      loadSettings(),
    ]);
    const activeSessionId = sessions[0]?.id || null;
    set({ sessions, memories, settings, activeSessionId, hydrated: true });
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
      title: isFirst && settings.autoTitle ? titleFromText(clean || attachments[0]?.name || 'Novo chat') : session.title,
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
        },
      });
    } catch (error) {
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
    const memory: Memory = {
      id: uid('mem_'),
      text: text.trim(),
      tags,
      createdAt: now(),
      updatedAt: now(),
      source,
    };
    set((state) => ({ memories: [memory, ...state.memories] }));
    await saveMemoryRecord(memory);
    return memory;
  },

  removeMemory: async (id) => {
    set((state) => ({ memories: state.memories.filter((memory) => memory.id !== id) }));
    await deleteMemoryRecord(id);
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
    const bundle = await exportBundle(state.sessions, state.memories, state.settings);
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
      settings: { ...DEFAULT_SETTINGS, ...imported.settings },
      activeSessionId: imported.sessions[0]?.id || null,
    });
    get().showToast('Backup importado.', 'success');
  },

  resetAll: async () => {
    await clearAllData();
    set({
      sessions: [],
      memories: [],
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

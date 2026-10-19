import { useMemo, useState } from 'react';
import {
  Brain,
  MoreHorizontal,
  Moon,
  Pencil,
  Pin,
  Plus,
  Search,
  Settings,
  Sun,
  Trash2,
  X,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import type { Session } from '../types';
import { cn, getInitials, relativeTime } from '../lib/utils';
import { Brand } from './Logo';

function groupSessions(sessions: Session[]) {
  const now = Date.now();
  const day = 86_400_000;
  const pinned: Session[] = [];
  const today: Session[] = [];
  const week: Session[] = [];
  const older: Session[] = [];
  for (const session of sessions) {
    if (session.pinned) pinned.push(session);
    else if (now - session.updatedAt < day) today.push(session);
    else if (now - session.updatedAt < 7 * day) week.push(session);
    else older.push(session);
  }
  return [
    { label: 'Fixados', items: pinned },
    { label: 'Hoje', items: today },
    { label: 'Últimos 7 dias', items: week },
    { label: 'Anteriores', items: older },
  ].filter((group) => group.items.length);
}

export function Sidebar() {
  const sessions = useStore((state) => state.sessions);
  const activeSessionId = useStore((state) => state.activeSessionId);
  const settings = useStore((state) => state.settings);
  const memories = useStore((state) => state.memories);
  const sidebarOpen = useStore((state) => state.sidebarOpen);
  const selectSession = useStore((state) => state.selectSession);
  const newSession = useStore((state) => state.newSession);
  const deleteSession = useStore((state) => state.deleteSession);
  const renameSession = useStore((state) => state.renameSession);
  const togglePin = useStore((state) => state.togglePin);
  const setSidebarOpen = useStore((state) => state.setSidebarOpen);
  const setSettingsOpen = useStore((state) => state.setSettingsOpen);
  const setMemoryOpen = useStore((state) => state.setMemoryOpen);
  const updateSettings = useStore((state) => state.updateSettings);
  const showToast = useStore((state) => state.showToast);

  const [query, setQuery] = useState('');
  const [menuId, setMenuId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  const filtered = useMemo(() => {
    const clean = query.trim().toLowerCase();
    if (!clean) return sessions;
    return sessions.filter(
      (session) =>
        session.title.toLowerCase().includes(clean) ||
        session.messages.some((message) => message.content.toLowerCase().includes(clean)),
    );
  }, [sessions, query]);
  const groups = useMemo(() => groupSessions(filtered), [filtered]);

  const startRename = (session: Session) => {
    setEditingId(session.id);
    setEditTitle(session.title);
    setMenuId(null);
  };

  const commitRename = () => {
    if (editingId) renameSession(editingId, editTitle);
    setEditingId(null);
  };

  return (
    <>
      <aside className={cn('sidebar', sidebarOpen && 'is-open')}>
        <div className="sidebar-top">
          <Brand />
          <button
            type="button"
            className="icon-btn sidebar-close"
            aria-label="Fechar menu"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={18} />
          </button>
        </div>

        <button
          type="button"
          className="new-chat"
          onClick={() => {
            newSession();
            setSidebarOpen(false);
          }}
        >
          <Plus size={17} />
          <span>Novo chat</span>
          <kbd>Ctrl N</kbd>
        </button>

        <div className="sidebar-search">
          <Search size={15} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar conversas…"
            aria-label="Buscar conversas"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} aria-label="Limpar busca">
              <X size={14} />
            </button>
          )}
        </div>

        <nav className="session-list" aria-label="Conversas">
          {groups.length ? (
            groups.map((group) => (
              <div key={group.label} className="session-group">
                <div className="session-group-label">{group.label}</div>
                {group.items.map((session) => (
                  <div
                    key={session.id}
                    className={cn('session-item', session.id === activeSessionId && 'is-active')}
                  >
                    {editingId === session.id ? (
                      <input
                        className="session-rename"
                        value={editTitle}
                        autoFocus
                        onChange={(event) => setEditTitle(event.target.value)}
                        onBlur={commitRename}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') commitRename();
                          if (event.key === 'Escape') setEditingId(null);
                        }}
                      />
                    ) : (
                      <button
                        type="button"
                        className="session-main"
                        onClick={() => {
                          selectSession(session.id);
                          setSidebarOpen(false);
                        }}
                      >
                        {session.pinned && <Pin size={12} className="pin-mark" />}
                        <span className="session-title">{session.title}</span>
                        <span className="session-time">{relativeTime(session.updatedAt)}</span>
                      </button>
                    )}
                    <div className="session-actions">
                      <button
                        type="button"
                        aria-label="Opções da conversa"
                        onClick={() => setMenuId(menuId === session.id ? null : session.id)}
                      >
                        <MoreHorizontal size={15} />
                      </button>
                      {menuId === session.id && (
                        <div className="session-menu" onMouseLeave={() => setMenuId(null)}>
                          <button type="button" onClick={() => togglePin(session.id)}>
                            <Pin size={14} /> {session.pinned ? 'Desafixar' : 'Fixar'}
                          </button>
                          <button type="button" onClick={() => startRename(session)}>
                            <Pencil size={14} /> Renomear
                          </button>
                          <button
                            type="button"
                            className="danger"
                            onClick={() => {
                              if (confirm(`Apagar "${session.title}"?`)) {
                                void deleteSession(session.id);
                                showToast('Conversa apagada.', 'info');
                              }
                              setMenuId(null);
                            }}
                          >
                            <Trash2 size={14} /> Apagar
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ))
          ) : (
            <div className="session-empty">{query ? 'Nada encontrado.' : 'Nenhuma conversa ainda.'}</div>
          )}
        </nav>

        <div className="sidebar-footer">
          <button
            type="button"
            className="sidebar-action"
            onClick={() => {
              setMemoryOpen(true);
              setSidebarOpen(false);
            }}
          >
            <Brain size={16} />
            <span>Memória</span>
            <small>{memories.length}</small>
          </button>
          <button
            type="button"
            className="sidebar-action"
            onClick={() => {
              setSettingsOpen(true);
              setSidebarOpen(false);
            }}
          >
            <Settings size={16} />
            <span>Configurações</span>
          </button>
          <div className="sidebar-user">
            <div className="user-avatar small">{getInitials(settings.userName || 'Você')}</div>
            <div className="sidebar-user-copy">
              <strong>{settings.userName || 'Visitante'}</strong>
              <span>{settings.providers.find((p) => p.id === settings.activeProviderId)?.name}</span>
            </div>
            <button
              type="button"
              className="icon-btn"
              aria-label="Alternar tema"
              onClick={() => updateSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' })}
            >
              {settings.theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
        </div>
      </aside>
      {sidebarOpen && <div className="sidebar-scrim" onClick={() => setSidebarOpen(false)} />}
    </>
  );
}

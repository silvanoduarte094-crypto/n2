import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Brain,
  Command,
  Download,
  MessageSquare,
  Moon,
  Plus,
  Search,
  Settings,
  Sparkles,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { cn, relativeTime } from '../lib/utils';

type Item =
  | { kind: 'action'; id: string; label: string; hint?: string; icon: typeof Plus; run: () => void }
  | { kind: 'session'; id: string; label: string; hint: string; icon: typeof MessageSquare; run: () => void };

export function CommandPalette() {
  const open = useStore((state) => state.commandOpen);
  const setOpen = useStore((state) => state.setCommandOpen);
  const sessions = useStore((state) => state.sessions);
  const settings = useStore((state) => state.settings);
  const newSession = useStore((state) => state.newSession);
  const selectSession = useStore((state) => state.selectSession);
  const setSettingsOpen = useStore((state) => state.setSettingsOpen);
  const setMemoryOpen = useStore((state) => state.setMemoryOpen);
  const updateSettings = useStore((state) => state.updateSettings);
  const exportData = useStore((state) => state.exportData);

  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (open) {
      setQuery('');
      setIndex(0);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  const items: Item[] = useMemo(() => {
    const actions: Item[] = [
      {
        kind: 'action',
        id: 'new',
        label: 'Novo chat',
        hint: 'Ctrl N',
        icon: Plus,
        run: () => newSession(),
      },
      {
        kind: 'action',
        id: 'settings',
        label: 'Abrir configurações',
        hint: 'Ctrl ,',
        icon: Settings,
        run: () => setSettingsOpen(true),
      },
      {
        kind: 'action',
        id: 'memory',
        label: 'Abrir memória',
        hint: '',
        icon: Brain,
        run: () => setMemoryOpen(true),
      },
      {
        kind: 'action',
        id: 'agent',
        label: settings.agentMode ? 'Desativar modo agente' : 'Ativar modo agente',
        hint: '',
        icon: Sparkles,
        run: () => updateSettings({ agentMode: !settings.agentMode }),
      },
      {
        kind: 'action',
        id: 'theme',
        label: settings.theme === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro',
        hint: '',
        icon: Moon,
        run: () => updateSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' }),
      },
      {
        kind: 'action',
        id: 'export',
        label: 'Exportar backup',
        hint: '',
        icon: Download,
        run: () => void exportData(),
      },
    ];
    const sessionItems: Item[] = sessions.slice(0, 30).map((session) => ({
      kind: 'session',
      id: session.id,
      label: session.title,
      hint: relativeTime(session.updatedAt),
      icon: MessageSquare,
      run: () => selectSession(session.id),
    }));
    return [...actions, ...sessionItems];
  }, [sessions, settings.agentMode, settings.theme, newSession, setSettingsOpen, setMemoryOpen, updateSettings, exportData, selectSession]);

  const filtered = useMemo(() => {
    const clean = query.trim().toLowerCase();
    if (!clean) return items;
    return items.filter(
      (item) => item.label.toLowerCase().includes(clean) || (item.hint || '').toLowerCase().includes(clean),
    );
  }, [items, query]);

  useEffect(() => {
    setIndex(0);
  }, [query]);

  if (!open) return null;

  const run = (item: Item) => {
    setOpen(false);
    item.run();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setIndex((value) => Math.min(filtered.length - 1, value + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setIndex((value) => Math.max(0, value - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const item = filtered[index];
      if (item) run(item);
    }
  };

  return createPortal(
    <div
      className="command-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setOpen(false);
      }}
    >
      <div className="command-panel" role="dialog" aria-modal="true" aria-label="Paleta de comandos">
        <div className="command-search">
          <Search size={18} />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Buscar comandos ou conversas…"
          />
          <kbd>ESC</kbd>
        </div>
        <div className="command-results">
          {filtered.length ? (
            filtered.map((item, itemIndex) => {
              const Icon = item.icon;
              return (
                <button
                  key={`${item.kind}-${item.id}`}
                  type="button"
                  className={cn('command-item', itemIndex === index && 'is-active')}
                  onMouseEnter={() => setIndex(itemIndex)}
                  onClick={() => run(item)}
                >
                  <span className="command-icon">
                    <Icon size={16} />
                  </span>
                  <span className="command-label">{item.label}</span>
                  {item.hint && <span className="command-hint">{item.hint}</span>}
                </button>
              );
            })
          ) : (
            <div className="command-empty">Nada encontrado.</div>
          )}
        </div>
        <footer className="command-foot">
          <span>
            <Command size={13} /> N2
          </span>
          <span>↑↓ navegar · Enter abrir</span>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

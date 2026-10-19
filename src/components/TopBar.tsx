import { useState } from 'react';
import {
  Brain,
  ChevronDown,
  Command,
  Download,
  Menu,
  Moon,
  Settings2,
  Sparkles,
  Sun,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { getProvider } from '../config';
import { cn } from '../lib/utils';

export function TopBar() {
  const sessions = useStore((state) => state.sessions);
  const activeSessionId = useStore((state) => state.activeSessionId);
  const settings = useStore((state) => state.settings);
  const streaming = useStore((state) => state.streaming);
  const status = useStore((state) => state.status);
  const setSidebarOpen = useStore((state) => state.setSidebarOpen);
  const setSettingsOpen = useStore((state) => state.setSettingsOpen);
  const setMemoryOpen = useStore((state) => state.setMemoryOpen);
  const setCommandOpen = useStore((state) => state.setCommandOpen);
  const exportData = useStore((state) => state.exportData);
  const updateSettings = useStore((state) => state.updateSettings);
  const setActiveProvider = useStore((state) => state.setActiveProvider);
  const updateProvider = useStore((state) => state.updateProvider);
  const renameSession = useStore((state) => state.renameSession);

  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const session = sessions.find((item) => item.id === activeSessionId);
  const provider = getProvider(settings);
  const models = Array.from(new Set([provider.model, ...provider.models]));

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button
          type="button"
          className="icon-btn mobile-menu"
          aria-label="Abrir menu"
          onClick={() => setSidebarOpen(true)}
        >
          <Menu size={19} />
        </button>
        <div className="topbar-title">
          {editing && session ? (
            <input
              value={title}
              autoFocus
              onChange={(event) => setTitle(event.target.value)}
              onBlur={() => {
                renameSession(session.id, title);
                setEditing(false);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  renameSession(session.id, title);
                  setEditing(false);
                }
                if (event.key === 'Escape') setEditing(false);
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => {
                if (!session) return;
                setTitle(session.title);
                setEditing(true);
              }}
              title="Renomear conversa"
            >
              {session?.title || 'Novo chat'}
            </button>
          )}
          <span className={cn('topbar-status', streaming && 'is-live')}>
            {streaming ? status || 'Ao vivo' : 'Pronto'}
          </span>
        </div>
      </div>

      <div className="topbar-right">
        <div className="model-picker">
          <select
            value={settings.activeProviderId}
            aria-label="Provedor de IA"
            onChange={(event) => setActiveProvider(event.target.value)}
          >
            {settings.providers
              .filter((item) => item.enabled)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                  {item.kind !== 'ollama' && !item.apiKey ? ' (sem chave)' : ''}
                </option>
              ))}
          </select>
          <ChevronDown size={13} />
        </div>
        <div className="model-picker model-name">
          <select
            value={provider.model}
            aria-label="Modelo"
            onChange={(event) => updateProvider(provider.id, { model: event.target.value })}
          >
            {models.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
          <ChevronDown size={13} />
        </div>

        <button
          type="button"
          className={cn('topbar-toggle', settings.agentMode && 'is-on')}
          onClick={() => updateSettings({ agentMode: !settings.agentMode })}
          title="Agentes e ferramentas"
        >
          <Sparkles size={15} />
          <span>Agente</span>
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label="Memória"
          title="Memória de longo prazo"
          onClick={() => setMemoryOpen(true)}
        >
          <Brain size={18} />
        </button>
        <button
          type="button"
          className="icon-btn theme-toggle"
          aria-label="Alternar tema"
          title="Alternar tema"
          onClick={() => updateSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' })}
        >
          {settings.theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
        </button>

        <div className="topbar-more">
          <button
            type="button"
            className="icon-btn"
            aria-label="Mais opções"
            onClick={() => setMenuOpen((value) => !value)}
          >
            <Settings2 size={18} />
          </button>
          {menuOpen && (
            <div className="dropdown" onMouseLeave={() => setMenuOpen(false)}>
              <button
                type="button"
                onClick={() => {
                  setCommandOpen(true);
                  setMenuOpen(false);
                }}
              >
                <Command size={15} /> Paleta de comandos <kbd>Ctrl K</kbd>
              </button>
              <button
                type="button"
                onClick={() => {
                  setSettingsOpen(true);
                  setMenuOpen(false);
                }}
              >
                <Settings2 size={15} /> Configurações
              </button>
              <button
                type="button"
                onClick={() => {
                  void exportData();
                  setMenuOpen(false);
                }}
              >
                <Download size={15} /> Exportar backup
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

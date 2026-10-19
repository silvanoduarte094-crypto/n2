import { useMemo, useState } from 'react';
import { Brain, Cable, Plus, Search, Trash2, Wrench, X } from 'lucide-react';
import { useStore } from '../store/useStore';
import { TOOL_DEFINITIONS } from '../lib/tools';
import { cn, relativeTime, truncate } from '../lib/utils';

type PanelTab = 'memory' | 'connectors' | 'tools';

export function RightPanel() {
  const open = useStore((state) => state.memoryOpen);
  const setOpen = useStore((state) => state.setMemoryOpen);
  const memories = useStore((state) => state.memories);
  const connectors = useStore((state) => state.settings.connectors);
  const addMemory = useStore((state) => state.addMemory);
  const removeMemory = useStore((state) => state.removeMemory);
  const upsertConnector = useStore((state) => state.upsertConnector);
  const removeConnector = useStore((state) => state.removeConnector);
  const setSettingsOpen = useStore((state) => state.setSettingsOpen);
  const setSettingsTab = useStore((state) => state.setSettingsTab);
  const showToast = useStore((state) => state.showToast);

  const [tab, setTab] = useState<PanelTab>('memory');
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState('');

  const filteredMemories = useMemo(() => {
    const clean = query.trim().toLowerCase();
    if (!clean) return memories;
    return memories.filter(
      (memory) =>
        memory.text.toLowerCase().includes(clean) ||
        memory.tags.some((tag) => tag.toLowerCase().includes(clean)),
    );
  }, [memories, query]);

  if (!open) return null;

  return (
    <aside className="right-panel">
      <header className="right-panel-head">
        <div>
          <h2>Central de contexto</h2>
          <p>Memória, conectores e ferramentas do agente.</p>
        </div>
        <button type="button" className="icon-btn" aria-label="Fechar" onClick={() => setOpen(false)}>
          <X size={18} />
        </button>
      </header>

      <div className="panel-tabs">
        <button
          type="button"
          className={cn(tab === 'memory' && 'is-active')}
          onClick={() => setTab('memory')}
        >
          <Brain size={15} /> Memória <span>{memories.length}</span>
        </button>
        <button
          type="button"
          className={cn(tab === 'connectors' && 'is-active')}
          onClick={() => setTab('connectors')}
        >
          <Cable size={15} /> Conectores <span>{connectors.length}</span>
        </button>
        <button
          type="button"
          className={cn(tab === 'tools' && 'is-active')}
          onClick={() => setTab('tools')}
        >
          <Wrench size={15} /> Ferramentas
        </button>
      </div>

      {tab === 'memory' && (
        <div className="panel-section">
          <div className="panel-search">
            <Search size={15} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar memórias…"
            />
          </div>
          <form
            className="memory-add"
            onSubmit={async (event) => {
              event.preventDefault();
              const clean = draft.trim();
              if (!clean) return;
              await addMemory(clean, [], 'manual');
              setDraft('');
              showToast('Memória adicionada.', 'success');
            }}
          >
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Ex.: Prefiro respostas curtas e em português."
              rows={2}
            />
            <button type="submit" className="btn btn-primary btn-sm" disabled={!draft.trim()}>
              <Plus size={14} /> Adicionar
            </button>
          </form>
          <div className="memory-list">
            {filteredMemories.length ? (
              filteredMemories.map((memory) => (
                <article key={memory.id} className="memory-card">
                  <p>{memory.text}</p>
                  <div className="memory-meta">
                    <span>{relativeTime(memory.updatedAt)}</span>
                    {memory.tags.map((tag) => (
                      <span key={tag} className="tag">
                        {tag}
                      </span>
                    ))}
                    <button
                      type="button"
                      aria-label="Apagar memória"
                      onClick={() => void removeMemory(memory.id)}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <div className="panel-empty">
                <Brain size={26} />
                <strong>Nenhuma memória ainda</strong>
                <span>
                  Peça ao agente para lembrar de algo ou salve uma resposta com o ícone de estrela.
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'connectors' && (
        <div className="panel-section">
          <div className="panel-note">
            Conectores permitem que o N2 converse com o MYRKAVELL e outros sistemas via REST, webhook
            ou MCP.
          </div>
          <div className="connector-list">
            {connectors.length ? (
              connectors.map((connector) => (
                <article key={connector.id} className="connector-card">
                  <div className="connector-head">
                    <span className={cn('connector-dot', connector.enabled && 'is-on')} />
                    <strong>{connector.name}</strong>
                    <span className="tag">{connector.type}</span>
                  </div>
                  <p>{truncate(connector.description || connector.url, 120)}</p>
                  <div className="connector-actions">
                    <button
                      type="button"
                      className="link-btn"
                      onClick={() =>
                        upsertConnector({ ...connector, enabled: !connector.enabled })
                      }
                    >
                      {connector.enabled ? 'Desativar' : 'Ativar'}
                    </button>
                    <button
                      type="button"
                      className="link-btn"
                      onClick={() => {
                        setSettingsTab('connectors');
                        setSettingsOpen(true);
                      }}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className="link-btn danger"
                      onClick={() => void removeConnector(connector.id)}
                    >
                      Remover
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <div className="panel-empty">
                <Cable size={26} />
                <strong>Nenhum conector</strong>
                <span>Adicione o endpoint do MYRKAVELL ou de outro serviço.</span>
              </div>
            )}
          </div>
          <button
            type="button"
            className="btn btn-primary btn-block"
            onClick={() => {
              setSettingsTab('connectors');
              setSettingsOpen(true);
            }}
          >
            <Plus size={15} /> Adicionar conector
          </button>
        </div>
      )}

      {tab === 'tools' && (
        <div className="panel-section">
          <div className="panel-note">
            Ferramentas disponíveis para o agente. Elas só são chamadas quando o modo agente está
            ativo.
          </div>
          <div className="tool-def-list">
            {TOOL_DEFINITIONS.map((tool) => (
              <article key={tool.name} className="tool-def">
                <div>
                  <Wrench size={14} />
                  <strong>{tool.name}</strong>
                </div>
                <p>{tool.description}</p>
              </article>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}

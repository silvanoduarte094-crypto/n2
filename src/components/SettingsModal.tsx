import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  Cable,
  CalendarClock,
  Check,
  Database,
  Download,
  Eye,
  EyeOff,
  ExternalLink,
  Github,
  Info,
  KeyRound,
  Palette,
  Play,
  Plus,
  RefreshCw,
  Shield,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Upload,
  User,
  Volume2,
  Zap,
} from 'lucide-react';
import { useStore, type SettingsTab } from '../store/useStore';
import {
  ACCENTS,
  APP_VERSION,
  CODESPACES_URL,
  DEFAULT_SYSTEM_PROMPT,
  REPO_URL,
  getProvider,
} from '../config';
import type { Connector, Provider, Routine, UsageRecord } from '../types';
import { testProvider } from '../lib/providers/test';
import { resolveConnection } from '../lib/providers/http';
import { clearMcpCache, listMcpTools } from '../lib/mcp';
import { embeddingsSupported } from '../lib/embeddings';
import { describeCron, isValidCron, nextCronTime, nextRoutineRun } from '../lib/cron';
import { promptVariableValues, renderPromptTemplate } from '../lib/agent';
import { TOOL_DEFINITIONS } from '../lib/tools';
import { cn, formatBytes, relativeTime, uid } from '../lib/utils';
import { Field, IconButton, Modal, Segmented, Spinner, Toggle } from './ui';
import { Logo } from './Logo';

const TABS: { id: SettingsTab; label: string; icon: typeof User }[] = [
  { id: 'general', label: 'Geral', icon: User },
  { id: 'providers', label: 'Provedores', icon: KeyRound },
  { id: 'agent', label: 'Agente', icon: Sparkles },
  { id: 'routines', label: 'Rotinas', icon: CalendarClock },
  { id: 'usage', label: 'Uso', icon: BarChart3 },
  { id: 'connectors', label: 'Conectores', icon: Cable },
  { id: 'data', label: 'Dados', icon: Database },
  { id: 'about', label: 'Sobre', icon: Info },
];

const PROMPT_VARIABLES = [
  { name: 'user', label: 'usuário', hint: 'Nome configurado em Geral' },
  { name: 'date', label: 'data', hint: 'Data atual por extenso' },
  { name: 'time', label: 'hora', hint: 'Hora atual' },
  { name: 'timezone', label: 'fuso', hint: 'Fuso horário local' },
  { name: 'provider', label: 'provedor', hint: 'Provedor em uso' },
  { name: 'model', label: 'modelo', hint: 'Modelo em uso' },
  { name: 'tools', label: 'ferramentas', hint: 'Lista de ferramentas disponíveis' },
  { name: 'memories', label: 'memórias', hint: 'Memórias relevantes para a mensagem' },
];

const CRON_EXAMPLES = [
  { cron: '*/30 * * * *', label: 'A cada 30 min' },
  { cron: '0 * * * *', label: 'A cada hora' },
  { cron: '0 9 * * *', label: 'Todo dia às 9h' },
  { cron: '0 8 * * 1-5', label: 'Dias úteis às 8h' },
];

function ProviderCard({
  provider,
  active,
  expanded,
  onExpand,
}: {
  provider: Provider;
  active: boolean;
  expanded: boolean;
  onExpand: () => void;
}) {
  const settings = useStore((state) => state.settings);
  const updateProvider = useStore((state) => state.updateProvider);
  const setActiveProvider = useStore((state) => state.setActiveProvider);
  const showToast = useStore((state) => state.showToast);
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);

  const test = async () => {
    setTesting(true);
    try {
      const message = await testProvider(settings, provider);
      showToast(message, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error');
    } finally {
      setTesting(false);
    }
  };

  return (
    <article className={cn('provider-card', active && 'is-active', expanded && 'is-expanded')}>
      <button type="button" className="provider-head" onClick={onExpand}>
        <span className={cn('provider-radio', active && 'is-on')} />
        <span className="provider-title">
          <strong>{provider.name}</strong>
          <small>{provider.kind}</small>
        </span>
        {provider.notes && <span className="provider-note">{provider.notes}</span>}
        <span className={cn('provider-state', provider.apiKey || provider.kind === 'ollama' ? 'ready' : 'missing')}>
          {provider.kind === 'ollama' || provider.apiKey ? 'configurado' : 'sem chave'}
        </span>
      </button>

      {expanded && (
        <div className="provider-body">
          <div className="field-grid">
            <Field label="Nome">
              <input
                value={provider.name}
                onChange={(event) => updateProvider(provider.id, { name: event.target.value })}
              />
            </Field>
            <Field label="Tipo de API">
              <select
                value={provider.kind}
                onChange={(event) =>
                  updateProvider(provider.id, { kind: event.target.value as Provider['kind'] })
                }
              >
                <option value="openai">OpenAI-compatível</option>
                <option value="anthropic">Anthropic</option>
                <option value="gemini">Google Gemini</option>
                <option value="ollama">Ollama (local)</option>
              </select>
            </Field>
          </div>
          <Field label="Base URL">
            <input
              value={provider.baseUrl}
              spellCheck={false}
              onChange={(event) => updateProvider(provider.id, { baseUrl: event.target.value })}
              placeholder="https://api.exemplo.com/v1"
            />
          </Field>
          <Field
            label="API key"
            hint={
              provider.id === 'github'
                ? 'Crie um token em github.com/settings/tokens com a permissão models:read.'
                : 'A chave fica salva apenas neste dispositivo (IndexedDB).'
            }
          >
            <div className="input-with-button">
              <input
                type={showKey ? 'text' : 'password'}
                value={provider.apiKey}
                spellCheck={false}
                autoComplete="off"
                onChange={(event) => updateProvider(provider.id, { apiKey: event.target.value })}
                placeholder={provider.kind === 'ollama' ? 'ollama' : 'sk-…'}
              />
              <button type="button" onClick={() => setShowKey((value) => !value)} aria-label="Mostrar chave">
                {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </Field>
          <Field label="Modelo" hint="Use o identificador exato do provedor. Você pode trocar no topo do chat.">
            <input
              value={provider.model}
              spellCheck={false}
              onChange={(event) => updateProvider(provider.id, { model: event.target.value })}
              list={`models-${provider.id}`}
            />
            <datalist id={`models-${provider.id}`}>
              {provider.models.map((model) => (
                <option key={model} value={model} />
              ))}
            </datalist>
          </Field>
          <div className="field-grid">
            <Field
              label="Preço de entrada (US$ / 1M)"
              hint="Opcional. Usado apenas para estimar custo localmente."
            >
              <input
                type="number"
                min="0"
                step="0.01"
                value={provider.inputPrice ?? ''}
                placeholder="ex.: 0,15"
                onChange={(event) =>
                  updateProvider(provider.id, {
                    inputPrice: event.target.value === '' ? undefined : Number(event.target.value),
                  })
                }
              />
            </Field>
            <Field
              label="Preço de saída (US$ / 1M)"
              hint="Opcional. Sem preços, o painel mostra só tokens e latência."
            >
              <input
                type="number"
                min="0"
                step="0.01"
                value={provider.outputPrice ?? ''}
                placeholder="ex.: 0,60"
                onChange={(event) =>
                  updateProvider(provider.id, {
                    outputPrice: event.target.value === '' ? undefined : Number(event.target.value),
                  })
                }
              />
            </Field>
          </div>
          <div className="toggle-stack">
            <Toggle
              checked={provider.direct !== false}
              onChange={(direct) => updateProvider(provider.id, { direct })}
              label="Chamadas diretas do navegador (CORS)"
              description={
                provider.id === 'github'
                  ? 'GitHub Models não envia cabeçalhos CORS: mantenha desligado e use o bridge (local ou Codespaces).'
                  : 'Ligue para falar com o provedor sem bridge. Desligue se o provedor bloquear chamadas do navegador.'
              }
            />
          </div>
          <div className="provider-actions">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setActiveProvider(provider.id)}
              disabled={active}
            >
              {active ? <><Check size={14} /> Em uso</> : 'Usar este provedor'}
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={test} disabled={testing}>
              {testing ? <Spinner size={14} /> : <KeyRound size={14} />} Testar conexão
            </button>
            <Toggle
              checked={provider.enabled}
              onChange={(enabled) => updateProvider(provider.id, { enabled })}
              label="Ativo"
            />
          </div>
        </div>
      )}
    </article>
  );
}

function ConnectorForm({
  initial,
  onDone,
}: {
  initial: Connector;
  onDone: () => void;
}) {
  const upsertConnector = useStore((state) => state.upsertConnector);
  const showToast = useStore((state) => state.showToast);
  const settings = useStore((state) => state.settings);
  const [draft, setDraft] = useState<Connector>(initial);
  const [testing, setTesting] = useState(false);

  const testMcp = async () => {
    setTesting(true);
    clearMcpCache();
    try {
      const tools = await listMcpTools(settings, { ...draft, enabled: true }, undefined, false);
      showToast(
        tools.length
          ? `MCP conectado: ${tools.length} ferramenta(s) encontrada(s).`
          : 'MCP conectado, mas o servidor não expôs ferramentas.',
        tools.length ? 'success' : 'info',
      );
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error');
    } finally {
      setTesting(false);
    }
  };

  return (
    <form
      className="connector-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!draft.name.trim() || !draft.url.trim()) {
          showToast('Nome e URL são obrigatórios.', 'error');
          return;
        }
        upsertConnector(draft);
        showToast('Conector salvo.', 'success');
        onDone();
      }}
    >
      <div className="field-grid">
        <Field label="Nome">
          <input
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            placeholder="MYRKAVELL"
          />
        </Field>
        <Field label="Tipo">
          <select
            value={draft.type}
            onChange={(event) => setDraft({ ...draft, type: event.target.value as Connector['type'] })}
          >
            <option value="rest">REST</option>
            <option value="webhook">Webhook</option>
            <option value="mcp">MCP</option>
          </select>
        </Field>
      </div>
      <Field label="URL do endpoint">
        <input
          value={draft.url}
          spellCheck={false}
          onChange={(event) => setDraft({ ...draft, url: event.target.value })}
          placeholder="https://api.myrkavell.example/v1"
        />
      </Field>
      <div className="field-grid">
        <Field label="Método">
          <select
            value={draft.method || 'POST'}
            onChange={(event) => setDraft({ ...draft, method: event.target.value as Connector['method'] })}
          >
            <option value="POST">POST</option>
            <option value="GET">GET</option>
            <option value="PUT">PUT</option>
            <option value="PATCH">PATCH</option>
            <option value="DELETE">DELETE</option>
          </select>
        </Field>
        <Field label="Authorization" hint="Ex.: Bearer eyJ… — salvo apenas localmente.">
          <input
            type="password"
            value={draft.authHeader || ''}
            onChange={(event) => setDraft({ ...draft, authHeader: event.target.value })}
            placeholder="Bearer …"
          />
        </Field>
      </div>
      <Field label="Descrição" hint="Ajuda o agente a decidir quando usar este conector.">
        <textarea
          rows={2}
          value={draft.description || ''}
          onChange={(event) => setDraft({ ...draft, description: event.target.value })}
          placeholder="Projeto MYRKAVELL: consulte tarefas, memórias e status."
        />
      </Field>
      {draft.type === 'mcp' && (
        <div className="settings-note">
          <Zap size={15} />
          <span>
            MCP usa JSON-RPC sobre Streamable HTTP. O agente descobre as ferramentas
            automaticamente; se o servidor não permitir CORS, use o app completo com bridge.
          </span>
        </div>
      )}
      <Toggle
        checked={draft.enabled}
        onChange={(enabled) => setDraft({ ...draft, enabled })}
        label="Conector ativo"
      />
      <div className="form-actions">
        {draft.type === 'mcp' && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void testMcp()}
            disabled={testing || !draft.url.trim()}
          >
            {testing ? <Spinner size={14} /> : <Zap size={14} />} Testar MCP
          </button>
        )}
        <button type="button" className="btn btn-ghost" onClick={onDone}>
          Cancelar
        </button>
        <button type="submit" className="btn btn-primary">
          Salvar conector
        </button>
      </div>
    </form>
  );
}

function ConnectorsTab() {
  const connectors = useStore((state) => state.settings.connectors);
  const removeConnector = useStore((state) => state.removeConnector);
  const [editing, setEditing] = useState<Connector | null>(null);

  if (editing) {
    return <ConnectorForm initial={editing} onDone={() => setEditing(null)} />;
  }

  return (
    <div className="settings-section">
      <div className="section-heading">
        <div>
          <h3>Conectores externos</h3>
          <p>Conecte o N2 ao MYRKAVELL e a outros sistemas por REST, webhook ou MCP.</p>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() =>
            setEditing({
              id: uid('c_'),
              name: '',
              type: 'rest',
              url: '',
              method: 'POST',
              enabled: true,
              description: '',
            })
          }
        >
          <Plus size={14} /> Novo
        </button>
      </div>
      {connectors.length ? (
        <div className="connector-settings-list">
          {connectors.map((connector) => (
            <article key={connector.id} className="connector-setting">
              <div>
                <strong>{connector.name || 'Sem nome'}</strong>
                <span>{connector.url}</span>
                <small>
                  {connector.type} · {connector.enabled ? 'ativo' : 'desativado'}
                </small>
              </div>
              <div className="row-actions">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(connector)}>
                  Editar
                </button>
                <IconButton label="Remover conector" onClick={() => void removeConnector(connector.id)}>
                  <Trash2 size={15} />
                </IconButton>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-panel">
          <Cable size={30} />
          <strong>Nenhum conector configurado</strong>
          <p>
            O MYRKAVELL pode expor um endpoint REST ou webhook. Adicione a URL e o token para o
            agente consultar e enviar dados.
          </p>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() =>
              setEditing({
                id: uid('c_'),
                name: 'MYRKAVELL',
                type: 'rest',
                url: '',
                method: 'POST',
                enabled: true,
                description: 'Projeto parceiro MYRKAVELL. Consulte e envie dados conforme o contrato.',
              })
            }
          >
            <Plus size={15} /> Criar conector MYRKAVELL
          </button>
        </div>
      )}
      <div className="settings-note">
        <Info size={15} />
        <span>
          O contrato sugerido está em <code>docs/MYRKAVELL-CONNECTOR.md</code>. O agente só chama um
          conector quando o usuário pedir ou quando a intenção for explícita.
        </span>
      </div>
    </div>
  );
}

function DataTab() {
  const exportData = useStore((state) => state.exportData);
  const importData = useStore((state) => state.importData);
  const resetAll = useStore((state) => state.resetAll);
  const showToast = useStore((state) => state.showToast);
  const memories = useStore((state) => state.memories);
  const ragEnabled = useStore((state) => state.settings.ragEnabled);
  const reindexEmbeddings = useStore((state) => state.reindexEmbeddings);
  const reindexProgress = useStore((state) => state.reindexProgress);
  const fileRef = useRef<HTMLInputElement>(null);
  const [usage, setUsage] = useState<{ usage?: number; quota?: number }>({});
  const indexed = memories.filter((memory) => memory.embedding?.length).length;

  useEffect(() => {
    navigator.storage?.estimate?.().then((estimate) => {
      setUsage({ usage: estimate.usage, quota: estimate.quota });
    });
  }, []);

  return (
    <div className="settings-section">
      <div className="section-heading">
        <div>
          <h3>Seus dados</h3>
          <p>Backups, armazenamento local e limpeza. Nada é enviado para servidores do N2.</p>
        </div>
      </div>
      <div className="data-grid">
        <button type="button" className="data-card" onClick={() => void exportData()}>
          <Download size={22} />
          <strong>Exportar backup</strong>
          <span>Baixe conversas, memórias e configurações em JSON.</span>
        </button>
        <button type="button" className="data-card" onClick={() => fileRef.current?.click()}>
          <Upload size={22} />
          <strong>Importar backup</strong>
          <span>Restaure um arquivo exportado pelo N2.</span>
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="application/json"
        hidden
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          try {
            const parsed = JSON.parse(await file.text());
            await importData(parsed);
          } catch (error) {
            showToast(error instanceof Error ? error.message : 'Backup inválido.', 'error');
          }
        }}
      />
      <div className="storage-card">
        <Database size={18} />
        <div>
          <strong>Armazenamento local</strong>
          <span>
            {usage.usage ? `${formatBytes(usage.usage)} usados` : 'Calculando…'}
            {usage.quota ? ` de ${formatBytes(usage.quota)} disponíveis` : ''}
          </span>
        </div>
      </div>
      <div className="storage-card">
        <RefreshCw size={18} />
        <div>
          <strong>Índice semântico</strong>
          <span>
            {indexed} de {memories.length} memória(s) com vetor local.
            {!ragEnabled && ' Ative a busca semântica na aba Agente para indexar.'}
            {reindexProgress &&
              ` Indexando ${reindexProgress.done}/${reindexProgress.total}…`}
          </span>
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={!ragEnabled || !!reindexProgress || !memories.length}
          onClick={() => void reindexEmbeddings()}
        >
          <RefreshCw size={14} /> Reindexar
        </button>
      </div>
      <div className="danger-zone">
        <div>
          <strong>Apagar todos os dados</strong>
          <span>Remove conversas, memórias, chaves e configurações deste dispositivo.</span>
        </div>
        <button
          type="button"
          className="btn btn-danger"
          onClick={() => {
            if (confirm('Apagar TODOS os dados do N2 neste dispositivo? Esta ação não pode ser desfeita.')) {
              void resetAll();
            }
          }}
        >
          <Trash2 size={15} /> Apagar tudo
        </button>
      </div>
    </div>
  );
}

function formatDateTime(timestamp: number): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(timestamp));
}

function RoutineForm({ initial, onDone }: { initial: Routine; onDone: () => void }) {
  const saveRoutine = useStore((state) => state.saveRoutine);
  const showToast = useStore((state) => state.showToast);
  const [draft, setDraft] = useState<Routine>(initial);

  const valid = isValidCron(draft.cron);
  let next: number | null = null;
  let cronError = '';
  if (valid) {
    try {
      next = nextCronTime(draft.cron);
    } catch (error) {
      cronError = error instanceof Error ? error.message : String(error);
    }
  }

  return (
    <form
      className="routine-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!draft.name.trim() || !draft.prompt.trim()) {
          showToast('Nome e instrução são obrigatórios.', 'error');
          return;
        }
        if (!valid) {
          showToast('Expressão cron inválida.', 'error');
          return;
        }
        saveRoutine({ ...draft, name: draft.name.trim(), prompt: draft.prompt.trim() });
        showToast('Rotina salva.', 'success');
        onDone();
      }}
    >
      <Field label="Nome">
        <input
          value={draft.name}
          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          placeholder="Resumo matinal"
        />
      </Field>
      <Field
        label="O que a rotina deve fazer"
        hint="Vira uma mensagem nova no chat, com ferramentas e memória disponíveis."
      >
        <textarea
          rows={4}
          value={draft.prompt}
          onChange={(event) => setDraft({ ...draft, prompt: event.target.value })}
          placeholder="Resuma as notícias de tecnologia de hoje e salve os 3 pontos principais na memória."
        />
      </Field>
      <Field
        label="Agendamento (cron)"
        hint="5 campos: minuto hora dia mês dia-da-semana. Ex.: 0 9 * * 1-5"
      >
        <input
          value={draft.cron}
          spellCheck={false}
          onChange={(event) => setDraft({ ...draft, cron: event.target.value })}
          placeholder="0 9 * * *"
        />
      </Field>
      <div className="cron-examples">
        {CRON_EXAMPLES.map((example) => (
          <button
            key={example.cron}
            type="button"
            className={cn('cron-example', draft.cron === example.cron && 'is-active')}
            onClick={() => setDraft({ ...draft, cron: example.cron })}
          >
            {example.label}
          </button>
        ))}
      </div>
      <div className={cn('cron-preview', !valid && 'is-error')}>
        <CalendarClock size={15} />
        {valid && next ? (
          <span>
            {describeCron(draft.cron)} · próxima execução em {formatDateTime(next)}
          </span>
        ) : (
          <span>{cronError || 'Expressão cron inválida.'}</span>
        )}
      </div>
      <div className="toggle-stack">
        <Toggle
          checked={draft.enabled}
          onChange={(enabled) => setDraft({ ...draft, enabled })}
          label="Rotina ativa"
          description="Desligue para pausar sem apagar o agendamento."
        />
        <Toggle
          checked={draft.notify}
          onChange={(notify) => setDraft({ ...draft, notify })}
          label="Notificar ao concluir"
          description="Usa as notificações do navegador, se você permitir."
        />
      </div>
      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onDone}>
          Cancelar
        </button>
        <button type="submit" className="btn btn-primary">
          Salvar rotina
        </button>
      </div>
    </form>
  );
}

function RoutinesTab() {
  const routines = useStore((state) => state.settings.routines) || [];
  const saveRoutine = useStore((state) => state.saveRoutine);
  const removeRoutine = useStore((state) => state.removeRoutine);
  const runRoutine = useStore((state) => state.runRoutine);
  const streaming = useStore((state) => state.streaming);
  const [editing, setEditing] = useState<Routine | null>(null);
  const [permission, setPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported',
  );

  if (editing) {
    return <RoutineForm initial={editing} onDone={() => setEditing(null)} />;
  }

  return (
    <div className="settings-section">
      <div className="section-heading">
        <div>
          <h3>Rotinas agendadas</h3>
          <p>
            O N2 abre uma conversa nova e executa a instrução no horário definido, enquanto o app
            estiver aberto.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() =>
            setEditing({
              id: uid('r_'),
              name: '',
              prompt: '',
              cron: '0 9 * * *',
              enabled: true,
              notify: true,
              createdAt: Date.now(),
            })
          }
        >
          <Plus size={14} /> Nova rotina
        </button>
      </div>

      {routines.length ? (
        <div className="routine-list">
          {routines.map((routine) => {
            const next = nextRoutineRun(routine);
            return (
              <article key={routine.id} className={cn('routine-card', !routine.enabled && 'is-off')}>
                <div className="routine-head">
                  <div>
                    <strong>{routine.name}</strong>
                    <small>
                      {describeCron(routine.cron)}
                      {next
                        ? next <= Date.now()
                          ? ' · execução pendente'
                          : ` · próxima ${formatDateTime(next)}`
                        : ' · pausada'}
                    </small>
                  </div>
                  <span className={cn('provider-state', routine.enabled ? 'ready' : 'missing')}>
                    {routine.enabled ? 'ativa' : 'pausada'}
                  </span>
                </div>
                <p>{routine.prompt}</p>
                <div className="routine-meta">
                  <span>
                    {routine.lastRunAt
                      ? `Última execução ${relativeTime(routine.lastRunAt)}`
                      : 'Ainda não executou'}
                  </span>
                  {routine.notify && <span>notificação ligada</span>}
                </div>
                <div className="routine-actions">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={streaming || !routine.enabled}
                    onClick={() => void runRoutine(routine.id)}
                  >
                    <Play size={14} /> Executar agora
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => saveRoutine({ ...routine, enabled: !routine.enabled })}
                  >
                    {routine.enabled ? 'Pausar' : 'Ativar'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setEditing(routine)}
                  >
                    Editar
                  </button>
                  <IconButton
                    label="Remover rotina"
                    onClick={() => {
                      if (confirm(`Remover a rotina "${routine.name}"?`)) {
                        removeRoutine(routine.id);
                      }
                    }}
                  >
                    <Trash2 size={15} />
                  </IconButton>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="empty-panel">
          <CalendarClock size={30} />
          <strong>Nenhuma rotina agendada</strong>
          <p>
            Crie uma rotina para gerar um resumo diário, revisar tarefas, consultar um conector ou
            lembrar você de algo importante.
          </p>
        </div>
      )}

      {permission === 'default' && (
        <div className="settings-note">
          <Zap size={15} />
          <span>
            Notificações estão desligadas.{' '}
            <button
              type="button"
              className="link-btn"
              onClick={async () => {
                const result = await Notification.requestPermission();
                setPermission(result);
              }}
            >
              Permitir notificações
            </button>
          </span>
        </div>
      )}
      <div className="settings-note">
        <Info size={15} />
        <span>
          Rotinas usam o provedor ativo. Se o app estiver fechado no horário, a execução acontece na
          próxima abertura (uma vez, sem repetir o intervalo perdido).
        </span>
      </div>
    </div>
  );
}

function UsageTab() {
  const usage = useStore((state) => state.usage);
  const clearUsage = useStore((state) => state.clearUsage);
  const [range, setRange] = useState<'7' | '30' | 'all'>('7');
  const number = useMemo(() => new Intl.NumberFormat('pt-BR'), []);
  const money = useMemo(
    () =>
      new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 4,
      }),
    [],
  );

  const filtered = useMemo(() => {
    if (range === 'all') return usage;
    const days = range === '7' ? 7 : 30;
    const cutoff = Date.now() - days * 86_400_000;
    return usage.filter((record) => record.at >= cutoff);
  }, [usage, range]);

  const totals = useMemo(() => {
    const tokens = filtered.reduce(
      (sum, record) =>
        sum +
        (record.totalTokens ??
          (record.promptTokens || 0) + (record.completionTokens || 0)),
      0,
    );
    const ok = filtered.filter((record) => record.ok);
    const latency = ok.length
      ? ok.reduce((sum, record) => sum + record.durationMs, 0) / ok.length
      : 0;
    const cost = filtered.reduce((sum, record) => sum + (record.costUsd || 0), 0);
    return { requests: filtered.length, tokens, latency, cost, ok: ok.length };
  }, [filtered]);

  const byProvider = useMemo(() => {
    const map = new Map<
      string,
      { name: string; requests: number; tokens: number; ms: number; cost: number }
    >();
    for (const record of filtered) {
      const current =
        map.get(record.providerId) ||
        { name: record.providerName, requests: 0, tokens: 0, ms: 0, cost: 0 };
      current.requests += 1;
      current.tokens +=
        record.totalTokens ??
        (record.promptTokens || 0) + (record.completionTokens || 0);
      current.ms += record.durationMs;
      current.cost += record.costUsd || 0;
      map.set(record.providerId, current);
    }
    return [...map.values()].sort((a, b) => b.requests - a.requests);
  }, [filtered]);

  const days = useMemo(() => {
    const buckets: { label: string; tokens: number }[] = [];
    for (let offset = 6; offset >= 0; offset -= 1) {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - offset);
      const start = date.getTime();
      const end = start + 86_400_000;
      const tokens = usage
        .filter((record) => record.at >= start && record.at < end)
        .reduce(
          (sum, record) =>
            sum +
            (record.totalTokens ??
              (record.promptTokens || 0) + (record.completionTokens || 0)),
          0,
        );
      buckets.push({
        label: new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(date),
        tokens,
      });
    }
    return buckets;
  }, [usage]);
  const maxDay = Math.max(1, ...days.map((day) => day.tokens));

  return (
    <div className="settings-section">
      <div className="section-heading">
        <div>
          <h3>Uso e desempenho</h3>
          <p>Tokens, latência e custo estimado por provedor. Tudo fica apenas neste dispositivo.</p>
        </div>
        <Segmented
          options={[
            { value: '7', label: '7 dias' },
            { value: '30', label: '30 dias' },
            { value: 'all', label: 'Tudo' },
          ]}
          value={range}
          onChange={setRange}
        />
      </div>

      <div className="usage-cards">
        <article className="usage-card">
          <span>Requisições</span>
          <strong>{number.format(totals.requests)}</strong>
          <small>{totals.ok} concluídas</small>
        </article>
        <article className="usage-card">
          <span>Tokens</span>
          <strong>{number.format(totals.tokens)}</strong>
          <small>entrada + saída</small>
        </article>
        <article className="usage-card">
          <span>Latência média</span>
          <strong>{totals.latency ? `${(totals.latency / 1000).toFixed(2)}s` : '—'}</strong>
          <small>somente respostas ok</small>
        </article>
        <article className="usage-card">
          <span>Custo estimado</span>
          <strong>{totals.cost ? money.format(totals.cost) : '—'}</strong>
          <small>preços configurados por você</small>
        </article>
      </div>

      <div className="usage-bars" aria-label="Tokens nos últimos 7 dias">
        {days.map((day) => (
          <div key={day.label} className="usage-bar-column">
            <div className="usage-bar-track">
              <div
                className="usage-bar-fill"
                style={{ height: `${Math.max(3, (day.tokens / maxDay) * 100)}%` }}
                title={`${day.label}: ${number.format(day.tokens)} tokens`}
              />
            </div>
            <span>{day.label}</span>
          </div>
        ))}
      </div>

      {byProvider.length ? (
        <table className="usage-table">
          <thead>
            <tr>
              <th>Provedor</th>
              <th>Requisições</th>
              <th>Tokens</th>
              <th>Latência média</th>
              <th>Custo</th>
            </tr>
          </thead>
          <tbody>
            {byProvider.map((row) => (
              <tr key={row.name}>
                <td>{row.name}</td>
                <td>{number.format(row.requests)}</td>
                <td>{number.format(row.tokens)}</td>
                <td>{(row.ms / row.requests / 1000).toFixed(2)}s</td>
                <td>{row.cost ? money.format(row.cost) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="empty-panel">
          <BarChart3 size={30} />
          <strong>Sem medições neste período</strong>
          <p>Envie uma mensagem para começar a registrar tokens, latência e custo.</p>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="usage-recent">
          <h4>Últimas execuções</h4>
          {filtered.slice(0, 8).map((record: UsageRecord) => (
            <div key={record.id} className="usage-row">
              <span className={cn('usage-dot', record.ok ? 'is-ok' : 'is-error')} />
              <span className="usage-row-main">
                <strong>{record.providerName}</strong>
                <small>{record.model}</small>
              </span>
              <span>{number.format(record.totalTokens || 0)} tk</span>
              <span>{(record.durationMs / 1000).toFixed(2)}s</span>
              <span>{new Date(record.at).toLocaleTimeString('pt-BR')}</span>
            </div>
          ))}
        </div>
      )}

      <div className="row-actions">
        <button
          type="button"
          className="btn btn-danger btn-sm"
          disabled={!usage.length}
          onClick={() => {
            if (confirm('Apagar todo o histórico de uso? As conversas não serão afetadas.')) {
              void clearUsage();
            }
          }}
        >
          <Trash2 size={14} /> Limpar histórico
        </button>
      </div>
      <div className="settings-note">
        <Info size={15} />
        <span>
          O custo é uma estimativa local baseada nos preços por 1M de tokens definidos em cada
          provedor. Nenhum dado de uso sai do dispositivo.
        </span>
      </div>
    </div>
  );
}

export function SettingsModal() {
  const open = useStore((state) => state.settingsOpen);
  const activeTab = useStore((state) => state.settingsTab);
  const setOpen = useStore((state) => state.setSettingsOpen);
  const setActiveTab = useStore((state) => state.setSettingsTab);
  const settings = useStore((state) => state.settings);
  const updateSettings = useStore((state) => state.updateSettings);
  const setActiveProvider = useStore((state) => state.setActiveProvider);
  const exportData = useStore((state) => state.exportData);
  const resetAll = useStore((state) => state.resetAll);
  const showToast = useStore((state) => state.showToast);

  const [expandedProvider, setExpandedProvider] = useState<string | null>(settings.activeProviderId);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const provider = getProvider(settings);
  const connectionMode = settings.connectionMode || 'auto';
  const resolvedConnection = resolveConnection(settings);
  const fallbackIds = settings.fallbackProviderIds || [];
  const fallbackCandidates = settings.providers.filter(
    (item) => item.id !== settings.activeProviderId,
  );

  const promptPreview = renderPromptTemplate(settings.systemPrompt, {
    ...promptVariableValues(
      settings,
      provider,
      TOOL_DEFINITIONS.map((tool) => tool.name),
    ),
    memories: '(memórias relevantes entram aqui)',
  });

  const insertPromptVariable = (name: string) => {
    const element = promptRef.current;
    const token = `{{${name}}}`;
    if (!element) {
      updateSettings({ systemPrompt: `${settings.systemPrompt} ${token}` });
      return;
    }
    const start = element.selectionStart ?? settings.systemPrompt.length;
    const end = element.selectionEnd ?? start;
    const next = `${settings.systemPrompt.slice(0, start)}${token}${settings.systemPrompt.slice(end)}`;
    updateSettings({ systemPrompt: next });
    requestAnimationFrame(() => {
      element.focus();
      element.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const toggleFallback = (id: string, checked: boolean) => {
    const current = settings.fallbackProviderIds || [];
    const next = checked
      ? [...current.filter((item) => item !== id), id]
      : current.filter((item) => item !== id);
    updateSettings({ fallbackProviderIds: next });
  };

  useEffect(() => {
    if (open) setExpandedProvider(settings.activeProviderId);
  }, [open, settings.activeProviderId]);

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title="Configurações"
      subtitle="Ajuste o núcleo, os modelos e os conectores do N2."
      size="xl"
      className="settings-modal"
    >
      <div className="settings-layout">
        <nav className="settings-nav">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                className={cn(activeTab === tab.id && 'is-active')}
                onClick={() => setActiveTab(tab.id)}
              >
                <Icon size={16} /> {tab.label}
              </button>
            );
          })}
          <div className="settings-nav-foot">
            <span>v{APP_VERSION}</span>
            <span>local-first</span>
          </div>
        </nav>

        <div className="settings-content">
          {activeTab === 'general' && (
            <div className="settings-section">
              <div className="section-heading">
                <div>
                  <h3>Geral</h3>
                  <p>Identidade, aparência e comportamento da interface.</p>
                </div>
              </div>
              <Field label="Seu nome" hint="Usado nas saudações e no contexto do agente.">
                <input
                  value={settings.userName}
                  onChange={(event) => updateSettings({ userName: event.target.value })}
                  placeholder="Como devo te chamar?"
                />
              </Field>
              <Field label="Tema">
                <Segmented
                  options={[
                    { value: 'dark', label: 'Escuro' },
                    { value: 'light', label: 'Claro' },
                    { value: 'system', label: 'Sistema' },
                  ]}
                  value={settings.theme}
                  onChange={(theme) => updateSettings({ theme })}
                />
              </Field>
              <Field label="Cor de destaque">
                <div className="accent-swatches">
                  {Object.entries(ACCENTS).map(([key, accent]) => (
                    <button
                      key={key}
                      type="button"
                      className={cn('accent-swatch', settings.accent === key && 'is-active')}
                      style={{ background: `hsl(${accent.hsl})` }}
                      title={accent.label}
                      aria-label={accent.label}
                      onClick={() => updateSettings({ accent: key })}
                    />
                  ))}
                </div>
              </Field>
              <Field label="Tamanho do texto">
                <Segmented
                  options={[
                    { value: 'sm', label: 'Compacto' },
                    { value: 'md', label: 'Padrão' },
                    { value: 'lg', label: 'Grande' },
                  ]}
                  value={settings.fontSize}
                  onChange={(fontSize) => updateSettings({ fontSize })}
                />
              </Field>
              <div className="toggle-stack">
                <Toggle
                  checked={settings.sendOnEnter}
                  onChange={(sendOnEnter) => updateSettings({ sendOnEnter })}
                  label="Enter envia"
                  description="Desligue para usar Ctrl+Enter e evitar envios acidentais."
                />
                <Toggle
                  checked={settings.voiceOutput}
                  onChange={(voiceOutput) => updateSettings({ voiceOutput })}
                  label="Voz"
                  description="Permite ler respostas em voz alta pelo botão de alto-falante."
                />
                <Toggle
                  checked={settings.reduceMotion}
                  onChange={(reduceMotion) => updateSettings({ reduceMotion })}
                  label="Reduzir animações"
                  description="Desativa transições e efeitos de movimento."
                />
              </div>
              <Field
                label="Conexão com os modelos"
                hint={
                  connectionMode === 'bridge'
                    ? 'Todo o tráfego passa pelo bridge (local ou Proxy URL). É o único caminho para GitHub Models.'
                    : connectionMode === 'direct'
                      ? 'As requisições saem direto do navegador. Funciona com OpenAI, Anthropic, Gemini e Ollama que permitam CORS.'
                      : resolvedConnection === 'bridge'
                        ? 'Automático: com bridge disponível (local ou Proxy URL), o tráfego passa por ele.'
                        : 'Automático: sem bridge nesta página, as chamadas saem direto do navegador (o provedor precisa permitir CORS).'
                }
              >
                <Segmented
                  options={[
                    { value: 'auto', label: 'Automático' },
                    { value: 'bridge', label: 'Bridge' },
                    { value: 'direct', label: 'Direto' },
                  ]}
                  value={connectionMode}
                  onChange={(connectionMode) => updateSettings({ connectionMode })}
                />
              </Field>
              <Field
                label="Proxy / bridge"
                hint="Deixe vazio para usar o bridge embutido (app completo). Na versão web, cole aqui a URL do bridge no Codespaces ou de outro proxy seu."
              >
                <input
                  value={settings.proxyUrl}
                  spellCheck={false}
                  onChange={(event) => updateSettings({ proxyUrl: event.target.value })}
                  placeholder="https://seu-proxy.exemplo.com"
                />
              </Field>
              <div className="row-actions">
                <a
                  className="btn btn-ghost btn-sm"
                  href={CODESPACES_URL}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink size={14} /> Abrir bridge gratuito no Codespaces
                </a>
              </div>
              <Field
                label="Token do proxy"
                hint="Opcional. Use o mesmo valor de N2_PROXY_TOKEN no servidor para proteger um bridge remoto."
              >
                <input
                  type="password"
                  value={settings.proxyToken}
                  spellCheck={false}
                  onChange={(event) => updateSettings({ proxyToken: event.target.value })}
                  placeholder="somente se o proxy exigir"
                />
              </Field>
            </div>
          )}

          {activeTab === 'providers' && (
            <div className="settings-section">
              <div className="section-heading">
                <div>
                  <h3>Provedores de IA</h3>
                  <p>O N2 fala com qualquer API compatível com OpenAI, além de Anthropic, Gemini e Ollama.</p>
                </div>
              </div>
              <div className="provider-list">
                {settings.providers.map((item) => (
                  <ProviderCard
                    key={item.id}
                    provider={item}
                    active={item.id === settings.activeProviderId}
                    expanded={expandedProvider === item.id}
                    onExpand={() => setExpandedProvider(expandedProvider === item.id ? null : item.id)}
                  />
                ))}
              </div>
              <div className="settings-note">
                <Shield size={15} />
                <span>
                  As chaves ficam no seu dispositivo. O bridge local encaminha as requisições sem
                  registrar headers de autorização.
                </span>
              </div>
            </div>
          )}

          {activeTab === 'agent' && (
            <div className="settings-section">
              <div className="section-heading">
                <div>
                  <h3>Agente</h3>
                  <p>Instruções, criatividade, memória e uso de ferramentas.</p>
                </div>
              </div>
              <Field
                label="Prompt do sistema"
                hint="Use variáveis como {{user}} e {{date}}; elas são resolvidas em cada execução."
              >
                <textarea
                  ref={promptRef}
                  rows={9}
                  value={settings.systemPrompt}
                  onChange={(event) => updateSettings({ systemPrompt: event.target.value })}
                />
              </Field>
              <div className="prompt-vars">
                {PROMPT_VARIABLES.map((variable) => (
                  <button
                    key={variable.name}
                    type="button"
                    className="prompt-var"
                    title={variable.hint}
                    onClick={() => insertPromptVariable(variable.name)}
                  >
                    {`{{${variable.name}}}`}
                  </button>
                ))}
              </div>
              <div className="prompt-preview">
                <div className="prompt-preview-head">
                  <span>Prévia com o contexto atual</span>
                  <small>memórias e ferramentas são resolvidas na execução</small>
                </div>
                <pre>{promptPreview}</pre>
              </div>
              <div className="row-actions">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => updateSettings({ systemPrompt: DEFAULT_SYSTEM_PROMPT })}
                >
                  Restaurar prompt padrão
                </button>
              </div>
              <div className="field-grid">
                <Field label={`Temperatura: ${settings.temperature.toFixed(2)}`}>
                  <input
                    type="range"
                    min="0"
                    max="1.5"
                    step="0.05"
                    value={settings.temperature}
                    onChange={(event) => updateSettings({ temperature: Number(event.target.value) })}
                  />
                </Field>
                <Field label="Máximo de tokens" hint="Limite da resposta por etapa.">
                  <input
                    type="number"
                    min="128"
                    max="32768"
                    step="128"
                    value={settings.maxTokens}
                    onChange={(event) =>
                      updateSettings({ maxTokens: Math.max(128, Number(event.target.value) || 4096) })
                    }
                  />
                </Field>
              </div>
              <div className="toggle-stack">
                <Toggle
                  checked={settings.agentMode}
                  onChange={(agentMode) => updateSettings({ agentMode })}
                  label="Modo agente"
                  description="Permite que o modelo pesquise, calcule, leia o GitHub, use memória e chame conectores."
                />
                <Toggle
                  checked={settings.memoryEnabled}
                  onChange={(memoryEnabled) => updateSettings({ memoryEnabled })}
                  label="Memória de longo prazo"
                  description="Injeta memórias relevantes no contexto e permite que o agente salve fatos."
                />
                <Toggle
                  checked={settings.autoTitle}
                  onChange={(autoTitle) => updateSettings({ autoTitle })}
                  label="Títulos automáticos"
                  description="Gera o título da conversa a partir da primeira mensagem."
                />
              </div>

              <div className="settings-subhead">
                <h4>Busca semântica (RAG local)</h4>
                <p>
                  Indexa as memórias com embeddings do Ollama ou de uma API compatível com OpenAI.
                  Sem embeddings disponíveis, a busca lexical continua funcionando.
                </p>
              </div>
              <div className="toggle-stack">
                <Toggle
                  checked={settings.ragEnabled}
                  onChange={(ragEnabled) => updateSettings({ ragEnabled })}
                  label="Usar embeddings nas memórias"
                  description="Consulta o provedor de embeddings ao buscar memórias. Os vetores ficam no IndexedDB."
                />
              </div>
              <div className="field-grid">
                <Field label="Provedor de embeddings">
                  <select
                    value={settings.embeddingsProviderId}
                    onChange={(event) =>
                      updateSettings({ embeddingsProviderId: event.target.value })
                    }
                  >
                    {settings.providers
                      .filter((item) => embeddingsSupported(item))
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field
                  label="Modelo de embeddings"
                  hint="Ollama: nomic-embed-text. OpenAI: text-embedding-3-small."
                >
                  <input
                    value={settings.embeddingsModel}
                    spellCheck={false}
                    onChange={(event) =>
                      updateSettings({ embeddingsModel: event.target.value })
                    }
                    placeholder="nomic-embed-text"
                  />
                </Field>
              </div>

              <div className="settings-subhead">
                <h4>Fallback de provedores</h4>
                <p>
                  Se o provedor ativo falhar antes de produzir texto, o N2 tenta os selecionados
                  na ordem abaixo. O provedor precisa estar ativo e com chave configurada.
                </p>
              </div>
              <div className="fallback-list">
                {fallbackCandidates.map((item) => {
                  const position = fallbackIds.indexOf(item.id);
                  return (
                    <label
                      key={item.id}
                      className={cn('fallback-item', position >= 0 && 'is-on')}
                    >
                      <input
                        type="checkbox"
                        checked={position >= 0}
                        onChange={(event) => toggleFallback(item.id, event.target.checked)}
                      />
                      <span className="fallback-copy">
                        <strong>{item.name}</strong>
                        <small>
                          {item.model} · {item.enabled ? 'ativo' : 'desativado'}
                          {item.kind !== 'ollama' && !item.apiKey.trim() ? ' · sem chave' : ''}
                        </small>
                      </span>
                      {position >= 0 && <span className="tag">#{position + 1}</span>}
                    </label>
                  );
                })}
              </div>
              <div className="settings-note">
                <Sparkles size={15} />
                <span>
                  O agente executa até 8 etapas de ferramentas por mensagem. Você pode interromper a
                  qualquer momento pelo botão de parar.
                </span>
              </div>
            </div>
          )}

          {activeTab === 'routines' && <RoutinesTab />}
          {activeTab === 'usage' && <UsageTab />}
          {activeTab === 'connectors' && <ConnectorsTab />}
          {activeTab === 'data' && <DataTab />}

          {activeTab === 'about' && (
            <div className="settings-section about-section">
              <div className="about-hero">
                <Logo size={54} />
                <div>
                  <h3>N2</h3>
                  <p>Núcleo de Inteligência · v{APP_VERSION}</p>
                </div>
              </div>
              <p>
                Um workbench de IA local-first com chat, agentes, memória, voz e conectores.
                Construído para ser seu: código aberto, dados no seu dispositivo e liberdade para
                escolher o modelo.
              </p>
              <div className="about-links">
                <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
                  <Github size={16} /> GitHub <ExternalLink size={13} />
                </a>
                <a
                  href={`${REPO_URL}/blob/main/docs/ROADMAP.md`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Palette size={16} /> Roadmap <ExternalLink size={13} />
                </a>
                <a
                  href={`${REPO_URL}/tree/main/docs`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <SlidersHorizontal size={16} /> Documentação <ExternalLink size={13} />
                </a>
              </div>
              <div className="settings-note">
                <Shield size={15} />
                <span>
                  N2 não coleta telemetria. As mensagens vão apenas para o provedor que você
                  configurar. Verifique os termos e a política de privacidade de cada provedor.
                </span>
              </div>
              <div className="settings-note">
                <Volume2 size={15} />
                <span>
                  Voz usa as APIs nativas do navegador (Web Speech). A disponibilidade varia por
                  navegador e sistema.
                </span>
              </div>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={() => {
                  if (confirm('Restaurar as configurações padrão? Conversas e memórias serão mantidas.')) {
                    updateSettings({
                      theme: 'dark',
                      accent: 'violet',
                      fontSize: 'md',
                      agentMode: true,
                      memoryEnabled: true,
                      sendOnEnter: true,
                      voiceOutput: false,
                      reduceMotion: false,
                      autoTitle: true,
                      systemPrompt: DEFAULT_SYSTEM_PROMPT,
                      temperature: 0.7,
                      maxTokens: 4096,
                      proxyUrl: '',
                      connectionMode: 'auto',
                      fallbackProviderIds: [],
                      ragEnabled: false,
                      embeddingsProviderId: 'ollama',
                      embeddingsModel: 'nomic-embed-text',
                    });
                    showToast('Configurações restauradas.', 'info');
                  }
                }}
              >
                Restaurar padrões
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="settings-footer">
        <span>
          {provider.name} · {provider.model}
        </span>
        <div className="row-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void exportData()}>
            <Download size={14} /> Backup
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setActiveProvider(provider.id)}>
            <Check size={14} /> Provedor atual
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen(false)}>
            Concluir
          </button>
        </div>
      </div>
    </Modal>
  );
}

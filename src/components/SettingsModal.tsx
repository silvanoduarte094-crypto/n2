import { useEffect, useRef, useState } from 'react';
import {
  Cable,
  Check,
  Database,
  Download,
  Eye,
  EyeOff,
  ExternalLink,
  Github,
  Info,
  KeyRound,
  Loader2,
  Palette,
  Plus,
  Shield,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Upload,
  User,
  Volume2,
} from 'lucide-react';
import { useStore, type SettingsTab } from '../store/useStore';
import {
  ACCENTS,
  APP_VERSION,
  DEFAULT_SYSTEM_PROMPT,
  getProvider,
} from '../config';
import type { Connector, Provider } from '../types';
import { testProvider } from '../lib/providers/test';
import { cn, formatBytes, uid } from '../lib/utils';
import { Field, IconButton, Modal, Segmented, Spinner, Toggle } from './ui';
import { Logo } from './Logo';

const TABS: { id: SettingsTab; label: string; icon: typeof User }[] = [
  { id: 'general', label: 'Geral', icon: User },
  { id: 'providers', label: 'Provedores', icon: KeyRound },
  { id: 'agent', label: 'Agente', icon: Sparkles },
  { id: 'connectors', label: 'Conectores', icon: Cable },
  { id: 'data', label: 'Dados', icon: Database },
  { id: 'about', label: 'Sobre', icon: Info },
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
  const [draft, setDraft] = useState<Connector>(initial);

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
      <Toggle
        checked={draft.enabled}
        onChange={(enabled) => setDraft({ ...draft, enabled })}
        label="Conector ativo"
      />
      <div className="form-actions">
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
  const fileRef = useRef<HTMLInputElement>(null);
  const [usage, setUsage] = useState<{ usage?: number; quota?: number }>({});

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
  const provider = getProvider(settings);

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
                label="Proxy / bridge"
                hint="Deixe vazio para usar o bridge local. Em GitHub Pages, informe a URL do seu proxy."
              >
                <input
                  value={settings.proxyUrl}
                  spellCheck={false}
                  onChange={(event) => updateSettings({ proxyUrl: event.target.value })}
                  placeholder="https://seu-proxy.exemplo.com"
                />
              </Field>
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
              <Field label="Prompt do sistema" hint="Estas instruções acompanham todas as conversas.">
                <textarea
                  rows={9}
                  value={settings.systemPrompt}
                  onChange={(event) => updateSettings({ systemPrompt: event.target.value })}
                />
              </Field>
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
              <div className="settings-note">
                <Sparkles size={15} />
                <span>
                  O agente executa até 8 etapas de ferramentas por mensagem. Você pode interromper a
                  qualquer momento pelo botão de parar.
                </span>
              </div>
            </div>
          )}

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
                <a href="https://github.com" target="_blank" rel="noopener noreferrer">
                  <Github size={16} /> GitHub <ExternalLink size={13} />
                </a>
                <a href="https://github.com" target="_blank" rel="noopener noreferrer">
                  <Palette size={16} /> Roadmap <ExternalLink size={13} />
                </a>
                <a href="https://github.com" target="_blank" rel="noopener noreferrer">
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

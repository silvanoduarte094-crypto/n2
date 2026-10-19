import { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Brain,
  Check,
  Github,
  KeyRound,
  Sparkles,
  Wrench,
  Zap,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import type { Provider } from '../types';
import { cn } from '../lib/utils';
import { Logo } from './Logo';
import { Field, Toggle } from './ui';

export function Onboarding() {
  const settings = useStore((state) => state.settings);
  const updateSettings = useStore((state) => state.updateSettings);
  const [step, setStep] = useState(0);
  const [name, setName] = useState(settings.userName);
  const [selectedId, setSelectedId] = useState(settings.activeProviderId);
  const [apiKey, setApiKey] = useState(
    settings.providers.find((provider) => provider.id === settings.activeProviderId)?.apiKey || '',
  );
  const [model, setModel] = useState(
    settings.providers.find((provider) => provider.id === settings.activeProviderId)?.model || '',
  );
  const [baseUrl, setBaseUrl] = useState(
    settings.providers.find((provider) => provider.id === settings.activeProviderId)?.baseUrl || '',
  );
  const [agentMode, setAgentMode] = useState(true);
  const [memoryEnabled, setMemoryEnabled] = useState(true);

  const selected = settings.providers.find((provider) => provider.id === selectedId) || settings.providers[0];
  const isLocal = selected.kind === 'ollama';
  const ready = isLocal || apiKey.trim().length > 0;

  const chooseProvider = (provider: Provider) => {
    setSelectedId(provider.id);
    setApiKey(provider.apiKey);
    setModel(provider.model);
    setBaseUrl(provider.baseUrl);
  };

  const finish = () => {
    const providers = settings.providers.map((provider) =>
      provider.id === selected.id
        ? { ...provider, apiKey: apiKey.trim(), model: model.trim() || provider.model, baseUrl: baseUrl.trim() || provider.baseUrl }
        : provider,
    );
    updateSettings({
      userName: name.trim(),
      providers,
      activeProviderId: selected.id,
      agentMode,
      memoryEnabled,
      onboardingComplete: true,
    });
  };

  const skip = () => {
    updateSettings({ onboardingComplete: true, userName: name.trim() });
  };

  return (
    <div className="onboarding">
      <div className="onboarding-bg" />
      <div className="onboarding-card">
        <header className="onboarding-head">
          <Logo size={38} />
          <div className="onboarding-progress">
            {[0, 1, 2].map((index) => (
              <span key={index} className={cn(index <= step && 'is-on')} />
            ))}
          </div>
          <button type="button" className="link-btn" onClick={skip}>
            Pular
          </button>
        </header>

        {step === 0 && (
          <div className="onboarding-step">
            <span className="onboarding-kicker">Bem-vindo</span>
            <h1>
              Um núcleo de inteligência <span>feito para você.</span>
            </h1>
            <p className="onboarding-lead">
              O N2 conecta modelos de IA a ferramentas, memória e ao seu ecossistema. Sem telemetria,
              com os dados no seu dispositivo e liberdade para escolher o modelo.
            </p>
            <div className="feature-row">
              <div>
                <Sparkles size={18} />
                <strong>Agentes</strong>
                <span>Pesquisa, cálculo, GitHub e conectores</span>
              </div>
              <div>
                <Brain size={18} />
                <strong>Memória</strong>
                <span>Contexto durável entre conversas</span>
              </div>
              <div>
                <Wrench size={18} />
                <strong>Integrações</strong>
                <span>MYRKAVELL via REST, webhook ou MCP</span>
              </div>
            </div>
            <Field label="Como devo te chamar?" hint="Opcional. Você pode mudar depois.">
              <input
                value={name}
                autoFocus
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') setStep(1);
                }}
                placeholder="Seu nome"
              />
            </Field>
            <div className="onboarding-actions">
              <span className="onboarding-hint">Leva menos de um minuto.</span>
              <button type="button" className="btn btn-primary" onClick={() => setStep(1)}>
                Começar <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="onboarding-step">
            <span className="onboarding-kicker">Conecte a IA</span>
            <h1>
              Escolha o <span>cérebro.</span>
            </h1>
            <p className="onboarding-lead">
              O N2 é agnóstico. Comece com GitHub Models (uma conta GitHub basta) ou use sua chave
              da OpenAI, Anthropic, Gemini — ou rode local com Ollama.
            </p>
            <div className="provider-choice-grid">
              {settings.providers
                .filter((provider) => provider.enabled)
                .map((provider) => (
                  <button
                    key={provider.id}
                    type="button"
                    className={cn('provider-choice', provider.id === selectedId && 'is-selected')}
                    onClick={() => chooseProvider(provider)}
                  >
                    <span className="provider-choice-icon">
                      {provider.id === 'github' ? <Github size={19} /> : <Zap size={19} />}
                    </span>
                    <strong>{provider.name}</strong>
                    <small>{provider.kind === 'ollama' ? 'local' : provider.kind}</small>
                    {provider.id === selectedId && <Check size={15} className="provider-check" />}
                  </button>
                ))}
            </div>

            <div className="onboarding-provider-form">
              {selected.id === 'github' && (
                <div className="inline-tip">
                  <KeyRound size={16} />
                  <span>
                    Crie um token em{' '}
                    <a href="https://github.com/settings/tokens" target="_blank" rel="noopener noreferrer">
                      github.com/settings/tokens
                    </a>{' '}
                    com a permissão <code>models:read</code>. Cole abaixo.
                  </span>
                </div>
              )}
              <Field label="Base URL">
                <input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} spellCheck={false} />
              </Field>
              <div className="field-grid">
                <Field label="API key" hint={isLocal ? 'Ollama local não exige chave.' : 'Salva apenas neste dispositivo.'}>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                    placeholder={isLocal ? 'ollama' : 'Cole sua chave/token'}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </Field>
                <Field label="Modelo">
                  <input value={model} onChange={(event) => setModel(event.target.value)} spellCheck={false} />
                </Field>
              </div>
              {!ready && (
                <p className="form-warning">
                  Você pode pular e configurar depois, mas o chat só funciona após uma chave válida.
                </p>
              )}
            </div>

            <div className="onboarding-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setStep(0)}>
                <ArrowLeft size={15} /> Voltar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setStep(2)}
                disabled={!ready}
              >
                Continuar <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="onboarding-step">
            <span className="onboarding-kicker">Quase lá</span>
            <h1>
              Do seu jeito. <span>Do seu lado.</span>
            </h1>
            <p className="onboarding-lead">
              Ative os recursos que quiser. Você pode mudar tudo nas configurações a qualquer momento.
            </p>
            <div className="onboarding-summary">
              <div>
                <span>Provedor</span>
                <strong>{selected.name}</strong>
              </div>
              <div>
                <span>Modelo</span>
                <strong>{model || selected.model}</strong>
              </div>
              <div>
                <span>Dados</span>
                <strong>Local-first</strong>
              </div>
            </div>
            <div className="toggle-stack onboarding-toggles">
              <Toggle
                checked={agentMode}
                onChange={setAgentMode}
                label="Ativar modo agente"
                description="Ferramentas, pesquisa, GitHub e conectores."
              />
              <Toggle
                checked={memoryEnabled}
                onChange={setMemoryEnabled}
                label="Ativar memória"
                description="O N2 lembra de fatos importantes entre conversas."
              />
            </div>
            <div className="onboarding-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setStep(1)}>
                <ArrowLeft size={15} /> Voltar
              </button>
              <button type="button" className="btn btn-primary" onClick={finish}>
                Entrar no N2 <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
      <p className="onboarding-foot">
        N2 v0.1 · código aberto · MIT · seus dados ficam com você
      </p>
    </div>
  );
}

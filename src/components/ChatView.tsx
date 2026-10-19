import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUpRight, KeyRound, Sparkles } from 'lucide-react';
import { useStore } from '../store/useStore';
import { getProvider, STARTER_PROMPTS } from '../config';
import { cn } from '../lib/utils';
import { MessageBubble } from './MessageBubble';
import { Logo } from './Logo';

export function ChatView() {
  const sessions = useStore((state) => state.sessions);
  const activeSessionId = useStore((state) => state.activeSessionId);
  const streaming = useStore((state) => state.streaming);
  const status = useStore((state) => state.status);
  const settings = useStore((state) => state.settings);
  const sendMessage = useStore((state) => state.sendMessage);
  const regenerate = useStore((state) => state.regenerate);
  const deleteMessage = useStore((state) => state.deleteMessage);
  const addMemory = useStore((state) => state.addMemory);
  const showToast = useStore((state) => state.showToast);
  const setSettingsOpen = useStore((state) => state.setSettingsOpen);

  const session = sessions.find((item) => item.id === activeSessionId);
  const messages = session?.messages || [];
  const provider = getProvider(settings);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  const lastMessage = messages[messages.length - 1];
  const scrollKey = `${messages.length}:${lastMessage?.content.length || 0}:${lastMessage?.toolCalls?.length || 0}`;

  useEffect(() => {
    if (!atBottom) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [scrollKey, atBottom, status]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 120);
  };

  const scrollToBottom = () => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    setAtBottom(true);
  };

  const lastAssistantId = [...messages].reverse().find((message) => message.role === 'assistant')?.id;
  const missingKey = provider.kind !== 'ollama' && !provider.apiKey.trim();

  return (
    <div className="chat-area">
      <div className="chat-scroll" ref={scrollRef} onScroll={onScroll}>
        {!messages.length ? (
          <section className="hero">
            <div className="hero-glow" />
            <div className="hero-logo">
              <Logo size={58} />
            </div>
            <div className="hero-badge">
              <Sparkles size={13} />
              {provider.name} · {provider.model}
            </div>
            <h1>
              O que vamos <span>construir</span> hoje?
            </h1>
            <p className="hero-sub">
              Um núcleo de inteligência local-first com agentes, memória, voz e conectores.
              Pergunte, planeje, pesquise ou coloque a mão na massa.
            </p>

            {missingKey && (
              <button type="button" className="setup-banner" onClick={() => setSettingsOpen(true)}>
                <KeyRound size={18} />
                <span>
                  <strong>Conecte sua IA</strong>
                  Configure uma API key para ativar o {provider.name}.
                </span>
                <ArrowUpRight size={16} />
              </button>
            )}

            <div className="starter-grid">
              {STARTER_PROMPTS.map((prompt, index) => (
                <button
                  key={prompt.title}
                  type="button"
                  className="starter-card"
                  onClick={() => void sendMessage(prompt.text)}
                  style={{ animationDelay: `${index * 60}ms` }}
                >
                  <span className="starter-icon">
                    {index === 0 ? '◇' : index === 1 ? '⌘' : index === 2 ? '◎' : '↯'}
                  </span>
                  <strong>{prompt.title}</strong>
                  <span>{prompt.text}</span>
                </button>
              ))}
            </div>
            <p className="hero-foot">
              Local-first por padrão. Suas conversas ficam neste dispositivo; apenas as mensagens
              necessárias são enviadas ao provedor escolhido.
            </p>
          </section>
        ) : (
          <div className="messages">
            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                streaming={streaming && message.id === lastMessage?.id}
                isLastAssistant={message.id === lastAssistantId}
                onRegenerate={() => void regenerate()}
                onDelete={() => {
                  if (!session) return;
                  if (message.role === 'assistant' || confirm('Apagar esta mensagem?')) {
                    deleteMessage(session.id, message.id);
                  }
                }}
                onSaveMemory={async (text) => {
                  await addMemory(text.slice(0, 1800), ['chat'], session?.id);
                  showToast('Salvo na memória de longo prazo.', 'success');
                }}
              />
            ))}
            {streaming && (
              <div className={cn('stream-status', !status && 'is-hidden')}>
                <span className="stream-dot" />
                {status || 'Gerando…'}
              </div>
            )}
            <div className="chat-end">N2 pode cometer erros. Verifique informações importantes.</div>
          </div>
        )}
      </div>

      {!atBottom && messages.length > 0 && (
        <button type="button" className="scroll-bottom" onClick={scrollToBottom} aria-label="Ir para o fim">
          <ArrowDown size={16} />
        </button>
      )}
    </div>
  );
}

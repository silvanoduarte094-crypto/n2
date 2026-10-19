import { useState } from 'react';
import {
  Check,
  ChevronDown,
  Copy,
  Loader2,
  RotateCcw,
  Sparkles,
  Square,
  Trash2,
  Volume2,
  Wrench,
  X,
} from 'lucide-react';
import type { Message, ToolCall } from '../types';
import { cn, copyText, formatBytes, formatTime, getInitials, truncate } from '../lib/utils';
import { Markdown } from './Markdown';
import { Logo } from './Logo';

function ToolCard({ call }: { call: ToolCall }) {
  const [open, setOpen] = useState(false);
  const statusIcon =
    call.status === 'running' || call.status === 'pending' ? (
      <Loader2 size={14} className="spin" />
    ) : call.status === 'error' ? (
      <X size={14} />
    ) : (
      <Check size={14} />
    );
  let prettyResult = call.result || '';
  try {
    prettyResult = JSON.stringify(JSON.parse(call.result || ''), null, 2);
  } catch {
    // Keep plain text.
  }
  let prettyArgs = call.arguments || '{}';
  try {
    prettyArgs = JSON.stringify(JSON.parse(call.arguments || '{}'), null, 2);
  } catch {
    // Keep plain text.
  }
  return (
    <div className={cn('tool-card', `tool-${call.status}`)}>
      <button type="button" className="tool-head" onClick={() => setOpen((value) => !value)}>
        <span className="tool-icon">
          <Wrench size={14} />
        </span>
        <span className="tool-name">{call.name}</span>
        <span className="tool-status">
          {statusIcon}
          {call.status === 'running' ? 'executando' : call.status === 'error' ? 'falhou' : call.status === 'done' ? `${call.durationMs || 0} ms` : 'na fila'}
        </span>
        <ChevronDown size={15} className={cn('tool-chevron', open && 'is-open')} />
      </button>
      {open && (
        <div className="tool-detail">
          <div>
            <span className="tool-label">Argumentos</span>
            <pre>{prettyArgs}</pre>
          </div>
          {call.result && (
            <div>
              <span className="tool-label">Resultado</span>
              <pre>{truncate(prettyResult, 4000)}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Typing() {
  return (
    <div className="typing" aria-label="Gerando resposta">
      <span />
      <span />
      <span />
    </div>
  );
}

export function MessageBubble({
  message,
  streaming,
  isLastAssistant,
  onRegenerate,
  onDelete,
  onSaveMemory,
}: {
  message: Message;
  streaming: boolean;
  isLastAssistant: boolean;
  onRegenerate: () => void;
  onDelete: () => void;
  onSaveMemory: (text: string) => void;
}) {
  const [speaking, setSpeaking] = useState(false);
  const isUser = message.role === 'user';
  const showTyping = streaming && !message.content && !message.toolCalls?.length;

  const copy = async () => {
    await copyText(message.content);
  };

  const speak = () => {
    if (!('speechSynthesis' in window)) return;
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(message.content.replace(/[#*`>]/g, ''));
    utterance.lang = 'pt-BR';
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  return (
    <div className={cn('message-row', isUser ? 'is-user' : 'is-assistant', message.error && 'is-error')}>
      {!isUser && (
        <div className="avatar assistant-avatar">
          <Logo size={24} />
        </div>
      )}
      <div className="message-main">
        <div className="message-meta">
          <span>{isUser ? 'Você' : 'N2'}</span>
          {!isUser && message.model && <span className="meta-model">{message.model}</span>}
          <span className="meta-time">{formatTime(message.createdAt)}</span>
          {message.error && <span className="meta-error">erro</span>}
        </div>

        {!!message.attachments?.length && (
          <div className="attachment-list">
            {message.attachments.map((attachment) =>
              attachment.dataUrl && attachment.mime.startsWith('image/') ? (
                <figure key={attachment.id} className="attachment-image">
                  <img src={attachment.dataUrl} alt={attachment.name} />
                  <figcaption>{attachment.name}</figcaption>
                </figure>
              ) : (
                <div key={attachment.id} className="attachment-chip">
                  <span className="attachment-name">{attachment.name}</span>
                  <span className="attachment-size">{formatBytes(attachment.size)}</span>
                </div>
              ),
            )}
          </div>
        )}

        {message.reasoning && !isUser && (
          <details className="reasoning-block">
            <summary>
              <Sparkles size={13} /> Raciocínio
            </summary>
            <pre>{message.reasoning}</pre>
          </details>
        )}

        {isUser ? (
          message.content && <div className="user-text">{message.content}</div>
        ) : (
          <>
            {message.content && <Markdown content={message.content} />}
            {showTyping && <Typing />}
          </>
        )}

        {!isUser && !!message.toolCalls?.length && (
          <div className="tool-list">
            {message.toolCalls.map((call) => (
              <ToolCard key={call.id} call={call} />
            ))}
          </div>
        )}

        {!isUser && message.usage && (
          <div className="usage-line">
            {message.usage.totalTokens
              ? `${message.usage.totalTokens.toLocaleString('pt-BR')} tokens`
              : [message.usage.promptTokens, message.usage.completionTokens].filter(Boolean).join(' + ') + ' tokens'}
          </div>
        )}

        {!isUser && message.content && (
          <div className="message-actions">
            <button type="button" onClick={copy} title="Copiar">
              <Copy size={14} />
            </button>
            <button type="button" onClick={speak} title={speaking ? 'Parar leitura' : 'Ler em voz alta'}>
              {speaking ? <Square size={13} /> : <Volume2 size={14} />}
            </button>
            {isLastAssistant && !streaming && (
              <button type="button" onClick={onRegenerate} title="Gerar novamente">
                <RotateCcw size={14} />
              </button>
            )}
            <button
              type="button"
              onClick={() => onSaveMemory(message.content)}
              title="Salvar na memória"
            >
              <Sparkles size={14} />
            </button>
            <button type="button" onClick={onDelete} title="Apagar mensagem" className="danger-hover">
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>
      {isUser && <div className="avatar user-avatar">{getInitials('Você')}</div>}
    </div>
  );
}

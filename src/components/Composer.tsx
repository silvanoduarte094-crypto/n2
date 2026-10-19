import { useEffect, useRef, useState } from 'react';
import {
  ArrowUp,
  Bot,
  FileText,
  Image as ImageIcon,
  Mic,
  MicOff,
  Paperclip,
  Square,
  X,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { getProvider } from '../config';
import type { Attachment } from '../types';
import { cn, estimateTokens, formatBytes, uid } from '../lib/utils';

const MAX_IMAGE = 8 * 1024 * 1024;
const MAX_TEXT = 1.2 * 1024 * 1024;

export function Composer() {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [listening, setListening] = useState(false);
  const [dragging, setDragging] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  const streaming = useStore((state) => state.streaming);
  const sendMessage = useStore((state) => state.sendMessage);
  const stop = useStore((state) => state.stop);
  const settings = useStore((state) => state.settings);
  const updateSettings = useStore((state) => state.updateSettings);
  const showToast = useStore((state) => state.showToast);
  const provider = getProvider(settings);
  const missingKey = provider.kind !== 'ollama' && !provider.apiKey.trim();

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [text]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop?.();
    };
  }, []);

  const addFiles = async (files: FileList | File[]) => {
    const list = Array.from(files).slice(0, 6);
    const next: Attachment[] = [];
    for (const file of list) {
      if (file.type.startsWith('image/')) {
        if (file.size > MAX_IMAGE) {
          showToast(`${file.name} é grande demais (máx. 8 MB).`, 'error');
          continue;
        }
        const dataUrl = await readAsDataUrl(file);
        next.push({ id: uid('a_'), name: file.name, mime: file.type, size: file.size, dataUrl });
      } else if (
        file.type.startsWith('text/') ||
        /\.(md|txt|json|ts|tsx|js|jsx|css|html|py|rs|go|java|c|cpp|h|yml|yaml|toml|xml|csv|sql)$/i.test(
          file.name,
        )
      ) {
        if (file.size > MAX_TEXT) {
          showToast(`${file.name} é grande demais (máx. 1,2 MB).`, 'error');
          continue;
        }
        const content = await file.text();
        next.push({ id: uid('a_'), name: file.name, mime: file.type || 'text/plain', size: file.size, text: content });
      } else {
        showToast(`Tipo não suportado: ${file.name}.`, 'error');
      }
    }
    if (next.length) setAttachments((current) => [...current, ...next].slice(0, 8));
  };

  const startListening = () => {
    if (listening) {
      recognitionRef.current?.stop?.();
      setListening(false);
      return;
    }
    const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Ctor) {
      showToast('Reconhecimento de voz não é suportado neste navegador.', 'error');
      return;
    }
    const recognition = new Ctor();
    recognition.lang = 'pt-BR';
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onresult = (event: any) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        transcript += event.results[i][0].transcript;
      }
      setText((current) => `${current}${current ? ' ' : ''}${transcript}`.trimStart());
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => {
      setListening(false);
      showToast('Não consegui captar o microfone.', 'error');
    };
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  };

  const submit = async () => {
    if (streaming) {
      stop();
      return;
    }
    const clean = text.trim();
    if (!clean && !attachments.length) return;
    setText('');
    setAttachments([]);
    await sendMessage(clean, attachments);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void submit();
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey && settings.sendOnEnter) {
      event.preventDefault();
      void submit();
    }
  };

  const tokens = estimateTokens(text) + attachments.reduce((sum, item) => sum + estimateTokens(item.text || ''), 0);

  return (
    <div className="composer-wrap">
      <div
        className={cn('composer', dragging && 'is-dragging', streaming && 'is-streaming')}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (event.dataTransfer.files.length) void addFiles(event.dataTransfer.files);
        }}
      >
        {!!attachments.length && (
          <div className="composer-attachments">
            {attachments.map((attachment) => (
              <div key={attachment.id} className="composer-attachment">
                {attachment.dataUrl && attachment.mime.startsWith('image/') ? (
                  <img src={attachment.dataUrl} alt={attachment.name} />
                ) : (
                  <FileText size={15} />
                )}
                <span>{attachment.name}</span>
                <small>{formatBytes(attachment.size)}</small>
                <button
                  type="button"
                  aria-label={`Remover ${attachment.name}`}
                  onClick={() => setAttachments((current) => current.filter((item) => item.id !== attachment.id))}
                >
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={text}
          rows={1}
          placeholder={
            missingKey
              ? 'Configure sua API key nas configurações para começar…'
              : 'Pergunte, planeje, pesquise ou peça para executar uma tarefa…'
          }
          aria-label="Mensagem"
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
          onPaste={(event) => {
            if (event.clipboardData.files.length) {
              event.preventDefault();
              void addFiles(event.clipboardData.files);
            }
          }}
        />

        <div className="composer-bar">
          <div className="composer-tools">
            <input
              ref={fileRef}
              type="file"
              multiple
              hidden
              accept="image/*,.md,.txt,.json,.ts,.tsx,.js,.jsx,.css,.html,.py,.rs,.go,.java,.c,.cpp,.h,.yml,.yaml,.toml,.xml,.csv,.sql"
              onChange={(event) => {
                if (event.target.files) void addFiles(event.target.files);
                event.target.value = '';
              }}
            />
            <button
              type="button"
              className="composer-tool"
              onClick={() => fileRef.current?.click()}
              title="Anexar arquivo"
            >
              <Paperclip size={17} />
            </button>
            <button
              type="button"
              className={cn('composer-tool', listening && 'is-active')}
              onClick={startListening}
              title={listening ? 'Parar microfone' : 'Falar'}
            >
              {listening ? <MicOff size={17} /> : <Mic size={17} />}
            </button>
            <button
              type="button"
              className={cn('composer-tool agent-pill', settings.agentMode && 'is-active')}
              onClick={() => updateSettings({ agentMode: !settings.agentMode })}
              title="Ativar/desativar agentes e ferramentas"
            >
              <Bot size={16} />
              <span>Agente</span>
            </button>
          </div>

          <div className="composer-right">
            <span className="composer-model" title={`${provider.name} · ${provider.model}`}>
              {provider.model.split('/').pop()}
            </span>
            {tokens > 0 && <span className="composer-tokens">~{tokens} tk</span>}
            <button
              type="button"
              className={cn('send-btn', streaming && 'is-stop')}
              onClick={() => void submit()}
              disabled={!streaming && !text.trim() && !attachments.length}
              title={streaming ? 'Parar' : 'Enviar (Enter)'}
            >
              {streaming ? <Square size={15} fill="currentColor" /> : <ArrowUp size={18} />}
            </button>
          </div>
        </div>
      </div>
      <div className="composer-foot">
        <span>
          {settings.sendOnEnter ? 'Enter envia · Shift+Enter nova linha' : 'Ctrl+Enter envia'}
          {' · '}
          <button type="button" className="link-btn" onClick={() => updateSettings({ agentMode: !settings.agentMode })}>
            {settings.agentMode ? 'agente ativo' : 'agente desligado'}
          </button>
        </span>
        <span className="composer-private">
          <ImageIcon size={12} /> local-first
        </span>
      </div>
    </div>
  );
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

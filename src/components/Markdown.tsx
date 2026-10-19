import { useMemo, useRef } from 'react';
import { marked, type Tokens } from 'marked';
import hljs from 'highlight.js/lib/common';
import DOMPurify from 'dompurify';
import { copyText } from '../lib/utils';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const renderer = new marked.Renderer();

renderer.code = ({ text, lang }: Tokens.Code) => {
  const language = (lang || '').trim().split(/\s+/)[0];
  let highlighted: string;
  try {
    highlighted =
      language && hljs.getLanguage(language)
        ? hljs.highlight(text, { language }).value
        : hljs.highlightAuto(text).value;
  } catch {
    highlighted = escapeHtml(text);
  }
  return `<div class="code-block"><div class="code-head"><span>${escapeHtml(
    language || 'texto',
  )}</span><button type="button" class="copy-code" data-code="${encodeURIComponent(
    text,
  )}">Copiar</button></div><pre><code class="hljs">${highlighted}</code></pre></div>`;
};

renderer.link = ({ href, title, text }: Tokens.Link) =>
  `<a href="${escapeHtml(href)}" title="${escapeHtml(
    title || '',
  )}" target="_blank" rel="noopener noreferrer">${text}</a>`;

marked.setOptions({
  gfm: true,
  breaks: true,
  renderer,
});

export function Markdown({ content, className }: { content: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const html = useMemo(() => {
    const raw = marked.parse(content || '', { async: false }) as string;
    return DOMPurify.sanitize(raw, {
      ADD_ATTR: ['target', 'data-code', 'rel'],
      USE_PROFILES: { html: true },
    });
  }, [content]);

  return (
    <div
      ref={ref}
      className={`markdown ${className || ''}`}
      onClick={async (event) => {
        const target = (event.target as HTMLElement).closest('.copy-code') as HTMLButtonElement | null;
        if (!target) return;
        const raw = target.dataset.code || '';
        const ok = await copyText(decodeURIComponent(raw));
        target.textContent = ok ? 'Copiado!' : 'Falhou';
        setTimeout(() => {
          target.textContent = 'Copiar';
        }, 1600);
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

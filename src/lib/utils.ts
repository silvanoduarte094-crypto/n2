import { clsx, type ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function uid(prefix = ''): string {
  const random = crypto.getRandomValues(new Uint8Array(9));
  const value = Array.from(random, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 14);
  return `${prefix}${Date.now().toString(36)}${value}`;
}

export function now(): number {
  return Date.now();
}

export function formatTime(ts: number): string {
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(ts);
}

export function formatDate(ts: number): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(ts);
}

export function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return 'agora';
  if (diff < hour) return `${Math.floor(diff / minute)} min`;
  if (diff < day) return `${Math.floor(diff / hour)} h`;
  if (diff < 7 * day) return `${Math.floor(diff / day)} d`;
  return formatDate(ts);
}

export function truncate(text: string, max = 80): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 3.8);
}

export function titleFromText(text: string, max = 44): string {
  const clean = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*_`~[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return 'Novo chat';
  const first = clean.split(/(?<=[.!?])\s/)[0] || clean;
  return truncate(first, max);
}

export function parseJSONSafe<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function downloadFile(filename: string, content: string | Blob, mime = 'application/json') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    textarea.remove();
    return ok;
  }
}

export function debounce<T extends (...args: never[]) => void>(fn: T, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'N2';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function isMac(): boolean {
  return /Mac|iPhone|iPad/.test(navigator.platform);
}

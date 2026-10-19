import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { useStore } from '../store/useStore';
import { cn } from '../lib/utils';

export function ToastHost() {
  const toast = useStore((state) => state.toast);
  const clearToast = useStore((state) => state.clearToast);
  if (!toast) return null;
  const Icon = toast.type === 'success' ? CheckCircle2 : toast.type === 'error' ? AlertCircle : Info;
  return (
    <div className={cn('toast', `toast-${toast.type}`)} role="status">
      <Icon size={17} />
      <span>{toast.message}</span>
      <button type="button" onClick={clearToast} aria-label="Fechar aviso">
        <X size={14} />
      </button>
    </div>
  );
}

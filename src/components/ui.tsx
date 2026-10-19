import { useEffect, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '../lib/utils';

export function IconButton({
  label,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button type="button" className={cn('icon-btn', className)} title={label} aria-label={label} {...props}>
      {children}
    </button>
  );
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'md',
  className,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={cn('modal', `modal-${size}`, className)} role="dialog" aria-modal="true">
        {(title || subtitle) && (
          <header className="modal-header">
            <div>
              {title && <h2>{title}</h2>}
              {subtitle && <p>{subtitle}</p>}
            </div>
            <IconButton label="Fechar" onClick={onClose}>
              <X size={18} />
            </IconButton>
          </header>
        )}
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-footer">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <label className={cn('toggle-row', disabled && 'is-disabled')}>
      <span className="toggle-copy">
        <span className="toggle-label">{label}</span>
        {description && <span className="toggle-description">{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className={cn('switch', checked && 'is-on')}
        onClick={() => onChange(!checked)}
        disabled={disabled}
      >
        <span className="switch-thumb" />
      </button>
    </label>
  );
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn('field', className)}>
      {label && <span className="field-label">{label}</span>}
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function Spinner({ size = 16 }: { size?: number }) {
  return <span className="spinner" style={{ width: size, height: size }} aria-label="Carregando" />;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="segmented" role="tablist">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          className={cn('segment', value === option.value && 'is-active')}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

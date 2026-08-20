import { AlertCircle, ChevronDown, Inbox, LoaderCircle, X, type LucideIcon } from 'lucide-react';
import { useEffect, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react';
import { initials } from '../lib/format';

export function Button({ variant = 'primary', icon: Icon, children, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; icon?: LucideIcon }) {
  return <button className={`button button--${variant} ${className}`} {...props}>{Icon && <Icon size={16} aria-hidden="true" />}{children}</button>;
}

export function IconButton({ label, icon: Icon, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; icon: LucideIcon }) {
  return <button className={`icon-button ${className}`} aria-label={label} title={label} {...props}><Icon size={18} aria-hidden="true" /></button>;
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info'; children: ReactNode }) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}

export function Avatar({ name, online, size = 'md' }: { name: string; online?: boolean; size?: 'sm' | 'md' | 'lg' }) {
  return <span className={`avatar avatar--${size}`} aria-label={name}><span>{initials(name)}</span>{online !== undefined && <i className={online ? 'presence presence--online' : 'presence presence--offline'} aria-label={online ? 'В сети' : 'Не в сети'} />}</span>;
}

export function PageHeader({ title, description, action, children }: { title: string; description?: string; action?: ReactNode; children?: ReactNode }) {
  return <header className="page-header"><div><h1>{title}</h1>{description && <p>{description}</p>}</div>{children}{action && <div className="page-header__actions">{action}</div>}</header>;
}

export function SectionHeader({ title, meta, action }: { title: string; meta?: ReactNode; action?: ReactNode }) {
  return <div className="section-header"><div className="section-title"><h2>{title}</h2>{meta}</div>{action}</div>;
}

export function Dialog({ open, title, description, onClose, children, footer, size = 'md' }: { open: boolean; title: string; description?: string; onClose: () => void; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' }) {
  useEffect(() => {
    if (!open) return;
    const keydown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', keydown);
    document.body.classList.add('modal-open');
    return () => { document.removeEventListener('keydown', keydown); document.body.classList.remove('modal-open'); };
  }, [open, onClose]);
  if (!open) return null;
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}><section className={`dialog dialog--${size}`} role="dialog" aria-modal="true" aria-labelledby="dialog-title"><header><div><h2 id="dialog-title">{title}</h2>{description && <p>{description}</p>}</div><IconButton label="Закрыть" icon={X} onClick={onClose} /></header><div className="dialog__body">{children}</div>{footer && <footer>{footer}</footer>}</section></div>;
}

export function EmptyState({ title, description, icon: Icon = Inbox, action }: { title: string; description: string; icon?: LucideIcon; action?: ReactNode }) {
  return <div className="empty-state"><span className="empty-state__icon"><Icon size={22} /></span><strong>{title}</strong><p>{description}</p>{action}</div>;
}

export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return <div className="notice notice--danger"><AlertCircle size={18} /><span>{message}</span>{retry && <Button variant="secondary" onClick={retry}>Повторить</Button>}</div>;
}

export function LoadingState({ label = 'Загрузка' }: { label?: string }) {
  return <div className="loading-state"><LoaderCircle className="spin" size={20} /><span>{label}</span></div>;
}

export function SelectField({ label, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  return <label className="field"><span>{label}</span><span className="select-wrap"><select {...props}>{children}</select><ChevronDown size={15} /></span></label>;
}

export function Field({ label, hint, children, className = '' }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return <label className={`field ${className}`}><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: Array<{ value: T; label: string }>; onChange: (value: T) => void; label: string }) {
  return <div className="segmented" role="group" aria-label={label}>{options.map((option) => <button key={option.value} type="button" className={value === option.value ? 'is-active' : ''} onClick={() => onChange(option.value)}>{option.label}</button>)}</div>;
}

export function Meter({ value, tone = 'teal', label }: { value: number; tone?: 'teal' | 'blue' | 'amber' | 'red'; label?: string }) {
  const safe = Math.min(100, Math.max(0, value));
  return <span className="meter" aria-label={label ?? `${safe}%`}><i className={`meter__fill meter__fill--${tone}`} style={{ width: `${safe}%` }} /></span>;
}

export function Surface({ className = '', ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={`surface ${className}`} {...props} />;
}

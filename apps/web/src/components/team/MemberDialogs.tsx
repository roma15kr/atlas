import { Check, Copy, Eye, EyeOff, KeyRound, RefreshCw, UserCheck, UserX } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import type { MemberUpdate } from '../../context/AppContext';
import { ApiError } from '../../lib/api';
import { roleLabel } from '../../lib/format';
import type { Role, User } from '../../types';
import { Button, Dialog, Field, IconButton, SelectField } from '../ui';

const messages: Record<string, string> = {
  ROLE_CHANGE_FORBIDDEN: 'Роль и отдел меняет только директор, и не свою собственную роль',
  MANAGER_EMPLOYEE_ONLY: 'Руководитель управляет только сотрудниками своего отдела',
  LAST_DIRECTOR: 'В компании должен остаться хотя бы один активный директор',
  DEPARTMENT_REQUIRED: 'Для руководителя и сотрудника нужен отдел',
  CANNOT_DISABLE_SELF: 'Нельзя отключить собственную учётную запись',
  CANNOT_RESET_SELF: 'Свой пароль меняется в профиле',
  INVALID_CURRENT_PASSWORD: 'Текущий пароль указан неверно',
  PASSWORD_REUSED: 'Новый пароль должен отличаться от текущего',
  VALIDATION_ERROR: 'Проверьте заполнение полей',
};

export function memberErrorMessage(reason: unknown, fallback: string): string {
  if (reason instanceof ApiError && reason.code && messages[reason.code]) return messages[reason.code];
  if (reason instanceof ApiError && reason.status === 400) return messages.VALIDATION_ERROR;
  return fallback;
}

/** The server's password rule: 12+ characters with lower and upper case, a digit and a symbol. */
export function passwordProblem(password: string): string | null {
  if (password.length < 12) return 'Не менее 12 символов';
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password)) return 'Нужны строчные и заглавные буквы';
  if (!/[0-9]/.test(password)) return 'Нужна хотя бы одна цифра';
  if (!/[^a-zA-Z0-9]/.test(password)) return 'Нужен хотя бы один символ, например !';
  return null;
}

export function generateTemporaryPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  const random = new Uint32Array(10);
  globalThis.crypto.getRandomValues(random);
  return `At7!${Array.from(random, (value) => alphabet[value % alphabet.length]).join('')}`;
}

interface EditMemberDialogProps {
  member: User;
  actor: User;
  departments: string[];
  save: (patch: MemberUpdate) => Promise<void>;
  onClose: () => void;
}

/** Directors edit everything except their own role; heads edit the profile fields of their employees. */
export function EditMemberDialog({ member, actor, departments, save, onClose }: EditMemberDialogProps) {
  const canPlace = actor.role === 'DIRECTOR' && actor.id !== member.id;
  const [role, setRole] = useState<Role>(member.role);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? '').trim();
    const patch: MemberUpdate = { fullName: text('fullName'), jobTitle: text('jobTitle'), specialty: text('specialty') };
    if (canPlace) {
      if (role !== member.role) patch.role = role;
      const department = text('departmentName');
      if (department && department !== member.department) patch.departmentName = department;
    }
    setSaving(true); setError('');
    try { await save(patch); onClose(); }
    catch (reason) { setError(memberErrorMessage(reason, 'Изменения не сохранены')); }
    finally { setSaving(false); }
  };

  return <Dialog open title="Изменить сотрудника" description={member.fullName} size="lg" onClose={() => { if (!saving) onClose(); }} footer={<><Button variant="secondary" disabled={saving} onClick={onClose}>Отмена</Button><Button type="submit" form="member-form" disabled={saving}>{saving ? 'Сохраняем…' : 'Сохранить'}</Button></>}>
    <form id="member-form" className="form-grid" onSubmit={(event) => void submit(event)}>
      <Field label="ФИО"><input name="fullName" defaultValue={member.fullName} required minLength={2} maxLength={160} /></Field>
      <Field label="Должность"><input name="jobTitle" defaultValue={member.jobTitle} maxLength={160} /></Field>
      {canPlace && <SelectField label="Роль" aria-label="Роль" value={role} onChange={(event) => setRole(event.target.value as Role)}>{(['EMPLOYEE', 'MANAGER', 'DIRECTOR'] as Role[]).map((value) => <option key={value} value={value}>{roleLabel[value]}</option>)}</SelectField>}
      {canPlace && <Field label={role === 'DIRECTOR' ? 'Отдел (необязательно)' : 'Отдел'} hint="Выберите из списка или введите новый"><input name="departmentName" list="member-departments" defaultValue={member.department === 'Без отдела' ? '' : member.department} required={role !== 'DIRECTOR'} maxLength={120} /><datalist id="member-departments">{departments.map((name) => <option key={name} value={name} />)}</datalist></Field>}
      <Field label="Специализация"><input name="specialty" defaultValue={member.specialty ?? ''} maxLength={160} /></Field>
      {error && <div className="form-error field--wide" role="alert">{error}</div>}
    </form>
  </Dialog>;
}

export function ResetPasswordDialog({ member, reset, onClose }: { member: User; reset: (password: string) => Promise<void>; onClose: () => void }) {
  const [password, setPassword] = useState(generateTemporaryPassword);
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const problem = passwordProblem(password);
    if (problem) { setError(problem); return; }
    setSaving(true); setError('');
    try { await reset(password); setDone(true); }
    catch (reason) { setError(memberErrorMessage(reason, 'Пароль не сброшен')); }
    finally { setSaving(false); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(`${member.username}\n${password}`); setCopied(true); }
    catch { setError('Не удалось скопировать данные'); }
  };

  if (done) return <Dialog open title="Пароль сброшен" description="Все сеансы сотрудника завершены" onClose={onClose} footer={<Button onClick={onClose}>Готово</Button>}>
    <div className="onboarding-success"><span><KeyRound size={25} /></span><h3>{member.fullName}</h3><p>При входе сотрудник должен будет задать новый пароль.</p><dl><div><dt>Логин</dt><dd><code>{member.username}</code></dd></div><div><dt>Временный пароль</dt><dd><code>{password}</code></dd></div></dl><Button variant="secondary" icon={copied ? Check : Copy} onClick={() => void copy()}>{copied ? 'Скопировано' : 'Скопировать доступ'}</Button>{error && <div className="form-error" role="alert">{error}</div>}</div>
  </Dialog>;

  return <Dialog open title="Сбросить пароль" description={member.fullName} onClose={() => { if (!saving) onClose(); }} footer={<><Button variant="secondary" disabled={saving} onClick={onClose}>Отмена</Button><Button type="submit" form="reset-form" disabled={saving}>{saving ? 'Сбрасываем…' : 'Сбросить пароль'}</Button></>}>
    <form id="reset-form" className="settings-form" onSubmit={(event) => void submit(event)}>
      <p className="dialog-note">Текущие сеансы сотрудника завершатся, блокировка входа снимется. При следующем входе нужно будет задать свой пароль.</p>
      <Field label="Временный пароль" hint="Не менее 12 символов"><span className="input-with-icon onboarding-password"><KeyRound size={17} /><input type={show ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} aria-label="Временный пароль" autoComplete="new-password" /><IconButton type="button" label={show ? 'Скрыть пароль' : 'Показать пароль'} icon={show ? EyeOff : Eye} onClick={() => setShow((value) => !value)} /><Button type="button" variant="secondary" icon={RefreshCw} onClick={() => setPassword(generateTemporaryPassword())}>Сгенерировать</Button></span></Field>
      {error && <div className="form-error" role="alert">{error}</div>}
    </form>
  </Dialog>;
}

export function MemberStatusDialog({ member, apply, onClose }: { member: User; apply: () => Promise<void>; onClose: () => void }) {
  const disabling = member.status !== 'DISABLED';
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const confirm = async () => {
    setSaving(true); setError('');
    try { await apply(); onClose(); }
    catch (reason) { setError(memberErrorMessage(reason, disabling ? 'Сотрудник не отключён' : 'Сотрудник не включён')); }
    finally { setSaving(false); }
  };
  return <Dialog open size="sm" title={disabling ? 'Отключить сотрудника?' : 'Включить сотрудника?'} description={member.fullName} onClose={() => { if (!saving) onClose(); }} footer={<><Button variant="secondary" disabled={saving} onClick={onClose}>Отмена</Button><Button variant={disabling ? 'danger' : 'primary'} icon={disabling ? UserX : UserCheck} disabled={saving} onClick={() => void confirm()}>{disabling ? 'Отключить' : 'Включить'}</Button></>}>
    {disabling
      ? <ul className="dialog-list"><li>Вход и все открытые сеансы будут закрыты сразу.</li><li>Сотрудник выйдет из каналов чата, его клиенты в Telegram станут неназначенными.</li><li>Клиенты, сделки и документы останутся без изменений — их видят руководитель и директор.</li></ul>
      : <p className="dialog-note">Сотрудник снова сможет войти со своим паролем и вернётся в общий канал.</p>}
    {error && <div className="form-error" role="alert">{error}</div>}
  </Dialog>;
}

/** Current, new and repeated password; used by the profile dialog and the forced-change screen. */
export function ChangePasswordForm({ id, requireCurrent = true, change, onDone }: { id: string; requireCurrent?: boolean; change: (current: string, next: string) => Promise<void>; onDone: () => void }) {
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const current = String(form.get('current') ?? ''), next = String(form.get('next') ?? ''), repeat = String(form.get('repeat') ?? '');
    const problem = passwordProblem(next);
    if (problem) { setError(problem); return; }
    if (next !== repeat) { setError('Пароли не совпадают'); return; }
    setSaving(true); setError('');
    try { await change(current, next); onDone(); }
    catch (reason) { setError(memberErrorMessage(reason, 'Пароль не изменён')); }
    finally { setSaving(false); }
  };
  return <form id={id} className="settings-form" onSubmit={(event) => void submit(event)} aria-busy={saving}>
    {requireCurrent && <Field label="Текущий пароль"><input name="current" type="password" required autoComplete="current-password" /></Field>}
    <Field label="Новый пароль" hint="Не менее 12 символов, буквы разного регистра, цифра и символ"><input name="next" type="password" required autoComplete="new-password" /></Field>
    <Field label="Повторите пароль"><input name="repeat" type="password" required autoComplete="new-password" /></Field>
    {error && <div className="form-error" role="alert">{error}</div>}
  </form>;
}

export function ChangePasswordDialog({ change, onClose }: { change: (current: string, next: string) => Promise<void>; onClose: () => void }) {
  return <Dialog open title="Изменить пароль" description="Другие сеансы будут завершены" onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Отмена</Button><Button type="submit" form="password-form">Изменить пароль</Button></>}>
    <ChangePasswordForm id="password-form" change={change} onDone={onClose} />
  </Dialog>;
}

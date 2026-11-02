import { useTranslation } from 'react-i18next';
import { Check, Copy, Eye, EyeOff, KeyRound, RefreshCw, UserCheck, UserX } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import type { MemberUpdate } from '../../context/AppContext';
import { ApiError } from '../../lib/api';
import { noDepartment, roleLabel } from '../../lib/format';
import i18n from '../../i18n';
import type { Role, User } from '../../types';
import { Button, Dialog, Field, IconButton, SelectField } from '../ui';

const MEMBER_ERRORS = ['ROLE_CHANGE_FORBIDDEN', 'MANAGER_EMPLOYEE_ONLY', 'LAST_DIRECTOR', 'DEPARTMENT_REQUIRED', 'CANNOT_DISABLE_SELF', 'CANNOT_RESET_SELF', 'INVALID_CURRENT_PASSWORD', 'PASSWORD_REUSED', 'VALIDATION_ERROR'] as const;
type MemberErrorCode = typeof MEMBER_ERRORS[number];
const isMemberError = (code: string): code is MemberErrorCode => (MEMBER_ERRORS as readonly string[]).includes(code);

export function memberErrorMessage(reason: unknown, fallback: string): string {
  if (reason instanceof ApiError && reason.code && isMemberError(reason.code)) return i18n.t(`team:errors.${reason.code}`);
  if (reason instanceof ApiError && reason.status === 400) return i18n.t('team:errors.VALIDATION_ERROR');
  return fallback;
}

/** The server's password rule: 12+ characters with lower and upper case, a digit and a symbol. */
export function passwordProblem(password: string): string | null {
  if (password.length < 12) return i18n.t('team:add.min12');
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password)) return i18n.t('team:password.cases');
  if (!/[0-9]/.test(password)) return i18n.t('team:password.digit');
  if (!/[^a-zA-Z0-9]/.test(password)) return i18n.t('team:password.symbol');
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
  const { t } = useTranslation(['team', 'common']);
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
    catch (reason) { setError(memberErrorMessage(reason, t('edit.failed'))); }
    finally { setSaving(false); }
  };

  return <Dialog open title={t('edit.title')} description={member.fullName} size="lg" onClose={() => { if (!saving) onClose(); }} footer={<><Button variant="secondary" disabled={saving} onClick={onClose}>{t('common:actions.cancel')}</Button><Button type="submit" form="member-form" disabled={saving}>{saving ? t('common:actions.saving') : t('common:actions.save')}</Button></>}>
    <form id="member-form" className="form-grid" onSubmit={(event) => void submit(event)}>
      <Field label={t('add.fullName')}><input name="fullName" defaultValue={member.fullName} required minLength={2} maxLength={160} /></Field>
      <Field label={t('add.jobTitle')}><input name="jobTitle" defaultValue={member.jobTitle} maxLength={160} /></Field>
      {canPlace && <SelectField label={t('add.role')} aria-label={t('add.role')} value={role} onChange={(event) => setRole(event.target.value as Role)}>{(['EMPLOYEE', 'MANAGER', 'DIRECTOR'] as Role[]).map((value) => <option key={value} value={value}>{roleLabel[value]}</option>)}</SelectField>}
      {canPlace && <Field label={role === 'DIRECTOR' ? t('add.departmentOptional') : t('add.department')} hint={t('edit.departmentHint')}><input name="departmentName" list="member-departments" defaultValue={member.department === noDepartment() ? '' : member.department} required={role !== 'DIRECTOR'} maxLength={120} /><datalist id="member-departments">{departments.map((name) => <option key={name} value={name} />)}</datalist></Field>}
      <Field label={t('page.specialty')}><input name="specialty" defaultValue={member.specialty ?? ''} maxLength={160} /></Field>
      {error && <div className="form-error field--wide" role="alert">{error}</div>}
    </form>
  </Dialog>;
}

export function ResetPasswordDialog({ member, reset, onClose }: { member: User; reset: (password: string) => Promise<void>; onClose: () => void }) {
  const { t } = useTranslation(['team', 'common']);
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
    catch (reason) { setError(memberErrorMessage(reason, t('reset.failed'))); }
    finally { setSaving(false); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(`${member.username}\n${password}`); setCopied(true); }
    catch { setError(t('add.copyFailed')); }
  };

  if (done) return <Dialog open title={t('reset.doneTitle')} description={t('reset.doneText')} onClose={onClose} footer={<Button onClick={onClose}>{t('common:actions.done')}</Button>}>
    <div className="onboarding-success"><span><KeyRound size={25} /></span><h3>{member.fullName}</h3><p>{t('reset.doneNote')}</p><dl><div><dt>{t('add.login')}</dt><dd><code>{member.username}</code></dd></div><div><dt>{t('add.tempPassword')}</dt><dd><code>{password}</code></dd></div></dl><Button variant="secondary" icon={copied ? Check : Copy} onClick={() => void copy()}>{copied ? t('add.copied') : t('add.copy')}</Button>{error && <div className="form-error" role="alert">{error}</div>}</div>
  </Dialog>;

  return <Dialog open title={t('page.resetPassword')} description={member.fullName} onClose={() => { if (!saving) onClose(); }} footer={<><Button variant="secondary" disabled={saving} onClick={onClose}>{t('common:actions.cancel')}</Button><Button type="submit" form="reset-form" disabled={saving}>{saving ? t('reset.resetting') : t('page.resetPassword')}</Button></>}>
    <form id="reset-form" className="settings-form settings-form--single" onSubmit={(event) => void submit(event)}>
      <p className="dialog-note">{t('reset.note')}</p>
      <Field label={t('add.tempPassword')} hint={t('add.min12')}><span className="input-with-icon onboarding-password"><KeyRound size={17} /><input type={show ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} aria-label={t('add.tempPassword')} autoComplete="new-password" /><IconButton type="button" label={show ? t('add.hidePassword') : t('add.showPassword')} icon={show ? EyeOff : Eye} onClick={() => setShow((value) => !value)} /><Button type="button" variant="secondary" icon={RefreshCw} onClick={() => setPassword(generateTemporaryPassword())}>{t('add.generate')}</Button></span></Field>
      {error && <div className="form-error" role="alert">{error}</div>}
    </form>
  </Dialog>;
}

export function MemberStatusDialog({ member, apply, onClose }: { member: User; apply: () => Promise<void>; onClose: () => void }) {
  const { t } = useTranslation(['team', 'common']);
  const disabling = member.status !== 'DISABLED';
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const confirm = async () => {
    setSaving(true); setError('');
    try { await apply(); onClose(); }
    catch (reason) { setError(memberErrorMessage(reason, disabling ? t('status.disableFailed') : t('status.enableFailed'))); }
    finally { setSaving(false); }
  };
  return <Dialog open size="sm" title={disabling ? t('status.disableTitle') : t('status.enableTitle')} description={member.fullName} onClose={() => { if (!saving) onClose(); }} footer={<><Button variant="secondary" disabled={saving} onClick={onClose}>{t('common:actions.cancel')}</Button><Button variant={disabling ? 'danger' : 'primary'} icon={disabling ? UserX : UserCheck} disabled={saving} onClick={() => void confirm()}>{disabling ? t('page.disable') : t('page.enable')}</Button></>}>
    {disabling
      ? <ul className="dialog-list"><li>{t('status.disable1')}</li><li>{t('status.disable2')}</li><li>{t('status.disable3')}</li></ul>
      : <p className="dialog-note">{t('status.enableNote')}</p>}
    {error && <div className="form-error" role="alert">{error}</div>}
  </Dialog>;
}

/** Current, new and repeated password; used by the profile dialog and the forced-change screen. */
export function ChangePasswordForm({ id, requireCurrent = true, change, onDone }: { id: string; requireCurrent?: boolean; change: (current: string, next: string) => Promise<void>; onDone: () => void }) {
  const { t } = useTranslation(['team', 'common']);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const current = String(form.get('current') ?? ''), next = String(form.get('next') ?? ''), repeat = String(form.get('repeat') ?? '');
    const problem = passwordProblem(next);
    if (problem) { setError(problem); return; }
    if (next !== repeat) { setError(t('password.mismatch')); return; }
    setSaving(true); setError('');
    try { await change(current, next); onDone(); }
    catch (reason) { setError(memberErrorMessage(reason, t('password.failed'))); }
    finally { setSaving(false); }
  };
  return <form id={id} className="settings-form" onSubmit={(event) => void submit(event)} aria-busy={saving}>
    {requireCurrent && <Field label={t('password.current')}><input name="current" type="password" required autoComplete="current-password" /></Field>}
    <Field label={t('password.new')} hint={t('password.rule')}><input name="next" type="password" required autoComplete="new-password" /></Field>
    <Field label={t('password.repeat')}><input name="repeat" type="password" required autoComplete="new-password" /></Field>
    {error && <div className="form-error" role="alert">{error}</div>}
  </form>;
}

export function ChangePasswordDialog({ change, onClose }: { change: (current: string, next: string) => Promise<void>; onClose: () => void }) {
  const { t } = useTranslation(['team', 'common']);
  return <Dialog open title={t('password.title')} description={t('password.text')} onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>{t('common:actions.cancel')}</Button><Button type="submit" form="password-form">{t('password.title')}</Button></>}>
    <ChangePasswordForm id="password-form" change={change} onDone={onClose} />
  </Dialog>;
}

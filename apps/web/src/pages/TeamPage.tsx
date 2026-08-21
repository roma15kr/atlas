import {
  BriefcaseBusiness, Check, CheckCircle2, CircleDot, Clock3, Copy, Eye, EyeOff,
  Gauge, KeyRound, Plus, RefreshCw, Search, ShieldCheck, Target, UserCheck, Users,
} from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Avatar, Badge, Button, Dialog, EmptyState, Field, IconButton, Meter, PageHeader, Segmented, SectionHeader, SelectField, Surface } from '../components/ui';
import { useAuth, useWorkspace, type CreateTeamMemberInput } from '../context/AppContext';
import { formatDate, formatKpiValue, relativeTime, roleLabel } from '../lib/format';
import type { Role, User } from '../types';

export function generateTemporaryPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  const random = new Uint32Array(10);
  globalThis.crypto.getRandomValues(random);
  return `At7!${Array.from(random, (value) => alphabet[value % alphabet.length]).join('')}`;
}

export function TeamPage() {
  const { session } = useAuth();
  const { users, createTeamMember } = useWorkspace();
  const [params] = useSearchParams();
  const [scope, setScope] = useState<'all' | 'online' | 'offline'>('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(params.get('user') ?? users[0]?.id ?? '');
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const canOnboard = session!.user.role === 'DIRECTOR' || session!.user.role === 'MANAGER';

  useEffect(() => { if (!selectedId && users[0]) setSelectedId(users[0].id); }, [users, selectedId]);
  const visible = useMemo(() => users.filter((user) => (scope === 'all' || (scope === 'online') === user.online) && `${user.fullName} ${user.jobTitle} ${user.department}`.toLowerCase().includes(query.toLowerCase())), [users, scope, query]);
  const selected = users.find((user) => user.id === selectedId) ?? visible[0];
  const online = users.filter((user) => user.online).length;
  const departments = useMemo(() => Array.from(new Set(users.map((user) => user.department).filter((name) => name && name !== 'Без отдела'))).sort((left, right) => left.localeCompare(right, 'ru')), [users]);

  return <>
    <PageHeader title="Команда" description={`${online} из ${users.length} сотрудников в сети`} action={canOnboard ? <Button icon={Plus} onClick={() => setOnboardingOpen(true)}>Добавить сотрудника</Button> : undefined}>
      <Segmented value={scope} label="Статус присутствия" options={[{ value: 'all', label: 'Все' }, { value: 'online', label: 'В сети' }, { value: 'offline', label: 'Не в сети' }]} onChange={setScope} />
    </PageHeader>
    <div className="team-layout">
      <Surface className="team-list"><label className="table-search"><Search size={16} /><input aria-label="Поиск сотрудников" placeholder="Имя, должность или отдел" value={query} onChange={(event) => setQuery(event.target.value)} /></label><div className="team-list__rows">{visible.length ? visible.map((user) => <button key={user.id} className={selected?.id === user.id ? 'is-active' : ''} onClick={() => setSelectedId(user.id)}><Avatar name={user.fullName} online={user.online} /><span><strong>{user.fullName}</strong><small>{user.jobTitle}</small></span><span className="person-status"><Badge tone={user.online ? 'success' : 'neutral'}>{user.online ? 'В сети' : relativeTime(user.lastSeen)}</Badge><small>{user.department}</small></span></button>) : <EmptyState title="Никого не найдено" description="Измените фильтр присутствия" icon={Users} />}</div></Surface>
      {selected ? <div className="team-detail">
        <Surface className="team-profile"><div className="team-profile__head"><Avatar name={selected.fullName} online={selected.online} size="lg" /><div><h2>{selected.fullName}</h2><span>{selected.jobTitle}</span><div><Badge tone="info">{roleLabel[selected.role]}</Badge><Badge>{selected.department}</Badge></div></div></div><div className="profile-facts"><div><BriefcaseBusiness size={16} /><span><small>Специализация</small><strong>{selected.specialty ?? 'Не указана'}</strong></span></div><div><Gauge size={16} /><span><small>Рейтинг</small><strong>{selected.rating || '—'} / 100</strong></span></div><div><CircleDot size={16} /><span><small>Присутствие</small><strong>{selected.online ? 'Сейчас в сети' : relativeTime(selected.lastSeen)}</strong></span></div><div><ShieldCheck size={16} /><span><small>Согласие</small><strong>{selected.monitoringConsentAt ? `Получено ${formatDate(selected.monitoringConsentAt)}` : 'Ожидается'}</strong></span></div></div></Surface>
        {selected.jobDescription && <Surface className="job-description"><SectionHeader title="Должностная инструкция" /><p>{selected.jobDescription}</p></Surface>}
        <Surface className="team-kpi"><SectionHeader title="KPI текущего периода" meta={<Badge tone="info">{selected.kpis.length}</Badge>} />{selected.kpis.length ? <div className="kpi-list">{selected.kpis.map((kpi) => { const progress = Math.round(Math.min(1, kpi.actual / kpi.target) * 100); return <article key={kpi.id}><div><span><strong>{kpi.name}</strong><small>Вес {Math.round(kpi.weight * 100)}% · до {formatDate(kpi.dueAt)}</small></span><b>{progress}%</b></div><Meter value={progress} tone={progress >= 85 ? 'teal' : progress >= 60 ? 'amber' : 'red'} /><footer><span>{formatKpiValue(kpi.actual, kpi.unit)}</span><span>цель {formatKpiValue(kpi.target, kpi.unit)}</span></footer></article>; })}</div> : <EmptyState title="KPI не назначены" description="Показатели сотрудника ещё не настроены" icon={Target} />}</Surface>
        <Surface className="presence-history"><SectionHeader title="Активность сегодня" /><div className="presence-timeline"><div><CheckCircle2 size={15} /><span><strong>Вход в систему</strong><small>09:04</small></span></div><div><Clock3 size={15} /><span><strong>Последняя активность</strong><small>{selected.online ? 'только что' : relativeTime(selected.lastSeen)}</small></span></div></div></Surface>
      </div> : <Surface><EmptyState title="Выберите сотрудника" description="Профиль и KPI появятся здесь" icon={Users} /></Surface>}
    </div>
    {onboardingOpen && <OnboardingDialog actor={session!.user} departments={departments} createMember={createTeamMember} onCreated={(user) => { setSelectedId(user.id); setQuery(''); setScope('all'); }} onClose={() => setOnboardingOpen(false)} />}
  </>;
}

interface OnboardingDialogProps {
  actor: User;
  departments: string[];
  createMember: (input: CreateTeamMemberInput) => Promise<User>;
  onCreated: (user: User) => void;
  onClose: () => void;
}

export function OnboardingDialog({ actor, departments, createMember, onCreated, onClose }: OnboardingDialogProps) {
  const [password, setPassword] = useState(generateTemporaryPassword);
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<User | null>(null);
  const [copied, setCopied] = useState(false);
  const manager = actor.role === 'MANAGER';
  const [role, setRole] = useState<Role>(manager ? 'EMPLOYEE' : 'EMPLOYEE');

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const selectedRole = manager ? 'EMPLOYEE' : role;
    setSaving(true); setError('');
    try {
      const user = await createMember({
        username: String(form.get('username')).trim().toLowerCase(), password,
        fullName: String(form.get('fullName')).trim(), role: selectedRole,
        departmentName: manager ? undefined : String(form.get('departmentName')).trim(),
        jobTitle: String(form.get('jobTitle')).trim() || undefined,
        specialty: String(form.get('specialty')).trim() || undefined,
        jobDescription: String(form.get('jobDescription')).trim() || undefined,
      });
      setCreated(user); onCreated(user);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Сотрудник не добавлен'); }
    finally { setSaving(false); }
  };

  const copyCredentials = async () => {
    if (!created) return;
    try { await navigator.clipboard.writeText(`${created.username}\n${password}`); setCopied(true); }
    catch { setError('Не удалось скопировать данные'); }
  };

  if (created) return <Dialog open title="Сотрудник добавлен" description="Профиль и первичный доступ созданы" onClose={onClose} footer={<Button onClick={onClose}>Готово</Button>}><div className="onboarding-success"><span><UserCheck size={25} /></span><h3>{created.fullName}</h3><p>{created.jobTitle || roleLabel[created.role]} · {created.department}</p><dl><div><dt>Логин</dt><dd><code>{created.username}</code></dd></div><div><dt>Временный пароль</dt><dd><code>{password}</code></dd></div></dl><Button variant="secondary" icon={copied ? Check : Copy} onClick={() => void copyCredentials()}>{copied ? 'Скопировано' : 'Скопировать доступ'}</Button>{error && <div className="form-error" role="alert">{error}</div>}</div></Dialog>;

  return <Dialog open title="Новый сотрудник" description="Профиль, роль и первичный доступ" size="lg" onClose={() => { if (!saving) onClose(); }} footer={<><Button variant="secondary" disabled={saving} onClick={onClose}>Отмена</Button><Button type="submit" form="onboarding-form" disabled={saving}>{saving ? 'Создаём…' : 'Добавить сотрудника'}</Button></>}>
    <form id="onboarding-form" className="form-grid onboarding-form" onSubmit={(event) => void submit(event)}>
      <Field label="ФИО"><input name="fullName" autoFocus required minLength={2} maxLength={160} placeholder="Имя и фамилия" /></Field>
      <Field label="Логин"><input name="username" required minLength={3} maxLength={50} pattern="[A-Za-z0-9][A-Za-z0-9._-]*" autoComplete="off" placeholder="name.surname" /></Field>
      <SelectField label="Роль" name="role" value={role} onChange={(event) => setRole(event.target.value as Role)} disabled={manager} aria-label="Роль"><option value="EMPLOYEE">Сотрудник</option>{!manager && <option value="MANAGER">Руководитель</option>}{!manager && <option value="DIRECTOR">Директор</option>}</SelectField>
      {manager ? <Field label="Отдел"><input value={actor.department} disabled /></Field> : <Field label={role === 'DIRECTOR' ? 'Отдел (необязательно)' : 'Отдел'}><input name="departmentName" list="department-options" required={role !== 'DIRECTOR'} maxLength={120} placeholder="Название отдела" /><datalist id="department-options">{departments.map((department) => <option value={department} key={department} />)}</datalist></Field>}
      <Field label="Должность"><input name="jobTitle" maxLength={160} placeholder="Название должности" /></Field>
      <Field label="Специализация"><input name="specialty" maxLength={160} placeholder="Профессиональная область" /></Field>
      <Field label="Должностная инструкция" className="field--wide"><textarea name="jobDescription" rows={3} maxLength={20000} placeholder="Зона ответственности и ожидаемый результат" /></Field>
      <Field label="Временный пароль" hint="Не менее 12 символов" className="field--wide"><span className="input-with-icon onboarding-password"><KeyRound size={17} /><input type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} minLength={12} required autoComplete="new-password" aria-label="Временный пароль" /><IconButton type="button" label={showPassword ? 'Скрыть пароль' : 'Показать пароль'} icon={showPassword ? EyeOff : Eye} onClick={() => setShowPassword((value) => !value)} /><Button type="button" variant="secondary" icon={RefreshCw} onClick={() => setPassword(generateTemporaryPassword())}>Сгенерировать</Button></span></Field>
      {error && <div className="form-error field--wide" role="alert">{error}</div>}
    </form>
  </Dialog>;
}

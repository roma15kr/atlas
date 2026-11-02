import { useTranslation } from 'react-i18next';
import { localeOf } from '../i18n';
import { useIsPhone } from '../lib/useIsPhone';
import {
  BriefcaseBusiness, Cake, Check, CheckCircle2, CircleDot, Clock3, Copy, Eye, EyeOff,
  Gauge, ImageOff, KeyRound, Mail, MapPin, Network, Pencil, Phone, Plus, RefreshCw, Search, ShieldCheck, Sparkles, Target, Trash2, UserCheck, Users, UserX,
} from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Avatar, Badge, Button, Dialog, EmptyState, Field, IconButton, Meter, PageHeader, Segmented, SectionHeader, SelectField, Surface } from '../components/ui';
import { useAuth, useWorkspace, type CreateTeamMemberInput } from '../context/AppContext';
import { formatDate, formatKpiValue, noDepartment, relativeTime, roleLabel } from '../lib/format';
import { formatBirthday } from '../lib/profile';
import type { DirectoryEntry, Kpi, Role, User } from '../types';
import { RichTextView } from '../components/richtext/RichTextView';
import { JobDescriptionDialog } from '../components/team/JobDescriptionDialog';
import { KpiDialog } from '../components/team/KpiDialog';
import { AiAnalysisDialog } from '../components/AiAnalysisDialog';
import { DepartmentsDialog } from '../components/team/DepartmentsDialog';
import { EditMemberDialog, generateTemporaryPassword, MemberStatusDialog, ResetPasswordDialog } from '../components/team/MemberDialogs';

export { generateTemporaryPassword };

export function TeamPage() {
  const { t } = useTranslation(['team', 'common']);
  const { session } = useAuth();
  const { users: activeUsers, disabledUsers, createTeamMember, updateMember, setMemberActive, removeMemberAvatar, resetMemberPassword, teamDirectory, addKpi, updateKpi, deleteKpi } = useWorkspace();
  const [params] = useSearchParams();
  const [scope, setScope] = useState<'all' | 'online' | 'offline' | 'disabled'>('all');
  const [dialog, setDialog] = useState<'edit' | 'reset' | 'status' | 'photo' | 'job' | null>(null);
  const [photoError, setPhotoError] = useState('');
  const [kpiDialog, setKpiDialog] = useState<{ kpi?: Kpi } | null>(null);
  const [kpiDelete, setKpiDelete] = useState<Kpi | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const users = scope === 'disabled' ? disabledUsers : activeUsers;
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(params.get('user') ?? users[0]?.id ?? '');
  // On a phone the card is below the list: show it when someone is picked.
  const phone = useIsPhone();
  const pick = (id: string) => {
    setSelectedId(id);
    if (phone) requestAnimationFrame(() => document.querySelector('.team-detail')?.scrollIntoView?.({ block: 'start', behavior: 'smooth' }));
  };
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [departmentsOpen, setDepartmentsOpen] = useState(false);
  const canOnboard = session!.user.role === 'DIRECTOR' || session!.user.role === 'MANAGER';

  // The whole company as contact cards; reloaded whenever the team changes. Without it the page shows the team only.
  const [directory, setDirectory] = useState<DirectoryEntry[] | null>(null);
  useEffect(() => {
    let active = true;
    teamDirectory().then((entries) => { if (active) setDirectory(entries); }, () => { if (active) setDirectory(null); });
    return () => { active = false; };
  }, [teamDirectory]);
  // Everyone in the company hears when a colleague goes online or offline; times stay with their team.
  useEffect(() => {
    const handle = (event: Event) => {
      const { event: name, payload } = (event as CustomEvent<{ event: string; payload: { userId?: string; online?: boolean } }>).detail;
      if (name !== 'presence:online' || !payload?.userId) return;
      setDirectory((current) => current?.map((entry) => entry.id === payload.userId ? { ...entry, online: Boolean(payload.online) } : entry) ?? current);
    };
    window.addEventListener('atlas:socket', handle);
    return () => window.removeEventListener('atlas:socket', handle);
  }, []);
  // Colleagues outside the caller's team: whether they are online now, nothing more.
  // Someone just disabled is still in the directory until it reloads, so the team's leavers are left out too.
  const colleagues = useMemo(() => (directory ?? []).filter((entry) => ![...activeUsers, ...disabledUsers].some((user) => user.id === entry.id)), [directory, activeUsers, disabledUsers]);

  useEffect(() => { if (!selectedId && users[0]) setSelectedId(users[0].id); }, [users, selectedId]);
  const visible = useMemo(() => users.filter((user) => (scope === 'all' || scope === 'disabled' || (scope === 'online') === user.online) && `${user.fullName} ${user.jobTitle} ${user.department}`.toLowerCase().includes(query.toLowerCase())), [users, scope, query]);
  const isOnline = (row: { user?: User; entry?: DirectoryEntry }) => Boolean(row.user ? row.user.online : row.entry?.online);
  const rows = useMemo(() => [
    ...visible.map((user) => ({ id: user.id, fullName: user.fullName, user, entry: undefined })),
    ...(scope === 'disabled' ? [] : colleagues).filter((entry) => (scope === 'all' || (scope === 'online') === Boolean(entry.online)) && `${entry.fullName} ${entry.jobTitle ?? ''} ${entry.departmentName ?? ''}`.toLowerCase().includes(query.toLowerCase()))
      .map((entry) => ({ id: entry.id, fullName: entry.fullName, user: undefined, entry })),
  // Online first, then offline; each group alphabetically.
  ].sort((a, b) => Number(isOnline(b)) - Number(isOnline(a)) || a.fullName.localeCompare(b.fullName, localeOf())), [visible, colleagues, scope, query]);
  // The detail follows the list: someone filtered out by the tab or the search gives way to the first row.
  const current = rows.find((row) => row.id === selectedId) ?? rows[0];
  const selected = current?.user;
  const colleague = current?.entry;
  const online = activeUsers.filter((user) => user.online).length + colleagues.filter((entry) => entry.online).length;
  const actor = session!.user;
  // Directors administer anyone; heads only the employees of their own department. The API enforces the same.
  // KPIs: directors for any active person, heads for active employees of their department, never for themselves.
  const canSetKpis = (member: User) => member.status !== 'DISABLED' && (actor.role === 'DIRECTOR' || actor.role === 'MANAGER' && member.role === 'EMPLOYEE' && member.department === actor.department);
  // The API allows analysis of oneself and of anyone the viewer manages.
  const canAnalyze = (member: User) => member.status !== 'DISABLED' && (member.id === actor.id || actor.role === 'DIRECTOR' || actor.role === 'MANAGER' && member.department === actor.department);
  // Heads see only their department and its sub-departments; in a sub-department they manage everyone, including its head.
  const canAdminister = (member: User) => actor.role === 'DIRECTOR' || actor.role === 'MANAGER' && member.id !== actor.id && member.role !== 'DIRECTOR'
    && (member.department === actor.department ? member.role === 'EMPLOYEE' : Boolean(member.department));
  const departments = useMemo(() => Array.from(new Set(users.map((user) => user.department).filter((name) => name && name !== noDepartment()))).sort((left, right) => left.localeCompare(right, localeOf())), [users]);

  return <>
    <PageHeader title={t('page.title')} description={`${t('page.count', { count: activeUsers.length + colleagues.length })}${t('page.online', { count: online })}`} action={canOnboard ? <>{actor.role === 'DIRECTOR' && <Button variant="secondary" icon={Network} onClick={() => setDepartmentsOpen(true)}>{t('page.departments')}</Button>}<Button icon={Plus} onClick={() => setOnboardingOpen(true)}>{t('page.add')}</Button></> : undefined}>
      <Segmented value={scope} label={t('page.presence')} options={[{ value: 'all', label: t('page.all') }, { value: 'online', label: t('page.isOnline') }, { value: 'offline', label: t('page.isOffline') }, ...(canOnboard ? [{ value: 'disabled' as const, label: `${t('page.disabled')}${disabledUsers.length ? ` · ${disabledUsers.length}` : ''}` }] : [])]} onChange={setScope} />
    </PageHeader>
    <div className="team-layout">
      <Surface className="team-list"><label className="table-search"><Search size={16} /><input aria-label={t('page.search')} placeholder={t('page.searchPlaceholder')} value={query} onChange={(event) => setQuery(event.target.value)} /></label><div className="team-list__rows">{rows.length ? rows.map(({ user, entry }) => entry ? <button key={entry.id} className={colleague?.id === entry.id ? 'is-active' : ''} onClick={() => pick(entry.id)}><Avatar name={entry.fullName} src={entry.avatarUrl ?? undefined} online={Boolean(entry.online)} /><span><strong>{entry.fullName}</strong><small>{entry.jobTitle}</small></span><span className="person-status"><Badge tone={entry.online ? 'success' : 'neutral'}>{entry.online ? t('page.isOnline') : t('page.isOffline')}</Badge><small>{entry.departmentName ?? noDepartment()}</small></span></button> : <button key={user.id} className={selected?.id === user.id ? 'is-active' : ''} onClick={() => pick(user.id)}><Avatar name={user.fullName} src={user.avatarUrl} online={user.online} /><span><strong>{user.fullName}</strong><small>{user.jobTitle}</small>{canAdminister(user) && user.status !== 'DISABLED' && !user.jobDescription?.trim() && <Badge tone="warning">{t('page.noJob')}</Badge>}</span><span className="person-status"><Badge tone={user.online ? 'success' : 'neutral'}>{user.online ? t('page.isOnline') : relativeTime(user.lastSeen)}</Badge><small>{user.department}</small></span></button>) : <EmptyState title={t('page.nobody')} description={scope === 'disabled' ? t('page.noDisabled') : t('page.changeFilter')} icon={Users} />}</div></Surface>
      {selected ? <div className="team-detail">
        <Surface className="team-profile"><div className="team-profile__head"><Avatar name={selected.fullName} src={selected.avatarUrl} online={selected.online} size="lg" /><div><h2>{selected.fullName}</h2><span>{selected.jobTitle}</span><div><Badge tone="info">{roleLabel[selected.role]}</Badge><Badge>{selected.department}</Badge>{selected.status === 'DISABLED' && <Badge tone="danger">{t('page.isDisabled')}</Badge>}{selected.mustChangePassword && <Badge tone="warning">{t('page.mustChange')}</Badge>}</div></div>{(canAnalyze(selected) || canAdminister(selected)) && <div className="team-profile__actions">{canAnalyze(selected) && <Button variant="secondary" icon={Sparkles} onClick={() => setAiOpen(true)}>{t('page.ai')}</Button>}{canAdminister(selected) && <><Button variant="secondary" icon={Pencil} onClick={() => setDialog('edit')}>{t('page.edit')}</Button>{selected.id !== actor.id && selected.status !== 'DISABLED' && <Button variant="secondary" icon={KeyRound} onClick={() => setDialog('reset')}>{t('page.resetPassword')}</Button>}{selected.id !== actor.id && <Button variant={selected.status === 'DISABLED' ? 'secondary' : 'ghost'} icon={selected.status === 'DISABLED' ? UserCheck : UserX} onClick={() => setDialog('status')}>{selected.status === 'DISABLED' ? t('page.enable') : t('page.disable')}</Button>}{selected.id !== actor.id && selected.avatarUrl && <Button variant="ghost" icon={ImageOff} onClick={() => { setPhotoError(''); setDialog('photo'); }}>{t('page.removePhoto')}</Button>}</>}</div>}</div>{selected.about && <p className="member-about">{selected.about}</p>}<div className="profile-facts"><div><BriefcaseBusiness size={16} /><span><small>{t('page.specialty')}</small><strong>{selected.specialty ?? t('page.notSpecified')}</strong></span></div><div><Gauge size={16} /><span><small>{t('page.rating')}</small><strong>{selected.rating || '—'} / 100</strong></span></div><div><CircleDot size={16} /><span><small>{t('page.presenceFact')}</small><strong>{selected.online ? t('page.onlineNow') : relativeTime(selected.lastSeen)}</strong></span></div><div><ShieldCheck size={16} /><span><small>{t('page.consent')}</small><strong>{selected.monitoringConsentAt ? t('page.consentGiven', { date: formatDate(selected.monitoringConsentAt) }) : t('page.consentPending')}</strong></span></div></div><MemberContacts member={selected} /></Surface>
        <Surface className="job-description"><SectionHeader title={t('page.job')} action={canAdminister(selected) && selected.status !== 'DISABLED' ? <Button variant="secondary" icon={selected.jobDescription ? Pencil : Plus} onClick={() => setDialog('job')}>{selected.jobDescription ? t('page.editJob') : t('page.fillJob')}</Button> : undefined} />{selected.jobDescription ? <RichTextView markdown={selected.jobDescription} /> : <p className="job-description__empty">{t('page.jobEmpty')}{canAdminister(selected) ? t('page.jobHint') : ''}</p>}</Surface>
        <Surface className="team-kpi"><SectionHeader title={t('page.kpis')} meta={<Badge tone="info">{selected.kpis.length}</Badge>} action={canSetKpis(selected) ? <Button variant="secondary" icon={Plus} onClick={() => setKpiDialog({})}>{t('page.addKpi')}</Button> : undefined} />{selected.kpis.length ? <div className="kpi-list">{selected.kpis.map((kpi) => { const progress = Math.round(Math.min(1, kpi.actual / kpi.target) * 100); const automatic = kpi.source && kpi.source !== 'MANUAL'; return <article key={kpi.id}><div><span><strong>{kpi.name}{automatic && <Badge>{t('page.auto')}</Badge>}</strong><small>{t('page.weight', { value: Math.round(kpi.weight * 100) })}{automatic && kpi.periodStart ? ` · ${formatDate(kpi.periodStart)} – ${formatDate(kpi.periodEnd ?? undefined)}` : kpi.dueAt ? t('page.until', { date: formatDate(kpi.dueAt) }) : ''}{automatic && kpi.computedAt ? t('page.updated', { time: relativeTime(kpi.computedAt) }) : ''}</small></span><b>{progress}%</b>{canSetKpis(selected) && <span className="row-actions"><IconButton label={t('page.editKpi', { name: kpi.name })} icon={Pencil} onClick={() => setKpiDialog({ kpi })} /><IconButton label={t('page.deleteKpi', { name: kpi.name })} icon={Trash2} onClick={() => setKpiDelete(kpi)} /></span>}</div><Meter value={progress} tone={progress >= 85 ? 'teal' : progress >= 60 ? 'amber' : 'red'} /><footer><span>{formatKpiValue(kpi.actual, kpi.unit)}</span><span>{t('page.goal', { value: formatKpiValue(kpi.target, kpi.unit) })}</span></footer></article>; })}</div> : <EmptyState title={t('page.noKpis')} description={canSetKpis(selected) ? t('page.addKpisHint') : t('page.kpisNotSet')} icon={Target} />}</Surface>
        <Surface className="presence-history"><SectionHeader title={t('page.presenceFact')} /><div className="presence-timeline"><div>{selected.online ? <CheckCircle2 size={15} /> : <Clock3 size={15} />}<span><strong>{selected.online ? t('page.onlineNow') : t('page.lastActivity')}</strong><small>{selected.online ? t('page.activeNow') : relativeTime(selected.lastSeen)}</small></span></div></div></Surface>
      </div> : colleague ? <ColleagueCard colleague={colleague} /> : <Surface><EmptyState title={t('page.choose')} description={t('page.chooseText')} icon={Users} /></Surface>}
    </div>
    {selected && dialog === 'edit' && <EditMemberDialog member={selected} actor={actor} departments={departments} save={(patch) => updateMember(selected.id, patch)} onClose={() => setDialog(null)} />}
    {selected && dialog === 'reset' && <ResetPasswordDialog member={selected} reset={(password) => resetMemberPassword(selected.id, password)} onClose={() => setDialog(null)} />}
    {selected && dialog === 'status' && <MemberStatusDialog member={selected} apply={() => setMemberActive(selected.id, selected.status === 'DISABLED')} onClose={() => setDialog(null)} />}
    {selected && dialog === 'job' && <JobDescriptionDialog member={selected} save={(jobDescription) => updateMember(selected.id, { jobDescription })} onClose={() => setDialog(null)} />}
    {selected && dialog === 'photo' && <Dialog open size="sm" title={t('page.removePhotoTitle')} description={selected.fullName} onClose={() => setDialog(null)} footer={<><Button variant="secondary" onClick={() => setDialog(null)}>{t('common:actions.cancel')}</Button><Button variant="danger" icon={ImageOff} onClick={() => { void removeMemberAvatar(selected.id).then(() => setDialog(null), () => setPhotoError(t('page.photoFailed'))); }}>{t('common:actions.delete')}</Button></>}><p className="dialog-note">{t('page.photoNote')}</p>{photoError && <div className="form-error" role="alert">{photoError}</div>}</Dialog>}
    {selected && kpiDialog && <KpiDialog kpi={kpiDialog.kpi} save={(input) => kpiDialog.kpi ? updateKpi(selected.id, kpiDialog.kpi.id, input) : addKpi(selected.id, input)} onClose={() => setKpiDialog(null)} />}
    {selected && kpiDelete && <Dialog open size="sm" title={t('page.deleteKpiTitle')} description={kpiDelete.name} onClose={() => setKpiDelete(null)} footer={<><Button variant="secondary" onClick={() => setKpiDelete(null)}>{t('common:actions.cancel')}</Button><Button variant="danger" icon={Trash2} onClick={() => { void deleteKpi(selected.id, kpiDelete.id).finally(() => setKpiDelete(null)); }}>{t('common:actions.delete')}</Button></>}><p className="dialog-note">{t('page.deleteKpiNote')}</p></Dialog>}
    {selected && aiOpen && <AiAnalysisDialog targetUserId={selected.id} targetName={selected.fullName} onClose={() => setAiOpen(false)} />}
    {departmentsOpen && <DepartmentsDialog onClose={() => setDepartmentsOpen(false)} />}
    {onboardingOpen && <OnboardingDialog actor={session!.user} departments={departments} createMember={createTeamMember} onCreated={(user) => { setSelectedId(user.id); setQuery(''); setScope('all'); }} onClose={() => setOnboardingOpen(false)} />}
  </>;
}

/** A colleague outside the caller's team: who they are and how to reach them, nothing about their performance. */
function ColleagueCard({ colleague }: { colleague: DirectoryEntry }) {
  const { t } = useTranslation(['team', 'common']);
  return <div className="team-detail"><Surface className="team-profile" aria-label={t('page.contacts', { name: colleague.fullName })}>
    <div className="team-profile__head"><Avatar name={colleague.fullName} src={colleague.avatarUrl ?? undefined} online={Boolean(colleague.online)} size="lg" /><div><h2>{colleague.fullName}</h2><span>{colleague.jobTitle}</span><div><Badge tone="info">{roleLabel[colleague.role]}</Badge><Badge>{colleague.departmentName ?? noDepartment()}</Badge><Badge tone={colleague.online ? 'success' : 'neutral'}>{colleague.online ? t('page.isOnline') : t('page.isOffline')}</Badge></div></div></div>
    {colleague.about && <p className="member-about">{colleague.about}</p>}
    <div className="profile-facts"><div><BriefcaseBusiness size={16} /><span><small>{t('page.specialty')}</small><strong>{colleague.specialty ?? t('page.notSpecified')}</strong></span></div></div>
    <MemberContacts member={colleague} />
    <p className="dialog-note">{t('page.otherDepartment')}</p>
  </Surface></div>;
}

type Contacts = Pick<User, 'phone' | 'contactEmail' | 'city' | 'birthday'> | Pick<DirectoryEntry, 'phone' | 'contactEmail' | 'city' | 'birthday'>;

/** Phone, email, city and birthday, when the member has filled them in. */
function MemberContacts({ member }: { member: Contacts }) {
  const { t } = useTranslation(['team', 'common']);
  const birthday = formatBirthday(member.birthday);
  if (!member.phone && !member.contactEmail && !member.city && !birthday) return null;
  return <div className="profile-facts profile-facts--contacts">
    {member.phone && <div><Phone size={16} /><span><small>{t('page.phone')}</small><strong><a href={`tel:${member.phone.replace(/[^+\d]/g, '')}`}>{member.phone}</a></strong></span></div>}
    {member.contactEmail && <div><Mail size={16} /><span><small>Email</small><strong><a href={`mailto:${member.contactEmail}`}>{member.contactEmail}</a></strong></span></div>}
    {member.city && <div><MapPin size={16} /><span><small>{t('page.city')}</small><strong>{member.city}</strong></span></div>}
    {birthday && <div><Cake size={16} /><span><small>{t('page.birthday')}</small><strong>{birthday}</strong></span></div>}
  </div>;
}

interface OnboardingDialogProps {
  actor: User;
  departments: string[];
  createMember: (input: CreateTeamMemberInput) => Promise<User>;
  onCreated: (user: User) => void;
  onClose: () => void;
}

export function OnboardingDialog({ actor, departments, createMember, onCreated, onClose }: OnboardingDialogProps) {
  const { t } = useTranslation(['team', 'common']);
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
    } catch (reason) { setError(reason instanceof Error ? reason.message : t('add.failed')); }
    finally { setSaving(false); }
  };

  const copyCredentials = async () => {
    if (!created) return;
    try { await navigator.clipboard.writeText(`${created.username}\n${password}`); setCopied(true); }
    catch { setError(t('add.copyFailed')); }
  };

  if (created) return <Dialog open title={t('add.doneTitle')} description={t('add.doneText')} onClose={onClose} footer={<Button onClick={onClose}>{t('common:actions.done')}</Button>}><div className="onboarding-success"><span><UserCheck size={25} /></span><h3>{created.fullName}</h3><p>{created.jobTitle || roleLabel[created.role]} · {created.department}</p><dl><div><dt>{t('add.login')}</dt><dd><code>{created.username}</code></dd></div><div><dt>{t('add.tempPassword')}</dt><dd><code>{password}</code></dd></div></dl><Button variant="secondary" icon={copied ? Check : Copy} onClick={() => void copyCredentials()}>{copied ? t('add.copied') : t('add.copy')}</Button>{error && <div className="form-error" role="alert">{error}</div>}</div></Dialog>;

  return <Dialog open title={t('add.title')} description={t('add.text')} size="lg" onClose={() => { if (!saving) onClose(); }} footer={<><Button variant="secondary" disabled={saving} onClick={onClose}>{t('common:actions.cancel')}</Button><Button type="submit" form="onboarding-form" disabled={saving}>{saving ? t('add.creating') : t('page.add')}</Button></>}>
    <form id="onboarding-form" className="form-grid onboarding-form" onSubmit={(event) => void submit(event)}>
      <Field label={t('add.fullName')}><input name="fullName" autoFocus required minLength={2} maxLength={160} placeholder={t('add.fullNamePlaceholder')} /></Field>
      <Field label={t('add.login')}><input name="username" required minLength={3} maxLength={50} pattern="[A-Za-z0-9][A-Za-z0-9._-]*" autoComplete="off" placeholder="name.surname" /></Field>
      <SelectField label={t('add.role')} name="role" value={role} onChange={(event) => setRole(event.target.value as Role)} disabled={manager} aria-label={t('add.role')}><option value="EMPLOYEE">{t('common:roles.EMPLOYEE')}</option>{!manager && <option value="MANAGER">{t('common:roles.MANAGER')}</option>}{!manager && <option value="DIRECTOR">{t('common:roles.DIRECTOR')}</option>}</SelectField>
      {manager ? <Field label={t('add.department')}><input value={actor.department} disabled /></Field> : <Field label={role === 'DIRECTOR' ? t('add.departmentOptional') : t('add.department')}><input name="departmentName" list="department-options" required={role !== 'DIRECTOR'} maxLength={120} placeholder={t('add.departmentPlaceholder')} /><datalist id="department-options">{departments.map((department) => <option value={department} key={department} />)}</datalist></Field>}
      <Field label={t('add.jobTitle')}><input name="jobTitle" maxLength={160} placeholder={t('add.jobTitlePlaceholder')} /></Field>
      <Field label={t('page.specialty')}><input name="specialty" maxLength={160} placeholder={t('add.specialtyPlaceholder')} /></Field>
      <Field label={t('page.job')} className="field--wide"><textarea name="jobDescription" rows={3} maxLength={20000} placeholder={t('add.jobPlaceholder')} /></Field>
      <Field label={t('add.tempPassword')} hint={t('add.min12')} className="field--wide"><span className="input-with-icon onboarding-password"><KeyRound size={17} /><input type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} minLength={12} required autoComplete="new-password" aria-label={t('add.tempPassword')} /><IconButton type="button" label={showPassword ? t('add.hidePassword') : t('add.showPassword')} icon={showPassword ? EyeOff : Eye} onClick={() => setShowPassword((value) => !value)} /><Button type="button" variant="secondary" icon={RefreshCw} onClick={() => setPassword(generateTemporaryPassword())}>{t('add.generate')}</Button></span></Field>
      {error && <div className="form-error field--wide" role="alert">{error}</div>}
    </form>
  </Dialog>;
}

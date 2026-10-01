import { Check, LockKeyhole, Save, ShieldCheck } from 'lucide-react';
import { ChangePasswordDialog } from '../components/team/MemberDialogs';
import { useState, type FormEvent } from 'react';
import { Avatar, Badge, Button, Field, Meter, PageHeader, SectionHeader, Surface } from '../components/ui';
import { useAuth, useWorkspace } from '../context/AppContext';
import { ApiError } from '../lib/api';
import { formatDate, roleLabel } from '../lib/format';

export function ProfilePage() {
  const { session, consent, updateProfile, changePassword } = useAuth();
  const { refresh } = useWorkspace();
  const user = session!.user;
  const [consenting, setConsenting] = useState(false);
  const [fullName, setFullName] = useState(user.fullName);
  const [specialty, setSpecialty] = useState(user.specialty ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordChanged, setPasswordChanged] = useState(false);
  const dirty = fullName.trim() !== user.fullName || specialty.trim() !== (user.specialty ?? '');

  const accept = async () => { setConsenting(true); try { await consent(); } finally { setConsenting(false); } };
  const save = async (event?: FormEvent) => {
    event?.preventDefault();
    if (fullName.trim().length < 2) { setError('Укажите имя не короче 2 символов'); return; }
    setSaving(true); setError('');
    try {
      await updateProfile({ fullName: fullName.trim(), specialty: specialty.trim() });
      void refresh();
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1800);
    } catch (reason) {
      setError(reason instanceof ApiError && reason.status < 500 ? 'Проверьте имя и специализацию' : 'Не удалось сохранить профиль');
    } finally {
      setSaving(false);
    }
  };

  return <>
    <PageHeader title="Профиль" description="Учётная запись и личные настройки" action={<Button icon={saved ? Check : Save} disabled={saving || !dirty} onClick={() => void save()}>{saving ? 'Сохраняем…' : saved ? 'Сохранено' : 'Сохранить'}</Button>} />
    <div className="profile-layout">
      <Surface className="profile-identity">
        <div className="profile-identity__head"><Avatar name={user.fullName} online size="lg" /><div><h2>{user.fullName}</h2><span>@{user.username}</span><Badge tone="info">{roleLabel[user.role]}</Badge></div></div>
        <dl><div><dt>Должность</dt><dd>{user.jobTitle || 'Не указана'}</dd></div><div><dt>Отдел</dt><dd>{user.department}</dd></div><div><dt>Специализация</dt><dd>{user.specialty ?? 'Не указана'}</dd></div>{user.jobDescription && <div><dt>Должностная инструкция</dt><dd>{user.jobDescription}</dd></div>}</dl>
        <div className="profile-rating"><span><strong>{user.rating}</strong><small>рейтинг</small></span><Meter value={user.rating} /></div>
      </Surface>
      <div className="profile-settings">
        <Surface>
          <SectionHeader title="Личные данные" />
          <form className="settings-form" onSubmit={(event) => void save(event)}>
            <Field label="Полное имя"><input value={fullName} maxLength={160} onChange={(event) => setFullName(event.target.value)} /></Field>
            <Field label="Специализация" hint="Например: B2B-продажи, логистика"><input value={specialty} maxLength={160} onChange={(event) => setSpecialty(event.target.value)} /></Field>
            <Field label="Рабочий логин" hint="Должность, отдел и роль меняет руководитель"><input value={user.username} disabled /></Field>
            {error && <div className="form-error" role="alert">{error}</div>}
          </form>
        </Surface>
        <Surface className="consent-panel">
          <SectionHeader title="Согласие на мониторинг" meta={user.monitoringConsentAt ? <Badge tone="success">Принято</Badge> : <Badge tone="warning">Требуется</Badge>} />
          <p>Компания фиксирует статус присутствия, метаданные доступа к CRM, системные события и сроки задач. Содержание личной переписки не анализируется.</p>
          <div className="consent-meta"><ShieldCheck size={18} /><span><strong>Политика 2026-01</strong><small>{user.monitoringConsentAt ? `Согласие дано ${formatDate(user.monitoringConsentAt)}` : 'Ознакомьтесь и подтвердите согласие'}</small></span></div>
          {!user.monitoringConsentAt && <Button icon={Check} disabled={consenting} onClick={() => void accept()}>{consenting ? 'Подтверждаем…' : 'Принять политику'}</Button>}
        </Surface>
        <Surface>
          <SectionHeader title="Безопасность" />
          <div className="security-rows"><div><span className="settings-icon"><LockKeyhole size={17} /></span><span><strong>Пароль</strong><small>{passwordChanged ? 'Пароль изменён, другие сеансы завершены' : 'При смене пароля другие сеансы завершатся'}</small></span><Button variant="secondary" onClick={() => setPasswordOpen(true)}>Изменить пароль</Button></div></div>
        </Surface>
      </div>
    </div>
    {passwordOpen && <ChangePasswordDialog change={async (current, next) => { await changePassword(current, next); setPasswordChanged(true); }} onClose={() => setPasswordOpen(false)} />}
  </>;
}

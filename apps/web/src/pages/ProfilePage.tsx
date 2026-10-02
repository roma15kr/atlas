import { Camera, Check, LockKeyhole, Save, ShieldCheck, Sparkles, Trash2 } from 'lucide-react';
import { AiAnalysisDialog } from '../components/AiAnalysisDialog';
import { ChangePasswordDialog } from '../components/team/MemberDialogs';
import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Avatar, Badge, Button, Field, Meter, PageHeader, SectionHeader, Surface } from '../components/ui';
import { useAuth } from '../context/AppContext';
import { ApiError } from '../lib/api';
import { formatDate, roleLabel } from '../lib/format';
import { ImagePreparationError, prepareAvatar } from '../lib/image';
import { ABOUT_MAX, changedProfileFields, formatBirthday, latestBirthDate, profileFormOf, validateProfile, type ProfileErrors, type ProfileForm } from '../lib/profile';

const serverFieldErrors: Partial<Record<keyof ProfileForm, string>> = {
  fullName: 'Укажите имя не короче 2 символов', birthDate: 'Проверьте дату рождения', phone: 'Проверьте номер телефона',
  contactEmail: 'Укажите корректный email', city: 'Слишком длинное название', about: `Не длиннее ${ABOUT_MAX} символов`,
};

export function ProfilePage() {
  const { session, consent, updateProfile, uploadAvatar, removeAvatar, changePassword } = useAuth();
  const user = session!.user;
  const saved = useMemo(() => profileFormOf(user), [user]);
  const [form, setForm] = useState<ProfileForm>(saved);
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [consenting, setConsenting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState('');
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [passwordChanged, setPasswordChanged] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const patch = changedProfileFields(form, saved);
  const dirty = Object.keys(patch).length > 0;
  const birthday = formatBirthday(user.birthDate);

  const set = <K extends keyof ProfileForm>(key: K) => (value: ProfileForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };
  const text = (key: Exclude<keyof ProfileForm, 'showBirthday'>) => ({
    value: form[key], 'aria-invalid': Boolean(errors[key]) || undefined,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(key)(event.target.value),
  });

  const accept = async () => { setConsenting(true); try { await consent(); } finally { setConsenting(false); } };
  const save = async (event?: FormEvent) => {
    event?.preventDefault();
    const found = validateProfile(form);
    setErrors(found);
    if (Object.keys(found).length) { setError(''); return; }
    if (!dirty) return;
    setSaving(true); setError('');
    try {
      await updateProfile(patch);
      setForm((current) => ({ ...current, ...Object.fromEntries(Object.entries(patch)) }));
      setJustSaved(true);
      window.setTimeout(() => setJustSaved(false), 1800);
    } catch (reason) {
      const fields = reason instanceof ApiError ? (reason.details as { fieldErrors?: Record<string, string[]> } | undefined)?.fieldErrors : undefined;
      const mapped = Object.fromEntries(Object.keys(fields ?? {}).filter((key) => key in serverFieldErrors).map((key) => [key, serverFieldErrors[key as keyof ProfileForm]]));
      if (Object.keys(mapped).length) setErrors(mapped);
      else setError(reason instanceof ApiError && reason.status < 500 ? 'Проверьте заполненные поля' : 'Не удалось сохранить профиль');
    } finally {
      setSaving(false);
    }
  };

  const pickPhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setPhotoBusy(true); setPhotoError('');
    try {
      await uploadAvatar(await prepareAvatar(file));
    } catch (reason) {
      setPhotoError(reason instanceof ImagePreparationError ? reason.message
        : reason instanceof ApiError && reason.status === 413 ? 'Фото слишком большое' : 'Не удалось загрузить фото');
    } finally {
      setPhotoBusy(false);
    }
  };
  const dropPhoto = async () => {
    setPhotoBusy(true); setPhotoError('');
    try { await removeAvatar(); } catch { setPhotoError('Не удалось удалить фото'); } finally { setPhotoBusy(false); }
  };

  return <>
    <PageHeader title="Профиль" description="Учётная запись и личные данные" action={<Button icon={justSaved ? Check : Save} disabled={saving || !dirty} onClick={() => void save()}>{saving ? 'Сохраняем…' : justSaved ? 'Сохранено' : 'Сохранить'}</Button>} />
    <div className="profile-layout">
      <Surface className="profile-identity">
        <div className="profile-identity__head"><Avatar name={user.fullName} src={user.avatarUrl} online size="xl" /><div><h2>{user.fullName}</h2><span>@{user.username}</span><Badge tone="info">{roleLabel[user.role]}</Badge></div></div>
        <div className="profile-photo">
          <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" hidden aria-label="Файл фото" onChange={(event) => void pickPhoto(event)} />
          <div className="profile-photo__actions">
            <Button variant="secondary" icon={Camera} disabled={photoBusy} onClick={() => fileInput.current?.click()}>{photoBusy ? 'Обрабатываем…' : user.avatarUrl ? 'Заменить фото' : 'Загрузить фото'}</Button>
            {user.avatarUrl && <Button variant="ghost" icon={Trash2} disabled={photoBusy} onClick={() => void dropPhoto()}>Удалить</Button>}
          </div>
          {photoError ? <small className="field__error" role="alert">{photoError}</small> : <small>JPEG, PNG или WebP. Фото обрежется до квадрата, данные камеры и геолокация удаляются.</small>}
        </div>
        <dl>
          <div><dt>Должность</dt><dd>{user.jobTitle || 'Не указана'}</dd></div>
          <div><dt>Отдел</dt><dd>{user.department}</dd></div>
          <div><dt>Специализация</dt><dd>{user.specialty ?? 'Не указана'}</dd></div>
          {birthday && <div><dt>День рождения</dt><dd>{birthday}{user.showBirthday === false && <small> · скрыт от коллег</small>}</dd></div>}
          <div className="profile-job-description"><dt>Должностная инструкция</dt><dd>{user.jobDescription?.trim() ? user.jobDescription : <span className="muted">Не заполнена — заполняет руководитель</span>}</dd></div>
        </dl>
        <div className="profile-rating"><span><strong>{user.rating}</strong><small>рейтинг</small></span><Meter value={user.rating} /></div>
      </Surface>
      <div className="profile-settings">
        <Surface>
          <SectionHeader title="Личные данные" meta={dirty ? <Badge tone="warning">Есть несохранённые изменения</Badge> : undefined} />
          <form className="settings-form" noValidate onSubmit={(event) => void save(event)}>
            <Field label="Полное имя" error={errors.fullName}><input maxLength={160} autoComplete="name" {...text('fullName')} /></Field>
            <Field label="Специализация" hint="Например: B2B-продажи, логистика"><input maxLength={160} {...text('specialty')} /></Field>
            <Field label="Дата рождения" hint="Коллеги видят только день и месяц" error={errors.birthDate}><input type="date" min="1900-01-01" max={latestBirthDate()} autoComplete="bday" {...text('birthDate')} /></Field>
            <Field label="Телефон" hint="Рабочий номер для связи" error={errors.phone}><input type="tel" maxLength={40} autoComplete="tel" placeholder="+380 67 123 45 67" {...text('phone')} /></Field>
            <Field label="Email для связи" error={errors.contactEmail}><input type="email" maxLength={254} autoComplete="email" placeholder="name@company.com" {...text('contactEmail')} /></Field>
            <Field label="Город" error={errors.city}><input maxLength={120} autoComplete="address-level2" {...text('city')} /></Field>
            <Field label="О себе" className="field--wide" hint={`${form.about.length} / ${ABOUT_MAX}`} error={errors.about}><textarea rows={3} maxLength={ABOUT_MAX} placeholder="Чем занимаетесь, в чём можете помочь коллегам" {...text('about')} /></Field>
            <label className="check-field field--wide"><input type="checkbox" checked={form.showBirthday} onChange={(event) => set('showBirthday')(event.target.checked)} /><span><strong>Показывать коллегам день рождения</strong><small>Только день и месяц, без года</small></span></label>
            <Field label="Рабочий логин" hint="Должность, отдел и роль меняет руководитель"><input value={user.username} disabled /></Field>
            {error && <div className="form-error field--wide" role="alert">{error}</div>}
            <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
          </form>
        </Surface>
        <Surface className="consent-panel">
          <SectionHeader title="Согласие на мониторинг" meta={user.monitoringConsentAt ? <Badge tone="success">Принято</Badge> : <Badge tone="warning">Требуется</Badge>} />
          <p>Компания фиксирует статус присутствия, метаданные доступа к CRM, системные события и сроки задач. Содержание личной переписки не анализируется.</p>
          <div className="consent-meta"><ShieldCheck size={18} /><span><strong>Политика 2026-01</strong><small>{user.monitoringConsentAt ? `Согласие дано ${formatDate(user.monitoringConsentAt)}` : 'Ознакомьтесь и подтвердите согласие'}</small></span></div>
          {!user.monitoringConsentAt && <Button icon={Check} disabled={consenting} onClick={() => void accept()}>{consenting ? 'Подтверждаем…' : 'Принять политику'}</Button>}
        </Surface>
        <Surface>
          <SectionHeader title="AI-рекомендации" />
          <div className="security-rows"><div><span className="settings-icon"><Sparkles size={17} /></span><span><strong>Совет, оценка или прогноз</strong><small>По вашим KPI, задачам и воронке. Переписка не анализируется.</small></span><Button variant="secondary" onClick={() => setAiOpen(true)}>Открыть</Button></div></div>
        </Surface>
        <Surface>
          <SectionHeader title="Безопасность" />
          <div className="security-rows"><div><span className="settings-icon"><LockKeyhole size={17} /></span><span><strong>Пароль</strong><small>{passwordChanged ? 'Пароль изменён, другие сеансы завершены' : 'При смене пароля другие сеансы завершатся'}</small></span><Button variant="secondary" onClick={() => setPasswordOpen(true)}>Изменить пароль</Button></div></div>
        </Surface>
      </div>
    </div>
    {aiOpen && <AiAnalysisDialog targetUserId={user.id} targetName={user.fullName} onClose={() => setAiOpen(false)} />}
    {passwordOpen && <ChangePasswordDialog change={async (current, next) => { await changePassword(current, next); setPasswordChanged(true); }} onClose={() => setPasswordOpen(false)} />}
  </>;
}

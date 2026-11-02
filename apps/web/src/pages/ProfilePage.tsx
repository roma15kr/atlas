import { useTranslation } from 'react-i18next';
import { Camera, Check, LockKeyhole, Save, ShieldCheck, Sparkles, Trash2 } from 'lucide-react';
import { RichTextView } from '../components/richtext/RichTextView';
import { AppInstall } from '../components/AppInstall';
import { NotificationSettings } from '../components/NotificationSettings';
import { AiAnalysisDialog } from '../components/AiAnalysisDialog';
import { ChangePasswordDialog } from '../components/team/MemberDialogs';
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Avatar, Badge, Button, Field, Meter, PageHeader, SectionHeader, Surface } from '../components/ui';
import { LanguageSettings } from '../components/LanguageSettings';
import { useAuth } from '../context/AppContext';
import { ApiError } from '../lib/api';
import { formatDate, roleLabel } from '../lib/format';
import { ImagePreparationError, prepareAvatar } from '../lib/image';
import i18n from '../i18n';
import { ABOUT_MAX, changedProfileFields, formatBirthday, latestBirthDate, profileFormOf, validateProfile, type ProfileErrors, type ProfileForm } from '../lib/profile';

const serverFieldErrors = (): Partial<Record<keyof ProfileForm, string>> => ({
  fullName: i18n.t('profile:errors.fullName'), birthDate: i18n.t('profile:errors.birthCheck'), phone: i18n.t('profile:errors.phoneCheck'),
  contactEmail: i18n.t('profile:errors.email'), city: i18n.t('profile:errors.cityLong'), about: i18n.t('profile:errors.about', { max: ABOUT_MAX }),
});

export function ProfilePage() {
  const { t } = useTranslation(['profile', 'common']);
  // «Сохранено» hides after a moment; the timer must not outlive the page.
  const savedTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(savedTimer.current), []);
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
      window.clearTimeout(savedTimer.current);
      savedTimer.current = window.setTimeout(() => setJustSaved(false), 1800);
    } catch (reason) {
      const fields = reason instanceof ApiError ? (reason.details as { fieldErrors?: Record<string, string[]> } | undefined)?.fieldErrors : undefined;
      const mapped = Object.fromEntries(Object.keys(fields ?? {}).filter((key) => key in serverFieldErrors()).map((key) => [key, serverFieldErrors()[key as keyof ProfileForm]]));
      if (Object.keys(mapped).length) setErrors(mapped);
      else setError(reason instanceof ApiError && reason.status < 500 ? t('page.checkFields') : t('page.saveFailed'));
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
        : reason instanceof ApiError && reason.status === 413 ? t('photo.tooBig') : t('photo.uploadFailed'));
    } finally {
      setPhotoBusy(false);
    }
  };
  const dropPhoto = async () => {
    setPhotoBusy(true); setPhotoError('');
    try { await removeAvatar(); } catch { setPhotoError(t('photo.removeFailed')); } finally { setPhotoBusy(false); }
  };

  return <>
    <PageHeader title={t('page.title')} description={t('page.description')} action={<Button icon={justSaved ? Check : Save} disabled={saving || !dirty} onClick={() => void save()}>{saving ? t('page.saving') : justSaved ? t('page.saved') : t('page.save')}</Button>} />
    <div className="profile-layout">
      <Surface className="profile-identity">
        <div className="profile-identity__head"><Avatar name={user.fullName} src={user.avatarUrl} online size="xl" /><div><h2>{user.fullName}</h2><span>@{user.username}</span><Badge tone="info">{roleLabel[user.role]}</Badge></div></div>
        <div className="profile-photo">
          <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" hidden aria-label={t('photo.file')} onChange={(event) => void pickPhoto(event)} />
          <div className="profile-photo__actions">
            <Button variant="secondary" icon={Camera} disabled={photoBusy} onClick={() => fileInput.current?.click()}>{photoBusy ? t('photo.processing') : user.avatarUrl ? t('photo.replace') : t('photo.upload')}</Button>
            {user.avatarUrl && <Button variant="ghost" icon={Trash2} disabled={photoBusy} onClick={() => void dropPhoto()}>{t('photo.remove')}</Button>}
          </div>
          {photoError ? <small className="field__error" role="alert">{photoError}</small> : <small>{t('photo.hint')}</small>}
        </div>
        <dl>
          <div><dt>{t('facts.jobTitle')}</dt><dd>{user.jobTitle || t('facts.notSpecified')}</dd></div>
          <div><dt>{t('facts.department')}</dt><dd>{user.department}</dd></div>
          <div><dt>{t('facts.specialty')}</dt><dd>{user.specialty ?? t('facts.notSpecified')}</dd></div>
          {birthday && <div><dt>{t('facts.birthday')}</dt><dd>{birthday}{user.showBirthday === false && <small> {t('facts.hidden')}</small>}</dd></div>}
          <div className="profile-job-description"><dt>{t('facts.job')}</dt><dd>{user.jobDescription?.trim() ? <RichTextView markdown={user.jobDescription} /> : <span className="muted">{t('facts.jobEmpty')}</span>}</dd></div>
        </dl>
        <div className="profile-rating"><span><strong>{user.rating}</strong><small>{t('facts.rating')}</small></span><Meter value={user.rating} /></div>
      </Surface>
      <div className="profile-settings">
        <Surface>
          <SectionHeader title={t('form.title')} meta={dirty ? <Badge tone="warning">{t('form.unsaved')}</Badge> : undefined} />
          <form className="settings-form" noValidate onSubmit={(event) => void save(event)}>
            <Field label={t('form.fullName')} error={errors.fullName}><input maxLength={160} autoComplete="name" {...text('fullName')} /></Field>
            <Field label={t('facts.specialty')} hint={t('form.specialtyPlaceholder')}><input maxLength={160} {...text('specialty')} /></Field>
            <Field label={t('form.birthDate')} hint={t('form.birthDateHint')} error={errors.birthDate}><input type="date" min="1900-01-01" max={latestBirthDate()} autoComplete="bday" {...text('birthDate')} /></Field>
            <Field label={t('form.phone')} hint={t('form.phoneHint')} error={errors.phone}><input type="tel" maxLength={40} autoComplete="tel" placeholder="+380 67 123 45 67" {...text('phone')} /></Field>
            <Field label={t('form.email')} error={errors.contactEmail}><input type="email" maxLength={254} autoComplete="email" placeholder="name@company.com" {...text('contactEmail')} /></Field>
            <Field label={t('form.city')} error={errors.city}><input maxLength={120} autoComplete="address-level2" {...text('city')} /></Field>
            <Field label={t('form.about')} className="field--wide" hint={`${form.about.length} / ${ABOUT_MAX}`} error={errors.about}><textarea rows={3} maxLength={ABOUT_MAX} placeholder={t('form.aboutPlaceholder')} {...text('about')} /></Field>
            <label className="check-field field--wide"><input type="checkbox" checked={form.showBirthday} onChange={(event) => set('showBirthday')(event.target.checked)} /><span><strong>{t('form.showBirthday')}</strong><small>{t('form.showBirthdayHint')}</small></span></label>
            <Field label={t('form.login')} hint={t('form.managedHint')}><input value={user.username} disabled /></Field>
            {error && <div className="form-error field--wide" role="alert">{error}</div>}
            <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
          </form>
        </Surface>
        <Surface className="consent-panel">
          <SectionHeader title={t('consent.title')} meta={user.monitoringConsentAt ? <Badge tone="success">{t('consent.accepted')}</Badge> : <Badge tone="warning">{t('consent.required')}</Badge>} />
          <p>{t('consent.text')}</p>
          <div className="consent-meta"><ShieldCheck size={18} /><span><strong>{t('consent.policy')}</strong><small>{user.monitoringConsentAt ? t('consent.given', { date: formatDate(user.monitoringConsentAt) }) : t('consent.review')}</small></span></div>
          {!user.monitoringConsentAt && <Button icon={Check} disabled={consenting} onClick={() => void accept()}>{consenting ? t('consent.accepting') : t('consent.accept')}</Button>}
        </Surface>
        <LanguageSettings />
        <AppInstall />
        <NotificationSettings />
        <Surface>
          <SectionHeader title={t('ai.title')} />
          <div className="security-rows"><div><span className="settings-icon"><Sparkles size={17} /></span><span><strong>{t('ai.label')}</strong><small>{t('ai.text')}</small></span><Button variant="secondary" onClick={() => setAiOpen(true)}>{t('ai.open')}</Button></div></div>
        </Surface>
        <Surface>
          <SectionHeader title={t('security.title')} />
          <div className="security-rows"><div><span className="settings-icon"><LockKeyhole size={17} /></span><span><strong>{t('security.password')}</strong><small>{passwordChanged ? t('security.changed') : t('security.note')}</small></span><Button variant="secondary" onClick={() => setPasswordOpen(true)}>{t('security.change')}</Button></div></div>
        </Surface>
      </div>
    </div>
    {aiOpen && <AiAnalysisDialog targetUserId={user.id} targetName={user.fullName} onClose={() => setAiOpen(false)} />}
    {passwordOpen && <ChangePasswordDialog change={async (current, next) => { await changePassword(current, next); setPasswordChanged(true); }} onClose={() => setPasswordOpen(false)} />}
  </>;
}

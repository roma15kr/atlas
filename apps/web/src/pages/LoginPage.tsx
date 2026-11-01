import { ArrowRight, CheckCircle2, Eye, EyeOff, LockKeyhole, UserRound } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { DEMO_MODE, useAuth } from '../context/AppContext';
import { ApiError } from '../lib/api';
import { Button, IconButton } from '../components/ui';
import { useTranslation } from 'react-i18next';
import i18n, { applyLanguage, LANGUAGES } from '../i18n';

/** What went wrong, in words a colleague understands; the server's texts are English and terse. */
export function loginErrorMessage(reason: unknown): string {
  if (!(reason instanceof ApiError)) return i18n.t('shell:login.errors.network');
  if (reason.status === 429) {
    const minutes = Math.max(1, Math.ceil((reason.retryAfterSeconds ?? 15 * 60) / 60));
    return i18n.t('shell:login.errors.rateLimited', { minutes });
  }
  if (reason.status === 401) return i18n.t('shell:login.errors.invalid');
  if (reason.code === 'MANAGER_DEPARTMENT_REQUIRED') return i18n.t('shell:login.errors.noDepartment');
  if (reason.status === 400) return i18n.t('shell:login.errors.badInput');
  return i18n.t('shell:login.errors.unavailable');
}

const CYRILLIC = /[А-Яа-яЁёЇїІіЄєҐґ]/;
/** A phone number or an email typed where the login goes. */
const looksLikeContact = (value: string) => value.includes('@') || (/^[\d\s+()-]+$/.test(value.trim()) && (value.match(/\d/g)?.length ?? 0) >= 7);

export function LoginPage() {
  const { session, login, loading } = useAuth();
  const location = useLocation();
  const [username, setUsername] = useState(DEMO_MODE ? 'director' : '');
  const [password, setPassword] = useState(DEMO_MODE ? 'AtlasDemo2026!' : '');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [capsLock, setCapsLock] = useState(false);
  const { t, i18n: active } = useTranslation('shell');
  const { t: common } = useTranslation();
  const usernameHint = looksLikeContact(username) ? t('login.contactHint') : CYRILLIC.test(username) ? t('login.cyrillicHint') : '';

  if (session) return <Navigate to={(location.state as { from?: string } | null)?.from ?? '/'} replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    try { await login(username, password); }
    catch (reason) { setError(loginErrorMessage(reason)); }
  };

  const chooseDemo = (name: string) => { setUsername(name); setPassword('AtlasDemo2026!'); setError(''); };

  return <main className="login-page">
    <section className="login-visual" aria-label={t('login.visual')}><img src="/assets/atlas-office.png" alt={t('login.photo')} /><div className="login-visual__shade" /><div className="login-visual__brand"><span className="brand-mark brand-mark--light">A</span><strong>ATLAS</strong></div><div className="login-visual__caption"><span>{t('login.day')}</span><strong>{t('login.tagline1')}<br />{t('login.tagline2')}</strong>{DEMO_MODE && <div><span><CheckCircle2 size={16} /> {t('login.demoReady')}</span><span><CheckCircle2 size={16} /> {t('login.demoData')}</span></div>}</div></section>
    <section className="login-panel"><div className="login-box"><div className="login-box__heading"><span className="login-mobile-brand"><i className="brand-mark">A</i> ATLAS</span><p>{t('login.welcome')}</p><h1>{t('login.title')}</h1><span>{t('login.subtitle')}</span></div><div className="segmented login-language" role="radiogroup" aria-label={t('login.language')}>{LANGUAGES.map((language) => <button key={language} type="button" role="radio" lang={language} aria-checked={active.language === language} className={active.language === language ? 'is-active' : ''} onClick={() => void applyLanguage(language)}>{common(`languages.${language}`)}</button>)}</div><form onSubmit={submit} className="login-form"><label className="field"><span>{t('login.username')}</span><span className="input-with-icon"><UserRound size={17} /><input autoFocus autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder={t('login.usernamePlaceholder')} required /></span>{usernameHint && <small className="form-hint form-hint--danger" role="status">{usernameHint}</small>}</label><label className="field"><span>{t('login.password')}</span><span className="input-with-icon"><LockKeyhole size={17} /><input type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} onKeyDown={(event) => setCapsLock(event.getModifierState('CapsLock'))} onKeyUp={(event) => setCapsLock(event.getModifierState('CapsLock'))} onBlur={() => setCapsLock(false)} placeholder={t('login.passwordPlaceholder')} required /><IconButton type="button" label={showPassword ? t('login.hidePassword') : t('login.showPassword')} icon={showPassword ? EyeOff : Eye} onClick={() => setShowPassword((value) => !value)} /></span>{capsLock && <small className="form-hint form-hint--danger" role="status">{t('login.capsLock')}</small>}</label>{error && <div className="form-error" role="alert">{error}</div>}<Button type="submit" disabled={loading} className="login-submit">{loading ? t('login.submitting') : t('login.submit')}<ArrowRight size={17} /></Button></form>{DEMO_MODE && <div className="demo-access"><span>{t('login.demoProfiles')}</span><div><button type="button" onClick={() => chooseDemo('director')}>{common('roles.DIRECTOR')}</button><button type="button" onClick={() => chooseDemo('manager')}>{common('roles.MANAGER')}</button><button type="button" onClick={() => chooseDemo('employee')}>{common('roles.EMPLOYEE')}</button></div></div>}<footer>{t('login.footer')}</footer></div></section>
  </main>;
}

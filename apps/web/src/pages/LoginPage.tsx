import { ArrowRight, CheckCircle2, Eye, EyeOff, LockKeyhole, UserRound } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { DEMO_MODE, useAuth } from '../context/AppContext';
import { ApiError } from '../lib/api';
import { Button, IconButton } from '../components/ui';

/** What went wrong, in words a colleague understands; the server's texts are English and terse. */
export function loginErrorMessage(reason: unknown): string {
  if (!(reason instanceof ApiError)) return 'Не удалось войти. Проверьте подключение к интернету и повторите попытку.';
  if (reason.status === 429) {
    const minutes = Math.max(1, Math.ceil((reason.retryAfterSeconds ?? 15 * 60) / 60));
    return `Слишком много попыток входа. Повторите через ${minutes} мин.`;
  }
  if (reason.status === 401) return 'Неверный логин или пароль. После 5 неудачных попыток вход блокируется на 15 минут.';
  if (reason.code === 'MANAGER_DEPARTMENT_REQUIRED') return 'Учётная запись руководителя не привязана к отделу. Обратитесь к директору.';
  if (reason.status === 400) return 'Проверьте логин и пароль: пароль не короче 8 символов.';
  return 'Сервер сейчас недоступен. Повторите попытку через минуту.';
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
  const usernameHint = looksLikeContact(username) ? 'Входите по логину (например, ivanenko), а не по телефону или email. Логин выдаёт руководитель.'
    : CYRILLIC.test(username) ? 'Логин вводится латиницей — переключите раскладку.' : '';

  if (session) return <Navigate to={(location.state as { from?: string } | null)?.from ?? '/'} replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    try { await login(username, password); }
    catch (reason) { setError(loginErrorMessage(reason)); }
  };

  const chooseDemo = (name: string) => { setUsername(name); setPassword('AtlasDemo2026!'); setError(''); };

  return <main className="login-page">
    <section className="login-visual" aria-label="Рабочее пространство Atlas"><img src="/assets/atlas-office.png" alt="Современный офис команды Atlas" /><div className="login-visual__shade" /><div className="login-visual__brand"><span className="brand-mark brand-mark--light">A</span><strong>ATLAS</strong></div><div className="login-visual__caption"><span>Рабочий день</span><strong>Команда, клиенты и решения<br />в одном рабочем пространстве.</strong>{DEMO_MODE && <div><span><CheckCircle2 size={16} /> Демо-команда готова</span><span><CheckCircle2 size={16} /> Данные для обзора загружены</span></div>}</div></section>
    <section className="login-panel"><div className="login-box"><div className="login-box__heading"><span className="login-mobile-brand"><i className="brand-mark">A</i> ATLAS</span><p>Добро пожаловать</p><h1>Вход в рабочее пространство</h1><span>Используйте корпоративную учётную запись</span></div><form onSubmit={submit} className="login-form"><label className="field"><span>Логин</span><span className="input-with-icon"><UserRound size={17} /><input autoFocus autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Ваш логин" required /></span>{usernameHint && <small className="form-hint form-hint--danger" role="status">{usernameHint}</small>}</label><label className="field"><span>Пароль</span><span className="input-with-icon"><LockKeyhole size={17} /><input type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} onKeyDown={(event) => setCapsLock(event.getModifierState('CapsLock'))} onKeyUp={(event) => setCapsLock(event.getModifierState('CapsLock'))} onBlur={() => setCapsLock(false)} placeholder="Ваш пароль" required /><IconButton type="button" label={showPassword ? 'Скрыть пароль' : 'Показать пароль'} icon={showPassword ? EyeOff : Eye} onClick={() => setShowPassword((value) => !value)} /></span>{capsLock && <small className="form-hint form-hint--danger" role="status">Включён Caps Lock</small>}</label>{error && <div className="form-error" role="alert">{error}</div>}<Button type="submit" disabled={loading} className="login-submit">{loading ? 'Входим…' : 'Войти'}<ArrowRight size={17} /></Button></form>{DEMO_MODE && <div className="demo-access"><span>Демо-профили</span><div><button type="button" onClick={() => chooseDemo('director')}>Директор</button><button type="button" onClick={() => chooseDemo('manager')}>Руководитель</button><button type="button" onClick={() => chooseDemo('employee')}>Сотрудник</button></div></div>}<footer>Atlas Virtual Office · защищённое соединение</footer></div></section>
  </main>;
}

import { BellRing, Send } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AppContext';
import { disablePush, enablePush, loadPreferences, pushState, savePreferences, sendTestPush, type NotificationPreferences, type PushState } from '../lib/notifications';
import { Badge, Button, SectionHeader, Surface } from './ui';

const groups: Array<{ key: keyof NotificationPreferences; label: string; hint: string }> = [
  { key: 'tasks', label: 'Задачи', hint: 'Назначили задачу, комментарий, срок сегодня или просрочка' },
  { key: 'chat', label: 'Сообщения', hint: 'Личные сообщения и упоминания' },
  { key: 'telegram', label: 'Telegram', hint: 'Новые сообщения ваших клиентов' },
  { key: 'alerts', label: 'Сигналы и CRM', hint: 'AI-сигналы, переданные вам сделки и клиенты' },
];

const status: Record<PushState, { tone: 'success' | 'neutral' | 'warning'; label: string }> = {
  on: { tone: 'success', label: 'Включены в этом браузере' },
  off: { tone: 'neutral', label: 'Выключены' },
  blocked: { tone: 'warning', label: 'Заблокированы браузером' },
  unavailable: { tone: 'neutral', label: 'Недоступны' },
  unsupported: { tone: 'neutral', label: 'Не поддерживаются' },
};

/** «Профиль → Уведомления»: desktop notifications for this browser and which groups pop up. */
export function NotificationSettings() {
  const { session } = useAuth();
  const demo = session!.accessToken.startsWith('demo-');
  const location = useLocation();
  const [state, setState] = useState<PushState | null>(demo ? 'unavailable' : null);
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (demo) return;
    pushState().then(setState).catch(() => setState('unavailable'));
    loadPreferences().then(setPreferences).catch(() => undefined);
  }, [demo]);
  useEffect(() => { if (location.hash === '#notifications') document.getElementById('notifications')?.scrollIntoView?.({ block: 'start' }); }, [location.hash]);

  const run = async (action: () => Promise<PushState>) => {
    setBusy(true); setError(''); setMessage('');
    try { setState(await action()); } catch { setError('Не удалось изменить настройку. Обновите страницу и попробуйте ещё раз.'); } finally { setBusy(false); }
  };
  const toggle = async (key: keyof NotificationPreferences, value: boolean) => {
    if (!preferences) return;
    const previous = preferences;
    setPreferences({ ...preferences, [key]: value }); setError('');
    try { setPreferences(await savePreferences({ [key]: value })); } catch { setPreferences(previous); setError('Настройка не сохранена'); }
  };
  const test = async () => {
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await sendTestPush();
      setMessage(result.delivered ? 'Проверочное уведомление отправлено — оно появится в углу экрана.' : 'Не удалось доставить уведомление. Отключите и включите уведомления снова.');
    } catch { setError('Проверка не удалась'); } finally { setBusy(false); }
  };

  return <Surface id="notifications" className="notification-settings">
    <SectionHeader title="Уведомления" meta={state ? <Badge tone={status[state].tone}>{status[state].label}</Badge> : undefined} />
    <p className="dialog-note">Все уведомления видны под колокольчиком вверху. На компьютере и телефоне они всплывают, даже когда Atlas закрыт или свёрнут, а экран заблокирован.</p>
    {state === 'unsupported' && <p className="form-hint">Этот браузер не поддерживает всплывающие уведомления. Используйте Google Chrome, а на iPhone — установленное приложение Atlas.</p>}
    {state === 'unavailable' && <p className="form-hint">{demo ? 'В демо-режиме всплывающие уведомления недоступны.' : 'Всплывающие уведомления ещё не настроены на сервере. Обратитесь к администратору.'}</p>}
    {state === 'blocked' && <p className="form-hint form-hint--danger">Chrome запретил уведомления для Atlas. Нажмите на значок замка слева от адреса, откройте «Настройки сайтов» и выберите «Уведомления: Разрешить», затем обновите страницу.</p>}
    <div className="notification-settings__actions">
      {state === 'off' && <Button icon={BellRing} disabled={busy} onClick={() => void run(enablePush)}>Включить на этом устройстве</Button>}
      {state === 'on' && <><Button variant="secondary" icon={Send} disabled={busy} onClick={() => void test()}>Проверить</Button><Button variant="ghost" disabled={busy} onClick={() => void run(disablePush)}>Отключить</Button></>}
    </div>
    {message && <div className="notice" role="status">{message}</div>}
    {error && <div className="form-error" role="alert">{error}</div>}
    {preferences && state !== 'unsupported' && state !== 'unavailable' && <div className="settings-form settings-form--single">{groups.map((group) => <label className="switch-row" key={group.key}>
      <span><span><strong>{group.label}</strong><small>{group.hint}</small></span></span>
      <input type="checkbox" role="switch" aria-label={`${group.label}: всплывающие уведомления`} checked={preferences[group.key]} onChange={(event) => void toggle(group.key, event.target.checked)} />
    </label>)}</div>}
  </Surface>;
}

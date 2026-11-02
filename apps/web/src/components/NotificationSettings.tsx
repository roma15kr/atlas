import { useTranslation } from 'react-i18next';
import { BellRing, Send } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AppContext';
import { disablePush, enablePush, loadPreferences, pushState, savePreferences, sendTestPush, type NotificationPreferences, type PushState } from '../lib/notifications';
import { Badge, Button, SectionHeader, Surface } from './ui';

const GROUPS: Array<keyof NotificationPreferences> = ['tasks', 'chat', 'telegram', 'alerts'];

const TONE: Record<PushState, 'success' | 'neutral' | 'warning'> = { on: 'success', off: 'neutral', blocked: 'warning', unavailable: 'neutral', unsupported: 'neutral' };

/** «Профиль → Уведомления»: desktop notifications for this browser and which groups pop up. */
export function NotificationSettings() {
  const { t } = useTranslation(['profile', 'common']);
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
    try { setState(await action()); } catch { setError(t('notifications.changeFailed')); } finally { setBusy(false); }
  };
  const toggle = async (key: keyof NotificationPreferences, value: boolean) => {
    if (!preferences) return;
    const previous = preferences;
    setPreferences({ ...preferences, [key]: value }); setError('');
    try { setPreferences(await savePreferences({ [key]: value })); } catch { setPreferences(previous); setError(t('notifications.saveFailed')); }
  };
  const test = async () => {
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await sendTestPush();
      setMessage(result.delivered ? t('notifications.testSent') : t('notifications.testUndelivered'));
    } catch { setError(t('notifications.testFailed')); } finally { setBusy(false); }
  };

  return <Surface id="notifications" className="notification-settings">
    <SectionHeader title={t('notifications.title')} meta={state ? <Badge tone={TONE[state]}>{t(`notifications.state.${state}`)}</Badge> : undefined} />
    <p className="dialog-note">{t('notifications.intro')}</p>
    {state === 'unsupported' && <p className="form-hint">{t('notifications.unsupported')}</p>}
    {state === 'unavailable' && <p className="form-hint">{demo ? t('notifications.demo') : t('notifications.serverOff')}</p>}
    {state === 'blocked' && <p className="form-hint form-hint--danger">{t('notifications.blocked')}</p>}
    <div className="notification-settings__actions">
      {state === 'off' && <Button icon={BellRing} disabled={busy} onClick={() => void run(enablePush)}>{t('notifications.enable')}</Button>}
      {state === 'on' && <><Button variant="secondary" icon={Send} disabled={busy} onClick={() => void test()}>{t('notifications.test')}</Button><Button variant="ghost" disabled={busy} onClick={() => void run(disablePush)}>{t('notifications.disable')}</Button></>}
    </div>
    {message && <div className="notice" role="status">{message}</div>}
    {error && <div className="form-error" role="alert">{error}</div>}
    {preferences && state !== 'unsupported' && state !== 'unavailable' && <div className="settings-form settings-form--single">{GROUPS.map((group) => <label className="switch-row" key={group}>
      <span><span><strong>{t(`notifications.groups.${group}`)}</strong><small>{t(`notifications.groups.${group}Hint`)}</small></span></span>
      <input type="checkbox" role="switch" aria-label={t('notifications.groupSwitch', { group: t(`notifications.groups.${group}`) })} checked={preferences[group]} onChange={(event) => void toggle(group, event.target.checked)} />
    </label>)}</div>}
  </Surface>;
}

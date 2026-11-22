import { useTranslation } from 'react-i18next';
import { CreditCard } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBillingBackend } from '../pages/BillingPage';
import { Button, Surface } from './ui';

const DISMISSED = 'atlas.billingPromptDismissed';

/** For directors on the dashboard: choose a tariff, shown while billing is set up but nothing is paid yet. */
export function BillingPrompt() {
  const { t } = useTranslation('billing');
  const navigate = useNavigate();
  const backend = useBillingBackend();
  const [show, setShow] = useState(false);
  useEffect(() => {
    let dismissed = false;
    try { dismissed = localStorage.getItem(DISMISSED) === '1'; } catch { /* a per-browser convenience only */ }
    if (dismissed) return;
    let active = true;
    backend.overview().then((overview) => { if (active) setShow(overview.configured && !overview.subscription); }).catch(() => undefined);
    return () => { active = false; };
  }, [backend]);
  if (!show) return null;
  const dismiss = () => { setShow(false); try { localStorage.setItem(DISMISSED, '1'); } catch { /* a per-browser convenience only */ } };
  return <Surface className="consent-notice billing-prompt" role="note"><span className="settings-icon"><CreditCard size={18} /></span>
    <div><strong>{t('prompt.title')}</strong><p>{t('prompt.text')}</p></div>
    <div className="billing-prompt__actions"><Button variant="ghost" onClick={dismiss}>{t('prompt.dismiss')}</Button><Button variant="secondary" onClick={() => navigate('/settings/billing')}>{t('prompt.open')}</Button></div>
  </Surface>;
}

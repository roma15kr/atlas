import { useTranslation } from 'react-i18next';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button, EmptyState, LoadingState, Surface } from '../components/ui';
import { useMail } from '../context/MailContext';
import { mailErrorMessage } from '../lib/mailErrors';

/** Return point of the Google/Microsoft sign-in: completes the connection with the user's own session. */
export function MailOAuthPage() {
  const { t } = useTranslation(['mail', 'common']);
  const { provider } = useParams();
  const [params] = useSearchParams();
  const { backend, refresh } = useMail();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const code = params.get('code');
    const state = params.get('state');
    if (params.get('error') || !code || !state || (provider !== 'google' && provider !== 'microsoft')) {
      setError(params.get('error') === 'access_denied' ? t('oauth.denied') : t('oauth.noGrant'));
      return;
    }
    backend.oauthComplete(provider, code, state)
      .then(async (account) => { await refresh(); navigate('/mail/settings', { replace: true, state: { notice: t('oauth.connected', { email: account.email }) } }); })
      .catch((reason) => setError(mailErrorMessage(reason, t('oauth.failed'))));
  }, [backend, navigate, params, provider, refresh, t]);
  return <Surface>{error ? <EmptyState title={t('oauth.errorTitle')} description={error} action={<Button onClick={() => navigate('/mail/settings', { replace: true })}>{t('oauth.toSettings')}</Button>} /> : <LoadingState label={t('oauth.connecting')} />}</Surface>;
}

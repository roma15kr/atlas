import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button, EmptyState, LoadingState, Surface } from '../components/ui';
import { useMail } from '../context/MailContext';
import { mailErrorMessage } from '../lib/mailErrors';

/** Return point of the Google/Microsoft sign-in: completes the connection with the user's own session. */
export function MailOAuthPage() {
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
      setError(params.get('error') === 'access_denied' ? 'Вы отменили доступ к почте' : 'Почтовый сервис не вернул разрешение — попробуйте ещё раз');
      return;
    }
    backend.oauthComplete(provider, code, state)
      .then(async (account) => { await refresh(); navigate('/mail/settings', { replace: true, state: { notice: `Ящик ${account.email} подключён — письма появятся после первой синхронизации` } }); })
      .catch((reason) => setError(mailErrorMessage(reason, 'Ящик не подключён')));
  }, [backend, navigate, params, provider, refresh]);
  return <Surface>{error ? <EmptyState title="Не удалось подключить почту" description={error} action={<Button onClick={() => navigate('/mail/settings', { replace: true })}>К настройкам почты</Button>} /> : <LoadingState label="Подключаем почтовый ящик" />}</Surface>;
}

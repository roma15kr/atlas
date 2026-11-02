import { useTranslation } from 'react-i18next';
import { KeyRound, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { FeedbackButton } from '../components/FeedbackDialog';
import { ChangePasswordForm } from '../components/team/MemberDialogs';
import { Button, Surface } from '../components/ui';
import { useAuth } from '../context/AppContext';

/** Shown instead of the workspace after an administrative reset, until the person sets their own password. */
export function ChangePasswordPage() {
  const { t } = useTranslation(['profile', 'common']);
  const { session, changePassword, logout } = useAuth();
  const navigate = useNavigate();
  return <main className="password-gate">
    <Surface className="password-gate__card">
      <span className="settings-icon"><KeyRound size={18} /></span>
      <h1>{t('forced.title')}</h1>
      <p>{t('forced.text', { name: session?.user.fullName })}</p>
      <ChangePasswordForm id="forced-password-form" change={changePassword} onDone={() => navigate('/', { replace: true })} />
      <footer><Button variant="ghost" icon={LogOut} onClick={() => void logout()}>{t('forced.logout')}</Button><Button type="submit" form="forced-password-form">{t('forced.save')}</Button></footer>
    </Surface>
    <div className="password-gate__help"><FeedbackButton compact /></div>
  </main>;
}

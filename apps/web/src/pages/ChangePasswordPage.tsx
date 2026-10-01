import { KeyRound, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ChangePasswordForm } from '../components/team/MemberDialogs';
import { Button, Surface } from '../components/ui';
import { useAuth } from '../context/AppContext';

/** Shown instead of the workspace after an administrative reset, until the person sets their own password. */
export function ChangePasswordPage() {
  const { session, changePassword, logout } = useAuth();
  const navigate = useNavigate();
  return <main className="password-gate">
    <Surface className="password-gate__card">
      <span className="settings-icon"><KeyRound size={18} /></span>
      <h1>Задайте новый пароль</h1>
      <p>{session?.user.fullName}, пароль был сброшен руководителем. Введите временный пароль и придумайте свой, чтобы продолжить работу.</p>
      <ChangePasswordForm id="forced-password-form" change={changePassword} onDone={() => navigate('/', { replace: true })} />
      <footer><Button variant="ghost" icon={LogOut} onClick={() => void logout()}>Выйти</Button><Button type="submit" form="forced-password-form">Сохранить пароль</Button></footer>
    </Surface>
  </main>;
}

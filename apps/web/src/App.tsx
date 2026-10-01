import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { LoadingState } from './components/ui';
import { useAuth } from './context/AppContext';
import { ChatProvider } from './context/ChatContext';
import { MailProvider } from './context/MailContext';
import { TelegramProvider } from './context/TelegramContext';
import { AchievementsPage } from './pages/AchievementsPage';
import { AuditPage } from './pages/AuditPage';
import { BoardSettingsPage } from './pages/BoardSettingsPage';
import { BoardsPage } from './pages/BoardsPage';
import { ClientPage } from './pages/ClientPage';
import { CrmPage } from './pages/CrmPage';
import { DashboardPage } from './pages/DashboardPage';
import { DocumentsPage } from './pages/DocumentsPage';
import { FunnelSettingsPage } from './pages/FunnelSettingsPage';
import { LoginPage } from './pages/LoginPage';
import { MailOAuthPage } from './pages/MailOAuthPage';
import { MailPage } from './pages/MailPage';
import { MailSettingsPage } from './pages/MailSettingsPage';
import { MessagesPage } from './pages/MessagesPage';
import { ProfilePage } from './pages/ProfilePage';
import { ReportsPage } from './pages/ReportsPage';
import { SalesPage } from './pages/SalesPage';
import { TelegramPage } from './pages/TelegramPage';
import { TelegramSettingsPage } from './pages/TelegramSettingsPage';
import { TasksPage } from './pages/TasksPage';
import { TeamPage } from './pages/TeamPage';
import type { Role } from './types';

function ProtectedLayout() {
  const { session, loading } = useAuth(); const location = useLocation();
  if (loading) return <div className="app-loading"><LoadingState label="Открываем рабочее пространство" /></div>;
  if (!session) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return <ChatProvider><MailProvider><TelegramProvider><AppShell><Routes><Route path="/" element={<DashboardPage />} /><Route path="/crm" element={<CrmPage />} /><Route path="/crm/:id" element={<ClientPage />} /><Route path="/sales" element={<SalesPage />} /><Route path="/sales/settings" element={<RoleGate roles={['DIRECTOR']}><FunnelSettingsPage /></RoleGate>} /><Route path="/tasks" element={<TasksPage />} /><Route path="/boards" element={<BoardsPage />} /><Route path="/boards/settings" element={<RoleGate roles={['DIRECTOR', 'MANAGER']}><BoardSettingsPage /></RoleGate>} /><Route path="/boards/:id/settings" element={<RoleGate roles={['DIRECTOR', 'MANAGER']}><BoardSettingsPage /></RoleGate>} /><Route path="/documents" element={<DocumentsPage />} /><Route path="/team" element={<TeamPage />} /><Route path="/reports" element={<RoleGate roles={['DIRECTOR', 'MANAGER']}><ReportsPage /></RoleGate>} /><Route path="/achievements" element={<AchievementsPage />} /><Route path="/messages" element={<MessagesPage />} /><Route path="/mail" element={<MailPage />} /><Route path="/mail/settings" element={<MailSettingsPage />} /><Route path="/mail/oauth/:provider" element={<MailOAuthPage />} /><Route path="/telegram" element={<TelegramPage />} /><Route path="/telegram/settings" element={<RoleGate roles={['DIRECTOR']}><TelegramSettingsPage /></RoleGate>} /><Route path="/audit" element={<RoleGate roles={['DIRECTOR']}><AuditPage /></RoleGate>} /><Route path="/profile" element={<ProfilePage />} /><Route path="*" element={<Navigate to="/" replace />} /></Routes></AppShell></TelegramProvider></MailProvider></ChatProvider>;
}

function RoleGate({ roles, children }: { roles: Role[]; children: React.ReactNode }) {
  const { session } = useAuth();
  return session && roles.includes(session.user.role) ? children : <Navigate to="/" replace />;
}

export default function App() {
  return <Routes><Route path="/login" element={<LoginPage />} /><Route path="/*" element={<ProtectedLayout />} /></Routes>;
}

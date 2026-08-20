import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { LoadingState } from './components/ui';
import { useAuth } from './context/AppContext';
import { AchievementsPage } from './pages/AchievementsPage';
import { AuditPage } from './pages/AuditPage';
import { ClientPage } from './pages/ClientPage';
import { CrmPage } from './pages/CrmPage';
import { DashboardPage } from './pages/DashboardPage';
import { DocumentsPage } from './pages/DocumentsPage';
import { LoginPage } from './pages/LoginPage';
import { MessagesPage } from './pages/MessagesPage';
import { ProfilePage } from './pages/ProfilePage';
import { ReportsPage } from './pages/ReportsPage';
import { SalesPage } from './pages/SalesPage';
import { TasksPage } from './pages/TasksPage';
import { TeamPage } from './pages/TeamPage';
import type { Role } from './types';

function ProtectedLayout() {
  const { session, loading } = useAuth(); const location = useLocation();
  if (loading) return <div className="app-loading"><LoadingState label="Открываем рабочее пространство" /></div>;
  if (!session) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return <AppShell><Routes><Route path="/" element={<DashboardPage />} /><Route path="/crm" element={<CrmPage />} /><Route path="/crm/:id" element={<ClientPage />} /><Route path="/sales" element={<SalesPage />} /><Route path="/tasks" element={<TasksPage />} /><Route path="/documents" element={<DocumentsPage />} /><Route path="/team" element={<TeamPage />} /><Route path="/reports" element={<RoleGate roles={['DIRECTOR', 'MANAGER']}><ReportsPage /></RoleGate>} /><Route path="/achievements" element={<AchievementsPage />} /><Route path="/messages" element={<MessagesPage />} /><Route path="/audit" element={<RoleGate roles={['DIRECTOR']}><AuditPage /></RoleGate>} /><Route path="/profile" element={<ProfilePage />} /><Route path="*" element={<Navigate to="/" replace />} /></Routes></AppShell>;
}

function RoleGate({ roles, children }: { roles: Role[]; children: React.ReactNode }) {
  const { session } = useAuth();
  return session && roles.includes(session.user.role) ? children : <Navigate to="/" replace />;
}

export default function App() {
  return <Routes><Route path="/login" element={<LoginPage />} /><Route path="/*" element={<ProtectedLayout />} /></Routes>;
}

import { Activity, ArrowUpRight, Banknote, Bot, CalendarDays, Check, Clock3, FileWarning, Plus, Target, TrendingUp, UserCheck, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TaskDialog } from '../components/TaskDialog';
import { Avatar, Badge, Button, EmptyState, Meter, PageHeader, SectionHeader, Surface } from '../components/ui';
import { useAuth, useWorkspace } from '../context/AppContext';
import { formatDate, formatMoney, relativeTime } from '../lib/format';
import { defaultBoard, isAssignedTo, rememberedBoard } from '../lib/boards';
import type { Alert, TaskBoard, User, WorkTask } from '../types';

const weekday = new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());

export function DashboardPage() {
  const { session } = useAuth();
  const { users, clients, deals, tasks: allTasks, taskBoards, alerts, acknowledgeAlert, dashboardMetrics } = useWorkspace();
  const navigate = useNavigate();
  const [taskOpen, setTaskOpen] = useState(false);
  const user = session!.user;
  const tasks = useMemo(() => dashboardTasks(allTasks, taskBoards, user), [allTasks, taskBoards, user]);
  const isDirector = user.role === 'DIRECTOR';
  // Totals come from the server so they cover every record in scope, not just what the lists hold.
  const localOpen = deals.filter((deal) => deal.stage.outcome === 'OPEN');
  const online = dashboardMetrics?.online ?? users.filter((member) => member.online).length;
  const teamSize = dashboardMetrics?.teamSize ?? users.length;
  const pipeline = dashboardMetrics?.pipelineValue ?? localOpen.reduce((sum, deal) => sum + deal.value, 0);
  const openDeals = dashboardMetrics?.openDeals ?? localOpen.length;
  const clientCount = dashboardMetrics?.clients ?? clients.length;
  const completed = dashboardMetrics?.tasks.done ?? tasks.filter((task) => task.stage.category === 'DONE').length;
  const taskTotal = dashboardMetrics?.tasks.total ?? tasks.length;
  const overdue = dashboardMetrics?.tasks.overdue ?? tasks.filter((task) => task.stage.category !== 'DONE' && task.dueAt && new Date(task.dueAt).getTime() < Date.now()).length;
  const kpi = user.kpis.length ? Math.round(user.kpis.reduce((sum, item) => sum + Math.min(1, item.actual / item.target) * item.weight, 0) / user.kpis.reduce((sum, item) => sum + item.weight, 0) * 100) : 0;
  const chart = isDirector ? users.map((member) => ({ label: member.fullName.split(' ')[0], value: member.rating })) : user.kpis.map((item) => ({ label: item.name, value: Math.round(Math.min(1, item.actual / item.target) * 100) }));
  const chartAverage = chart.length ? Math.round(chart.reduce((sum, item) => sum + item.value, 0) / chart.length) : 0;
  const openAlerts = alerts.filter((alert) => !alert.acknowledged);

  return <>
    <PageHeader title={`Добрый день, ${user.fullName.split(' ')[0]}`} description={`${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}`} action={<Button icon={Plus} onClick={() => setTaskOpen(true)}>Новая задача</Button>} />
    <div className="metric-grid">
      <Metric label={isDirector ? 'Команда в сети' : 'Мой рейтинг'} value={isDirector ? `${online} / ${teamSize}` : `${user.rating}`} note={isDirector ? `${Math.round(online / Math.max(teamSize, 1) * 100)}% команды` : 'из 100 баллов'} icon={isDirector ? Users : Target} tone="teal" />
      <Metric label="Активная воронка" value={formatMoney(pipeline)} note={`${openDeals} сделок`} icon={Banknote} tone="blue" />
      <Metric label={isDirector ? 'Клиенты' : 'Мой KPI'} value={isDirector ? String(clientCount) : `${kpi}%`} note="текущий доступ" icon={isDirector ? UserCheck : TrendingUp} tone="amber" />
      <Metric label="Задачи выполнены" value={`${completed} / ${taskTotal}`} note={overdue ? `${overdue} просрочено` : 'просрочек нет'} icon={overdue ? FileWarning : Check} tone={overdue ? 'red' : 'teal'} />
    </div>
    <div className="dashboard-grid">
      <Surface className="dashboard-chart">
        <SectionHeader title="Выполнение KPI" meta={<Badge tone={chartAverage >= 80 ? 'success' : 'warning'}>Среднее {chartAverage}%</Badge>} action={user.role !== 'EMPLOYEE' ? <button className="text-button" onClick={() => navigate('/reports')}>Открыть отчёты <ArrowUpRight size={14} /></button> : undefined} />
        <div className="chart-legend"><span><i className="legend-dot legend-dot--teal" /> Текущий результат</span><span><i className="legend-line" /> Цель 100%</span></div>
        {chart.length ? <div className="bar-chart" aria-label="Выполнение KPI">{chart.map((item, index) => <div className="bar-chart__item" key={`${item.label}-${index}`}><span className="bar-chart__value">{item.value}%</span><span className="bar-chart__track"><i style={{ height: `${item.value}%` }} /></span><small title={item.label}>{item.label.slice(0, 7)}</small></div>)}</div> : <EmptyState title="Нет данных KPI" description="Показатели появятся после настройки профиля" icon={Target} />}
        <div className="chart-footer"><span>Текущий период</span><strong>{chart.length} показателей</strong></div>
      </Surface>
      <Surface className="presence-panel">
        <SectionHeader title="Кто в сети" meta={<Badge tone="success">{online} онлайн</Badge>} action={<button className="text-button" onClick={() => navigate('/team')}>Вся команда</button>} />
        <div className="presence-list">{users.slice(0, 6).map((member) => <button key={member.id} className="person-row" onClick={() => navigate(`/team?user=${member.id}`)}><Avatar name={member.fullName} online={member.online} /><span><strong>{member.fullName}</strong><small>{member.jobTitle}</small></span><time>{member.online ? 'Сейчас' : relativeTime(member.lastSeen)}</time></button>)}</div>
      </Surface>
      <Surface className="alerts-panel">
        <SectionHeader title="AI-наблюдения" meta={<Badge tone={openAlerts.some((alert) => alert.severity === 'CRITICAL') ? 'danger' : 'warning'}>{openAlerts.length} новых</Badge>} action={<span className="ai-label"><Bot size={15} /> Системные метрики</span>} />
        <div className="alert-list">{openAlerts.length ? openAlerts.slice(0, 4).map((alert) => <article className={`alert-row alert-row--${alert.severity.toLowerCase()}`} key={alert.id}><span className="alert-row__icon">{alert.severity === 'CRITICAL' ? <FileWarning size={17} /> : alert.severity === 'WARNING' ? <Clock3 size={17} /> : <Activity size={17} />}</span><div><span><Badge tone={alert.severity === 'CRITICAL' ? 'danger' : alert.severity === 'WARNING' ? 'warning' : 'info'}>{alertLabel(alert)}</Badge><time>{relativeTime(alert.createdAt)}</time></span><strong>{alert.title}</strong><p>{alert.summary}</p>{alert.userName && <small>{alert.userName}</small>}{alert.clientId && <button className="text-button" onClick={() => navigate(`/crm/${alert.clientId}`)}>Открыть клиента <ArrowUpRight size={13} /></button>}</div>{user.role !== 'EMPLOYEE' && <button aria-label="Отметить просмотренным" title="Отметить просмотренным" onClick={() => void acknowledgeAlert(alert.id)}><Check size={16} /></button>}</article>) : <EmptyState title="Всё спокойно" description="Новых системных наблюдений нет" icon={Bot} />}</div>
      </Surface>
      <Surface className="today-panel">
        <SectionHeader title="Сегодня" meta={<CalendarDays size={16} />} action={<button className="text-button" onClick={() => navigate('/tasks')}>Все задачи</button>} />
        <div className="today-list">{tasks.filter((task) => task.stage.category !== 'DONE').slice(0, 4).map((task) => <button key={task.id} onClick={() => navigate('/tasks')}><i className={task.priority === 'HIGH' ? 'priority-high' : ''} /><span><strong>{task.title}</strong><small>{task.dealTitle ?? task.boardName}</small></span><time>{formatDate(task.dueAt)}</time></button>)}</div>
      </Surface>
    </div>
    {taskOpen && taskBoards.length > 0 && <TaskDialog boardId={defaultBoard(taskBoards, user, rememberedBoard(user.id))?.id} onClose={() => setTaskOpen(false)} />}
  </>;
}

const ruleLabels: Record<string, string> = {
  TASKS_OVERDUE: 'Задачи', DEAL_CLOSE_OVERDUE: 'Сделка', DEAL_STALLED: 'Сделка', KPI_BEHIND: 'KPI', INACTIVITY: 'Присутствие',
};
const categoryLabels: Record<string, string> = { CONSENT: 'Согласие', EXPORT: 'Доступ' };

/** The automatic rule names the alert; older alerts fall back to their category. */
export function alertLabel(alert: Alert): string {
  return (alert.rule && ruleLabels[alert.rule]) ?? categoryLabels[alert.category] ?? 'Сроки';
}

function Metric({ label, value, note, icon: Icon, tone }: { label: string; value: string; note: string; icon: typeof Users; tone: 'teal' | 'blue' | 'amber' | 'red' }) {
  return <Surface className="metric"><span className={`metric__icon metric__icon--${tone}`}><Icon size={19} /></span><div><span>{label}</span><strong>{value}</strong><small>{note}</small></div></Surface>;
}

/** Dashboard task scope: employees their own assigned tasks, heads their department's boards, directors everything. */
export function dashboardTasks(tasks: WorkTask[], boards: TaskBoard[], user: User): WorkTask[] {
  if (user.role === 'DIRECTOR') return tasks;
  if (user.role === 'EMPLOYEE') return tasks.filter((task) => isAssignedTo(task, user.id));
  const own = new Set(boards.filter((board) => board.departmentId && board.departmentId === user.departmentId).map((board) => board.id));
  return tasks.filter((task) => own.has(task.boardId));
}

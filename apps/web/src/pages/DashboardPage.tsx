import i18n, { localeOf } from '../i18n';
import { useTranslation } from 'react-i18next';
import { Activity, ArrowUpRight, ShieldCheck, Banknote, Bot, CalendarDays, Check, Clock3, FileWarning, Plus, Target, TrendingUp, UserCheck, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { TaskDialog } from '../components/TaskDialog';
import { Avatar, Badge, Button, EmptyState, PageHeader, SectionHeader, Surface } from '../components/ui';
import { hasMonitoringConsent, useAuth, useWorkspace } from '../context/AppContext';
import { firstName, formatDate, formatMoney, relativeTime } from '../lib/format';
import { defaultBoard, isAssignedTo, rememberedBoard } from '../lib/boards';
import type { Alert, TaskBoard, User, WorkTask } from '../types';

const weekday = new Intl.DateTimeFormat(localeOf(), { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());

export function DashboardPage() {
  const { t } = useTranslation(['dashboard', 'common']);
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
  const chart = isDirector ? users.map((member) => ({ label: firstName(member.fullName), value: member.rating })) : user.kpis.map((item) => ({ label: item.name, value: Math.round(Math.min(1, item.actual / item.target) * 100) }));
  const chartAverage = chart.length ? Math.round(chart.reduce((sum, item) => sum + item.value, 0) / chart.length) : 0;
  const openAlerts = alerts.filter((alert) => !alert.acknowledged);

  return <>
    <PageHeader title={t('greeting', { name: firstName(user.fullName) })} description={`${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}`} action={<Button icon={Plus} onClick={() => setTaskOpen(true)}>{t('newTask')}</Button>} />
    {!hasMonitoringConsent(user) && <Surface className="consent-notice" role="note"><span className="settings-icon"><ShieldCheck size={18} /></span><div><strong>{t('consent.title')}</strong><p>{t('consent.text')}</p></div><Button variant="secondary" onClick={() => navigate('/profile')}>{t('consent.go')}</Button></Surface>}
    <div className="metric-grid">
      <Metric label={isDirector ? t('metrics.teamOnline') : t('metrics.myRating')} value={isDirector ? `${online} / ${teamSize}` : `${user.rating}`} note={isDirector ? t('metrics.teamShare', { value: Math.round(online / Math.max(teamSize, 1) * 100) }) : t('metrics.outOf100')} icon={isDirector ? Users : Target} tone="teal" />
      <Metric label={t('metrics.pipeline')} value={formatMoney(pipeline)} note={t('metrics.deals', { count: openDeals })} icon={Banknote} tone="blue" />
      <Metric label={isDirector ? t('metrics.clients') : t('metrics.myKpi')} value={isDirector ? String(clientCount) : `${kpi}%`} note={t('metrics.currentAccess')} icon={isDirector ? UserCheck : TrendingUp} tone="amber" />
      <Metric label={t('metrics.tasksDone')} value={`${completed} / ${taskTotal}`} note={overdue ? t('metrics.overdue', { count: overdue }) : t('metrics.noOverdue')} icon={overdue ? FileWarning : Check} tone={overdue ? 'red' : 'teal'} />
    </div>
    <div className="dashboard-grid">
      <Surface className="dashboard-chart">
        <SectionHeader title={t('kpi.title')} meta={<Badge tone={chartAverage >= 80 ? 'success' : 'warning'}>{t('kpi.average', { value: chartAverage })}</Badge>} action={user.role !== 'EMPLOYEE' ? <button className="text-button" onClick={() => navigate('/reports')}>{t('kpi.openReports')} <ArrowUpRight size={14} /></button> : undefined} />
        <div className="chart-legend"><span><i className="legend-dot legend-dot--teal" /> {t('kpi.current')}</span><span><i className="legend-line" /> {t('kpi.goal')}</span></div>
        {chart.length ? <div className="bar-chart" aria-label={t('kpi.title')}>{chart.map((item, index) => <div className="bar-chart__item" key={`${item.label}-${index}`}><span className="bar-chart__value">{item.value}%</span><span className="bar-chart__track"><i style={{ height: `${item.value}%` }} /></span><small title={item.label}>{item.label.slice(0, 7)}</small></div>)}</div> : <EmptyState title={t('kpi.empty')} description={t('kpi.emptyText')} icon={Target} />}
        <div className="chart-footer"><span>{t('kpi.period')}</span><strong>{t('kpi.count', { count: chart.length })}</strong></div>
      </Surface>
      <Surface className="presence-panel">
        <SectionHeader title={t('presence.title')} meta={<Badge tone="success">{t('presence.online', { count: online })}</Badge>} action={<button className="text-button" onClick={() => navigate('/team')}>{t('presence.all')}</button>} />
        <div className="presence-list">{[...users].sort((a, b) => Number(b.online) - Number(a.online) || a.fullName.localeCompare(b.fullName, localeOf())).slice(0, 6).map((member) => <button key={member.id} className="person-row" onClick={() => navigate(`/team?user=${member.id}`)}><Avatar name={member.fullName} src={member.avatarUrl} online={member.online} /><span><strong>{member.fullName}</strong><small>{member.jobTitle}</small></span><time>{member.online ? t('presence.now') : relativeTime(member.lastSeen)}</time></button>)}</div>
      </Surface>
      <Surface className="alerts-panel">
        <SectionHeader title={t('alerts.title')} meta={<Badge tone={openAlerts.some((alert) => alert.severity === 'CRITICAL') ? 'danger' : 'warning'}>{t('alerts.new', { count: openAlerts.length })}</Badge>} action={<span className="ai-label"><Bot size={15} /> {t('alerts.source')}</span>} />
        <div className="alert-list">{openAlerts.length ? openAlerts.slice(0, 4).map((alert) => <article className={`alert-row alert-row--${alert.severity.toLowerCase()}`} key={alert.id}><span className="alert-row__icon">{alert.severity === 'CRITICAL' ? <FileWarning size={17} /> : alert.severity === 'WARNING' ? <Clock3 size={17} /> : <Activity size={17} />}</span><div><span><Badge tone={alert.severity === 'CRITICAL' ? 'danger' : alert.severity === 'WARNING' ? 'warning' : 'info'}>{alertLabel(alert)}</Badge><time>{relativeTime(alert.createdAt)}</time></span><strong>{alert.title}</strong><p>{alert.summary}</p>{alert.userName && <small>{alert.userName}</small>}{alert.clientId && <button className="text-button" onClick={() => navigate(`/crm/${alert.clientId}`)}>{t('alerts.openClient')} <ArrowUpRight size={13} /></button>}{alert.tasks && alert.tasks.length > 0 && <OverdueTasks tasks={alert.tasks} more={alert.more ?? 0} />}</div>{user.role !== 'EMPLOYEE' && <button aria-label={t('alerts.markSeen')} title={t('alerts.markSeen')} onClick={() => void acknowledgeAlert(alert.id)}><Check size={16} /></button>}</article>) : <EmptyState title={t('alerts.calm')} description={t('alerts.calmText')} icon={Bot} />}</div>
      </Surface>
      <Surface className="today-panel">
        <SectionHeader title={t('today.title')} meta={<CalendarDays size={16} />} action={<button className="text-button" onClick={() => navigate('/tasks')}>{t('today.allTasks')}</button>} />
        <div className="today-list">{tasks.filter((task) => task.stage.category !== 'DONE').slice(0, 4).map((task) => <button key={task.id} onClick={() => navigate('/tasks')}><i className={task.priority === 'HIGH' ? 'priority-high' : ''} /><span><strong>{task.title}</strong><small>{task.dealTitle ?? task.boardName}</small></span><time>{formatDate(task.dueAt)}</time></button>)}</div>
      </Surface>
    </div>
    {taskOpen && taskBoards.length > 0 && <TaskDialog boardId={defaultBoard(taskBoards, user, rememberedBoard(user.id))?.id} onClose={() => setTaskOpen(false)} />}
  </>;
}

const RULES = { TASKS_OVERDUE: 1, DEAL_CLOSE_OVERDUE: 1, DEAL_STALLED: 1, KPI_BEHIND: 1, INACTIVITY: 1 } as const;
const CATEGORIES = { CONSENT: 1, EXPORT: 1 } as const;

/** The automatic rule names the alert; older alerts fall back to their category. */
export function alertLabel(alert: Alert): string {
  return (alert.rule && alert.rule in RULES ? i18n.t(`dashboard:alerts.rule.${alert.rule as keyof typeof RULES}`) : undefined)
    ?? (alert.category in CATEGORIES ? i18n.t(`dashboard:alerts.category.${alert.category as keyof typeof CATEGORIES}`) : undefined)
    ?? i18n.t('dashboard:alerts.deadlines');
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

/** The overdue tasks of a «Просроченные задачи» signal, folded until asked for; each opens the task. */
function OverdueTasks({ tasks, more }: { tasks: NonNullable<Alert['tasks']>; more: number }) {
  const { t } = useTranslation(['dashboard', 'common']);
  const [open, setOpen] = useState(false);
  return <div className="alert-tasks">
    <button type="button" className="text-button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>{open ? t('alerts.hideTasks') : t('alerts.showTasks', { count: tasks.length + more })}</button>
    {open && <ul>
      {tasks.map((task) => <li key={task.id}><Link to={`/tasks?task=${task.id}`}>{task.title}</Link><small>{t('alerts.due', { board: task.boardName, date: formatDate(task.dueAt) })}</small></li>)}
      {more > 0 && <li className="alert-tasks__more">{t('alerts.more', { count: more })}</li>}
    </ul>}
  </div>;
}


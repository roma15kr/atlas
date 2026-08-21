import { Activity, ArrowUpRight, Banknote, Bot, CalendarDays, Check, Clock3, FileWarning, Plus, Target, TrendingUp, UserCheck, Users } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar, Badge, Button, Dialog, EmptyState, Field, Meter, PageHeader, SectionHeader, SelectField, Surface } from '../components/ui';
import { useAuth, useWorkspace } from '../context/AppContext';
import { formatDate, formatMoney, relativeTime } from '../lib/format';
import type { WorkTask } from '../types';

const weekday = new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());

export function DashboardPage() {
  const { session } = useAuth();
  const { users, clients, deals, stages, tasks, alerts, acknowledgeAlert, addTask } = useWorkspace();
  const navigate = useNavigate();
  const [taskOpen, setTaskOpen] = useState(false);
  const user = session!.user;
  const isDirector = user.role === 'DIRECTOR';
  const online = users.filter((member) => member.online).length;
  const activeDeals = deals.filter((deal) => !stages.find((stage) => stage.key === deal.stage)?.isClosed);
  const pipeline = activeDeals.reduce((sum, deal) => sum + deal.value, 0);
  const completed = tasks.filter((task) => task.status === 'DONE').length;
  const dueSoon = tasks.filter((task) => task.status !== 'DONE' && new Date(task.dueAt).getTime() < Date.now() + 3 * 86400000).length;
  const kpi = user.kpis.length ? Math.round(user.kpis.reduce((sum, item) => sum + Math.min(1, item.actual / item.target) * item.weight, 0) / user.kpis.reduce((sum, item) => sum + item.weight, 0) * 100) : 0;
  const chart = isDirector ? users.map((member) => ({ label: member.fullName.split(' ')[0], value: member.rating })) : user.kpis.map((item) => ({ label: item.name, value: Math.round(Math.min(1, item.actual / item.target) * 100) }));
  const chartAverage = chart.length ? Math.round(chart.reduce((sum, item) => sum + item.value, 0) / chart.length) : 0;
  const openAlerts = alerts.filter((alert) => !alert.acknowledged);

  return <>
    <PageHeader title={`Добрый день, ${user.fullName.split(' ')[0]}`} description={`${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}`} action={<Button icon={Plus} onClick={() => setTaskOpen(true)}>Новая задача</Button>} />
    <div className="metric-grid">
      <Metric label={isDirector ? 'Команда в сети' : 'Мой рейтинг'} value={isDirector ? `${online} / ${users.length}` : `${user.rating}`} note={isDirector ? `${Math.round(online / Math.max(users.length, 1) * 100)}% команды` : 'из 100 баллов'} icon={isDirector ? Users : Target} tone="teal" />
      <Metric label="Активная воронка" value={formatMoney(pipeline)} note={`${activeDeals.length} сделок`} icon={Banknote} tone="blue" />
      <Metric label={isDirector ? 'Клиенты' : 'Мой KPI'} value={isDirector ? String(clients.length) : `${kpi}%`} note="текущий доступ" icon={isDirector ? UserCheck : TrendingUp} tone="amber" />
      <Metric label="Задачи в срок" value={`${completed} / ${tasks.length}`} note={dueSoon ? `${dueSoon} требуют внимания` : 'просрочек нет'} icon={dueSoon ? FileWarning : Check} tone={dueSoon ? 'red' : 'teal'} />
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
        <div className="alert-list">{openAlerts.length ? openAlerts.slice(0, 4).map((alert) => <article className={`alert-row alert-row--${alert.severity.toLowerCase()}`} key={alert.id}><span className="alert-row__icon">{alert.severity === 'CRITICAL' ? <FileWarning size={17} /> : alert.severity === 'WARNING' ? <Clock3 size={17} /> : <Activity size={17} />}</span><div><span><Badge tone={alert.severity === 'CRITICAL' ? 'danger' : alert.severity === 'WARNING' ? 'warning' : 'info'}>{alert.category === 'CONSENT' ? 'Согласие' : alert.category === 'EXPORT' ? 'Доступ' : 'Сроки'}</Badge><time>{relativeTime(alert.createdAt)}</time></span><strong>{alert.title}</strong><p>{alert.summary}</p>{alert.userName && <small>{alert.userName}</small>}</div>{user.role !== 'EMPLOYEE' && <button aria-label="Отметить просмотренным" title="Отметить просмотренным" onClick={() => void acknowledgeAlert(alert.id)}><Check size={16} /></button>}</article>) : <EmptyState title="Всё спокойно" description="Новых системных наблюдений нет" icon={Bot} />}</div>
      </Surface>
      <Surface className="today-panel">
        <SectionHeader title="Сегодня" meta={<CalendarDays size={16} />} action={<button className="text-button" onClick={() => navigate('/tasks')}>Все задачи</button>} />
        <div className="today-list">{tasks.filter((task) => task.status !== 'DONE').slice(0, 4).map((task) => <button key={task.id} onClick={() => navigate('/tasks')}><i className={task.priority === 'HIGH' ? 'priority-high' : ''} /><span><strong>{task.title}</strong><small>{task.dealTitle ?? task.assigneeName}</small></span><time>{formatDate(task.dueAt)}</time></button>)}</div>
      </Surface>
    </div>
    <TaskDialog open={taskOpen} onClose={() => setTaskOpen(false)} users={users} onSave={addTask} />
  </>;
}

function Metric({ label, value, note, icon: Icon, tone }: { label: string; value: string; note: string; icon: typeof Users; tone: 'teal' | 'blue' | 'amber' | 'red' }) {
  return <Surface className="metric"><span className={`metric__icon metric__icon--${tone}`}><Icon size={19} /></span><div><span>{label}</span><strong>{value}</strong><small>{note}</small></div></Surface>;
}

export function TaskDialog({ open, onClose, users, onSave }: { open: boolean; onClose: () => void; users: Array<{ id: string; fullName: string }>; onSave: (task: Omit<WorkTask, 'id'>) => Promise<void> }) {
  const { session } = useAuth();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const assigneeId = String(form.get('assigneeId'));
    setSaving(true); setError('');
    try {
      await onSave({ title: String(form.get('title')), description: String(form.get('description') ?? ''), status: 'TODO', assigneeId, assigneeName: users.find((user) => user.id === assigneeId)?.fullName ?? session!.user.fullName, dueAt: new Date(String(form.get('dueAt'))).toISOString(), priority: form.get('priority') as WorkTask['priority'] });
      onClose();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Задача не создана'); }
    finally { setSaving(false); }
  };
  return <Dialog open={open} title="Новая задача" description="Задача появится в личной доске исполнителя" onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Отмена</Button><Button type="submit" form="task-form" disabled={saving}>{saving ? 'Сохраняем…' : 'Создать'}</Button></>}><form id="task-form" className="form-grid" onSubmit={(event) => void submit(event)}><Field label="Название" className="field--wide"><input name="title" required placeholder="Что нужно сделать" /></Field><Field label="Описание" className="field--wide"><textarea name="description" rows={3} placeholder="Контекст и ожидаемый результат" /></Field><SelectField label="Исполнитель" name="assigneeId" defaultValue={session!.user.id}>{users.map((member) => <option value={member.id} key={member.id}>{member.fullName}</option>)}</SelectField><SelectField label="Приоритет" name="priority" defaultValue="NORMAL"><option value="LOW">Низкий</option><option value="NORMAL">Обычный</option><option value="HIGH">Высокий</option></SelectField><Field label="Срок"><input name="dueAt" type="date" required defaultValue={new Date(Date.now() + 86400000).toISOString().slice(0, 10)} /></Field>{error && <div className="form-error field--wide" role="alert">{error}</div>}</form></Dialog>;
}

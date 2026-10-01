import { BarChart3, CheckCircle2, FileBarChart, Pause, Play, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Badge, Button, Dialog, EmptyState, Field, IconButton, LoadingState, PageHeader, Segmented, SelectField, Surface } from '../components/ui';
import { useWorkspace } from '../context/AppContext';
import { formatDate, formatMoney } from '../lib/format';
import type { Report, ReportResult, ReportRun } from '../types';

const metricOptions = [
  ['deals', 'Количество сделок'], ['conversion', 'Конверсия воронки'], ['kpi', 'Выполнение KPI'], ['tasks', 'Задачи'], ['attendance', 'Присутствие'],
] as const;
const metricLabels = Object.fromEntries(metricOptions) as Record<Report['metrics'][number], string>;
const scheduleLabels = { ONCE: 'Однократно', DAILY: 'Ежедневно', WEEKLY: 'Еженедельно', MONTHLY: 'Ежемесячно' } as const;
type ScheduleFilter = 'ALL' | Report['schedule'];

export function ReportsPage() {
  const { reports, users, addReport, setReportActive, deleteReport } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<ScheduleFilter>('ALL');
  const [viewing, setViewing] = useState<Report | null>(null);
  const [deleting, setDeleting] = useState<Report | null>(null);
  const [actionError, setActionError] = useState('');
  const visible = useMemo(() => filter === 'ALL' ? reports : reports.filter((report) => report.schedule === filter), [reports, filter]);

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const targetUserId = String(form.get('targetUserId') ?? '');
    const metrics = form.getAll('metrics').map(String) as Report['metrics'];
    if (!metrics.length) { setError('Выберите хотя бы одну метрику'); return; }
    setSaving(true); setError('');
    try {
      await addReport({ name: String(form.get('name')), targetUserId: targetUserId || undefined, targetUserName: users.find((user) => user.id === targetUserId)?.fullName ?? 'Команда', metrics, periodStart: String(form.get('periodStart')), periodEnd: String(form.get('periodEnd')), schedule: form.get('schedule') as Report['schedule'] });
      setOpen(false);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Отчёт не создан'); }
    finally { setSaving(false); }
  };
  const toggle = async (report: Report) => {
    setActionError('');
    try { await setReportActive(report.id, !report.active); } catch { setActionError('Не удалось изменить расписание'); }
  };
  const remove = async () => {
    if (!deleting) return;
    setActionError('');
    try { await deleteReport(deleting.id); } catch { setActionError('Отчёт не удалён'); }
    finally { setDeleting(null); }
  };

  return <>
    <PageHeader title="Отчёты" description="Сводки по команде, продажам и KPI" action={<Button icon={Plus} onClick={() => setOpen(true)}>Создать отчёт</Button>} />
    <div className="report-summary"><Surface><span><FileBarChart size={19} /></span><div><strong>{reports.length}</strong><small>всего отчётов</small></div></Surface><Surface><span><RefreshCw size={19} /></span><div><strong>{reports.filter((report) => report.schedule !== 'ONCE' && report.active !== false).length}</strong><small>по расписанию</small></div></Surface><Surface><span><CheckCircle2 size={19} /></span><div><strong>{reports.filter((report) => report.status === 'READY').length}</strong><small>готовы</small></div></Surface></div>
    <Surface className="report-list">
      <div className="table-toolbar"><strong>Сохранённые отчёты</strong><Segmented label="Периодичность" value={filter} onChange={setFilter} options={[{ value: 'ALL', label: 'Все' }, { value: 'DAILY', label: 'Ежедневные' }, { value: 'WEEKLY', label: 'Еженедельные' }, { value: 'MONTHLY', label: 'Ежемесячные' }, { value: 'ONCE', label: 'Разовые' }]} /></div>
      {actionError && <div className="form-error" role="alert">{actionError}</div>}
      {visible.length ? <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Отчёт</th><th>Область</th><th>Метрики</th><th>Период</th><th>Расписание</th><th /></tr></thead><tbody>{visible.map((report) => <tr key={report.id}>
        <td><button className="report-name report-name--link" onClick={() => setViewing(report)}><FileBarChart size={17} /><strong>{report.name}</strong></button></td>
        <td>{report.targetUserName}</td>
        <td><span className="metric-tags">{report.metrics.slice(0, 3).map((metric) => <Badge key={metric}>{metricLabels[metric] ?? metric}</Badge>)}</span></td>
        <td>{formatDate(report.periodStart)} — {formatDate(report.periodEnd)}</td>
        <td><span className="report-schedule"><span>{scheduleLabels[report.schedule]}</span>{report.schedule !== 'ONCE' && (report.active === false ? <Badge tone="warning">Пауза</Badge> : report.nextRunAt && <small>след. {formatDate(report.nextRunAt)}</small>)}</span></td>
        <td><span className="row-actions">{report.schedule !== 'ONCE' && <IconButton label={report.active === false ? `Возобновить «${report.name}»` : `Приостановить «${report.name}»`} icon={report.active === false ? Play : Pause} onClick={() => void toggle(report)} />}<IconButton label={`Удалить «${report.name}»`} icon={Trash2} onClick={() => setDeleting(report)} /></span></td>
      </tr>)}</tbody></table></div> : <EmptyState title={reports.length ? 'Нет отчётов с такой периодичностью' : 'Отчётов пока нет'} description="Соберите отчёт по нужным метрикам" icon={BarChart3} action={<Button icon={Plus} onClick={() => setOpen(true)}>Создать отчёт</Button>} />}
    </Surface>
    {viewing && <ReportDialog report={viewing} onClose={() => setViewing(null)} />}
    {deleting && <Dialog open size="sm" title="Удалить отчёт?" description={deleting.name} onClose={() => setDeleting(null)} footer={<><Button variant="secondary" onClick={() => setDeleting(null)}>Отмена</Button><Button variant="danger" icon={Trash2} onClick={() => void remove()}>Удалить</Button></>}><p className="dialog-note">Отчёт и вся история его запусков будут удалены.</p></Dialog>}
    <Dialog open={open} title="Конструктор отчёта" description="Повторяющиеся отчёты формируются в 06:00 по Киеву за прошедший день, неделю или месяц" size="lg" onClose={() => setOpen(false)} footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Отмена</Button><Button type="submit" form="report-form" disabled={saving}>{saving ? 'Создаём…' : 'Создать отчёт'}</Button></>}>
      <form id="report-form" className="form-grid report-form" onSubmit={(event) => void save(event)}>
        <Field label="Название" className="field--wide"><input name="name" required placeholder="Например, Итоги продаж за август" /></Field>
        <SelectField label="Область" name="targetUserId" defaultValue=""><option value="">Вся команда</option>{users.map((user) => <option value={user.id} key={user.id}>{user.fullName}</option>)}</SelectField>
        <SelectField label="Периодичность" name="schedule" defaultValue="WEEKLY"><option value="ONCE">Однократно</option><option value="DAILY">Ежедневно</option><option value="WEEKLY">Еженедельно</option><option value="MONTHLY">Ежемесячно</option></SelectField>
        <Field label="Начало периода"><input name="periodStart" type="date" defaultValue={new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)} required /></Field>
        <Field label="Конец периода"><input name="periodEnd" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></Field>
        <fieldset className="metric-checks"><legend>Метрики</legend>{metricOptions.map(([value, label]) => <label key={value}><input type="checkbox" name="metrics" value={value} defaultChecked={['deals', 'conversion', 'kpi'].includes(value)} /><span>{label}</span></label>)}</fieldset>
        {error && <div className="form-error field--wide" role="alert">{error}</div>}
      </form>
    </Dialog>
  </>;
}

function ReportDialog({ report, onClose }: { report: Report; onClose: () => void }) {
  const { loadReportRuns } = useWorkspace();
  const [tab, setTab] = useState<'result' | 'history'>('result');
  const [runs, setRuns] = useState<ReportRun[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    loadReportRuns(report.id).then((items) => { if (active) setRuns(items); }).catch(() => { if (active) setError('История не загружена'); });
    return () => { active = false; };
  }, [report.id, loadReportRuns]);
  const latest = report.result ?? runs?.[0]?.result;

  return <Dialog open size="lg" title={report.name} description={`${report.targetUserName} · ${formatDate(report.periodStart)} — ${formatDate(report.periodEnd)}`} onClose={onClose} footer={<Button onClick={onClose}>Закрыть</Button>}>
    <Segmented label="Раздел отчёта" value={tab} onChange={setTab} options={[{ value: 'result', label: 'Результаты' }, { value: 'history', label: `История${runs ? ` · ${runs.length}` : ''}` }]} />
    {tab === 'result'
      ? latest ? <ReportFigures result={latest} /> : <EmptyState title="Результатов пока нет" description="Отчёт ещё не сформирован" icon={BarChart3} />
      : error ? <div className="form-error" role="alert">{error}</div>
        : !runs ? <LoadingState label="Загружаем историю" />
          : runs.length ? <ul className="report-runs">{runs.map((run) => <li key={run.id}><span><strong>{formatDate(run.periodStart)} — {formatDate(run.periodEnd)}</strong><small>сформирован {formatDate(run.createdAt)}</small></span><span>{run.result.deals.won} / {run.result.deals.total} сделок</span><span>{formatMoney(run.result.deals.value)}</span><span>KPI {Math.round(run.result.kpiProgress * 100)}%</span></li>)}</ul>
            : <EmptyState title="Запусков пока нет" description="История появится после первого запуска" icon={RefreshCw} />}
    {report.schedule !== 'ONCE' && <p className="dialog-note report-next">{report.active === false ? 'Расписание приостановлено.' : report.nextRunAt ? `Следующий запуск: ${formatDate(report.nextRunAt)}, 06:00.` : ''}</p>}
  </Dialog>;
}

export function ReportFigures({ result }: { result: ReportResult }) {
  const attendance = result.attendance;
  const attendanceValue = attendance.consent === false ? 'нет согласия' : `${attendance.activeDays ?? 0} дн.`;
  const attendanceNote = attendance.teamSize !== undefined ? `учтено ${attendance.consentingUsers ?? 0} из ${attendance.teamSize} с согласием` : 'дней в сети';
  return <dl className="report-figures">
    <div><dt>Выполнение KPI</dt><dd>{Math.round(result.kpiProgress * 100)}%</dd></div>
    <div><dt>Сделки</dt><dd>{result.deals.won} / {result.deals.total}</dd><small>выиграно / всего</small></div>
    <div><dt>Выиграно, ₴</dt><dd>{formatMoney(result.deals.value)}</dd></div>
    <div><dt>Конверсия</dt><dd>{Math.round(result.conversion * 100)}%</dd></div>
    <div><dt>Задачи</dt><dd>{result.tasks.done} / {result.tasks.total}</dd><small>{result.tasks.overdue ? `просрочено ${result.tasks.overdue}` : 'без просрочек'}</small></div>
    <div><dt>Присутствие</dt><dd>{attendanceValue}</dd><small>{attendance.consent === false ? 'сотрудник не принял политику мониторинга' : attendanceNote}</small></div>
  </dl>;
}

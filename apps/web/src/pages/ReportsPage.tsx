import i18n from '../i18n';
import { useTranslation } from 'react-i18next';
import { BarChart3, CheckCircle2, FileBarChart, Pause, Play, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Badge, Button, Dialog, EmptyState, Field, IconButton, LoadingState, PageHeader, Segmented, SelectField, Surface } from '../components/ui';
import { useWorkspace } from '../context/AppContext';
import { formatDate, formatMoney } from '../lib/format';
import type { Report, ReportResult, ReportRun } from '../types';

const METRICS = ['deals', 'conversion', 'kpi', 'tasks', 'attendance'] as const;
const metricLabel = (metric: string) => METRICS.includes(metric as typeof METRICS[number]) ? i18n.t(`reports:metric.${metric as typeof METRICS[number]}`) : metric;
const SCHEDULES = ['ONCE', 'DAILY', 'WEEKLY', 'MONTHLY'] as const;
type ScheduleFilter = 'ALL' | Report['schedule'];

export function ReportsPage() {
  const { t } = useTranslation(['reports', 'common']);
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
    if (!metrics.length) { setError(t('pickMetric')); return; }
    setSaving(true); setError('');
    try {
      await addReport({ name: String(form.get('name')), targetUserId: targetUserId || undefined, targetUserName: users.find((user) => user.id === targetUserId)?.fullName ?? t('team'), metrics, periodStart: String(form.get('periodStart')), periodEnd: String(form.get('periodEnd')), schedule: form.get('schedule') as Report['schedule'] });
      setOpen(false);
    } catch (reason) { setError(reason instanceof Error ? reason.message : t('createFailed')); }
    finally { setSaving(false); }
  };
  const toggle = async (report: Report) => {
    setActionError('');
    try { await setReportActive(report.id, !report.active); } catch { setActionError(t('scheduleFailed')); }
  };
  const remove = async () => {
    if (!deleting) return;
    setActionError('');
    try { await deleteReport(deleting.id); } catch { setActionError(t('deleteFailed')); }
    finally { setDeleting(null); }
  };

  return <>
    <PageHeader title={t('title')} description={t('description')} action={<Button icon={Plus} onClick={() => setOpen(true)}>{t('create')}</Button>} />
    <div className="report-summary"><Surface><span><FileBarChart size={19} /></span><div><strong>{reports.length}</strong><small>{t('summary.total')}</small></div></Surface><Surface><span><RefreshCw size={19} /></span><div><strong>{reports.filter((report) => report.schedule !== 'ONCE' && report.active !== false).length}</strong><small>{t('summary.scheduled')}</small></div></Surface><Surface><span><CheckCircle2 size={19} /></span><div><strong>{reports.filter((report) => report.status === 'READY').length}</strong><small>{t('summary.ready')}</small></div></Surface></div>
    <Surface className="report-list">
      <div className="table-toolbar"><strong>{t('saved')}</strong><Segmented label={t('frequency')} value={filter} onChange={setFilter} options={[{ value: 'ALL', label: t('filter.all') }, { value: 'DAILY', label: t('filter.daily') }, { value: 'WEEKLY', label: t('filter.weekly') }, { value: 'MONTHLY', label: t('filter.monthly') }, { value: 'ONCE', label: t('filter.once') }]} /></div>
      {actionError && <div className="form-error" role="alert">{actionError}</div>}
      {visible.length ? <div className="data-table-wrap"><table className="data-table"><thead><tr><th>{t('col.report')}</th><th>{t('col.scope')}</th><th>{t('col.metrics')}</th><th>{t('col.period')}</th><th>{t('col.schedule')}</th><th /></tr></thead><tbody>{visible.map((report) => <tr key={report.id}>
        <td><button className="report-name report-name--link" onClick={() => setViewing(report)}><FileBarChart size={17} /><strong>{report.name}</strong></button></td>
        <td>{report.targetUserName}</td>
        <td><span className="metric-tags">{report.metrics.slice(0, 3).map((metric) => <Badge key={metric}>{metricLabel(metric)}</Badge>)}</span></td>
        <td>{formatDate(report.periodStart)} — {formatDate(report.periodEnd)}</td>
        <td><span className="report-schedule"><span>{t(`schedule.${report.schedule}`)}</span>{report.schedule !== 'ONCE' && (report.active === false ? <Badge tone="warning">{t('paused')}</Badge> : report.nextRunAt && <small>{t('next', { date: formatDate(report.nextRunAt) })}</small>)}</span></td>
        <td><span className="row-actions">{report.schedule !== 'ONCE' && <IconButton label={report.active === false ? t('resume', { name: report.name }) : t('pause', { name: report.name })} icon={report.active === false ? Play : Pause} onClick={() => void toggle(report)} />}<IconButton label={t('deleteOne', { name: report.name })} icon={Trash2} onClick={() => setDeleting(report)} /></span></td>
      </tr>)}</tbody></table></div> : <EmptyState title={reports.length ? t('emptyFilter') : t('empty')} description={t('emptyText')} icon={BarChart3} action={<Button icon={Plus} onClick={() => setOpen(true)}>{t('create')}</Button>} />}
    </Surface>
    {viewing && <ReportDialog report={viewing} onClose={() => setViewing(null)} />}
    {deleting && <Dialog open size="sm" title={t('deleteTitle')} description={deleting.name} onClose={() => setDeleting(null)} footer={<><Button variant="secondary" onClick={() => setDeleting(null)}>{t('common:actions.cancel')}</Button><Button variant="danger" icon={Trash2} onClick={() => void remove()}>{t('common:actions.delete')}</Button></>}><p className="dialog-note">{t('deleteNote')}</p></Dialog>}
    <Dialog open={open} title={t('builder')} description={t('builderText')} size="lg" onClose={() => setOpen(false)} footer={<><Button variant="secondary" onClick={() => setOpen(false)}>{t('common:actions.cancel')}</Button><Button type="submit" form="report-form" disabled={saving}>{saving ? t('creating') : t('create')}</Button></>}>
      <form id="report-form" className="form-grid report-form" onSubmit={(event) => void save(event)}>
        <Field label={t('name')} className="field--wide"><input name="name" required placeholder={t('namePlaceholder')} /></Field>
        <SelectField label={t('col.scope')} name="targetUserId" defaultValue=""><option value="">{t('wholeTeam')}</option>{users.map((user) => <option value={user.id} key={user.id}>{user.fullName}</option>)}</SelectField>
        <SelectField label={t('frequency')} name="schedule" defaultValue="WEEKLY">{SCHEDULES.map((value) => <option key={value} value={value}>{t(`schedule.${value}`)}</option>)}</SelectField>
        <Field label={t('start')}><input name="periodStart" type="date" defaultValue={new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)} required /></Field>
        <Field label={t('end')}><input name="periodEnd" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></Field>
        <fieldset className="metric-checks"><legend>{t('col.metrics')}</legend>{METRICS.map((value) => <label key={value}><input type="checkbox" name="metrics" value={value} defaultChecked={['deals', 'conversion', 'kpi'].includes(value)} /><span>{metricLabel(value)}</span></label>)}</fieldset>
        {error && <div className="form-error field--wide" role="alert">{error}</div>}
      </form>
    </Dialog>
  </>;
}

function ReportDialog({ report, onClose }: { report: Report; onClose: () => void }) {
  const { t } = useTranslation(['reports', 'common']);
  const { loadReportRuns } = useWorkspace();
  const [tab, setTab] = useState<'result' | 'history'>('result');
  const [runs, setRuns] = useState<ReportRun[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    loadReportRuns(report.id).then((items) => { if (active) setRuns(items); }).catch(() => { if (active) setError(t('historyFailed')); });
    return () => { active = false; };
  }, [report.id, loadReportRuns, t]);
  const latest = report.result ?? runs?.[0]?.result;

  return <Dialog open size="lg" title={report.name} description={`${report.targetUserName} · ${formatDate(report.periodStart)} — ${formatDate(report.periodEnd)}`} onClose={onClose} footer={<Button onClick={onClose}>{t('common:actions.close')}</Button>}>
    <Segmented label={t('section')} value={tab} onChange={setTab} options={[{ value: 'result', label: t('results') }, { value: 'history', label: `${t('history')}${runs ? ` · ${runs.length}` : ''}` }]} />
    {tab === 'result'
      ? latest ? <ReportFigures result={latest} /> : <EmptyState title={t('noResults')} description={t('notBuilt')} icon={BarChart3} />
      : error ? <div className="form-error" role="alert">{error}</div>
        : !runs ? <LoadingState label={t('loadingHistory')} />
          : runs.length ? <ul className="report-runs">{runs.map((run) => <li key={run.id}><span><strong>{formatDate(run.periodStart)} — {formatDate(run.periodEnd)}</strong><small>{t('built', { date: formatDate(run.createdAt) })}</small></span><span>{t('runDeals', { won: run.result.deals.won, total: run.result.deals.total })}</span><span>{formatMoney(run.result.deals.value)}</span><span>KPI {Math.round(run.result.kpiProgress * 100)}%</span></li>)}</ul>
            : <EmptyState title={t('noRuns')} description={t('noRunsText')} icon={RefreshCw} />}
    {report.schedule !== 'ONCE' && <p className="dialog-note report-next">{report.active === false ? t('pausedNote') : report.nextRunAt ? t('nextRun', { date: formatDate(report.nextRunAt) }) : ''}</p>}
  </Dialog>;
}

export function ReportFigures({ result }: { result: ReportResult }) {
  const { t } = useTranslation(['reports', 'common']);
  const attendance = result.attendance;
  const attendanceValue = attendance.consent === false ? t('noConsent') : t('days', { count: attendance.activeDays ?? 0 });
  const attendanceNote = attendance.teamSize !== undefined ? t('counted', { count: attendance.consentingUsers ?? 0, total: attendance.teamSize }) : t('daysOnline');
  return <dl className="report-figures">
    <div><dt>{t('metric.kpi')}</dt><dd>{Math.round(result.kpiProgress * 100)}%</dd></div>
    <div><dt>{t('fig.deals')}</dt><dd>{result.deals.won} / {result.deals.total}</dd><small>{t('fig.wonTotal')}</small></div>
    <div><dt>{t('fig.won')}</dt><dd>{formatMoney(result.deals.value)}</dd></div>
    <div><dt>{t('fig.conversion')}</dt><dd>{Math.round(result.conversion * 100)}%</dd></div>
    <div><dt>{t('metric.tasks')}</dt><dd>{result.tasks.done} / {result.tasks.total}</dd><small>{result.tasks.overdue ? t('fig.overdue', { count: result.tasks.overdue }) : t('fig.noOverdue')}</small></div>
    <div><dt>{t('metric.attendance')}</dt><dd>{attendanceValue}</dd><small>{attendance.consent === false ? t('fig.notAccepted') : attendanceNote}</small></div>
  </dl>;
}

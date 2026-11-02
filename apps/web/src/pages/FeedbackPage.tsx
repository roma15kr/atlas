import { useTranslation } from 'react-i18next';
import { ExternalLink, MessageSquareWarning, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Dialog, EmptyState, LoadingState, PageHeader, Segmented, Surface } from '../components/ui';
import { FeedbackButton } from '../components/FeedbackDialog';
import { useAuth } from '../context/AppContext';
import { loadAllFeedback, loadFeedback, loadFeedbackScreenshot, loadFeedbackStatus, loadMyFeedback, retryFeedback, type FeedbackProcessing } from '../lib/feedback';
import { formatDateTime } from '../lib/format';
import type { FeedbackDetail, FeedbackKind, FeedbackReport, FeedbackStatus } from '../types';
import i18n from '../i18n';

/** A report kind's name in the interface language. */
export const feedbackKindLabel = (kind: FeedbackKind) => i18n.t(`feedback:kind.${kind}`);
const LANGUAGES = ['uk', 'ru', 'en', 'other'] as const;
const languageLabel = (language: string) => (LANGUAGES as readonly string[]).includes(language) ? i18n.t(`feedback:lang.${language as typeof LANGUAGES[number]}`) : language;
type StatusFilter = 'ALL' | FeedbackStatus;

export function FeedbackStatusBadge({ report }: { report: Pick<FeedbackReport, 'status' | 'issueNumber'> & { attempts?: number } }) {
  const { t } = useTranslation(['feedback', 'common']);
  if (report.status === 'ISSUE_CREATED') return <Badge tone="success">{t('status.issue', { number: report.issueNumber })}</Badge>;
  if (report.status === 'FAILED') return <Badge tone="danger">{report.attempts ? t('status.failedAttempt', { count: report.attempts }) : t('status.failed')}</Badge>;
  if (report.status === 'PROCESSING') return <Badge tone="info">{t('status.processing')}</Badge>;
  return <Badge tone="info">{t('status.pending')}</Badge>;
}

function MyReports() {
  const { t } = useTranslation(['feedback', 'common']);
  const [reports, setReports] = useState<FeedbackReport[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    loadMyFeedback().then((items) => { if (active) setReports(items); }).catch(() => { if (active) setError(t('loadFailed')); });
    return () => { active = false; };
  }, [t]);
  return <Surface className="feedback-list" aria-label={t('mine')}>
    <div className="table-toolbar"><strong>{t('mine')}</strong></div>
    {error ? <div className="form-error" role="alert">{error}</div>
      : !reports ? <LoadingState label={t('loading')} />
        : reports.length ? <ul className="feedback-rows">{reports.map((report) => <li key={report.id}>
            <span><strong>{report.message}</strong><small>{feedbackKindLabel(report.kind)} · {formatDateTime(report.createdAt)}{report.hasScreenshot ? t('withShot') : ''}</small></span>
            {report.issueUrl ? <a href={report.issueUrl} target="_blank" rel="noreferrer"><FeedbackStatusBadge report={report} /></a> : <FeedbackStatusBadge report={report} />}
          </li>)}</ul>
          : <EmptyState title={t('emptyMine')} description={t('emptyMineText')} icon={MessageSquareWarning} />}
  </Surface>;
}

function formatEvent(event: Record<string, unknown> & { at: string; type: string }): string {
  const time = new Date(event.at).toLocaleTimeString('ru-RU');
  if (event.type === 'request') return `${time} ${String(event.method)} ${String(event.path)}  ${String(event.status)}  ${String(event.ms)} ${i18n.t('feedback:log.ms')}${event.requestId ? `  req ${String(event.requestId)}` : ''}`;
  if (event.type === 'error') return i18n.t('feedback:log.error', { time, message: String(event.message) });
  if (event.type === 'route') return i18n.t('feedback:log.route', { time, path: String(event.path) });
  return i18n.t('feedback:log.connection', { time, state: String(event.state) });
}

function ReportDetail({ id, onClose, onRetried }: { id: string; onClose: () => void; onRetried: () => void }) {
  const { t } = useTranslation(['feedback', 'common']);
  const [report, setReport] = useState<FeedbackDetail | null>(null);
  const [shot, setShot] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [retrying, setRetrying] = useState(false);
  useEffect(() => {
    let active = true; let url: string | null = null;
    loadFeedback(id).then(async (item) => {
      if (!active) return;
      setReport(item);
      if (item.hasScreenshot) { url = await loadFeedbackScreenshot(id).catch(() => null); if (active) setShot(url); }
    }).catch(() => { if (active) setError(t('detailFailed')); });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [id, t]);
  const retry = async () => {
    setRetrying(true);
    try { await retryFeedback(id); onRetried(); onClose(); } catch { setError(t('retryFailed')); } finally { setRetrying(false); }
  };
  const meta = report ? [report.reporterName, report.departmentName, report.page, report.appVersion && `Atlas ${report.appVersion}`, report.viewport].filter(Boolean).join(' · ') : '';
  return <Dialog open size="lg" title={report?.titleEn ?? t('report')} description={meta} onClose={onClose}
    footer={<>{report?.issueUrl && <a className="button button--secondary" href={report.issueUrl} target="_blank" rel="noreferrer"><ExternalLink size={16} aria-hidden="true" />{`GitHub #${report.issueNumber}`}</a>}{report && report.status === 'FAILED' && <Button variant="secondary" icon={RefreshCw} disabled={retrying} onClick={() => void retry()}>{t('retry')}</Button>}<Button onClick={onClose}>{t('common:actions.close')}</Button></>}>
    {error ? <div className="form-error" role="alert">{error}</div> : !report ? <LoadingState label={t('loadingOne')} /> : <div className="feedback-detail">
      <div className="feedback-detail__row"><FeedbackStatusBadge report={report} />{report.category && <Badge>{t(`category.${report.category}`)}{report.severity ? ` · ${t(`severity.${report.severity}`)}` : ''}</Badge>}{report.area && <Badge tone="info">{report.area}</Badge>}<small>{formatDateTime(report.createdAt)}</small></div>
      {report.lastError && report.status === 'FAILED' && <div className="form-error" role="alert">{t('lastError', { error: report.lastError })}</div>}
      <div className="feedback-detail__cols">
        <section><h3>{report.language ? t('originalLang', { language: languageLabel(report.language) }) : t('original')}</h3><p>{report.message}</p></section>
        <section><h3>{t('translation')}</h3>{report.translationEn ? <p>{report.translationEn}</p> : <p className="muted">{t('afterProcessing')}</p>}</section>
      </div>
      {report.summaryEn && <section><h3>{t('summary')}</h3><p>{report.summaryEn}</p>{report.stepsEn && report.stepsEn.length > 0 && <ol>{report.stepsEn.map((step, index) => <li key={index}>{step}</li>)}</ol>}</section>}
      <div className="feedback-detail__cols">
        <section><h3>{t('shot')}</h3>{shot ? <a href={shot} target="_blank" rel="noreferrer"><img className="feedback-detail__shot" src={shot} alt={t('shotAlt')} /></a> : <p className="muted">{report.hasScreenshot ? t('loadingShot') : t('notAttached')}</p>}</section>
        <section><h3>{t('techLog')}</h3>{report.diagnostics?.events?.length ? <pre className="feedback-detail__log">{report.diagnostics.events.map(formatEvent).join('\n')}</pre> : <p className="muted">{report.diagnostics ? t('noEvents') : t('notAttached')}</p>}</section>
      </div>
    </div>}
  </Dialog>;
}

function AllReports() {
  const { t } = useTranslation(['feedback', 'common']);
  const [filter, setFilter] = useState<StatusFilter>('ALL');
  const [reports, setReports] = useState<FeedbackDetail[] | null>(null);
  const [error, setError] = useState('');
  const [opened, setOpened] = useState<string | null>(null);
  const [processing, setProcessing] = useState<FeedbackProcessing | null>(null);
  useEffect(() => { loadFeedbackStatus().then(setProcessing).catch(() => setProcessing(null)); }, []);
  const missing = processing ? [!processing.openai && 'OPENAI_API_KEY', !processing.github && t('githubPair')].filter(Boolean) : [];
  const load = useCallback(() => {
    setReports(null); setError('');
    loadAllFeedback(filter === 'ALL' ? undefined : filter).then(setReports).catch(() => setError(t('loadFailed')));
  }, [filter, t]);
  useEffect(() => { load(); }, [load]);
  return <Surface className="feedback-list" aria-label={t('all')}>
    <div className="table-toolbar"><strong>{t('all')}</strong><Segmented label={t('statusFilter')} value={filter} onChange={setFilter} options={[{ value: 'ALL', label: t('filter.all') }, { value: 'PENDING', label: t('filter.pending') }, { value: 'FAILED', label: t('filter.failed') }, { value: 'ISSUE_CREATED', label: t('filter.github') }]} /></div>
    {missing.length > 0 && <div className="notice notice--info feedback-notice" role="note">{t('notice', { what: processing!.openai ? t('noIssues') : t('noProcessing'), missing: missing.join(t('and')) })}</div>}
    {error ? <div className="form-error" role="alert">{error}</div>
      : !reports ? <LoadingState label={t('loading')} />
        : reports.length ? <ul className="feedback-rows">{reports.map((report) => <li key={report.id}><button type="button" onClick={() => setOpened(report.id)}>
            <span><strong>{report.titleEn ?? report.message}</strong><small>{feedbackKindLabel(report.kind)} · {report.reporterName} · {report.page} · {formatDateTime(report.createdAt)}</small></span>
            <FeedbackStatusBadge report={report} />
          </button></li>)}</ul>
          : <EmptyState title={t('emptyAll')} description={t('emptyAllText')} icon={MessageSquareWarning} />}
    {opened && <ReportDetail id={opened} onClose={() => setOpened(null)} onRetried={load} />}
  </Surface>;
}

export function FeedbackPage() {
  const { t } = useTranslation(['feedback', 'common']);
  const { session } = useAuth();
  const isDirector = session?.user.role === 'DIRECTOR';
  const [view, setView] = useState<'mine' | 'all'>(isDirector ? 'all' : 'mine');
  return <>
    <PageHeader title={t('title')} description={t('description')} action={<FeedbackButton />}>
      {isDirector && <Segmented label={t('section')} value={view} onChange={setView} options={[{ value: 'all', label: t('all') }, { value: 'mine', label: t('mine') }]} />}
    </PageHeader>
    {view === 'all' && isDirector ? <AllReports /> : <MyReports />}
  </>;
}

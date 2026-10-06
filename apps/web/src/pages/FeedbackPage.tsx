import { ExternalLink, MessageSquareWarning, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Dialog, EmptyState, LoadingState, PageHeader, Segmented, Surface } from '../components/ui';
import { FeedbackButton } from '../components/FeedbackDialog';
import { useAuth } from '../context/AppContext';
import { loadAllFeedback, loadFeedback, loadFeedbackScreenshot, loadMyFeedback, retryFeedback } from '../lib/feedback';
import { formatDateTime } from '../lib/format';
import type { FeedbackDetail, FeedbackKind, FeedbackReport, FeedbackStatus } from '../types';

export const feedbackKindLabel: Record<FeedbackKind, string> = { PROBLEM: 'Проблема', COMPLAINT: 'Жалоба', IDEA: 'Идея' };
const categoryLabel = { BUG: 'Ошибка', COMPLAINT: 'Жалоба', IDEA: 'Идея', QUESTION: 'Вопрос' } as const;
const severityLabel = { LOW: 'низкая', MEDIUM: 'средняя', HIGH: 'высокая', CRITICAL: 'критическая' } as const;
const languageLabel: Record<string, string> = { uk: 'украинский', ru: 'русский', en: 'английский', other: 'другой' };
type StatusFilter = 'ALL' | FeedbackStatus;

export function FeedbackStatusBadge({ report }: { report: Pick<FeedbackReport, 'status' | 'issueNumber'> & { attempts?: number } }) {
  if (report.status === 'ISSUE_CREATED') return <Badge tone="success">{`Задача #${report.issueNumber}`}</Badge>;
  if (report.status === 'FAILED') return <Badge tone="danger">{report.attempts ? `Ошибка · попытка ${report.attempts}` : 'Ошибка обработки'}</Badge>;
  if (report.status === 'PROCESSING') return <Badge tone="info">Обрабатывается</Badge>;
  return <Badge tone="info">Ожидает обработки</Badge>;
}

function MyReports() {
  const [reports, setReports] = useState<FeedbackReport[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    loadMyFeedback().then((items) => { if (active) setReports(items); }).catch(() => { if (active) setError('Обращения не загружены'); });
    return () => { active = false; };
  }, []);
  return <Surface className="feedback-list" aria-label="Мои обращения">
    <div className="table-toolbar"><strong>Мои обращения</strong></div>
    {error ? <div className="form-error" role="alert">{error}</div>
      : !reports ? <LoadingState label="Загружаем обращения" />
        : reports.length ? <ul className="feedback-rows">{reports.map((report) => <li key={report.id}>
            <span><strong>{report.message}</strong><small>{feedbackKindLabel[report.kind]} · {formatDateTime(report.createdAt)}{report.hasScreenshot ? ' · снимок экрана приложен' : ''}</small></span>
            {report.issueUrl ? <a href={report.issueUrl} target="_blank" rel="noreferrer"><FeedbackStatusBadge report={report} /></a> : <FeedbackStatusBadge report={report} />}
          </li>)}</ul>
          : <EmptyState title="Обращений пока нет" description="Если что-то не работает, нажмите «Сообщить о проблеме» на любой странице" icon={MessageSquareWarning} />}
  </Surface>;
}

function formatEvent(event: Record<string, unknown> & { at: string; type: string }): string {
  const time = new Date(event.at).toLocaleTimeString('ru-RU');
  if (event.type === 'request') return `${time} ${String(event.method)} ${String(event.path)}  ${String(event.status)}  ${String(event.ms)} мс${event.requestId ? `  req ${String(event.requestId)}` : ''}`;
  if (event.type === 'error') return `${time} ошибка: ${String(event.message)}`;
  if (event.type === 'route') return `${time} страница ${String(event.path)}`;
  return `${time} соединение: ${String(event.state)}`;
}

function ReportDetail({ id, onClose, onRetried }: { id: string; onClose: () => void; onRetried: () => void }) {
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
    }).catch(() => { if (active) setError('Обращение не загружено'); });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [id]);
  const retry = async () => {
    setRetrying(true);
    try { await retryFeedback(id); onRetried(); onClose(); } catch { setError('Не удалось отправить на повторную обработку'); } finally { setRetrying(false); }
  };
  const meta = report ? [report.reporterName, report.departmentName, report.page, report.appVersion && `Atlas ${report.appVersion}`, report.viewport].filter(Boolean).join(' · ') : '';
  return <Dialog open size="lg" title={report?.titleEn ?? 'Обращение'} description={meta} onClose={onClose}
    footer={<>{report?.issueUrl && <a className="button button--secondary" href={report.issueUrl} target="_blank" rel="noreferrer"><ExternalLink size={16} aria-hidden="true" />{`GitHub #${report.issueNumber}`}</a>}{report && report.status === 'FAILED' && <Button variant="secondary" icon={RefreshCw} disabled={retrying} onClick={() => void retry()}>Обработать заново</Button>}<Button onClick={onClose}>Закрыть</Button></>}>
    {error ? <div className="form-error" role="alert">{error}</div> : !report ? <LoadingState label="Загружаем обращение" /> : <div className="feedback-detail">
      <div className="feedback-detail__row"><FeedbackStatusBadge report={report} />{report.category && <Badge>{categoryLabel[report.category]}{report.severity ? ` · ${severityLabel[report.severity]}` : ''}</Badge>}{report.area && <Badge tone="info">{report.area}</Badge>}<small>{formatDateTime(report.createdAt)}</small></div>
      {report.lastError && report.status === 'FAILED' && <div className="form-error" role="alert">{`Последняя ошибка: ${report.lastError}`}</div>}
      <div className="feedback-detail__cols">
        <section><h3>{`Оригинал${report.language ? ` (${languageLabel[report.language] ?? report.language})` : ''}`}</h3><p>{report.message}</p></section>
        <section><h3>Перевод (обезличенный)</h3>{report.translationEn ? <p>{report.translationEn}</p> : <p className="muted">Появится после обработки</p>}</section>
      </div>
      {report.summaryEn && <section><h3>Кратко</h3><p>{report.summaryEn}</p>{report.stepsEn && report.stepsEn.length > 0 && <ol>{report.stepsEn.map((step, index) => <li key={index}>{step}</li>)}</ol>}</section>}
      <div className="feedback-detail__cols">
        <section><h3>Снимок экрана</h3>{shot ? <a href={shot} target="_blank" rel="noreferrer"><img className="feedback-detail__shot" src={shot} alt="Снимок экрана из обращения" /></a> : <p className="muted">{report.hasScreenshot ? 'Загружаем…' : 'Не приложен'}</p>}</section>
        <section><h3>Технический журнал</h3>{report.diagnostics?.events?.length ? <pre className="feedback-detail__log">{report.diagnostics.events.map(formatEvent).join('\n')}</pre> : <p className="muted">{report.diagnostics ? 'Событий нет' : 'Не приложен'}</p>}</section>
      </div>
    </div>}
  </Dialog>;
}

function AllReports() {
  const [filter, setFilter] = useState<StatusFilter>('ALL');
  const [reports, setReports] = useState<FeedbackDetail[] | null>(null);
  const [error, setError] = useState('');
  const [opened, setOpened] = useState<string | null>(null);
  const load = useCallback(() => {
    setReports(null); setError('');
    loadAllFeedback(filter === 'ALL' ? undefined : filter).then(setReports).catch(() => setError('Обращения не загружены'));
  }, [filter]);
  useEffect(() => { load(); }, [load]);
  return <Surface className="feedback-list" aria-label="Все обращения">
    <div className="table-toolbar"><strong>Все обращения</strong><Segmented label="Статус обращений" value={filter} onChange={setFilter} options={[{ value: 'ALL', label: 'Все' }, { value: 'PENDING', label: 'Ожидают' }, { value: 'FAILED', label: 'Ошибки обработки' }, { value: 'ISSUE_CREATED', label: 'В GitHub' }]} /></div>
    {error ? <div className="form-error" role="alert">{error}</div>
      : !reports ? <LoadingState label="Загружаем обращения" />
        : reports.length ? <ul className="feedback-rows">{reports.map((report) => <li key={report.id}><button type="button" onClick={() => setOpened(report.id)}>
            <span><strong>{report.titleEn ?? report.message}</strong><small>{feedbackKindLabel[report.kind]} · {report.reporterName} · {report.page} · {formatDateTime(report.createdAt)}</small></span>
            <FeedbackStatusBadge report={report} />
          </button></li>)}</ul>
          : <EmptyState title="Обращений нет" description="Здесь появятся обращения сотрудников" icon={MessageSquareWarning} />}
    {opened && <ReportDetail id={opened} onClose={() => setOpened(null)} onRetried={load} />}
  </Surface>;
}

export function FeedbackPage() {
  const { session } = useAuth();
  const isDirector = session?.user.role === 'DIRECTOR';
  const [view, setView] = useState<'mine' | 'all'>(isDirector ? 'all' : 'mine');
  return <>
    <PageHeader title="Обращения" description="Проблемы, жалобы и идеи — их получает команда разработки" action={<FeedbackButton />}>
      {isDirector && <Segmented label="Раздел обращений" value={view} onChange={setView} options={[{ value: 'all', label: 'Все обращения' }, { value: 'mine', label: 'Мои обращения' }]} />}
    </PageHeader>
    {view === 'all' && isDirector ? <AllReports /> : <MyReports />}
  </>;
}

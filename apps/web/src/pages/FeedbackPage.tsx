import { MessageSquareWarning } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Badge, EmptyState, LoadingState, PageHeader, Surface } from '../components/ui';
import { FeedbackButton } from '../components/FeedbackDialog';
import { loadMyFeedback } from '../lib/feedback';
import { formatDateTime } from '../lib/format';
import type { FeedbackKind, FeedbackReport, FeedbackStatus } from '../types';

export const feedbackKindLabel: Record<FeedbackKind, string> = { PROBLEM: 'Проблема', COMPLAINT: 'Жалоба', IDEA: 'Идея' };

export function FeedbackStatusBadge({ report }: { report: Pick<FeedbackReport, 'status' | 'issueNumber'> }) {
  const status: FeedbackStatus = report.status;
  if (status === 'ISSUE_CREATED') return <Badge tone="success">{`Задача #${report.issueNumber}`}</Badge>;
  if (status === 'FAILED') return <Badge tone="warning">Повторная обработка</Badge>;
  return <Badge tone="info">Ожидает обработки</Badge>;
}

export function FeedbackPage() {
  const [reports, setReports] = useState<FeedbackReport[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    loadMyFeedback().then((items) => { if (active) setReports(items); }).catch(() => { if (active) setError('Обращения не загружены'); });
    return () => { active = false; };
  }, []);
  return <>
    <PageHeader title="Обращения" description="Проблемы, жалобы и идеи — их получает команда разработки" action={<FeedbackButton />} />
    <Surface className="feedback-list" aria-label="Мои обращения">
      <div className="table-toolbar"><strong>Мои обращения</strong></div>
      {error ? <div className="form-error" role="alert">{error}</div>
        : !reports ? <LoadingState label="Загружаем обращения" />
          : reports.length ? <ul className="feedback-rows">{reports.map((report) => <li key={report.id}>
              <span><strong>{report.message}</strong><small>{feedbackKindLabel[report.kind]} · {formatDateTime(report.createdAt)}{report.hasScreenshot ? ' · снимок экрана приложен' : ''}</small></span>
              {report.issueUrl ? <a href={report.issueUrl} target="_blank" rel="noreferrer"><FeedbackStatusBadge report={report} /></a> : <FeedbackStatusBadge report={report} />}
            </li>)}</ul>
            : <EmptyState title="Обращений пока нет" description="Если что-то не работает, нажмите «Сообщить о проблеме» на любой странице" icon={MessageSquareWarning} />}
    </Surface>
  </>;
}

import i18n from '../i18n';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Download, FileSearch, Search, ShieldAlert, XCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge, Button, EmptyState, PageHeader, Surface } from '../components/ui';
import { useWorkspace } from '../context/AppContext';
import { formatDateTime } from '../lib/format';

const ACTIONS = { CRM_EXPORT: 'CRM_EXPORT', CLIENT_VIEW: 'CLIENT_VIEW', DOCUMENT_DOWNLOAD: 'DOCUMENT_DOWNLOAD', CLIENT_EXPORT_SUCCEEDED: 'CRM_EXPORT', CLIENT_EXPORT_DENIED: 'CRM_EXPORT' } as const;
const actionLabel = (action: string) => action in ACTIONS ? i18n.t(`audit:action.${ACTIONS[action as keyof typeof ACTIONS]}`) : action;
export function AuditPage() {
  const { t } = useTranslation(['audit', 'common']);
  const { audit } = useWorkspace(); const [query, setQuery] = useState(''); const [result, setResult] = useState('ALL');
  const visible = useMemo(() => audit.filter((event) => `${event.actorName} ${event.action} ${event.entityType} ${event.ip}`.toLowerCase().includes(query.toLowerCase()) && (result === 'ALL' || event.result === result)), [audit, query, result]);
  return <><PageHeader title={t('title')} description={t('description')} action={<Button variant="secondary" icon={Download}>{t('export')}</Button>} /><Surface className="table-surface"><div className="table-toolbar"><label className="table-search"><Search size={16} /><input aria-label={t('search')} placeholder={t('searchPlaceholder')} value={query} onChange={(event) => setQuery(event.target.value)} /></label><select aria-label={t('result')} value={result} onChange={(event) => setResult(event.target.value)}><option value="ALL">{t('allResults')}</option><option value="SUCCESS">{t('success')}</option><option value="DENIED">{t('denied')}</option></select><span className="table-count">{t('count', { count: visible.length })}</span></div>{visible.length ? <div className="data-table-wrap"><table className="data-table audit-table"><thead><tr><th>{t('col.time')}</th><th>{t('col.employee')}</th><th>{t('col.action')}</th><th>{t('col.object')}</th><th>{t('col.ip')}</th><th>{t('result')}</th></tr></thead><tbody>{visible.map((event) => <tr key={event.id}><td>{formatDateTime(event.createdAt)}</td><td><strong>{event.actorName}</strong></td><td><span className="audit-action"><FileSearch size={15} />{actionLabel(event.action)}</span></td><td>{event.entityType}{event.entityId ? ` · ${event.entityId.slice(0, 8)}` : ''}</td><td><code>{event.ip || '—'}</code></td><td><Badge tone={event.result === 'SUCCESS' ? 'success' : 'danger'}>{event.result === 'SUCCESS' ? <><CheckCircle2 size={12} />{t('success')}</> : <><XCircle size={12} />{t('denied')}</>}</Badge></td></tr>)}</tbody></table></div> : <EmptyState title={t('empty')} description={t('emptyText')} icon={ShieldAlert} />}</Surface></>;
}

import { useTranslation } from 'react-i18next';
import { ArrowLeft, Bot, History, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useWorkspace } from '../context/AppContext';
import { formatDateTime } from '../lib/format';
import type { AiAnalysis, AiMode } from '../types';
import { Badge, Button, Dialog, EmptyState, LoadingState, Segmented } from './ui';

const MODES: AiMode[] = ['ADVICE', 'EVALUATION', 'FORECAST'];

function SourceBadge({ analysis }: { analysis: AiAnalysis }) {
  const { t } = useTranslation(['ai', 'common']);
  return analysis.source === 'AI'
    ? <Badge tone="info">{`AI · ${analysis.model ?? t('model')}`}</Badge>
    : <Badge>{t('rules')}</Badge>;
}

function AnalysisResult({ analysis }: { analysis: AiAnalysis }) {
  const { t } = useTranslation(['ai', 'common']);
  return <section className="ai-result" aria-label={t('result')}>
    <header><Bot size={17} /><strong>{t(`mode.${analysis.mode}`)}</strong><SourceBadge analysis={analysis} /><time>{formatDateTime(analysis.createdAt)}</time></header>
    <p>{analysis.summary}</p>
    {analysis.recommendations.length > 0 && <ol>{analysis.recommendations.map((item, index) => <li key={index}>{item}</li>)}</ol>}
    {analysis.fallbackReason && <small>{t('fallback')}</small>}
    {analysis.requestedByName && <small>{t('requestedBy', { name: analysis.requestedByName })}</small>}
  </section>;
}

/** Advice, evaluation or forecast from work metrics only — never message contents. Every result is kept in the history. */
export function AiAnalysisDialog({ targetUserId, targetName, onClose }: { targetUserId: string; targetName: string; onClose: () => void }) {
  const { t } = useTranslation(['ai', 'common']);
  const { analyze, loadAnalyses } = useWorkspace();
  const [view, setView] = useState<'new' | 'history'>('new');
  const [mode, setMode] = useState<AiMode>('ADVICE');
  const [result, setResult] = useState<AiAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<AiAnalysis[] | null>(null);
  const [historyError, setHistoryError] = useState('');
  const [opened, setOpened] = useState<AiAnalysis | null>(null);

  useEffect(() => {
    let active = true;
    loadAnalyses(targetUserId).then((items) => { if (active) setHistory(items); }).catch(() => { if (active) setHistoryError(t('historyFailed')); });
    return () => { active = false; };
  }, [targetUserId, loadAnalyses, t]);

  const run = async () => {
    setLoading(true); setError(''); setResult(null);
    try {
      const analysis = await analyze(targetUserId, mode);
      setResult(analysis);
      setHistory((current) => current ? [analysis, ...current] : current);
    } catch { setError(t('failed')); }
    finally { setLoading(false); }
  };

  const footer = view === 'new'
    ? <><Button variant="secondary" onClick={onClose}>{t('common:actions.close')}</Button><Button icon={Sparkles} disabled={loading} onClick={() => void run()}>{loading ? t('analysing') : t('run')}</Button></>
    : <Button variant="secondary" onClick={onClose}>{t('common:actions.close')}</Button>;

  return <Dialog open size="lg" title={t('title')} description={t('subtitle', { name: targetName })} onClose={onClose} footer={footer}>
    <Segmented label={t('section')} value={view} onChange={(value) => { setView(value); setOpened(null); }} options={[{ value: 'new', label: t('new') }, { value: 'history', label: `${t('history')}${history ? ` · ${history.length}` : ''}` }]} />
    {view === 'new' ? <>
      <div className="ai-modes"><Segmented label={t('mode.label')} value={mode} onChange={(value) => { setMode(value); setResult(null); }} options={MODES.map((value) => ({ value, label: t(`mode.${value}`) }))} /></div>
      {loading && <LoadingState label={t('collecting')} />}
      {error && <div className="form-error" role="alert">{error}</div>}
      {result && <AnalysisResult analysis={result} />}
      {!result && !loading && !error && <p className="dialog-note ai-hint">{t('hint')}</p>}
    </> : opened ? <>
      <Button variant="ghost" icon={ArrowLeft} onClick={() => setOpened(null)}>{t('back')}</Button>
      <AnalysisResult analysis={opened} />
    </> : historyError ? <div className="form-error" role="alert">{historyError}</div>
      : !history ? <LoadingState label={t('loadingHistory')} />
        : history.length ? <ul className="ai-history" aria-label={t('list')}>{history.map((item) => <li key={item.id}><button type="button" onClick={() => setOpened(item)}>
            <time>{formatDateTime(item.createdAt)}</time>
            <span><strong>{t(`mode.${item.mode}`)}</strong>{item.requestedByName && <small>{t('requestedByShort', { name: item.requestedByName })}</small>}</span>
            <SourceBadge analysis={item} />
          </button></li>)}</ul>
          : <EmptyState title={t('empty')} description={t('emptyText')} icon={History} />}
  </Dialog>;
}

import { ArrowLeft, Bot, History, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useWorkspace } from '../context/AppContext';
import { formatDateTime } from '../lib/format';
import type { AiAnalysis, AiMode } from '../types';
import { Badge, Button, Dialog, EmptyState, LoadingState, Segmented } from './ui';

const modes: Array<{ value: AiMode; label: string }> = [
  { value: 'ADVICE', label: 'Совет' }, { value: 'EVALUATION', label: 'Оценка' }, { value: 'FORECAST', label: 'Прогноз' },
];
const modeLabel = Object.fromEntries(modes.map((item) => [item.value, item.label])) as Record<AiMode, string>;

function SourceBadge({ analysis }: { analysis: AiAnalysis }) {
  return analysis.source === 'AI'
    ? <Badge tone="info">{`AI · ${analysis.model ?? 'модель'}`}</Badge>
    : <Badge>Правила</Badge>;
}

function AnalysisResult({ analysis }: { analysis: AiAnalysis }) {
  return <section className="ai-result" aria-label="Результат анализа">
    <header><Bot size={17} /><strong>{modeLabel[analysis.mode]}</strong><SourceBadge analysis={analysis} /><time>{formatDateTime(analysis.createdAt)}</time></header>
    <p>{analysis.summary}</p>
    {analysis.recommendations.length > 0 && <ol>{analysis.recommendations.map((item, index) => <li key={index}>{item}</li>)}</ol>}
    {analysis.fallbackReason && <small>Модель недоступна, использованы встроенные правила.</small>}
    {analysis.requestedByName && <small>Запросил(а): {analysis.requestedByName}</small>}
  </section>;
}

/** Advice, evaluation or forecast from work metrics only — never message contents. Every result is kept in the history. */
export function AiAnalysisDialog({ targetUserId, targetName, onClose }: { targetUserId: string; targetName: string; onClose: () => void }) {
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
    loadAnalyses(targetUserId).then((items) => { if (active) setHistory(items); }).catch(() => { if (active) setHistoryError('История не загружена'); });
    return () => { active = false; };
  }, [targetUserId, loadAnalyses]);

  const run = async () => {
    setLoading(true); setError(''); setResult(null);
    try {
      const analysis = await analyze(targetUserId, mode);
      setResult(analysis);
      setHistory((current) => current ? [analysis, ...current] : current);
    } catch { setError('Анализ не выполнен. Попробуйте позже.'); }
    finally { setLoading(false); }
  };

  const footer = view === 'new'
    ? <><Button variant="secondary" onClick={onClose}>Закрыть</Button><Button icon={Sparkles} disabled={loading} onClick={() => void run()}>{loading ? 'Анализируем…' : 'Сформировать'}</Button></>
    : <Button variant="secondary" onClick={onClose}>Закрыть</Button>;

  return <Dialog open size="lg" title="AI-анализ" description={`${targetName} · по KPI, задачам, воронке и присутствию`} onClose={onClose} footer={footer}>
    <Segmented label="Раздел AI-анализа" value={view} onChange={(value) => { setView(value); setOpened(null); }} options={[{ value: 'new', label: 'Новый анализ' }, { value: 'history', label: `История${history ? ` · ${history.length}` : ''}` }]} />
    {view === 'new' ? <>
      <div className="ai-modes"><Segmented label="Режим анализа" value={mode} onChange={(value) => { setMode(value); setResult(null); }} options={modes} /></div>
      {loading && <LoadingState label="Собираем метрики" />}
      {error && <div className="form-error" role="alert">{error}</div>}
      {result && <AnalysisResult analysis={result} />}
      {!result && !loading && !error && <p className="dialog-note ai-hint">Анализ использует только системные метрики. Содержание переписки не читается. Результат сохраняется в истории.</p>}
    </> : opened ? <>
      <Button variant="ghost" icon={ArrowLeft} onClick={() => setOpened(null)}>К истории</Button>
      <AnalysisResult analysis={opened} />
    </> : historyError ? <div className="form-error" role="alert">{historyError}</div>
      : !history ? <LoadingState label="Загружаем историю" />
        : history.length ? <ul className="ai-history" aria-label="История анализов">{history.map((item) => <li key={item.id}><button type="button" onClick={() => setOpened(item)}>
            <time>{formatDateTime(item.createdAt)}</time>
            <span><strong>{modeLabel[item.mode]}</strong>{item.requestedByName && <small>запросил(а) {item.requestedByName}</small>}</span>
            <SourceBadge analysis={item} />
          </button></li>)}</ul>
          : <EmptyState title="Анализов пока нет" description="Сформируйте первый анализ — он сохранится здесь" icon={History} />}
  </Dialog>;
}

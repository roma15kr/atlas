import { Bot, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { useWorkspace } from '../context/AppContext';
import type { AiAnalysis, AiMode } from '../types';
import { Badge, Button, Dialog, LoadingState, Segmented } from './ui';

const modes: Array<{ value: AiMode; label: string }> = [
  { value: 'ADVICE', label: 'Совет' }, { value: 'EVALUATION', label: 'Оценка' }, { value: 'FORECAST', label: 'Прогноз' },
];

/** Advice, evaluation or forecast from work metrics only — never message contents. */
export function AiAnalysisDialog({ targetUserId, targetName, onClose }: { targetUserId: string; targetName: string; onClose: () => void }) {
  const { analyze } = useWorkspace();
  const [mode, setMode] = useState<AiMode>('ADVICE');
  const [result, setResult] = useState<AiAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const run = async () => {
    setLoading(true); setError(''); setResult(null);
    try { setResult(await analyze(targetUserId, mode)); }
    catch { setError('Анализ не выполнен. Попробуйте позже.'); }
    finally { setLoading(false); }
  };
  return <Dialog open size="lg" title="AI-анализ" description={`${targetName} · по KPI, задачам, воронке и присутствию`} onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Закрыть</Button><Button icon={Sparkles} disabled={loading} onClick={() => void run()}>{loading ? 'Анализируем…' : 'Сформировать'}</Button></>}>
    <Segmented label="Режим анализа" value={mode} onChange={(value) => { setMode(value); setResult(null); }} options={modes} />
    {loading && <LoadingState label="Собираем метрики" />}
    {error && <div className="form-error" role="alert">{error}</div>}
    {result && <section className="ai-result" aria-label="Результат анализа">
      <header><Bot size={17} /><Badge tone={result.source === 'CLAUDE' ? 'info' : 'neutral'}>{result.source === 'CLAUDE' ? 'Claude' : 'Правила'}</Badge></header>
      <p>{result.summary}</p>
      {result.recommendations.length > 0 && <ol>{result.recommendations.map((item, index) => <li key={index}>{item}</li>)}</ol>}
      {result.fallbackReason && <small>Claude недоступен, использованы встроенные правила.</small>}
    </section>}
    {!result && !loading && !error && <p className="dialog-note ai-hint">Анализ использует только системные метрики. Содержание переписки не читается.</p>}
  </Dialog>;
}

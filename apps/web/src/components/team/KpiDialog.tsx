import { useTranslation } from 'react-i18next';
import { useState, type FormEvent } from 'react';
import { autoUnit } from '../../context/AppContext';
import { ApiError } from '../../lib/api';
import i18n from '../../i18n';
import type { Kpi, KpiInput, KpiSource } from '../../types';
import { Button, Dialog, Field, SelectField } from '../ui';

const KPI_SOURCES: KpiSource[] = ['MANUAL', 'DEALS_WON_VALUE', 'DEALS_WON_COUNT', 'TASKS_DONE', 'TASKS_ON_TIME_RATE'];

/** A KPI source's name in the interface language. */
export const kpiSourceLabel = (source: KpiSource) => i18n.t(`team:kpi.source.${source}`);

const KPI_ERRORS = ['KPI_MANAGER_ONLY', 'KPI_ACTUAL_COMPUTED', 'INVALID_KPI_PERIOD', 'USER_NOT_ACTIVE'] as const;
const kpiError = (code?: string) => code && (KPI_ERRORS as readonly string[]).includes(code) ? i18n.t(`team:kpi.errors.${code as typeof KPI_ERRORS[number]}`) : null;

const monthBounds = () => {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return { start: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`, end: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(last)}` };
};

/** Creates or edits one KPI. The source can't change after creation; automatic KPIs have no manual actual. */
export function KpiDialog({ kpi, save, onClose }: { kpi?: Kpi; save: (input: KpiInput) => Promise<void>; onClose: () => void }) {
  const { t } = useTranslation(['team', 'common']);
  const [source, setSource] = useState<KpiSource>(kpi?.source ?? 'MANUAL');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const automatic = source !== 'MANUAL';
  const month = monthBounds();

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? '').trim();
    const target = Number(text('target').replace(',', '.'));
    const weight = Number(text('weight').replace(',', '.')) / 100;
    if (!(target > 0)) { setError(t('kpi.targetPositive')); return; }
    if (!(weight >= 0 && weight <= 1)) { setError(t('kpi.weightRange')); return; }
    const input: KpiInput = { name: text('name'), target, weight, source, dueAt: text('dueAt') ? new Date(`${text('dueAt')}T18:00:00`).toISOString() : null };
    if (automatic) { input.periodStart = text('periodStart'); input.periodEnd = text('periodEnd'); }
    else { input.unit = text('unit'); input.actual = Number(text('actual').replace(',', '.') || 0); }
    setSaving(true); setError('');
    try { await save(input); onClose(); }
    catch (reason) { setError((reason instanceof ApiError && kpiError(reason.code)) || t('kpi.failed')); }
    finally { setSaving(false); }
  };

  return <Dialog open title={kpi ? t('kpi.editTitle') : t('kpi.newTitle')} description={automatic ? t('kpi.automatic') : t('kpi.manual')} size="lg" onClose={() => { if (!saving) onClose(); }} footer={<><Button variant="secondary" disabled={saving} onClick={onClose}>{t('common:actions.cancel')}</Button><Button type="submit" form="kpi-form" disabled={saving}>{saving ? t('common:actions.saving') : kpi ? t('common:actions.save') : t('page.addKpi')}</Button></>}>
    <form id="kpi-form" className="form-grid" onSubmit={(event) => void submit(event)}>
      <SelectField label={t('kpi.sourceField')} aria-label={t('kpi.sourceField')} value={source} disabled={Boolean(kpi)} onChange={(event) => setSource(event.target.value as KpiSource)}>{KPI_SOURCES.map((value) => <option key={value} value={value}>{kpiSourceLabel(value)}</option>)}</SelectField>
      <Field label={t('kpi.name')}><input name="name" required maxLength={120} defaultValue={kpi?.name} placeholder={t('kpi.namePlaceholder')} /></Field>
      <Field label={t('kpi.target')}><input name="target" required inputMode="decimal" defaultValue={kpi?.target} /></Field>
      <Field label={t('kpi.unit')}><input name="unit" required={!automatic} maxLength={20} disabled={automatic} value={automatic ? autoUnit(source) : undefined} defaultValue={automatic ? undefined : kpi?.unit} /></Field>
      <Field label={t('kpi.weight')} hint={t('kpi.weightHint')}><input name="weight" required inputMode="decimal" defaultValue={Math.round((kpi?.weight ?? 1) * 100)} /></Field>
      {automatic
        ? <><Field label={t('kpi.start')}><input name="periodStart" type="date" required defaultValue={kpi?.periodStart ?? month.start} /></Field><Field label={t('kpi.end')}><input name="periodEnd" type="date" required defaultValue={kpi?.periodEnd ?? month.end} /></Field></>
        : <Field label={t('kpi.actual')}><input name="actual" inputMode="decimal" defaultValue={kpi?.actual ?? 0} /></Field>}
      <Field label={t('kpi.due')}><input name="dueAt" type="date" defaultValue={kpi?.dueAt?.slice(0, 10)} /></Field>
      {error && <div className="form-error field--wide" role="alert">{error}</div>}
    </form>
  </Dialog>;
}

import { useState, type FormEvent } from 'react';
import { autoUnit } from '../../context/AppContext';
import { ApiError } from '../../lib/api';
import type { Kpi, KpiInput, KpiSource } from '../../types';
import { Button, Dialog, Field, SelectField } from '../ui';

export const kpiSourceLabel: Record<KpiSource, string> = {
  MANUAL: 'Вручную',
  DEALS_WON_VALUE: 'Сумма выигранных сделок',
  DEALS_WON_COUNT: 'Количество выигранных сделок',
  TASKS_DONE: 'Выполненные задачи',
  TASKS_ON_TIME_RATE: 'Задачи в срок, %',
};

const kpiErrors: Record<string, string> = {
  KPI_MANAGER_ONLY: 'KPI настраивает директор или руководитель отдела сотрудника',
  KPI_ACTUAL_COMPUTED: 'Факт автоматического KPI считает Atlas',
  INVALID_KPI_PERIOD: 'Период должен заканчиваться не раньше начала',
  USER_NOT_ACTIVE: 'Сотрудник отключён',
};

const monthBounds = () => {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return { start: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`, end: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(last)}` };
};

/** Creates or edits one KPI. The source can't change after creation; automatic KPIs have no manual actual. */
export function KpiDialog({ kpi, save, onClose }: { kpi?: Kpi; save: (input: KpiInput) => Promise<void>; onClose: () => void }) {
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
    if (!(target > 0)) { setError('Цель должна быть больше нуля'); return; }
    if (!(weight >= 0 && weight <= 1)) { setError('Вес — от 0 до 100%'); return; }
    const input: KpiInput = { name: text('name'), target, weight, source, dueAt: text('dueAt') ? new Date(`${text('dueAt')}T18:00:00`).toISOString() : null };
    if (automatic) { input.periodStart = text('periodStart'); input.periodEnd = text('periodEnd'); }
    else { input.unit = text('unit'); input.actual = Number(text('actual').replace(',', '.') || 0); }
    setSaving(true); setError('');
    try { await save(input); onClose(); }
    catch (reason) { setError(reason instanceof ApiError && reason.code && kpiErrors[reason.code] ? kpiErrors[reason.code] : 'KPI не сохранён'); }
    finally { setSaving(false); }
  };

  return <Dialog open title={kpi ? 'Изменить KPI' : 'Новый KPI'} description={automatic ? 'Факт считается автоматически по данным Atlas' : 'Факт вносит руководитель'} size="lg" onClose={() => { if (!saving) onClose(); }} footer={<><Button variant="secondary" disabled={saving} onClick={onClose}>Отмена</Button><Button type="submit" form="kpi-form" disabled={saving}>{saving ? 'Сохраняем…' : kpi ? 'Сохранить' : 'Добавить KPI'}</Button></>}>
    <form id="kpi-form" className="form-grid" onSubmit={(event) => void submit(event)}>
      <SelectField label="Источник" aria-label="Источник" value={source} disabled={Boolean(kpi)} onChange={(event) => setSource(event.target.value as KpiSource)}>{(Object.keys(kpiSourceLabel) as KpiSource[]).map((value) => <option key={value} value={value}>{kpiSourceLabel[value]}</option>)}</SelectField>
      <Field label="Название"><input name="name" required maxLength={120} defaultValue={kpi?.name} placeholder="Например: Выручка за месяц" /></Field>
      <Field label="Цель"><input name="target" required inputMode="decimal" defaultValue={kpi?.target} /></Field>
      <Field label="Единица"><input name="unit" required={!automatic} maxLength={20} disabled={automatic} value={automatic ? autoUnit(source) : undefined} defaultValue={automatic ? undefined : kpi?.unit} /></Field>
      <Field label="Вес, %" hint="Доля KPI в рейтинге"><input name="weight" required inputMode="decimal" defaultValue={Math.round((kpi?.weight ?? 1) * 100)} /></Field>
      {automatic
        ? <><Field label="Начало периода"><input name="periodStart" type="date" required defaultValue={kpi?.periodStart ?? month.start} /></Field><Field label="Конец периода"><input name="periodEnd" type="date" required defaultValue={kpi?.periodEnd ?? month.end} /></Field></>
        : <Field label="Факт"><input name="actual" inputMode="decimal" defaultValue={kpi?.actual ?? 0} /></Field>}
      <Field label="Срок (необязательно)"><input name="dueAt" type="date" defaultValue={kpi?.dueAt?.slice(0, 10)} /></Field>
      {error && <div className="form-error field--wide" role="alert">{error}</div>}
    </form>
  </Dialog>;
}
